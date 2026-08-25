/**
 * Resolve play queries to streamable non-YouTube sources.
 * Primary: SoundCloud (native API). Spotify only if fully configured.
 */

const play = require("play-dl");
const { withTimeout } = require("../withTimeout.js");
const sc = require("./soundcloud.js");

let spotifyTokenReady = false;
let spotifyAttempted = false;
let scAuthAttempted = false;

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
            try {
                delete process.env[k];
            } catch (_) {}
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

async function ensureSoundCloudAuth() {
    if (scAuthAttempted) return;
    scAuthAttempted = true;
    try {
        const clientId = await sc.getClientId();
        if (clientId && typeof play.setToken === "function") {
            try {
                await play.setToken({ soundcloud: { client_id: clientId } });
                console.log("[Music] play-dl SoundCloud client_id set");
            } catch (e) {
                console.warn("[Music] play-dl setToken soundcloud:", e?.message || e);
            }
        }
    } catch (e) {
        console.warn("[Music] SoundCloud client_id:", e?.message || e);
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
    await ensureSoundCloudAuth();
    try {
        const track = await withTimeout(
            sc.searchTracks(query, 5),
            20_000,
            "SoundCloud search"
        );
        if (track) return track;
    } catch (e) {
        console.warn("[Music] native SC search failed:", e?.message || e);
    }

    // Fallback: play-dl search
    try {
        const results = await withTimeout(
            play.search(String(query).slice(0, 200), {
                source: { soundcloud: "tracks" },
                limit: 5
            }),
            20_000,
            "SoundCloud search (play-dl)"
        );
        if (results?.length) {
            const track = results[0];
            return {
                title: track.name || track.title || String(query),
                url: track.url,
                source: "soundcloud",
                duration: track.durationInSec || null
            };
        }
    } catch (e) {
        const msg = String(e?.message || e);
        console.warn("[Music] play-dl SC search failed:", msg);
        if (/authorization|client_id|Data is missing/i.test(msg)) {
            const err = new Error(
                "SoundCloud is not authorized on this host. Set SOUNDCLOUD_CLIENT_ID in env, or try again in a minute."
            );
            err.code = "MUSIC_SEARCH_FAILED";
            throw err;
        }
        throw e;
    }
    return null;
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

    if (isSpotifyUrl(q)) {
        const ok = await ensureSpotifyToken();
        if (!ok) {
            const err = new Error(
                "Spotify links need both SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. Or use a SoundCloud link / song name."
            );
            err.code = "MUSIC_SPOTIFY_CONFIG";
            throw err;
        }
        try {
            const info = await withTimeout(play.spotify(q), 15_000, "spotify");
            const name =
                info?.name || info?.title || "Spotify track";
            const artists =
                info?.artists?.map((a) => a.name).filter(Boolean).join(" ") || "";
            const searchQ = `${name} ${artists}`.trim();
            const scTrack = await searchSoundCloud(searchQ);
            if (!scTrack) {
                const err = new Error(
                    `Found Spotify track “${name}” but no SoundCloud match. Try a SoundCloud link.`
                );
                err.code = "MUSIC_SEARCH_FAILED";
                throw err;
            }
            return scTrack;
        } catch (e) {
            if (e.code) throw e;
            const err = new Error(e?.message || "Spotify lookup failed");
            err.code = "MUSIC_SPOTIFY_FAILED";
            throw err;
        }
    }

    if (isSoundCloudUrl(q)) {
        await ensureSoundCloudAuth();
        try {
            const track = await withTimeout(sc.resolveUrl(q), 15_000, "sc resolve");
            if (track) return track;
        } catch (e) {
            console.warn("[Music] SC resolve failed, using URL as-is:", e?.message || e);
        }
        return { title: "SoundCloud track", url: q, source: "soundcloud", duration: null };
    }

    const scTrack = await searchSoundCloud(q);
    if (!scTrack) {
        const err = new Error(
            "No SoundCloud results for that search. Try different keywords or a SoundCloud URL."
        );
        err.code = "MUSIC_SEARCH_FAILED";
        throw err;
    }
    return scTrack;
}

module.exports = {
    resolveTrack,
    ensureSpotifyToken,
    ensureSoundCloudAuth,
    isYoutubeUrl,
    isSoundCloudUrl,
    isSpotifyUrl
};
