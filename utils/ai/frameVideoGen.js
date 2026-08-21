/**
 * Frame-based AI video generation (resource-safe).
 * Pollinations → disk frames (one at a time) → FFmpeg stitch only.
 * No Ken Burns / single-image zoom.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { fetchFluxImage } = require("./imageGen.js");
const { canUseAI, useAI } = require("./aiLimit.js");

/** Max 36 frames, 512², sequential — protects low-RAM hosts. */
const DEFAULT_CONFIG = {
    durationSeconds: 3,
    fps: 12,
    maxFrames: 36,
    width: 512,
    height: 512,
    concurrency: 1,
    maxRetriesPerFrame: 2,
    retryDelayMs: 1500,
    overallTimeoutMs: 10 * 60 * 1000,
    frameProgressEvery: 2,
    maxOutputBytes: 8 * 1024 * 1024
};

const TEST_CONFIG = {
    durationSeconds: 2,
    fps: 12,
    maxFrames: 24,
    width: 512,
    height: 512,
    concurrency: 1,
    maxRetriesPerFrame: 2,
    retryDelayMs: 1000,
    overallTimeoutMs: 6 * 60 * 1000,
    frameProgressEvery: 2,
    maxOutputBytes: 8 * 1024 * 1024
};

const liveFfmpeg = new Set();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function killAllFfmpeg() {
    for (const proc of liveFfmpeg) {
        try {
            if (!proc.killed) proc.kill("SIGKILL");
        } catch {
            /* ignore */
        }
    }
    liveFfmpeg.clear();
}

function runFfmpeg(args, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", args, {
            stdio: ["ignore", "ignore", "pipe"]
        });
        liveFfmpeg.add(proc);

        let stderr = "";
        const timer = setTimeout(() => {
            try {
                if (!proc.killed) proc.kill("SIGKILL");
            } catch {
                /* ignore */
            }
            const err = new Error("ffmpeg timed out");
            err.code = "VIDEO_FFMPEG_TIMEOUT";
            reject(err);
        }, timeoutMs);

        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 4000) stderr = stderr.slice(-2000);
        });
        proc.on("error", (err) => {
            clearTimeout(timer);
            liveFfmpeg.delete(proc);
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
            liveFfmpeg.delete(proc);
            if (code === 0) resolve();
            else {
                const err = new Error(
                    `ffmpeg exited with code ${code}: ${stderr.slice(-300)}`
                );
                err.code = "VIDEO_FFMPEG_FAILED";
                reject(err);
            }
        });
    });
}

function buildFramePrompts(userPrompt, frameCount) {
    const base = String(userPrompt || "").trim().slice(0, 280);
    const consistency =
        "consistent characters, same subject, same environment, same art style, " +
        "same lighting, same composition, cinematic still from a continuous animation, " +
        "no text, no watermark, no logo";

    const prompts = [];
    for (let i = 0; i < frameCount; i++) {
        const t = frameCount <= 1 ? 0 : i / (frameCount - 1);
        const pct = Math.round(t * 100);
        let stage;
        if (t < 0.2) stage = "at the very start of the action, beginning pose";
        else if (t < 0.4)
            stage = "early in the motion, slight progression from the start";
        else if (t < 0.6)
            stage = "mid-action, clearly progressed from earlier frames";
        else if (t < 0.8)
            stage = "later in the motion, near the climax of the action";
        else stage = "near the end of the action, final pose of the sequence";

        prompts.push(
            `${base}. Animation frame ${i + 1} of ${frameCount} (${pct}% through). ` +
                `${stage}. ${consistency}. ` +
                `Seamless continuation of the previous frame, only natural movement between frames.`
        );
    }
    return prompts;
}

async function fetchFrameWithRetry(prompt, opts, maxRetries, retryDelayMs) {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await fetchFluxImage(prompt, opts);
            if (!result?.buffer?.length) {
                throw Object.assign(new Error("Empty frame"), {
                    code: "IMAGE_EMPTY"
                });
            }
            return result;
        } catch (err) {
            lastErr = err;
            if (
                err?.code === "IMAGE_NOT_CONFIGURED" ||
                err?.code === "IMAGE_AUTH_FAILED"
            ) {
                throw err;
            }
            if (attempt < maxRetries) {
                await sleep(retryDelayMs * attempt);
            }
        }
    }
    throw lastErr || new Error("Frame generation failed");
}

