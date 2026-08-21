/**
 * Frame-based AI video generation.
 * Pollinations generates sequential stills; FFmpeg only stitches them into MP4.
 * Does NOT use FFmpeg zoom/pan on a single image.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { fetchFluxImage } = require("./imageGen.js");
const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");

/** Internal defaults (tunable without changing Discord UX). */
const DEFAULT_CONFIG = {
    durationSeconds: 5,
    fps: 12,
    width: 768,
    height: 768,
    concurrency: 2,
    maxRetriesPerFrame: 3,
    retryDelayMs: 1200,
    overallTimeoutMs: 12 * 60 * 1000,
    frameProgressEvery: 3
};

const TEST_CONFIG = {
    durationSeconds: 3,
    fps: 12,
    width: 512,
    height: 512,
    concurrency: 2,
    maxRetriesPerFrame: 3,
    retryDelayMs: 1000,
    overallTimeoutMs: 8 * 60 * 1000,
    frameProgressEvery: 2
};

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function runFfmpeg(args, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
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
            if (stderr.length > 10000) stderr = stderr.slice(-5000);
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

/**
 * Build a motion plan: same scene, progressive action.
 * Frame prompts are NOT shown to users.
 */
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
        else if (t < 0.4) stage = "early in the motion, slight progression from the start";
        else if (t < 0.6) stage = "mid-action, clearly progressed from earlier frames";
        else if (t < 0.8) stage = "later in the motion, near the climax of the action";
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
                throw Object.assign(new Error("Empty frame"), { code: "IMAGE_EMPTY" });
            }
            return result;
        } catch (err) {
            lastErr = err;
            if (err?.code === "IMAGE_NOT_CONFIGURED" || err?.code === "IMAGE_AUTH_FAILED") {
                throw err;
            }
            if (attempt < maxRetries) {
                await sleep(retryDelayMs * attempt);
            }
        }
    }
    throw lastErr || new Error("Frame generation failed");
}

async function mapPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;

    async function run() {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
        }
    }

    const runners = [];
    const n = Math.min(concurrency, items.length);
    for (let r = 0; r < n; r++) runners.push(run());
    await Promise.all(runners);
    return results;
}

async function stitchFramesToMp4(framesDir, frameCount, fps, outPath) {
    for (let i = 1; i <= frameCount; i++) {
        const name = `frame_${String(i).padStart(4, "0")}.png`;
        const fp = path.join(framesDir, name);
        if (!fs.existsSync(fp)) {
            const err = new Error(`Missing frame file ${name}`);
            err.code = "VIDEO_MISSING_FRAME";
            throw err;
        }
    }

    const pattern = path.join(framesDir, "frame_%04d.png");
    await runFfmpeg([
        "-y",
        "-framerate",
        String(fps),
        "-i",
        pattern,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        outPath
    ]);
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

/**
 * Generate a multi-frame AI video.
 */
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

    const frameCount = Math.max(
        2,
        Math.round(Number(cfg.durationSeconds) * Number(cfg.fps))
    );
    const fps = Number(cfg.fps) || 12;
    const onProgress =
        typeof options.onProgress === "function" ? options.onProgress : null;

    const framePrompts = buildFramePrompts(cleaned, frameCount);
    const seed = Math.floor(Math.random() * 2147483646) + 1;

    const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `omni-frames-${Date.now()}-`)
    );
    const outPath = path.join(tmpDir, "out.mp4");

    const started = Date.now();
    let completed = 0;
    let lastProgressAt = 0;

    const reportProgress = async (force = false) => {
        if (!onProgress) return;
        const now = Date.now();
        if (
            !force &&
            completed < frameCount &&
            now - lastProgressAt < 2500 &&
            completed % cfg.frameProgressEvery !== 0
        ) {
            return;
        }
        lastProgressAt = now;
        try {
            await onProgress(completed, frameCount);
        } catch {
            /* ignore Discord edit failures */
        }
    };

    try {
        await reportProgress(true);

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                const err = new Error("Video generation timed out");
                err.code = "VIDEO_TIMEOUT";
                reject(err);
            }, cfg.overallTimeoutMs);
        });

        const work = (async () => {
            await mapPool(framePrompts, cfg.concurrency, async (framePrompt, index) => {
                if (Date.now() - started > cfg.overallTimeoutMs) {
                    const err = new Error("Video generation timed out");
                    err.code = "VIDEO_TIMEOUT";
                    throw err;
                }

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

                const name = `frame_${String(index + 1).padStart(4, "0")}.png`;
                const filePath = path.join(tmpDir, name);
                const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
                if (isPng) {
                    fs.writeFileSync(filePath, buffer);
                } else {
                    const jpgPath = path.join(tmpDir, `raw_${index}.jpg`);
                    fs.writeFileSync(jpgPath, buffer);
                    await runFfmpeg([
                        "-y",
                        "-i",
                        jpgPath,
                        "-frames:v",
                        "1",
                        filePath
                    ]);
                    try {
                        fs.unlinkSync(jpgPath);
                    } catch {
                        /* ignore */
                    }
                }

                completed += 1;
                await reportProgress(false);
            });

            await reportProgress(true);
            await stitchFramesToMp4(tmpDir, frameCount, fps, outPath);

            const videoBuffer = fs.readFileSync(outPath);
            if (!videoBuffer.length) {
                const err = new Error("Empty video output");
                err.code = "VIDEO_EMPTY";
                throw err;
            }

            if (guildId) {
                useAI(guildId);
            }

            return {
                buffer: videoBuffer,
                contentType: "video/mp4",
                durationSeconds: cfg.durationSeconds,
                frameCount,
                fps,
                mode: "frames"
            };
        })();

        return await Promise.race([work, timeoutPromise]);
    } finally {
        cleanupDir(tmpDir);
    }
}

module.exports = {
    generateFrameBasedVideo,
    buildFramePrompts,
    stitchFramesToMp4,
    DEFAULT_CONFIG,
    TEST_CONFIG
};
