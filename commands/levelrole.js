const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("levelrole")
        .setDescription("Set a role reward for a level")
        .addIntegerOption(option =>
            option
                .setName("level")
                .setDescription("The level that should give the role")
                .setMinValue(1)
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("The role to give")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const level = interaction.options.getInteger("level");
        const role = interaction.options.getRole("role");

        if (role.managed) {
            return interaction.reply({
                content: "❌ I can't give out an integration-managed role.",
                ephemeral: true
            });
        }

        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: "❌ That role is higher than or equal to my highest role. Move my bot role above it.",
                ephemeral: true
            });
        }

        const database = loadDatabase();

        if (!database.levelRewards) {
            database.levelRewards = {};
        }

        if (!database.levelRewards[interaction.guild.id]) {
            database.levelRewards[interaction.guild.id] = {};
        }

        database.levelRewards[interaction.guild.id][String(level)] =
            role.id;

        saveDatabase(database);

        await interaction.reply(
            `✅ When someone reaches **Level ${level}**, I'll give them ${role}.`
        );
    }
};
