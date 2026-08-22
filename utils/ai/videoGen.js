/**
 * Video generation entry — queued, one job at a time.
 */
const { formatImageUserError } = require("./imageGen.js");
const { getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const {
    generateFrameBasedVideo,
    DEFAULT_CONFIG
} = require("./frameVideoGen.js");
const {
    enqueueGeneration,
    QUEUE_WAIT_MESSAGE
} = require("./generationQueue.js");

async function generateGuildVideo(guildId, prompt, options = {}) {
    return enqueueGeneration(
        () =>
            generateFrameBasedVideo(guildId, prompt, {
                onProgress: options.onProgress,
                config: options.config
            }),
        "video",
        { onQueued: options.onQueued }
    );
}

function formatVideoUserError(error) {
    if (!error) return "❌ Something went wrong generating the video.";
    if (error.code === "AI_DAILY_LIMIT") return formatImageUserError(error);
    if (
        error.code === "IMAGE_NOT_CONFIGURED" ||
        error.code === "IMAGE_AUTH_FAILED" ||
        error.code === "IMAGE_RATE_LIMIT" ||
        error.code === "IMAGE_BAD_PROMPT" ||
        error.code === "IMAGE_EMPTY" ||
        error.code === "IMAGE_TIMEOUT" ||
        error.code === "IMAGE_TOO_LARGE" ||
        error.code === "IMAGE_PROVIDER_ERROR" ||
        error.code === "CF_NOT_CONFIGURED" ||
        error.code === "CF_AUTH_FAILED" ||
        error.code === "CF_RATE_LIMIT" ||
        error.code === "CF_TIMEOUT" ||
        error.code === "CF_PROVIDER_ERROR" ||
        error.code === "CF_NETWORK"
    ) {
        return formatImageUserError(error);
    }
    if (error.code === "VIDEO_FFMPEG_MISSING") {
        return "❌ Video generation needs `ffmpeg` on the host.";
    }
    if (
        error.code === "VIDEO_FFMPEG_TIMEOUT" ||
        error.code === "VIDEO_TIMEOUT"
    ) {
        return "❌ Video generation timed out. Please try again.";
    }
    if (error.code === "VIDEO_FFMPEG_INTERRUPTED") {
        return "❌ Video encoding was interrupted by the host (resource limit). Try again later.";
    }
    if (error.code === "VIDEO_TOO_LARGE") {
        return "❌ The generated video was too large to upload.";
    }
    if (
        error.code === "VIDEO_FFMPEG_FAILED" ||
        error.code === "VIDEO_EMPTY" ||
        error.code === "VIDEO_MISSING_FRAME"
    ) {
        return "❌ Video encoding failed. Please try again.";
    }
    return "❌ Video generation failed. Please try again.";
}

module.exports = {
    generateGuildVideo,
    generateFrameBasedVideo,
    formatVideoUserError,
    getRemaining,
    DAILY_LIMIT,
    VIDEO_SECONDS: DEFAULT_CONFIG.durationSeconds,
    DEFAULT_CONFIG,
    QUEUE_WAIT_MESSAGE
};
