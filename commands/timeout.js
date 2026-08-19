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
        .setName("timeout")
        .setDescription("Timeout a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member to timeout")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("minutes")
                .setDescription("How many minutes to timeout them")
                .setMinValue(1)
                .setMaxValue(40320)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the timeout")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user");

        const minutes =
            interaction.options.getInteger("minutes");

        const reason =
            interaction.options.getString("reason");

        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: "❌ You cannot timeout yourself.",
                ephemeral: true
            });
        }

        if (user.id === interaction.guild.ownerId) {
            return interaction.reply({
                content: "❌ You cannot timeout the server owner.",
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

        if (!member.moderatable) {
            return interaction.reply({
                content:
                    "❌ I cannot timeout that member. Check my role hierarchy and permissions.",
                ephemeral: true
            });
        }

        try {
            await member.timeout(
                minutes * 60 * 1000,
                reason
            );

            // Save timeout to moderation history
            const database = loadDatabase();

            if (!database.timeouts) {
                database.timeouts = [];
            }

            database.timeouts.push({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                minutes: minutes,
                reason: reason,
                createdAt: Date.now()
            });

            saveDatabase(database);

            await sendModLog(interaction.guild, {
                title: "🔇 Member Timed Out",
                description:
                    `${user} has been timed out for **${minutes} minute(s)**.`,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason: reason
            });

            await interaction.reply(
                `🔇 **${user.tag}** has been timed out.\n` +
                `**Duration:** ${minutes} minute(s)\n` +
                `**Reason:** ${reason}\n` +
                `**Moderator:** ${interaction.user.tag}`
            );

        } catch (error) {
            console.error(error);

            await interaction.reply({
                content:
                    "❌ I couldn't timeout that member.",
                ephemeral: true
            });
        }
    }
};
