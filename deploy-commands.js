require("dotenv").config();

const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const clientId = process.env.CLIENT_ID || "1538542627882799155";
const guildId = process.env.GUILD_ID || "1532634792246509618";

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing. Set it in .env before deploying commands.");
    process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandsPath)) {
    if (!file.endsWith(".js")) continue;

    try {
        const command = require(path.join(commandsPath, file));
        if (command.data) {
            commands.push(command.data.toJSON());
        } else {
            console.warn(`⚠️ Skipping ${file}: no data export`);
        }
    } catch (error) {
        console.error(`❌ Failed to load ${file}:`, error.message);
    }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Deploying ${commands.length} application guild commands...`);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: commands
        });
        console.log(`✅ Registered ${commands.length} commands to guild ${guildId}`);
    } catch (error) {
        console.error("❌ Command deployment failed:", error.message || error);
        process.exit(1);
    }
})();
