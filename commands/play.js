const { SlashCommandBuilder } = require("discord.js");
const {
    connect,
    getMusicData,
    playSong
} = require("../utils/music/player.js");
const { resolveTrack } = require("../utils/music/resolve.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song from SoundCloud (or Spotify link → SoundCloud)")
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription("Song name, SoundCloud URL, or Spotify URL (not YouTube)")
                .setRequired(true)
        ),

    async execute(interaction) {
        const query = interaction.options.getString("query");
        const member = interaction.member;

        if (!member.voice.channel) {
            return interaction.reply({
                content: "❌ You need to join a voice channel first.",
                ephemeral: true
            });
        }

        await interaction.deferReply();
        try {
            await interaction.editReply("🔍 Searching…");
        } catch (_) {}

        try {
            const track = await resolveTrack(query);

            const data = await connect(member);
            const music = getMusicData(member.guild.id) || data;

            if (music.current || music.player?.state?.status === "playing") {
                music.queue.push({
                    title: track.title,
                    url: track.url
                });
                return interaction.editReply(
                    `➕ Queued **${track.title}** (\`${track.source}\`)`
                );
            }

            await playSong(music, track.title, track.url);
            return interaction.editReply(
                `▶️ Playing **${track.title}** (\`${track.source}\`)`
            );
        } catch (err) {
            console.error("[play]", err?.code || "", err?.message || err);
            let msg = err?.message || "Failed to play that track.";
            if (err?.code === "MUSIC_YOUTUBE_DISABLED") {
                msg =
                    "YouTube is disabled. Use a **song name**, **SoundCloud** link, or **Spotify** link.";
            } else if (err?.code === "TIMEOUT") {
                msg =
                    "Search timed out. Try a direct SoundCloud link or a shorter query.";
            } else if (
                err?.code === "MUSIC_STREAM_FAILED" ||
                err?.code === "MUSIC_NOT_PLAYING"
            ) {
                msg =
                    "Found the track but could not play audio. Ensure the host has network access and yt-dlp/ffmpeg if needed.";
            }
            return interaction.editReply(`❌ ${msg}`.replace(/^❌ ❌/, "❌"));
        }
    }
};
