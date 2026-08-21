/**
 * Frame-based AI video generation (resource-safe).
 * Pollinations → disk frames (one at a time) → FFmpeg stitch only.
 *
 * Exit code 130 = 128+2 = SIGINT (interrupt). Our intentional kills use SIGTERM/SIGKILL.
 * If FFmpeg exits 130, the host/panel interrupted it — not our timeout path.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { fetchFluxImage } = require("./imageGen.js");
const { canUseAI, useAI } = require("./aiLimit.js");

const DEFAULT_CONFIG = {
    durationSeconds: 2,
    fps: 12,
    maxFrames: 24,
    width: 512,
    height: 512,
    concurrency: 1,
    maxRetriesPerFrame: 2,
    retryDelayMs: 1500,
    overallTimeoutMs: 12 * 60 * 1000,
    frameProgressEvery: 2,
    maxOutputBytes: 8 * 1024 * 1024,
    ffmpegStitchTimeoutMs: 180000,
    ffmpegConvertTimeoutMs: 45000
};

const TEST_CONFIG = {
    durationSeconds: 2,
    fps: 12,
    maxFrames: 12,
    width: 512,
    height: 512,
    concurrency: 1,
    maxRetriesPerFrame: 2,
    retryDelayMs: 1000,
    overallTimeoutMs: 6 * 60 * 1000,
    frameProgressEvery: 2,
    maxOutputBytes: 8 * 1024 * 1024,
    ffmpegStitchTimeoutMs: 120000,
    ffmpegConvertTimeoutMs: 30000
};

const liveFfmpeg = new Set();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function logVideo(msg, extra) {
    if (extra !== undefined) {
        console.log(`[VideoGen] ${msg}`, extra);
    } else {
        console.log(`[VideoGen] ${msg}`);
    }
}

function killAllFfmpeg(reason = "cleanup") {
    for (const entry of [...liveFfmpeg]) {
        const { proc, pid, label } = entry;
        try {
            if (proc && !proc.killed && pid) {
                logVideo(
                    `sending SIGTERM to ffmpeg pid=${pid} label=${label} reason=${reason} (not SIGINT)`
                );
                try {
                    process.kill(-pid, "SIGTERM");
                } catch {
                    try {
                        proc.kill("SIGTERM");
                    } catch {
                        /* ignore */
                    }
                }
                setTimeout(() => {
                    try {
                        if (!proc.killed) {
                            logVideo(
                                `sending SIGKILL to ffmpeg pid=${pid} label=${label} reason=${reason}`
                            );
                            try {
                                process.kill(-pid, "SIGKILL");
                            } catch {
                                try {
                                    proc.kill("SIGKILL");
                                } catch {
                                    /* ignore */
                                }
                            }
                        }
                    } catch {
                        /* ignore */
                    }
                }, 1500).unref?.();
            }
        } catch (e) {
            logVideo(`kill failed pid=${pid}: ${e?.message || e}`);
        }
        liveFfmpeg.delete(entry);
    }
}

