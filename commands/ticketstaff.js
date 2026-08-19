const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ticketstaff")
        .setDescription("Manage ticket staff roles")

        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a staff role")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Staff role to add")
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a staff role")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Staff role to remove")
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Show all ticket staff roles")
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const database = loadDatabase();

        if (!database.ticketSettings) {
            database.ticketSettings = {};
        }

        if (!database.ticketSettings[interaction.guild.id]) {
            database.ticketSettings[interaction.guild.id] = {};
        }

        const settings =
            database.ticketSettings[interaction.guild.id];

        if (!settings.staffRoleIds) {
            settings.staffRoleIds = [];
        }

        const action =
            interaction.options.getSubcommand();

        const role =
            interaction.options.getRole("role");

        if (action === "add") {

            if (settings.staffRoleIds.includes(role.id)) {
                return interaction.reply({
                    content: `❌ ${role} is already a ticket staff role.`,
                    ephemeral: true
                });
            }

            settings.staffRoleIds.push(role.id);

            saveDatabase(database);

            return interaction.reply(
                `✅ Added ${role} to the ticket staff roles.`
            );
        }

        if (action === "remove") {

            if (!settings.staffRoleIds.includes(role.id)) {
                return interaction.reply({
                    content: `❌ ${role} isn't a ticket staff role.`,
                    ephemeral: true
                });
            }

            settings.staffRoleIds =
                settings.staffRoleIds.filter(
                    id => id !== role.id
                );

            saveDatabase(database);

            return interaction.reply(
                `✅ Removed ${role} from the ticket staff roles.`
            );
        }

        if (action === "list") {

            if (settings.staffRoleIds.length === 0) {
                return interaction.reply(
                    "📋 No ticket staff roles have been configured."
                );
            }

            const roles = settings.staffRoleIds
                .map(id => {
                    const staffRole =
                        interaction.guild.roles.cache.get(id);

                    return staffRole
                        ? `${staffRole}`
                        : `Unknown Role (${id})`;
                })
                .join("\n");

            return interaction.reply(
                `🎫 **Ticket Staff Roles**\n\n${roles}`
            );
        }
    }
};
