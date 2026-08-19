const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("suggest")
        .setDescription("Submit a server suggestion")
        .addStringOption(option =>
            option
                .setName("suggestion")
                .setDescription("Your suggestion")
                .setRequired(true)
        ),

    async execute(interaction) {

        const suggestion =
            interaction.options.getString("suggestion");

        const embed =
            new EmbedBuilder()
                .setTitle("💡 New Suggestion")
                .setDescription(suggestion)
                .addFields(
                    {
                        name: "👤 Suggested by",
                        value: `${interaction.user}`,
                        inline: true
                    },
                    {
                        name: "📊 Status",
                        value: "🟡 Pending",
                        inline: true
                    }
                )
                .setFooter({
                    text: `Suggestion by ${interaction.user.tag}`
                })
                .setTimestamp();

        const buttons =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("suggest_approve")
                        .setLabel("Approve")
                        .setEmoji("✅")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId("suggest_reject")
                        .setLabel("Reject")
                        .setEmoji("❌")
                        .setStyle(ButtonStyle.Danger)
                );

        try {

            const sentMessage =
                await interaction.channel.send({
                    embeds: [embed],
                    components: [buttons]
                });

            await interaction.reply({
                content:
                    "✅ Your suggestion has been submitted!",
                ephemeral: true
            });

            await sendModLog(interaction.guild, {
                title: "💡 Suggestion Submitted",
                description:
                    `${interaction.user} submitted a suggestion in ${interaction.channel}.`,
                userId: interaction.user.id,
                moderatorId: interaction.user.id,
                reason: suggestion
            });

        } catch (error) {

            console.error(
                "Suggestion error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't submit your suggestion.",
                ephemeral: true
            });
        }
    }
};
