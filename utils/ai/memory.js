const fs = require("fs");
const path = require("path");

const dataDirectory =
    path.join(__dirname, "../../data");

const memoryFile =
    path.join(dataDirectory, "ai-memory.json");

function ensureStorage() {

    if (!fs.existsSync(dataDirectory)) {
        fs.mkdirSync(dataDirectory, {
            recursive: true
        });
    }

    if (!fs.existsSync(memoryFile)) {
        fs.writeFileSync(
            memoryFile,
            "{}",
            "utf8"
        );
    }
}

function loadMemory() {

    ensureStorage();

    try {

        return JSON.parse(
            fs.readFileSync(
                memoryFile,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "AI memory load error:",
            error
        );

        return {};
    }
}

function saveMemory(memory) {

    ensureStorage();

    fs.writeFileSync(
        memoryFile,
        JSON.stringify(
            memory,
            null,
            2
        ),
        "utf8"
    );
}

function getKey(
    guildId,
    userId
) {
    return `${guildId}:${userId}`;
}

function getConversation(
    guildId,
    userId
) {

    const memory =
        loadMemory();

    const key =
        getKey(
            guildId,
            userId
        );

    if (!memory[key]) {
        memory[key] = [];
    }

    return memory[key];
}

function addMessage(
    guildId,
    userId,
    role,
    content
) {

    const memory =
        loadMemory();

    const key =
        getKey(
            guildId,
            userId
        );

    if (!memory[key]) {
        memory[key] = [];
    }

    memory[key].push({
        role,
        content,
        timestamp: Date.now()
    });

    // Keep only the latest 12 messages to limit AI context size
    if (memory[key].length > 12) {
        memory[key] =
            memory[key].slice(-12);
    }

    saveMemory(memory);
}

function clearConversation(
    guildId,
    userId
) {

    const memory =
        loadMemory();

    const key =
        getKey(
            guildId,
            userId
        );

    delete memory[key];

    saveMemory(memory);
}

module.exports = {
    getConversation,
    addMessage,
    clearConversation
};
