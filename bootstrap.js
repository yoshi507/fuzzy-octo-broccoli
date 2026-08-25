const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    Events,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");

const { loadCommands } = require("./commandHandler");
const { handleAppealInteraction } = require("./utils/appeals/interactions.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

client.commands = new Collection();

try {
    console.log(
        "[Startup] web env: PORT=" +
            (process.env.PORT || "unset") +
            " SERVER_PORT=" +
            (process.env.SERVER_PORT || "unset")
    );
    const { startApiServer } = require("./api/server.js");
    const srv = startApiServer(null);
    if (srv) {
        try {
            global.__omnibotHttpServer = srv;
        } catch (_) {}
        console.log("[Startup] Dashboard/API bound early for Wispbyte");
    } else {
        console.error("[Startup] API server did not start (null). Website will stay offline.");
    }
} catch (e) {
    console.error("[Startup] Failed to start API server early:", e?.message || e);
}

const eventNameMap = {
    messageCreate: Events.MessageCreate,
    guildMemberAdd: Events.GuildMemberAdd,
    guildMemberRemove: Events.GuildMemberRemove,
    messageDelete: Events.MessageDelete,
    interactionCreate: Events.InteractionCreate,
    clientReady: Events.ClientReady,
    ready: Events.ClientReady,
    threadCreate: Events.ThreadCreate
};

try {
    loadCommands(client);
} catch (e) {
    console.error("[Startup] loadCommands failed:", e?.message || e);
}

const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
    let loadedEvents = 0;
    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventsPath, file));
            const name = eventNameMap[event.name] || event.name;
            if (!name || typeof event.execute !== "function") continue;
            if (event.once) client.once(name, (...args) => event.execute(...args, client));
            else client.on(name, (...args) => event.execute(...args, client));
            loadedEvents++;
        } catch (err) {
            console.error(`Failed to load event ${file}:`, err?.message || err);
        }
    }
    console.log(`✅ Loaded ${loadedEvents} event file(s)`);
}

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (await handleAppealInteraction(interaction)) return;
    } catch (err) {
        console.error("Appeal interaction error:", err?.message || err);
        try {
            const payload = { content: "❌ Failed to process appeal interaction.", ephemeral: true };
            if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch {}
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        const { memberHasCommandPermission } = require("./utils/textCommands.js");
        if (
            interaction.inGuild() &&
            interaction.member &&
            !memberHasCommandPermission(interaction.member, command)
        ) {
            const payload = {
                content: "❌ You don't have permission to use that command.",
                ephemeral: true
            };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(payload).catch(() => {});
            } else {
                await interaction.reply(payload).catch(() => {});
            }
            return;
        }
    } catch (permErr) {
        console.warn("[perms] check failed:", permErr?.message || permErr);
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(
            "Command error:",
            interaction.commandName,
            error?.code || error?.message || error
        );
        const payload = {
            content: "❌ Something went wrong running that command. Please try again in a moment.",
            ephemeral: true
        };
        try {
            if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch (replyError) {
            console.error("Failed to send error reply:", replyError?.message || replyError);
        }
    }
});

try {
    const { registerAntiNukeListeners } = require("./utils/antiNuke.js");
    registerAntiNukeListeners(client);
} catch (e) {
    console.error("[Startup] antiNuke register failed:", e?.message || e);
}

require("./startup.js")(client);
