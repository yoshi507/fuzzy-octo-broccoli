/**
 * Cloudflare Workers AI image generation (REST).
 * Model: @cf/runwayml/stable-diffusion-v1-5-img2img
 *
 * Credentials (never log values):
 *   CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID)
 *   CLOUDFLARE_API_TOKEN (or CF_API_TOKEN / CLOUDFLARE_TOKEN)
 */

const MODEL = "@cf/runwayml/stable-diffusion-v1-5-img2img";
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const MAX_DIM = 512;
/** Low strength keeps successive video frames close to the previous scene. */
const DEFAULT_IMG2IMG_STRENGTH = 0.35;
const DEFAULT_STEPS = 15;
const DEFAULT_GUIDANCE = 7.5;
const FETCH_TIMEOUT_MS = 120_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function logCf(msg, extra) {
    if (extra !== undefined) console.log(`[CloudflareAI] ${msg}`, extra);
    else console.log(`[CloudflareAI] ${msg}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

const MAX_CF_ATTEMPTS = 3;

function pickEnv(...names) {
    for (const name of names) {
        const raw = process.env[name];
        if (raw == null) continue;
        const v = String(raw).trim().replace(/^["']|["']$/g, "");
        if (v) return v;
    }
    return null;
}

function resolveAccountId() {
    return pickEnv(
        "CLOUDFLARE_ACCOUNT_ID",
        "CF_ACCOUNT_ID",
        "CF_ACCOUNT",
        "CLOUDFLARE_ACCOUNT"
    );
}

function resolveApiToken() {
    return pickEnv(
        "CLOUDFLARE_API_TOKEN",
        "CF_API_TOKEN",
        "CLOUDFLARE_TOKEN",
        "CF_TOKEN",
        "CLOUDFLARE_API_KEY",
        "CF_API_KEY"
    );
}

function isCloudflareConfigured() {
    return Boolean(resolveAccountId() && resolveApiToken());
}

/** Safe status for logs - never prints secrets. */
function getCloudflareStatus() {
    const account = resolveAccountId();
    const token = resolveApiToken();
    return {
        configured: Boolean(account && token),
        hasAccountId: Boolean(account),
        hasToken: Boolean(token),
        accountIdLen: account ? account.length : 0,
        tokenLen: token ? token.length : 0
    };
}

function clampDim(n, fallback) {
    const v = Number(n) || fallback;
    return Math.min(MAX_DIM, Math.max(256, Math.floor(v)));
}

function clampStrength(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return DEFAULT_IMG2IMG_STRENGTH;
    return Math.min(1, Math.max(0.05, v));
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
    return false;
}

async function runWorkersAiOnce(body) {
    const accountId = resolveAccountId();
    const token = resolveApiToken();
    if (!accountId || !token) {
        const err = new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured");
        err.code = "CF_NOT_CONFIGURED";
        throw err;
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
    logCf(`POST model=${MODEL} hasImage=${Boolean(body.image_b64)} ${body.width}x${body.height}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "image/*,application/json"
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (e) {
        clearTimeout(timer);
        if (e?.name === "AbortError") {
            const err = new Error("Cloudflare AI request timed out");
            err.code = "CF_TIMEOUT";
            throw err;
        }
        const err = new Error(`Cloudflare AI network error: ${e?.message || e}`);
        err.code = "CF_NETWORK";
        err.cause = e;
        throw err;
    } finally {
        clearTimeout(timer);
    }

    const status = res.status;
    const contentType = (res.headers.get("content-type") || "").split(";")[0];
    logCf(`response status=${status} content-type=${contentType || "unknown"}`);

    if (!res.ok) {
        let bodyText = "";
        try {
            bodyText = await res.text();
        } catch {
            /* ignore */
        }
        console.error(
            `[CloudflareAI] HTTP ${status}:`,
            String(bodyText).slice(0, 500)
        );

        if (status === 401 || status === 403) {
            const err = new Error(`Cloudflare auth failed (HTTP ${status})`);
            err.code = "CF_AUTH_FAILED";
            err.status = status;
            throw err;
        }
        const lower = String(bodyText).toLowerCase();
        const looksLimited =
            status === 429 ||
            status === 503 ||
            /rate.?limit|too many requests|quota|capacity|throttl|neuron/i.test(lower);
        if (looksLimited) {
            const retryAfter = res.headers.get("retry-after");
            const err = new Error(`Cloudflare rate/capacity limit (HTTP ${status})`);
            err.code = "CF_RATE_LIMIT";
            err.status = status;
            err.retryAfter = retryAfter ? Number(retryAfter) : null;
            err.bodyPreview = String(bodyText).slice(0, 200);
            throw err;
        }
        const err = new Error(
            `Cloudflare AI HTTP ${status}: ${String(bodyText).slice(0, 200)}`
        );
        err.code = "CF_PROVIDER_ERROR";
        err.status = status;
        throw err;
    }

    if (contentType.includes("json")) {
        let json;
        try {
            json = await res.json();
        } catch (e) {
            const err = new Error("Cloudflare returned invalid JSON");
            err.code = "CF_PROVIDER_ERROR";
            throw err;
        }
        const b64 =
            (typeof json?.result === "string" && json.result) ||
            json?.result?.image ||
            json?.image ||
            null;
        if (!b64 || typeof b64 !== "string") {
            console.error(
                "[CloudflareAI] unexpected JSON:",
                JSON.stringify(json).slice(0, 300)
            );
            const err = new Error("Cloudflare JSON response missing image data");
            err.code = "CF_PROVIDER_ERROR";
            throw err;
        }
        const buffer = Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ""), "base64");
        if (!looksLikeImage(buffer)) {
            const err = new Error("Cloudflare JSON did not contain a valid image");
            err.code = "CF_PROVIDER_ERROR";
            throw err;
        }
        logCf(`OK json-image ${buffer.length} bytes`);
        return { buffer, contentType: "image/png", provider: "cloudflare" };
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) {
        const err = new Error(`Cloudflare image too large (${ab.byteLength})`);
        err.code = "CF_TOO_LARGE";
        throw err;
    }
    const buffer = Buffer.from(ab);
    if (!buffer.length || !looksLikeImage(buffer)) {
        const preview = buffer.toString("utf8", 0, 200);
        console.error("[CloudflareAI] non-image body preview:", preview);
        const err = new Error("Cloudflare returned non-image data");
        err.code = "CF_PROVIDER_ERROR";
        throw err;
    }

    let ct = contentType || "image/png";
    if (buffer[0] === 0x89 && buffer[1] === 0x50) ct = "image/png";
    else if (buffer[0] === 0xff && buffer[1] === 0xd8) ct = "image/jpeg";

    logCf(`OK binary-image ${ct} ${buffer.length} bytes`);
    return { buffer, contentType: ct, provider: "cloudflare" };
}

