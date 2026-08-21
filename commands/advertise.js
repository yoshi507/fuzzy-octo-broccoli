const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");
const {
    CATEGORIES,
    getListing,
    upsertListing,
    removeListing,
    normalizeCategory
} = require("../utils/advertise/store.js");

async function resolveInviteUrl(guild, provided) {
    if (provided && /^https?:\/\/(discord\.gg|discord\.com\/invite)\//i.test(provided)) {
        return provided.trim();
    }

    try {
        const me = guild.members.me;
        const channels = guild.channels.cache
            .filter(
                (c) =>
                    c &&
                    (c.type === ChannelType.GuildText ||
                        c.type === ChannelType.GuildAnnouncement) &&
                    c.viewable &&
                    me?.permissionsIn(c)?.has(PermissionFlagsBits.CreateInstantInvite)
            )
            .sort((a, b) => a.position - b.position);

        const channel =
            guild.systemChannel && channels.has(guild.systemChannel.id)
                ? guild.systemChannel
                : channels.first();

        if (channel) {
            const invite = await channel.createInvite({
                maxAge: 0,
                maxUses: 0,
                unique: false,
                reason: "OmniBot server advertisement listing"
            });
            return invite.url;
        }
    } catch (err) {
        console.warn("[advertise] invite create failed:", err?.message || err);
    }
    return provided || null;
}

function iconHashToUrl(guild) {
    if (!guild.icon) return null;
    return guild.iconURL({ size: 128, extension: "png" });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("List this server on the OmniBot Advertise directory")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName("publish")
                .setDescription("Publish or update this server on the advertise page")
                .addStringOption((opt) =>
                    opt
                        .setName("category")
                        .setDescription("Category for discovery")
                        .setRequired(true)
                        .addChoices(
                            ...CATEGORIES.map((c) => ({
                                name: c.label,
                                value: c.id
                            }))
                        )
                )
                .addStringOption((opt) =>
                    opt
                        .setName("description")
                        .setDescription("Short blurb (max 300 chars)")
                        .setRequired(false)
                        .setMaxLength(300)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("invite")
                        .setDescription("Invite link (optional — Omni can create one)")
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("unpublish")
                .setDescription("Remove this server from the advertise directory")
        )
        .addSubcommand((sub) =>
            sub
                .setName("status")
                .setDescription("Show whether this server is listed")
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ This command only works in a server.",
                ephemeral: true
            });
        }

        const sub =
            typeof interaction.options.getSubcommand === "function"
                ? interaction.options.getSubcommand()
                : "status";

        if (sub === "status") {
            const listing = getListing(interaction.guild.id);
            if (!listing) {
                return interaction.reply({
                    content:
                        "This server is **not** listed. Use `/advertise publish` to add it to the website directory.",
                    ephemeral: true
                });
            }
            return interaction.reply({
                content:
                    `**Listed** as **${listing.name}**\n` +
                    `Category: \`${listing.category}\`\n` +
                    `Members: ${listing.memberCount}\n` +
                    `Invite: ${listing.inviteUrl || "_none_"}\n` +
                    `Updated: ${listing.updatedAt}`,
                ephemeral: true
            });
        }

        if (sub === "unpublish") {
            const ok = removeListing(interaction.guild.id);
            return interaction.reply({
                content: ok
                    ? "✅ This server was removed from the Advertise directory."
                    : "This server was not listed.",
                ephemeral: true
            });
        }

        const category = normalizeCategory(
            interaction.options.getString("category")
        );
        const description =
            interaction.options.getString("description") ||
            interaction.guild.description ||
            "";
        const inviteInput = interaction.options.getString("invite");

        await interaction.deferReply({ ephemeral: true });

        const inviteUrl = await resolveInviteUrl(interaction.guild, inviteInput);

        if (!inviteUrl) {
            return interaction.editReply(
                "❌ Could not create an invite. Provide an invite link with the `invite` option, or give Omni **Create Invite** permission in a text channel."
            );
        }

        const listing = upsertListing(interaction.guild.id, {
            name: interaction.guild.name,
            icon: iconHashToUrl(interaction.guild),
            memberCount: interaction.guild.memberCount || 0,
            description,
            category,
            inviteUrl,
            listedBy: interaction.user.id
        });

        return interaction.editReply(
            `✅ **${listing.name}** is now listed on the Advertise page.\n` +
                `Category: \`${listing.category}\`\n` +
                `Open the website → **Advertise** to see it under that category.\n` +
                `Update anytime with \`/advertise publish\` · remove with \`/advertise unpublish\`.`
        );
    }
};
