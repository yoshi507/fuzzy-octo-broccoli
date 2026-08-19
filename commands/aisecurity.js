const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    getGuildSecurity,
    setGuildSecurity
} = require("../utils/ai/security.js");

const {
    askAI
} = require("../utils/ai/groq.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("aisecurity")
        .setDescription(
            "Configure Omni's AI security system"
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("enable")
                .setDescription(
                    "Enable AI security monitoring"
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription(
                    "Disable AI security monitoring"
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription(
                    "Show AI security status"
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("test")
                .setDescription(
                    "Run a safe AI security test"
                )
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    async execute(interaction) {

        const subcommand =
            interaction.options.getSubcommand();

        const guildId =
            interaction.guild.id;

        const current =
            getGuildSecurity(guildId);

        // =========================
        // ENABLE
        // =========================

        if (subcommand === "enable") {

            setGuildSecurity(
                guildId,
                {
                    ...current,
                    enabled: true,
                    mode: "monitor"
                }
            );

            return interaction.reply(
                "🛡️ **AI Security enabled!**\n\n" +
                "Omni is now monitoring this server for suspicious activity."
            );
        }

        // =========================
        // DISABLE
        // =========================

        if (subcommand === "disable") {

            setGuildSecurity(
                guildId,
                {
                    ...current,
                    enabled: false
                }
            );

            return interaction.reply(
                "🛡️ **AI Security disabled.**"
            );
        }

        // =========================
        // STATUS
        // =========================

        if (subcommand === "status") {

            return interaction.reply(
                `🛡️ **AI Security:** ${
                    current.enabled
                        ? "Enabled"
                        : "Disabled"
                }\n` +
                `🔎 **Mode:** ${
                    current.mode
                }\n` +
                `📊 **Incidents recorded:** ${
                    current.incidents?.length || 0
                }`
            );
        }

        // =========================
        // AI SECURITY TEST
        // =========================

        if (subcommand === "test") {

            await interaction.deferReply({
                ephemeral: true
            });

            try {

                const analysis =
    await askAI(
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
            maxTokens: 300,
            reasoning_effort: "low"
        }
    );
                console.log(
                    "[AI Security Test] Raw response:",
                    analysis
                );

                const raidMatch =
                    analysis.match(
                        /RAID:\s*(YES|NO)/i
                    );

                const confidenceMatch =
                    analysis.match(
                        /CONFIDENCE:\s*(\d+)/i
                    );

                const actionMatch =
                    analysis.match(
                        /ACTION:\s*(MONITOR|ALERT|LOCKDOWN)/i
                    );

                const reasonMatch =
                    analysis.match(
                        /REASON:\s*(.+)/i
                    );

                const raidLikely =
                    raidMatch
                        ? raidMatch[1].toUpperCase() === "YES"
                        : false;

                const confidence =
                    confidenceMatch
                        ? Number(
                            confidenceMatch[1]
                        )
                        : 0;

                const action =
                    actionMatch
                        ? actionMatch[1].toUpperCase()
                        : "MONITOR";

                const reason =
                    reasonMatch
                        ? reasonMatch[1].trim()
                        : "No reason was provided.";

                await interaction.editReply(
                    `🛡️ **AI Security Test Complete**\n\n` +
                    `🚨 Raid likely: **${
                        raidLikely
                            ? "Yes"
                            : "No"
                    }**\n` +
                    `📊 Confidence: **${
                        confidence
                    }%**\n` +
                    `💡 Recommendation: **${
                        action
                    }**\n` +
                    `📝 Reason: ${
                        reason
                    }`
                );

            } catch (error) {

                console.error(
                    "AI security test error:",
                    error
                );

                await interaction.editReply(
                    "❌ The AI security test failed. Check the console."
                );
            }
        }
    }
};
                    
