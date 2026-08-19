const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Show information about this server"),

    async execute(interaction) {
        const guild = interaction.guild;

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                {
                    name: "👑 Owner",
                    value: `<@${guild.ownerId}>`,
                    inline: true
                },
                {
                    name: "👥 Members",
                    value: `${guild.memberCount}`,
                    inline: true
                },
                {
                    name: "💬 Channels",
                    value: `${guild.channels.cache.size}`,
                    inline: true
                },
                {
                    name: "🎭 Roles",
                    value: `${guild.roles.cache.size}`,
                    inline: true
                },
                {
                    name: "😀 Emojis",
                    value: `${guild.emojis.cache.size}`,
                    inline: true
                },
                {
                    name: "📅 Created",
                    value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
                    inline: false
                },
                {
                    name: "🆔 Server ID",
                    value: guild.id,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: "OmniBot • Server Information"
            });

        await interaction.reply({
            embeds: [embed]
        });
    }
};