async function writeFrameFile(tmpDir, index, buffer) {
    const name = `frame_${String(index + 1).padStart(4, "0")}.png`;
    const filePath = path.join(tmpDir, name);
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;

    if (isPng) {
        fs.writeFileSync(filePath, buffer);
        return filePath;
    }

    const rawPath = path.join(tmpDir, `raw_${index}.img`);
    fs.writeFileSync(rawPath, buffer);
    try {
        await runFfmpeg(
            ["-y", "-i", rawPath, "-frames:v", "1", filePath],
            30000
        );
    } finally {
        try {
            fs.unlinkSync(rawPath);
        } catch {
            /* ignore */
        }
    }
    return filePath;
}

async function stitchFramesToMp4(framesDir, frameCount, fps, outPath) {
    for (let i = 1; i <= frameCount; i++) {
        const name = `frame_${String(i).padStart(4, "0")}.png`;
        if (!fs.existsSync(path.join(framesDir, name))) {
            const err = new Error(`Missing frame file ${name}`);
            err.code = "VIDEO_MISSING_FRAME";
            throw err;
        }
    }

    const pattern = path.join(framesDir, "frame_%04d.png");
    await runFfmpeg(
        [
            "-y",
            "-framerate",
            String(fps),
            "-i",
            pattern,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            outPath
        ],
        120000
    );
}

function cleanupDir(dir) {
    try {
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    } catch {
        /* ignore */
    }
}

async function generateFrameBasedVideo(guildId, prompt, options = {}) {
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

    const cfg = {
        ...DEFAULT_CONFIG,
        ...(options.testMode ? TEST_CONFIG : {}),
        ...(options.config || {})
    };

    let frameCount = Math.max(
        2,
        Math.round(Number(cfg.durationSeconds) * Number(cfg.fps))
    );
    frameCount = Math.min(frameCount, Number(cfg.maxFrames) || 36);

    const fps = Number(cfg.fps) || 12;
    const onProgress =
        typeof options.onProgress === "function" ? options.onProgress : null;

    const framePrompts = buildFramePrompts(cleaned, frameCount);
    const seed = Math.floor(Math.random() * 2147483646) + 1;

    const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `omni-frames-${process.pid}-${Date.now()}-`)
    );
    const outPath = path.join(tmpDir, "out.mp4");

    const started = Date.now();
    let completed = 0;
    let lastProgressAt = 0;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
        timedOut = true;
        killAllFfmpeg();
    }, cfg.overallTimeoutMs);

    const reportProgress = async (force = false) => {
        if (!onProgress) return;
        const now = Date.now();
        if (
            !force &&
            completed < frameCount &&
            now - lastProgressAt < 3000 &&
            completed % cfg.frameProgressEvery !== 0
        ) {
            return;
        }
        lastProgressAt = now;
        try {
            await onProgress(completed, frameCount);
        } catch {
            /* ignore */
        }
    };

    try {
        await reportProgress(true);

        for (let index = 0; index < framePrompts.length; index++) {
            if (timedOut || Date.now() - started > cfg.overallTimeoutMs) {
                const err = new Error("Video generation timed out");
                err.code = "VIDEO_TIMEOUT";
                throw err;
            }

            const framePrompt = framePrompts[index];
            const { buffer } = await fetchFrameWithRetry(
                framePrompt,
                {
                    width: cfg.width,
                    height: cfg.height,
                    seed
                },
                cfg.maxRetriesPerFrame,
                cfg.retryDelayMs
            );

            try {
                await writeFrameFile(tmpDir, index, buffer);
            } finally {
                /* buffer goes out of scope */
            }

            completed += 1;
            await reportProgress(false);
            await sleep(50);
        }

        await reportProgress(true);

        if (timedOut) {
            const err = new Error("Video generation timed out");
            err.code = "VIDEO_TIMEOUT";
            throw err;
        }

        await stitchFramesToMp4(tmpDir, frameCount, fps, outPath);

        const stat = fs.statSync(outPath);
        if (!stat.size) {
            const err = new Error("Empty video output");
            err.code = "VIDEO_EMPTY";
            throw err;
        }
        if (stat.size > cfg.maxOutputBytes) {
            const err = new Error("Video file too large for Discord");
            err.code = "VIDEO_TOO_LARGE";
            throw err;
        }

        const videoBuffer = fs.readFileSync(outPath);

        if (guildId) {
            useAI(guildId);
        }

        return {
            buffer: videoBuffer,
            contentType: "video/mp4",
            durationSeconds: frameCount / fps,
            frameCount,
            fps,
            mode: "frames"
        };
    } catch (err) {
        killAllFfmpeg();
        throw err;
    } finally {
        clearTimeout(timeoutId);
        killAllFfmpeg();
        cleanupDir(tmpDir);
    }
}

module.exports = {
    generateFrameBasedVideo,
    buildFramePrompts,
    stitchFramesToMp4,
    DEFAULT_CONFIG,
    TEST_CONFIG,
    killAllFfmpeg
};
