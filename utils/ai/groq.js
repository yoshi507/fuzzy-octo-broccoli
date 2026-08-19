const Groq = require("groq-sdk");
const {
    canUseAI,
    useAI,
    DAILY_LIMIT,
    getRemaining
} = require("./aiLimit.js");

if (!process.env.GROQ_API_KEY) {
    console.warn("⚠️ GROQ_API_KEY is not set.");
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const MODEL = "openai/gpt-oss-20b";

function limitReachedMessage() {
    return (
        "🚫 **Daily AI limit reached.**\n\n" +
        `This server has used all **${DAILY_LIMIT}** AI requests for today. ` +
        "The limit resets tomorrow.\n" +
        "Non-AI features still work as usual."
    );
}

function isLimitError(error) {
    return error && error.code === "AI_DAILY_LIMIT";
}

/**
 * Central AI entry point. Every feature that calls Groq must go through this.
 * Counts toward the server's shared 20 requests/day when guildId is provided.
 */
async function askAI(messages, options = {}) {
    const guildId = options.guildId;

    if (guildId && !canUseAI(guildId)) {
        const error = new Error(`AI_DAILY_LIMIT:${DAILY_LIMIT}`);
        error.code = "AI_DAILY_LIMIT";
        throw error;
    }

    if (!process.env.GROQ_API_KEY) {
        const error = new Error("GROQ_API_KEY is not configured");
        error.code = "AI_NOT_CONFIGURED";
        throw error;
    }

    const completion = await groq.chat.completions.create({
        model: options.model || MODEL,
        messages,
        temperature: options.temperature ?? 0.8,
        max_completion_tokens: options.maxTokens || 1000
    });

    if (guildId) {
        useAI(guildId);
    }

    const content =
        completion.choices?.[0]?.message?.content?.trim() || "";

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
            content: `You are Omni, a friendly Discord bot.

Your personality:
- Chill
- Friendly
- Funny when appropriate
- Helpful
- Natural and conversational
- Do not sound robotic
- Keep responses reasonably concise
- Never pretend to be human
- Respect Discord rules and server rules

You are being used inside a Discord server.

Conversation context:
${context
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
    limitReachedMessage,
    isLimitError,
    MODEL
};
