const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    entersState
} = require("@discordjs/voice");

const { ChannelType } = require("discord.js");
const { spawn } = require("child_process");

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
            loop: "off"
        };

        player.on(AudioPlayerStatus.Idle, async () => {
            if (!data.current) return;

            if (data.loop === "song") {
                await playSong(data, data.current.title, data.current.url);
                return;
            }

            if (data.loop === "queue" && data.queue.length > 0) {
                data.queue.push(data.current);
                const next = data.queue.shift();
                await playSong(data, next.title, next.url);
                return;
            }

            if (data.queue.length > 0) {
                const next = data.queue.shift();
                await playSong(data, next.title, next.url);
            } else {
                data.current = null;
            }
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
    if (existing && existing.connection) {
        return existing;
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 15000);

    const data = getPlayer(guild.id);
    data.connection = connection;
    connection.subscribe(data.player);

    let leaveTimer = null;

    const checkEmptyChannel = () => {
        const channel = member.guild.channels.cache.get(voiceChannel.id);
        if (!channel || channel.type !== ChannelType.GuildVoice) return;

        const humans = channel.members.filter((m) => !m.user.bot);
        if (humans.size === 0) {
            if (leaveTimer) clearTimeout(leaveTimer);
            leaveTimer = setTimeout(() => {
                const current = players.get(guild.id);
                if (current && current.connection) {
                    console.log(`Leaving empty voice channel in ${guild.name}`);
                    destroy(guild.id);
                }
            }, 30000);
        } else if (leaveTimer) {
            clearTimeout(leaveTimer);
            leaveTimer = null;
        }
    };

    member.client.on("voiceStateUpdate", (oldState, newState) => {
        if (
            oldState.channelId === voiceChannel.id ||
            newState.channelId === voiceChannel.id
        ) {
            checkEmptyChannel();
        }
    });

    return data;
}

async function playSong(data, title, url, startSeconds = 0) {
    if (data.ffmpeg) {
        try {
            data.ffmpeg.kill();
        } catch {
            /* ignore */
        }
        data.ffmpeg = null;
    }

    // Prefer play-dl stream (SoundCloud / direct). Never use YouTube.
    try {
        const play = require("play-dl");
        if (/youtu\.be|youtube\.com/i.test(String(url))) {
            throw new Error("YouTube streaming is disabled");
        }
        const streamInfo = await play.stream(url, {
            seek: startSeconds || undefined
        });
        const resource = createAudioResource(streamInfo.stream, {
            inputType: streamInfo.type,
            inlineVolume: true
        });
        if (resource.volume) {
            resource.volume.setVolume(data.volume ?? 1);
        }
        data.current = { title, url };
        data.player.play(resource);
        return;
    } catch (streamErr) {
        console.warn(
            "[Music] play-dl stream failed, trying yt-dlp non-YouTube:",
            streamErr?.message || streamErr
        );
    }

    if (/youtu\.be|youtube\.com/i.test(String(url))) {
        throw new Error("YouTube streaming is disabled");
    }

    const args = [
        "-f",
        "bestaudio/best",
        "-o",
        "-",
        "--no-playlist",
        "--quiet",
        "--no-warnings"
    ];
    if (startSeconds > 0) {
        args.push("--download-sections", `*${startSeconds}-inf`);
    }
    args.push(url);

    const ffmpeg = spawn("yt-dlp", args);
    data.ffmpeg = ffmpeg;

    ffmpeg.stderr.on("data", (output) => {
        const text = output.toString().trim();
        if (text) console.log("yt-dlp:", text);
    });
    ffmpeg.on("error", (error) => {
        console.error("yt-dlp error:", error);
    });

    const resource = createAudioResource(ffmpeg.stdout, {
        inputType: "arbitrary",
        inlineVolume: true
    });
    if (resource.volume) {
        resource.volume.setVolume(data.volume ?? 1);
    }

    data.current = { title, url };
    data.player.play(resource);
}

function destroy(guildId) {
    const data = players.get(guildId);
    if (!data) return;

    if (data.ffmpeg) {
        try {
            data.ffmpeg.kill();
        } catch {
            /* ignore */
        }
    }

    if (data.connection) {
        data.connection.destroy();
    }

    data.player.stop();
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
