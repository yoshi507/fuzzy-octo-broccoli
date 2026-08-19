const { loadDatabase } = require("../database/database.js");

module.exports = {
    name: "guildMemberAdd",

    async execute(member) {

        const database = loadDatabase();

        // =========================
        // AUTO ROLE
        // =========================

        const settings =
            database.autorole?.[member.guild.id];

        if (
            settings?.enabled &&
            settings.roleId
        ) {

            const role =
                member.guild.roles.cache.get(
                    settings.roleId
                );

            if (role) {

                if (
                    role.position <
                    member.guild.members.me.roles.highest.position
                ) {

                    await member.roles.add(role)
                        .catch(error =>
                            console.error(
                                "AutoRole error:",
                                error
                            )
                        );
                }
            }
        }

        // =========================
        // WELCOME MESSAGE
        // =========================

        const welcomeChannel =
            member.guild.channels.cache.find(
                channel =>
                    channel.name === "welcome" &&
                    channel.isTextBased()
            );

        if (welcomeChannel) {

            await welcomeChannel.send(
                `👋 Welcome ${member} to **${member.guild.name}**!`
            );
        }
    }
};
