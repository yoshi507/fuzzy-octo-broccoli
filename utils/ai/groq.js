const Groq = require("groq-sdk");
const {
    canUseAI,
    useAI,
    DAILY_LIMIT,
    getRemaining,
    getUsage,
    getResetDescription
} = require("./aiLimit.js");
const { buildSystemPrompt, DEFAULT_BASE_PROMPT } = require("../persona/store.js");

if (!process.env.GROQ_API_KEY) {
    console.warn("⚠️ GROQ_API_KEY is missing from environment variables");
}

const MODEL = "openai/gpt-oss-20b";

/** Lazy Groq client so the bot can start without GROQ_API_KEY (non-AI features still work). */
let groqClient = null;

function getGroqClient() {
    if (!process.env.GROQ_API_KEY) {
        return null;
    }
    if (!groqClient) {
        groqClient = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
    }
    return groqClient;
}

function limitReachedMessage(guildId) {
    const resetText = getResetDescription();
    const usage = guildId ? getUsage(guildId) : null;
    const usedLine = usage
        ? `This server has used **${usage.used}/${usage.limit}** AI requests today.\n`
        : `This server has used all **${DAILY_LIMIT}** AI requests for today.\n`;

    return (
        "🚫 **AI limit reached**\n\n" +
        "You've hit this server's daily AI usage limit, so this command can't run right now.\n\n" +
        usedLine +
        `You can use AI commands again **${resetText}** (resets at midnight UTC).\n\n` +
        "💡 Non-AI features (moderation, music, games, `/translate`, etc.) still work as usual."
    );
}

function globalLimitReachedMessage() {
    return (
        "😔 **Sorry — the global AI limit has been reached**\n\n" +
        "Omni's shared AI service has hit its usage limit for now, so AI replies can't be generated.\n\n" +
        "This is separate from your server's daily AI allowance. Please try again later.\n\n" +
        "💡 Non-AI features (moderation, music, games, `/translate`, etc.) still work as usual."
    );
}

function isLimitError(error) {
    return Boolean(error && error.code === "AI_DAILY_LIMIT");
}

function isGlobalLimitError(error) {
    return Boolean(error && error.code === "AI_GLOBAL_LIMIT");
}

/**
 * Detect Groq / provider rate-limit or quota exhaustion from the SDK error.
 * Does not treat normal server daily limits as global.
 */
function isProviderRateLimitError(apiError) {
    if (!apiError) return false;

    const status =
        apiError.status ??
        apiError.statusCode ??
        apiError.response?.status ??
        apiError.error?.status;

    if (status === 429) return true;

    const pieces = [
        apiError.message,
        apiError.code,
        apiError.type,
        apiError.error?.message,
        apiError.error?.code,
        apiError.error?.type,
        apiError.body?.error?.message,
        typeof apiError.error === "string" ? apiError.error : null
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (!pieces) {
        return false;
    }

    return (
        pieces.includes("rate_limit") ||
        pieces.includes("rate limit") ||
        pieces.includes("ratelimit") ||
        pieces.includes("quota") ||
        pieces.includes("tokens per day") ||
        pieces.includes("token limit") ||
        pieces.includes("exceeded your current quota") ||
        pieces.includes("insufficient_quota") ||
        pieces.includes("too many requests") ||
        pieces.includes("daily limit") ||
        pieces.includes("usage limit")
    );
}

function formatAiUserError(error) {
    if (isLimitError(error)) {
        return limitReachedMessage(error.guildId);
    }

    if (isGlobalLimitError(error)) {
        return globalLimitReachedMessage();
    }

    if (error && error.code === "AI_NOT_CONFIGURED") {
        return (
            "⚠️ **AI is not available right now**\n\n" +
            "Omni's AI isn't configured on this bot instance. Please try again later or contact the bot owner."
        );
    }

    if (error && error.code === "AI_EMPTY_RESPONSE") {
        return (
            "😕 **No response from AI**\n\n" +
            "Omni didn't get a usable reply. Please try again in a moment."
        );
    }

    return (
        "❌ **AI is temporarily unavailable**\n\n" +
        "Something went wrong while talking to Omni's AI. Please try again in a little while.\n" +
        "This does **not** use an extra request from your daily limit when the call fails before a reply."
    );
}

async function replyAiError(interaction, error, guildId) {
    if (isLimitError(error)) {
        if (guildId && !error.guildId) {
            error.guildId = guildId;
        }
        const msg = limitReachedMessage(guildId || error.guildId);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply(msg);
        }
        return interaction.reply({ content: msg, ephemeral: true });
    }

    if (isGlobalLimitError(error)) {
        const msg = globalLimitReachedMessage();
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply(msg);
        }
        return interaction.reply({ content: msg, ephemeral: true });
    }

    console.error("AI command error:", error?.code || error?.message || error);

    const msg = formatAiUserError(error);
    if (interaction.deferred || interaction.replied) {
        return interaction.editReply(msg);
    }
    return interaction.reply({ content: msg, ephemeral: true });
}

async function askAI(messages, options = {}) {
    const guildId = options.guildId;

    if (guildId && !canUseAI(guildId)) {
        const error = new Error("AI daily limit reached");
        error.code = "AI_DAILY_LIMIT";
        error.guildId = guildId;
        throw error;
    }

    const client = getGroqClient();
    if (!client) {
        const error = new Error("GROQ_API_KEY is not configured");
        error.code = "AI_NOT_CONFIGURED";
        throw error;
    }

    let completion;
    try {
        completion = await client.chat.completions.create({
            model: options.model || MODEL,
            messages,
            temperature: options.temperature ?? 0.8,
            max_completion_tokens: options.maxTokens || 1000
        });
    } catch (apiError) {
        const status =
            apiError?.status ??
            apiError?.statusCode ??
            apiError?.response?.status;
        console.error(
            "Groq API error:",
            status || apiError?.message || apiError
        );

        if (isProviderRateLimitError(apiError)) {
            const error = new Error("Global AI provider limit reached");
            error.code = "AI_GLOBAL_LIMIT";
            error.status = status;
            throw error;
        }

        const error = new Error("AI provider request failed");
        error.code = "AI_PROVIDER_ERROR";
        error.status = status;
        throw error;
    }

    // Only count successful provider responses against the per-server allowance.
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
    const systemContent = `${buildSystemPrompt(guildId, DEFAULT_BASE_PROMPT)}

Conversation context:
${context
    .map(message => `${message.role}: ${message.content}`)
    .join("\n")}`;

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
    MODEL
};
