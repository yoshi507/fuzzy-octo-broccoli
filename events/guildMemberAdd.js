const { loadDatabase } = require("../database/database.js");

module.exports = {
    name: "guildMemberAdd",

    async execute(member) {
        const database = loadDatabase();

        // =========================
        // AUTO ROLE
        // =========================

        const autoRoleSettings =
            database.autorole?.[member.guild.id];

        if (autoRoleSettings?.enabled && autoRoleSettings.roleId) {
            const role = member.guild.roles.cache.get(
                autoRoleSettings.roleId
            );

            if (role) {
                const me = member.guild.members.me;
                if (
                    me &&
                    role.position < me.roles.highest.position
                ) {
                    await member.roles
                        .add(role)
                        .catch(error =>
                            console.error("AutoRole error:", error)
                        );
                }
            }
        }

        // =========================
        // WELCOME MESSAGE
        // =========================

        const welcomeSettings =
            database.welcomeSettings?.[member.guild.id];

        if (welcomeSettings?.enabled && welcomeSettings.channelId) {
            const channel = member.guild.channels.cache.get(
                welcomeSettings.channelId
            );

            if (channel?.isTextBased()) {
                const message = (welcomeSettings.message ||
                    "👋 Welcome {user} to **{server}**!")
                    .replaceAll("{user}", `<@${member.id}>`)
                    .replaceAll("{username}", member.user.username)
                    .replaceAll("{server}", member.guild.name)
                    .replaceAll(
                        "{membercount}",
                        member.guild.memberCount.toString()
                    );

                await channel.send(message).catch(() => {});
            }
        }
    }
};
