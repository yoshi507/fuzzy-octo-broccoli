const SETTINGS = [
  { id: 'ai.enabled', type: 'boolean', default: true, path: 'dashboard.ai.enabled' },
  { id: 'ai.memoryEnabled', type: 'boolean', default: true, path: 'dashboard.ai.memoryEnabled' },
  { id: 'ai.memoryMaxMessages', type: 'number', default: 12, min: 2, max: 40, path: 'dashboard.ai.memoryMaxMessages' },
  { id: 'ai.naturalInvocation', type: 'boolean', default: true, path: 'dashboard.ai.naturalInvocation' },
  { id: 'ai.commandPrefix', type: 'string', default: '!', maxLength: 5, path: 'commandSettings.prefix' },
  { id: 'security.enabled', type: 'boolean', default: false, path: 'security.enabled' },
  { id: 'security.mode', type: 'select', default: 'monitor', options: ['monitor', 'alert', 'lockdown'], path: 'security.mode' },
  { id: 'security.autoTimeoutExecutor', type: 'boolean', default: false, path: 'security.antiNuke.autoTimeoutExecutor' },
  { id: 'security.autoTimeoutMinutes', type: 'number', default: 10, min: 1, max: 60, path: 'security.antiNuke.autoTimeoutMinutes' },
  { id: 'security.thresholdChannelDelete', type: 'number', default: 3, min: 1, max: 20, path: 'security.antiNuke.thresholds.channelDelete' },
  { id: 'security.thresholdRoleDelete', type: 'number', default: 3, min: 1, max: 20, path: 'security.antiNuke.thresholds.roleDelete' },
  { id: 'security.windowSeconds', type: 'number', default: 30, min: 5, max: 300, path: 'security.antiNuke.windowMs' },
  { id: 'moderation.automodEnabled', type: 'boolean', default: false, path: 'automod.enabled' },
  { id: 'moderation.blockedWords', type: 'string', default: '', maxLength: 2000, path: 'automod.blockedWords' },
  { id: 'moderation.modLogChannel', type: 'channel', default: null, path: 'settings.modLogChannel' },
  { id: 'moderation.antiSpamEnabled', type: 'boolean', default: true, path: 'spamConfig.enabled' },
  { id: 'leveling.enabled', type: 'boolean', default: true, path: 'levelSettings.enabled' },
  { id: 'leveling.xpMin', type: 'number', default: 15, min: 1, max: 100, path: 'levelSettings.xpMin' },
  { id: 'leveling.xpMax', type: 'number', default: 25, min: 1, max: 200, path: 'levelSettings.xpMax' },
  { id: 'leveling.cooldownSeconds', type: 'number', default: 60, min: 0, max: 600, path: 'levelSettings.cooldown' },
  { id: 'leveling.announceLevelUp', type: 'boolean', default: true, path: 'levelSettings.announce' },
  { id: 'welcome.enabled', type: 'boolean', default: false, path: 'welcomeSettings.enabled' },
  { id: 'welcome.channel', type: 'channel', default: null, path: 'welcomeSettings.channelId' },
  { id: 'welcome.message', type: 'string', default: 'Welcome {user} to {server}!', maxLength: 1500, path: 'welcomeSettings.message' },
  { id: 'goodbye.enabled', type: 'boolean', default: false, path: 'goodbyeSettings.enabled' },
  { id: 'goodbye.channel', type: 'channel', default: null, path: 'goodbyeSettings.channelId' },
  { id: 'goodbye.message', type: 'string', default: '{username} left {server}.', maxLength: 1500, path: 'goodbyeSettings.message' },
  { id: 'autorole.enabled', type: 'boolean', default: false, path: 'autorole.enabled' },
  { id: 'autorole.role', type: 'role', default: null, path: 'autorole.roleId' },
  { id: 'logging.enabled', type: 'boolean', default: false, path: 'logging.enabled' },
  { id: 'logging.channel', type: 'channel', default: null, path: 'logging.channelId' },
  { id: 'tickets.enabled', type: 'boolean', default: false, path: 'ticketSettings.enabled' },
  { id: 'tickets.panelChannel', type: 'channel', default: null, path: 'ticketSettings.panelChannelId' },
  { id: 'tickets.staffRoles', type: 'multiselect', default: [], path: 'ticketSettings.staffRoleIds' },
  { id: 'music.enabled', type: 'boolean', default: true, path: 'music.enabled' },
  { id: 'music.defaultVolume', type: 'number', default: 80, min: 0, max: 100, path: 'music.defaultVolume' },
  { id: 'deadchat.enabled', type: 'boolean', default: false, path: 'deadChat.enabled' },
  { id: 'deadchat.minutes', type: 'number', default: 30, min: 5, max: 1440, path: 'deadChat.minutes' },
  { id: 'deadchat.channel', type: 'channel', default: null, path: 'deadChat.channelId' },
  { id: 'translation.note', type: 'boolean', default: false, path: 'dashboard.translation.hint' },
  { id: 'server.suggestionsChannel', type: 'channel', default: null, path: 'settings.suggestionsChannel' },
  { id: 'server.announcementRole', type: 'role', default: null, path: 'settings.announcementRole' },
  { id: 'appeals.enabled', type: 'boolean', default: false, path: 'appeals.enabled' },
  { id: 'appeals.channel', type: 'channel', default: null, path: 'appeals.channelId' },
  { id: 'appeals.staffRoles', type: 'multiselect', default: [], path: 'appeals.staffRoleIds' },
  { id: 'appeals.cooldownHours', type: 'number', default: 72, min: 1, max: 720, path: 'appeals.cooldownHours' },
  { id: 'appeals.acceptMessage', type: 'string', default: 'Your appeal has been accepted.', maxLength: 1500, path: 'appeals.acceptMessage' },
  { id: 'appeals.rejectMessage', type: 'string', default: 'Your appeal has been rejected.', maxLength: 1500, path: 'appeals.rejectMessage' },
  { id: 'appeals.pendingMessage', type: 'string', default: 'Your appeal was submitted and is awaiting review.', maxLength: 1500, path: 'appeals.pendingMessage' },
  { id: 'appeals.logEnabled', type: 'boolean', default: true, path: 'appeals.logEnabled' },
  { id: 'quiz.enabled', type: 'boolean', default: true, path: 'quiz.enabled' },
  { id: 'quiz.channel', type: 'channel', default: null, path: 'quiz.channelId' },
  { id: 'quiz.questionCount', type: 'number', default: 5, min: 1, max: 20, path: 'quiz.questionCount' },
  { id: 'quiz.timeLimitSeconds', type: 'number', default: 20, min: 5, max: 120, path: 'quiz.timeLimitSeconds' },
  { id: 'quiz.pointsCorrect', type: 'number', default: 10, min: 1, max: 100, path: 'quiz.pointsCorrect' },
  { id: 'quiz.streakBonus', type: 'number', default: 2, min: 0, max: 50, path: 'quiz.streakBonus' },
  { id: 'quiz.cooldownSeconds', type: 'number', default: 30, min: 0, max: 600, path: 'quiz.cooldownSeconds' },
  { id: 'quiz.rewardsEnabled', type: 'boolean', default: true, path: 'quiz.rewardsEnabled' },
  { id: 'quiz.leaderboardEnabled', type: 'boolean', default: true, path: 'quiz.leaderboardEnabled' },
];

