const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Set the music loop mode")
        .addStringOption(option =>
            option
                .setName("mode")
                .setDescription("Loop mode")
                .setRequired(true)
                .addChoices(
                    {
                        name: "Off",
                        value: "off"
                    },
                    {
                        name: "Current Song",
                        value: "song"
                    },
                    {
                        name: "Queue",
                        value: "queue"
                    }
                )
        ),

    async execute(interaction) {

        const data =
            getMusicData(
                interaction.guild.id
            );

        if (!data || !data.current) {
            return interaction.reply({
                content:
                    "❌ Nothing is currently playing.",
                ephemeral: true
            });
        }

        const mode =
            interaction.options.getString("mode");

        data.loop = mode;

        const names = {
            off: "off 🔁",
            song: "current song 🔂",
            queue: "queue 🔁"
        };

        await interaction.reply(
            `🔁 Loop mode set to **${names[mode]}**.`
        );
    }
};

