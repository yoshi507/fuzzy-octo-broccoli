const {
    getGuildSecurity,
    addIncident,
    recordJoin
} = require("./utils/ai/security.js");require("dotenv").config();const {
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

require("dotenv").config();

const { loadCommands } = require("./commandHandler");

const { sendModLog } =
    require("./utils/modLog.js");

const messageCreate =
    require("./events/messageCreate.js");

const {
    getSettings,
    setSettings,
    addTopic,
    getTopics
} = require("./utils/ai/deadChat.js");

const {
    askAI
} = require("./utils/ai/groq.js");

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

client.on(
    Events.MessageCreate,
    async (message) => {
        await messageCreate.execute(message);
    }
);
// =========================
// INTERACTIONS
// =========================

client.on(Events.InteractionCreate, async (interaction) => {

    // =========================
    // SUGGESTION BUTTONS
    // =========================

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

            const oldEmbed =
                interaction.message.embeds[0];

            if (!oldEmbed) {
                return interaction.reply({
                    content:
                        "❌ I couldn't find the suggestion.",
                    ephemeral: true
                });
            }

            const newEmbed =
                EmbedBuilder.from(oldEmbed)
                    .setColor(
                        approved
                            ? 0x57F287
                            : 0xED4245
                    )
                    .spliceFields(
                        1,
                        1,
                        {
                            name: "📊 Status",
                            value:
                                approved
                                    ? "🟢 Approved"
                                    : "🔴 Rejected",
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            `${approved ? "Approved" : "Rejected"} by ${interaction.user.tag}`
                    });

            const disabledButtons =
                new ActionRowBuilder()
                    .addComponents(
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

                await sendModLog(
                    interaction.guild,
                    {
                        title:
                            approved
                                ? "✅ Suggestion Approved"
                                : "❌ Suggestion Rejected",

                        description:
                            `${interaction.user} ${
                                approved
                                    ? "approved"
                                    : "rejected"
                            } a suggestion.`,

                        userId:
                            interaction.user.id,

                        moderatorId:
                            interaction.user.id,

                        reason:
                            oldEmbed.description ||
                            "Suggestion"
                    }
                );

            } catch (error) {
                console.error(
                    "Suggestion button error:",
                    error
                );
            }

            return;
        }
    }

    // =========================
    // SLASH COMMANDS
    // =========================

    if (!interaction.isChatInputCommand()) return;

    const command =
        client.commands.get(
            interaction.commandName
        );

    if (!command) return;

    try {

        await command.execute(
            interaction
        );

    } catch (error) {

        console.error(error);

        if (
            interaction.replied ||
            interaction.deferred
        ) {

            await interaction.followUp({
                content:
                    "❌ Something went wrong.",
                ephemeral: true
            });

        } else {

            await interaction.reply({
                content:
                    "❌ Something went wrong.",
                ephemeral: true
            });
        }
    }
});

// =========================
// BOT READY
// =========================

client.once(
    Events.ClientReady,
    (readyClient) => {

        console.log(
            "================================"
        );

        console.log(
            "        OMNIBOT ONLINE"
        );

        console.log(
            "================================"
        );

        console.log(
            `Logged in as: ${readyClient.user.tag}`
        );

        console.log(
            `Servers: ${readyClient.guilds.cache.size}`
        );

        console.log(
            "================================"
        );
    }
);

// =========================
// DISCORD ERRORS
// =========================

client.on(
    Events.Error,
    (error) => {
        console.error(
            "Discord error:",
            error
        );
    }
);

// =========================
// TOKEN CHECK
// =========================

if (!process.env.DISCORD_TOKEN) {

    console.error(
        "❌ DISCORD_TOKEN is missing!"
    );

    console.error(
        "Create a .env file and add your bot token."
    );

    process.exit(1);
}
// =========================
// AI DEAD CHAT REVIVER
// =========================

