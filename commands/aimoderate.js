const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");
const {
    askAI,
    limitReachedMessage,
    isLimitError,
    replyAiError,
    DAILY_LIMIT,
    getRemaining
} = require("../utils/ai/groq.js");
const { canUseAI } = require("../utils/ai/aiLimit.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aimoderate")
        .setDescription(
            "Analyse a message for moderation context (does not auto-punish)"
        )
        .addStringOption(option =>
            option
                .setName("text")
                .setDescription("The message text to analyse")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("context")
                .setDescription("Optional extra context for staff")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        const text = interaction.options.getString("text");
        const extra = interaction.options.getString("context") || "None";

        await interaction.deferReply({ ephemeral: true });

        if (!canUseAI(interaction.guild.id)) {
            return interaction.editReply(limitReachedMessage(interaction.guild.id));
        }

        try {
            const analysis = await askAI(
                [
                    {
                        role: "system",
                        content:
                            "You assist Discord moderators. Analyse the message for possible rule issues.\n" +
                            "Return a short structured report with:\n" +
                            "- Risk level: none | low | medium | high\n" +
                            "- Categories: (e.g. harassment, spam, scam, NSFW, other, none)\n" +
                            "- Why: one or two sentences\n" +
                            "- Suggested staff action: information only (never claim the bot will punish anyone)\n" +
                            "Do not invent evidence. Do not recommend automatic bans.\n" +
                            "Be careful with sarcasm and context."
                    },
                    {
                        role: "user",
                        content:
                            `Message to analyse:\n"""${text}"""\n\nStaff context: ${extra}`
                    }
                ],
                {
                    guildId: interaction.guild.id,
                    temperature: 0.2,
                    maxTokens: 500
                }
            );

            if (!analysis) {
                return interaction.editReply("❌ No analysis returned.");
            }

            const remaining = getRemaining(interaction.guild.id);

            await interaction.editReply(
                `🛡️ **AI moderation analysis** (advisory only — no automatic punishment)\n\n` +
                    `${analysis}\n\n` +
                    `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`
            );
        } catch (error) {
            return replyAiError(interaction, error, interaction.guild?.id);
        }
    }
};
