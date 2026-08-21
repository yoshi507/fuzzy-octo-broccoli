const API = '';
const INVITE = 'https://discord.com/oauth2/authorize?client_id=1538542627882799155';
const TOKEN_KEY = 'omnibot_session';
const GUILD_KEY = 'omnibot_guild';
const INTENT_KEY = 'omnibot_intent';

const state = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  guilds: [],
  guild: JSON.parse(localStorage.getItem(GUILD_KEY) || 'null'),
  section: 'overview',
  settings: null,
  persona: null,
  channels: [],
  roles: [],
  oauth: null,
  bot: null,
  stats: null,
  giveaways: null,
  reactionRoles: null,
  modSummary: null,
  settingsHistory: null,
  tickets: null,
  mode: localStorage.getItem(INTENT_KEY) === 'appeals' ? 'appeals' : 'dashboard',
  appealDirectory: [],
  appealDirectoryMeta: null,
  appealSearch: '',
  appealForm: null,
  appealGuild: null,
  appealSubmitting: false,
  oauthError: null
};

function toast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.classList.add('hidden'); }, 4200);
}

function isTyping() {
  var a = document.activeElement;
  if (!a) return false;
  var tag = (a.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || a.isContentEditable;
}

async function api(path, opts) {
  opts = opts || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
  if (res.status === 204) return null;
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    const err = new Error(data.message || data.error || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
function iconUrl(g) {
  if (!g || !g.icon) return '';
  if (String(g.icon).startsWith('http')) return g.icon;
  return 'https://cdn.discordapp.com/icons/' + g.id + '/' + g.icon + '.png?size=128';
}
function settingVal(id) {
  if (!state.settings) return null;
  return state.settings[id];
}

function redirectUri() {
  if (state.oauth && state.oauth.redirectUri) {
    return String(state.oauth.redirectUri).trim();
  }
  return String(window.location.origin || '').replace(/\/$/, '') + '/auth/discord/callback';
}

function hideToast() {
  try {
    var t = document.getElementById('toast');
    if (t) t.classList.add('hidden');
  } catch (e) {}
}

function clearAuthQueryFromUrl() {
  try {
    var clean = window.location.pathname || '/';
    if (window.location.hash) clean += window.location.hash;
    window.history.replaceState({}, '', clean);
  } catch (e) {}
}

async function loadOAuthConfig() {
  try { state.oauth = await api('/auth/config'); }
  catch (e) { state.oauth = null; }
}

function startLogin(intent) {
  intent = intent || 'dashboard';
  if (intent !== 'appeals' && intent !== 'advertise' && intent !== 'dashboard') intent = 'dashboard';
  try { localStorage.setItem(INTENT_KEY, intent); } catch (e) {}
  state.mode = intent;
  state.oauthError = null;
  hideToast();

  try {
    if (intent === 'appeals') location.hash = '#/appeals';
    else if (intent === 'advertise') location.hash = '#/advertise';
    else if (location.hash === '#/appeals' || location.hash === '#/advertise') location.hash = '';
  } catch (e) {}

  if (state.token) {
    if (typeof goToIntent === 'function') goToIntent(intent);
    else {
      state.mode = intent;
      if (typeof render === 'function') render();
    }
    return;
  }

  var clientId = (state.oauth && state.oauth.clientId) || '1538542627882799155';
  var redir = redirectUri();
  var url =
    'https://discord.com/api/oauth2/authorize' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redir) +
    '&scope=' + encodeURIComponent('identify guilds') +
    '&prompt=consent' +
    '&state=' + encodeURIComponent(intent);
  window.location.assign(url);
}
try { window.startLogin = startLogin; } catch (e) {}

async function handleOAuthCallback() {
  var params = new URLSearchParams(window.location.search);
  var loginToken = params.get('login_token');
  if (loginToken) {
    state.token = loginToken;
    try { localStorage.setItem(TOKEN_KEY, loginToken); } catch (e) {}
    state.oauthError = null;
    hideToast();
    var intentParam = params.get('intent');
    try {
      var h = (location.hash || '').toLowerCase();
      if (h === '#/appeals') intentParam = 'appeals';
      else if (h === '#/advertise') intentParam = 'advertise';
    } catch (e) {}
    if (intentParam === 'appeals' || intentParam === 'advertise' || intentParam === 'dashboard') {
      state.mode = intentParam;
      try { localStorage.setItem(INTENT_KEY, intentParam); } catch (e) {}
    }
    clearAuthQueryFromUrl();
    return;
  }

  var loginError = params.get('login_error');
  if (loginError) {
    clearAuthQueryFromUrl();
    if (state.token) { state.oauthError = null; return; }
    var existing = null;
    try { existing = localStorage.getItem(TOKEN_KEY); } catch (e) {}
    if (existing) { state.token = existing; state.oauthError = null; return; }
    if (/already used|invalid.?code|invalid_grant/i.test(loginError)) {
      state.oauthError = 'Login almost completed but was interrupted. Please try once more.';
    } else state.oauthError = loginError;
    return;
  }

  var err = params.get('error');
  if (err) {
    if (!state.token) state.oauthError = params.get('error_description') || err;
    clearAuthQueryFromUrl();
    return;
  }

  var code = params.get('code');
  if (!code) return;
  clearAuthQueryFromUrl();
  if (state.token) { state.oauthError = null; return; }
  try {
    var data = await api('/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ code: code, redirectUri: redirectUri() })
    });
    var tok = (data && (data.token || data.accessToken)) || null;
    if (tok) {
      state.token = tok;
      try { localStorage.setItem(TOKEN_KEY, tok); } catch (e) {}
      state.oauthError = null;
      hideToast();
    } else state.oauthError = 'Login succeeded but no session token was returned.';
  } catch (e) {
    state.oauthError = (e && e.message) || 'Login failed';
  }
}

async function goToIntent(intent) {
  try {
    var h = (location.hash || '').toLowerCase();
    if (h === '#/appeals') intent = 'appeals';
    else if (h === '#/advertise') intent = 'advertise';
  } catch (e) {}
  intent = intent || localStorage.getItem(INTENT_KEY) || 'dashboard';
  if (intent !== 'appeals' && intent !== 'advertise' && intent !== 'dashboard') intent = 'dashboard';
  state.mode = intent;
  try { localStorage.setItem(INTENT_KEY, intent); } catch (e) {}
  try {
    if (intent === 'appeals') location.hash = '#/appeals';
    else if (intent === 'advertise') location.hash = '#/advertise';
  } catch (e) {}
  try {
    if (intent === 'appeals') await loadAppealDirectory();
    else if (intent === 'advertise') {
      if (typeof loadAdvertiseDirectory === 'function') await loadAdvertiseDirectory();
    } else {
      await loadGuilds();
      if (state.guild) {
        var still = state.guilds.find(function (g) { return String(g.id) === String(state.guild.id); });
        if (!still) { state.guild = null; try { localStorage.removeItem(GUILD_KEY); } catch (e) {} }
        else { state.guild = still; await loadGuildData(); }
      } else if (state.guilds.length === 1) {
        state.guild = state.guilds[0];
        try { localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild)); } catch (e) {}
        await loadGuildData();
      }
    }
  } catch (e) { toast(e.message || 'Failed to load', 'err'); }
  if (typeof render === 'function') render();
}

