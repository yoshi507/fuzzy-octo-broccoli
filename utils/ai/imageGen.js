/**
 * AI image generation - Cloudflare Workers AI primary, Pollinations fallback.
 * ONE job at a time via generationQueue.
 */

const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const {
    enqueueGeneration,
    QUEUE_WAIT_MESSAGE
} = require("./generationQueue.js");
const {
    isCloudflareConfigured,
    generateTextToImage: cfTextToImage,
    generateImageToImage: cfImageToImage,
    DEFAULT_IMG2IMG_STRENGTH
} = require("./cloudflareImage.js");

const MODEL = "cloudflare-sd15 / pollinations-flux";
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const MAX_DIM = 512;
const FETCH_TIMEOUT_MS = 90_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function logImg(msg, extra) {
    if (extra !== undefined) console.log(`[ImageGen] ${msg}`, extra);
    else console.log(`[ImageGen] ${msg}`);
}

function resolvePollinationsKey() {
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

function buildPollinationsUrl(prompt, opts = {}) {
    const encoded = encodeURIComponent(String(prompt).trim().slice(0, 400));
    const width = clampDim(opts.width, DEFAULT_WIDTH);
    const height = clampDim(opts.height, DEFAULT_HEIGHT);
    const params = new URLSearchParams({
        model: "flux",
        width: String(width),
        height: String(height),
        nologo: "true",
        enhance: "false"
    });
    if (opts.seed != null && Number.isFinite(Number(opts.seed))) {
        params.set("seed", String(Math.floor(Number(opts.seed))));
    }
    const key = resolvePollinationsKey();
    if (key) params.set("key", key);
    return `https://gen.pollinations.ai/image/${encoded}?${params.toString()}`;
}

async function fetchPollinationsImage(prompt, opts = {}) {
    const key = resolvePollinationsKey();
    if (!key) {
        const err = new Error("POLLINATIONS_API_KEY is not configured");
        err.code = "IMAGE_NOT_CONFIGURED";
        throw err;
    }

    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    const url = buildPollinationsUrl(cleaned, opts);
    const safeUrl = url.replace(/([?&]key=)[^&]+/i, "$1***");
    logImg(`pollinations request ${safeUrl}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${key}`,
                Accept: "image/*,application/json"
            },
            redirect: "follow",
            signal: controller.signal
        });
    } catch (e) {
        clearTimeout(timer);
        if (e?.name === "AbortError") {
            const err = new Error("Image request timed out");
            err.code = "IMAGE_TIMEOUT";
            throw err;
        }
        const err = new Error(`Image provider request failed: ${e?.message || e}`);
        err.code = "IMAGE_PROVIDER_ERROR";
        err.cause = e;
        throw err;
    } finally {
        clearTimeout(timer);
    }

    const status = res.status;
    logImg(`pollinations status=${status}`);

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
        if (status === 402) {
            const err = new Error(`Pollinations insufficient balance (HTTP 402)`);
            err.code = "IMAGE_PAYMENT_REQUIRED";
            err.status = 402;
            throw err;
        }
        const err = new Error(
            `Pollinations HTTP ${status}: ${String(bodyText).slice(0, 200)}`
        );
        err.code = "IMAGE_PROVIDER_ERROR";
        err.status = status;
        throw err;
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) {
        const err = new Error("Image response too large");
        err.code = "IMAGE_TOO_LARGE";
        throw err;
    }
    const buffer = Buffer.from(ab);
    if (!buffer.length || !looksLikeImage(buffer)) {
        const err = new Error("Pollinations returned non-image data");
        err.code = "IMAGE_PROVIDER_ERROR";
        throw err;
    }

    let ct = "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50) ct = "image/png";
    else if (buffer[0] === 0xff && buffer[1] === 0xd8) ct = "image/jpeg";
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) ct = "image/webp";

    logImg(`pollinations OK ${ct} ${buffer.length} bytes`);
    return { buffer, contentType: ct, provider: "pollinations" };
}

