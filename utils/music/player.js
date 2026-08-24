/**
 * OmniBot music player — multi-strategy playback.
 * Tries: play-dl direct → download+probe → download+ffmpeg PCM
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    entersState,
    StreamType,
    demuxProbe,
    generateDependencyReport
} = require("@discordjs/voice");
const { withTimeout } = require("../withTimeout.js");

let depsLogged = false;
let sodiumReady = false;

function resolveFfmpegPath() {
    try {
        const p = require("ffmpeg-static");
        if (p && fs.existsSync(p)) return p;
    } catch (_) {}
    for (const cand of ["ffmpeg", "/usr/bin/ffmpeg", "/bin/ffmpeg"]) {
        try {
            execFileSync(cand, ["-version"], { stdio: "ignore" });
            return cand;
        } catch (_) {}
    }
    return process.env.FFMPEG_PATH || "ffmpeg";
}

async function initVoiceDeps() {
    if (sodiumReady) return true;
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
        console.log("[Music] @discordjs/opus OK");
    } catch (e) {
        console.warn("[Music] @discordjs/opus FAIL:", e?.message || e);
        try {
            require("opusscript");
            console.log("[Music] opusscript OK");
        } catch (e2) {
            console.warn("[Music] opusscript FAIL:", e2?.message || e2);
        }
    }
    try {
        require("tweetnacl");
    } catch (_) {}

    if (!depsLogged) {
        depsLogged = true;
        try {
            console.log("[Music] deps:\n" + generateDependencyReport());
        } catch (_) {}
        console.log("[Music] ffmpeg binary:", resolveFfmpegPath());
    }
    return sodiumReady;
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
            voiceChannelId: null
        };

        player.on(AudioPlayerStatus.Idle, async () => {
            cleanupTemps(data);
            if (!data.current) return;
            if (data.loop === "song") {
                try {
                    await playSong(data, data.current.title, data.current.url);
                } catch (e) {
                    console.error("[Music] loop:", e?.message || e);
                    data.current = null;
                }
                return;
            }
            if (data.loop === "queue" && data.queue.length) {
                data.queue.push(data.current);
            }
            if (data.queue.length) {
                const next = data.queue.shift();
                try {
                    await playSong(data, next.title, next.url);
                } catch (e) {
                    console.error("[Music] next:", e?.message || e);
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
    for (const p of data.procs || []) {
        try {
            if (p && !p.killed) p.kill("SIGKILL");
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
        `omni-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    );
}

async function downloadToFile(url) {
    const outTpl = tempPath("audio");
    const ytdlp = await new Promise((resolve) => {
        const args = [
            "-f", "bestaudio/best", "-o", outTpl,
            "--no-playlist", "--no-warnings", "--no-check-certificates",
            "--extract-audio", "--audio-format", "mp3", url
        ];
        const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        proc.stderr.on("data", (c) => { stderr += c.toString(); });
        proc.on("error", (e) => {
            console.warn("[Music] yt-dlp missing:", e?.message || e);
            resolve(null);
        });
        proc.on("close", (code) => {
            const candidates = [outTpl, outTpl + ".mp3", outTpl + ".webm", outTpl + ".m4a", outTpl + ".opus"];
            for (const c of candidates) {
                if (fs.existsSync(c) && fs.statSync(c).size > 2000) {
                    console.log("[Music] yt-dlp file:", c, fs.statSync(c).size);
                    resolve(c);
                    return;
                }
            }
            if (stderr) console.warn("[Music] yt-dlp:", stderr.slice(0, 250));
            resolve(null);
        });
    });
    if (ytdlp) return ytdlp;

    try {
        const play = require("play-dl");
        const info = await withTimeout(
            play.stream(url, { discordPlayerCompatibility: true }),
            30000,
            "play-dl stream"
        );
        const dest = tempPath("bin");
        await new Promise((resolve, reject) => {
            const ws = fs.createWriteStream(dest);
            info.stream.pipe(ws);
            info.stream.on("error", reject);
            ws.on("error", reject);
            ws.on("finish", resolve);
            setTimeout(() => reject(new Error("download timeout")), 45000);
        });
        if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
            console.log("[Music] play-dl file:", dest, fs.statSync(dest).size);
            return dest;
        }
    } catch (e) {
        console.warn("[Music] play-dl download:", e?.message || e);
    }
    return null;
}

async function tryPlayDirectPlayDl(data, url) {
    const play = require("play-dl");
    console.log("[Music] strategy=play-dl-direct");
    const info = await withTimeout(
        play.stream(url, { discordPlayerCompatibility: true }),
        25000,
        "play-dl"
    );
    if (!info?.stream) throw new Error("play-dl returned no stream");
    const type = info.type || StreamType.Arbitrary;
    console.log("[Music] play-dl stream type:", type);
    const resource = createAudioResource(info.stream, { inputType: type, inlineVolume: true });
    if (resource.volume) resource.volume.setVolume(data.volume ?? 1);
    data.player.play(resource);
    await entersState(data.player, AudioPlayerStatus.Playing, 15000);
    return "play-dl-direct";
}

async function tryPlayProbeFile(data, filePath) {
    console.log("[Music] strategy=demuxProbe file");
    const { stream, type } = await demuxProbe(fs.createReadStream(filePath));
    console.log("[Music] probe type:", type);
    const resource = createAudioResource(stream, { inputType: type, inlineVolume: true });
    if (resource.volume) resource.volume.setVolume(data.volume ?? 1);
    data.player.play(resource);
    await entersState(data.player, AudioPlayerStatus.Playing, 15000);
    return "demuxProbe";
}

async function tryPlayFfmpegFile(data, filePath) {
    const bin = resolveFfmpegPath();
    console.log("[Music] strategy=ffmpeg-pcm bin=", bin);
    const ff = spawn(
        bin,
        [
            "-hide_banner", "-loglevel", "error", "-re", "-i", filePath,
            "-analyzeduration", "0", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
    );
    data.procs.push(ff);
    let ffErr = "";
    ff.stderr.on("data", (c) => { ffErr += c.toString(); });
    ff.on("error", (e) => { console.error("[Music] ffmpeg spawn:", e?.message || e); });
    await new Promise((r) => setTimeout(r, 300));
    if (ff.exitCode != null) throw new Error(`ffmpeg exited early: ${ffErr || ff.exitCode}`);
    const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });
    if (resource.volume) resource.volume.setVolume(data.volume ?? 1);
    data.player.play(resource);
    await entersState(data.player, AudioPlayerStatus.Playing, 20000);
    return "ffmpeg-pcm";
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
        throw new Error("Could not join voice in time. Need Connect + Speak.");
    }

    const data = getPlayer(guild.id);
    data.connection = connection;
    data.voiceChannelId = voiceChannel.id;
    connection.subscribe(data.player);

    connection.on("stateChange", (o, n) => {
        if (o.status !== n.status) {
            console.log(`[Music] voice ${guild.id}: ${o.status} → ${n.status}`);
        }
    });

    return data;
}

async function playSong(data, title, url) {
    await initVoiceDeps();
    if (!data?.connection) throw new Error("Not connected to a voice channel.");
    if (/youtu\.be|youtube\.com/i.test(String(url))) throw new Error("YouTube is disabled.");

    killProcs(data);
    cleanupTemps(data);
    try { data.connection.subscribe(data.player); } catch (_) {}
    try { data.player.stop(true); } catch (_) {}

    console.log(`[Music] play request: ${title} | ${String(url).slice(0, 120)}`);
    const errors = [];

    try {
        const via = await tryPlayDirectPlayDl(data, url);
        data.current = { title, url };
        console.log(`[Music] PLAYING via ${via}: ${title}`);
        return;
    } catch (e) {
        errors.push("direct: " + (e?.message || e));
        console.warn("[Music] direct failed:", e?.message || e);
        try { data.player.stop(true); } catch (_) {}
    }

    const file = await downloadToFile(url);
    if (file) data.tempFiles.push(file);

    if (file) {
        try {
            const via = await tryPlayProbeFile(data, file);
            data.current = { title, url };
            console.log(`[Music] PLAYING via ${via}: ${title}`);
            return;
        } catch (e) {
            errors.push("probe: " + (e?.message || e));
            console.warn("[Music] probe failed:", e?.message || e);
            try { data.player.stop(true); } catch (_) {}
        }

        try {
            const via = await tryPlayFfmpegFile(data, file);
            data.current = { title, url };
            console.log(`[Music] PLAYING via ${via}: ${title}`);
            return;
        } catch (e) {
            errors.push("ffmpeg: " + (e?.message || e));
            console.warn("[Music] ffmpeg failed:", e?.message || e);
            try { data.player.stop(true); } catch (_) {}
        }
    } else {
        errors.push("download: could not save audio file");
    }

    killProcs(data);
    cleanupTemps(data);
    data.current = null;

    const detail = errors.join(" | ");
    console.error("[Music] all strategies failed:", detail);
    const err = new Error(
        `Could not play audio (${detail.slice(0, 280)}). Try a different SoundCloud track URL.`
    );
    err.code = "MUSIC_NOT_PLAYING";
    throw err;
}

function destroy(guildId) {
    const data = players.get(guildId);
    if (!data) return;
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
