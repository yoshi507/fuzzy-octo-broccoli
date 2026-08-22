/**
 * Cloudflare Workers AI image generation (REST).
 * Primary: Stable Diffusion XL (clearer subjects, fewer black messes)
 * Fallbacks: SDXL Lightning, Dreamshaper LCM
 */

const TXT2IMG_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const IMG2IMG_MODEL = "@cf/runwayml/stable-diffusion-v1-5-img2img";
const TXT2IMG_FALLBACK_MODEL = "@cf/bytedance/stable-diffusion-xl-lightning";
const TXT2IMG_FALLBACK_MODEL_2 = "@cf/lykon/dreamshaper-8-lcm";

const DEFAULT_WIDTH = 768;
const DEFAULT_HEIGHT = 768;
const MAX_DIM = 1024;
const DEFAULT_IMG2IMG_STRENGTH = 0.35;
const DEFAULT_STEPS = 20;
const DEFAULT_GUIDANCE = 7.5;
const FETCH_TIMEOUT_MS = 120_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_CF_ATTEMPTS = 3;

const DEFAULT_NEGATIVE =
    "blurry, out of focus, low quality, low resolution, jpeg artifacts, noise, grain, " +
    "underexposed, overexposed, pure black, black void, dark mess, silhouette only, " +
    "distorted, deformed, disfigured, mutated, extra limbs, bad anatomy, " +
    "text, watermark, logo, signature, cropped, ugly, duplicate";

function logCf(msg, extra) {
    if (extra !== undefined) console.log(`[CloudflareAI] ${msg}`, extra);
    else console.log(`[CloudflareAI] ${msg}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

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
    const clamped = Math.min(MAX_DIM, Math.max(512, Math.floor(v)));
    return Math.round(clamped / 64) * 64;
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

function classifyHttpError(status, bodyText, retryAfterHdr) {
    const text = String(bodyText || "");
    const lower = text.toLowerCase();

    if (status === 401 || status === 403) {
        const err = new Error(`Cloudflare auth failed (HTTP ${status})`);
        err.code = "CF_AUTH_FAILED";
        err.status = status;
        err.bodyPreview = text.slice(0, 300);
        return err;
    }

    const explicitRate =
        status === 429 ||
        /\b(rate[\s_-]?limit|too many requests|throttl)/i.test(lower);

    if (explicitRate) {
        const err = new Error(`Cloudflare rate limit (HTTP ${status})`);
        err.code = "CF_RATE_LIMIT";
        err.status = status;
        err.retryAfter = retryAfterHdr ? Number(retryAfterHdr) : null;
        err.bodyPreview = text.slice(0, 300);
        return err;
    }

    if (
        status === 503 ||
        /\b(overloaded|capacity|temporarily unavailable|service unavailable)\b/i.test(lower)
    ) {
        const err = new Error(`Cloudflare capacity error (HTTP ${status})`);
        err.code = "CF_CAPACITY";
        err.status = status;
        err.bodyPreview = text.slice(0, 300);
        return err;
    }

    if (
        status === 400 ||
        status === 404 ||
        /\b(model|not found|unknown model|permission|unauthorized|invalid account)\b/i.test(lower)
    ) {
        const err = new Error(`Cloudflare AI HTTP ${status}: ${text.slice(0, 200)}`);
        err.code =
            status === 404 || /not found|unknown model/i.test(lower)
                ? "CF_MODEL_ERROR"
                : "CF_PROVIDER_ERROR";
        err.status = status;
        err.bodyPreview = text.slice(0, 300);
        return err;
    }

    const err = new Error(`Cloudflare AI HTTP ${status}: ${text.slice(0, 200)}`);
    err.code = "CF_PROVIDER_ERROR";
    err.status = status;
    err.bodyPreview = text.slice(0, 300);
    return err;
}

async function parseSuccessResponse(res, contentType) {
    if (contentType.includes("json")) {
        let json;
        try {
            json = await res.json();
        } catch {
            const err = new Error("Cloudflare returned invalid JSON");
            err.code = "CF_PROVIDER_ERROR";
            throw err;
        }

        if (json && json.success === false) {
            const msg =
                json?.errors?.[0]?.message || JSON.stringify(json).slice(0, 200);
            console.error("[CloudflareAI] success=false:", msg);
            throw classifyHttpError(400, msg, null);
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
        const buffer = Buffer.from(
            b64.replace(/^data:image\/\w+;base64,/, ""),
            "base64"
        );
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

async function runWorkersAiOnce(model, body) {
    const accountId = resolveAccountId();
    const token = resolveApiToken();
    if (!accountId || !token) {
        const err = new Error(
            "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured"
        );
        err.code = "CF_NOT_CONFIGURED";
        throw err;
    }

    if (!/^[a-f0-9]{32}$/i.test(accountId)) {
        logCf(
            `WARN account id length=${accountId.length} (expected 32 hex chars from Cloudflare dashboard URL)`
        );
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
        accountId
    )}/ai/run/${model}`;
    logCf(
        `POST model=${model} hasImage=${Boolean(body.image_b64)} ${body.width}x${body.height} steps=${body.num_steps}`
    );

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
    const retryAfterHdr = res.headers.get("retry-after");
    logCf(
        `response status=${status} content-type=${contentType || "unknown"} retryAfter=${retryAfterHdr || "none"}`
    );

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
        throw classifyHttpError(status, bodyText, retryAfterHdr);
    }

    return parseSuccessResponse(res, contentType);
}