async function fetchFluxImage(prompt, opts = {}) {
    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    const width = clampDim(opts.width, DEFAULT_WIDTH);
    const height = clampDim(opts.height, DEFAULT_HEIGHT);

    if (isCloudflareConfigured()) {
        try {
            logImg("trying Cloudflare Workers AI (text-to-image)");
            const result = await cfTextToImage(cleaned, {
                width,
                height,
                seed: opts.seed,
                steps: opts.steps,
                guidance: opts.guidance,
                negativePrompt: opts.negativePrompt
            });
            return result;
        } catch (err) {
            console.error(
                "[ImageGen] Cloudflare failed, will try Pollinations fallback:",
                err?.code || err?.message || err
            );
        }
    } else {
        logImg("Cloudflare not configured - using Pollinations if available");
    }

    return fetchPollinationsImage(cleaned, { width, height, seed: opts.seed });
}

async function fetchImg2Img(prompt, referenceBuffer, opts = {}) {
    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    if (isCloudflareConfigured() && referenceBuffer?.length) {
        try {
            logImg("trying Cloudflare img2img");
            return await cfImageToImage(cleaned, referenceBuffer, {
                width: clampDim(opts.width, DEFAULT_WIDTH),
                height: clampDim(opts.height, DEFAULT_HEIGHT),
                strength:
                    opts.strength != null
                        ? opts.strength
                        : DEFAULT_IMG2IMG_STRENGTH,
                seed: opts.seed,
                steps: opts.steps,
                guidance: opts.guidance,
                negativePrompt: opts.negativePrompt
            });
        } catch (err) {
            console.error(
                "[ImageGen] Cloudflare img2img failed:",
                err?.code || err?.message || err
            );
        }
    }

    logImg("img2img fallback -> text-to-image (no reference)");
    return fetchFluxImage(cleaned, opts);
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

    if (!isCloudflareConfigured() && !resolvePollinationsKey()) {
        const err = new Error(
            "No image provider configured (set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN or POLLINATIONS_API_KEY)"
        );
        err.code = "IMAGE_NOT_CONFIGURED";
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
            logImg(
                `queued job done guild=${guildId || "n/a"} provider=${result.provider || "?"}`
            );
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
    if (error.code === "IMAGE_NOT_CONFIGURED" || error.code === "CF_NOT_CONFIGURED") {
        return "❌ Image generation is not configured. Set `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (or `POLLINATIONS_API_KEY` as fallback).";
    }
    if (error.code === "IMAGE_AUTH_FAILED" || error.code === "CF_AUTH_FAILED") {
        return "❌ Image API authentication failed. Check Cloudflare / Pollinations credentials on the host.";
    }
    if (error.code === "IMAGE_RATE_LIMIT" || error.code === "CF_RATE_LIMIT") {
        return "❌ The image service is rate-limited. Try again in a moment.";
    }
    if (error.code === "IMAGE_PAYMENT_REQUIRED") {
        return "❌ Image generation is unavailable: the Pollinations account has **no remaining balance (pollen)**. Prefer Cloudflare Workers AI (`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`), or top up Pollinations.";
    }
    if (error.code === "IMAGE_BAD_PROMPT") {
        return "❌ Please provide a description of the image you want.";
    }
    if (error.code === "IMAGE_EMPTY") {
        return "❌ The image service returned an empty result.";
    }
    if (error.code === "IMAGE_TIMEOUT" || error.code === "CF_TIMEOUT") {
        return "❌ Image generation timed out. Please try again.";
    }
    if (error.code === "IMAGE_TOO_LARGE" || error.code === "CF_TOO_LARGE") {
        return "❌ The image was too large to process.";
    }
    return "❌ Image generation failed. Please try again.";
}

const resolveApiKey = resolvePollinationsKey;

module.exports = {
    MODEL,
    generateGuildImage,
    fetchFluxImage,
    fetchImg2Img,
    fetchPollinationsImage,
    formatImageUserError,
    resolveApiKey,
    getRemaining,
    DAILY_LIMIT,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    QUEUE_WAIT_MESSAGE,
    isCloudflareConfigured
};