setInterval(async () => {

    try {

        for (const guild of client.guilds.cache.values()) {

            for (const channel of guild.channels.cache.values()) {

                if (!channel.isTextBased()) {
                    continue;
                }

                const settings =
                    getSettings(channel.id);

                if (!settings?.enabled) {
                    continue;
                }

                const messages =
                    await channel.messages.fetch({
                        limit: 1
                    });

                const lastMessage =
                    messages.first();

                if (!lastMessage) {
                    continue;
                }

                const inactiveFor =
                    Date.now() -
                    lastMessage.createdTimestamp;

                const requiredTime =
                    settings.minutes *
                    60 *
                    1000;

                if (inactiveFor < requiredTime) {
                    continue;
                }

                if (
                    settings.lastRevival &&
                    Date.now() -
                    settings.lastRevival <
                    requiredTime
                ) {
                    continue;
                }

                const questions = [
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

                const previousTopics =
                    getTopics(channel.id);

                const availableQuestions =
                    questions.filter(
                        question =>
                            !previousTopics.includes(question)
                    );

                if (availableQuestions.length === 0) {
                    continue;
                }

                const topic =
                    availableQuestions[
                        Math.floor(
                            Math.random() *
                            availableQuestions.length
                        )
                    ];

                await channel.send(
                    `💬 **Random question:** ${topic}`
                );

                addTopic(
                    channel.id,
                    topic
                );

                setSettings(
                    channel.id,
                    {
                        ...settings,
                        lastRevival: Date.now()
                    }
                );
            }
        }

    } catch (error) {

        console.error(
            "Non-AI Dead Chat Reviver error:",
            error
        );
    }

}, 60 * 1000);

// =========================
// AI RAID DETECTION
// =========================
client.on(
    Events.GuildMemberAdd,
    async (member) => {

        try {

            const security =
                getGuildSecurity(member.guild.id);

            if (!security.enabled) {
                return;
            }

            const joinCount =
                recordJoin(member.guild.id);

            if (joinCount < 5) {
                return;
            }

            const severity =
                joinCount >= 15
                    ? "high"
                    : "medium";

            const analysis =
                await askAI(
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

            console.log(
                "[AI Security] Groq analysis:",
                analysis
            );

            let result = {
                raidLikely: false,
                confidence: 0,
                reason: "No clear raid detected.",
                recommendedAction: "monitor"
            };

            try {

                const cleaned =
                    String(analysis || "")
                        .replace(/```json/gi, "")
                        .replace(/```/g, "")
                        .trim();

                result = JSON.parse(cleaned);

            } catch {

                const cleaned =
                    String(analysis || "").trim();

                const lower =
                    cleaned.toLowerCase();

                result.raidLikely =
                    lower.includes("raid: yes") ||
                    lower.includes("raid likely: yes") ||
                    lower.includes("raid detected");

                const confidenceMatch =
                    cleaned.match(
                        /confidence\s*[:\-]?\s*(\d{1,3})/i
                    );

                if (confidenceMatch) {
                    result.confidence =
                        Number(confidenceMatch[1]);
                }

                const reasonMatch =
                    cleaned.match(
                        /reason\s*[:\-]\s*(.+)/i
                    );

                if (reasonMatch) {
                    result.reason =
                        reasonMatch[1].trim();
                } else if (cleaned) {
                    result.reason = cleaned;
                }

                const actionMatch =
                    cleaned.match(
                        /action\s*[:\-]\s*(monitor|alert|lockdown)/i
                    );

                if (actionMatch) {
                    result.recommendedAction =
                        actionMatch[1].toLowerCase();
                } else {
                    result.recommendedAction =
                        result.raidLikely
                            ? "alert"
                            : "monitor";
                }
            }

            addIncident(
                member.guild.id,
                {
                    type: "ai_raid_analysis",
                    severity,
                    joinCount,
                    raidLikely:
                        result.raidLikely === true,
                    confidence:
                        Number(result.confidence) || 0,
                    reason:
                        result.reason ||
                        "No reason provided.",
                    recommendedAction:
                        result.recommendedAction ||
                        "monitor"
                }
            );

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

                const database =
                    require("./database/omnibot.json");

                const logChannelId =
                    database.settings?.[member.guild.id]
                        ?.modLogChannel;

                if (logChannelId) {

                    const logChannel =
                        member.guild.channels.cache.get(
                            logChannelId
                        );

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

            console.error(
                "AI raid detection error:",
                error
            );
        }
    }
);

                  
// =========================
// ANTI-NUKE
// =========================

const antiNukeActions = new Map();
async function getAuditLogExecutor(
    guild,
    actionType
) {

    try {

        const logs =
            await guild.fetchAuditLogs({
                type: actionType,
                limit: 5
            });

        const entry =
            logs.entries.find(
                entry =>
                    Date.now() -
                    entry.createdTimestamp <
                    10000
            );

        return entry?.executor || null;

    } catch (error) {

        console.error(
            "Audit log lookup error:",
            error
        );

        return null;
    }
}
function recordNukeAction(guildId, type) {

    const now = Date.now();

    if (!antiNukeActions.has(guildId)) {
        antiNukeActions.set(guildId, {});
    }

    const guildActions =
        antiNukeActions.get(guildId);

    if (!guildActions[type]) {
        guildActions[type] = [];
    }

    guildActions[type] =
        guildActions[type].filter(
            timestamp =>
                now - timestamp < 30000
        );

    guildActions[type].push(now);

    return guildActions[type].length;
}

async function sendAntiNukeAlert(
    guild,
    type,
    count,
    executor = null
) {

    try {

        const database =
            require("./database/omnibot.json");

        const logChannelId =
            database.settings?.[guild.id]
                ?.modLogChannel;

        if (!logChannelId) {
            return;
        }

        const logChannel =
            guild.channels.cache.get(
                logChannelId
            );

        if (!logChannel?.isTextBased()) {
            return;
        }

        await logChannel.send(
    `🚨 **ANTI-NUKE ALERT**\n\n` +
    `Action: **${type}**\n` +
    `Detected: **${count} actions in 30 seconds**\n` +
    `Server: **${guild.name}**\n` +
    `Executor: **${
        executor
            ? `${executor.tag} (${executor.id})`
            : "Unknown"
    }**\n\n` +
    `⚠️ Omni detected potentially destructive activity.`
);
    } catch (error) {

        console.error(
            "Anti-nuke alert error:",
            error
        );
    }
}

client.on(
    Events.ChannelDelete,
    async (channel) => {

        try {

            if (!channel.guild) {
                return;
            }

            const security =
                getGuildSecurity(
                    channel.guild.id
                );

            if (!security.enabled) {
                return;
            }

            const count =
                recordNukeAction(
                    channel.guild.id,
                    "channelDelete"
                );

            if (count >= 3) {

                addIncident(
                    channel.guild.id,
                    {
  //                      type: "anti_nuke_channel_delete",
                        count
                    }
                );
const executor =
    await getAuditLogExecutor(
        channel.guild,
        10
    );
                    channel.guild,
    "CHANNEL CREATION",
    count
);    role.guild,
    "ROLE CREATION",
    count
);await sendAntiNukeAlert(
    channel.guild,
    "CHANNEL DELETION",
    count,
    executor
);
            }

        } catch (error) {

            console.error(
                "Anti-nuke channel delete error:",
                error
            );
        }
    }
);

client.on(
    Events.RoleDelete,
    async (role) => {

        try {

            const security =
                getGuildSecurity(
                    role.guild.id
                );

            if (!security.enabled) {
                return;
            }

            const count =
                recordNukeAction(
                    role.guild.id,
                    "roleDelete"
                );

            if (count >= 3) {

    addIncident(
        role.guild.id,
        {
            type: "anti_nuke_role_delete",
            count
        }
    );

    const executor =
    await getAuditLogExecutor(
        channel.guild,
        12
    );

await sendAntiNukeAlert(
    channel.guild,
    "CHANNEL DELETION",
    count,
    executor
);
}

        } catch (error) {

            console.error(
                "Anti-nuke role delete error:",
                error
            );
        }
    }
);  
            
   
// =========================
// ANTI-NUKE CREATION DETECTION
// =========================

client.on(
    Events.ChannelCreate,
    async (channel) => {

        try {

            if (!channel.guild) {
                return;
            }

            const security =
                getGuildSecurity(
                    channel.guild.id
                );

            if (!security.enabled) {
                return;
            }

            const count =
                recordNukeAction(
                    channel.guild.id,
                    "channelCreate"
                );

            if (count >= 5) {

                addIncident(
                    channel.guild.id,
                    {
                        type: "anti_nuke_channel_create",
                        count
                    }
                );

                await sendAntiNukeAlert(
                    channel.guild,
                    "CHANNEL CREATION",
                    count
                );
            }

        } catch (error) {

            console.error(
                "Anti-nuke channel create error:",
                error
            );
        }
    }
);

client.on(
    Events.RoleCreate,
    async (role) => {

        try {

            const security =
                getGuildSecurity(
                    role.guild.id
                );

            if (!security.enabled) {
                return;
            }

            const count =
                recordNukeAction(
                    role.guild.id,
                    "roleCreate"
                );

            if (count >= 5) {

                addIncident(
                    role.guild.id,
                    {
                        type: "anti_nuke_role_create",
                        count
                    }
                );

                const executor =
    await getAuditLogExecutor(
        role.guild,
        30
    );

await sendAntiNukeAlert(
    role.guild,
    "ROLE CREATION",
    count,
    executor
);
            }

        } catch (error) {

            console.error(
                "Anti-nuke role create error:",
                error
            );
        }
    }
);    
          
            
                       
                            
                       
// =========================
// LOGIN
// =========================

client.login(
    process.env.DISCORD_TOKEN
);
