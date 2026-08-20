const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");
const {
    getSettings,
    findOpenByUser,
    createAppeal,
    getAppeal,
    updateAppeal,
    lastClosedAt,
    listAppeals
} = require("../utils/appeals/store.js");
const { applyAcceptedAction } = require("../utils/appeals/actions.js");

const APPEAL_TYPES = [
    { name: "Ban", value: "ban" },
    { name: "Timeout / Mute", value: "timeout" },
    { name: "Warning", value: "warn" }
];

function isStaff(member, settings) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    if (member.permissions.has(PermissionFlagsBits.BanMembers)) return true;
    if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
    return (settings.staffRoleIds || []).some((id) => member.roles.cache.has(id));
}

function formatAnswers(appeal, settings) {
    const lines = [];
    for (const q of settings.questions || []) {
        const ans = appeal.answers?.[q.id];
        if (ans) lines.push(`**${q.label}**\n${ans}`);
    }
    return lines.join("\n\n") || "*No answers*";
}

function typeLabel(type) {
    const t = String(type || "ban").toLowerCase();
    if (t === "timeout" || t === "mute") return "Timeout / Mute";
    if (t === "warn" || t === "warning") return "Warning";
    return "Ban";
}

function reviewButtons(appealId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`appeal_accept:${appealId}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`appeal_reject:${appealId}`)
            .setLabel("Reject")
            .setStyle(ButtonStyle.Danger)
    );
}

function buildAppealEmbed(appeal, settings, statusNote) {
    const embed = new EmbedBuilder()
        .setTitle(`Appeal ${appeal.id}`)
        .setColor(settings.embedColor || 0x5865f2)
        .setDescription(formatAnswers(appeal, settings))
        .addFields(
            { name: "User", value: `<@${appeal.userId}> (\`${appeal.userId}\`)`, inline: true },
            { name: "Type", value: typeLabel(appeal.type), inline: true },
            { name: "Status", value: appeal.status || "pending", inline: true }
        )
        .setFooter({ text: "Accept / Reject buttons · or /appeal accept|reject" });
    if (statusNote) {
        embed.addFields({ name: "Result", value: statusNote.slice(0, 1024) });
    }
    return embed;
}

