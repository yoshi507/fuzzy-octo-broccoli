const {
    SlashCommandBuilder
} = require("discord.js");

const https = require("https");

const {
    getMusicData
} = require("../utils/music/player.js");

function getLyrics(artist, title) {

    return new Promise((resolve, reject) => {

        const url =
            `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;

        https.get(
            url,
            response => {

                let data = "";

                response.on(
                    "data",
                    chunk => {
                        data += chunk;
                    }
                );

                response.on(
                    "end",
                    () => {

                        try {

                            const result =
                                JSON.parse(data);

                            if (
                                !result.lyrics
                            ) {
                                resolve(null);
                                return;
                            }

                            resolve(
                                result.lyrics.trim()
                            );

                        } catch {
                            resolve(null);
                        }
                    }
                );
            }
        ).on(
            "error",
            reject
        );
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lyrics")
        .setDescription("Find lyrics for the current song"),

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

        await interaction.deferReply();

        try {

            const title =
                data.current.title
                    .replace(
                        /\(.*?\)|\[.*?\]/g,
                        ""
                    )
                    .trim();

            const parts =
                title.split(" - ");

            let artist =
                parts.length > 1
                    ? parts[0]
                    : "";

            let songTitle =
                parts.length > 1
                    ? parts.slice(1).join(" - ")
                    : title;

            if (!artist) {

                return interaction.editReply(
                    "❌ I couldn't determine the artist. Try using `/lyrics` while a song with `Artist - Title` information is playing."
                );
            }

            const lyrics =
                await getLyrics(
                    artist,
                    songTitle
                );

            if (!lyrics) {
                return interaction.editReply(
                    `❌ I couldn't find lyrics for **${songTitle}**.`
                );
            }

            // Discord messages have a 2000 character limit.
            const chunks = [];

            for (
                let i = 0;
                i < lyrics.length;
                i += 1900
            ) {
                chunks.push(
                    lyrics.slice(
                        i,
                        i + 1900
                    )
                );
            }

            await interaction.editReply(
                `🎤 **${title}**\n\n${chunks[0]}`
            );

            for (
                let i = 1;
                i < chunks.length;
                i++
            ) {

                await interaction.followUp({
                    content:
                        chunks[i]
                });
            }

        } catch (error) {

            console.error(
                "Lyrics command error:",
                error
            );

            await interaction.editReply(
                "❌ I couldn't retrieve the lyrics."
            );
        }
    }
};
