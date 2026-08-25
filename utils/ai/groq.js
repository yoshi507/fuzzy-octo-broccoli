const Groq = require("groq-sdk");
const {
    canUseAI,
    useAI,
    getRemaining,
    getUsage,
    DAILY_LIMIT
} = require("./aiLimit.js");
const { buildSystemPrompt, DEFAULT_BASE_PROMPT } = require("../persona/store.js");

// Prefer current Groq production chat models (see console.groq.com/docs/models).
// Older llama-*/gemma* ids are often decommissioned and return model_not_found.
const PRIMARY_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const FALLBACK_MODELS = [
    PRIMARY_MODEL,
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b"
].filter((v, i, a) => v && a.indexOf(v) === i);

const MODEL = PRIMARY_MODEL;

let groqClient = null;
let groqClientKeyFingerprint = null;

function resolveGroqApiKey() {
    const raw =
        process.env.GROQ_API_KEY ||
        process.env.GROQ_KEY ||
        process.env.GROQ_TOKEN ||
        "";
    // Strip quotes, whitespace, and accidental "Bearer " prefix from host env UIs
    let key = String(raw).trim().replace(/^["']|["']$/g, "");
    if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, "").trim();
    // Remove zero-width / BOM characters that sometimes get pasted into panels
    key = key.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    return key || null;
}

function getGroqClient() {
    const key = resolveGroqApiKey();
    if (!key) return null;
    if (groqClient && groqClientKeyFingerprint === key.slice(0, 8) + ":" + key.length) {
        return groqClient;
    }
    groqClient = new Groq({ apiKey: key });
    groqClientKeyFingerprint = key.slice(0, 8) + ":" + key.length;
    return groqClient;
}

function limitReachedMessage(guildId) {
    const remaining = guildId ? getRemaining(guildId) : 0;
    const usage = guildId ? getUsage(guildId) : null;
    const resetHint = usage?.resetsAt
        ? ` AI allowance resets <t:${Math.floor(new Date(usage.resetsAt).getTime() / 1000)}:R>.`
        : " AI allowance resets daily.";
    return (
        "⚠️ This server has reached its daily AI limit (" +
        DAILY_LIMIT +
        " requests)." +
        resetHint +
        (remaining === 0 ? "" : ` Remaining: ${remaining}.`)
    );
}

function globalLimitReachedMessage() {
    return "Sorry — the global AI limit has been reached. Please try again later.";
}

function extractProviderError(apiError) {
    const status =
        apiError?.status ??
        apiError?.statusCode ??
        apiError?.response?.status ??
        null;
    const body = apiError?.error || apiError?.response?.data?.error || null;
    const code = body?.code || apiError?.code || null;
    const type = body?.type || apiError?.type || null;
    const message = String(
        body?.message || apiError?.message || apiError || "Unknown provider error"
    );
    return { status, code, type, message };
}

function isProviderRateLimitError(error) {
    const info = extractProviderError(error);
    if (info.status === 429) return true;
    const msg = info.message.toLowerCase();
    if (/rate limit|quota|tokens per day|tpm|rpm|insufficient_quota|too many requests/.test(msg)) {
        return true;
    }
    if (info.code === "rate_limit_exceeded") return true;
    return false;
}

function isNetworkError(error) {
    const msg = String(error?.message || error || "");
    const code = String(error?.code || error?.cause?.code || "");
    return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(msg + " " + code);
}

function isAuthError(error) {
    const info = extractProviderError(error);
    if (info.status === 401 || info.status === 403) return true;
    const msg = info.message.toLowerCase();
    return /invalid api key|incorrect api key|authentication|unauthorized|forbidden/.test(msg);
}

function isModelError(error) {
    const info = extractProviderError(error);
    const msg = info.message.toLowerCase();
    if (/max_tokens|max_completion|temperature|invalid parameter|unsupported parameter/.test(msg)) {
        return false;
    }
    return (
        info.code === "model_not_found" ||
        /model_not_found|model does not exist|unknown model|decommissioned|no longer available|model_decommissioned/.test(
            msg
        )
    );
}

function isGlobalLimitError(error) {
    if (!error) return false;
    if (error.code === "AI_GLOBAL_LIMIT") return true;
    return isProviderRateLimitError(error);
}

function isLimitError(error) {
    if (!error) return false;
    return (
        error.code === "AI_DAILY_LIMIT" ||
        error.code === "AI_GLOBAL_LIMIT" ||
        isProviderRateLimitError(error)
    );
}

function formatAiUserError(error) {
    if (!error) return "❌ Something went wrong with AI.";
    if (error.code === "AI_DAILY_LIMIT") {
        return limitReachedMessage(error.guildId);
    }
    if (isGlobalLimitError(error) || error.code === "AI_GLOBAL_LIMIT") {
        return globalLimitReachedMessage();
    }
    if (error.code === "AI_NOT_CONFIGURED") {
        return "❌ AI is not configured on this bot yet. An admin needs to set `GROQ_API_KEY`.";
    }
    if (error.code === "AI_AUTH_FAILED") {
        return "❌ AI authentication failed. The Groq API key looks invalid or expired — update `GROQ_API_KEY` on the host.";
    }
    if (error.code === "AI_MODEL_FAILED") {
        return "❌ The configured AI model is unavailable. Try again later or set `GROQ_MODEL` to a supported Groq model.";
    }
    if (error.code === "AI_EMPTY_RESPONSE") {
        return "❌ Omni didn't return a response.";
    }
    if (error.code === "AI_PROVIDER_ERROR") {
        return "❌ The AI service is temporarily unavailable. Try again in a moment.";
    }
    if (error.code === "AI_NETWORK" || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket/i.test(String(error?.message || ""))) {
        return "❌ Could not reach the AI service (network error). Check the host can access api.groq.com and try again.";
    }
    return "❌ Something went wrong with AI. Please try again.";
}

async function replyAiError(interaction, error, guildId) {
    try {
        if (guildId && !error.guildId) {
            error.guildId = guildId;
        }
        const msg = formatAiUserError(error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(msg);
        } else {
            await interaction.reply({ content: msg, ephemeral: true });
        }
    } catch (replyErr) {
        console.error("Failed to send AI error reply:", replyErr?.message || replyErr);
    }
}

function sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages
        .filter((m) => m && typeof m === "object")
        .map((m) => ({
            role: m.role === "assistant" || m.role === "system" ? m.role : "user",
            content: String(m.content ?? "").slice(0, 120000)
        }))
        .filter((m) => m.content.trim().length > 0);
}

