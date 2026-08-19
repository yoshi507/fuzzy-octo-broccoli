const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");
const { getSettings, setSettings } = require("../utils/appeals/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("appealsetup")
        .setDescription("Configure the appeals system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addBooleanOption((o) =>
            o.setName("enabled").setDescription("Enable appeals")
        )
        .addChannelOption((o) =>
            o
                .setName("channel")
                .setDescription("Channel for appeal notifications")
                .addChannelTypes(ChannelType.GuildText)
        )
        .addRoleOption((o) =>
            o.setName("staff_role").setDescription("Add a staff reviewer role")
        )
        .addIntegerOption((o) =>
            o
                .setName("cooldown_hours")
                .setDescription("Hours between appeals")
                .setMinValue(1)
                .setMaxValue(720)
        ),

    async execute(interaction) {
        const cur = getSettings(interaction.guild.id);
        const patch = {};
        const enabled = interaction.options.getBoolean("enabled");
        const channel = interaction.options.getChannel("channel");
        const role = interaction.options.getRole("staff_role");
        const cooldown = interaction.options.getInteger("cooldown_hours");

        if (enabled !== null) patch.enabled = enabled;
        if (channel) patch.channelId = channel.id;
        if (role) {
            const ids = new Set(cur.staffRoleIds || []);
            ids.add(role.id);
            patch.staffRoleIds = [...ids];
        }
        if (cooldown != null) patch.cooldownHours = cooldown;

        if (!Object.keys(patch).length) {
            return interaction.reply({
                content:
                    `**Appeals config**\n` +
                    `Enabled: **${cur.enabled}**\n` +
                    `Channel: ${cur.channelId ? `<#${cur.channelId}>` : "*none*"}\n` +
                    `Staff roles: ${(cur.staffRoleIds || []).map((id) => `<@&${id}>`).join(", ") || "*none*"}\n` +
                    `Cooldown: **${cur.cooldownHours}h**\n` +
                    `Default form questions: **${(cur.questions || []).length}** (ready out of the box)`,
                ephemeral: true
            });
        }

        const next = setSettings(interaction.guild.id, patch);
        return interaction.reply({
            content: `✅ Appeals updated. Enabled: **${next.enabled}**.`,
            ephemeral: true
        });
    }
};
