/**
 * Register all slash commands with Discord.
 * ALWAYS registers GLOBAL commands so the bot profile shows "Supports Slash Commands".
 * Guild mirror is OFF by default — enabling both causes DUPLICATE commands in Discord.
 */

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

function collectCommandJson() {
    const commandsPath = path.join(__dirname, "../commands");
    const commands = [];
    if (!fs.existsSync(commandsPath)) {
        return commands;
    }

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

/**
 * @param {import('discord.js').Client} client
 */
async function registerSlashCommands(client) {
    const token =
        process.env.DISCORD_TOKEN ||
        process.env.TOKEN ||
        process.env.BOT_TOKEN;
    const clientId =
        process.env.CLIENT_ID ||
        process.env.DISCORD_CLIENT_ID ||
        client?.user?.id;

    if (!token) {
        console.error("[SlashRegister] No Discord token — cannot register commands");
        return { ok: false, reason: "no_token" };
    }
    if (!clientId) {
        console.error("[SlashRegister] No client ID — cannot register commands");
        return { ok: false, reason: "no_client_id" };
    }

    const body = collectCommandJson();
    if (!body.length) {
        console.warn("[SlashRegister] No commands found to register");
        return { ok: false, reason: "empty" };
    }

    const rest = new REST({ version: "10" }).setToken(token);
    const guildId =
        process.env.SLASH_COMMANDS_GUILD_ID ||
        process.env.GUILD_ID ||
        null;

    try {
        console.log(
            `[SlashRegister] Deploying ${body.length} GLOBAL application commands…`
        );
        await rest.put(Routes.applicationCommands(clientId), { body });
        console.log(
            `✅ Registered ${body.length} global slash command(s). Badge can take a short while to appear on the bot profile.`
        );

        // Avoid DUPLICATE commands (global + guild = two of every command in the picker).
        if (guildId) {
            if (process.env.SLASH_COMMANDS_GUILD_MIRROR === "1") {
                try {
                    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
                        body
                    });
                    console.log(
                        `✅ Mirrored ${body.length} command(s) to guild ${guildId} (SLASH_COMMANDS_GUILD_MIRROR=1)`
                    );
                } catch (err) {
                    console.warn(
                        "[SlashRegister] Guild mirror failed:",
                        err?.message || err
                    );
                }
            } else {
                try {
                    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
                        body: []
                    });
                    console.log(
                        `[SlashRegister] Cleared guild-scoped commands on ${guildId} so they do not duplicate global commands`
                    );
                } catch (err) {
                    console.warn(
                        "[SlashRegister] Clearing guild commands failed:",
                        err?.message || err
                    );
                }
            }
        }

        return { ok: true, scope: "global", count: body.length };
    } catch (err) {
        console.error(
            "[SlashRegister] Deployment failed:",
            err?.message || err
        );
        return { ok: false, reason: err?.message || "error" };
    }
}

module.exports = { registerSlashCommands, collectCommandJson };
