/**
 * AI image generation — Home Mode API only (no Cloudflare).
 * ONE job at a time via generationQueue with hard timeouts.
 */

const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const {
    enqueueGeneration,
    QUEUE_WAIT_MESSAGE
} = require("./generationQueue.js");
const {
    isHomeModeConfigured,
    getHomeModeStatus,
    generateHomeModeImage
} = require("./homeModeImage.js");
const { enhanceImagePrompt } = require("./promptEnhance.js");

const MODEL = "home-mode";
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const MAX_DIM = 1024;
const JOB_TIMEOUT_MS = 55_000;

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
    const hm = getHomeModeStatus();
    logImg(
        `provider homemode=${hm.configured ? "yes" : "no"}` +
            ` path=${hm.path || "n/a"}`
    );
    if (!hm.configured) {
        logImg(
            "HINT: set HOME_MODE_API_URL + HOME_MODE_API_KEY on the host, then fully restart"
        );
    }
}

function isImageGenerationConfigured() {
    return isHomeModeConfigured();
}

async function fetchFluxImage(prompt, opts = {}) {
    const cleaned = String(prompt || "").trim();
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    if (!isHomeModeConfigured()) {
        const err = new Error(
            "HOME_MODE_API_URL / HOME_MODE_API_KEY not configured"
        );
        err.code = "IMAGE_NOT_CONFIGURED";
        throw err;
    }

    const enhanced = enhanceImagePrompt(cleaned);
    if (enhanced !== cleaned) {
        logImg(`prompt enhanced (${cleaned.length} -> ${enhanced.length} chars)`);
    }

    const width = clampDim(opts.width, DEFAULT_WIDTH);
    const height = clampDim(opts.height, DEFAULT_HEIGHT);

    logImg("Home Mode image API");
    return generateHomeModeImage(enhanced, {
        width,
        height,
        seed: opts.seed,
        steps: opts.steps,
        guidance: opts.guidance,
        negativePrompt: opts.negativePrompt
    });
}

/** img2img not available without Cloudflare */
async function fetchImg2Img(prompt, referenceBuffer, opts = {}) {
    logImg("img2img not available — falling back to text-to-image");
    return fetchFluxImage(prompt, opts);
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

    if (!isHomeModeConfigured()) {
        const err = new Error(
            "No image provider configured (set HOME_MODE_API_URL + HOME_MODE_API_KEY)"
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
                `queued job done guild=${guildId || "n/a"} provider=${result.provider || "homemode"}`
            );
            return result;
        },
        "image",
        { onQueued: opts.onQueued, timeoutMs: JOB_TIMEOUT_MS }
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
    if (error.code === "TIMEOUT") {
        return "❌ Image generation took too long and was cancelled. Check that your Home Mode API is online and reachable from the bot host.";
    }
    if (error.code === "IMAGE_NOT_CONFIGURED") {
        return "❌ Image generation is not configured. Set `HOME_MODE_API_URL` and `HOME_MODE_API_KEY` on the host, then restart OmniBot.";
    }
    if (error.code === "IMAGE_AUTH_FAILED") {
        return "❌ Home Mode API key was rejected. Check `HOME_MODE_API_KEY`.";
    }
    if (error.code === "IMAGE_RATE_LIMIT") {
        return "❌ The image service is rate-limiting requests. Wait a minute and try again.";
    }
    if (error.code === "IMAGE_BAD_PROMPT") {
        return "❌ Please provide a description of the image you want.";
    }
    if (error.code === "IMAGE_TIMEOUT") {
        return "❌ Image generation timed out. Check your Home Mode API is responding.";
    }
    if (error.code === "IMAGE_NETWORK" || error.code === "IMAGE_PROVIDER_ERROR") {
        return "❌ Could not reach the Home Mode image API. Check `HOME_MODE_API_URL` and that the service is running.";
    }
    if (error.code === "IMAGE_BAD_RESPONSE") {
        return "❌ Home Mode API returned an unexpected response (no image data).";
    }
    return "❌ Image generation failed. Please try again.";
}

module.exports = {
    isImageGenerationConfigured,
    getHomeModeStatus,
    MODEL,
    generateGuildImage,
    fetchFluxImage,
    fetchImg2Img,
    formatImageUserError,
    getRemaining,
    DAILY_LIMIT,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    QUEUE_WAIT_MESSAGE
};
