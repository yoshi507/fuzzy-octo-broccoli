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
            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("🎉 Giveaway ended")
                .setDescription(`**Prize:** ${g.prize}\n**Winners:** ${text}`)
                .setFooter({ text: `ID ${g.id}` });
            if (g.messageId) {
                const msg = await ch.messages.fetch(g.messageId).catch(() => null);
                if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
                else await ch.send({ embeds: [embed] });
            } else await ch.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error("Giveaway finish error:", e?.message || e);
    }
    return g;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Create and manage giveaways")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) =>
            s.setName("start").setDescription("Start a giveaway")
                .addStringOption((o) => o.setName("duration").setDescription("e.g. 10m, 1h, 1d").setRequired(true))
                .addStringOption((o) => o.setName("prize").setDescription("Prize").setRequired(true))
                .addIntegerOption((o) => o.setName("winners").setDescription("Winner count").setMinValue(1).setMaxValue(20))
                .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: current)"))
        )
        .addSubcommand((s) =>
            s.setName("end").setDescription("End a giveaway early")
                .addStringOption((o) => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        )
        .addSubcommand((s) =>
            s.setName("cancel").setDescription("Cancel a giveaway")
                .addStringOption((o) => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        )
        .addSubcommand((s) =>
            s.setName("info").setDescription("Show giveaway info")
                .addStringOption((o) => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        ),

    finishGiveaway,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const settings = getSettings(guildId);
        if (settings.enabled === false && sub === "start") {
            return interaction.reply({ content: "❌ Giveaways are disabled on this server.", ephemeral: true });
        }

        if (sub === "start") {
            const duration = parseDuration(interaction.options.getString("duration"));
            if (!duration || duration < 10000 || duration > 30 * 86400000) {
                return interaction.reply({
                    content: "❌ Invalid duration. Use e.g. `30s`, `10m`, `2h`, `1d` (max 30d).",
                    ephemeral: true
                });
            }
            const prize = interaction.options.getString("prize").slice(0, 200);
            const winnerCount = interaction.options.getInteger("winners") || 1;
            const channel = interaction.options.getChannel("channel") || interaction.channel;
            if (!channel?.isTextBased?.()) {
                return interaction.reply({ content: "❌ Need a text channel.", ephemeral: true });
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

            return interaction.reply({
                content: `✅ Giveaway **${id}** started in ${channel}.`,
                ephemeral: true
            });
        }

        const id = interaction.options.getString("id");
        if (sub === "info") {
            const g = getGiveaway(guildId, id);
            if (!g) return interaction.reply({ content: "❌ Giveaway not found.", ephemeral: true });
            return interaction.reply({
                content: `**${g.id}** — ${g.prize}\nStatus: ${g.status}\nEntries: ${(g.entries || []).length}\nEnds: <t:${Math.floor(g.endsAt / 1000)}:R>`,
                ephemeral: true
            });
        }

        if (sub === "end") {
            const g = getGiveaway(guildId, id);
            if (!g || g.status !== "active") {
                return interaction.reply({ content: "❌ Active giveaway not found.", ephemeral: true });
            }
            await finishGiveaway(interaction.client, guildId, id);
            return interaction.reply({ content: `✅ Ended **${id}**.`, ephemeral: true });
        }

        if (sub === "cancel") {
            const g = getGiveaway(guildId, id);
            if (!g || g.status !== "active") {
                return interaction.reply({ content: "❌ Active giveaway not found.", ephemeral: true });
            }
            g.status = "cancelled";
            endGiveaway(guildId, id);
            return interaction.reply({ content: `✅ Cancelled **${id}**.`, ephemeral: true });
        }
    }
};

module.exports.handleGiveawayButton = async function handleGiveawayButton(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith("giveaway_enter:")) return false;
    const parts = interaction.customId.split(":");
    const guildId = parts[1];
    const id = parts[2];
    if (interaction.guildId !== guildId) {
        await interaction.reply({ content: "❌ Wrong server.", ephemeral: true });
        return true;
    }
    const result = addEntry(guildId, id, interaction.user.id);
    if (!result.ok) {
        await interaction.reply({
            content:
                result.reason === "duplicate"
                    ? "You're already entered!"
                    : "This giveaway is not active.",
            ephemeral: true
        });
        return true;
    }
    await interaction.reply({
        content: `You're in! (${result.count} entr${result.count === 1 ? "y" : "ies"})`,
        ephemeral: true
    });
    return true;
};
