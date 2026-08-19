const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");
const { getSettings, setSettings } = require("../utils/quiz/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("quizsetup")
        .setDescription("Configure the quiz system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addBooleanOption((o) =>
            o.setName("enabled").setDescription("Enable quizzes")
        )
        .addChannelOption((o) =>
            o
                .setName("channel")
                .setDescription("Restrict quizzes to this channel")
                .addChannelTypes(ChannelType.GuildText)
        )
        .addIntegerOption((o) =>
            o
                .setName("questions")
                .setDescription("Default question count")
                .setMinValue(1)
                .setMaxValue(20)
        )
        .addIntegerOption((o) =>
            o
                .setName("timer")
                .setDescription("Seconds per question")
                .setMinValue(5)
                .setMaxValue(120)
        )
        .addIntegerOption((o) =>
            o
                .setName("points")
                .setDescription("Points per correct answer")
                .setMinValue(1)
                .setMaxValue(100)
        ),

    async execute(interaction) {
        const cur = getSettings(interaction.guild.id);
        const patch = {};
        const enabled = interaction.options.getBoolean("enabled");
        const channel = interaction.options.getChannel("channel");
        const questions = interaction.options.getInteger("questions");
        const timer = interaction.options.getInteger("timer");
        const points = interaction.options.getInteger("points");

        if (enabled !== null) patch.enabled = enabled;
        if (channel) patch.channelId = channel.id;
        if (questions != null) patch.questionCount = questions;
        if (timer != null) patch.timeLimitSeconds = timer;
        if (points != null) patch.pointsCorrect = points;

        if (!Object.keys(patch).length) {
            return interaction.reply({
                content:
                    `**Quiz config**\nEnabled: **${cur.enabled}**\n` +
                    `Channel: ${cur.channelId ? `<#${cur.channelId}>` : "*any*"}\n` +
                    `Questions: **${cur.questionCount}** · Timer: **${cur.timeLimitSeconds}s** · Points: **${cur.pointsCorrect}**`,
                ephemeral: true
            });
        }

        const next = setSettings(interaction.guild.id, patch);
        return interaction.reply({
            content: `✅ Quiz settings updated. Enabled: **${next.enabled}**.`,
            ephemeral: true
        });
    }
};
