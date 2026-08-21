/**
 * Pollinations image generation (Flux only).
 * Uses the shared per-server AI daily limit.
 */

const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const { limitReachedMessage } = require("./groq.js");

const MODEL = "flux";
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

function resolveApiKey() {
    const raw =
        process.env.POLLINATIONS_API_KEY ||
        process.env.POLLINATIONS_KEY ||
        process.env.POLLINATIONS_TOKEN ||
        "";
    return String(raw).trim().replace(/^["']|["']$/g, "") || null;
}

/**
 * Build Pollinations image URL for Flux.
 */
function buildImageUrl(prompt, opts = {}) {
    const encoded = encodeURIComponent(String(prompt).trim().slice(0, 500));
    const width = Math.min(1280, Math.max(256, Number(opts.width) || DEFAULT_WIDTH));
    const height = Math.min(1280, Math.max(256, Number(opts.height) || DEFAULT_HEIGHT));
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

/**
 * Fetch image bytes from Pollinations (Flux only).
 */
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

    let res;
    try {
        res = await fetch(url, { headers, redirect: "follow" });
    } catch (e) {
        const err = new Error("Image provider request failed");
        err.code = "IMAGE_PROVIDER_ERROR";
        err.cause = e;
        throw err;
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

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (!buffer.length) {
        const err = new Error("Empty image response");
        err.code = "IMAGE_EMPTY";
        throw err;
    }
    return { buffer, contentType };
}

/**
 * Generate a Flux image for a guild, consuming one AI request on success.
 */
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

    const result = await fetchFluxImage(cleaned, opts);

    if (guildId) {
        useAI(guildId);
    }

    return result;
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
    return "❌ Image generation failed. Please try again.";
}

module.exports = {
    MODEL,
    generateGuildImage,
    fetchFluxImage,
    formatImageUserError,
    resolveApiKey,
    getRemaining,
    DAILY_LIMIT
};