function getSettingById(id) {
  return SETTINGS.find((s) => s.id === id);
}

function getDefaults() {
  const out = {};
  for (const s of SETTINGS) out[s.id] = s.default;
  return out;
}

function validateSetting(def, value) {
  if (!def) return { ok: false, error: 'Unknown setting' };
  if (value === null || value === undefined) {
    if (def.type === 'channel' || def.type === 'role') return { ok: true, value: null };
    if (def.type === 'multiselect') return { ok: true, value: [] };
  }
  switch (def.type) {
    case 'boolean':
      if (typeof value !== 'boolean') return { ok: false, error: 'Must be boolean' };
      return { ok: true, value };
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: 'Must be a number' };
      if (def.min != null && n < def.min) return { ok: false, error: `Min ${def.min}` };
      if (def.max != null && n > def.max) return { ok: false, error: `Max ${def.max}` };
      return { ok: true, value: n };
    }
    case 'string': {
      if (typeof value !== 'string') return { ok: false, error: 'Must be a string' };
      if (def.maxLength && value.length > def.maxLength) return { ok: false, error: `Max length ${def.maxLength}` };
      return { ok: true, value };
    }
    case 'select':
      if (!def.options.includes(value)) return { ok: false, error: 'Invalid option' };
      return { ok: true, value };
    case 'channel':
    case 'role': {
      if (value === null || value === '') return { ok: true, value: null };
      if (typeof value !== 'string' || !/^\d{16,20}$/.test(value)) return { ok: false, error: 'Invalid Discord snowflake' };
      return { ok: true, value };
    }
    case 'multiselect': {
      if (!Array.isArray(value)) return { ok: false, error: 'Must be an array' };
      for (const id of value) {
        if (typeof id !== 'string' || !/^\d{16,20}$/.test(id)) return { ok: false, error: 'Invalid role id in list' };
      }
      return { ok: true, value: [...new Set(value)] };
    }
    default:
      return { ok: false, error: 'Unsupported type' };
  }
}

module.exports = { SETTINGS, getSettingById, getDefaults, validateSetting };
