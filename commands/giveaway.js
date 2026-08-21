const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const {
    getSettings,
    createGiveaway,
    getGiveaway,
    endGiveaway,
    addEntry
} = require("../utils/giveaways/store.js");
const { scheduleGiveaway, cancelGiveaway } = require("../utils/giveaways/scheduler.js");

function parseDuration(str) {
    const m = String(str || "").trim().match(/^(\d+)\s*(s|m|h|d)$/i);
    if (!m) return null;
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return n * mult[u];
}

function winnersFromEntries(entries, count) {
    const pool = [...new Set(entries || [])];
    const winners = [];
    while (pool.length && winners.length < count) {
        const i = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(i, 1)[0]);
    }
    return winners;
}

async function finishGiveaway(client, guildId, giveawayId) {
    try { cancelGiveaway(guildId, giveawayId); } catch (_) {}
    const g = getGiveaway(guildId, giveawayId);
    if (!g || g.status !== "active") return null;
    const winners = winnersFromEntries(g.entries, g.winnerCount || 1);
    g.status = "ended";
    g.winners = winners;
    g.endedAt = Date.now();
    endGiveaway(guildId, giveawayId);
    try {
        const ch = await client.channels.fetch(g.channelId).catch(() => null);
        if (ch?.isTextBased()) {
            const text =
                winners.length > 0
                    ? winners.map((id) => `<@${id}>`).join(", ")
                    : "No valid entries.";
            await ch.send({
                content: `🎉 Giveaway **${g.prize}** ended!\nWinners: ${text}`
            }).catch(() => {});
            try {
                const msg = await ch.messages.fetch(g.messageId).catch(() => null);
                if (msg) {
                    const embed = EmbedBuilder.from(msg.embeds[0] || {});
                    embed.setColor(0x95a5a6);
                    embed.setFooter({ text: `Ended · ID ${g.id}` });
                    await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
                }
            } catch (_) {}
        }
    } catch (e) {
        console.error("finishGiveaway:", e?.message || e);
    }
    return g;
}

module.exports = {
    finishGiveaway,
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create or manage giveaways")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) =>
            s
                .setName("start")
                .setDescription("Start a giveaway")
                .addStringOption((o) =>
                    o.setName("prize").setDescription("Prize").setRequired(true)
                )
                .addStringOption((o) =>
                    o
                        .setName("duration")
                        .setDescription("e.g. 10m, 1h, 1d")
                        .setRequired(true)
                )
                .addIntegerOption((o) =>
                    o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20)
                )
                .addChannelOption((o) =>
                    o.setName("channel").setDescription("Channel for the giveaway")
                )
        )
        .addSubcommand((s) =>
            s
                .setName("end")
                .setDescription("End a giveaway early")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Giveaway ID").setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("cancel")
                .setDescription("Cancel a giveaway")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Giveaway ID").setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("info")
                .setDescription("Show giveaway info")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Giveaway ID").setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === "start") {
            const durationStr = interaction.options.getString("duration");
            const duration = parseDuration(durationStr);
            if (!duration || duration < 10000 || duration > 14 * 86400000) {
                return interaction.reply({
                    content: "❌ Duration must be like `10m`, `1h`, or `1d` (10s–14d).",
                    ephemeral: true
                });
            }
            const prize = interaction.options.getString("prize").slice(0, 200);
            const winnerCount = interaction.options.getInteger("winners") || 1;
            const channel =
                interaction.options.getChannel("channel") || interaction.channel;
            if (!channel?.isTextBased?.()) {
                return interaction.reply({
                    content: "❌ Need a text channel.",
                    ephemeral: true
                });
            }

            const id = `GW-${Date.now().toString(36).toUpperCase()}`;
            const endsAt = Date.now() + duration;
            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle("🎉 Giveaway")
                .setDescription(
                    `**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\nClick **Enter** to join!`
                )
                .setFooter({ text: `ID ${id}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_enter:${guildId}:${id}`)
                    .setLabel("Enter")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji("🎉")
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });
            createGiveaway(guildId, {
                id,
                prize,
                winnerCount,
                channelId: channel.id,
                messageId: msg.id,
                hostId: interaction.user.id,
                endsAt,
                status: "active",
                entries: [],
                createdAt: Date.now()
            });
            try {
                scheduleGiveaway(
                    guildId,
                    getGiveaway(guildId, id) || { id, endsAt, status: "active" }
                );
            } catch (_) {}

            return interaction.reply({
                content: `✅ Giveaway **${id}** started in ${channel}.`,
                ephemeral: true
            });
        }

        const id = interaction.options.getString("id");
        if (sub === "info") {
            const g = getGiveaway(guildId, id);
            if (!g)
                return interaction.reply({
                    content: "❌ Giveaway not found.",
                    ephemeral: true
                });
            return interaction.reply({
                content: `**${g.id}** — ${g.prize}\nStatus: ${g.status}\nEntries: ${(g.entries || []).length}\nEnds: <t:${Math.floor(g.endsAt / 1000)}:R>`,
                ephemeral: true
            });
        }

        if (sub === "end") {
            const g = getGiveaway(guildId, id);
            if (!g || g.status !== "active") {
                return interaction.reply({
                    content: "❌ Active giveaway not found.",
                    ephemeral: true
                });
            }
            try { cancelGiveaway(guildId, id); } catch (_) {}
            await finishGiveaway(interaction.client, guildId, id);
            return interaction.reply({
                content: `✅ Ended **${id}**.`,
                ephemeral: true
            });
        }

        if (sub === "cancel") {
            const g = getGiveaway(guildId, id);
            if (!g || g.status !== "active") {
                return interaction.reply({
                    content: "❌ Active giveaway not found.",
                    ephemeral: true
                });
            }
            try { cancelGiveaway(guildId, id); } catch (_) {}
            endGiveaway(guildId, id);
            return interaction.reply({
                content: `✅ Cancelled **${id}**.`,
                ephemeral: true
            });
        }

        return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
    }
};
