const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    getChannelSettings,
    setChannelSettings,
    disableChannel
} = require("../utils/ai/translation.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("autotranslate")
        .setDescription(
            "Configure automatic translation for this channel"
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("enable")
                .setDescription(
                    "Enable automatic translation"
                )
                .addStringOption(option =>
                    option
                        .setName("language")
                        .setDescription(
                            "Language to translate messages into"
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription(
                    "Disable automatic translation"
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription(
                    "Show automatic translation settings"
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

            const language =
                interaction.options.getString(
                    "language"
                );

            setChannelSettings(
                channelId,
                {
                    enabled: true,
                    language
                }
            );

            return interaction.reply(
                `🌍 Automatic translation is now **enabled** in this channel.\n\nMessages will be translated into **${language}**.`
            );
        }

        if (subcommand === "disable") {

            disableChannel(
                channelId
            );

            return interaction.reply(
                "🌍 Automatic translation has been **disabled** in this channel."
            );
        }

        if (subcommand === "status") {

            const settings =
                getChannelSettings(
                    channelId
                );

            if (!settings?.enabled) {

                return interaction.reply(
                    "🌍 Automatic translation is **disabled** in this channel."
                );
            }

            return interaction.reply(
                `🌍 Automatic translation is **enabled**.\n**Language:** ${settings.language}`
            );
        }
    }
};
