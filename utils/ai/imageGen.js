/**
 * Pollinations Flux image generation — simple, logged, resource-safe.
 * ONE job at a time via generationQueue.
 */

const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const {
    enqueueGeneration,
    QUEUE_WAIT_MESSAGE
} = require("./generationQueue.js");

const MODEL = "flux";
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const MAX_DIM = 512;
const FETCH_TIMEOUT_MS = 90_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function logImg(msg, extra) {
    if (extra !== undefined) console.log(`[ImageGen] ${msg}`, extra);
    else console.log(`[ImageGen] ${msg}`);
}

function resolveApiKey() {
    const raw =
        process.env.POLLINATIONS_API_KEY ||
        process.env.POLLINATIONS_KEY ||
        process.env.POLLINATIONS_TOKEN ||
        "";
    return String(raw).trim().replace(/^["']|["']$/g, "") || null;
}

function clampDim(n, fallback) {
    const v = Number(n) || fallback;
    return Math.min(MAX_DIM, Math.max(256, Math.floor(v)));
}

function buildImageUrl(prompt, opts = {}) {
    const encoded = encodeURIComponent(String(prompt).trim().slice(0, 400));
    const width = clampDim(opts.width, DEFAULT_WIDTH);
    const height = clampDim(opts.height, DEFAULT_HEIGHT);
    const params = new URLSearchParams({
        model: MODEL,
        width: String(width),
        height: String(height),
        nologo: "true",
        enhance: "false"
    });
    if (opts.seed != null && Number.isFinite(Number(opts.seed))) {
        params.set("seed", String(Math.floor(Number(opts.seed))));
    }
    const key = resolveApiKey();
    if (key) params.set("key", key);
    return `https://gen.pollinations.ai/image/${encoded}?${params.toString()}`;
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
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
    return false;
}

async function readBody(res, maxBytes) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
        const err = new Error(
            `Image response too large (${ab.byteLength} > ${maxBytes})`
        );
        err.code = "IMAGE_TOO_LARGE";
        throw err;
    }
    return Buffer.from(ab);
}

async function fetchFluxImage(prompt, opts = {}) {
    const key = resolveApiKey();
    if (!key) {
        const err = new Error("POLLINATIONS_API_KEY is not configured");
        err.code = "IMAGE_NOT_CONFIGURED";
        logImg("FAIL: missing POLLINATIONS_API_KEY");
        throw err;
    }

    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    const url = buildImageUrl(cleaned, opts);
    const safeUrl = url.replace(/([?&]key=)[^&]+/i, "$1***");
    logImg(`request start ${safeUrl}`);

    const headers = {
        Authorization: `Bearer ${key}`,
        Accept: "image/*,application/json"
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, {
            method: "GET",
            headers,
            redirect: "follow",
            signal: controller.signal
        });
    } catch (e) {
        clearTimeout(timer);
        if (e?.name === "AbortError") {
            logImg(`FAIL: timeout after ${FETCH_TIMEOUT_MS}ms`);
            const err = new Error("Image request timed out");
            err.code = "IMAGE_TIMEOUT";
            throw err;
        }
        logImg(`FAIL: network error: ${e?.message || e}`);
        const err = new Error(`Image provider request failed: ${e?.message || e}`);
        err.code = "IMAGE_PROVIDER_ERROR";
        err.cause = e;
        throw err;
    } finally {
        clearTimeout(timer);
    }

    const status = res.status;
    const contentType = (res.headers.get("content-type") || "").split(";")[0];
    logImg(`response status=${status} content-type=${contentType || "unknown"}`);

    if (!res.ok) {
        let bodyText = "";
        try {
            bodyText = await res.text();
        } catch {
            /* ignore */
        }
        console.error(
            `[ImageGen] Pollinations HTTP ${status}:`,
            String(bodyText).slice(0, 500)
        );

        if (status === 401 || status === 403) {
            const err = new Error(`Pollinations auth failed (HTTP ${status})`);
            err.code = "IMAGE_AUTH_FAILED";
            err.status = status;
            throw err;
        }
        if (status === 429) {
            const err = new Error(`Pollinations rate limit (HTTP ${status})`);
            err.code = "IMAGE_RATE_LIMIT";
            err.status = status;
            throw err;
        }
        const err = new Error(
            `Pollinations HTTP ${status}: ${String(bodyText).slice(0, 200)}`
        );
        err.code = "IMAGE_PROVIDER_ERROR";
        err.status = status;
        throw err;
    }

    const buffer = await readBody(res, MAX_IMAGE_BYTES);
    logImg(`downloaded ${buffer.length} bytes`);

    if (!buffer.length) {
        const err = new Error("Empty image response");
        err.code = "IMAGE_EMPTY";
        throw err;
    }

    if (!looksLikeImage(buffer)) {
        const preview = buffer.toString("utf8", 0, 300);
        console.error(`[ImageGen] response is not an image. preview=`, preview);
        const err = new Error(
            `Pollinations returned non-image data: ${preview.slice(0, 120)}`
        );
        err.code = "IMAGE_PROVIDER_ERROR";
        throw err;
    }

    let ct = contentType || "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50) ct = "image/png";
    else if (buffer[0] === 0xff && buffer[1] === 0xd8) ct = "image/jpeg";
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) ct = "image/webp";

    logImg(`OK image ${ct} ${buffer.length} bytes`);
    return { buffer, contentType: ct };
}

