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

async function askAI(messages, options = {}) {

    const guildId =
        options.guildId;

    if (guildId && !canUseAI(guildId)) {

        const error =
            new Error(
                `AI_DAILY_LIMIT:${DAILY_LIMIT}`
            );

        error.code =
            "AI_DAILY_LIMIT";

        throw error;
    }

    const completion =
    await groq.chat.completions.create({
        model:
            options.model || MODEL,

        messages,

        temperature:
            options.temperature ?? 0.8,

        max_completion_tokens:
            options.maxTokens || 1000,

        include_reasoning: false
    });
reasoning_effort:
    options.reasoningEffort || "low"
    if (guildId) {
        useAI(guildId);
    }

    const content =
        completion
            .choices?.[0]
            ?.message
            ?.content
            ?.trim() || "";

    return content;
}
async function askOmni(
    userMessage,
    context = []
) {

    const messages = [
        {
            role: "system",
            content:
                `You are Omni, a friendly Discord bot.

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
    .map(message =>
        `${message.role}: ${message.content}`
    )
    .join("\n")}`
        },
        {
            role: "user",
            content: userMessage
        }
    ];

    return askAI(messages);
}

module.exports = {
    askAI,
    askOmni
};
