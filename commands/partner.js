const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");
const store = require("../utils/partnerships/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("partner")
        .setDescription("Server partnerships and cross-promotion")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) =>
            s
                .setName("setup")
                .setDescription("Set your public partner bio and invite link")
                .addStringOption((o) =>
                    o
                        .setName("bio")
                        .setDescription("Short description of your server")
                        .setRequired(true)
                        .setMaxLength(300)
                )
                .addStringOption((o) =>
                    o
                        .setName("invite")
                        .setDescription("Permanent invite URL to your server")
                        .setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("request")
                .setDescription("Request a partnership with another server (by ID)")
                .addStringOption((o) =>
                    o
                        .setName("server_id")
                        .setDescription("Target Discord server ID")
                        .setRequired(true)
                )
                .addStringOption((o) =>
                    o
                        .setName("message")
                        .setDescription("Optional message to their staff")
                        .setMaxLength(500)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("incoming")
                .setDescription("List pending partnership requests to this server")
        )
        .addSubcommand((s) =>
            s
                .setName("accept")
                .setDescription("Accept a partnership request")
                .addStringOption((o) =>
                    o
                        .setName("request_id")
                        .setDescription("Request ID from /partner incoming")
                        .setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("reject")
                .setDescription("Reject a partnership request")
                .addStringOption((o) =>
                    o
                        .setName("request_id")
                        .setDescription("Request ID from /partner incoming")
                        .setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s.setName("list").setDescription("List current partner servers")
        )
        .addSubcommand((s) =>
            s
                .setName("remove")
                .setDescription("End a partnership")
                .addStringOption((o) =>
                    o
                        .setName("server_id")
                        .setDescription("Partner server ID")
                        .setRequired(true)
                )
        )
        .addSubcommand((s) =>
            s
                .setName("info")
                .setDescription("Show this server partnership profile")
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === "setup") {
            const bio = interaction.options.getString("bio", true);
            const invite = interaction.options.getString("invite", true);
            if (!/^https?:\/\//i.test(invite)) {
                return interaction.reply({
                    content: "❌ Invite must be a full URL (https://discord.gg/...)",
                    ephemeral: true
                });
            }
            store.updateGuild(guildId, {
                bio,
                inviteUrl: invite,
                enabled: true
            });
            const code = store.getOrCreateAffiliateCode(guildId);
            return interaction.reply({
                content:
                    `✅ Partnership profile saved.\n` +
                    `Affiliate code: \`${code}\` (share with other servers)\n` +
                    `Other servers can request a partnership with server ID \`${guildId}\`.`,
                ephemeral: true
            });
        }

        if (sub === "request") {
            const toId = interaction.options.getString("server_id", true).trim();
            const message = interaction.options.getString("message") || "";
            if (toId === guildId) {
                return interaction.reply({
                    content: "❌ You cannot partner with yourself.",
                    ephemeral: true
                });
            }
            if (!/^\d{17,20}$/.test(toId)) {
                return interaction.reply({
                    content: "❌ Invalid server ID.",
                    ephemeral: true
                });
            }
            const partners = store.listPartners(guildId);
            if (partners.includes(toId)) {
                return interaction.reply({
                    content: "❌ You are already partners with that server.",
                    ephemeral: true
                });
            }
            const req = store.createRequest(guildId, toId, message);
            return interaction.reply({
                content:
                    `✅ Partnership request sent to \`${toId}\`.\n` +
                    `Request ID: \`${req.id}\`\n` +
                    `Their staff can run \`/partner incoming\` then \`/partner accept\`.`,
                ephemeral: true
            });
        }

        if (sub === "incoming") {
            const list = store.listIncoming(guildId);
            if (!list.length) {
                return interaction.reply({
                    content: "No pending partnership requests.",
                    ephemeral: true
                });
            }
            const lines = list.map(
                (r) =>
                    `• \`${r.id}\` from \`${r.fromGuildId}\`${r.message ? ` — ${r.message}` : ""}`
            );
            return interaction.reply({
                content: `**Incoming requests**\n${lines.join("\n")}`,
                ephemeral: true
            });
        }

        if (sub === "accept") {
            const id = interaction.options.getString("request_id", true).trim();
            const req = store.getRequest(id);
            if (!req || req.toGuildId !== guildId) {
                return interaction.reply({
                    content: "❌ Request not found for this server.",
                    ephemeral: true
                });
            }
            if (req.status !== "pending") {
                return interaction.reply({
                    content: `❌ Request is already **${req.status}**.`,
                    ephemeral: true
                });
            }
            store.acceptRequest(id);
            return interaction.reply({
                content: `✅ Partnership accepted with \`${req.fromGuildId}\`. Use \`/partner list\` to view partners.`,
                ephemeral: true
            });
        }

        if (sub === "reject") {
            const id = interaction.options.getString("request_id", true).trim();
            const req = store.getRequest(id);
            if (!req || req.toGuildId !== guildId) {
                return interaction.reply({
                    content: "❌ Request not found for this server.",
                    ephemeral: true
                });
            }
            store.rejectRequest(id);
            return interaction.reply({
                content: "✅ Request rejected.",
                ephemeral: true
            });
        }

        if (sub === "list") {
            const partners = store.listPartners(guildId);
            if (!partners.length) {
                return interaction.reply({
                    content: "No active partners yet.",
                    ephemeral: true
                });
            }
            const lines = partners.map((id) => {
                const g = store.getGuild(id);
                return `• \`${id}\`${g.bio ? ` — ${g.bio.slice(0, 80)}` : ""}${g.inviteUrl ? ` · ${g.inviteUrl}` : ""}`;
            });
            return interaction.reply({
                content: `**Partners (${partners.length})**\n${lines.join("\n")}`,
                ephemeral: true
            });
        }

        if (sub === "remove") {
            const pid = interaction.options.getString("server_id", true).trim();
            store.removePartner(guildId, pid);
            return interaction.reply({
                content: `✅ Removed partnership with \`${pid}\` (if it existed).`,
                ephemeral: true
            });
        }

        if (sub === "info") {
            const g = store.getGuild(guildId);
            const code = store.getOrCreateAffiliateCode(guildId);
            const embed = new EmbedBuilder()
                .setTitle("Partnership profile")
                .setColor(0x5865f2)
                .addFields(
                    {
                        name: "Bio",
                        value: g.bio || "_Not set — use /partner setup_",
                        inline: false
                    },
                    {
                        name: "Invite",
                        value: g.inviteUrl || "_Not set_",
                        inline: false
                    },
                    {
                        name: "Affiliate code",
                        value: `\`${code}\``,
                        inline: true
                    },
                    {
                        name: "Affiliate stats",
                        value: `Hits: **${g.affiliateHits || 0}** · Joins: **${g.affiliateJoins || 0}**`,
                        inline: true
                    },
                    {
                        name: "Partners",
                        value: String((g.partnerGuildIds || []).length),
                        inline: true
                    }
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
