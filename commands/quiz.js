const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const BANK = require("../utils/quiz/questions.js");
const {
    getSettings,
    getCustomQuestions,
    addStats,
    getStats,
    leaderboard
} = require("../utils/quiz/store.js");

const sessions = new Map();
const userCooldown = new Map();

function pickQuestions(guildId, { category, difficulty, count }) {
    const custom = getCustomQuestions(guildId).map((q) => ({
        ...q,
        category: q.category || "custom",
        difficulty: q.difficulty || "medium"
    }));
    let pool = [...BANK, ...custom];
    if (category && category !== "all") pool = pool.filter((q) => q.category === category);
    if (difficulty && difficulty !== "any") pool = pool.filter((q) => q.difficulty === difficulty);
    if (!pool.length) pool = [...BANK];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(1, count));
}

function letters() {
    return ["A", "B", "C", "D"];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("quiz")
        .setDescription("Multiplayer quiz system")
        .addSubcommand((s) =>
            s.setName("start").setDescription("Start a quiz in this channel")
                .addIntegerOption((o) => o.setName("questions").setDescription("Number of questions").setMinValue(1).setMaxValue(20))
                .addStringOption((o) =>
                    o.setName("category").setDescription("Category").addChoices(
                        { name: "All", value: "all" },
                        { name: "General", value: "general" },
                        { name: "Science", value: "science" },
                        { name: "Gaming", value: "gaming" },
                        { name: "Geography", value: "geography" },
                        { name: "History", value: "history" },
                        { name: "Tech", value: "tech" },
                        { name: "Fun", value: "fun" },
                        { name: "Custom", value: "custom" }
                    )
                )
                .addStringOption((o) =>
                    o.setName("difficulty").setDescription("Difficulty").addChoices(
                        { name: "Any", value: "any" },
                        { name: "Easy", value: "easy" },
                        { name: "Medium", value: "medium" },
                        { name: "Hard", value: "hard" }
                    )
                )
        )
        .addSubcommand((s) => s.setName("stop").setDescription("Cancel the active quiz"))
        .addSubcommand((s) => s.setName("leaderboard").setDescription("Quiz leaderboard"))
        .addSubcommand((s) =>
            s.setName("stats").setDescription("Quiz stats").addUserOption((o) => o.setName("user").setDescription("User"))
        )
        .addSubcommand((s) => s.setName("categories").setDescription("List categories")),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: "❌ Quizzes only work in servers.", ephemeral: true });
        }
        const settings = getSettings(interaction.guild.id);
        const sub = interaction.options.getSubcommand();

        if (!settings.enabled && sub === "start") {
            return interaction.reply({ content: "❌ Quizzes are disabled.", ephemeral: true });
        }

        if (sub === "categories") {
            return interaction.reply({
                content: "**Categories:** general, science, gaming, geography, history, tech, fun, custom\n**Difficulties:** easy, medium, hard",
                ephemeral: true
            });
        }

        if (sub === "stats") {
            const user = interaction.options.getUser("user") || interaction.user;
            const st = getStats(interaction.guild.id, user.id);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`Quiz stats — ${user.username}`)
                        .setColor(settings.embedColor || 0x57f287)
                        .addFields(
                            { name: "Points", value: String(st.points), inline: true },
                            { name: "Correct", value: String(st.correct), inline: true },
                            { name: "Wrong", value: String(st.wrong), inline: true },
                            { name: "Quizzes", value: String(st.quizzes), inline: true },
                            { name: "Best streak", value: String(st.bestStreak), inline: true }
                        )
                ]
            });
        }

        if (sub === "leaderboard") {
            if (!settings.leaderboardEnabled) {
                return interaction.reply({ content: "❌ Leaderboards disabled.", ephemeral: true });
            }
            const rows = leaderboard(interaction.guild.id, 10);
            if (!rows.length) return interaction.reply({ content: "No quiz scores yet." });
            const lines = rows.map((r, i) => `**${i + 1}.** <@${r.userId}> — **${r.points}** pts`);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🏆 Quiz leaderboard")
                        .setColor(settings.embedColor || 0x57f287)
                        .setDescription(lines.join("\n"))
                ]
            });
        }

        if (sub === "stop") {
            const session = sessions.get(interaction.channel.id);
            if (!session) return interaction.reply({ content: "❌ No active quiz.", ephemeral: true });
            if (
                session.hostId !== interaction.user.id &&
                !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)
            ) {
                return interaction.reply({ content: "❌ Only the host or a moderator can stop.", ephemeral: true });
            }
            session.cancelled = true;
            if (session.collector) session.collector.stop("cancel");
            sessions.delete(interaction.channel.id);
            return interaction.reply({ content: "🛑 Quiz cancelled." });
        }

        if (sessions.has(interaction.channel.id)) {
            return interaction.reply({ content: "⏳ A quiz is already running. Use `/quiz stop`.", ephemeral: true });
        }
        if (settings.channelId && interaction.channel.id !== settings.channelId) {
            return interaction.reply({ content: `❌ Use <#${settings.channelId}>.`, ephemeral: true });
        }

        const cdKey = `${interaction.guild.id}:${interaction.user.id}`;
        const last = userCooldown.get(cdKey) || 0;
        if (Date.now() - last < (settings.cooldownSeconds || 30) * 1000) {
            return interaction.reply({ content: "⏳ Please wait before starting another quiz.", ephemeral: true });
        }
        userCooldown.set(cdKey, Date.now());

        const count = interaction.options.getInteger("questions") || settings.questionCount || 5;
        const category = interaction.options.getString("category") || "all";
        const difficulty = interaction.options.getString("difficulty") || "any";
        const questions = pickQuestions(interaction.guild.id, { category, difficulty, count });

        const session = {
            hostId: interaction.user.id,
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            questions,
            index: 0,
            scores: new Map(),
            streaks: new Map(),
            answered: new Set(),
            cancelled: false,
            collector: null
        };
        sessions.set(interaction.channel.id, session);
        await interaction.reply({
            content: `🎯 **Quiz starting!** ${questions.length} question(s). Answer with **A**, **B**, **C**, or **D**.`
        });
        await runQuestion(interaction, session, settings);
    }
};

