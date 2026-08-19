const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Add or remove a role from a member")

        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Give a role to a member")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("The member")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("The role to give")
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a role from a member")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("The member")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("The role to remove")
                        .setRequired(true)
                )
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageRoles
        ),

    async execute(interaction) {

        const action =
            interaction.options.getSubcommand();

        const user =
            interaction.options.getUser("user");

        const role =
            interaction.options.getRole("role");

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member) {
            return interaction.reply({
                content:
                    "❌ That user isn't in this server.",
                ephemeral: true
            });
        }

        // Don't allow @everyone
        if (role.id === interaction.guild.id) {
            return interaction.reply({
                content:
                    "❌ You cannot modify the @everyone role.",
                ephemeral: true
            });
        }

        // Don't allow managed roles
        if (role.managed) {
            return interaction.reply({
                content:
                    "❌ You cannot manually manage that role.",
                ephemeral: true
            });
        }

        // Make sure the bot can manage the role
        if (
            role.position >=
            interaction.guild.members.me.roles.highest.position
        ) {
            return interaction.reply({
                content:
                    "❌ I cannot manage that role because it is above my highest role.",
                ephemeral: true
            });
        }

        try {

            if (action === "add") {

                if (member.roles.cache.has(role.id)) {
                    return interaction.reply({
                        content:
                            `❌ ${user} already has ${role}.`,
                        ephemeral: true
                    });
                }

                await member.roles.add(role);

                await sendModLog(interaction.guild, {
                    title: "🎭 Role Added",
                    description:
                        `${interaction.user} gave ${role} to ${user}.`,
                    userId: user.id,
                    moderatorId: interaction.user.id,
                    reason:
                        `Role added: ${role.name}`
                });

                return interaction.reply(
                    `✅ Added ${role} to **${user.tag}**.`
                );
            }

            if (action === "remove") {

                if (!member.roles.cache.has(role.id)) {
                    return interaction.reply({
                        content:
                            `❌ ${user} doesn't have ${role}.`,
                        ephemeral: true
                    });
                }

                await member.roles.remove(role);

                await sendModLog(interaction.guild, {
                    title: "🎭 Role Removed",
                    description:
                        `${interaction.user} removed ${role} from ${user}.`,
                    userId: user.id,
                    moderatorId: interaction.user.id,
                    reason:
                        `Role removed: ${role.name}`
                });

                return interaction.reply(
                    `✅ Removed ${role} from **${user.tag}**.`
                );
            }

        } catch (error) {

            console.error(
                "Role command error:",
                error
            );

            return interaction.reply({
                content:
                    "❌ I couldn't modify that member's roles.",
                ephemeral: true
            });
        }
    }
};
