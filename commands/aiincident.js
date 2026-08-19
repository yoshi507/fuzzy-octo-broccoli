const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");
const {
    askAI,
    limitReachedMessage,
    isLimitError,
    getRemaining,
    DAILY_LIMIT
} = require("../utils/ai/groq.js");
const { getGuildSecurity } = require("../utils/ai/security.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aiincident")
        .setDescription("Analyse recorded security incidents with AI")
        .addIntegerOption(option =>
            option
                .setName("count")
                .setDescription("How many recent incidents to include (default 10, max 20)")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const count = interaction.options.getInteger("count") || 10;
        await interaction.deferReply({ ephemeral: true });

        try {
            const security = getGuildSecurity(interaction.guild.id);
            const incidents = (security.incidents || []).slice(-count);

            if (incidents.length === 0) {
                return interaction.editReply(
                    "📭 No security incidents are recorded for this server yet."
                );
            }

            const lines = incidents.map((inc, i) => {
                const when = inc.timestamp
                    ? new Date(inc.timestamp).toISOString()
                    : "unknown time";
                return (
                    `${i + 1}. type=${inc.type || "unknown"}` +
                    (inc.count != null ? ` count=${inc.count}` : "") +
                    (inc.severity ? ` severity=${inc.severity}` : "") +
                    (inc.confidence != null ? ` confidence=${inc.confidence}` : "") +
                    (inc.executorTag ? ` executor=${inc.executorTag}` : "") +
                    (inc.reason ? ` reason=${String(inc.reason).slice(0, 120)}` : "") +
                    ` at=${when}`
                );
            });

            const analysis = await askAI(
                [
                    {
                        role: "system",
                        content:
                            "You analyse Discord security incident logs for administrators.\n" +
                            "Explain patterns in plain language.\n" +
                            "Suggest cautious next steps for staff.\n" +
                            "Do not recommend automatic bans or kicks.\n" +
                            "If data is thin, say so.\n" +
                            "Keep the reply concise with short bullet points."
                    },
                    {
                        role: "user",
                        content:
                            `Server: ${interaction.guild.name}\n` +
                            `Security enabled: ${security.enabled}\n` +
                            `Mode: ${security.mode}\n\n` +
                            `Recent incidents:\n${lines.join("\n")}`
                    }
                ],
                {
                    guildId: interaction.guild.id,
                    temperature: 0.3,
                    maxTokens: 700
                }
            );

            if (!analysis) {
                return interaction.editReply("❌ No analysis returned.");
            }

            const remaining = getRemaining(interaction.guild.id);

            await interaction.editReply(
                `🧳 **Incident analysis** (${incidents.length} record(s))\n\n` +
                    `${analysis}\n\n` +
                    `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`
            );
        } catch (error) {
            if (isLimitError(error)) {
                return interaction.editReply(limitReachedMessage());
            }
            console.error("aiincident error:", error);
            await interaction.editReply("❌ Could not analyse incidents.");
        }
    }
};
