/**
 * Image generation via Home Mode / PixelForge HTTP API.
 *
 * PixelForge (user site):
 *   HOME_MODE_API_URL=https://free-ai-image-generator-black.vercel.app
 *   HOME_MODE_API_PATH=/api/v1/generate
 *   HOME_MODE_API_KEY=optional  (Bearer)
 *
 * Request:  POST {url}{path}  JSON { prompt, style?, width?, height? }
 * Response: { success, image_url, ... } or OpenAI-style { data:[{url|b64_json}] }
 */

const DEFAULT_PATH = "/api/v1/generate";
const FETCH_TIMEOUT_MS = 90_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function pickEnv(...names) {
    for (const name of names) {
        const raw = process.env[name];
        if (raw == null) continue;
        const v = String(raw).trim().replace(/^["']|["']$/g, "");
        if (v) return v;
    }
    return null;
}

function resolveBaseUrl() {
    let base = pickEnv(
        "HOME_MODE_API_URL",
        "HOMEMODE_API_URL",
        "IMAGE_API_URL",
        "PIXELFORGE_URL"
    );
    if (!base) return null;
    base = base.replace(/\/+$/, "");
    base = base.replace(/\/api\/v1\/generate$/i, "");
    base = base.replace(/\/v1\/images\/generations$/i, "");
    return base;
}

function resolveApiKey() {
    return pickEnv(
        "HOME_MODE_API_KEY",
        "HOMEMODE_API_KEY",
        "IMAGE_API_KEY",
        "PIXELFORGE_API_KEY"
    );
}

function resolvePath() {
    const p = pickEnv("HOME_MODE_API_PATH", "IMAGE_API_PATH") || DEFAULT_PATH;
    return p.startsWith("/") ? p : `/${p}`;
}

function resolveModel() {
    return pickEnv("HOME_MODE_API_MODEL", "IMAGE_API_MODEL");
}

function isHomeModeConfigured() {
    // PixelForge allows optional API key — URL alone is enough
    return Boolean(resolveBaseUrl());
}

function getHomeModeStatus() {
    const url = resolveBaseUrl();
    const key = resolveApiKey();
    return {
        configured: Boolean(url),
        hasUrl: Boolean(url),
        hasKey: Boolean(key),
        path: resolvePath(),
        model: resolveModel() || null
    };
}

function looksLikeImage(buf) {
    if (!buf || buf.length < 12) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
        return true;
    if (
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45
    )
        return true;
    return false;
}

function logHm(msg) {
    console.log(`[HomeModeImage] ${msg}`);
}

async function downloadImageUrl(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "image/*,*/*" },
            redirect: "follow"
        });
        if (!res.ok) {
            const err = new Error(`Image download failed HTTP ${res.status}`);
            err.code = "IMAGE_DOWNLOAD_FAILED";
            err.status = res.status;
            throw err;
        }
        const ab = await res.arrayBuffer();
        if (ab.byteLength > MAX_IMAGE_BYTES) {
            const err = new Error("Downloaded image too large");
            err.code = "IMAGE_TOO_LARGE";
            throw err;
        }
        const buffer = Buffer.from(ab);
        if (!looksLikeImage(buffer)) {
            const err = new Error("Downloaded file is not a valid image");
            err.code = "IMAGE_BAD_RESPONSE";
            throw err;
        }
        const ct = (res.headers.get("content-type") || "image/png").split(";")[0];
        return { buffer, contentType: ct };
    } finally {
        clearTimeout(timer);
    }
}

