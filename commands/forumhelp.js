const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getConfig, setConfig } = require("../utils/features/forumHelp.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("forumhelp")
        .setDescription("AI help for forum posts")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) => s.setName("status").setDescription("Show forum AI help settings"))
        .addSubcommand((s) =>
            s
                .setName("enable")
                .setDescription("Enable AI replies on new forum posts")
                .addChannelOption((o) =>
                    o
                        .setName("forum")
                        .setDescription("Limit to one forum (omit = all forums)")
                        .addChannelTypes(ChannelType.GuildForum)
                )
        )
        .addSubcommand((s) => s.setName("disable").setDescription("Disable forum AI help")),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        if (sub === "status") {
            const cfg = getConfig(guildId);
            return interaction.reply({
                content:
                    `**Forum AI help:** ${cfg.enabled ? "Enabled" : "Disabled"}\n` +
                    `Forums: ${cfg.channelIds?.length ? cfg.channelIds.map((id) => `<#${id}>`).join(", ") : "All forums"}\n` +
                    `Uses the server AI daily limit.`,
                ephemeral: true
            });
        }
        if (sub === "enable") {
            const forum = interaction.options.getChannel("forum");
            const prev = getConfig(guildId);
            const channelIds = forum
                ? [...new Set([...(prev.channelIds || []), forum.id])]
                : prev.channelIds || [];
            setConfig(guildId, { enabled: true, autoReply: true, channelIds: forum ? channelIds : [] });
            return interaction.reply(
                forum
                    ? `✅ Forum AI help enabled for ${forum}.`
                    : "✅ Forum AI help enabled for **all** forum channels."
            );
        }
        if (sub === "disable") {
            setConfig(guildId, { enabled: false });
            return interaction.reply("⏹️ Forum AI help disabled.");
        }
        return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
    }
};