async function runQuestion(interaction, session, settings) {
    if (session.cancelled || session.index >= session.questions.length) {
        return finishQuiz(interaction, session, settings);
    }
    const q = session.questions[session.index];
    const L = letters();
    session.answered = new Set();
    session.currentAnswer = q.answer;

    const embed = new EmbedBuilder()
        .setTitle(`Question ${session.index + 1}/${session.questions.length}`)
        .setColor(settings.embedColor || 0x57f287)
        .setDescription(`**${q.q}**\n\n` + q.choices.map((c, i) => `**${L[i]}.** ${c}`).join("\n"))
        .setFooter({ text: `${q.category || "general"} · ${q.difficulty || "medium"} · ${settings.timeLimitSeconds || 20}s` });

    await interaction.channel.send({ embeds: [embed] });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) =>
            !m.author.bot &&
            m.channel.id === session.channelId &&
            ["A", "B", "C", "D"].includes(m.content.trim().toUpperCase()),
        time: (settings.timeLimitSeconds || 20) * 1000
    });
    session.collector = collector;

    collector.on("collect", async (m) => {
        if (session.answered.has(m.author.id)) return;
        session.answered.add(m.author.id);
        const choice = m.content.trim().toUpperCase().charCodeAt(0) - 65;
        if (choice === session.currentAnswer) {
            const streak = (session.streaks.get(m.author.id) || 0) + 1;
            session.streaks.set(m.author.id, streak);
            const bonus = streak > 1 ? (settings.streakBonus || 2) * (streak - 1) : 0;
            const pts = (settings.pointsCorrect || 10) + bonus;
            session.scores.set(m.author.id, (session.scores.get(m.author.id) || 0) + pts);
            await m.react("✅").catch(() => {});
        } else {
            session.streaks.set(m.author.id, 0);
            await m.react("❌").catch(() => {});
        }
    });

    collector.on("end", async () => {
        if (session.cancelled) return;
        const correctLetter = letters()[session.currentAnswer];
        await interaction.channel
            .send(`Answer: **${correctLetter}. ${q.choices[session.currentAnswer]}**`)
            .catch(() => {});
        session.index++;
        setTimeout(() => runQuestion(interaction, session, settings), 1200);
    });
}

async function finishQuiz(interaction, session, settings) {
    sessions.delete(session.channelId);
    if (session.cancelled) return;
    for (const [userId, points] of session.scores.entries()) {
        addStats(session.guildId, userId, {
            points,
            correct: Math.ceil(points / Math.max(1, settings.pointsCorrect || 10)),
            wrong: 0,
            quizzes: 1,
            streak: session.streaks.get(userId) || 0
        });
        if (settings.rewardsEnabled) {
            try {
                const { addCoins } = require("../utils/economy.js");
                const coins = points * (settings.coinRewardPerPoint || 2);
                if (coins > 0) addCoins(session.guildId, userId, coins);
            } catch {}
        }
    }
    const sorted = [...session.scores.entries()].sort((a, b) => b[1] - a[1]);
    const desc = sorted.length
        ? sorted.slice(0, 10).map(([id, pts], i) => `**${i + 1}.** <@${id}> — **${pts}** pts`).join("\n")
        : "No one scored this time.";
    await interaction.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("🏁 Quiz complete!")
                .setColor(settings.embedColor || 0x57f287)
                .setDescription(desc)
        ]
    });
}
