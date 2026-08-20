const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    getSettings,
    setSettings,
    disable
} = require("../utils/ai/deadChat.js");

const {
    mirrorDeadChatToDashboard
} = require("../utils/configSync.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("deadchat")
        .setDescription(
            "Configure the AI dead chat reviver"
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("enable")
                .setDescription(
                    "Enable the AI dead chat reviver"
                )

                .addIntegerOption(option =>
                    option
                        .setName("minutes")
                        .setDescription(
                            "Minutes of inactivity before Omni speaks"
                        )
                        .setMinValue(5)
                        .setMaxValue(1440)
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription(
                    "Disable the AI dead chat reviver"
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription(
                    "Show the current settings"
                )
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageChannels
        ),

    async execute(interaction) {

        const subcommand =
            interaction.options.getSubcommand();

        const channelId =
            interaction.channel.id;

        if (subcommand === "enable") {

            const minutes =
                interaction.options.getInteger(
                    "minutes"
                );

            setSettings(
                channelId,
                {
                    enabled: true,
                    minutes,
                    lastRevival: 0,
                    guildId: interaction.guild.id
                }
            );

            mirrorDeadChatToDashboard(interaction.guild.id, channelId, {
                enabled: true,
                minutes
            });

            return interaction.reply(
                `🧟 **AI Dead Chat Reviver enabled!**\n\nI'll revive this channel after **${minutes} minutes** of inactivity.`
            );
        }

        if (subcommand === "disable") {

            disable(channelId);

            mirrorDeadChatToDashboard(interaction.guild.id, channelId, {
                enabled: false
            });

            return interaction.reply(
                "🧟 AI Dead Chat Reviver has been **disabled** in this channel."
            );
        }

        if (subcommand === "status") {

            const settings =
                getSettings(channelId);

            if (!settings?.enabled) {
                return interaction.reply(
                    "🧟 AI Dead Chat Reviver is **disabled** in this channel."
                );
            }

            return interaction.reply(
                `🧟 **Dead Chat Reviver:** Enabled\n⏱️ **Inactivity:** ${settings.minutes} minutes`
            );
        }
    }
};
