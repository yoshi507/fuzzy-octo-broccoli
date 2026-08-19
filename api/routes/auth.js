const express = require('express');
const { exchangeCode, fetchUser } = require('../services/discordOAuth');
const { createSession, destroySession } = require('../services/sessions');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/callback', async (req, res, next) => {
  try {
    const { code, redirectUri } = req.body || {};
    const tokenData = await exchangeCode(code, redirectUri);
    const user = await fetchUser(tokenData.access_token);
    const session = createSession({
      user,
      discordAccessToken: tokenData.access_token
    });
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

router.post('/logout', requireAuth, (req, res) => {
  destroySession(req.sessionToken);
  res.status(204).send();
});

module.exports = router;
