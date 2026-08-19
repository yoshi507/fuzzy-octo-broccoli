const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const {
    getGuildSecurity,
    setGuildSecurity,
    addIncident
} = require("./ai/security.js");
const { loadDatabase } = require("../database/database.js");
const { askAI } = require("./ai/groq.js");

const actionWindows = new Map();
const alertCooldowns = new Map();

const DEFAULT_THRESHOLDS = {
    channelDelete: 3,
    roleDelete: 3,
    channelCreate: 5,
    roleCreate: 5,
    massDelete: 5
};

const WINDOW_MS = 30_000;
const ALERT_COOLDOWN_MS = 45_000;

function getAntiNukeConfig(guildId) {
    const security = getGuildSecurity(guildId);
    const anti = security.antiNuke || {};

    return {
        enabled: security.enabled === true,
        mode: security.mode || "monitor",
        windowMs: typeof anti.windowMs === "number" ? anti.windowMs : WINDOW_MS,
        thresholds: {
            ...DEFAULT_THRESHOLDS,
            ...(anti.thresholds || {})
        },
        autoTimeoutExecutor: anti.autoTimeoutExecutor === true,
        autoTimeoutMinutes:
            typeof anti.autoTimeoutMinutes === "number"
                ? anti.autoTimeoutMinutes
                : 10,
        ignoreBot: anti.ignoreBot !== false,
        ignoreOwner: anti.ignoreOwner !== false,
        alertCooldownMs:
            typeof anti.alertCooldownMs === "number"
                ? anti.alertCooldownMs
                : ALERT_COOLDOWN_MS
    };
}

function recordAction(guildId, type, windowMs = WINDOW_MS) {
    const now = Date.now();

    if (!actionWindows.has(guildId)) {
        actionWindows.set(guildId, {});
    }

    const guildActions = actionWindows.get(guildId);

    if (!guildActions[type]) {
        guildActions[type] = [];
    }

    guildActions[type] = guildActions[type].filter(
        ts => now - ts < windowMs
    );
    guildActions[type].push(now);

    return guildActions[type].length;
}

function getActionCount(guildId, type, windowMs = WINDOW_MS) {
    const guildActions = actionWindows.get(guildId);
    if (!guildActions || !guildActions[type]) {
        return 0;
    }

    const now = Date.now();
    guildActions[type] = guildActions[type].filter(
        ts => now - ts < windowMs
    );

    return guildActions[type].length;
}

async function getAuditLogExecutor(guild, actionType) {
    try {
        const logs = await guild.fetchAuditLogs({
            type: actionType,
            limit: 6
        });

        const entry = logs.entries.find(
            e => Date.now() - e.createdTimestamp < 15_000
        );

        return entry
            ? {
                  executor: entry.executor || null,
                  target: entry.target || null,
                  reason: entry.reason || null,
                  createdTimestamp: entry.createdTimestamp
              }
            : { executor: null, target: null, reason: null, createdTimestamp: null };
    } catch (error) {
        console.error(
            `[AntiNuke] Audit log lookup failed in ${guild.name}:`,
            error.message || error
        );
        return {
            executor: null,
            target: null,
            reason: null,
            createdTimestamp: null
        };
    }
}

function shouldIgnoreExecutor(guild, executor, config) {
    if (!executor) {
        return false;
    }

    if (config.ignoreBot && executor.bot) {
        return true;
    }

    if (guild.members.me && executor.id === guild.members.me.id) {
        return true;
    }

    if (config.ignoreOwner && executor.id === guild.ownerId) {
        return true;
    }

    return false;
}

function canSendAlert(guildId, type, cooldownMs) {
    const key = `${guildId}:${type}`;
    const last = alertCooldowns.get(key) || 0;
    const now = Date.now();

    if (now - last < cooldownMs) {
        return false;
    }

    alertCooldowns.set(key, now);
    return true;
}

async function resolveLogChannel(guild) {
    try {
        const database = loadDatabase();
        const logChannelId =
            database.settings?.[guild.id]?.modLogChannel ||
            database.logging?.[guild.id]?.channelId;

        if (!logChannelId) {
            return null;
        }

        const channel = guild.channels.cache.get(logChannelId);
        if (channel?.isTextBased()) {
            return channel;
        }
    } catch (error) {
        console.error("[AntiNuke] Log channel resolve error:", error);
    }

    return null;
}

