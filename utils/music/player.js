/**
 * OmniBot music player.
 * Pipeline: URL → temp file → ffmpeg PCM → Discord voice
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
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
const { withTimeout } = require("../withTimeout.js");

let depsLogged = false;
let sodiumReady = false;

function resolveFfmpegPath() {
    try {
        const p = require("ffmpeg-static");
        if (p && fs.existsSync(p)) return p;
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
        console.warn("[Music] libsodium-wrappers:", e?.message || e);
    }
    try {
        require("@discordjs/opus");
        console.log("[Music] @discordjs/opus loaded");
    } catch (e) {
        console.warn("[Music] @discordjs/opus:", e?.message || e);
        try {
            require("opusscript");
            console.log("[Music] opusscript loaded");
        } catch (_) {}
    }
    try {
        require("tweetnacl");
    } catch (_) {}

    if (!depsLogged) {
        depsLogged = true;
        try {
            console.log("[Music] dependency report:\n" + generateDependencyReport());
        } catch (e) {
            console.warn("[Music] dep report:", e?.message || e);
        }
        console.log("[Music] ffmpeg:", resolveFfmpegPath());
    }
}

initVoiceDeps().catch(() => {});

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
            tempFiles: [],
            volume: 1,
            loop: "off",
            leaveTimer: null,
            voiceChannelId: null
        };

        player.on(AudioPlayerStatus.Idle, async () => {
            cleanupTemps(data);
            if (!data.current) return;
            if (data.loop === "song") {
                try {
                    await playSong(data, data.current.title, data.current.url);
                } catch (e) {
                    console.error("[Music] loop failed:", e?.message || e);
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
                    console.error("[Music] next failed:", e?.message || e);
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
    for (const proc of data.procs || []) {
        try {
            if (proc && !proc.killed) proc.kill("SIGKILL");
        } catch (_) {}
    }
    data.procs = [];
}

function cleanupTemps(data) {
    for (const f of data.tempFiles || []) {
        try {
            if (f && fs.existsSync(f)) fs.unlinkSync(f);
        } catch (_) {}
    }
    data.tempFiles = [];
}

function tempPath(ext) {
    return path.join(
        os.tmpdir(),
        `omnibot-music-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    );
}

async function downloadToFile(url) {
    const out = tempPath("audio");
    const ytdlpOk = await new Promise((resolve) => {
        const args = [
            "-f", "bestaudio/best", "-o", out,
            "--no-playlist", "--no-warnings", "--no-check-certificates", url
        ];
        const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
        let err = "";
        proc.stderr.on("data", (c) => { err += c.toString(); });
        proc.on("error", () => resolve(false));
        proc.on("close", (code) => {
            if (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 1000) {
                resolve(true);
            } else {
                if (err) console.warn("[Music] yt-dlp:", err.slice(0, 200));
                try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch (_) {}
                resolve(false);
            }
        });
    });
    if (ytdlpOk) {
        console.log("[Music] downloaded via yt-dlp:", out, fs.statSync(out).size);
        return out;
    }

    try {
        const play = require("play-dl");
        console.log("[Music] play-dl download:", String(url).slice(0, 100));
        const streamInfo = await withTimeout(
            play.stream(url, { discordPlayerCompatibility: true }),
            30000,
            "play-dl stream"
        );
        const dest = tempPath("webm");
        await new Promise((resolve, reject) => {
            const ws = fs.createWriteStream(dest);
            streamInfo.stream.pipe(ws);
            streamInfo.stream.on("error", reject);
            ws.on("error", reject);
            ws.on("finish", resolve);
        });
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
            console.log("[Music] downloaded via play-dl:", dest, fs.statSync(dest).size);
            return dest;
        }
        try { fs.unlinkSync(dest); } catch (_) {}
    } catch (e) {
        console.warn("[Music] play-dl download failed:", e?.message || e);
    }

    return null;
}

function spawnFfmpegFromFile(filePath) {
    const bin = resolveFfmpegPath();
    const proc = spawn(
        bin,
        [
            "-hide_banner", "-loglevel", "error",
            "-i", filePath,
            "-analyzeduration", "0",
            "-f", "s16le", "-ar", "48000", "-ac", "2",
            "pipe:1"
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
    );
    proc.stderr.on("data", (chunk) => {
        const line = chunk.toString().trim();
        if (line) console.warn("[Music] ffmpeg:", line.slice(0, 200));
    });
    proc.on("error", (err) => {
        console.error("[Music] ffmpeg spawn error:", err?.message || err);
    });
    return proc;
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
        try { existing.connection.destroy(); } catch (_) {}
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
    } catch {
        try { connection.destroy(); } catch (_) {}
        throw new Error("Could not join voice in time. Need Connect + Speak permissions.");
    }

    const data = getPlayer(guild.id);
    data.connection = connection;
    data.voiceChannelId = voiceChannel.id;
    connection.subscribe(data.player);

    connection.on("stateChange", (o, n) => {
        if (o.status !== n.status) {
            console.log(`[Music] conn ${guild.id}: ${o.status} → ${n.status}`);
        }
    });

    return data;
}

async function playSong(data, title, url) {
    await initVoiceDeps();
    if (!data?.connection) throw new Error("Not connected to a voice channel.");
    if (/youtu\.be|youtube\.com/i.test(String(url))) {
        throw new Error("YouTube is disabled.");
    }

    killProcs(data);
    cleanupTemps(data);
    try { data.connection.subscribe(data.player); } catch (_) {}

    console.log(`[Music] preparing: ${title} | ${String(url).slice(0, 120)}`);
    const file = await downloadToFile(url);
    if (!file) {
        const err = new Error("Could not download audio. Try a direct SoundCloud track URL.");
        err.code = "MUSIC_STREAM_FAILED";
        throw err;
    }
    data.tempFiles.push(file);

    const ff = spawnFfmpegFromFile(file);
    data.procs.push(ff);

    const resource = createAudioResource(ff.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true
    });
    if (resource.volume) resource.volume.setVolume(data.volume ?? 1);

    data.current = { title, url };
    data.player.play(resource);

    try {
        await entersState(data.player, AudioPlayerStatus.Playing, 25000);
        console.log(`[Music] PLAYING: ${title}`);
    } catch {
        killProcs(data);
        cleanupTemps(data);
        data.current = null;
        const err = new Error(
            "Audio never started. Check bot is not server-muted and has Speak permission."
        );
        err.code = "MUSIC_NOT_PLAYING";
        throw err;
    }
}

function destroy(guildId) {
    const data = players.get(guildId);
    if (!data) return;
    if (data.leaveTimer) clearTimeout(data.leaveTimer);
    killProcs(data);
    cleanupTemps(data);
    try { data.player.stop(true); } catch (_) {}
    if (data.connection) {
        try { data.connection.destroy(); } catch (_) {}
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
