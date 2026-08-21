/**
 * Video generation for OmniBot.
 * Primary: multi-frame Pollinations stills + FFmpeg stitch (real frame changes).
 * Legacy: single Flux still + FFmpeg Ken Burns (kept for emergency fallback).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const {
    fetchFluxImage,
    formatImageUserError
} = require("./imageGen.js");
const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const {
    generateFrameBasedVideo,
    DEFAULT_CONFIG,
    TEST_CONFIG
} = require("./frameVideoGen.js");

const LEGACY_VIDEO_SECONDS = 5;
const LEGACY_FPS = 24;
const LEGACY_WIDTH = 960;
const LEGACY_HEIGHT = 540;

function runFfmpeg(args, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", args, {
            stdio: ["ignore", "pipe", "pipe"]
        });
        let stderr = "";
        const timer = setTimeout(() => {
            try {
                proc.kill("SIGKILL");
            } catch {
                /* ignore */
            }
            const err = new Error("ffmpeg timed out");
            err.code = "VIDEO_FFMPEG_TIMEOUT";
            reject(err);
        }, timeoutMs);

        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 8000) stderr = stderr.slice(-4000);
        });
        proc.on("error", (err) => {
            clearTimeout(timer);
            if (err && err.code === "ENOENT") {
                const e = new Error("ffmpeg is not installed");
                e.code = "VIDEO_FFMPEG_MISSING";
                reject(e);
                return;
            }
            reject(err);
        });
        proc.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else {
                const err = new Error(
                    `ffmpeg exited with code ${code}: ${stderr.slice(-400)}`
                );
                err.code = "VIDEO_FFMPEG_FAILED";
                reject(err);
            }
        });
    });
}

/** @deprecated Legacy single-image zoom — kept for emergency fallback only. */
async function imageBufferToVideo(imageBuffer) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-vid-legacy-"));
    const extGuess = imageBuffer[0] === 0x89 ? "png" : "jpg";
    const inPath = path.join(tmpDir, `still.${extGuess}`);
    const outPath = path.join(tmpDir, "out.mp4");

    try {
        fs.writeFileSync(inPath, imageBuffer);
        const frames = LEGACY_VIDEO_SECONDS * LEGACY_FPS;
        const vf = [
            `scale=${LEGACY_WIDTH}:${LEGACY_HEIGHT}:force_original_aspect_ratio=increase`,
            `crop=${LEGACY_WIDTH}:${LEGACY_HEIGHT}`,
            `zoompan=z='min(zoom+0.0012,1.25)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${LEGACY_WIDTH}x${LEGACY_HEIGHT}:fps=${LEGACY_FPS}`,
            "format=yuv420p"
        ].join(",");

        await runFfmpeg([
            "-y",
            "-loop",
            "1",
            "-i",
            inPath,
            "-t",
            String(LEGACY_VIDEO_SECONDS),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-movflags",
            "+faststart",
            "-an",
            outPath
        ]);

        const buf = fs.readFileSync(outPath);
        if (!buf.length) {
            const err = new Error("Empty video output");
            err.code = "VIDEO_EMPTY";
            throw err;
        }
        return buf;
    } finally {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    }
}

/** @deprecated */
async function generateGuildVideoLegacy(guildId, prompt) {
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
    const { buffer: imageBuffer } = await fetchFluxImage(cleaned, {
        width: 1024,
        height: 1024
    });
    const videoBuffer = await imageBufferToVideo(imageBuffer);
    if (guildId) useAI(guildId);
    return {
        buffer: videoBuffer,
        contentType: "video/mp4",
        durationSeconds: LEGACY_VIDEO_SECONDS,
        mode: "legacy-zoom"
    };
}

/**
 * Primary video entry: real multi-frame AI video.
 */
async function generateGuildVideo(guildId, prompt, options = {}) {
    return generateFrameBasedVideo(guildId, prompt, options);
}

function formatVideoUserError(error) {
    if (!error) return "❌ Something went wrong generating the video.";
    if (error.code === "AI_DAILY_LIMIT") {
        return formatImageUserError(error);
    }
    if (
        error.code === "IMAGE_NOT_CONFIGURED" ||
        error.code === "IMAGE_AUTH_FAILED" ||
        error.code === "IMAGE_RATE_LIMIT" ||
        error.code === "IMAGE_BAD_PROMPT" ||
        error.code === "IMAGE_EMPTY"
    ) {
        return formatImageUserError(error);
    }
    if (error.code === "VIDEO_FFMPEG_MISSING") {
        return "❌ Video generation needs `ffmpeg` on the host. Ask the host admin to install it.";
    }
    if (error.code === "VIDEO_FFMPEG_TIMEOUT") {
        return "❌ Video encoding took too long. Try again with a simpler prompt.";
    }
    if (error.code === "VIDEO_TIMEOUT") {
        return "❌ Video generation timed out. Try a shorter or simpler prompt.";
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
    generateGuildVideoLegacy,
    generateFrameBasedVideo,
    imageBufferToVideo,
    formatVideoUserError,
    getRemaining,
    DAILY_LIMIT,
    VIDEO_SECONDS: DEFAULT_CONFIG.durationSeconds,
    DEFAULT_CONFIG,
    TEST_CONFIG
};
