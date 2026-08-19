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
        .setName("kick")
        .setDescription("Kick a member from the server")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member to kick")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the kick")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.KickMembers
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user");

        const reason =
            interaction.options.getString("reason");

        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: "❌ You cannot kick yourself.",
                ephemeral: true
            });
        }

        if (user.id === interaction.guild.ownerId) {
            return interaction.reply({
                content:
                    "❌ You cannot kick the server owner.",
                ephemeral: true
            });
        }

        if (user.bot) {
            return interaction.reply({
                content:
                    "❌ You cannot kick a bot with this command.",
                ephemeral: true
            });
        }

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member) {
            return interaction.reply({
                content:
                    "❌ That user isn't in this server.",
                ephemeral: true
            });
        }

        if (!member.kickable) {
            return interaction.reply({
                content:
                    "❌ I cannot kick that member. Check my role hierarchy and permissions.",
                ephemeral: true
            });
        }

        try {
            await member.kick(reason);

            // Save kick to moderation history
            const database = loadDatabase();

            if (!database.kicks) {
                database.kicks = [];
            }

            database.kicks.push({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason: reason,
                createdAt: Date.now()
            });

            saveDatabase(database);

            await sendModLog(interaction.guild, {
                title: "👢 Member Kicked",
                description:
                    `${user} has been kicked.`,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason: reason
            });

            await interaction.reply(
                `👢 **${user.tag}** has been kicked.\n` +
                `**Reason:** ${reason}\n` +
                `**Moderator:** ${interaction.user.tag}`
            );

        } catch (error) {
            console.error(error);

            await interaction.reply({
                content:
                    "❌ I couldn't kick that member.",
                ephemeral: true
            });
        }
    }
};
