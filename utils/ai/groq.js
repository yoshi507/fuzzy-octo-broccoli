const Groq = require("groq-sdk");
const {
    canUseAI,
    useAI,
    getRemaining,
    getUsage,
    DAILY_LIMIT
} = require("./aiLimit.js");
const { buildSystemPrompt, DEFAULT_BASE_PROMPT } = require("../persona/store.js");

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

let groqClient = null;

function getGroqClient() {
    if (groqClient) return groqClient;
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    groqClient = new Groq({ apiKey: key });
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
        (remaining === 0 ? "" : ` Remaining: ${remaining}.")
    );
}

function globalLimitReachedMessage() {
    return "Sorry — the global AI limit has been reached. Please try again later.";
}

function isProviderRateLimitError(error) {
    const status = error?.status ?? error?.statusCode ?? error?.response?.status;
    const msg = String(error?.message || error || "").toLowerCase();
    if (status === 429) return true;
    if (/rate limit|quota|tokens per day|tpm|rpm|insufficient_quota/.test(msg)) return true;
    return false;
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
    if (isGlobalLimitError(error)) {
        return globalLimitReachedMessage();
    }
    if (error.code === "AI_NOT_CONFIGURED") {
        return "❌ AI is not configured on this bot yet.";
    }
    if (error.code === "AI_EMPTY_RESPONSE") {
        return "❌ Omni didn't return a response.";
    }
    if (error.code === "AI_PROVIDER_ERROR") {
        return "❌ The AI service is temporarily unavailable. Try again in a moment.";
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

async function askAI(messages, options = {}) {
    const guildId = options.guildId;

    if (guildId && !canUseAI(guildId)) {
        const error = new Error("AI daily limit reached");
        error.code = "AI_DAILY_LIMIT";
        error.guildId = guildId;
        throw error;
    }

    // Ensure per-server personality is always applied for guild-scoped AI calls
    let finalMessages = Array.isArray(messages) ? messages.map((m) => ({ ...m })) : [];
    if (guildId && options.applyPersona !== false) {
        const personaPrompt = buildSystemPrompt(guildId, DEFAULT_BASE_PROMPT);
        const marker = "=== SERVER PERSONALITY";
        if (finalMessages.length && finalMessages[0].role === "system") {
            const existing = String(finalMessages[0].content || "");
            if (!existing.includes(marker)) {
                finalMessages[0] = {
                    role: "system",
                    content: personaPrompt + "\n\n" + existing
                };
            }
        } else {
            finalMessages = [{ role: "system", content: personaPrompt }, ...finalMessages];
        }
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
            messages: finalMessages,
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
