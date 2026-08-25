const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const up = require("../utils/userphone/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("userphone")
        .setDescription("Anonymous cross-server chat (userphone)")
        .addSubcommand((s) => s.setName("call").setDescription("Find someone to talk to"))
        .addSubcommand((s) => s.setName("hangup").setDescription("End the current call"))
        .addSubcommand((s) => s.setName("status").setDescription("Call status in this channel")),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const channel = interaction.channel;
        if (!channel?.isTextBased?.()) {
            return interaction.reply({ content: "Use this in a text channel.", ephemeral: true });
        }

        if (sub === "status") {
            const s = up.getSession(channel.id);
            if (!s) return interaction.reply({ content: "No active userphone call here.", ephemeral: true });
            return interaction.reply({
                content: `📞 Connected (session \`${s.id}\`). Messages here are relayed anonymously.`,
                ephemeral: true
            });
        }

        if (sub === "hangup") {
            const s = up.endSession(channel.id);
            if (!s) return interaction.reply({ content: "No active call.", ephemeral: true });
            const other = s.a.channelId === channel.id ? s.b : s.a;
            try {
                const ch = await interaction.client.channels.fetch(other.channelId).catch(() => null);
                if (ch?.isTextBased?.()) {
                    await ch.send("📞 The other side hung up.");
                }
            } catch (_) {}
            return interaction.reply("📞 Call ended.");
        }

        if (sub === "call") {
            if (up.getSession(channel.id)) {
                return interaction.reply({
                    content: "This channel is already on a call. Use `/userphone hangup` first.",
                    ephemeral: true
                });
            }
            const waiting = up.getWaiting();
            const me = {
                guildId: interaction.guild.id,
                channelId: channel.id,
                userId: interaction.user.id
            };

            if (waiting && waiting.channelId !== channel.id) {
                const session = up.createSession(waiting, me);
                try {
                    const otherCh = await interaction.client.channels.fetch(waiting.channelId).catch(() => null);
                    if (otherCh?.isTextBased?.()) {
                        await otherCh.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0x57f287)
                                    .setTitle("📞 Connected!")
                                    .setDescription(
                                        "You're linked with another server. Messages will be relayed anonymously.\nUse `/userphone hangup` to end."
                                    )
                            ]
                        });
                    }
                } catch (_) {}
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x57f287)
                            .setTitle("📞 Connected!")
                            .setDescription(
                                `Linked (session \`${session.id}\`). Messages here are relayed anonymously.\nUse \`/userphone hangup\` to end.`
                            )
                    ]
                });
            }

            up.setWaiting(me);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xfee75c)
                        .setTitle("📞 Calling…")
                        .setDescription(
                            "Waiting for another server to pick up.\nRun `/userphone call` again elsewhere, or `/userphone hangup` to cancel."
                        )
                ]
            });
        }

        return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
    }
};
