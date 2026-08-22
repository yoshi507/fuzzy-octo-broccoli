const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");
const store = require("../utils/partnerships/store.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("affiliate")
        .setDescription("Affiliate codes for server-to-server referrals")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) =>
            s.setName("code").setDescription("Show this server’s affiliate code")
        )
        .addSubcommand((s) =>
            s.setName("stats").setDescription("View affiliate hit / join counts")
        )
        .addSubcommand((s) =>
            s
                .setName("track")
                .setDescription("Record a hit for another server’s affiliate code")
                .addStringOption((o) =>
                    o
                        .setName("code")
                        .setDescription("Their affiliate code")
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === "code") {
            const code = store.getOrCreateAffiliateCode(guildId);
            return interaction.reply({
                content:
                    `🏷️ Affiliate code for this server: \`${code}\`\n` +
                    `Share it with partner communities. They can run \`/affiliate track code:${code}\` when promoting you.`,
                ephemeral: true
            });
        }

        if (sub === "stats") {
            const g = store.getGuild(guildId);
            const code = store.getOrCreateAffiliateCode(guildId);
            const embed = new EmbedBuilder()
                .setTitle("Affiliate stats")
                .setColor(0x57f287)
                .addFields(
                    { name: "Code", value: `\`${code}\``, inline: true },
                    {
                        name: "Hits",
                        value: String(g.affiliateHits || 0),
                        inline: true
                    },
                    {
                        name: "Joins",
                        value: String(g.affiliateJoins || 0),
                        inline: true
                    }
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === "track") {
            const code = interaction.options.getString("code", true).trim();
            const owner = store.recordAffiliateHit(code);
            if (!owner) {
                return interaction.reply({
                    content: "❌ Unknown affiliate code.",
                    ephemeral: true
                });
            }
            if (owner === guildId) {
                return interaction.reply({
                    content: "❌ That is your own code.",
                    ephemeral: true
                });
            }
            return interaction.reply({
                content: `✅ Recorded an affiliate hit for \`${code}\`.`,
                ephemeral: true
            });
        }
    }
};
