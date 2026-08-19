const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const { loadDatabase } = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("modhistory")
        .setDescription("View a user's moderation history")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to check")
                .setRequired(true)
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user");

        const database = loadDatabase();

        const warnings =
            (database.warnings || []).filter(
                x =>
                    x.guildId === interaction.guild.id &&
                    x.userId === user.id
            );

        const timeouts =
            (database.timeouts || []).filter(
                x =>
                    x.guildId === interaction.guild.id &&
                    x.userId === user.id
            );

        const kicks =
            (database.kicks || []).filter(
                x =>
                    x.guildId === interaction.guild.id &&
                    x.userId === user.id
            );

        const bans =
            (database.bans || []).filter(
                x =>
                    x.guildId === interaction.guild.id &&
                    x.userId === user.id
            );

        const entries = [];

        for (const x of warnings) {
            entries.push(
                `⚠️ **Warning**\n` +
                `📝 ${x.reason}\n` +
                `🛡️ <@${x.moderatorId}>\n` +
                `📅 <t:${Math.floor(x.createdAt / 1000)}:R>`
            );
        }

        for (const x of timeouts) {
            entries.push(
                `🔇 **Timeout — ${x.minutes} minute(s)**\n` +
                `📝 ${x.reason}\n` +
                `🛡️ <@${x.moderatorId}>\n` +
                `📅 <t:${Math.floor(x.createdAt / 1000)}:R>`
            );
        }

        for (const x of kicks) {
            entries.push(
                `👢 **Kick**\n` +
                `📝 ${x.reason}\n` +
                `🛡️ <@${x.moderatorId}>\n` +
                `📅 <t:${Math.floor(x.createdAt / 1000)}:R>`
            );
        }

        for (const x of bans) {
            entries.push(
                `🔨 **Ban**\n` +
                `📝 ${x.reason}\n` +
                `🛡️ <@${x.moderatorId}>\n` +
                `📅 <t:${Math.floor(x.createdAt / 1000)}:R>`
            );
        }

        const embed =
            new EmbedBuilder()
                .setTitle(
                    `📋 Mod History — ${user.tag}`
                )
                .setThumbnail(
                    user.displayAvatarURL()
                )
                .setTimestamp();

        if (entries.length === 0) {
            embed.setDescription(
                "✅ This user has no moderation history."
            );
        } else {
            embed.setDescription(
                entries.slice(-10).join("\n\n")
            );

            embed.setFooter({
                text:
                    `${warnings.length} warning(s) • ` +
                    `${timeouts.length} timeout(s) • ` +
                    `${kicks.length} kick(s) • ` +
                    `${bans.length} ban(s)`
            });
        }

        await interaction.reply({
            embeds: [embed]
        });
    }
};
