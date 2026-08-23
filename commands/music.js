const { SlashCommandBuilder } = require("discord.js");
const {
    connect,
    getMusicData,
    playSong,
    destroy
} = require("../utils/music/player.js");
const { resolveTrack } = require("../utils/music/resolve.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("music")
        .setDescription("Music player (SoundCloud / Spotify links → SoundCloud)")
        .addSubcommand((s) =>
            s
                .setName("play")
                .setDescription("Play or queue a track")
                .addStringOption((o) =>
                    o
                        .setName("query")
                        .setDescription("Song name, SoundCloud URL, or Spotify URL")
                        .setRequired(true)
                )
        )
        .addSubcommand((s) => s.setName("skip").setDescription("Skip the current track"))
        .addSubcommand((s) => s.setName("stop").setDescription("Stop music and leave voice"))
        .addSubcommand((s) => s.setName("pause").setDescription("Pause playback"))
        .addSubcommand((s) => s.setName("resume").setDescription("Resume playback"))
        .addSubcommand((s) => s.setName("queue").setDescription("Show the queue"))
        .addSubcommand((s) => s.setName("nowplaying").setDescription("Show the current track"))
        .addSubcommand((s) => s.setName("clear").setDescription("Clear the queue"))
        .addSubcommand((s) =>
            s
                .setName("volume")
                .setDescription("Set volume (0–100)")
                .addIntegerOption((o) =>
                    o
                        .setName("amount")
                        .setDescription("Volume percent")
                        .setMinValue(0)
                        .setMaxValue(100)
                        .setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("loop")
                .setDescription("Loop mode")
                .addStringOption((o) =>
                    o
                        .setName("mode")
                        .setDescription("off | song | queue")
                        .setRequired(true)
                        .addChoices(
                            { name: "Off", value: "off" },
                            { name: "Song", value: "song" },
                            { name: "Queue", value: "queue" }
                        )
                )
        )
        .addSubcommand((s) => s.setName("shuffle").setDescription("Shuffle the queue")),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const data = getMusicData(guildId);

        if (sub === "play") {
            const query = interaction.options.getString("query");
            const member = interaction.member;
            if (!member.voice.channel) {
                return interaction.reply({
                    content: "❌ Join a voice channel first.",
                    ephemeral: true
                });
            }
            await interaction.deferReply();
            try {
                await interaction.editReply("🔍 Searching…");
            } catch (_) {}
            try {
                const track = await resolveTrack(query);
                const conn = await connect(member);
                const music = getMusicData(guildId) || conn;
                if (music.current || music.player?.state?.status === "playing") {
                    music.queue.push({ title: track.title, url: track.url });
                    return interaction.editReply(
                        `➕ Queued **${track.title}** (\`${track.source}\`)`
                    );
                }
                await playSong(music, track.title, track.url);
                return interaction.editReply(
                    `▶️ Playing **${track.title}** (\`${track.source}\`)`
                );
            } catch (err) {
                console.error("[music play]", err?.code || "", err?.message || err);
                let msg = err?.message || "Failed to play that track.";
                if (err?.code === "MUSIC_YOUTUBE_DISABLED") {
                    msg =
                        "YouTube is disabled. Use a song name, SoundCloud link, or Spotify link.";
                } else if (err?.code === "TIMEOUT") {
                    msg = "Search timed out. Try a SoundCloud URL or shorter query.";
                } else if (
                    err?.code === "MUSIC_SPOTIFY_CONFIG" ||
                    err?.code === "MUSIC_SPOTIFY_FAILED"
                ) {
                    msg =
                        err.message ||
                        "Spotify is not fully configured. Use a song name or SoundCloud link.";
                } else if (
                    err?.code === "MUSIC_STREAM_FAILED" ||
                    err?.code === "MUSIC_NOT_PLAYING"
                ) {
                    msg =
                        "Found the track but could not play audio. Ensure ffmpeg is available and the bot can Speak.";
                } else if (err?.code === "MUSIC_SEARCH_FAILED") {
                    msg =
                        "Music search is unavailable right now. Paste a direct SoundCloud track URL.";
                }
                return interaction.editReply(`❌ ${msg}`.replace(/^❌ ❌/, "❌"));
            }
        }

        if (!interaction.member.voice.channel && sub !== "queue" && sub !== "nowplaying") {
            return interaction.reply({
                content: "❌ Join a voice channel first.",
                ephemeral: true
            });
        }

        if (sub === "skip") {
            if (!data?.current) {
                return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
            }
            const skipped = data.current.title;
            data.player.stop();
            data.current = null;
            return interaction.reply(`⏭️ Skipped **${skipped}**.`);
        }

        if (sub === "stop") {
            if (!data) {
                return interaction.reply({
                    content: "❌ I'm not in a voice channel.",
                    ephemeral: true
                });
            }
            destroy(guildId);
            return interaction.reply("⏹️ Music stopped.");
        }

        if (sub === "pause") {
            if (!data?.current) {
                return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
            }
            data.player.pause();
            return interaction.reply("⏸️ Paused.");
        }

        if (sub === "resume") {
            if (!data?.current) {
                return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
            }
            data.player.unpause();
            return interaction.reply("▶️ Resumed.");
        }

        if (sub === "queue") {
            if (!data?.current && !(data?.queue?.length)) {
                return interaction.reply({ content: "📭 Queue is empty.", ephemeral: true });
            }
            const lines = [];
            if (data.current) lines.push(`**Now:** ${data.current.title}`);
            (data.queue || []).slice(0, 15).forEach((t, i) => {
                lines.push(`\`${i + 1}.\` ${t.title}`);
            });
            return interaction.reply(lines.join("\n") || "📭 Queue is empty.");
        }

        if (sub === "nowplaying") {
            if (!data?.current) {
                return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
            }
            return interaction.reply(`🎵 **${data.current.title}**`);
        }

        if (sub === "clear") {
            if (!data) {
                return interaction.reply({ content: "❌ Queue is already empty.", ephemeral: true });
            }
            data.queue = [];
            return interaction.reply("🧹 Queue cleared.");
        }

        if (sub === "volume") {
            const amount = interaction.options.getInteger("amount");
            if (!data) {
                return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
            }
            data.volume = amount / 100;
            try {
                const res = data.player.state?.resource;
                if (res?.volume) res.volume.setVolume(data.volume);
            } catch (_) {}
            return interaction.reply(`🔊 Volume set to **${amount}%**.`);
        }

        if (sub === "loop") {
            const mode = interaction.options.getString("mode");
            if (!data) {
                return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
            }
            data.loop = mode;
            return interaction.reply(`🔁 Loop mode: **${mode}**.`);
        }

        if (sub === "shuffle") {
            if (!data?.queue?.length) {
                return interaction.reply({ content: "❌ Queue is empty.", ephemeral: true });
            }
            for (let i = data.queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [data.queue[i], data.queue[j]] = [data.queue[j], data.queue[i]];
            }
            return interaction.reply("🔀 Queue shuffled.");
        }

        return interaction.reply({ content: "Unknown music subcommand.", ephemeral: true });
    }
};
