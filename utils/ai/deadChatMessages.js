const POOL = {
    funny: [
        "Is this channel a museum exhibit or can people still talk here?",
        "Hello? …echo… echo… okay I'll stop.",
        "Plot twist: the chat was never dead. It was just… buffering.",
        "Breaking news: local channel discovers the send button.",
        "I'd tell a joke about silence, but it would be too quiet.",
        "This chat has the energy of a loading screen.",
        "If silence was a sport, this channel would be Olympic.",
        "Summoning conversation with the power of awkwardness."
    ],
    chill: [
        "Hey — no pressure, just checking in. How's everyone doing?",
        "Quiet day? That's okay. Drop a vibe check when you're free.",
        "Soft reminder that humans are allowed to type here.",
        "Whenever you're ready, the chat is open.",
        "Hope you're all having a decent day. Anything good happen?",
        "Low-key hello to whoever's online."
    ],
    wake: [
        "WAKE UP CHAT",
        "Rise and shine, conversation people.",
        "This is your official chat revival notice.",
        "Knock knock. Chat's open.",
        "Paging all humans in this channel.",
        "The silence has been defeated. You're welcome."
    ],
    questions: [
        "Quick one: what's the last show or game you actually enjoyed?",
        "Coffee, tea, or pure chaos?",
        "If you could teleport somewhere for the weekend, where?",
        "What's a small win you had recently?",
        "Hot take thread: pineapple on pizza — yes or never?",
        "What's your current comfort song?",
        "PC, console, or mobile — what's home base?",
        "What's something you're looking forward to?"
    ],
    gaming: [
        "Gamers assemble — what are you playing lately?",
        "Any recommendations that aren't 200 hours long?",
        "Who's winning in the current meta of… life?",
        "Co-op or solo — what's the mood?",
        "Name a game that deserved better."
    ],
    community: [
        "What's one thing you like about this server?",
        "New members: intro time. Veterans: welcome them.",
        "Channel check-in — say hi if you're around.",
        "Topic of the hour: share something random about your day.",
        "Community question: best advice you've been given?"
    ],
    dramatic: [
        "In a world of silence… one bot dared to speak.",
        "The prophecy said the chat would awaken. Here we are.",
        "From the ashes of inactivity… a message appears.",
        "The void stared back. So I typed."
    ]
};

function allMessages() {
    return Object.values(POOL).flat();
}

function pickMessage(exclude = [], category = null) {
    let pool = category && POOL[category] ? [...POOL[category]] : allMessages();
    pool = pool.filter((m) => !exclude.includes(m));
    if (!pool.length) pool = allMessages();
    return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { POOL, allMessages, pickMessage };