async function generateGuildImage(guildId, prompt, opts = {}) {
    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    if (guildId && !canUseAI(guildId)) {
        const err = new Error("AI daily limit reached");
        err.code = "AI_DAILY_LIMIT";
        err.guildId = guildId;
        throw err;
    }

    return enqueueGeneration(
        async () => {
            if (guildId && !canUseAI(guildId)) {
                const err = new Error("AI daily limit reached");
                err.code = "AI_DAILY_LIMIT";
                err.guildId = guildId;
                throw err;
            }

            logImg(`queued job start guild=${guildId || "n/a"}`);
            const result = await fetchFluxImage(cleaned, {
                width: clampDim(opts.width, DEFAULT_WIDTH),
                height: clampDim(opts.height, DEFAULT_HEIGHT),
                seed: opts.seed
            });

            if (guildId) useAI(guildId);
            logImg(`queued job done guild=${guildId || "n/a"}`);
            return result;
        },
        "image",
        { onQueued: opts.onQueued }
    );
}

function formatImageUserError(error) {
    if (!error) return "❌ Something went wrong generating the image.";
    if (error.code === "AI_DAILY_LIMIT") {
        try {
            const { limitReachedMessage } = require("./groq.js");
            return limitReachedMessage(error.guildId);
        } catch {
            return "❌ This server has reached its daily AI limit. Try again tomorrow.";
        }
    }
    if (error.code === "IMAGE_NOT_CONFIGURED") {
        return "❌ Image generation is not configured. Set `POLLINATIONS_API_KEY` on the host.";
    }
    if (error.code === "IMAGE_AUTH_FAILED") {
        return "❌ Image API authentication failed. Check `POLLINATIONS_API_KEY`.";
    }
    if (error.code === "IMAGE_RATE_LIMIT") {
        return "❌ The image service is rate-limited. Try again in a moment.";
    }
    if (error.code === "IMAGE_BAD_PROMPT") {
        return "❌ Please provide a description of the image you want.";
    }
    if (error.code === "IMAGE_EMPTY") {
        return "❌ The image service returned an empty result.";
    }
    if (error.code === "IMAGE_TIMEOUT") {
        return "❌ Image generation timed out. Please try again.";
    }
    if (error.code === "IMAGE_TOO_LARGE") {
        return "❌ The image was too large to process.";
    }
    return "❌ Image generation failed. Please try again.";
}

module.exports = {
    MODEL,
    generateGuildImage,
    fetchFluxImage,
    formatImageUserError,
    resolveApiKey,
    getRemaining,
    DAILY_LIMIT,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    QUEUE_WAIT_MESSAGE
};
