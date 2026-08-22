/**
 * Resolve play queries to streamable non-YouTube sources.
 * Primary: SoundCloud. Spotify URLs → metadata → SoundCloud search.
 * YouTube URLs are rejected.
 */

const play = require("play-dl");
const { withTimeout } = require("../withTimeout.js");

let spotifyTokenReady = false;
let spotifyAttempted = false;

async function ensureSpotifyToken() {
    if (spotifyTokenReady || spotifyAttempted) return;
    spotifyAttempted = true;

    const client_id = String(
        process.env.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENTID || ""
    ).trim();
    const client_secret = String(
        process.env.SPOTIFY_CLIENT_SECRET ||
            process.env.SPOTIFY_CLIENTSECRET ||
            ""
    ).trim();

    // play-dl crashes with "Cannot read properties of undefined (reading 'client_id')"
    // if setToken is called with incomplete spotify config — only set when both exist.
    if (!client_id || !client_secret) {
        console.log(
            "[Music] Spotify credentials not set — Spotify links will not resolve (SoundCloud still works)"
        );
        return;
    }

    try {
        const spotify = {
            client_id,
            client_secret,
            market: process.env.SPOTIFY_MARKET || "US"
        };
        const refresh = String(process.env.SPOTIFY_REFRESH_TOKEN || "").trim();
        if (refresh) spotify.refresh_token = refresh;

        await play.setToken({ spotify });
        spotifyTokenReady = true;
        console.log("[Music] Spotify credentials configured for play-dl");
    } catch (e) {
        console.warn("[Music] Spotify token setup failed:", e?.message || e);
        spotifyTokenReady = false;
    }
}

function isYoutubeUrl(input) {
    try {
        const u = new URL(String(input));
        const h = u.hostname.replace(/^www\./, "").toLowerCase();
        return (
            h === "youtube.com" ||
            h === "m.youtube.com" ||
            h === "music.youtube.com" ||
            h === "youtu.be" ||
            h.endsWith(".youtube.com")
        );
    } catch {
        return /youtu\.be|youtube\.com/i.test(String(input));
    }
}

function isSoundCloudUrl(input) {
    try {
        const u = new URL(String(input));
        const h = u.hostname.replace(/^www\./, "").toLowerCase();
        return h === "soundcloud.com" || h.endsWith(".soundcloud.com");
    } catch {
        return /soundcloud\.com/i.test(String(input));
    }
}

function isSpotifyUrl(input) {
    try {
        const u = new URL(String(input));
        const h = u.hostname.replace(/^www\./, "").toLowerCase();
        return h === "open.spotify.com" || h === "spotify.com";
    } catch {
        return /open\.spotify\.com|spotify:/i.test(String(input));
    }
}

async function searchSoundCloud(query) {
    try {
        const results = await withTimeout(
            play.search(String(query).slice(0, 200), {
                source: { soundcloud: "tracks" },
                limit: 5
            }),
            20_000,
            "SoundCloud search"
        );
        if (!results?.length) return null;
        const track = results[0];
        return {
            title: track.name || track.title || String(query),
            url: track.url,
            source: "soundcloud",
            duration: track.durationInSec || null
        };
    } catch (e) {
        const msg = String(e?.message || e);
        if (/client_id/i.test(msg)) {
            const err = new Error(
                "Music search hit a Spotify client_id error. Clear incomplete SPOTIFY_* env vars or set both SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
            );
            err.code = "MUSIC_SPOTIFY_CONFIG";
            throw err;
        }
        throw e;
    }
}

async function resolveTrack(query) {
    const q = String(query || "").trim();
    if (!q) {
        const err = new Error("Empty search query");
        err.code = "MUSIC_EMPTY_QUERY";
        throw err;
    }

    if (isYoutubeUrl(q)) {
        const err = new Error(
            "YouTube is disabled. Use a song name, a SoundCloud link, or a Spotify link."
        );
        err.code = "MUSIC_YOUTUBE_DISABLED";
        throw err;
    }

    if (isSpotifyUrl(q) || /^spotify:/i.test(q)) {
        await ensureSpotifyToken();
        if (!spotifyTokenReady) {
            const err = new Error(
                "Spotify links need SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the host, or paste a SoundCloud link / song name instead."
            );
            err.code = "MUSIC_SPOTIFY_FAILED";
            throw err;
        }

        try {
            if (play.is_expired && (await play.is_expired())) {
                try {
                    await play.refreshToken();
                } catch {
                    /* ignore */
                }
            }
            const sp = await withTimeout(play.spotify(q), 15_000, "Spotify lookup");
            const name = sp?.name || "Unknown track";
            const artists = Array.isArray(sp?.artists)
                ? sp.artists.map((a) => a.name || a).filter(Boolean).join(" ")
                : "";
            const searchQ = `${name} ${artists}`.trim();
            const sc = await searchSoundCloud(searchQ);
            if (sc) {
                sc.title = `${name}${artists ? ` — ${artists}` : ""} (via SoundCloud)`;
                return sc;
            }
            const err = new Error(
                `Found Spotify track “${name}” but no SoundCloud match to stream.`
            );
            err.code = "MUSIC_NO_STREAM";
            throw err;
        } catch (e) {
            if (e?.code) throw e;
            const err = new Error(
                "Could not read that Spotify link. Use a SoundCloud link or song name."
            );
            err.code = "MUSIC_SPOTIFY_FAILED";
            throw err;
        }
    }

    if (isSoundCloudUrl(q)) {
        try {
            const info = await withTimeout(
                play.soundcloud(q),
                15_000,
                "SoundCloud track info"
            );
            return {
                title: info?.name || info?.title || "SoundCloud track",
                url: q,
                source: "soundcloud",
                duration: info?.durationInSec || null
            };
        } catch {
            return {
                title: "SoundCloud track",
                url: q,
                source: "soundcloud",
                duration: null
            };
        }
    }

    const sc = await searchSoundCloud(q);
    if (sc) return sc;

    const err = new Error(
        "No SoundCloud results for that search. Try another query or a SoundCloud URL."
    );
    err.code = "MUSIC_NOT_FOUND";
    throw err;
}

module.exports = {
    resolveTrack,
    isYoutubeUrl,
    isSoundCloudUrl,
    isSpotifyUrl,
    ensureSpotifyToken
};