async function loadMe() { state.user = await api('/auth/me'); }
async function loadGuilds() {
  const data = await api('/guilds');
  state.guilds = Array.isArray(data) ? data : (data.guilds || []);
}
async function loadAppealDirectory() {
  const data = await api('/appeals/directory');
  state.appealDirectory = (data && data.guilds) || [];
  state.appealDirectoryMeta = data || null;
}
async function loadAppealForm(guildId) {
  state.appealForm = await api('/appeals/guilds/' + guildId + '/form');
  state.appealGuild = (state.appealDirectory || []).find(function (g) {
    return String(g.id) === String(guildId);
  }) || { id: guildId };
}

function softUpdateOverviewStatus() {
  try {
    var bot = state.bot || {};
    var stats = state.stats || {};
    var statusPill = document.querySelector('[data-bot-status]');
    if (statusPill) {
      var online = state.bot == null ? 'Unknown' : (bot.online ? 'Online' : 'Offline');
      statusPill.textContent = online;
      statusPill.className = 'pill ' + (state.bot == null ? '' : (bot.online ? 'ok' : 'err'));
    }
    var setText = function (sel, val) {
      var el = document.querySelector(sel);
      if (el) el.textContent = val;
    };
    setText('[data-stat-members]', stats.members != null ? String(stats.members) : '—');
    setText('[data-stat-ai]', (stats.aiUsedToday != null ? stats.aiUsedToday : 0) + ' / 20');
    setText('[data-stat-latency]', bot.latencyMs != null ? bot.latencyMs + ' ms' : '—');
  } catch (e) {}
}

async function refreshGuildData(silent) {
  if (!state.guild) return;
  try {
    await loadGuildData();
    if (silent) {
      if (isTyping()) return;
      softUpdateOverviewStatus();
      return;
    }
    toast('Synced with server', 'ok');
    render();
  } catch (e) {
    if (!silent) toast(e.message || 'Sync failed', 'err');
  }
}

async function loadGuildData() {
  if (!state.guild) return;
  const id = state.guild.id;
  const results = await Promise.allSettled([
    api('/guilds/' + id + '/settings'),
    api('/guilds/' + id + '/persona'),
    api('/guilds/' + id + '/channels'),
    api('/guilds/' + id + '/roles'),
    api('/guilds/' + id + '/bot'),
    api('/guilds/' + id + '/stats'),
    api('/guilds/' + id + '/features/giveaways'),
    api('/guilds/' + id + '/features/reaction-roles'),
    api('/guilds/' + id + '/features/moderation-summary'),
    api('/guilds/' + id + '/features/settings-history'),
    api('/guilds/' + id + '/features/tickets')
  ]);
  state.settings = results[0].status === 'fulfilled' ? results[0].value : {};
  state.persona = results[1].status === 'fulfilled' ? results[1].value : {};
  var ch = results[2].status === 'fulfilled' ? results[2].value : [];
  state.channels = Array.isArray(ch) ? ch : (ch.channels || []);
  var r = results[3].status === 'fulfilled' ? results[3].value : [];
  state.roles = Array.isArray(r) ? r : (r.roles || []);
  state.bot = results[4].status === 'fulfilled' ? results[4].value : null;
  state.stats = results[5].status === 'fulfilled' ? results[5].value : null;
  state.giveaways = results[6].status === 'fulfilled' ? results[6].value : null;
  state.reactionRoles = results[7].status === 'fulfilled' ? results[7].value : null;
  state.modSummary = results[8].status === 'fulfilled' ? results[8].value : null;
  state.settingsHistory = results[9].status === 'fulfilled' ? results[9].value : null;
  state.tickets = results[10].status === 'fulfilled' ? results[10].value : null;
}

