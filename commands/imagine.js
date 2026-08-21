const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const {
    generateGuildImage,
    formatImageUserError,
    getRemaining,
    DAILY_LIMIT,
    QUEUE_WAIT_MESSAGE
} = require("../utils/ai/imageGen.js");
const {
    generateGuildVideo,
    formatVideoUserError
} = require("../utils/ai/videoGen.js");

function normalizeTypeAndPrompt(interaction) {
    let type = (interaction.options.getString("type") || "image").toLowerCase();
    let prompt = interaction.options.getString("prompt") || "";

    if (type !== "image" && type !== "video") {
        prompt = `${type} ${prompt}`.trim();
        type = "image";
    }

    const promptMatch = /^(image|video)[:\s]+(.+)$/i.exec(prompt.trim());
    if (promptMatch) {
        type = promptMatch[1].toLowerCase();
        prompt = promptMatch[2].trim();
    }

    return { type, prompt: String(prompt || "").trim() };
}

async function safeEdit(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload);
        }
        return await interaction.reply(payload);
    } catch (e) {
        console.error("[imagine] Discord edit/reply failed:", e?.message || e);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("imagine")
        .setDescription(
            "Generate an AI image or short video — uses 1 AI request"
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Image or video?")
                .setRequired(true)
                .addChoices(
                    { name: "Image generation", value: "image" },
                    { name: "Video generation", value: "video" }
                )
        )
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription("What should it show?")
                .setRequired(true)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        const { type, prompt } = normalizeTypeAndPrompt(interaction);

        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ This command only works in a server.",
                ephemeral: true
            });
        }

        if (!prompt) {
            return interaction.reply({
                content: "❌ Please describe what you want to generate.",
                ephemeral: true
            });
        }

        if (typeof interaction.deferReply === "function") {
            await interaction.deferReply();
        }

        const onQueued = async () => {
            await safeEdit(interaction, { content: QUEUE_WAIT_MESSAGE });
        };

        try {
            if (type === "video") {
                let lastEdit = 0;
                const onProgress = async (done, total) => {
                    const now = Date.now();
                    if (done < total && now - lastEdit < 4000) return;
                    lastEdit = now;
                    const text =
                        done >= total
                            ? "🎬 Rendering video…"
                            : `🎬 Generating video... **${done}/${total}** frames`;
                    await safeEdit(interaction, { content: text });
                };

                await safeEdit(interaction, {
                    content: "🎬 Generating video... **0/** frames"
                });

                const { buffer, frameCount, fps, durationSeconds } =
                    await generateGuildVideo(interaction.guild.id, prompt, {
                        onProgress,
                        onQueued
                    });

                const file = new AttachmentBuilder(buffer, {
                    name: "omni-video.mp4"
                });
                const remaining = getRemaining(interaction.guild.id);
                const content =
                    `🎬 **Video generated!** (${frameCount || "?"} frames · ${fps || 6} fps · ~${Math.round(durationSeconds || 3)}s)\n` +
                    `\`${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}\`\n` +
                    `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`;

                return safeEdit(interaction, { content, files: [file] });
            }

            await safeEdit(interaction, { content: "🖼️ Generating image…" });

            const { buffer, contentType } = await generateGuildImage(
                interaction.guild.id,
                prompt,
                { onQueued }
            );

            const ext = (contentType || "").includes("png")
                ? "png"
                : (contentType || "").includes("webp")
                  ? "webp"
                  : "jpg";
            const file = new AttachmentBuilder(buffer, {
                name: `omni-flux.${ext}`
            });

            const remaining = getRemaining(interaction.guild.id);
            const content =
                `🖼️ **Image** (Flux) · \`${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}\`\n` +
                `_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`;

            return safeEdit(interaction, { content, files: [file] });
        } catch (error) {
            console.error("[imagine] generation failed:", {
                code: error?.code,
                status: error?.status,
                message: error?.message,
                stack: error?.stack?.split("\n").slice(0, 4).join(" | ")
            });
            const msg =
                type === "video"
                    ? formatVideoUserError(error)
                    : formatImageUserError(error);
            await safeEdit(interaction, { content: msg });
        }
    }
};
