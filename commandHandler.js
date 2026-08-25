const fs = require("fs");
const path = require("path");

function loadCommands(client) {
    const commandsPath = path.join(__dirname, "commands");

    if (!fs.existsSync(commandsPath)) {
        console.warn("⚠️ commands folder not found");
        return;
    }

    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js") && !file.startsWith("_"));

    let loaded = 0;
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        if (fs.statSync(filePath).isDirectory()) continue;
        try {
            const command = require(filePath);

            if ("data" in command && "execute" in command) {
                client.commands.set(command.data.name, command);
                loaded++;
            } else {
                console.warn(
                    `⚠️ Command ${file} is missing required "data" or "execute" export`
                );
            }
        } catch (error) {
            console.error(`❌ Failed to load command ${file}:`, error.message);
        }
    }

    console.log(`✅ Loaded ${loaded} command(s)`);

    const featureCmds = [
        "swearjar",
        "automation",
        "captcha",
        "userphone",
        "forumhelp"
    ];
    const missing = featureCmds.filter((n) => !client.commands.has(n));
    if (missing.length) {
        console.warn(
            "[Commands] Missing feature commands:",
            missing.join(", ")
        );
    } else {
        console.log(
            "[Commands] Feature commands OK: swearjar, automation, captcha, userphone, forumhelp"
        );
    }
}

module.exports = { loadCommands };
