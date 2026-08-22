/**
 * AI image generation - Cloudflare Workers AI only.
 * ONE job at a time via generationQueue.
 */

const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const {
    enqueueGeneration,
    QUEUE_WAIT_MESSAGE
} = require("./generationQueue.js");
const {
    isCloudflareConfigured,
    getCloudflareStatus,
    generateTextToImage: cfTextToImage,
    generateImageToImage: cfImageToImage,
    DEFAULT_IMG2IMG_STRENGTH
} = require("./cloudflareImage.js");

const MODEL = "cloudflare-dreamshaper";
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const MAX_DIM = 512;

function logImg(msg, extra) {
    if (extra !== undefined) console.log(`[ImageGen] ${msg}`, extra);
    else console.log(`[ImageGen] ${msg}`);
}

function clampDim(n, fallback) {
    const v = Number(n) || fallback;
    return Math.min(MAX_DIM, Math.max(256, Math.floor(v)));
}

let providerStatusLogged = false;
function logProviderStatusOnce() {
    if (providerStatusLogged) return;
    providerStatusLogged = true;
    const cf = getCloudflareStatus();
    logImg(
        `provider cloudflare=${cf.configured ? "yes" : "no"}` +
            ` (accountId=${cf.hasAccountId ? "set len=" + cf.accountIdLen : "MISSING"},` +
            ` token=${cf.hasToken ? "set len=" + cf.tokenLen : "MISSING"})`
    );
    if (!cf.configured) {
        logImg(
            "HINT: set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN on the host, then fully restart"
        );
    }
}

/** Text-to-image via Cloudflare. Name kept for compatibility. */
async function fetchFluxImage(prompt, opts = {}) {
    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    if (!isCloudflareConfigured()) {
        const err = new Error(
            "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured"
        );
        err.code = "IMAGE_NOT_CONFIGURED";
        throw err;
    }

    const width = clampDim(opts.width, DEFAULT_WIDTH);
    const height = clampDim(opts.height, DEFAULT_HEIGHT);

    logImg("Cloudflare Workers AI text-to-image");
    return cfTextToImage(cleaned, {
        width,
        height,
        seed: opts.seed,
        steps: opts.steps,
        guidance: opts.guidance,
        negativePrompt: opts.negativePrompt
    });
}

/** Image-to-image via Cloudflare (video frame chain). */
async function fetchImg2Img(prompt, referenceBuffer, opts = {}) {
    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    if (!isCloudflareConfigured()) {
        const err = new Error(
            "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured"
        );
        err.code = "IMAGE_NOT_CONFIGURED";
        throw err;
    }

    if (!referenceBuffer?.length) {
        logImg("img2img missing reference - falling back to text-to-image");
        return fetchFluxImage(cleaned, opts);
    }

    logImg("Cloudflare Workers AI img2img");
    return cfImageToImage(cleaned, referenceBuffer, {
        width: clampDim(opts.width, DEFAULT_WIDTH),
        height: clampDim(opts.height, DEFAULT_HEIGHT),
        strength:
            opts.strength != null ? opts.strength : DEFAULT_IMG2IMG_STRENGTH,
        seed: opts.seed,
        steps: opts.steps,
        guidance: opts.guidance,
        negativePrompt: opts.negativePrompt
    });
}

async function generateGuildImage(guildId, prompt, opts = {}) {
    logProviderStatusOnce();

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

    if (!isCloudflareConfigured()) {
        const err = new Error(
            "No image provider configured (set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)"
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
                `queued job done guild=${guildId || "n/a"} provider=${result.provider || "cloudflare"}`
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
    if (
        error.code === "IMAGE_NOT_CONFIGURED" ||
        error.code === "CF_NOT_CONFIGURED"
    ) {
        return "❌ Image generation is not configured. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` on the host, then restart OmniBot.";
    }
    if (error.code === "IMAGE_AUTH_FAILED" || error.code === "CF_AUTH_FAILED") {
        return "❌ Cloudflare authentication failed. Check `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (token needs Workers AI Edit permission).";
    }
    if (error.code === "IMAGE_RATE_LIMIT" || error.code === "CF_RATE_LIMIT") {
        return "❌ Cloudflare is rate-limiting requests right now. Wait about a minute and try one image again.";
    }
    if (error.code === "CF_CAPACITY") {
        return "❌ Cloudflare Workers AI is temporarily at capacity. Please try again in a moment.";
    }
    if (error.code === "CF_MODEL_ERROR") {
        return "❌ Cloudflare rejected the image model request. Check that Workers AI is enabled on the account and the API token has Workers AI permissions.";
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
    if (error.code === "CF_PROVIDER_ERROR" || error.code === "CF_NETWORK") {
        return "❌ Cloudflare image generation failed. Please try again.";
    }
    return "❌ Image generation failed. Please try again.";
}

module.exports = {
    MODEL,
    generateGuildImage,
    fetchFluxImage,
    fetchImg2Img,
    formatImageUserError,
    getRemaining,
    DAILY_LIMIT,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    QUEUE_WAIT_MESSAGE,
    isCloudflareConfigured
};
