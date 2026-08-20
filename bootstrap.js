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
const { loadDatabase } = require("./database/database.js");
const { isLimitError } = require("./utils/ai/groq.js");

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
loadCommands(client);

// Load event files from ./events
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
    let loadedEvents = 0;
    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventsPath, file));
            if (!event?.name || !event?.execute) continue;
            if (event.once) client.once(event.name, (...args) => event.execute(...args));
            else client.on(event.name, (...args) => event.execute(...args));
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

    if (interaction.isButton()) {
        if (
            interaction.customId === "suggest_approve" ||
            interaction.customId === "suggest_reject"
        ) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: "❌ Missing permission.", ephemeral: true });
            }
            const approved = interaction.customId === "suggest_approve";
            const oldEmbed = interaction.message.embeds[0];
            if (!oldEmbed) {
                return interaction.reply({ content: "❌ Missing embed.", ephemeral: true });
            }
            const embed = EmbedBuilder.from(oldEmbed).setColor(approved ? 0x3ba55d : 0xed4245).setFooter({
                text: `${approved ? "Approved" : "Rejected"} by ${interaction.user.tag}`
            });
            await interaction.update({ embeds: [embed], components: [] });
            return;
        }

        if (interaction.customId === "create_ticket") {
            // ticket create handled by existing event modules / fallback below
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

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

const { registerAntiNukeListeners } = require("./utils/antiNuke.js");
registerAntiNukeListeners(client);

require("./startup.js")(client);
