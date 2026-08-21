/**
 * Pollinations image generation (Flux only) — resource-safe for low-RAM hosts.
 * Uses the shared per-server AI daily limit + global generation queue.
 */

const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const { limitReachedMessage } = require("./groq.js");
const {
    enqueueGeneration,
    QUEUE_WAIT_MESSAGE
} = require("./generationQueue.js");

const MODEL = "flux";
/** Discord-friendly default — keeps RAM and bandwidth low on Wispbyte. */
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const MAX_DIM = 512;
const FETCH_TIMEOUT_MS = 45000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB hard cap

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
    const encoded = encodeURIComponent(String(prompt).trim().slice(0, 500));
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
    return `https://gen.pollinations.ai/image/${encoded}?${params.toString()}`;
}

async function readResponseLimited(res, maxBytes) {
    if (!res.body || typeof res.body.getReader !== "function") {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > maxBytes) {
            const err = new Error("Image response too large");
            err.code = "IMAGE_TOO_LARGE";
            throw err;
        }
        return Buffer.from(ab);
    }

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || !value.length) continue;
            total += value.length;
            if (total > maxBytes) {
                try {
                    await reader.cancel();
                } catch {
                    /* ignore */
                }
                const err = new Error("Image response too large");
                err.code = "IMAGE_TOO_LARGE";
                throw err;
            }
            chunks.push(Buffer.from(value));
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            /* ignore */
        }
    }
    return Buffer.concat(chunks, total);
}

async function fetchFluxImage(prompt, opts = {}) {
    const key = resolveApiKey();
    if (!key) {
        const err = new Error("POLLINATIONS_API_KEY is not configured");
        err.code = "IMAGE_NOT_CONFIGURED";
        throw err;
    }

    const url = buildImageUrl(prompt, opts);
    const headers = {
        Authorization: `Bearer ${key}`,
        Accept: "image/*"
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, {
            headers,
            redirect: "follow",
            signal: controller.signal
        });
    } catch (e) {
        if (e?.name === "AbortError") {
            const err = new Error("Image request timed out");
            err.code = "IMAGE_TIMEOUT";
            throw err;
        }
        const err = new Error("Image provider request failed");
        err.code = "IMAGE_PROVIDER_ERROR";
        err.cause = e;
        throw err;
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        const status = res.status;
        let bodyText = "";
        try {
            bodyText = await res.text();
        } catch {
            /* ignore */
        }
        console.error(
            `[ImageGen] Pollinations HTTP ${status}:`,
            String(bodyText).slice(0, 200)
        );

        if (status === 401 || status === 403) {
            const err = new Error("Pollinations authentication failed");
            err.code = "IMAGE_AUTH_FAILED";
            err.status = status;
            throw err;
        }
        if (status === 429) {
            const err = new Error("Image provider rate limit");
            err.code = "IMAGE_RATE_LIMIT";
            err.status = status;
            throw err;
        }

        const err = new Error("Image generation failed");
        err.code = "IMAGE_PROVIDER_ERROR";
        err.status = status;
        throw err;
    }

    const contentType = (res.headers.get("content-type") || "image/jpeg").split(
        ";"
    )[0];
    const buffer = await readResponseLimited(res, MAX_IMAGE_BYTES);
    if (!buffer.length) {
        const err = new Error("Empty image response");
        err.code = "IMAGE_EMPTY";
        throw err;
    }
    return { buffer, contentType };
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

    const onQueued = opts.onQueued;

    return enqueueGeneration(
        async () => {
            if (guildId && !canUseAI(guildId)) {
                const err = new Error("AI daily limit reached");
                err.code = "AI_DAILY_LIMIT";
                err.guildId = guildId;
                throw err;
            }

            const result = await fetchFluxImage(cleaned, {
                width: clampDim(opts.width, DEFAULT_WIDTH),
                height: clampDim(opts.height, DEFAULT_HEIGHT),
                seed: opts.seed
            });

            if (guildId) {
                useAI(guildId);
            }

            return result;
        },
        "image",
        { onQueued }
    );
}

function formatImageUserError(error) {
    if (!error) return "❌ Something went wrong generating the image.";
    if (error.code === "AI_DAILY_LIMIT") {
        return limitReachedMessage(error.guildId);
    }
    if (error.code === "IMAGE_NOT_CONFIGURED") {
        return "❌ Image generation is not configured. An admin needs to set `POLLINATIONS_API_KEY`.";
    }
    if (error.code === "IMAGE_AUTH_FAILED") {
        return "❌ Image API authentication failed. Check `POLLINATIONS_API_KEY` on the host.";
    }
    if (error.code === "IMAGE_RATE_LIMIT") {
        return "❌ The image service is rate-limited right now. Try again in a moment.";
    }
    if (error.code === "IMAGE_BAD_PROMPT") {
        return "❌ Please provide a description of the image you want.";
    }
    if (error.code === "IMAGE_EMPTY") {
        return "❌ The image service returned an empty result. Try a different prompt.";
    }
    if (error.code === "IMAGE_TIMEOUT") {
        return "❌ Image generation timed out. Please try again.";
    }
    if (error.code === "IMAGE_TOO_LARGE") {
        return "❌ The image was too large to process. Try a simpler prompt.";
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
