/**
 * SoundCloud client_id + resolve/search/stream helpers.
 * Avoids play-dl's interactive authorization for SoundCloud.
 */

const fs = require("fs");
const https = require("https");
const http = require("http");
const { URL } = require("url");

let cachedClientId = null;
let clientIdFetchedAt = 0;
const CLIENT_ID_TTL_MS = 6 * 60 * 60 * 1000;

function envClientId() {
    return String(
        process.env.SOUNDCLOUD_CLIENT_ID ||
            process.env.SOUNDCLOUD_CLIENTID ||
            process.env.SC_CLIENT_ID ||
            ""
    ).trim() || null;
}

function fetchText(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "https:" ? https : http;
        const req = lib.get(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    Accept: "*/*"
                },
                timeout: timeoutMs
            },
            (res) => {
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    res.resume();
                    return resolve(fetchText(new URL(res.headers.location, url).href, timeoutMs));
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${url.slice(0, 80)}`));
                }
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
                res.on("error", reject);
            }
        );
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("timeout"));
        });
        req.on("error", reject);
    });
}

function fetchJson(url, timeoutMs = 15000) {
    return fetchText(url, timeoutMs).then((t) => JSON.parse(t));
}

function downloadToFile(url, destPath, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === "https:" ? https : http;
        const req = lib.get(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    Accept: "*/*",
                    Referer: "https://soundcloud.com/"
                },
                timeout: timeoutMs
            },
            (res) => {
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    res.resume();
                    return resolve(downloadToFile(new URL(res.headers.location, url).href, destPath, timeoutMs));
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`Download HTTP ${res.statusCode}`));
                }
                const ws = fs.createWriteStream(destPath);
                res.pipe(ws);
                ws.on("finish", () => resolve(destPath));
                ws.on("error", reject);
                res.on("error", reject);
            }
        );
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("download timeout"));
        });
        req.on("error", reject);
    });
}

async function scrapeClientId() {
    console.log("[Music] Fetching SoundCloud client_id…");
    const html = await fetchText("https://soundcloud.com/");
    const scriptUrls = [];
    const re = /src="(https:\/\/[^"]*sndcdn\.com\/assets\/[^"]+\.js)"/gi;
    let m;
    while ((m = re.exec(html))) scriptUrls.push(m[1]);
    const candidates = [...new Set(scriptUrls)].slice(-12).reverse();

    for (const scriptUrl of candidates) {
        try {
            const js = await fetchText(scriptUrl);
            const patterns = [
                /client_id\s*:\s*"([A-Za-z0-9]{16,})"/,
                /clientId\s*:\s*"([A-Za-z0-9]{16,})"/,
                /"client_id"\s*:\s*"([A-Za-z0-9]{16,})"/,
                /client_id:"([A-Za-z0-9]{16,})"/,
                /client_id=([A-Za-z0-9]{16,})/
            ];
            for (const p of patterns) {
                const hit = js.match(p);
                if (hit?.[1]) {
                    console.log("[Music] SoundCloud client_id obtained from", scriptUrl.slice(0, 60));
                    return hit[1];
                }
            }
        } catch (e) {
            // try next script
        }
    }
    throw new Error("Could not extract SoundCloud client_id from site scripts");
}

async function getClientId(force = false) {
    const fromEnv = envClientId();
    if (fromEnv) {
        cachedClientId = fromEnv;
        return fromEnv;
    }
    if (
        !force &&
        cachedClientId &&
        Date.now() - clientIdFetchedAt < CLIENT_ID_TTL_MS
    ) {
        return cachedClientId;
    }
    const id = await scrapeClientId();
    cachedClientId = id;
    clientIdFetchedAt = Date.now();
    return id;
}

async function apiGet(pathOrUrl, params = {}) {
    const clientId = await getClientId();
    let url;
    if (/^https?:\/\//i.test(pathOrUrl)) {
        url = new URL(pathOrUrl);
    } else {
        url = new URL(pathOrUrl, "https://api-v2.soundcloud.com");
    }
    url.searchParams.set("client_id", clientId);
    for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
    try {
        return await fetchJson(url.href);
    } catch (e) {
        if (/HTTP 401|HTTP 403|invalid/i.test(String(e?.message || e))) {
            cachedClientId = null;
            const id2 = await getClientId(true);
            url.searchParams.set("client_id", id2);
            return await fetchJson(url.href);
        }
        throw e;
    }
}

function trackFromApi(item) {
    if (!item) return null;
    const url =
        item.permalink_url ||
        (item.user?.permalink && item.permalink
            ? `https://soundcloud.com/${item.user.permalink}/${item.permalink}`
            : null);
    if (!url) return null;
    return {
        title: item.title || item.permalink || "SoundCloud track",
        url,
        source: "soundcloud",
        duration: item.duration ? Math.round(item.duration / 1000) : null,
        id: item.id,
        streamable: item.streamable !== false,
        media: item.media || null
    };
}

async function resolveUrl(trackUrl) {
    const data = await apiGet("/resolve", { url: trackUrl });
    if (data?.kind === "track" || data?.title) {
        return trackFromApi(data);
    }
    if (data?.tracks?.[0]) return trackFromApi(data.tracks[0]);
    return null;
}

async function searchTracks(query, limit = 5) {
    const data = await apiGet("/search/tracks", {
        q: String(query).slice(0, 200),
        limit: String(limit)
    });
    const collection = data?.collection || (Array.isArray(data) ? data : []);
    for (const item of collection) {
        const t = trackFromApi(item);
        if (t) return t;
    }
    return null;
}

async function getProgressiveStreamUrl(track) {
    let media = track.media;
    if (!media && track.url) {
        const full = await resolveUrl(track.url);
        media = full?.media;
        if (full?.id) track.id = full.id;
    }
    if (!media?.transcodings?.length && track.id) {
        const full = await apiGet(`/tracks/${track.id}`);
        media = full?.media;
    }
    if (!media?.transcodings?.length) {
        throw new Error("No SoundCloud media transcodings for this track");
    }

    const progressive =
        media.transcodings.find(
            (t) =>
                t.format?.protocol === "progressive" &&
                /mpeg|mp3/i.test(t.format?.mime_type || t.preset || "")
        ) ||
        media.transcodings.find((t) => t.format?.protocol === "progressive") ||
        media.transcodings[0];

    if (!progressive?.url) throw new Error("No usable SoundCloud stream URL");

    const clientId = await getClientId();
    const infoUrl = progressive.url.includes("client_id=")
        ? progressive.url
        : progressive.url +
          (progressive.url.includes("?") ? "&" : "?") +
          "client_id=" +
          encodeURIComponent(clientId);

    const info = await fetchJson(infoUrl);
    if (!info?.url) throw new Error("SoundCloud stream info missing url");
    return info.url;
}

async function downloadTrackToFile(track, destPath) {
    const streamUrl = await getProgressiveStreamUrl(track);
    console.log("[Music] SC stream:", String(streamUrl).slice(0, 100));
    await downloadToFile(streamUrl, destPath);
    if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 2000) {
        throw new Error("Downloaded SoundCloud file too small");
    }
    return destPath;
}

module.exports = {
    getClientId,
    resolveUrl,
    searchTracks,
    getProgressiveStreamUrl,
    downloadTrackToFile,
    trackFromApi
};
