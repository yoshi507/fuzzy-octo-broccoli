const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getUserData,
    xpNeeded
} = require("../utils/leveling.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Show your leveling rank")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user whose rank you want to see")
                .setRequired(false)
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user") || interaction.user;

        const data = getUserData(
            interaction.guild.id,
            user.id
        );

        const needed = xpNeeded(data.level);

        const embed = new EmbedBuilder()
            .setTitle(`📈 ${user.username}'s Rank`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: "🏆 Level",
                    value: `${data.level}`,
                    inline: true
                },
                {
                    name: "✨ XP",
                    value: `${data.xp} / ${needed}`,
                    inline: true
                },
                {
                    name: "💬 Messages",
                    value: `${data.messages}`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({
                text: "OmniBot • Leveling"
            });

        await interaction.reply({
            embeds: [embed]
        });
    }
};
