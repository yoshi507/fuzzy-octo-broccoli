/**
 * Frame-based video: txt2img frame1 then img2img chain -> FFmpeg stitch.
 * Defaults: 3s / 6 FPS / 18 frames / 512x512.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { fetchFluxImage, fetchImg2Img } = require("./imageGen.js");
const { DEFAULT_IMG2IMG_STRENGTH } = require("./cloudflareImage.js");
const { canUseAI, useAI } = require("./aiLimit.js");

const DEFAULT_CONFIG = {
    durationSeconds: 3,
    fps: 6,
    maxFrames: 18,
    width: 512,
    height: 512,
    maxRetriesPerFrame: 2,
    retryDelayMs: 1500,
    overallTimeoutMs: 15 * 60 * 1000,
    frameProgressEvery: 1,
    maxOutputBytes: 8 * 1024 * 1024,
    ffmpegStitchTimeoutMs: 120000,
    ffmpegConvertTimeoutMs: 30000,
    /** Low = stay close to previous frame (Cloudflare img2img). */
    img2imgStrength: 0.35
};

const liveFfmpeg = new Set();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function logVideo(msg, extra) {
    if (extra !== undefined) console.log(`[VideoGen] ${msg}`, extra);
    else console.log(`[VideoGen] ${msg}`);
}

function killProc(proc, reason) {
    if (!proc || proc.killed || proc.exitCode != null) return;
    const pid = proc.pid;
    logVideo(`killing ffmpeg pid=${pid} reason=${reason} signal=SIGTERM (not SIGINT)`);
    try {
        proc.kill("SIGTERM");
    } catch (e) {
        logVideo(`SIGTERM failed pid=${pid}: ${e?.message || e}`);
    }
    setTimeout(() => {
        if (!proc.killed && proc.exitCode == null) {
            logVideo(`killing ffmpeg pid=${pid} reason=${reason} signal=SIGKILL`);
            try {
                proc.kill("SIGKILL");
            } catch {
                /* ignore */
            }
        }
    }, 2000).unref?.();
}

function killAllFfmpeg(reason = "cleanup") {
    for (const proc of [...liveFfmpeg]) {
        killProc(proc, reason);
        liveFfmpeg.delete(proc);
    }
}

function runFfmpeg(args, timeoutMs = 90000, label = "ffmpeg") {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        logVideo(`starting ${label}`, { timeoutMs, args: args.join(" ") });

        const proc = spawn("ffmpeg", args, {
            stdio: ["ignore", "pipe", "pipe"]
        });
        const pid = proc.pid;
        liveFfmpeg.add(proc);
        logVideo(`ffmpeg PID started pid=${pid} label=${label}`);

        let stderr = "";
        let settled = false;

        const finish = (fn) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            liveFfmpeg.delete(proc);
            fn();
        };

        const timer = setTimeout(() => {
            logVideo(
                `timeout ${timeoutMs}ms label=${label} pid=${pid} - sending SIGTERM/SIGKILL`
            );
            killProc(proc, `timeout:${label}`);
            finish(() => {
                const err = new Error(`ffmpeg timed out (${label})`);
                err.code = "VIDEO_FFMPEG_TIMEOUT";
                err.pid = pid;
                reject(err);
            });
        }, timeoutMs);

        proc.stderr.on("data", (c) => {
            stderr += c.toString();
            if (stderr.length > 8000) stderr = stderr.slice(-4000);
        });
        proc.stdout?.on("data", () => {});

        proc.on("error", (err) => {
            logVideo(`spawn error label=${label}: ${err?.message || err}`);
            finish(() => {
                if (err?.code === "ENOENT") {
                    const e = new Error("ffmpeg is not installed");
                    e.code = "VIDEO_FFMPEG_MISSING";
                    reject(e);
                    return;
                }
                reject(err);
            });
        });

        proc.on("close", (code, signal) => {
            const durationMs = Date.now() - startedAt;
            logVideo(
                `ffmpeg exited label=${label} pid=${pid} code=${code} signal=${signal || "none"} durationMs=${durationMs}`
            );
            if (stderr && (code !== 0 || signal)) {
                console.error(`[VideoGen] ffmpeg stderr tail:\n${stderr.slice(-600)}`);
            }

            finish(() => {
                if (signal === "SIGINT" || code === 130) {
                    logVideo(
                        "SIGINT/130 is external (host/panel). OmniBot does not send SIGINT."
                    );
                    const err = new Error(
                        `ffmpeg interrupted by SIGINT (exit 130) after ${durationMs}ms`
                    );
                    err.code = "VIDEO_FFMPEG_INTERRUPTED";
                    err.exitCode = code;
                    err.signal = signal || "SIGINT";
                    err.stderrTail = stderr.slice(-400);
                    reject(err);
                    return;
                }
                if (signal === "SIGKILL" || code === 137) {
                    const err = new Error(`ffmpeg SIGKILL after ${durationMs}ms`);
                    err.code = "VIDEO_FFMPEG_TIMEOUT";
                    reject(err);
                    return;
                }
                if (signal === "SIGTERM" || code === 143) {
                    const err = new Error(`ffmpeg SIGTERM after ${durationMs}ms`);
                    err.code = "VIDEO_FFMPEG_TIMEOUT";
                    reject(err);
                    return;
                }
                if (code === 0) {
                    resolve();
                    return;
                }
                const err = new Error(
                    `ffmpeg exited code=${code}: ${stderr.slice(-400)}`
                );
                err.code = "VIDEO_FFMPEG_FAILED";
                err.exitCode = code;
                err.stderrTail = stderr.slice(-400);
                reject(err);
            });
        });
    });
}