async function createCompletion(client, model, messages, options) {
    const maxTokens = Math.min(8000, Math.max(64, Number(options.maxTokens) || 1000));
    const payload = {
        model,
        messages,
        temperature: options.temperature ?? 0.7
    };
    if (String(model).startsWith("openai/") || String(model).includes("gpt-oss")) {
        payload.max_completion_tokens = maxTokens;
    } else {
        payload.max_tokens = maxTokens;
    }
    try {
        return await client.chat.completions.create(payload);
    } catch (err) {
        const msg = String(err?.message || err || "");
        if (/max_tokens|max_completion/i.test(msg)) {
            delete payload.max_tokens;
            delete payload.max_completion_tokens;
            if (/max_completion/i.test(msg)) {
                payload.max_tokens = maxTokens;
            } else {
                payload.max_completion_tokens = maxTokens;
            }
            return client.chat.completions.create(payload);
        }
        throw err;
    }
}

async function askAI(messages, options = {}) {
    const guildId = options.guildId;

    if (guildId && !canUseAI(guildId)) {
        const error = new Error("AI daily limit reached");
        error.code = "AI_DAILY_LIMIT";
        error.guildId = guildId;
        throw error;
    }

    const key = resolveGroqApiKey();
    if (!key) {
        console.error("[AI] GROQ_API_KEY is missing or empty");
        const error = new Error("GROQ_API_KEY is not configured");
        error.code = "AI_NOT_CONFIGURED";
        throw error;
    }

    let finalMessages = sanitizeMessages(
        Array.isArray(messages) ? messages.map((m) => ({ ...m })) : []
    );
    if (guildId && options.applyPersona !== false) {
        const personaPrompt = buildSystemPrompt(guildId, DEFAULT_BASE_PROMPT);
        const marker = "=== SERVER PERSONALITY";
        if (finalMessages.length && finalMessages[0].role === "system") {
            const existing = String(finalMessages[0].content || "");
            if (!existing.includes(marker)) {
                finalMessages[0] = {
                    role: "system",
                    content: (personaPrompt + "\n\n" + existing).slice(0, 120000)
                };
            }
        } else {
            finalMessages = [
                { role: "system", content: String(personaPrompt).slice(0, 120000) },
                ...finalMessages
            ];
        }
    }

    if (!finalMessages.length) {
        const error = new Error("Empty AI request");
        error.code = "AI_PROVIDER_ERROR";
        throw error;
    }

    const client = getGroqClient();
    if (!client) {
        const error = new Error("GROQ_API_KEY is not configured");
        error.code = "AI_NOT_CONFIGURED";
        throw error;
    }

    const modelsToTry =
        options.model && !FALLBACK_MODELS.includes(options.model)
            ? [options.model, ...FALLBACK_MODELS]
            : FALLBACK_MODELS;

    let completion = null;
    let lastError = null;

    for (const model of modelsToTry) {
        try {
            completion = await createCompletion(client, model, finalMessages, options);
            if (model !== PRIMARY_MODEL) {
                console.warn(`[AI] Primary model failed earlier; succeeded with fallback model=${model}`);
            }
            lastError = null;
            break;
        } catch (apiError) {
            lastError = apiError;
            const info = extractProviderError(apiError);
            console.error(
                `[AI] Groq error model=${model} status=${info.status || "n/a"} code=${info.code || "n/a"}: ${info.message}`
            );

            if (isAuthError(apiError)) {
                const k = resolveGroqApiKey();
                console.error(
                    "[AI] Groq rejected the API key (HTTP 401/403). " +
                        `Key present=${Boolean(k)} len=${k ? k.length : 0} ` +
                        `prefix=${k ? k.slice(0, 4) + "…" : "n/a"}. ` +
                        "Update GROQ_API_KEY on the host with a valid key from console.groq.com, then fully restart."
                );
                const error = new Error("Groq authentication failed");
                error.code = "AI_AUTH_FAILED";
                error.status = info.status;
                throw error;
            }

            if (isProviderRateLimitError(apiError)) {
                const error = new Error("Global AI provider limit reached");
                error.code = "AI_GLOBAL_LIMIT";
                error.status = info.status;
                throw error;
            }

            if (isNetworkError(apiError)) {
                const error = new Error("AI network error");
                error.code = "AI_NETWORK";
                throw error;
            }

            if (!isModelError(apiError)) {
                break;
            }
        }
    }

    if (!completion) {
        const info = extractProviderError(lastError || {});
        if (isModelError(lastError)) {
            const error = new Error("AI model unavailable");
            error.code = "AI_MODEL_FAILED";
            error.status = info.status;
            throw error;
        }
        if (isNetworkError(lastError)) {
            const error = new Error("AI network error");
            error.code = "AI_NETWORK";
            throw error;
        }
        const error = new Error("AI provider request failed");
        error.code = "AI_PROVIDER_ERROR";
        error.status = info.status;
        throw error;
    }

    if (guildId) {
        useAI(guildId);
    }

    const content =
        completion.choices?.[0]?.message?.content?.trim() || "";

    if (!content) {
        const error = new Error("Empty AI response");
        error.code = "AI_EMPTY_RESPONSE";
        throw error;
    }

    return content;
}

async function askOmni(userMessage, context = [], options = {}) {
    const guildId = options.guildId;
    const contextText = (context || [])
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n");
    const systemContent =
        buildSystemPrompt(guildId, DEFAULT_BASE_PROMPT) +
        "\n\nConversation context:\n" +
        contextText;

    const messages = [
        {
            role: "system",
            content: systemContent
        },
        {
            role: "user",
            content: userMessage
        }
    ];

    return askAI(messages, {
        guildId: options.guildId,
        temperature: options.temperature ?? 0.8,
        maxTokens: options.maxTokens || 1000,
        model: options.model
    });
}

module.exports = {
    askAI,
    askOmni,
    DAILY_LIMIT,
    getRemaining,
    getUsage,
    limitReachedMessage,
    globalLimitReachedMessage,
    isLimitError,
    isGlobalLimitError,
    formatAiUserError,
    replyAiError,
    MODEL,
    PRIMARY_MODEL,
    FALLBACK_MODELS
};