async function runWorkersAi(model, body) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_CF_ATTEMPTS; attempt++) {
        try {
            return await runWorkersAiOnce(model, body);
        } catch (err) {
            lastErr = err;
            const retryable =
                err?.code === "CF_RATE_LIMIT" ||
                err?.code === "CF_TIMEOUT" ||
                err?.code === "CF_CAPACITY";
            if (!retryable) throw err;
            if (attempt >= MAX_CF_ATTEMPTS) break;
            const waitSec = Math.min(
                20,
                (err.retryAfter && Number.isFinite(err.retryAfter)
                    ? err.retryAfter
                    : 0) || 2 * attempt
            );
            logCf(
                `attempt ${attempt}/${MAX_CF_ATTEMPTS} failed (${err.code} status=${err.status || "?"}); retrying in ${waitSec}s`
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
        num_steps: Math.min(20, Math.max(8, Number(opts.steps) || DEFAULT_STEPS)),
        guidance: Number(opts.guidance) || DEFAULT_GUIDANCE,
        negative_prompt: String(opts.negativePrompt || DEFAULT_NEGATIVE).slice(0, 800)
    };
    if (opts.seed != null && Number.isFinite(Number(opts.seed))) {
        body.seed = Math.floor(Number(opts.seed));
    }

    const models = [TXT2IMG_MODEL, TXT2IMG_FALLBACK_MODEL, TXT2IMG_FALLBACK_MODEL_2];
    let lastErr;
    for (const model of models) {
        try {
            return await runWorkersAi(model, body);
        } catch (err) {
            lastErr = err;
            if (
                err?.code === "CF_MODEL_ERROR" ||
                err?.status === 404 ||
                err?.code === "CF_PROVIDER_ERROR"
            ) {
                logCf(`model ${model} failed (${err.code || err.status}); trying next`);
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
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

    const width = clampDim(opts.width, 512);
    const height = clampDim(opts.height, 512);
    const strength = clampStrength(
        opts.strength != null ? opts.strength : DEFAULT_IMG2IMG_STRENGTH
    );

    const body = {
        prompt: cleaned,
        width,
        height,
        num_steps: Math.min(20, Math.max(8, Number(opts.steps) || DEFAULT_STEPS)),
        guidance: Number(opts.guidance) || DEFAULT_GUIDANCE,
        strength,
        negative_prompt: String(opts.negativePrompt || DEFAULT_NEGATIVE).slice(0, 800),
        image_b64: Buffer.from(imageBuffer).toString("base64")
    };
    if (opts.seed != null && Number.isFinite(Number(opts.seed))) {
        body.seed = Math.floor(Number(opts.seed));
    }

    logCf(`img2img strength=${strength}`);
    return runWorkersAi(IMG2IMG_MODEL, body);
}

module.exports = {
    MODEL: TXT2IMG_MODEL,
    TXT2IMG_MODEL,
    IMG2IMG_MODEL,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_IMG2IMG_STRENGTH,
    isCloudflareConfigured,
    getCloudflareStatus,
    generateTextToImage,
    generateImageToImage,
    resolveAccountId
};