function buildFramePrompts(userPrompt, frameCount) {
    const base = String(userPrompt || "").trim().slice(0, 280);
    const prompts = [];
    for (let i = 0; i < frameCount; i++) {
        if (i === 0) {
            prompts.push(
                `${base}. Cinematic still, clear composition, no text, no watermark.`
            );
            continue;
        }
        const t = frameCount <= 1 ? 0 : i / (frameCount - 1);
        const pct = Math.round(t * 100);
        let motion;
        if (t < 0.34) {
            motion = "Move the camera slightly forward / begin the action gently.";
        } else if (t < 0.67) {
            motion = "Continue the same camera motion and action slightly further.";
        } else {
            motion = "Continue the motion toward the end of the action.";
        }
        prompts.push(
            `Using the provided image as the reference, preserve the same subject, environment, ` +
                `composition, art style, lighting and colours. ${motion} ` +
                `Subtle change only (${pct}% through the sequence). ` +
                `Scene: ${base}. No text, no watermark.`
        );
    }
    return prompts;
}

async function fetchFrameWithRetry(prompt, opts, maxRetries, retryDelayMs, referenceBuffer) {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logVideo(
                `frame fetch attempt ${attempt}/${maxRetries} mode=${referenceBuffer ? "img2img" : "txt2img"}`
            );
            const result = referenceBuffer
                ? await fetchImg2Img(prompt, referenceBuffer, opts)
                : await fetchFluxImage(prompt, opts);
            if (!result?.buffer?.length) {
                throw Object.assign(new Error("Empty frame"), {
                    code: "IMAGE_EMPTY"
                });
            }
            return result;
        } catch (err) {
            lastErr = err;
            console.error(
                `[VideoGen] frame fetch failed attempt=${attempt}:`,
                err?.code || err?.message || err
            );
            if (
                err?.code === "IMAGE_NOT_CONFIGURED" ||
                err?.code === "IMAGE_AUTH_FAILED" ||
                err?.code === "CF_AUTH_FAILED" ||
                err?.code === "CF_NOT_CONFIGURED"
            ) {
                throw err;
            }
            if (attempt < maxRetries) await sleep(retryDelayMs * attempt);
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
        logVideo(`wrote ${name} (${buffer.length} bytes png)`);
        return filePath;
    }

    const rawPath = path.join(tmpDir, `raw_${index}.img`);
    fs.writeFileSync(rawPath, buffer);
    try {
        await runFfmpeg(
            ["-y", "-i", rawPath, "-frames:v", "1", filePath],
            convertTimeoutMs || 30000,
            `convert-${index + 1}`
        );
        logVideo(`wrote ${name} via convert (${buffer.length} bytes source)`);
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
    const missing = [];
    for (let i = 1; i <= frameCount; i++) {
        const name = `frame_${String(i).padStart(4, "0")}.png`;
        if (!fs.existsSync(path.join(framesDir, name))) missing.push(name);
    }
    if (missing.length) {
        const err = new Error(`Missing frames: ${missing.join(", ")}`);
        err.code = "VIDEO_MISSING_FRAME";
        throw err;
    }

    const pattern = path.join(framesDir, "frame_%04d.png");
    logVideo(`stitch ${frameCount} frames @ ${fps}fps`);
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
        stitchTimeoutMs || 120000,
        "stitch"
    );

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
        const err = new Error("FFmpeg produced empty MP4");
        err.code = "VIDEO_EMPTY";
        throw err;
    }
    logVideo(`stitch OK size=${fs.statSync(outPath).size}`);
}