async function finalizeReview(guild, appeal, status, reviewer, note) {
    const settings = getSettings(guild.id);
    updateAppeal(guild.id, appeal.id, {
        status,
        staffNote: note || null,
        reviewedBy: reviewer.id
    });

    let actionSummary = "";
    if (status === "accepted") {
        actionSummary = await applyAcceptedAction(guild, appeal, reviewer);
    }

    const msg = status === "accepted" ? settings.acceptMessage : settings.rejectMessage;
    try {
        const user = await guild.client.users.fetch(appeal.userId);
        await user.send(
            `**${guild.name}** — Appeal **${appeal.id}**\n${msg}` +
                (note ? `\n\nNote: ${note}` : "") +
                (actionSummary ? `\n\n${actionSummary}` : "")
        );
    } catch {
        /* DMs closed */
    }

    try {
        if (appeal.channelId && appeal.messageId) {
            const ch = await guild.channels.fetch(appeal.channelId).catch(() => null);
            const msgObj = ch ? await ch.messages.fetch(appeal.messageId).catch(() => null) : null;
            if (msgObj) {
                const refreshed = getAppeal(guild.id, appeal.id);
                const embed = buildAppealEmbed(
                    refreshed || appeal,
                    settings,
                    `${status.toUpperCase()} by ${reviewer.tag || reviewer.username}` +
                        (actionSummary ? `\n${actionSummary}` : "")
                );
                await msgObj.edit({ embeds: [embed], components: [] });
            }
        }
    } catch (err) {
        console.error("[appeals] update staff message failed:", err?.message || err);
    }

    return actionSummary;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("appeal")
        .setDescription("Ban / timeout / warning appeals")
        .addSubcommand((s) =>
            s
                .setName("submit")
                .setDescription("Submit a new appeal")
                .addStringOption((o) =>
                    o
                        .setName("type")
                        .setDescription("What punishment are you appealing?")
                        .addChoices(...APPEAL_TYPES)
                        .setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("status")
                .setDescription("Check your appeal status")
                .addStringOption((o) => o.setName("id").setDescription("Appeal ID"))
        )
        .addSubcommand((s) =>
            s
                .setName("view")
                .setDescription("Staff: view an appeal")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Appeal ID").setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("accept")
                .setDescription("Staff: accept an appeal (applies unban / untimeout / unwarn)")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Appeal ID").setRequired(true)
                )
                .addStringOption((o) => o.setName("note").setDescription("Optional note"))
        )
        .addSubcommand((s) =>
            s
                .setName("reject")
                .setDescription("Staff: reject an appeal")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Appeal ID").setRequired(true)
                )
                .addStringOption((o) => o.setName("note").setDescription("Optional note"))
        )
        .addSubcommand((s) =>
            s
                .setName("moreinfo")
                .setDescription("Staff: request more information")
                .addStringOption((o) =>
                    o.setName("id").setDescription("Appeal ID").setRequired(true)
                )
                .addStringOption((o) =>
                    o.setName("message").setDescription("What you need").setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("list")
                .setDescription("Staff: list recent appeals")
                .addStringOption((o) =>
                    o
                        .setName("status")
                        .setDescription("Filter")
                        .addChoices(
                            { name: "Pending", value: "pending" },
                            { name: "Accepted", value: "accepted" },
                            { name: "Rejected", value: "rejected" },
                            { name: "All", value: "all" }
                        )
                )
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ Appeals must be used in a server.",
                ephemeral: true
            });
        }
        const settings = getSettings(interaction.guild.id);
        const sub = interaction.options.getSubcommand();

        if (sub === "submit") {
            if (!settings.enabled) {
                return interaction.reply({
                    content: "❌ Appeals are not enabled on this server.",
                    ephemeral: true
                });
            }
            if (findOpenByUser(interaction.guild.id, interaction.user.id)) {
                return interaction.reply({
                    content: "❌ You already have an open appeal.",
                    ephemeral: true
                });
            }
            const last = lastClosedAt(interaction.guild.id, interaction.user.id);
            const cooldownMs = (settings.cooldownHours || 72) * 3600 * 1000;
            if (last && Date.now() - last < cooldownMs) {
                const hoursLeft = Math.ceil((cooldownMs - (Date.now() - last)) / 3600000);
                return interaction.reply({
                    content: `⏳ Please wait about **${hoursLeft} hour(s)** before submitting another appeal.`,
                    ephemeral: true
                });
            }
            const type = interaction.options.getString("type") || "ban";
            const questions = (settings.questions || []).slice(0, 5);
            const modal = new ModalBuilder()
                .setCustomId(`appeal_modal:${type}`)
                .setTitle(`Appeal: ${typeLabel(type)}`.slice(0, 45));
            for (const q of questions) {
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId(q.id)
                            .setLabel(q.label.slice(0, 45))
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(Boolean(q.required))
                            .setMaxLength(1000)
                    )
                );
            }
            return interaction.showModal(modal);
        }

        if (sub === "status") {
            const id = interaction.options.getString("id");
            let appeal = id
                ? getAppeal(interaction.guild.id, id.toUpperCase())
                : findOpenByUser(interaction.guild.id, interaction.user.id);
            if (!appeal || appeal.userId !== interaction.user.id) {
                return interaction.reply({ content: "❌ No appeal found for you.", ephemeral: true });
            }
            return interaction.reply({
                content:
                    `📋 Appeal **${appeal.id}** — status: **${appeal.status}** · type: **${typeLabel(appeal.type)}**\n` +
                    `Submitted <t:${Math.floor(appeal.createdAt / 1000)}:R>`,
                ephemeral: true
            });
        }

        if (["view", "accept", "reject", "moreinfo", "list"].includes(sub)) {
            if (!isStaff(interaction.member, settings)) {
                return interaction.reply({ content: "❌ Staff only.", ephemeral: true });
            }
        }

        if (sub === "list") {
            const filter = interaction.options.getString("status") || "pending";
            let rows = listAppeals(interaction.guild.id);
            if (filter !== "all") rows = rows.filter((a) => a.status === filter);
            rows = rows.slice(0, 15);
            if (!rows.length) return interaction.reply({ content: "No appeals found.", ephemeral: true });
            const text = rows
                .map(
                    (a) =>
                        `• **${a.id}** — <@${a.userId}> — \`${typeLabel(a.type)}\` — \`${a.status}\` — <t:${Math.floor(a.createdAt / 1000)}:R>`
                )
                .join("\n");
            return interaction.reply({ content: text, ephemeral: true });
        }

        if (sub === "view") {
            const id = interaction.options.getString("id").toUpperCase();
            const appeal = getAppeal(interaction.guild.id, id);
            if (!appeal) return interaction.reply({ content: "❌ Appeal not found.", ephemeral: true });
            const embed = buildAppealEmbed(appeal, settings);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === "accept" || sub === "reject") {
            const id = interaction.options.getString("id").toUpperCase();
            const note = interaction.options.getString("note");
            const appeal = getAppeal(interaction.guild.id, id);
            if (!appeal) return interaction.reply({ content: "❌ Appeal not found.", ephemeral: true });
            if (appeal.status !== "pending" && appeal.status !== "more_info") {
                return interaction.reply({
                    content: `❌ Appeal is already **${appeal.status}**.`,
                    ephemeral: true
                });
            }
            const status = sub === "accept" ? "accepted" : "rejected";
            const actionSummary = await finalizeReview(
                interaction.guild,
                appeal,
                status,
                interaction.user,
                note
            );
            return interaction.reply({
                content:
                    `✅ Appeal **${id}** marked **${status}**.` +
                    (actionSummary ? `\n${actionSummary}` : ""),
                ephemeral: true
            });
        }

        if (sub === "moreinfo") {
            const id = interaction.options.getString("id").toUpperCase();
            const message = interaction.options.getString("message");
            const appeal = getAppeal(interaction.guild.id, id);
            if (!appeal) return interaction.reply({ content: "❌ Appeal not found.", ephemeral: true });
            updateAppeal(interaction.guild.id, id, {
                status: "more_info",
                staffNote: message,
                reviewedBy: interaction.user.id
            });
            try {
                const user = await interaction.client.users.fetch(appeal.userId);
                await user.send(
                    `**${interaction.guild.name}** — Appeal **${id}**\n${settings.moreInfoMessage}\n\n${message}`
                );
            } catch {}
            return interaction.reply({ content: `✅ Requested more info for **${id}**.`, ephemeral: true });
        }
    },

    async handleModal(interaction) {
        if (!interaction.customId.startsWith("appeal_modal:")) return false;
        if (!interaction.guild) {
            await interaction.reply({ content: "❌ Guild required.", ephemeral: true });
            return true;
        }
        const settings = getSettings(interaction.guild.id);
        if (!settings.enabled) {
            await interaction.reply({ content: "❌ Appeals disabled.", ephemeral: true });
            return true;
        }
        if (findOpenByUser(interaction.guild.id, interaction.user.id)) {
            await interaction.reply({ content: "❌ You already have an open appeal.", ephemeral: true });
            return true;
        }
        const type = interaction.customId.split(":")[1] || "ban";
        const answers = {};
        for (const q of settings.questions || []) {
            try {
                const v = interaction.fields.getTextInputValue(q.id);
                if (v) answers[q.id] = v.slice(0, 1000);
            } catch {}
        }
        const appeal = createAppeal(interaction.guild.id, {
            userId: interaction.user.id,
            username: interaction.user.tag || interaction.user.username,
            type,
            answers
        });
        const embed = buildAppealEmbed(appeal, settings);
        if (settings.channelId) {
            const ch = await interaction.guild.channels.fetch(settings.channelId).catch(() => null);
            if (ch?.isTextBased()) {
                const mention = (settings.staffRoleIds || []).map((id) => `<@&${id}>`).join(" ");
                const msg = await ch.send({
                    content: mention || undefined,
                    embeds: [embed],
                    components: [reviewButtons(appeal.id)]
                });
                updateAppeal(interaction.guild.id, appeal.id, {
                    messageId: msg.id,
                    channelId: ch.id
                });
            }
        }
        await interaction.reply({
            content: `✅ ${settings.pendingMessage}\nReference: **${appeal.id}** · Type: **${typeLabel(type)}**`,
            ephemeral: true
        });
        return true;
    },

    async handleButton(interaction) {
        const id = interaction.customId || "";
        if (!id.startsWith("appeal_accept:") && !id.startsWith("appeal_reject:")) {
            return false;
        }
        if (!interaction.guild) {
            await interaction.reply({ content: "❌ Guild required.", ephemeral: true });
            return true;
        }
        const settings = getSettings(interaction.guild.id);
        if (!isStaff(interaction.member, settings)) {
            await interaction.reply({ content: "❌ Staff only.", ephemeral: true });
            return true;
        }
        const appealId = id.split(":")[1];
        const appeal = getAppeal(interaction.guild.id, appealId);
        if (!appeal) {
            await interaction.reply({ content: "❌ Appeal not found.", ephemeral: true });
            return true;
        }
        if (appeal.status !== "pending" && appeal.status !== "more_info") {
            await interaction.reply({
                content: `❌ Appeal is already **${appeal.status}**.`,
                ephemeral: true
            });
            return true;
        }
        const status = id.startsWith("appeal_accept:") ? "accepted" : "rejected";
        await interaction.deferReply({ ephemeral: true });
        const actionSummary = await finalizeReview(
            interaction.guild,
            appeal,
            status,
            interaction.user,
            null
        );
        await interaction.editReply({
            content:
                `✅ Appeal **${appealId}** marked **${status}**.` +
                (actionSummary ? `\n${actionSummary}` : "")
        });
        return true;
    }
};
