const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    getGuildSecurity,
    setGuildSecurity
} = require("../utils/ai/security.js");

const {
    getAntiNukeConfig,
    DEFAULT_THRESHOLDS
} = require("../utils/antiNuke.js");

const {
    askAI,
    limitReachedMessage,
    isLimitError,
    replyAiError
} = require("../utils/ai/groq.js");
const { canUseAI } = require("../utils/ai/aiLimit.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aisecurity")
        .setDescription("Configure Omni's AI security and anti-nuke system")

        .addSubcommand(subcommand =>
            subcommand
                .setName("enable")
                .setDescription("Enable AI security and anti-nuke monitoring")
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription("Disable AI security and anti-nuke monitoring")
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Show AI security and anti-nuke status")
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("mode")
                .setDescription("Set security response mode")
                .addStringOption(option =>
                    option
                        .setName("value")
                        .setDescription("monitor = log only, alert = log + escalate, lockdown = log + protection mode")
                        .setRequired(true)
                        .addChoices(
                            { name: "monitor", value: "monitor" },
                            { name: "alert", value: "alert" },
                            { name: "lockdown", value: "lockdown" }
                        )
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("timeout")
                .setDescription("Optionally timeout the executor on anti-nuke triggers (off by default)")
                .addBooleanOption(option =>
                    option
                        .setName("enabled")
                        .setDescription("Whether to timeout the suspected executor")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("minutes")
                        .setDescription("Timeout duration in minutes (default 10)")
                        .setMinValue(1)
                        .setMaxValue(60)
                        .setRequired(false)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("test")
                .setDescription("Run a safe AI raid-analysis test")
        )

        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const current = getGuildSecurity(guildId);

        if (subcommand === "enable") {
            setGuildSecurity(guildId, {
                ...current,
                enabled: true,
                mode: current.mode || "monitor"
            });

            return interaction.reply(
                "🛡️ **AI Security enabled!**\n\n" +
                "Omni is monitoring raid patterns and anti-nuke activity.\n" +
                "Destructive mass actions will be logged. Members are **not** banned or kicked automatically."
            );
        }

        if (subcommand === "disable") {
            setGuildSecurity(guildId, {
                ...current,
                enabled: false
            });

            return interaction.reply("🛡️ **AI Security disabled.**");
        }

        if (subcommand === "status") {
            const anti = getAntiNukeConfig(guildId);
            const recent = (current.incidents || []).slice(-5).reverse();

            let incidentLines = "None yet.";
            if (recent.length > 0) {
                incidentLines = recent
                    .map(i => {
                        const when = i.timestamp
                            ? `<t:${Math.floor(i.timestamp / 1000)}:R>`
                            : "unknown";
                        return `• \`${i.type}\` (${i.count ?? "?"}) ${when}`;
                    })
                    .join("\n");
            }

            return interaction.reply(
                `🛡️ **AI Security:** ${current.enabled ? "Enabled" : "Disabled"}\n` +
                `🔍 **Mode:** ${current.mode || "monitor"}\n` +
                `💣 **Anti-nuke window:** ${Math.round(anti.windowMs / 1000)}s\n` +
                `📉 **Thresholds:** delete ch/role ${anti.thresholds.channelDelete}/${anti.thresholds.roleDelete}, ` +
                `create ch/role ${anti.thresholds.channelCreate}/${anti.thresholds.roleCreate}, ` +
                `mass delete ${anti.thresholds.massDelete}\n` +
                `🔇 **Auto-timeout executor:** ${anti.autoTimeoutExecutor ? `Yes (${anti.autoTimeoutMinutes}m)` : "No"}\n` +
                `📊 **Incidents stored:** ${current.incidents?.length || 0}\n\n` +
                `**Recent incidents:**\n${incidentLines}`
            );
        }

        if (subcommand === "mode") {
            const value = interaction.options.getString("value");

            setGuildSecurity(guildId, {
                ...current,
                mode: value
            });

            const descriptions = {
                monitor: "Log and record incidents only.",
                alert: "Log, record, and escalate mode toward protection when thresholds are hit.",
                lockdown: "Log, record, and enter protection mode on triggers (still no auto ban/kick unless timeout is enabled)."
            };

            return interaction.reply(
                `🛡️ Security mode set to **${value}**.\n${descriptions[value] || ""}`
            );
        }

        if (subcommand === "timeout") {
            const enabled = interaction.options.getBoolean("enabled");
            const minutes =
                interaction.options.getInteger("minutes") ||
                current.antiNuke?.autoTimeoutMinutes ||
                10;

            setGuildSecurity(guildId, {
                ...current,
                antiNuke: {
                    ...(current.antiNuke || {}),
                    autoTimeoutExecutor: enabled,
                    autoTimeoutMinutes: minutes
                }
            });

            if (enabled) {
                return interaction.reply(
                    `🔇 Anti-nuke will **timeout** the suspected executor for **${minutes} minutes** when thresholds are hit.\n` +
                    `Bans and kicks are still **not** applied automatically.`
                );
            }

            return interaction.reply(
                "🔇 Anti-nuke executor timeout is **disabled**. Omni will only log and alert."
            );
        }

        if (subcommand === "test") {
            await interaction.deferReply({ ephemeral: true });

            try {
                if (!canUseAI(interaction.guild.id)) {
                    return interaction.editReply(limitReachedMessage(interaction.guild.id));
                }

                const analysis = await askAI(
                    [
                        {
                            role: "system",
                            content:
                                "You are Omni's Discord security AI. " +
                                "Analyse the simulated Discord activity. " +
                                "Reply using EXACTLY this format and nothing else:\n" +
                                "RAID: YES or NO\n" +
                                "CONFIDENCE: number from 0 to 100\n" +
                                "ACTION: MONITOR, ALERT, or LOCKDOWN\n" +
                                "REASON: one short sentence"
                        },
                        {
                            role: "user",
                            content:
                                "SIMULATED SECURITY TEST: " +
                                "12 new members joined within 30 seconds. " +
                                "Determine whether this looks like a raid."
                        }
                    ],
                    {
                        guildId: interaction.guild.id,
                        temperature: 0,
                        maxTokens: 300
                    }
                );

                const raidMatch = analysis.match(/RAID:\s*(YES|NO)/i);
                const confidenceMatch = analysis.match(/CONFIDENCE:\s*(\d+)/i);
                const actionMatch = analysis.match(
                    /ACTION:\s*(MONITOR|ALERT|LOCKDOWN)/i
                );
                const reasonMatch = analysis.match(/REASON:\s*(.+)/i);

                const raidLikely = raidMatch
                    ? raidMatch[1].toUpperCase() === "YES"
                    : false;
                const confidence = confidenceMatch
                    ? Number(confidenceMatch[1])
                    : 0;
                const action = actionMatch
                    ? actionMatch[1].toUpperCase()
                    : "MONITOR";
                const reason = reasonMatch
                    ? reasonMatch[1].trim()
                    : "No reason was provided.";

                await interaction.editReply(
                    `🛡️ **AI Security Test Complete**\n\n` +
                    `🚨 Raid likely: **${raidLikely ? "Yes" : "No"}**\n` +
                    `📊 Confidence: **${confidence}%**\n` +
                    `💡 Recommendation: **${action}**\n` +
                    `📝 Reason: ${reason}`
                );
            } catch (error) {
                return replyAiError(interaction, error, interaction.guild?.id);
            }
        }
    }
};
