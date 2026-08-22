/**
 * Image generation via a self-hosted / Home Mode HTTP API.
 *
 * Env (never log secrets):
 *   HOME_MODE_API_URL   — base URL, e.g. https://api.example.com
 *   HOME_MODE_API_KEY   — bearer / x-api-key
 *   HOME_MODE_API_PATH  — optional path (default /v1/images/generations)
 *   HOME_MODE_API_MODEL — optional model name sent in JSON body
 *
 * Expected request (OpenAI-compatible images API):
 *   POST {HOME_MODE_API_URL}{HOME_MODE_API_PATH}
 *   Authorization: Bearer {HOME_MODE_API_KEY}
 *   { "prompt": "...", "n": 1, "size": "1024x1024", "model": "..." }
 *
 * Accepted responses:
 *   - { data: [ { url } ] } or { data: [ { b64_json } ] }
 *   - { url } / { image_url } / { image }
 *   - raw image bytes (image/png|jpeg|webp)
 */

const DEFAULT_PATH = "/v1/images/generations";
const FETCH_TIMEOUT_MS = 120_000;
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
    return pickEnv(
        "HOME_MODE_API_URL",
        "HOMEMODE_API_URL",
        "IMAGE_API_URL"
    );
}

function resolveApiKey() {
    return pickEnv(
        "HOME_MODE_API_KEY",
        "HOMEMODE_API_KEY",
        "IMAGE_API_KEY"
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
    return Boolean(resolveBaseUrl() && resolveApiKey());
}

function getHomeModeStatus() {
    const url = resolveBaseUrl();
    const key = resolveApiKey();
    return {
        configured: Boolean(url && key),
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
        const res = await fetch(url, { signal: controller.signal });
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
    const key = resolveApiKey();
    if (!base || !key) {
        const err = new Error(
            "HOME_MODE_API_URL / HOME_MODE_API_KEY not configured"
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

    const width = Number(opts.width) || 1024;
    const height = Number(opts.height) || 1024;
    const size = `${width}x${height}`;
    const path = resolvePath();
    const url = base.replace(/\/+$/, "") + path;
    const model = resolveModel();

    const body = {
        prompt: cleaned,
        n: 1,
        size
    };
    if (model) body.model = model;
    if (opts.negativePrompt) body.negative_prompt = String(opts.negativePrompt);

    logHm(`POST ${path} size=${size}${model ? ` model=${model}` : ""}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "X-API-Key": key,
                "Content-Type": "application/json",
                Accept: "application/json,image/*"
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (e) {
        clearTimeout(timer);
        if (e?.name === "AbortError") {
            const err = new Error("Home Mode image request timed out");
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

    const imageUrl =
        json?.data?.[0]?.url ||
        json?.url ||
        json?.image_url ||
        json?.image ||
        null;
    if (imageUrl && typeof imageUrl === "string") {
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