function cleanupDir(dir) {
    try {
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            logVideo(`cleaned ${dir}`);
        }
    } catch (e) {
        console.error(`[VideoGen] cleanup error: ${e?.message || e}`);
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

    const cfg = { ...DEFAULT_CONFIG, ...(options.config || {}) };
    let frameCount = Math.max(
        2,
        Math.round(Number(cfg.durationSeconds) * Number(cfg.fps))
    );
    frameCount = Math.min(frameCount, Number(cfg.maxFrames) || 18);
    const fps = Number(cfg.fps) || 6;
    const onProgress =
        typeof options.onProgress === "function" ? options.onProgress : null;

    const jobStarted = Date.now();
    logVideo(
        `job start guild=${guildId || "n/a"} frames=${frameCount} fps=${fps} ${cfg.width}x${cfg.height}`
    );

    const framePrompts = buildFramePrompts(cleaned, frameCount);
    const seed = Math.floor(Math.random() * 2147483646) + 1;
    const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `omni-vid-${process.pid}-`)
    );
    const outPath = path.join(tmpDir, "out.mp4");
    logVideo(`temp ${tmpDir}`);

    let completed = 0;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        logVideo("overall timeout - stopping");
        killAllFfmpeg("overall-timeout");
    }, cfg.overallTimeoutMs);
    timeoutId.unref?.();

    try {
        if (onProgress) {
            try {
                await onProgress(0, frameCount);
            } catch {
                /* ignore */
            }
        }

        let previousBuffer = null;
        const strength =
            cfg.img2imgStrength != null
                ? Number(cfg.img2imgStrength)
                : DEFAULT_IMG2IMG_STRENGTH;

        for (let i = 0; i < framePrompts.length; i++) {
            if (timedOut) {
                const err = new Error("Video generation timed out");
                err.code = "VIDEO_TIMEOUT";
                throw err;
            }

            logVideo(
                `frame ${i + 1}/${frameCount} ${previousBuffer ? "img2img" : "txt2img"} strength=${strength}`
            );
            const { buffer } = await fetchFrameWithRetry(
                framePrompts[i],
                {
                    width: cfg.width,
                    height: cfg.height,
                    seed,
                    strength
                },
                cfg.maxRetriesPerFrame,
                cfg.retryDelayMs,
                previousBuffer
            );
            await writeFrameFile(tmpDir, i, buffer, cfg.ffmpegConvertTimeoutMs);
            previousBuffer = buffer;
            completed++;
            if (onProgress) {
                try {
                    await onProgress(completed, frameCount);
                } catch {
                    /* ignore */
                }
            }
            await sleep(100);
        }

        logVideo("frames ready - stitch");
        await stitchFramesToMp4(
            tmpDir,
            frameCount,
            fps,
            outPath,
            cfg.ffmpegStitchTimeoutMs
        );

        const stat = fs.statSync(outPath);
        if (stat.size > cfg.maxOutputBytes) {
            const err = new Error("Video too large");
            err.code = "VIDEO_TOO_LARGE";
            throw err;
        }

        const videoBuffer = fs.readFileSync(outPath);
        logVideo(
            `job OK frames=${frameCount} bytes=${videoBuffer.length} ms=${Date.now() - jobStarted}`
        );
        if (guildId) useAI(guildId);

        return {
            buffer: videoBuffer,
            contentType: "video/mp4",
            durationSeconds: frameCount / fps,
            frameCount,
            fps,
            mode: "frames"
        };
    } catch (err) {
        console.error(
            `[VideoGen] job FAIL ms=${Date.now() - jobStarted} code=${err?.code} msg=${err?.message}`
        );
        if (err?.stderrTail) {
            console.error(`[VideoGen] stderr: ${err.stderrTail}`);
        }
        killAllFfmpeg("job-error");
        throw err;
    } finally {
        clearTimeout(timeoutId);
        killAllFfmpeg("finally");
        cleanupDir(tmpDir);
        logVideo(`cleanup done totalMs=${Date.now() - jobStarted}`);
    }
}

module.exports = {
    generateFrameBasedVideo,
    buildFramePrompts,
    stitchFramesToMp4,
    DEFAULT_CONFIG,
    killAllFfmpeg
};
