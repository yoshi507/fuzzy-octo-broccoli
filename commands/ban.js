const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a member from the server")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member to ban")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the ban")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.BanMembers
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user");

        const reason =
            interaction.options.getString("reason");

        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: "❌ You cannot ban yourself.",
                ephemeral: true
            });
        }

        if (user.id === interaction.guild.ownerId) {
            return interaction.reply({
                content:
                    "❌ You cannot ban the server owner.",
                ephemeral: true
            });
        }

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (member && !member.bannable) {
            return interaction.reply({
                content:
                    "❌ I cannot ban that member. Check my role hierarchy and permissions.",
                ephemeral: true
            });
        }

        try {
            await interaction.guild.members.ban(
                user.id,
                {
                    reason: reason
                }
            );

            // Save ban to moderation history
            const database = loadDatabase();

            if (!database.bans) {
                database.bans = [];
            }

            database.bans.push({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason: reason,
                createdAt: Date.now()
            });

            saveDatabase(database);

            await sendModLog(interaction.guild, {
                title: "🔨 Member Banned",
                description:
                    `${user} has been banned.`,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason: reason
            });

            await interaction.reply(
                `🔨 **${user.tag}** has been banned.\n` +
                `**Reason:** ${reason}\n` +
                `**Moderator:** ${interaction.user.tag}`
            );

        } catch (error) {
            console.error(error);

            await interaction.reply({
                content:
                    "❌ I couldn't ban that member.",
                ephemeral: true
            });
        }
    }
};
