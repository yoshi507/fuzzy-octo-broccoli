/**
 * Resolve play queries to streamable non-YouTube sources.
 * Primary: SoundCloud. Spotify URLs → metadata → SoundCloud search.
 * YouTube URLs are rejected.
 */

const play = require("play-dl");

let spotifyTokenReady = false;

async function ensureSpotifyToken() {
    if (spotifyTokenReady) return;
    const client_id =
        process.env.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENTID || "";
    const client_secret =
        process.env.SPOTIFY_CLIENT_SECRET ||
        process.env.SPOTIFY_CLIENTSECRET ||
        "";
    if (client_id && client_secret) {
        try {
            await play.setToken({
                spotify: {
                    client_id: String(client_id).trim(),
                    client_secret: String(client_secret).trim(),
                    market: process.env.SPOTIFY_MARKET || "US",
                    refresh_token: process.env.SPOTIFY_REFRESH_TOKEN || undefined
                }
            });
            spotifyTokenReady = true;
            console.log("[Music] Spotify credentials configured for play-dl");
        } catch (e) {
            console.warn(
                "[Music] Spotify token setup failed:",
                e?.message || e
            );
        }
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
    const results = await play.search(String(query).slice(0, 200), {
        source: { soundcloud: "tracks" },
        limit: 5
    });
    if (!results?.length) return null;
    const track = results[0];
    return {
        title: track.name || track.title || String(query),
        url: track.url,
        source: "soundcloud",
        duration: track.durationInSec || null
    };
}

/**
 * @param {string} query
 * @returns {Promise<{ title: string, url: string, source: string, duration?: number|null }>}
 */
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

    await ensureSpotifyToken();

    if (isSoundCloudUrl(q)) {
        try {
            const info = await play.soundcloud(q);
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

    if (isSpotifyUrl(q) || /^spotify:/i.test(q)) {
        try {
            if (play.is_expired && (await play.is_expired())) {
                try {
                    await play.refreshToken();
                } catch {
                    /* ignore */
                }
            }
            const sp = await play.spotify(q);
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
                `Found Spotify track “${name}” but no SoundCloud match to stream (Spotify does not allow direct bot streaming).`
            );
            err.code = "MUSIC_NO_STREAM";
            throw err;
        } catch (e) {
            if (e?.code) throw e;
            const err = new Error(
                "Could not read that Spotify link. Set SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET, or paste a SoundCloud link / song name."
            );
            err.code = "MUSIC_SPOTIFY_FAILED";
            throw err;
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
