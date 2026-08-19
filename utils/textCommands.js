/**
 * Prefix and natural-name command invocation for OmniBot.
 * Reuses registered slash commands and the shared AI limit system.
 */

const {
    PermissionFlagsBits,
    ApplicationCommandOptionType
} = require("discord.js");

const {
    PREFIX,
    BOT_INVOKE_NAMES,
    ALLOW_NATURAL_AI
} = require("../config/botConfig.js");

const {
    askAI,
    limitReachedMessage,
    isLimitError,
    formatAiUserError
} = require("./ai/groq.js");

const { canUseAI } = require("./ai/aiLimit.js");

const INVOKE_NAMES = BOT_INVOKE_NAMES.map(n => n.toLowerCase());

function parseInvocation(content) {
    if (!content || typeof content !== "string") {
        return null;
    }

    const trimmed = content.trim();
    if (!trimmed) {
        return null;
    }

    if (PREFIX && trimmed.startsWith(PREFIX)) {
        const rest = trimmed.slice(PREFIX.length).trim();
        if (!rest) {
            return { mode: "prefix", body: "", raw: trimmed };
        }
        return { mode: "prefix", body: rest, raw: trimmed };
    }

    const firstSpace = trimmed.search(/\s/);
    const firstWord =
        firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
    const remainder =
        firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

    const nameToken = firstWord.replace(/[:，,]+$/g, "").toLowerCase();

    if (INVOKE_NAMES.includes(nameToken)) {
        return { mode: "name", body: remainder, raw: trimmed };
    }

    return null;
}

function tokenize(body) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;
    while ((match = re.exec(body)) !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3]);
    }
    return tokens;
}

function getCommandJson(command) {
    try {
        return command.data.toJSON();
    } catch {
        return null;
    }
}

function findCommand(client, name) {
    if (!name || !client?.commands) {
        return null;
    }
    return client.commands.get(name.toLowerCase()) || null;
}

function getRequiredPermissions(command) {
    const json = getCommandJson(command);
    if (!json) {
        return null;
    }

    const raw = json.default_member_permissions;
    if (raw == null || raw === undefined) {
        return null;
    }

    try {
        return BigInt(raw);
    } catch {
        return null;
    }
}

