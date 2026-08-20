const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    loadDatabase
} = require("../database/database.js");

const { mergeGuildConfig } = require("../utils/configSync.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("autorole")
        .setDescription("Configure the automatic member role")
        .addSubcommand(subcommand =>
            subcommand
                .setName("set")
                .setDescription("Set the automatic role")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Role to automatically give new members")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription("Disable automatic roles")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("View the current automatic role")
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const action = interaction.options.getSubcommand();

        if (action === "set") {
            const role = interaction.options.getRole("role");
            if (
                role.position >=
                interaction.guild.members.me.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        "❌ I cannot give that role because it is higher than or equal to my highest role. Move my bot role above it.",
                    ephemeral: true
                });
            }
            mergeGuildConfig("autorole", guildId, {
                enabled: true,
                roleId: role.id
            });
            return interaction.reply(
                `✅ New members will now automatically receive ${role}.`
            );
        }

        if (action === "disable") {
            mergeGuildConfig("autorole", guildId, {
                enabled: false,
                roleId: null
            });
            return interaction.reply(
                "✅ Automatic roles have been disabled."
            );
        }

        if (action === "view") {
            const database = loadDatabase();
            const settings = database.autorole?.[guildId];
            if (!settings?.enabled || !settings.roleId) {
                return interaction.reply(
                    "ℹ️ Automatic roles are currently disabled."
                );
            }
            const role = interaction.guild.roles.cache.get(settings.roleId);
            if (!role) {
                return interaction.reply(
                    "⚠️ The configured automatic role no longer exists."
                );
            }
            return interaction.reply(
                `🎭 Current automatic role: ${role}`
            );
        }
    }
};