async function saveSettings(patch) {
  const id = state.guild.id;
  await api('/guilds/' + id + '/settings', { method: 'PUT', body: JSON.stringify({ patch: patch }) });
  state.settings = await api('/guilds/' + id + '/settings');
  toast('Settings saved', 'ok');
  var panel = document.getElementById('main-panel');
  if (panel && state.mode === 'dashboard' && typeof renderSection === 'function') {
    try {
      panel.innerHTML = renderSection();
      if (typeof bindPanelControls === 'function') bindPanelControls();
    } catch (e) { render(); }
  } else render();
}
async function savePersona(body) {
  const id = state.guild.id;
  state.persona = await api('/guilds/' + id + '/persona', { method: 'PUT', body: JSON.stringify(body) });
  toast('Personality saved', 'ok');
  if (typeof switchSection === 'function') switchSection(state.section || 'ai');
  else render();
}
async function resetPersona() {
  state.persona = await api('/guilds/' + state.guild.id + '/persona/reset', { method: 'POST', body: '{}' });
  toast('Personality reset', 'ok');
  if (typeof switchSection === 'function') switchSection(state.section || 'ai');
  else render();
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch (e) {}
  state.token = null; state.user = null; state.guild = null; state.guilds = [];
  state.appealForm = null; state.appealGuild = null; state.appealDirectory = [];
  state.mode = 'dashboard'; state.oauthError = null;
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(GUILD_KEY); localStorage.removeItem(INTENT_KEY);
  try { location.hash = ''; } catch (e) {}
  render();
}
function channelOptions(selected) {
  var html = '<option value="">None</option>';
  (state.channels || []).forEach(function (c) {
    var id = c.id || c; var name = c.name || id;
    html += '<option value="' + escapeAttr(id) + '"' + (String(selected) === String(id) ? ' selected' : '') + '>#' + escapeHtml(name) + '</option>';
  });
  return html;
}
function navBtn(id, label) {
  return '<button type="button" data-section="' + escapeAttr(id) + '" class="' + (state.section === id ? 'active' : '') +
    '" onclick="window.__omniSwitchSection && window.__omniSwitchSection(\'' + escapeAttr(id) + '\')">' +
    escapeHtml(label) + '</button>';
}
function renderOverview() {
  var enabled = 0;
  if (state.settings) {
    Object.keys(state.settings).forEach(function (k) {
      if (state.settings[k] === true) enabled++;
    });
  }
  var bot = state.bot || {}, stats = state.stats || {};
  var online = state.bot == null ? 'Unknown' : (bot.online ? 'Online' : 'Offline');
  var onlineCls = state.bot == null ? '' : (bot.online ? 'ok' : 'err');
  return '<div class="card"><h2>' + escapeHtml(state.guild.name) + '</h2><p class="help">Server overview and live bot status.</p><div class="grid2">' +
    '<div class="stat"><div class="status">Bot status</div><div class="pill ' + onlineCls + '" data-bot-status>' + online + '</div></div>' +
    '<div class="stat"><div class="status">Members</div><strong data-stat-members>' + escapeHtml(stats.members != null ? stats.members : '—') + '</strong></div>' +
    '<div class="stat"><div class="status">AI used today</div><strong data-stat-ai>' + escapeHtml((stats.aiUsedToday != null ? stats.aiUsedToday : 0) + ' / 20') + '</strong></div>' +
    '<div class="stat"><div class="status">Warnings</div><strong>' + escapeHtml(stats.warnings != null ? stats.warnings : 0) + '</strong></div>' +
    '<div class="stat"><div class="status">Active giveaways</div><strong>' + escapeHtml(stats.activeGiveaways != null ? stats.activeGiveaways : 0) + '</strong></div>' +
    '<div class="stat"><div class="status">Reaction-role panels</div><strong>' + escapeHtml(stats.reactionRolePanels != null ? stats.reactionRolePanels : 0) + '</strong></div>' +
    '<div class="stat"><div class="status">Enabled features</div><strong>' + enabled + '</strong></div>' +
    '<div class="stat"><div class="status">Latency</div><strong data-stat-latency>' + escapeHtml(bot.latencyMs != null ? bot.latencyMs + ' ms' : '—') + '</strong></div>' +
    '</div></div>';
}
