const {
    SlashCommandBuilder
} = require("discord.js");

const { spawn } = require("child_process");

const {
    connect,
    getMusicData,
    playSong
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription("Song name or YouTube URL")
                .setRequired(true)
        ),

    async execute(interaction) {

        const query =
            interaction.options.getString("query");

        const member =
            interaction.member;

        if (!member.voice.channel) {
            return interaction.reply({
                content:
                    "❌ You need to join a voice channel first.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {

            let videoUrl = query;
            let title = query;

            // =========================
            // SEARCH YOUTUBE
            // =========================

            if (!query.startsWith("http")) {

                const searchProcess =
                    spawn("yt-dlp", [
                        "--flat-playlist",
                        "--print",
                        "%(title)s|%(webpage_url)s",
                        "--playlist-end",
                        "1",
                        `ytsearch1:${query}`
                    ]);

                let output = "";
                let errorOutput = "";

                searchProcess.stdout.on(
                    "data",
                    data => {
                        output += data.toString();
                    }
                );

                searchProcess.stderr.on(
                    "data",
                    data => {
                        errorOutput += data.toString();
                    }
                );

                await new Promise(
                    (resolve, reject) => {

                        searchProcess.on(
                            "close",
                            code => {

                                if (code !== 0) {
                                    reject(
                                        new Error(
                                            errorOutput ||
                                            "YouTube search failed"
                                        )
                                    );
                                } else {
                                    resolve();
                                }
                            }
                        );

                        searchProcess.on(
                            "error",
                            reject
                        );
                    }
                );

                const result =
                    output.trim();

                if (!result) {
                    return interaction.editReply(
                        "❌ I couldn't find that song."
                    );
                }

                const separator =
                    result.indexOf("|");

                if (separator === -1) {
                    return interaction.editReply(
                        "❌ I couldn't find a playable result."
                    );
                }

                title =
                    result
                        .slice(0, separator)
                        .trim();

                videoUrl =
                    result
                        .slice(separator + 1)
                        .trim();

                if (!videoUrl.startsWith("http")) {
                    return interaction.editReply(
                        "❌ The search didn't return a valid YouTube URL."
                    );
                }
            }

            // =========================
            // CONNECT
            // =========================

            const data =
                await connect(member);

            // =========================
            // ADD TO QUEUE
            // =========================

            if (data.current) {

                data.queue.push({
                    title: title,
                    url: videoUrl
                });

                return interaction.editReply(
                    `📋 Added **${title}** to the queue.\n` +
                    `Position: **${data.queue.length}**`
                );
            }

            // =========================
            // PLAY
            // =========================

            await playSong(
                data,
                title,
                videoUrl
            );

            await interaction.editReply(
                `🎵 Now playing **${title}**`
            );

        } catch (error) {

            console.error(
                "Play command error:",
                error
            );

            await interaction.editReply(
                "❌ I couldn't find or play that song."
            );
        }
    }
};
