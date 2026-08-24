/**
 * OmniBot music player — reliable Discord voice playback.
 * Pipeline: resolve URL → stream → ffmpeg PCM → @discordjs/voice
 */

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    entersState,
    StreamType,
    generateDependencyReport
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js");
const { spawn } = require("child_process");
const { withTimeout } = require("../withTimeout.js");

let depsLogged = false;
let sodiumReady = false;

function resolveFfmpegPath() {
    try {
        const p = require("ffmpeg-static");
        if (p) return p;
    } catch (_) {}
    return process.env.FFMPEG_PATH || "ffmpeg";
}

async function initVoiceDeps() {
    if (sodiumReady) return;
    try {
        const sodium = require("libsodium-wrappers");
        await sodium.ready;
        sodiumReady = true;
        console.log("[Music] libsodium-wrappers ready");
    } catch (e) {
        console.warn("[Music] libsodium-wrappers not ready:", e?.message || e);
    }
    try {
        require("@discordjs/opus");
        console.log("[Music] @discordjs/opus loaded");
    } catch (e) {
        console.warn("[Music] @discordjs/opus missing:", e?.message || e);
        try { require("opusscript"); } catch (_) {}
    }
    try { require("tweetnacl"); } catch (_) {}

    if (!depsLogged) {
        depsLogged = true;
        try {
            console.log("[Music] voice dependency report:\n" + generateDependencyReport());
        } catch (e) {
            console.warn("[Music] dependency report failed:", e?.message || e);
        }
        console.log("[Music] ffmpeg path:", resolveFfmpegPath());
    }
}

initVoiceDeps().catch((e) => console.warn("[Music] initVoiceDeps:", e?.message || e));

const players = new Map();

