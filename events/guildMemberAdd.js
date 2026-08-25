const { loadDatabase } = require("../database/database.js");

module.exports = {
    name: "guildMemberAdd",

    async execute(member) {
        let database;
        try {
            database = loadDatabase();
        } catch (e) {
            console.error("[Welcome] loadDatabase failed:", e?.message || e);
            return;
        }

        // AUTO ROLE
        try {
            const autoRoleSettings = database.autorole?.[member.guild.id];
            if (autoRoleSettings?.enabled && autoRoleSettings.roleId) {
                const role =
                    member.guild.roles.cache.get(autoRoleSettings.roleId) ||
                    (await member.guild.roles.fetch(autoRoleSettings.roleId).catch(() => null));
                if (role) {
                    const me = member.guild.members.me;
                    if (me && role.editable !== false && role.position < me.roles.highest.position) {
                        await member.roles.add(role).catch((error) =>
                            console.error("[AutoRole] add failed:", error?.message || error)
                        );
                    }
                }
            }
        } catch (e) {
            console.error("[AutoRole] error:", e?.message || e);
        }

        // CAPTCHA VERIFICATION
        try {
            const { getConfig, createChallenge } = require("../utils/captcha/store.js");
            const {
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
                EmbedBuilder
            } = require("discord.js");
            const cfg = getConfig(member.guild.id);
            if (cfg.enabled && cfg.channelId) {
                if (cfg.unverifiedRoleId) {
                    await member.roles.add(cfg.unverifiedRoleId).catch(() => {});
                }
                const challenge = createChallenge(member.guild.id, member.id);
                let channel =
                    member.guild.channels.cache.get(cfg.channelId) ||
                    (await member.guild.channels.fetch(cfg.channelId).catch(() => null));
                if (channel?.isTextBased?.()) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`captcha_solve:${challenge.token}`)
                            .setLabel("Verify")
                            .setStyle(ButtonStyle.Primary)
                    );
                    await channel.send({
                        content: `${member}`,
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x5865f2)
                                .setTitle("Verification required")
                                .setDescription(
                                    `Welcome ${member}! Click **Verify** and answer:\n\n**${challenge.prompt}**`
                                )
                        ],
                        components: [row]
                    });
                }
            }
        } catch (e) {
            console.error("[Captcha] join error:", e?.message || e);
        }

        // WELCOME MESSAGE
        try {
            const welcomeSettings = database.welcomeSettings?.[member.guild.id];
            if (!welcomeSettings?.enabled || !welcomeSettings.channelId) return;

            let channel =
                member.guild.channels.cache.get(welcomeSettings.channelId) ||
                null;
            if (!channel) {
                channel = await member.guild.channels
                    .fetch(welcomeSettings.channelId)
                    .catch((err) => {
                        console.error(
                            "[Welcome] channel fetch failed:",
                            err?.message || err
                        );
                        return null;
                    });
            }

            if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased()) {
                console.warn(
                    `[Welcome] Channel ${welcomeSettings.channelId} missing or not text-based in ${member.guild.name}`
                );
                return;
            }

            const me = member.guild.members.me;
            if (me && channel.permissionsFor && !channel.permissionsFor(me)?.has?.(["SendMessages", "ViewChannel"])) {
                console.warn(
                    `[Welcome] Missing SendMessages/ViewChannel in #${channel.name} (${member.guild.name})`
                );
                return;
            }

            const message = String(
                welcomeSettings.message ||
                    "👋 Welcome {user} to **{server}**! You are member **#{membercount}."
            )
                .replaceAll("{user}", `<@${member.id}>`)
                .replaceAll("{username}", member.user.username)
                .replaceAll("{tag}", member.user.tag || member.user.username)
                .replaceAll("{server}", member.guild.name)
                .replaceAll("{membercount}", String(member.guild.memberCount ?? ""));

            await channel.send({ content: message }).catch((err) => {
                console.error("[Welcome] send failed:", err?.message || err);
            });
        } catch (e) {
            console.error("[Welcome] error:", e?.message || e);
        }
    }
};
