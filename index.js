require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Events,
    Collection,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { loadCommands } = require("./commandHandler");
const { sendModLog } = require("./utils/modLog.js");
const { loadDatabase } = require("./database/database.js");

const {
    getGuildSecurity,
    addIncident,
    recordJoin
} = require("./utils/ai/security.js");

const {
    getSettings,
    setSettings,
    addTopic,
    getTopics
} = require("./utils/ai/deadChat.js");

const { askAI } = require("./utils/ai/groq.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();
loadCommands(client);

const fs = require("fs");
const path = require("path");

const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs
        .readdirSync(eventsPath)
        .filter(file => file.endsWith(".js"));

    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (!event?.name || typeof event.execute !== "function") {
            continue;
        }

        if (event.name === "messageCreate") {
            client.on(Events.MessageCreate, (...args) =>
                event.execute(...args)
            );
        } else if (event.name === "guildMemberAdd") {
            client.on(Events.GuildMemberAdd, (...args) =>
                event.execute(...args)
            );
        } else if (event.name === "guildMemberRemove") {
            client.on(Events.GuildMemberRemove, (...args) =>
                event.execute(...args)
            );
        } else if (event.name === "messageDelete") {
            client.on(Events.MessageDelete, (...args) =>
                event.execute(...args)
            );
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }

    console.log(`✅ Loaded ${eventFiles.length} event file(s)`);
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        if (
            interaction.customId === "suggest_approve" ||
            interaction.customId === "suggest_reject"
        ) {
            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ You don't have permission to manage suggestions.",
                    ephemeral: true
                });
            }

            const approved =
                interaction.customId === "suggest_approve";

            const oldEmbed = interaction.message.embeds[0];

            if (!oldEmbed) {
                return interaction.reply({
                    content: "❌ I couldn't find the suggestion.",
                    ephemeral: true
                });
            }

            const newEmbed = EmbedBuilder.from(oldEmbed)
                .setColor(approved ? 0x57f287 : 0xed4245)
                .spliceFields(1, 1, {
                    name: "📊 Status",
                    value: approved ? "🟢 Approved" : "🔴 Rejected",
                    inline: true
                })
                .setFooter({
                    text: `${approved ? "Approved" : "Rejected"} by ${interaction.user.tag}`
                });

            const disabledButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("suggest_approve")
                    .setLabel("Approved")
                    .setEmoji("✅")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId("suggest_reject")
                    .setLabel("Rejected")
                    .setEmoji("❌")
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

            try {
                await interaction.update({
                    embeds: [newEmbed],
                    components: [disabledButtons]
                });

                await sendModLog(interaction.guild, {
                    title: approved
                        ? "✅ Suggestion Approved"
                        : "❌ Suggestion Rejected",
                    description: `${interaction.user} ${
                        approved ? "approved" : "rejected"
                    } a suggestion.`,
                    userId: interaction.user.id,
                    moderatorId: interaction.user.id,
                    reason: oldEmbed.description || "Suggestion"
                });
            } catch (error) {
                console.error("Suggestion button error:", error);
            }

            return;
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);

        const payload = {
            content: "❌ Something went wrong.",
            ephemeral: true
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(payload);
            } else {
                await interaction.reply(payload);
            }
        } catch (replyError) {
            console.error("Failed to send error reply:", replyError);
        }
    }
});

client.once(Events.ClientReady, (readyClient) => {
    console.log("================================");
    console.log("        OMNIBOT ONLINE");
    console.log("================================");
    console.log(`Logged in as: ${readyClient.user.tag}`);
    console.log(`Servers: ${readyClient.guilds.cache.size}`);
    console.log("================================");
});

client.on(Events.Error, (error) => {
    console.error("Discord error:", error);
});

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing!");
    console.error("Create a .env file and add your bot token.");
    process.exit(1);
}

const DEAD_CHAT_QUESTIONS = [
    "If you could instantly become amazing at one skill, what would it be?",
    "What's a game you could play for hours without getting bored?",
    "If you could visit any country tomorrow, where would you go?",
    "What's your favourite thing to do when you're bored?",
    "If you could have any animal as a pet, what would you choose?",
    "What's the funniest thing you've seen recently?",
    "If you could create your own theme park ride, what would it be like?",
    "What's one food you could eat every week and never get tired of?",
    "If you could live in any fictional world, which one would you choose?",
    "What's a movie or TV show you think everyone should watch?",
    "If you could invent one useful gadget, what would it do?",
    "What's your favourite season and why?",
    "If you had £1,000 to spend today, what would you buy?",
    "What's the best place you've ever visited?",
    "If you could instantly learn any language, which one would you pick?",
    "What's something you're looking forward to?",
    "If you could meet any famous person, who would it be?",
    "What's your favourite video game of all time?",
    "If you could change one thing about the world, what would it be?",
    "What's the most interesting fact you know?"
];

