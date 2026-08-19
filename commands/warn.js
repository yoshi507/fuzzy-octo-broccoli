const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member to warn")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the warning")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user");

        const reason =
            interaction.options.getString("reason");

        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: "❌ You cannot warn yourself.",
                ephemeral: true
            });
        }

        if (user.bot) {
            return interaction.reply({
                content: "❌ You cannot warn a bot.",
                ephemeral: true
            });
        }

        const database = loadDatabase();

        if (!database.warnings) {
            database.warnings = [];
        }

        const warning = {
            id: database.warnings.length + 1,
            guildId: interaction.guild.id,
            userId: user.id,
            moderatorId: interaction.user.id,
            reason: reason,
            createdAt: Date.now()
        };

        database.warnings.push(warning);

        saveDatabase(database);

        await sendModLog(interaction.guild, {
            title: "⚠️ Member Warned",
            description: `${user} has been warned.`,
            userId: user.id,
            moderatorId: interaction.user.id,
            reason: reason
        });

        await interaction.reply(
            `⚠️ **${user.tag}** has been warned.\n` +
            `**Warning #${warning.id}**\n` +
            `**Reason:** ${reason}`
        );
    }
};
