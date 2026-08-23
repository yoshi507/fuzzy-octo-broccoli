const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    entersState,
    StreamType
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js");
const { spawn } = require("child_process");
const { withTimeout } = require("../withTimeout.js");

// Voice encryption — must load before first voice connection
try { require("libsodium-wrappers"); } catch (_) {}
try { require("@discordjs/opus"); } catch (_) {}

const players = new Map();

function getPlayer(guildId) {
    if (!players.has(guildId)) {
        const player = createAudioPlayer();
        const data = {
            player,
            connection: null,
            queue: [],
            current: null,
            ffmpeg: null,
            volume: 1,
            loop: "off",
            leaveTimer: null,
            voiceChannelId: null
        };

        player.on(AudioPlayerStatus.Idle, async () => {
            if (!data.current) return;

            if (data.loop === "song") {
                try {
                    await playSong(data, data.current.title, data.current.url);
                } catch (e) {
                    console.error("[Music] loop replay failed:", e?.message || e);
                    data.current = null;
                }
                return;
            }

            if (data.loop === "queue" && data.queue.length > 0) {
                data.queue.push(data.current);
            }

            if (data.queue.length > 0) {
                const next = data.queue.shift();
                try {
                    await playSong(data, next.title, next.url);
                } catch (e) {
                    console.error("[Music] next track failed:", e?.message || e);
                    data.current = null;
                }
            } else {
                data.current = null;
            }
        });

        player.on("error", (err) => {
            console.error("[Music] player error:", err?.message || err);
        });

        players.set(guildId, data);
    }
    return players.get(guildId);
}

async function connect(member) {
    const guild = member.guild;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        throw new Error("You must be in a voice channel first.");
    }

    const existing = players.get(guild.id);
    if (
        existing?.connection &&
        existing.voiceChannelId === voiceChannel.id &&
        existing.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
        return existing;
    }

    if (existing?.connection) {
        try {
            existing.connection.destroy();
        } catch {
            /* ignore */
        }
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20000);
    } catch (e) {
        try {
            connection.destroy();
        } catch {
            /* ignore */
        }
        throw new Error(
            "Could not join the voice channel in time. Check bot permissions (Connect + Speak)."
        );
    }

    const data = getPlayer(guild.id);
    data.connection = connection;
    data.voiceChannelId = voiceChannel.id;
    connection.subscribe(data.player);

    connection.on("stateChange", (_oldState, newState) => {
        if (newState.status === VoiceConnectionStatus.Disconnected) {
            setTimeout(() => {
                if (
                    data.connection &&
                    data.connection.state.status ===
                        VoiceConnectionStatus.Disconnected
                ) {
                    try {
                        data.connection.destroy();
                    } catch {
                        /* ignore */
                    }
                    data.connection = null;
                }
            }, 5000);
        }
    });

    const scheduleLeaveCheck = () => {
        if (data.leaveTimer) clearTimeout(data.leaveTimer);
        data.leaveTimer = setTimeout(() => {
            const channel = guild.channels.cache.get(voiceChannel.id);
            if (!channel || channel.type !== ChannelType.GuildVoice) return;
            const humans = channel.members.filter((m) => !m.user.bot);
            if (humans.size === 0) {
                console.log(`[Music] Leaving empty VC in ${guild.name}`);
                destroy(guild.id);
            }
        }, 30000);
    };

    member.client.on("voiceStateUpdate", (oldState, newState) => {
        if (
            oldState.channelId === voiceChannel.id ||
            newState.channelId === voiceChannel.id
        ) {
            scheduleLeaveCheck();
        }
    });

    return data;
}

function killFfmpeg(data) {
    if (data.ffmpeg) {
        try {
            data.ffmpeg.kill("SIGKILL");
        } catch {
            /* ignore */
        }
        data.ffmpeg = null;
    }
    if (data._ytdlp) {
        try {
            data._ytdlp.kill("SIGKILL");
        } catch {
            /* ignore */
        }
        data._ytdlp = null;
    }
}

async function streamWithPlayDl(url, startSeconds = 0) {
    const play = require("play-dl");
    const streamInfo = await withTimeout(
        play.stream(url, {
            seek: startSeconds > 0 ? startSeconds : undefined,
            discordPlayerCompatibility: true
        }),
        25000,
        "play-dl stream"
    );
    return streamInfo;
}

