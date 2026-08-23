/**
 * Resolve play queries to streamable non-YouTube sources.
 * Primary: SoundCloud. Spotify URLs only if fully configured.
 */

const play = require("play-dl");
const { withTimeout } = require("../withTimeout.js");

let spotifyTokenReady = false;
let spotifyAttempted = false;

function sanitizeSpotifyEnv() {
    const id = String(
        process.env.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENTID || ""
    ).trim();
    const secret = String(
        process.env.SPOTIFY_CLIENT_SECRET ||
            process.env.SPOTIFY_CLIENTSECRET ||
            ""
    ).trim();
    if (id && secret) return { ok: true, client_id: id, client_secret: secret };

    for (const k of [
        "SPOTIFY_CLIENT_ID",
        "SPOTIFY_CLIENTID",
        "SPOTIFY_CLIENT_SECRET",
        "SPOTIFY_CLIENTSECRET",
        "SPOTIFY_REFRESH_TOKEN",
        "SPOTIFY_MARKET"
    ]) {
        if (process.env[k] !== undefined && !String(process.env[k] || "").trim()) {
            try { delete process.env[k]; } catch (_) {}
        }
    }
    if (id || secret) {
        console.warn(
            "[Music] Incomplete Spotify config (need BOTH client id and secret). Ignoring SPOTIFY_* for this process."
        );
        try {
            delete process.env.SPOTIFY_CLIENT_ID;
            delete process.env.SPOTIFY_CLIENTID;
            delete process.env.SPOTIFY_CLIENT_SECRET;
            delete process.env.SPOTIFY_CLIENTSECRET;
            delete process.env.SPOTIFY_REFRESH_TOKEN;
        } catch (_) {}
    }
    return { ok: false };
}

sanitizeSpotifyEnv();

async function ensureSpotifyToken() {
    if (spotifyTokenReady || spotifyAttempted) return spotifyTokenReady;
    spotifyAttempted = true;

    const creds = sanitizeSpotifyEnv();
    if (!creds.ok) {
        console.log("[Music] Spotify not configured — use SoundCloud links or song names");
        return false;
    }

    try {
        const spotify = {
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            market: process.env.SPOTIFY_MARKET || "US"
        };
        const refresh = String(process.env.SPOTIFY_REFRESH_TOKEN || "").trim();
        if (refresh) spotify.refresh_token = refresh;

        await play.setToken({ spotify });
        spotifyTokenReady = true;
        console.log("[Music] Spotify credentials configured");
        return true;
    } catch (e) {
        console.warn("[Music] Spotify token setup failed:", e?.message || e);
        spotifyTokenReady = false;
        return false;
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
    sanitizeSpotifyEnv();
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
        console.warn("[Music] SoundCloud search failed:", msg);
        if (/client_id/i.test(msg)) {
            const err = new Error(
                "SoundCloud search is temporarily unavailable. Paste a direct SoundCloud track URL instead."
            );
            err.code = "MUSIC_SEARCH_FAILED";
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
        const ready = await ensureSpotifyToken();
        if (!ready) {
            const err = new Error(
                "Spotify links need both SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. Or use a SoundCloud link / song name."
            );
            err.code = "MUSIC_SPOTIFY_CONFIG";
            throw err;
        }

        try {
            if (play.is_expired && (await play.is_expired())) {
                try { await play.refreshToken(); } catch { /* ignore */ }
            }
            const sp = await withTimeout(play.spotify(q), 15_000, "Spotify lookup");
            const name = sp?.name || "Unknown track";
            const artists = Array.isArray(sp?.artists)
                ? sp.artists.map((a) => a.name || a).filter(Boolean).join(", ")
                : "";
            const searchQ = artists ? `${name} ${artists}` : name;
            const sc = await searchSoundCloud(searchQ);
            if (!sc) {
                const err = new Error(
                    `Found Spotify track “${name}” but no SoundCloud match. Try a SoundCloud link.`
                );
                err.code = "MUSIC_SPOTIFY_FAILED";
                throw err;
            }
            return { ...sc, title: `${name}${artists ? ` — ${artists}` : ""}` };
        } catch (e) {
            if (e.code) throw e;
            const err = new Error(e?.message || "Could not resolve that Spotify link.");
            err.code = "MUSIC_SPOTIFY_FAILED";
            throw err;
        }
    }

    if (isSoundCloudUrl(q)) {
        return { title: "SoundCloud track", url: q, source: "soundcloud", duration: null };
    }

    const sc = await searchSoundCloud(q);
    if (!sc) {
        const err = new Error(
            "No SoundCloud results for that search. Try different keywords or a SoundCloud URL."
        );
        err.code = "MUSIC_NO_RESULTS";
        throw err;
    }
    return sc;
}

module.exports = {
    resolveTrack,
    ensureSpotifyToken,
    isYoutubeUrl,
    isSoundCloudUrl,
    isSpotifyUrl,
    sanitizeSpotifyEnv
};
