const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Show information about a user")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to inspect")
                .setRequired(false)
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user") || interaction.user;

        const member = await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        const roles = member
            ? member.roles.cache
                .filter(role => role.id !== interaction.guild.id)
                .map(role => `<@&${role.id}>`)
                .join(", ") || "None"
            : "Not in this server";

        const embed = new EmbedBuilder()
            .setTitle(`👤 ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: "🆔 User ID",
                    value: user.id,
                    inline: false
                },
                {
                    name: "🤖 Bot",
                    value: user.bot ? "Yes" : "No",
                    inline: true
                },
                {
                    name: "📅 Account Created",
                    value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
                    inline: false
                },
                {
                    name: "📥 Joined Server",
                    value: member
                        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
                        : "Not in server",
                    inline: false
                },
                {
                    name: "🎭 Roles",
                    value: roles,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: "OmniBot • User Information"
            });

        await interaction.reply({
            embeds: [embed]
        });
    }
};
