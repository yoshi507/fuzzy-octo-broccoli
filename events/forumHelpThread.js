const { ChannelType } = require("discord.js");
const { shouldHelp } = require("../utils/features/forumHelp.js");

module.exports = {
    name: "threadCreate",
    async execute(thread) {
        try {
            if (!thread.guild) return;
            if (thread.parent?.type !== ChannelType.GuildForum && thread.parent?.type !== 15) {
                return;
            }
            if (!shouldHelp(thread.guild.id, thread)) return;

            await new Promise((r) => setTimeout(r, 1500));

            let starter = "";
            try {
                const msg = await thread.fetchStarterMessage().catch(() => null);
                starter = msg?.content || thread.name || "";
            } catch (_) {
                starter = thread.name || "";
            }
            if (!starter.trim()) return;

            const { askAI } = require("../utils/ai/groq.js");
            const reply = await askAI(
                [
                    {
                        role: "system",
                        content:
                            "You are OmniBot, a helpful Discord forum assistant. Give a concise, practical answer to the forum post. Use short paragraphs or bullets. Do not invent server-specific facts."
                    },
                    {
                        role: "user",
                        content: `Forum post title: ${thread.name}\n\n${starter}`.slice(0, 4000)
                    }
                ],
                { guildId: thread.guild.id, maxTokens: 600, temperature: 0.5 }
            );

            if (reply) {
                await thread.send({
                    content: `💡 **Forum help**\n${reply}`.slice(0, 1900)
                });
            }
        } catch (e) {
            if (e?.code === "AI_DAILY_LIMIT" || e?.code === "AI_GLOBAL_LIMIT") {
                console.warn("[ForumHelp] AI limit, skip");
                return;
            }
            console.error("[ForumHelp]", e?.code || e?.message || e);
        }
    }
};