function getPlayer(guildId) {
    if (!players.has(guildId)) {
        const player = createAudioPlayer();
        const data = {
            player,
            connection: null,
            queue: [],
            current: null,
            procs: [],
            volume: 1,
            loop: "off",
            leaveTimer: null,
            voiceChannelId: null
        };

        player.on(AudioPlayerStatus.Idle, async () => {
            if (!data.current) return;
            if (data.loop === "song") {
                try { await playSong(data, data.current.title, data.current.url); }
                catch (e) {
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
                try { await playSong(data, next.title, next.url); }
                catch (e) {
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

function killProcs(data) {
    const list = data.procs || [];
    data.procs = [];
    for (const proc of list) {
        try { if (proc && !proc.killed) proc.kill("SIGKILL"); } catch (_) {}
    }
}

async function connect(member) {
    await initVoiceDeps();
    const guild = member.guild;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) throw new Error("You must be in a voice channel first.");

    const existing = players.get(guild.id);
    if (
        existing?.connection &&
        existing.voiceChannelId === voiceChannel.id &&
        existing.connection.state.status !== VoiceConnectionStatus.Destroyed &&
        existing.connection.state.status !== VoiceConnectionStatus.Disconnected
    ) {
        return existing;
    }

    if (existing?.connection) {
        try { existing.connection.destroy(); } catch { /* ignore */ }
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 25000);
    } catch (e) {
        try { connection.destroy(); } catch { /* ignore */ }
        throw new Error(
            "Could not join the voice channel in time. Check Connect + Speak permissions."
        );
    }

    const data = getPlayer(guild.id);
    data.connection = connection;
    data.voiceChannelId = voiceChannel.id;
    connection.subscribe(data.player);

    connection.on("stateChange", (oldState, newState) => {
        if (oldState.status !== newState.status) {
            console.log(`[Music] connection ${guild.id}: ${oldState.status} → ${newState.status}`);
        }
        if (newState.status === VoiceConnectionStatus.Disconnected) {
            setTimeout(() => {
                if (data.connection?.state?.status === VoiceConnectionStatus.Disconnected) {
                    try { data.connection.destroy(); } catch { /* ignore */ }
                    data.connection = null;
                }
            }, 5000);
        }
    });

    const scheduleLeaveCheck = () => {
        if (data.leaveTimer) clearTimeout(data.leaveTimer);
        data.leaveTimer = setTimeout(() => {
            const channel = guild.channels.cache.get(data.voiceChannelId);
            if (!channel || channel.type !== ChannelType.GuildVoice) return;
            const humans = channel.members.filter((m) => !m.user.bot);
            if (humans.size === 0) {
                console.log(`[Music] Leaving empty VC in ${guild.name}`);
                destroy(guild.id);
            }
        }, 60000);
    };

    if (!data._voiceHooked) {
        data._voiceHooked = true;
        member.client.on("voiceStateUpdate", (oldState, newState) => {
            if (oldState.channelId === data.voiceChannelId || newState.channelId === data.voiceChannelId) {
                scheduleLeaveCheck();
            }
        });
    }

    return data;
}

function spawnFfmpegPcm() {
    const bin = resolveFfmpegPath();
    const proc = spawn(
        bin,
        [
            "-hide_banner", "-loglevel", "error",
            "-i", "pipe:0",
            "-analyzeduration", "0",
            "-f", "s16le",
            "-ar", "48000",
            "-ac", "2",
            "pipe:1"
        ],
        { stdio: ["pipe", "pipe", "pipe"] }
    );
    proc.stdin.on("error", () => {});
    proc.stdout.on("error", () => {});
    proc.stderr.on("data", (chunk) => {
        const line = chunk.toString().trim();
        if (line) console.warn("[Music] ffmpeg:", line.slice(0, 200));
    });
    proc.on("error", (err) => {
        console.error("[Music] ffmpeg spawn error:", err?.message || err);
    });
    return proc;
}

async function openInputStream(url, startSeconds = 0) {
    try {
        const play = require("play-dl");
        console.log(`[Music] play-dl open: ${String(url).slice(0, 100)}`);
        const streamInfo = await withTimeout(
            play.stream(url, {
                seek: startSeconds > 0 ? startSeconds : undefined,
                discordPlayerCompatibility: true
            }),
            25000,
            "play-dl stream"
        );
        if (streamInfo?.stream) {
            return { stream: streamInfo.stream, label: "play-dl", proc: null };
        }
    } catch (e) {
        console.warn("[Music] play-dl open failed:", e?.message || e);
    }

    try {
        console.log(`[Music] yt-dlp open: ${String(url).slice(0, 100)}`);
        const args = [
            "-f", "bestaudio/best", "-o", "-",
            "--no-playlist", "--quiet", "--no-warnings", "--no-check-certificates"
        ];
        if (startSeconds > 0) args.push("--download-sections", `*${startSeconds}-inf`);
        args.push(url);
        const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
        proc.stderr.on("data", (chunk) => {
            const line = chunk.toString().trim();
            if (line) console.log("[Music] yt-dlp:", line.slice(0, 180));
        });
        proc.on("error", (err) => {
            console.error("[Music] yt-dlp spawn error:", err?.message || err);
        });
        return { stream: proc.stdout, label: "yt-dlp", proc };
    } catch (e) {
        console.warn("[Music] yt-dlp open failed:", e?.message || e);
    }

    return null;
}

async function playSong(data, title, url, startSeconds = 0) {
    await initVoiceDeps();

    if (!data?.connection) throw new Error("Not connected to a voice channel.");
    if (/youtu\.be|youtube\.com/i.test(String(url))) {
        throw new Error("YouTube streaming is disabled.");
    }

    killProcs(data);
    try { data.connection.subscribe(data.player); } catch (_) {}

    const input = await openInputStream(url, startSeconds);
    if (!input?.stream) {
        const err = new Error("Could not open an audio stream (play-dl and yt-dlp both failed).");
        err.code = "MUSIC_STREAM_FAILED";
        throw err;
    }

    const ff = spawnFfmpegPcm();
    data.procs.push(ff);
    if (input.proc) data.procs.push(input.proc);

    input.stream.pipe(ff.stdin);
    input.stream.on("error", (e) => {
        console.warn("[Music] input stream error:", e?.message || e);
        try { ff.stdin.destroy(); } catch (_) {}
    });

    await new Promise((r) => setTimeout(r, 200));

    const resource = createAudioResource(ff.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true
    });
    if (resource.volume) resource.volume.setVolume(data.volume ?? 1);

    data.current = { title, url };
    data.player.play(resource);

    try {
        await entersState(data.player, AudioPlayerStatus.Playing, 20000);
        console.log(`[Music] now playing: ${title} (via ${input.label}→ffmpeg PCM)`);
    } catch {
        killProcs(data);
        data.current = null;
        const err = new Error(
            "Audio never reached Playing state. Check ffmpeg, Connect/Speak, and that the bot is not server-muted."
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
    killProcs(data);
    try { data.player.stop(true); } catch { /* ignore */ }
    if (data.connection) {
        try { data.connection.destroy(); } catch { /* ignore */ }
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
    playSong,
    initVoiceDeps
};