function memberHasCommandPermission(member, command) {
    if (!member) {
        return false;
    }

    if (member.permissions?.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    const required = getRequiredPermissions(command);
    if (required == null) {
        return true;
    }

    if (required === 0n) {
        return false;
    }

    return member.permissions.has(required);
}

function buildOptionMap(message, commandJson, tokens) {
    const values = Object.create(null);
    let options = commandJson.options || [];
    let idx = 0;

    if (
        options.length &&
        options[0].type === ApplicationCommandOptionType.Subcommand
    ) {
        const subName = (tokens[0] || "").toLowerCase();
        const sub = options.find(o => o.name === subName);
        if (sub) {
            values._subcommand = sub.name;
            options = sub.options || [];
            idx = 1;
        } else {
            values._subcommand = null;
            options = [];
        }
    } else if (
        options.length &&
        options[0].type === ApplicationCommandOptionType.SubcommandGroup
    ) {
        const groupName = (tokens[0] || "").toLowerCase();
        const group = options.find(o => o.name === groupName);
        if (group) {
            values._subcommandGroup = group.name;
            const subName = (tokens[1] || "").toLowerCase();
            const sub = (group.options || []).find(o => o.name === subName);
            if (sub) {
                values._subcommand = sub.name;
                options = sub.options || [];
                idx = 2;
            }
        }
    }

    for (const opt of options) {
        if (idx >= tokens.length) {
            break;
        }

        const token = tokens[idx];

        switch (opt.type) {
            case ApplicationCommandOptionType.String: {
                const remainingOpts = options.slice(options.indexOf(opt) + 1);
                if (remainingOpts.length === 0) {
                    values[opt.name] = tokens.slice(idx).join(" ");
                    idx = tokens.length;
                } else {
                    values[opt.name] = token;
                    idx++;
                }
                break;
            }
            case ApplicationCommandOptionType.Integer:
            case ApplicationCommandOptionType.Number: {
                const n = Number(token);
                if (!Number.isNaN(n)) {
                    values[opt.name] = n;
                }
                idx++;
                break;
            }
            case ApplicationCommandOptionType.Boolean: {
                values[opt.name] = /^(1|true|yes|on)$/i.test(token);
                idx++;
                break;
            }
            case ApplicationCommandOptionType.User:
            case ApplicationCommandOptionType.Mentionable: {
                const idMatch =
                    token.match(/^<@!?(\d+)>$/) || token.match(/^(\d{16,20})$/);
                if (idMatch) {
                    values[opt.name] = idMatch[1];
                }
                idx++;
                break;
            }
            case ApplicationCommandOptionType.Role: {
                const idMatch =
                    token.match(/^<@&(\d+)>$/) || token.match(/^(\d{16,20})$/);
                if (idMatch) {
                    values[opt.name] = idMatch[1];
                }
                idx++;
                break;
            }
            case ApplicationCommandOptionType.Channel: {
                const idMatch =
                    token.match(/^<#(\d+)>$/) || token.match(/^(\d{16,20})$/);
                if (idMatch) {
                    values[opt.name] = idMatch[1];
                }
                idx++;
                break;
            }
            default:
                values[opt.name] = token;
                idx++;
        }
    }

    return values;
}

function createOptionsAPI(message, values) {
    return {
        getSubcommand(required = true) {
            if (values._subcommand) {
                return values._subcommand;
            }
            if (required) {
                throw new Error("No subcommand provided");
            }
            return null;
        },
        getSubcommandGroup(required = false) {
            if (values._subcommandGroup) {
                return values._subcommandGroup;
            }
            if (required) {
                throw new Error("No subcommand group provided");
            }
            return null;
        },
        getString(name) {
            const v = values[name];
            return v == null ? null : String(v);
        },
        getInteger(name) {
            const v = values[name];
            if (v == null || v === "") return null;
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : null;
        },
        getNumber(name) {
            const v = values[name];
            if (v == null || v === "") return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        },
        getBoolean(name) {
            if (values[name] == null) return null;
            return Boolean(values[name]);
        },
        getUser(name) {
            const id = values[name];
            if (!id) return null;
            const fromMention = message.mentions?.users?.get(id);
            if (fromMention) return fromMention;
            return message.client.users.cache.get(id) || null;
        },
        getMember(name) {
            const id = values[name];
            if (!id) return null;
            return message.guild.members.cache.get(id) || null;
        },
        getRole(name) {
            const id = values[name];
            if (!id) return null;
            return message.guild.roles.cache.get(id) || null;
        },
        getChannel(name) {
            const id = values[name];
            if (!id) return null;
            return message.guild.channels.cache.get(id) || null;
        }
    };
}

function createTextContext(message, commandName, values) {
    let deferred = false;
    let replied = false;
    let replyMessage = null;

    const context = {
        commandName,
        guild: message.guild,
        guildId: message.guild?.id,
        user: message.author,
        member: message.member,
        channel: message.channel,
        channelId: message.channel.id,
        client: message.client,
        createdTimestamp: message.createdTimestamp,
        id: message.id,
        options: createOptionsAPI(message, values),

        get deferred() {
            return deferred;
        },
        get replied() {
            return replied;
        },

        async deferReply() {
            deferred = true;
            try {
                await message.channel.sendTyping();
            } catch {
                /* ignore */
            }
            return null;
        },

        async reply(payload) {
            const data =
                typeof payload === "string" ? { content: payload } : { ...payload };
            delete data.ephemeral;
            delete data.fetchReply;

            replied = true;
            replyMessage = await message.reply(data);
            return replyMessage;
        },

        async editReply(payload) {
            const data =
                typeof payload === "string" ? { content: payload } : { ...payload };
            delete data.ephemeral;

            if (replyMessage && replyMessage.editable) {
                return replyMessage.edit(data);
            }

            replied = true;
            replyMessage = await message.reply(data);
            return replyMessage;
        },

        async followUp(payload) {
            const data =
                typeof payload === "string" ? { content: payload } : { ...payload };
            delete data.ephemeral;
            return message.channel.send(data);
        },

        async deleteReply() {
            if (replyMessage) {
                await replyMessage.delete().catch(() => {});
            }
        }
    };

    return context;
}

async function handleNaturalAI(message, prompt) {
    if (!ALLOW_NATURAL_AI) {
        await message.reply(
            "❓ I didn't recognise that command. Try `/help` or `" +
                PREFIX +
                "help`."
        );
        return;
    }

    const text = String(prompt || "").trim();
    if (!text) {
        await message.reply(
            "👋 Hi! Try `" +
                PREFIX +
                "help` or ask me something like `omni what can you do?`."
        );
        return;
    }

    if (!canUseAI(message.guild.id)) {
        await message.reply(limitReachedMessage(message.guild.id));
        return;
    }

    try {
        await message.channel.sendTyping();

        const answer = await askAI(
            [
                {
                    role: "system",
                    content:
                        "You are Omni, a friendly Discord bot. Answer helpfully and concisely. " +
                        "If the user is asking how to use a bot command, explain slash commands and that they can also use `" +
                        PREFIX +
                        "command` or `omni command`."
                },
                {
                    role: "user",
                    content: text
                }
            ],
            {
                guildId: message.guild.id,
                temperature: 0.7,
                maxTokens: 800
            }
        );

        const body =
            answer.length > 1900 ? answer.slice(0, 1900) + "…" : answer;
        await message.reply(body);
    } catch (error) {
        if (isLimitError(error)) {
            await message.reply(limitReachedMessage(message.guild.id));
            return;
        }
        console.error(
            "Natural AI error:",
            error?.code || error?.message || error
        );
        await message.reply(formatAiUserError(error));
    }
}

async function handleTextInvocation(message) {
    if (!message.guild || message.author.bot) {
        return false;
    }

    const content = message.content;
    if (!content) {
        return false;
    }

    const invocation = parseInvocation(content);
    if (!invocation) {
        return false;
    }

    const body = invocation.body.trim();

    if (!body) {
        await message.reply(
            "👋 I'm here! Use `" +
                PREFIX +
                "help` or `omni help`, or ask me a question like `omni how do warnings work?`."
        );
        return true;
    }

    const tokens = tokenize(body);
    const commandName = (tokens[0] || "").toLowerCase();
    const command = findCommand(message.client, commandName);

    if (!command) {
        await handleNaturalAI(message, body);
        return true;
    }

    if (!memberHasCommandPermission(message.member, command)) {
        await message.reply(
            "❌ You don't have permission to use that command."
        );
        return true;
    }

    const commandJson = getCommandJson(command);
    const argTokens = tokens.slice(1);
    const values = buildOptionMap(message, commandJson || { options: [] }, argTokens);
    const context = createTextContext(message, command.data.name, values);

    try {
        await command.execute(context);
    } catch (error) {
        console.error(
            "Text command error:",
            commandName,
            error?.code || error?.message || error
        );

        if (isLimitError(error)) {
            try {
                if (context.deferred || context.replied) {
                    await context.editReply(limitReachedMessage(message.guild.id));
                } else {
                    await message.reply(limitReachedMessage(message.guild.id));
                }
            } catch {
                /* ignore */
            }
            return true;
        }

        try {
            const msg =
                "❌ I couldn't run that command. Check your usage with `" +
                PREFIX +
                "help` or `/help`.";
            if (context.deferred || context.replied) {
                await context.editReply(msg);
            } else {
                await message.reply(msg);
            }
        } catch {
            /* ignore */
        }
    }

    return true;
}

module.exports = {
    PREFIX,
    BOT_INVOKE_NAMES,
    parseInvocation,
    handleTextInvocation,
    tokenize,
    findCommand,
    memberHasCommandPermission
};