async function generateHomeModeImage(prompt, opts = {}) {
    const base = resolveBaseUrl();
    if (!base) {
        const err = new Error(
            "HOME_MODE_API_URL not configured (e.g. https://free-ai-image-generator-black.vercel.app)"
        );
        err.code = "IMAGE_NOT_CONFIGURED";
        throw err;
    }

    const cleaned = String(prompt || "").trim().slice(0, 2000);
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    const width = Math.min(1024, Math.max(256, Number(opts.width) || 512));
    const height = Math.min(1024, Math.max(256, Number(opts.height) || 512));
    const path = resolvePath();
    const endpoint = base.replace(/\/+$/, "") + path;
    const key = resolveApiKey();
    const model = resolveModel();

    const body = {
        prompt: cleaned,
        width,
        height
    };
    if (opts.style) body.style = String(opts.style);
    if (model) body.model = model;

    logHm(`POST ${endpoint} size=${width}x${height}${key ? " auth=yes" : " auth=no"}`);

    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json,image/*"
    };
    if (key) {
        headers.Authorization = `Bearer ${key}`;
        headers["X-API-Key"] = key;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (e) {
        clearTimeout(timer);
        if (e?.name === "AbortError") {
            const err = new Error(
                "Home Mode image request timed out. Check HOME_MODE_API_URL is reachable."
            );
            err.code = "IMAGE_TIMEOUT";
            throw err;
        }
        const err = new Error(`Home Mode network error: ${e?.message || e}`);
        err.code = "IMAGE_NETWORK";
        throw err;
    } finally {
        clearTimeout(timer);
    }

    const status = res.status;
    const contentType = (res.headers.get("content-type") || "").split(";")[0];
    logHm(`response status=${status} content-type=${contentType || "unknown"}`);

    if (!res.ok) {
        let text = "";
        try {
            text = await res.text();
        } catch {
            /* ignore */
        }
        console.error(`[HomeModeImage] HTTP ${status}:`, String(text).slice(0, 400));
        if (status === 401 || status === 403) {
            const err = new Error("Home Mode API key rejected");
            err.code = "IMAGE_AUTH_FAILED";
            err.status = status;
            throw err;
        }
        if (status === 429) {
            const err = new Error("Home Mode API rate limited");
            err.code = "IMAGE_RATE_LIMIT";
            err.status = status;
            throw err;
        }
        const err = new Error(
            `Home Mode image API HTTP ${status}: ${String(text).slice(0, 160)}`
        );
        err.code = "IMAGE_PROVIDER_ERROR";
        err.status = status;
        throw err;
    }

    if (contentType.includes("image/")) {
        const ab = await res.arrayBuffer();
        const buffer = Buffer.from(ab);
        if (!looksLikeImage(buffer)) {
            const err = new Error("Home Mode returned non-image data");
            err.code = "IMAGE_BAD_RESPONSE";
            throw err;
        }
        logHm(`OK binary ${buffer.length} bytes`);
        return { buffer, contentType, provider: "homemode" };
    }

    let json;
    try {
        json = await res.json();
    } catch {
        const err = new Error("Home Mode returned invalid JSON");
        err.code = "IMAGE_BAD_RESPONSE";
        throw err;
    }

    const imageUrl =
        json?.image_url ||
        json?.data?.[0]?.url ||
        json?.url ||
        json?.image ||
        null;

    const b64 =
        json?.data?.[0]?.b64_json ||
        json?.b64_json ||
        json?.image_b64 ||
        null;

    if (b64 && typeof b64 === "string") {
        const buffer = Buffer.from(
            b64.replace(/^data:image\/\w+;base64,/, ""),
            "base64"
        );
        if (!looksLikeImage(buffer)) {
            const err = new Error("Home Mode b64 was not a valid image");
            err.code = "IMAGE_BAD_RESPONSE";
            throw err;
        }
        logHm(`OK b64 ${buffer.length} bytes`);
        return { buffer, contentType: "image/png", provider: "homemode" };
    }

    if (imageUrl && typeof imageUrl === "string") {
        logHm("downloading image_url…");
        const dl = await downloadImageUrl(imageUrl);
        logHm(`OK url-download ${dl.buffer.length} bytes`);
        return { ...dl, provider: "homemode" };
    }

    console.error(
        "[HomeModeImage] unexpected JSON:",
        JSON.stringify(json).slice(0, 300)
    );
    const err = new Error("Home Mode response missing image data");
    err.code = "IMAGE_BAD_RESPONSE";
    throw err;
}

module.exports = {
    isHomeModeConfigured,
    getHomeModeStatus,
    generateHomeModeImage
};
