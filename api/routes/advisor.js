const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { assertCanManage } = require('./guilds');
const {
  analyzeGuild,
  executeActions,
  formatAiUserError,
  getRemaining,
  DAILY_LIMIT
} = require('../../utils/ai/serverAdvisor.js');
const { chatAdvisor } = require('../../utils/ai/advisorChat.js');

const router = express.Router({ mergeParams: true });

function getClient(req) {
  return (
    req.app.locals.discordClient ||
    global.__omnibotClient ||
    null
  );
}

async function resolveGuild(req) {
  const { botGuild } = await assertCanManage(req, req.params.guildId);
  const client = getClient(req);
  const guild =
    botGuild || client?.guilds?.cache?.get(String(req.params.guildId));
  if (!guild) {
    const err = new Error('Bot is not in this server or Discord is not ready.');
    err.status = 503;
    throw err;
  }
  try {
    if (guild.channels?.cache?.size < 3) await guild.channels.fetch();
  } catch (_) {}
  try {
    if (guild.roles?.cache?.size < 2) await guild.roles.fetch();
  } catch (_) {}
  return guild;
}

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    res.json({
      remaining: getRemaining(req.params.guildId),
      limit: DAILY_LIMIT
    });
  } catch (err) {
    next(err);
  }
});

router.post('/analyze', requireAuth, async (req, res, next) => {
  try {
    const guild = await resolveGuild(req);
    const result = await analyzeGuild(guild);
    res.json(result);
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') {
      return res.status(429).json({
        error: formatAiUserError(err) || 'AI limit reached',
        code: 'AI_DAILY_LIMIT',
        remaining: 0,
        limit: DAILY_LIMIT
      });
    }
    if (err.code === 'AI_NOT_CONFIGURED' || /groq|api key/i.test(err.message || '')) {
      err.status = err.status || 503;
    }
    next(err);
  }
});

router.post('/execute', requireAuth, async (req, res, next) => {
  try {
    const guild = await resolveGuild(req);
    const actions = req.body?.actions;
    if (!Array.isArray(actions) || !actions.length) {
      const err = new Error('Provide an actions array to execute.');
      err.status = 400;
      throw err;
    }
    const user = req.session?.user || { id: req.session?.userId };
    const results = await executeActions(guild, actions, user);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

/** Conversational apply / setup — message the advisor */
router.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const guild = await resolveGuild(req);
    const message = req.body?.message;
    const history = req.body?.history;
    const lastPlan = req.body?.lastPlan;
    const user = req.session?.user || { id: req.session?.userId };

    const result = await chatAdvisor(guild, message, {
      history,
      lastPlan,
      user
    });
    res.json(result);
  } catch (err) {
    if (err.code === 'AI_DAILY_LIMIT') {
      return res.status(429).json({
        error: formatAiUserError(err) || 'AI limit reached',
        code: 'AI_DAILY_LIMIT',
        remaining: 0,
        limit: DAILY_LIMIT
      });
    }
    if (err.code === 'AI_NOT_CONFIGURED' || /groq|api key/i.test(err.message || '')) {
      err.status = err.status || 503;
    }
    next(err);
  }
});

module.exports = router;
