const Groq = require("groq-sdk");
const {
    canUseAI,
    useAI,
    DAILY_LIMIT,
    getRemaining,
    getUsage,
    getResetDescription
} = require("./aiLimit.js");

if (!process.env.GROQ_API_KEY) {
    console.warn("⚠️ GROQ_API_KEY is missing from environment variables");
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const MODEL = "openai/gpt-oss-20b";

/**
 * Friendly, consistent message when the server AI quota is exhausted.
 * Safe for Discord users — no internals.
 */
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

function isLimitError(error) {
    return Boolean(error && error.code === "AI_DAILY_LIMIT");
}

/**
 * Map any AI-related error to a short, user-safe Discord message.
 * Never exposes API keys, stack traces, or provider details.
 */
function formatAiUserError(error) {
    if (isLimitError(error)) {
        return limitReachedMessage(error.guildId);
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

/**
 * Reply helper for slash commands after deferReply.
 * Logs the real error server-side; only sends a friendly message to Discord.
 */
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

    console.error("AI command error:", error?.code || error?.message || error);

    const msg = formatAiUserError(error);
    if (interaction.deferred || interaction.replied) {
        return interaction.editReply(msg);
    }
    return interaction.reply({ content: msg, ephemeral: true });
}

/**
 * Central AI entry point. Every feature that calls Groq must go through this.
 * Counts toward the server's shared 20 requests/day when guildId is provided.
 * Limit is checked BEFORE any API call.
 */
async function askAI(messages, options = {}) {
    const guildId = options.guildId;

    if (guildId && !canUseAI(guildId)) {
        const error = new Error("AI daily limit reached");
        error.code = "AI_DAILY_LIMIT";
        error.guildId = guildId;
        throw error;
    }

    if (!process.env.GROQ_API_KEY) {
        const error = new Error("GROQ_API_KEY is not configured");
        error.code = "AI_NOT_CONFIGURED";
        throw error;
    }

    let completion;
    try {
        completion = await groq.chat.completions.create({
            model: options.model || MODEL,
            messages,
            temperature: options.temperature ?? 0.8,
            max_completion_tokens: options.maxTokens || 1000
        });
    } catch (apiError) {
        // Do not increment usage on API failure
        console.error(
            "Groq API error:",
            apiError?.status || apiError?.message || apiError
        );
        const error = new Error("AI provider request failed");
        error.code = "AI_PROVIDER_ERROR";
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

/**
 * Personality-aware helper for chat-style features.
 * options.guildId is required for limit tracking.
 */
async function askOmni(userMessage, context = [], options = {}) {
    const messages = [
        {
            role: "system",
            content: `You are Omni, a friendly Discord bot.\n\nYour personality:\n- Chill\n- Friendly\n- Funny when appropriate\n- Helpful\n- Natural and conversational\n- Do not sound robotic\n- Keep responses reasonably concise\n- Never pretend to be human\n- Respect Discord rules and server rules\n\nYou are being used inside a Discord server.\n\nConversation context:\n${context
    .map(message => `${message.role}: ${message.content}`)
    .join("\n")}`
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
    isLimitError,
    formatAiUserError,
    replyAiError,
    MODEL
};