setInterval(async () => {
    try {
        for (const guild of client.guilds.cache.values()) {
            for (const channel of guild.channels.cache.values()) {
                if (!channel.isTextBased() || channel.isDMBased?.()) {
                    continue;
                }

                const settings = getSettings(channel.id);
                if (!settings?.enabled) {
                    continue;
                }

                const minutes =
                    typeof settings.minutes === "number" &&
                    settings.minutes > 0
                        ? settings.minutes
                        : 30;

                let lastMessage;
                try {
                    const messages = await channel.messages.fetch({
                        limit: 1
                    });
                    lastMessage = messages.first();
                } catch {
                    continue;
                }

                if (!lastMessage) {
                    continue;
                }

                const inactiveFor =
                    Date.now() - lastMessage.createdTimestamp;
                const requiredTime = minutes * 60 * 1000;

                if (inactiveFor < requiredTime) {
                    continue;
                }

                if (
                    settings.lastRevival &&
                    Date.now() - settings.lastRevival < requiredTime
                ) {
                    continue;
                }

                const previousTopics = getTopics(channel.id);
                const availableQuestions = DEAD_CHAT_QUESTIONS.filter(
                    question => !previousTopics.includes(question)
                );

                if (availableQuestions.length === 0) {
                    continue;
                }

                const topic =
                    availableQuestions[
                        Math.floor(
                            Math.random() * availableQuestions.length
                        )
                    ];

                try {
                    await channel.send(
                        `💬 **Random question:** ${topic}`
                    );

                    addTopic(channel.id, topic);
                    setSettings(channel.id, {
                        ...settings,
                        lastRevival: Date.now()
                    });
                } catch (sendError) {
                    console.error(
                        `Dead chat send error in #${channel.name}:`,
                        sendError.message
                    );
                }
            }
        }
    } catch (error) {
        console.error("Dead Chat Reviver error:", error);
    }
}, 60 * 1000);

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const security = getGuildSecurity(member.guild.id);

        if (!security.enabled) {
            return;
        }

        const joinCount = recordJoin(member.guild.id);

        if (joinCount < 5) {
            return;
        }

        const severity = joinCount >= 15 ? "high" : "medium";

        const analysis = await askAI(
            [
                {
                    role: "system",
                    content:
                        "You are Omni's Discord security AI. " +
                        "Analyse possible raid activity. " +
                        "Return ONLY valid JSON with these fields: " +
                        "raidLikely (boolean), confidence (number from 0 to 100), " +
                        "reason (string), recommendedAction (one of monitor, alert, lockdown). " +
                        "Do not recommend banning or kicking users automatically."
                },
                {
                    role: "user",
                    content:
                        `Server: ${member.guild.name}\n` +
                        `Members joined in the last 60 seconds: ${joinCount}\n` +
                        `Current severity: ${severity}\n` +
                        `New member: ${member.user.tag}\n\n` +
                        "Determine whether this pattern looks like a raid."
                }
            ],
            {
                guildId: member.guild.id,
                temperature: 0.2,
                maxTokens: 250
            }
        );

        console.log("[AI Security] Groq analysis:", analysis);

        let result = {
            raidLikely: false,
            confidence: 0,
            reason: "No clear raid detected.",
            recommendedAction: "monitor"
        };

        try {
            const cleaned = String(analysis || "")
                .replace(/```json/gi, "")
                .replace(/```/g, "")
                .trim();

            result = JSON.parse(cleaned);
        } catch {
            const cleaned = String(analysis || "").trim();
            const lower = cleaned.toLowerCase();

            result.raidLikely =
                lower.includes("raid: yes") ||
                lower.includes("raid likely: yes") ||
                lower.includes("raid detected") ||
                lower.includes('"raidlikely": true') ||
                lower.includes('"raidlikely":true');

            const confidenceMatch = cleaned.match(
                /confidence\s*[:\-]?\s*(\d{1,3})/i
            );
            if (confidenceMatch) {
                result.confidence = Number(confidenceMatch[1]);
            }

            const reasonMatch = cleaned.match(
                /reason\s*[:\-]\s*(.+)/i
            );
            if (reasonMatch) {
                result.reason = reasonMatch[1].trim();
            } else if (cleaned) {
                result.reason = cleaned.slice(0, 300);
            }

            const actionMatch = cleaned.match(
                /action\s*[:\-]\s*(monitor|alert|lockdown)/i
            );
            if (actionMatch) {
                result.recommendedAction =
                    actionMatch[1].toLowerCase();
            } else {
                result.recommendedAction = result.raidLikely
                    ? "alert"
                    : "monitor";
            }
        }

        addIncident(member.guild.id, {
            type: "ai_raid_analysis",
            severity,
            joinCount,
            raidLikely: result.raidLikely === true,
            confidence: Number(result.confidence) || 0,
            reason: result.reason || "No reason provided.",
            recommendedAction:
                result.recommendedAction || "monitor"
        });

        console.log(
            `[AI Security] Raid likely: ${result.raidLikely} | ` +
                `Confidence: ${result.confidence}% | ` +
                `Action: ${result.recommendedAction}`
        );

        if (
            result.raidLikely === true &&
            Number(result.confidence) >= 80
        ) {
            console.warn(
                `[AI Security] HIGH CONFIDENCE RAID DETECTED in ${member.guild.name}`
            );

            const database = loadDatabase();
            const logChannelId =
                database.settings?.[member.guild.id]?.modLogChannel ||
                database.logging?.[member.guild.id]?.channelId;

            if (logChannelId) {
                const logChannel =
                    member.guild.channels.cache.get(logChannelId);

                if (logChannel?.isTextBased()) {
                    await logChannel.send(
                        `🚨 **AI RAID ALERT**\n\n` +
                            `Server: **${member.guild.name}**\n` +
                            `Members joined in last minute: **${joinCount}**\n` +
                            `Confidence: **${result.confidence}%**\n` +
                            `Recommended action: **${String(result.recommendedAction).toUpperCase()}**\n` +
                            `Reason: ${result.reason}`
                    );
                }
            }
        }
    } catch (error) {
        console.error("AI raid detection error:", error);
    }
});

// =========================
// ANTI-NUKE (module)
// =========================

const { registerAntiNukeListeners } = require("./utils/antiNuke.js");
registerAntiNukeListeners(client);

// =========================
// LOGIN
// =========================

client.login(process.env.DISCORD_TOKEN);
