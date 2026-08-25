const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getConfig, setConfig } = require("../utils/captcha/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("captcha")
        .setDescription("Configure join captcha verification")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) => s.setName("status").setDescription("Show captcha settings"))
        .addSubcommand((s) =>
            s
                .setName("setup")
                .setDescription("Enable captcha verification")
                .addChannelOption((o) =>
                    o
                        .setName("channel")
                        .setDescription("Channel for verification prompts")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption((o) =>
                    o.setName("verified_role").setDescription("Role given after success").setRequired(true)
                )
                .addRoleOption((o) =>
                    o.setName("unverified_role").setDescription("Optional role while unverified")
                )
        )
        .addSubcommand((s) => s.setName("disable").setDescription("Disable captcha")),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === "status") {
            const cfg = getConfig(guildId);
            return interaction.reply({
                content:
                    `**Captcha:** ${cfg.enabled ? "Enabled" : "Disabled"}\n` +
                    `Channel: ${cfg.channelId ? `<#${cfg.channelId}>` : "—"}\n` +
                    `Verified role: ${cfg.roleId ? `<@&${cfg.roleId}>` : "—"}\n` +
                    `Unverified role: ${cfg.unverifiedRoleId ? `<@&${cfg.unverifiedRoleId}>` : "—"}`,
                ephemeral: true
            });
        }
        if (sub === "setup") {
            const channel = interaction.options.getChannel("channel");
            const role = interaction.options.getRole("verified_role");
            const unverified = interaction.options.getRole("unverified_role");
            setConfig(guildId, {
                enabled: true,
                channelId: channel.id,
                roleId: role.id,
                unverifiedRoleId: unverified?.id || null
            });
            return interaction.reply(
                `✅ Captcha enabled in ${channel}. New members must solve a math check to get ${role}.`
            );
        }
        if (sub === "disable") {
            setConfig(guildId, { enabled: false });
            return interaction.reply("⏹️ Captcha disabled.");
        }
        return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
    }
};