async function sendAntiNukeAlert(guild, details) {
    const {
        actionLabel,
        count,
        windowSeconds,
        executor,
        mode,
        extra
    } = details;

    const logChannel = await resolveLogChannel(guild);

    const executorLine = executor
        ? `${executor.tag} (${executor.id})`
        : "Unknown (audit log unavailable or delayed)";

    const body =
        `🚨 **ANTI-NUKE ALERT**\n\n` +
        `Action: **${actionLabel}**\n` +
        `Detected: **${count}** in **${windowSeconds}s**\n` +
        `Server: **${guild.name}**\n` +
        `Executor: **${executorLine}**\n` +
        `Mode: **${String(mode).toUpperCase()}**\n` +
        (extra ? `${extra}\n` : "") +
        `\n⚠️ Omni detected potentially destructive activity.\n` +
        `No members were banned or kicked automatically.`;

    if (logChannel) {
        try {
            await logChannel.send(body);
            return;
        } catch (error) {
            console.error("[AntiNuke] Failed to send log channel alert:", error);
        }
    }

    try {
        const fallback =
            guild.systemChannel ||
            guild.channels.cache.find(
                c =>
                    c.isTextBased() &&
                    c.viewable &&
                    c.permissionsFor(guild.members.me)?.has(
                        PermissionFlagsBits.SendMessages
                    )
            );

        if (fallback) {
            await fallback.send(body);
        }
    } catch (error) {
        console.error("[AntiNuke] Fallback alert failed:", error);
    }
}

async function applySafeResponse(guild, executor, config, incidentType) {
    const security = getGuildSecurity(guild.id);

    if (config.mode !== "lockdown") {
        setGuildSecurity(guild.id, {
            ...security,
            mode: "lockdown",
            antiNuke: {
                ...(security.antiNuke || {}),
                lastLockdownAt: Date.now(),
                lastLockdownReason: incidentType
            }
        });
    }

    if (
        config.autoTimeoutExecutor &&
        executor &&
        !executor.bot &&
        executor.id !== guild.ownerId
    ) {
        try {
            const member = await guild.members
                .fetch(executor.id)
                .catch(() => null);

            if (
                member &&
                member.moderatable &&
                guild.members.me.roles.highest.position >
                    member.roles.highest.position
            ) {
                await member.timeout(
                    config.autoTimeoutMinutes * 60 * 1000,
                    `Omni anti-nuke protection (${incidentType})`
                );
                return { timedOut: true };
            }
        } catch (error) {
            console.error("[AntiNuke] Optional timeout failed:", error);
        }
    }

    return { timedOut: false };
}

async function analyseWithAI(guild, actionLabel, count, executor) {
    try {
        const analysis = await askAI(
            [
                {
                    role: "system",
                    content:
                        "You assist Discord anti-nuke monitoring. " +
                        "Given a short activity report, reply in 2-3 sentences: " +
                        "whether this looks like destructive abuse, confidence 0-100, and a cautious staff tip. " +
                        "Never recommend automatic bans or kicks."
                },
                {
                    role: "user",
                    content:
                        `Server: ${guild.name}\n` +
                        `Action: ${actionLabel}\n` +
                        `Count in window: ${count}\n` +
                        `Executor: ${executor ? `${executor.tag} (${executor.id})` : "unknown"}`
                }
            ],
            {
                guildId: guild.id,
                temperature: 0.2,
                maxTokens: 200
            }
        );
        return analysis || null;
    } catch (error) {
        if (error && error.code === "AI_DAILY_LIMIT") {
            return null;
        }
        console.error("[AntiNuke] AI analysis skipped:", error.message || error);
        return null;
    }
}

