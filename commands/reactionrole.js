const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const {
    addConfig,
    listConfigs,
    removeConfig
} = require("../utils/reactionRoles/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("reactionrole")
        .setDescription("Configure button role panels")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((s) =>
            s
                .setName("create")
                .setDescription("Post a button that toggles a role")
                .addRoleOption((o) =>
                    o.setName("role").setDescription("Role to grant").setRequired(true)
                )
                .addStringOption((o) =>
                    o.setName("label").setDescription("Button label").setRequired(true)
                )
                .addStringOption((o) =>
                    o.setName("description").setDescription("Panel description")
                )
                .addChannelOption((o) =>
                    o.setName("channel").setDescription("Channel (default current)")
                )
        )
        .addSubcommand((s) =>
            s.setName("list").setDescription("List reaction role configs")
        )
        .addSubcommand((s) =>
            s
                .setName("delete")
                .setDescription("Delete a config by ID")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Config ID").setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === "list") {
            const list = listConfigs(guildId);
            if (!list.length) {
                return interaction.reply({ content: "No reaction roles configured.", ephemeral: true });
            }
            const text = list
                .map(
                    (c) =>
                        `• \`${c.id}\` — <@&${c.roleId}> — ${c.enabled === false ? "disabled" : "enabled"}`
                )
                .join("\n");
            return interaction.reply({ content: text.slice(0, 1900), ephemeral: true });
        }

        if (sub === "delete") {
            const id = interaction.options.getString("id");
            removeConfig(guildId, id);
            return interaction.reply({ content: `✅ Removed \`${id}\` (if it existed).`, ephemeral: true });
        }

        if (sub === "create") {
            const role = interaction.options.getRole("role");
            const label = interaction.options.getString("label").slice(0, 80);
            const description =
                interaction.options.getString("description") ||
                `Click to toggle **${role.name}**.`;
            const channel =
                interaction.options.getChannel("channel") || interaction.channel;
            if (!channel?.isTextBased?.()) {
                return interaction.reply({ content: "❌ Need a text channel.", ephemeral: true });
            }
            if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.reply({
                    content: "❌ I can't assign that role (hierarchy or managed role).",
                    ephemeral: true
                });
            }

            const id = `RR-${Date.now().toString(36).toUpperCase()}`;
            const customId = `rr:${guildId}:${id}`;
            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle("Role panel")
                .setDescription(description)
                .setFooter({ text: id });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Primary)
            );
            const msg = await channel.send({ embeds: [embed], components: [row] });
            addConfig(guildId, {
                id,
                customId,
                roleId: role.id,
                channelId: channel.id,
                messageId: msg.id,
                label,
                enabled: true,
                createdAt: Date.now()
            });
            return interaction.reply({
                content: `✅ Reaction role **${id}** posted in ${channel}.`,
                ephemeral: true
            });
        }
    }
};

module.exports.handleReactionRoleButton = async function handleReactionRoleButton(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith("rr:")) return false;
    const parts = interaction.customId.split(":");
    const guildId = parts[1];
    const configId = parts[2];
    if (interaction.guildId !== guildId) {
        await interaction.reply({ content: "❌ Wrong server.", ephemeral: true });
        return true;
    }
    const { listConfigs } = require("../utils/reactionRoles/store.js");
    const cfg = listConfigs(guildId).find((c) => c.id === configId);
    if (!cfg || cfg.enabled === false) {
        await interaction.reply({ content: "❌ This role panel is disabled.", ephemeral: true });
        return true;
    }
    const member = interaction.member;
    const role = interaction.guild.roles.cache.get(cfg.roleId);
    if (!role) {
        await interaction.reply({ content: "❌ Role no longer exists.", ephemeral: true });
        return true;
    }
    try {
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role, "Reaction role toggle");
            await interaction.reply({ content: `Removed **${role.name}**.`, ephemeral: true });
        } else {
            await member.roles.add(role, "Reaction role toggle");
            await interaction.reply({ content: `Added **${role.name}**.`, ephemeral: true });
        }
    } catch (e) {
        await interaction.reply({
            content: "❌ Could not update roles. Check my permissions and role hierarchy.",
            ephemeral: true
        });
    }
    return true;
};
