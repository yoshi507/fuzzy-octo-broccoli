/**
 * Manual slash-command deploy script.
 * Usage: node deploy-commands.js
 *
 * By default deploys GLOBAL commands (visible in all servers).
 * Set GUILD_ID or SLASH_COMMANDS_GUILD_ID to deploy to one guild only (instant).
 * Set SLASH_COMMANDS_GLOBAL=1 to force global even if a guild id is set.
 */
require("dotenv").config();

const { registerSlashCommands, collectCommandJson } = require("./utils/registerSlashCommands.js");

(async () => {
    const cmds = collectCommandJson();
    const names = cmds.map((c) => c.name).sort();
    console.log(`Found ${cmds.length} command(s): ${names.join(", ")}`);

    const result = await registerSlashCommands({
        user: { id: process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID }
    });
    if (!result?.ok) {
        process.exit(1);
    }
})();