function streamWithYtDlp(url, startSeconds = 0) {
    const args = [
        "-f",
        "bestaudio/best",
        "-o",
        "-",
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "--no-check-certificates"
    ];
    if (startSeconds > 0) {
        args.push("--download-sections", `*${startSeconds}-inf`);
    }
    args.push(url);

    const proc = spawn("yt-dlp", args, {
        stdio: ["ignore", "pipe", "pipe"]
    });
    return proc;
}

/**
 * Decode arbitrary audio (mp3/webm/…) to Discord-ready PCM via ffmpeg.
 */
function pipeThroughFfmpeg(inputStream) {
    const proc = spawn(
        "ffmpeg",
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-analyzeduration",
            "0",
            "-f",
            "s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "pipe:1"
        ],
        { stdio: ["pipe", "pipe", "pipe"] }
    );
    inputStream.pipe(proc.stdin);
    inputStream.on("error", () => {
        try { proc.kill("SIGKILL"); } catch (_) {}
    });
    proc.stdin.on("error", () => {});
    proc.stderr.on("data", (chunk) => {
        const line = chunk.toString().trim();
        if (line) console.warn("[Music] ffmpeg:", line.slice(0, 180));
    });
    return proc;
}

async function playSong(data, title, url, startSeconds = 0) {
    if (!data?.connection) {
        throw new Error("Not connected to a voice channel.");
    }
    if (/youtu\.be|youtube\.com/i.test(String(url))) {
        throw new Error("YouTube streaming is disabled.");
    }

    killFfmpeg(data);

    try {
        data.connection.subscribe(data.player);
    } catch (_) {}

    let resource = null;
    let lastErr = null;

    try {
        console.log(`[Music] play-dl stream: ${String(url).slice(0, 100)}`);
        const streamInfo = await streamWithPlayDl(url, startSeconds);
        const inputType = streamInfo.type || StreamType.Arbitrary;
        resource = createAudioResource(streamInfo.stream, {
            inputType,
            inlineVolume: true
        });
    } catch (e) {
        lastErr = e;
        console.warn("[Music] play-dl failed:", e?.message || e);
    }

    if (!resource) {
        try {
            console.log(`[Music] yt-dlp+ffmpeg stream: ${String(url).slice(0, 100)}`);
            const ytdlp = streamWithYtDlp(url, startSeconds);
            ytdlp.stderr.on("data", (chunk) => {
                const line = chunk.toString().trim();
                if (line) console.log("[Music] yt-dlp:", line.slice(0, 200));
            });
            ytdlp.on("error", (err) => {
                console.error("[Music] yt-dlp spawn error:", err?.message || err);
            });
            const ff = pipeThroughFfmpeg(ytdlp.stdout);
            data.ffmpeg = ff;
            data._ytdlp = ytdlp;
            resource = createAudioResource(ff.stdout, {
                inputType: StreamType.Raw,
                inlineVolume: true
            });
        } catch (e) {
            lastErr = e;
            console.warn("[Music] yt-dlp/ffmpeg failed:", e?.message || e);
        }
    }

    if (!resource) {
        const err = new Error(
            lastErr?.message ||
                "Could not open an audio stream (SoundCloud/play-dl/yt-dlp/ffmpeg failed)."
        );
        err.code = "MUSIC_STREAM_FAILED";
        throw err;
    }

    if (resource.volume) {
        resource.volume.setVolume(data.volume ?? 1);
    }

    data.current = { title, url };
    data.player.play(resource);

    try {
        await entersState(data.player, AudioPlayerStatus.Playing, 15000);
        console.log(`[Music] now playing: ${title}`);
    } catch {
        killFfmpeg(data);
        data.current = null;
        const err = new Error(
            "Audio stream started but never reached Playing state. Ensure ffmpeg is installed on the host and the bot has Speak permission."
        );
        err.code = "MUSIC_NOT_PLAYING";
        throw err;
    }
}

function destroy(guildId) {
    const data = players.get(guildId);
    if (!data) return;

    if (data.leaveTimer) {
        clearTimeout(data.leaveTimer);
        data.leaveTimer = null;
    }
    killFfmpeg(data);

    try {
        data.player.stop(true);
    } catch {
        /* ignore */
    }
    if (data.connection) {
        try {
            data.connection.destroy();
        } catch {
            /* ignore */
        }
    }
    players.delete(guildId);
}

function getMusicData(guildId) {
    return players.get(guildId);
}

module.exports = {
    getPlayer,
    connect,
    destroy,
    getMusicData,
    createAudioResource,
    playSong
};