async function runWorkersAi(body) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_CF_ATTEMPTS; attempt++) {
        try {
            return await runWorkersAiOnce(body);
        } catch (err) {
            lastErr = err;
            if (err?.code !== "CF_RATE_LIMIT" && err?.code !== "CF_TIMEOUT") throw err;
            if (attempt >= MAX_CF_ATTEMPTS) break;
            const waitSec = Math.min(
                30,
                (err.retryAfter && Number.isFinite(err.retryAfter) ? err.retryAfter : 0) ||
                    2 * attempt
            );
            logCf(
                `attempt ${attempt}/${MAX_CF_ATTEMPTS} failed (${err.code}); retrying in ${waitSec}s`
            );
            await sleep(waitSec * 1000);
        }
    }
    throw lastErr;
}

async function generateTextToImage(prompt, opts = {}) {
    const cleaned = String(prompt || "").trim().slice(0, 1000);
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }

    const width = clampDim(opts.width, DEFAULT_WIDTH);
    const height = clampDim(opts.height, DEFAULT_HEIGHT);
    const body = {
        prompt: cleaned,
        width,
        height,
        num_steps: Math.min(20, Math.max(1, Number(opts.steps) || DEFAULT_STEPS)),
        guidance: Number(opts.guidance) || DEFAULT_GUIDANCE
    };
    if (opts.seed != null && Number.isFinite(Number(opts.seed))) {
        body.seed = Math.floor(Number(opts.seed));
    }
    if (opts.negativePrompt) {
        body.negative_prompt = String(opts.negativePrompt).slice(0, 500);
    }

    return runWorkersAi(body);
}

async function generateImageToImage(prompt, imageBuffer, opts = {}) {
    const cleaned = String(prompt || "").trim().slice(0, 1000);
    if (!cleaned) {
        const err = new Error("Prompt is required");
        err.code = "IMAGE_BAD_PROMPT";
        throw err;
    }
    if (!imageBuffer || !imageBuffer.length) {
        const err = new Error("Reference image required for img2img");
        err.code = "CF_MISSING_IMAGE";
        throw err;
    }

    const width = clampDim(opts.width, DEFAULT_WIDTH);
    const height = clampDim(opts.height, DEFAULT_HEIGHT);
    const strength = clampStrength(
        opts.strength != null ? opts.strength : DEFAULT_IMG2IMG_STRENGTH
    );

    const body = {
        prompt: cleaned,
        width,
        height,
        num_steps: Math.min(20, Math.max(1, Number(opts.steps) || DEFAULT_STEPS)),
        guidance: Number(opts.guidance) || DEFAULT_GUIDANCE,
        strength,
        image_b64: Buffer.from(imageBuffer).toString("base64")
    };
    if (opts.seed != null && Number.isFinite(Number(opts.seed))) {
        body.seed = Math.floor(Number(opts.seed));
    }
    if (opts.negativePrompt) {
        body.negative_prompt = String(opts.negativePrompt).slice(0, 500);
    }

    logCf(`img2img strength=${strength}`);
    return runWorkersAi(body);
}

module.exports = {
    MODEL,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_IMG2IMG_STRENGTH,
    isCloudflareConfigured,
    getCloudflareStatus,
    generateTextToImage,
    generateImageToImage,
    resolveAccountId
};