function runFfmpeg(args, timeoutMs = 90000, label = "ffmpeg") {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const safeArgs = args.map((a) => String(a));
        logVideo(`starting ${label}`, {
            timeoutMs,
            args: safeArgs.join(" ")
        });

        const proc = spawn("ffmpeg", args, {
            stdio: ["ignore", "ignore", "pipe"],
            detached: process.platform !== "win32"
        });

        const pid = proc.pid || null;
        const entry = { proc, pid, label };
        liveFfmpeg.add(entry);

        logVideo(`ffmpeg PID started pid=${pid} label=${label}`);

        let stderr = "";
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            logVideo(
                `timeout after ${timeoutMs}ms — our code killing ffmpeg pid=${pid} with SIGTERM/SIGKILL (not SIGINT)`
            );
            try {
                if (pid) {
                    try {
                        process.kill(-pid, "SIGTERM");
                    } catch {
                        proc.kill("SIGTERM");
                    }
                }
            } catch {
                /* ignore */
            }
            setTimeout(() => {
                try {
                    if (!proc.killed && pid) {
                        try {
                            process.kill(-pid, "SIGKILL");
                        } catch {
                            proc.kill("SIGKILL");
                        }
                    }
                } catch {
                    /* ignore */
                }
            }, 1500).unref?.();

            const err = new Error("ffmpeg timed out");
            err.code = "VIDEO_FFMPEG_TIMEOUT";
            err.pid = pid;
            err.label = label;
            settled = true;
            liveFfmpeg.delete(entry);
            reject(err);
        }, timeoutMs);

        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 6000) stderr = stderr.slice(-3000);
        });

        proc.on("error", (err) => {
            clearTimeout(timer);
            liveFfmpeg.delete(entry);
            if (settled) return;
            settled = true;
            logVideo(`spawn error label=${label} pid=${pid}: ${err?.message || err}`);
            if (err && err.code === "ENOENT") {
                const e = new Error("ffmpeg is not installed");
                e.code = "VIDEO_FFMPEG_MISSING";
                reject(e);
                return;
            }
            reject(err);
        });

        proc.on("close", (code, signal) => {
            clearTimeout(timer);
            liveFfmpeg.delete(entry);
            const durationMs = Date.now() - startedAt;
            logVideo(
                `ffmpeg exited label=${label} pid=${pid} code=${code} signal=${signal || "none"} durationMs=${durationMs}`
            );

            if (settled) return;
            settled = true;

            if (signal === "SIGINT" || code === 130) {
                logVideo(
                    `SIGINT detected (exit 130). This is NOT sent by OmniBot video code. ` +
                        `Likely: host/panel stop, process manager, or process-group interrupt during heavy CPU.`
                );
                const err = new Error(
                    `ffmpeg interrupted by SIGINT (exit 130) after ${durationMs}ms`
                );
                err.code = "VIDEO_FFMPEG_INTERRUPTED";
                err.exitCode = code;
                err.signal = signal || "SIGINT";
                err.pid = pid;
                err.stderrTail = stderr.slice(-400);
                reject(err);
                return;
            }

            if (signal === "SIGKILL" || code === 137) {
                const err = new Error(
                    `ffmpeg killed (SIGKILL/137) after ${durationMs}ms — timeout or cleanup`
                );
                err.code = "VIDEO_FFMPEG_TIMEOUT";
                err.exitCode = code;
                err.signal = signal || "SIGKILL";
                reject(err);
                return;
            }

            if (signal === "SIGTERM" || code === 143) {
                const err = new Error(
                    `ffmpeg terminated (SIGTERM) after ${durationMs}ms`
                );
                err.code = "VIDEO_FFMPEG_TIMEOUT";
                err.exitCode = code;
                err.signal = signal || "SIGTERM";
                reject(err);
                return;
            }

            if (code === 0) {
                resolve();
                return;
            }

            const err = new Error(
                `ffmpeg exited with code ${code}: ${stderr.slice(-400)}`
            );
            err.code = "VIDEO_FFMPEG_FAILED";
            err.exitCode = code;
            err.signal = signal || null;
            err.stderrTail = stderr.slice(-400);
            reject(err);
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

async function writeFrameFile(tmpDir, index, buffer, convertTimeoutMs) {
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
            convertTimeoutMs || 45000,
            `convert-frame-${index + 1}`
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

async function stitchFramesToMp4(
    framesDir,
    frameCount,
    fps,
    outPath,
    stitchTimeoutMs
) {
    for (let i = 1; i <= frameCount; i++) {
        const name = `frame_${String(i).padStart(4, "0")}.png`;
        if (!fs.existsSync(path.join(framesDir, name))) {
            const err = new Error(`Missing frame file ${name}`);
            err.code = "VIDEO_MISSING_FRAME";
            throw err;
        }
    }

    const pattern = path.join(framesDir, "frame_%04d.png");
    logVideo(
        `stitching ${frameCount} frames @ ${fps}fps → ${path.basename(outPath)}`
    );
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
        stitchTimeoutMs || 180000,
        "stitch"
    );
}

function cleanupDir(dir) {
    try {
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            logVideo(`cleaned temp dir ${dir}`);
        }
    } catch (e) {
        logVideo(`cleanup failed: ${e?.message || e}`);
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
    frameCount = Math.min(frameCount, Number(cfg.maxFrames) || 24);

    const fps = Number(cfg.fps) || 12;
    const onProgress =
        typeof options.onProgress === "function" ? options.onProgress : null;

    const jobStarted = Date.now();
    logVideo(
        `job start guild=${guildId || "n/a"} frames=${frameCount} fps=${fps} size=${cfg.width}x${cfg.height} overallTimeoutMs=${cfg.overallTimeoutMs}`
    );

    const framePrompts = buildFramePrompts(cleaned, frameCount);
    const seed = Math.floor(Math.random() * 2147483646) + 1;

    const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `omni-frames-${process.pid}-${Date.now()}-`)
    );
    const outPath = path.join(tmpDir, "out.mp4");
    logVideo(`temp dir ${tmpDir}`);

    let completed = 0;
    let lastProgressAt = 0;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
        timedOut = true;
        logVideo(
            `overall generation timeout (${cfg.overallTimeoutMs}ms) — killing ffmpeg children`
        );
        killAllFfmpeg("overall-timeout");
    }, cfg.overallTimeoutMs);
    if (typeof timeoutId.unref === "function") timeoutId.unref();

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
            if (timedOut || Date.now() - jobStarted > cfg.overallTimeoutMs) {
                const err = new Error("Video generation timed out");
                err.code = "VIDEO_TIMEOUT";
                throw err;
            }

            logVideo(`frame ${index + 1}/${frameCount} generating…`);
            const { buffer } = await fetchFrameWithRetry(
                framePrompts[index],
                {
                    width: cfg.width,
                    height: cfg.height,
                    seed
                },
                cfg.maxRetriesPerFrame,
                cfg.retryDelayMs
            );

            await writeFrameFile(
                tmpDir,
                index,
                buffer,
                cfg.ffmpegConvertTimeoutMs
            );
            completed += 1;
            logVideo(`frame ${completed}/${frameCount} written`);
            await reportProgress(false);
            await sleep(50);
        }

        await reportProgress(true);

        if (timedOut) {
            const err = new Error("Video generation timed out");
            err.code = "VIDEO_TIMEOUT";
            throw err;
        }

        logVideo("all frames ready — starting FFmpeg stitch");
        await stitchFramesToMp4(
            tmpDir,
            frameCount,
            fps,
            outPath,
            cfg.ffmpegStitchTimeoutMs
        );

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
        const durationMs = Date.now() - jobStarted;
        logVideo(
            `job success frames=${frameCount} bytes=${videoBuffer.length} durationMs=${durationMs}`
        );

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
        logVideo(
            `job failed after ${Date.now() - jobStarted}ms: code=${err?.code || "n/a"} msg=${err?.message || err}`
        );
        killAllFfmpeg("job-error");
        throw err;
    } finally {
        clearTimeout(timeoutId);
        killAllFfmpeg("finally");
        cleanupDir(tmpDir);
        logVideo(`cleanup complete totalMs=${Date.now() - jobStarted}`);
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
