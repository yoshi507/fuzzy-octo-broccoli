/**
 * Parse [GIF: query] tags from AI text and resolve real GIF URLs (Tenor/Giphy).
 */

const GIF_TAG_RE = /\[(?:GIF|gif)\s*:\s*([^\]]{1,80})\]/g;

function extractGifTags(text) {
    const queries = [];
    const cleaned = String(text || "")
        .replace(GIF_TAG_RE, (_, q) => {
            const query = String(q || "").trim();
            if (query) queries.push(query);
            return "";
        })
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { text: cleaned, queries };
}

async function fetchFromTenor(query) {
    const key = process.env.TENOR_API_KEY || process.env.TENOR_KEY;
    if (!key) return null;
    const url =
        "https://tenor.googleapis.com/v2/search?q=" +
        encodeURIComponent(query) +
        "&key=" +
        encodeURIComponent(key) +
        "&limit=8&media_filter=gif&contentfilter=medium&random=true";
    const res = await fetch(url);
    if (!res.ok) {
        console.warn("[GIF] Tenor HTTP", res.status);
        return null;
    }
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * Math.min(results.length, 5))];
    return (
        pick?.media_formats?.gif?.url ||
        pick?.media_formats?.mediumgif?.url ||
        pick?.media_formats?.tinygif?.url ||
        null
    );
}

async function fetchFromGiphy(query) {
    const key = process.env.GIPHY_API_KEY || process.env.GIPHY_KEY;
    if (!key) return null;
    const url =
        "https://api.giphy.com/v1/gifs/search?api_key=" +
        encodeURIComponent(key) +
        "&q=" +
        encodeURIComponent(query) +
        "&limit=8&rating=pg-13";
    const res = await fetch(url);
    if (!res.ok) {
        console.warn("[GIF] Giphy HTTP", res.status);
        return null;
    }
    const data = await res.json();
    const results = Array.isArray(data.data) ? data.data : [];
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * Math.min(results.length, 5))];
    return (
        pick?.images?.original?.url ||
        pick?.images?.downsized?.url ||
        pick?.images?.fixed_height?.url ||
        null
    );
}

async function resolveGifUrl(query) {
    const q = String(query || "").trim().slice(0, 80);
    if (!q) return null;
    try {
        const tenor = await fetchFromTenor(q);
        if (tenor) return tenor;
    } catch (err) {
        console.warn("[GIF] Tenor error:", err?.message || err);
    }
    try {
        const giphy = await fetchFromGiphy(q);
        if (giphy) return giphy;
    } catch (err) {
        console.warn("[GIF] Giphy error:", err?.message || err);
    }
    return null;
}

/**
 * Build a Discord message payload from AI text, replacing [GIF: ...] with real files.
 */
async function buildGifAwarePayload(answer, options = {}) {
    const maxGifs = options.maxGifs ?? 1;
    const { text, queries } = extractGifTags(answer);
    const files = [];

    for (const query of queries.slice(0, maxGifs)) {
        const url = await resolveGifUrl(query);
        if (url) {
            files.push({ attachment: url, name: "omni-reaction.gif" });
        }
    }

    const payload = {};
    if (text) payload.content = text.length > 1900 ? text.slice(0, 1900) + "\u2026" : text;
    if (files.length) payload.files = files;

    if (!payload.content && !payload.files?.length) {
        payload.content = String(answer || "").slice(0, 1900) || "\u2026";
    }

    return payload;
}

module.exports = {
    extractGifTags,
    resolveGifUrl,
    buildGifAwarePayload
};