async function handleDestructiveAction(guild, type, auditLogType, actionLabel) {
    if (!guild) {
        return;
    }

    const config = getAntiNukeConfig(guild.id);

    if (!config.enabled) {
        return;
    }

    const count = recordAction(guild.id, type, config.windowMs);
    const threshold = config.thresholds[type] ?? DEFAULT_THRESHOLDS[type] ?? 5;

    let massDeleteCount = 0;
    if (type === "channelDelete" || type === "roleDelete") {
        massDeleteCount =
            getActionCount(guild.id, "channelDelete", config.windowMs) +
            getActionCount(guild.id, "roleDelete", config.windowMs);
    }

    const hitPrimary = count >= threshold;
    const hitMassDelete =
        massDeleteCount >= (config.thresholds.massDelete || DEFAULT_THRESHOLDS.massDelete) &&
        (type === "channelDelete" || type === "roleDelete");

    if (!hitPrimary && !hitMassDelete) {
        return;
    }

    const audit = await getAuditLogExecutor(guild, auditLogType);
    const executor = audit.executor;

    if (shouldIgnoreExecutor(guild, executor, config)) {
        addIncident(guild.id, {
            type: `anti_nuke_${type}_ignored`,
            count,
            reason: "Executor ignored (bot or owner)",
            executorId: executor?.id || null
        });
        return;
    }

    const incidentType = hitMassDelete
        ? "anti_nuke_mass_delete"
        : `anti_nuke_${type}`;

    addIncident(guild.id, {
        type: incidentType,
        action: type,
        count: hitMassDelete ? massDeleteCount : count,
        threshold,
        executorId: executor?.id || null,
        executorTag: executor?.tag || null,
        auditAvailable: Boolean(executor),
        mode: config.mode
    });

    const alertType = hitMassDelete ? "massDelete" : type;
    if (!canSendAlert(guild.id, alertType, config.alertCooldownMs)) {
        return;
    }

    const windowSeconds = Math.round(config.windowMs / 1000);

    await sendAntiNukeAlert(guild, {
        actionLabel: hitMassDelete ? "MASS DELETION (channels/roles)" : actionLabel,
        count: hitMassDelete ? massDeleteCount : count,
        windowSeconds,
        executor,
        mode: config.mode,
        extra: audit.reason ? `Audit reason: ${audit.reason}` : null
    });

    const aiNote = await analyseWithAI(
        guild,
        hitMassDelete ? "MASS DELETION" : actionLabel,
        hitMassDelete ? massDeleteCount : count,
        executor
    );
    if (aiNote) {
        addIncident(guild.id, {
            type: "anti_nuke_ai_note",
            parentType: incidentType,
            note: String(aiNote).slice(0, 500)
        });
        const logChannel = await resolveLogChannel(guild);
        if (logChannel) {
            await logChannel
                .send(`🤖 **AI note (advisory):** ${String(aiNote).slice(0, 500)}`)
                .catch(() => {});
        }
    }

    if (config.mode === "alert" || config.mode === "lockdown") {
        const result = await applySafeResponse(
            guild,
            executor,
            config,
            incidentType
        );

        if (result.timedOut && executor) {
            const logChannel = await resolveLogChannel(guild);
            if (logChannel) {
                await logChannel
                    .send(
                        `🔇 Anti-nuke timed out **${executor.tag}** for **${config.autoTimeoutMinutes} minutes** (configured).`
                    )
                    .catch(() => {});
            }
        }
    }
}

function registerAntiNukeListeners(client) {
    client.on("channelDelete", async channel => {
        try {
            if (!channel.guild) return;
            await handleDestructiveAction(
                channel.guild,
                "channelDelete",
                AuditLogEvent.ChannelDelete,
                "CHANNEL DELETION"
            );
        } catch (error) {
            console.error("[AntiNuke] channelDelete error:", error);
        }
    });

    client.on("roleDelete", async role => {
        try {
            await handleDestructiveAction(
                role.guild,
                "roleDelete",
                AuditLogEvent.RoleDelete,
                "ROLE DELETION"
            );
        } catch (error) {
            console.error("[AntiNuke] roleDelete error:", error);
        }
    });

    client.on("channelCreate", async channel => {
        try {
            if (!channel.guild) return;
            await handleDestructiveAction(
                channel.guild,
                "channelCreate",
                AuditLogEvent.ChannelCreate,
                "CHANNEL CREATION"
            );
        } catch (error) {
            console.error("[AntiNuke] channelCreate error:", error);
        }
    });

    client.on("roleCreate", async role => {
        try {
            await handleDestructiveAction(
                role.guild,
                "roleCreate",
                AuditLogEvent.RoleCreate,
                "ROLE CREATION"
            );
        } catch (error) {
            console.error("[AntiNuke] roleCreate error:", error);
        }
    });
}

module.exports = {
    getAntiNukeConfig,
    recordAction,
    getAuditLogExecutor,
    handleDestructiveAction,
    registerAntiNukeListeners,
    sendAntiNukeAlert,
    DEFAULT_THRESHOLDS,
    WINDOW_MS
};
