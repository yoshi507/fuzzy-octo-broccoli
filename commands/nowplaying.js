const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const {
    getMusicData,
    destroy
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("Show the currently playing song"),

    async execute(interaction) {

        const data =
            getMusicData(interaction.guild.id);

        if (!data || !data.current) {
            return interaction.reply({
                content:
                    "❌ Nothing is currently playing.",
                ephemeral: true
            });
        }

        const embed =
            new EmbedBuilder()
                .setTitle("🎵 Now Playing")
                .setDescription(
                    `**${data.current.title}**`
                )
                .addFields({
                    name: "📋 Queue",
                    value:
                        `${data.queue.length} song(s) waiting`,
                    inline: true
                });

        const row =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("music_pause")
                        .setEmoji("⏸️")
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId("music_resume")
                        .setEmoji("▶️")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId("music_skip")
                        .setEmoji("⏭️")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("music_stop")
                        .setEmoji("⏹️")
                        .setStyle(ButtonStyle.Danger)
                );

        const message =
            await interaction.reply({
                embeds: [embed],
                components: [row],
                fetchReply: true
            });

        const collector =
            message.createMessageComponentCollector({
                time: 15 * 60 * 1000
            });

        collector.on(
            "collect",
            async buttonInteraction => {

                if (
                    !buttonInteraction.member.voice.channel
                ) {
                    return buttonInteraction.reply({
                        content:
                            "❌ You need to be in a voice channel.",
                        ephemeral: true
                    });
                }

                const music =
                    getMusicData(
                        buttonInteraction.guild.id
                    );

                if (
                    !music ||
                    !music.current
                ) {
                    return buttonInteraction.reply({
                        content:
                            "❌ Nothing is currently playing.",
                        ephemeral: true
                    });
                }

                try {

                    // PAUSE
                    if (
                        buttonInteraction.customId ===
                        "music_pause"
                    ) {

                        music.player.pause();

                        await buttonInteraction.reply({
                            content:
                                "⏸️ Music paused.",
                            ephemeral: true
                        });

                        return;
                    }

                    // RESUME
                    if (
                        buttonInteraction.customId ===
                        "music_resume"
                    ) {

                        music.player.unpause();

                        await buttonInteraction.reply({
                            content:
                                "▶️ Music resumed.",
                            ephemeral: true
                        });

                        return;
                    }

                    // SKIP
                    if (
                        buttonInteraction.customId ===
                        "music_skip"
                    ) {

                        const skipped =
                            music.current.title;

                        music.player.stop();

                        await buttonInteraction.reply({
                            content:
                                `⏭️ Skipped **${skipped}**.`,
                            ephemeral: true
                        });

                        return;
                    }

                    // STOP
                    if (
                        buttonInteraction.customId ===
                        "music_stop"
                    ) {

                        destroy(
                            buttonInteraction.guild.id
                        );

                        await buttonInteraction.reply({
                            content:
                                "⏹️ Music stopped and I left the voice channel.",
                            ephemeral: true
                        });

                        return;
                    }

                } catch (error) {

                    console.error(
                        "Music button error:",
                        error
                    );

                    if (
                        !buttonInteraction.replied &&
                        !buttonInteraction.deferred
                    ) {

                        await buttonInteraction.reply({
                            content:
                                "❌ Something went wrong.",
                            ephemeral: true
                        });
                    }
                }
            }
        );

        collector.on(
            "end",
            async () => {

                try {

                    const disabledRow =
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId("music_pause_disabled")
                                    .setEmoji("⏸️")
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(true),

                                new ButtonBuilder()
                                    .setCustomId("music_resume_disabled")
                                    .setEmoji("▶️")
                                    .setStyle(ButtonStyle.Success)
                                    .setDisabled(true),

                                new ButtonBuilder()
                                    .setCustomId("music_skip_disabled")
                                    .setEmoji("⏭️")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),

                                new ButtonBuilder()
                                    .setCustomId("music_stop_disabled")
                                    .setEmoji("⏹️")
                                    .setStyle(ButtonStyle.Danger)
                                    .setDisabled(true)
                            );

                    await message.edit({
                        components: [disabledRow]
                    });

                } catch {}
            }
        );
    }
};
