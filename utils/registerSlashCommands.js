/**
 * Register slash commands with Discord.
 * Global only by default. Clears guild-scoped commands on EVERY guild
 * so Discord does not show duplicates (global + guild).
 */

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

function collectCommandJson() {
    const commandsPath = path.join(__dirname, "../commands");
    const commands = [];
    if (!fs.existsSync(commandsPath)) return commands;

    for (const file of fs.readdirSync(commandsPath)) {
        if (!file.endsWith(".js") || file.startsWith("_")) continue;
        try {
            const command = require(path.join(commandsPath, file));
            if (command?.data?.toJSON) {
                commands.push(command.data.toJSON());
            } else if (command?.data) {
                commands.push(command.data);
            } else {
                console.warn(`[SlashRegister] Skipping ${file}: no data export`);
            }
        } catch (err) {
            console.error(
                `[SlashRegister] Failed to load ${file}:`,
                err?.message || err
            );
        }
    }
    return commands;
}

async function clearGuildCommands(rest, clientId, guildIds) {
    const ids = [...new Set((guildIds || []).filter(Boolean).map(String))];
    let cleared = 0;
    for (const guildId of ids) {
        try {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
                body: []
            });
            cleared++;
            console.log(`[SlashRegister] Cleared guild-scoped commands on ${guildId}`);
        } catch (err) {
            console.warn(
                `[SlashRegister] Could not clear guild ${guildId}:`,
                err?.message || err
            );
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    return cleared;
}

async function registerSlashCommands(client) {
    const token =
        process.env.DISCORD_TOKEN ||
        process.env.TOKEN ||
        process.env.BOT_TOKEN;
    // Prefer the logged-in application's ID — env CLIENT_ID can be wrong/stale
    const clientId =
        client?.user?.id ||
        client?.application?.id ||
        process.env.CLIENT_ID ||
        process.env.DISCORD_CLIENT_ID;

    if (!token) {
        console.error("[SlashRegister] No Discord token — cannot register commands");
        return { ok: false, reason: "no_token" };
    }
    if (!clientId) {
        console.error("[SlashRegister] No client ID — cannot register commands");
        return { ok: false, reason: "no_client_id" };
    }
    console.log(`[SlashRegister] Using application id=${clientId}`);

    const body = collectCommandJson();
    if (!body.length) {
        console.warn("[SlashRegister] No commands found to register");
        return { ok: false, reason: "empty" };
    }

    const names = body.map((c) => c.name).sort();
    console.log(
        `[SlashRegister] Command set (${body.length}): ${names.join(", ")}`
    );

    const featureNames = ["swearjar", "automation", "captcha", "userphone", "forumhelp"];
    const present = featureNames.filter((n) => names.includes(n));
    const missing = featureNames.filter((n) => !names.includes(n));
    console.log(
        `[SlashRegister] Feature slash present: ${present.join(", ") || "(none)"}${
            missing.length ? ` | MISSING: ${missing.join(", ")}` : ""
        }`
    );

    const rest = new REST({ version: "10" }).setToken(token);

    try {
        console.log(
            `[SlashRegister] Deploying ${body.length} GLOBAL application commands…`
        );
        await rest.put(Routes.applicationCommands(clientId), { body });
        console.log(
            `✅ Registered ${body.length} global slash command(s). Old global commands are replaced.`
        );

        const guildIds = [];
        if (client?.guilds?.cache?.size) {
            for (const id of client.guilds.cache.keys()) guildIds.push(id);
        }
        const envGuild =
            process.env.SLASH_COMMANDS_GUILD_ID || process.env.GUILD_ID || null;
        if (envGuild) guildIds.push(envGuild);

        if (process.env.SLASH_COMMANDS_GUILD_MIRROR === "1" && envGuild) {
            await rest.put(Routes.applicationGuildCommands(clientId, envGuild), {
                body
            });
            console.log(
                `✅ Mirrored ${body.length} command(s) to guild ${envGuild} only`
            );
            const others = guildIds.filter((id) => id !== String(envGuild));
            await clearGuildCommands(rest, clientId, others);
        } else {
            const n = await clearGuildCommands(rest, clientId, guildIds);
            console.log(
                `[SlashRegister] Cleared guild-scoped commands on ${n} guild(s). Duplicates should disappear after Discord refreshes.`
            );
        }

        return { ok: true, scope: "global", count: body.length };
    } catch (err) {
        const raw = err?.rawError || err?.data || null;
        console.error(
            "[SlashRegister] Deployment failed:",
            err?.message || err
        );
        if (raw) {
            try {
                console.error("[SlashRegister] Discord raw error:", JSON.stringify(raw).slice(0, 1500));
            } catch (_) {
                console.error("[SlashRegister] Discord raw error (unstringifiable)");
            }
        }
        return { ok: false, reason: err?.message || "error", raw };
    }
}

module.exports = { registerSlashCommands, collectCommandJson };
