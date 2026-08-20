const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { assertCanManage } = require('./guilds');
const {
  getPersona,
  setPersona,
  resetPersona,
  saveGuildImage,
  clearGuildImage,
  resolveImageAbsolute,
  toPublicPersona
} = require('../../utils/persona/store');

const router = express.Router({ mergeParams: true });

function sendImage(res, relPath) {
  const abs = resolveImageAbsolute(relPath);
  if (!abs) {
    return res.status(404).json({ error: true, code: 'NOT_FOUND', message: 'Image not found' });
  }
  const ext = path.extname(abs).toLowerCase();
  const type =
    ext === '.png' ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    ext === '.gif' ? 'image/gif' :
    'image/jpeg';
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(abs).pipe(res);
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    res.json(toPublicPersona(req.params.guildId));
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const body = req.body || {};
    const updated = setPersona(req.params.guildId, {
      displayName: body.displayName,
      nickname: body.nickname,
      bio: body.bio,
      personality: body.personality,
      tone: body.tone,
      emojiUsage: body.emojiUsage,
      gifUsage: body.gifUsage,
      greetingStyle: body.greetingStyle
    });
    res.json(toPublicPersona(req.params.guildId, updated));
  } catch (err) {
    next(err);
  }
});

router.post('/reset', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const updated = resetPersona(req.params.guildId);
    res.json(toPublicPersona(req.params.guildId, updated));
  } catch (err) {
    next(err);
  }
});

router.put('/avatar', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const dataUrl = req.body?.dataUrl || req.body?.image;
    if (!dataUrl) {
      const err = new Error('dataUrl is required');
      err.status = 400;
      err.code = 'VALIDATION';
      throw err;
    }
    const updated = saveGuildImage(req.params.guildId, 'avatar', dataUrl);
    res.json(toPublicPersona(req.params.guildId, updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/avatar', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const updated = clearGuildImage(req.params.guildId, 'avatar');
    res.json(toPublicPersona(req.params.guildId, updated));
  } catch (err) {
    next(err);
  }
});

router.put('/banner', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const dataUrl = req.body?.dataUrl || req.body?.image;
    if (!dataUrl) {
      const err = new Error('dataUrl is required');
      err.status = 400;
      err.code = 'VALIDATION';
      throw err;
    }
    const updated = saveGuildImage(req.params.guildId, 'banner', dataUrl);
    res.json(toPublicPersona(req.params.guildId, updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/banner', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const updated = clearGuildImage(req.params.guildId, 'banner');
    res.json(toPublicPersona(req.params.guildId, updated));
  } catch (err) {
    next(err);
  }
});

router.get('/avatar', async (req, res, next) => {
  try {
    const persona = getPersona(req.params.guildId);
    if (!persona.avatarPath) {
      return res.status(404).json({ error: true, code: 'NOT_FOUND', message: 'No avatar' });
    }
    return sendImage(res, persona.avatarPath);
  } catch (err) {
    next(err);
  }
});

router.get('/banner', async (req, res, next) => {
  try {
    const persona = getPersona(req.params.guildId);
    if (!persona.bannerPath) {
      return res.status(404).json({ error: true, code: 'NOT_FOUND', message: 'No banner' });
    }
    return sendImage(res, persona.bannerPath);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
