const API = '';
const INVITE = 'https://discord.com/oauth2/authorize?client_id=1538542627882799155';
const TOKEN_KEY = 'omnibot_session';
const GUILD_KEY = 'omnibot_guild';

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
  loading: false
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
    err.code = data.code;
    err.errors = data.errors;
    if (res.status === 401) {
      state.token = null;
      localStorage.removeItem(TOKEN_KEY);
    }
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
function escapeAttr(s) { return escapeHtml(s); }
function opt(v, cur) {
  return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + v + '</option>';
}
function navBtn(id, label) {
  return '<button data-section="' + id + '" class="' + (state.section === id ? 'active' : '') + '">' + label + '</button>';
}
function iconUrl(g) {
  if (!g || !g.icon) return '';
  return 'https://cdn.discordapp.com/icons/' + g.id + '/' + g.icon + '.png?size=128';
}
function settingVal(id) {
  return state.settings && state.settings[id] !== undefined ? state.settings[id] : '';
}
function redirectUri() {
  return window.location.origin + window.location.pathname.replace(/\/?$/, '/');
}

async function loadOAuthConfig() {
  try { state.oauth = await api('/auth/config'); }
  catch (e) { state.oauth = null; }
}

function startLogin() {
  const clientId = (state.oauth && state.oauth.clientId) || '1538542627882799155';
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', 'identify guilds');
  window.location.href = url.toString();
}

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;
  try {
    const session = await api('/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ code: code, redirectUri: redirectUri() })
    });
    state.token = session.accessToken || session.token || session.sessionToken || null;
    if (!state.token) throw new Error('Login succeeded but no session token was returned');
    localStorage.setItem(TOKEN_KEY, state.token);
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  } catch (e) {
    toast(e.message || 'Login failed', 'err');
    window.history.replaceState({}, '', window.location.pathname);
    return false;
  }
}

async function loadMe() {
  state.user = await api('/auth/me');
}
async function loadGuilds() {
  const data = await api('/guilds');
  state.guilds = Array.isArray(data) ? data : (data.guilds || []);
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
  await api('/guilds/' + id + '/settings', {
    method: 'PUT',
    body: JSON.stringify({ patch: patch })
  });
  state.settings = await api('/guilds/' + id + '/settings');
  toast('Settings saved', 'ok');
  render();
}

async function savePersona(body) {
  const id = state.guild.id;
  state.persona = await api('/guilds/' + id + '/persona', {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  toast('Personality saved', 'ok');
  render();
}

async function resetPersona() {
  const id = state.guild.id;
  state.persona = await api('/guilds/' + id + '/persona/reset', { method: 'POST', body: '{}' });
  toast('Personality reset', 'ok');
  render();
}

function fileToDataUrl(file, maxMB) {
  return new Promise(function (resolve, reject) {
    if (!file || !String(file.type).startsWith('image/')) return reject(new Error('Please choose an image file'));
    if (file.size > maxMB * 1024 * 1024) return reject(new Error('Image too large (max ' + maxMB + 'MB)'));
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error('Failed to read file')); };
    reader.readAsDataURL(file);
  });
}

async function uploadImage(kind, file) {
  const max = kind === 'banner' ? 4 : 2;
  const dataUrl = await fileToDataUrl(file, max);
  const id = state.guild.id;
  state.persona = await api('/guilds/' + id + '/persona/' + kind, {
    method: 'PUT',
    body: JSON.stringify({ dataUrl: dataUrl })
  });
  toast((kind === 'banner' ? 'Banner' : 'Avatar') + ' updated', 'ok');
  render();
}

async function clearImage(kind) {
  const id = state.guild.id;
  state.persona = await api('/guilds/' + id + '/persona/' + kind, { method: 'DELETE' });
  toast((kind === 'banner' ? 'Banner' : 'Avatar') + ' removed', 'ok');
  render();
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch (e) {}
  state.token = null;
  state.user = null;
  state.guild = null;
  state.guilds = [];
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(GUILD_KEY);
  render();
}

function channelOptions(selected) {
  var html = '<option value="">None</option>';
  (state.channels || []).forEach(function (c) {
    var id = c.id || c;
    var name = c.name || id;
    html += '<option value="' + escapeAttr(id) + '"' + (String(selected) === String(id) ? ' selected' : '') + '>#' + escapeHtml(name) + '</option>';
  });
  return html;
}

function roleOptions(selected) {
  var html = '<option value="">None</option>';
  (state.roles || []).forEach(function (r) {
    var id = r.id || r;
    var name = r.name || id;
    html += '<option value="' + escapeAttr(id) + '"' + (String(selected) === String(id) ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
  });
  return html;
}

function renderLogin() {
  return '' +
    '<div class="center">' +
    '<div class="card login-card">' +
    '<div style="text-align:center;margin-bottom:1rem">' +
    '<div class="login-logo"><img src="/logo.svg" alt="OmniBot"/></div>' +
    '<div style="font-size:1.25rem;font-weight:700">OmniBot Dashboard</div>' +
    '</div>' +
    '<p class="help">Manage OmniBot for your Discord servers. Sign in with Discord to continue.</p>' +
    '<button class="btn" id="btnLogin" style="width:100%;margin-bottom:.75rem">Login with Discord</button>' +
    '<a class="btn ghost" style="display:block" href="' + INVITE + '" target="_blank" rel="noopener">Add to Discord</a>' +
    '<p class="status" style="margin-top:1rem">API: same-origin · <a href="/health" target="_blank">/health</a></p>' +
    '</div></div>';
}

function renderServerSelect() {
  if (!state.guilds.length) {
    return '<div class="center"><div class="card login-card">' +
      '<h2>No manageable servers</h2>' +
      '<p class="help">You need Manage Server permission on a server where OmniBot is present.</p>' +
      '<button class="btn" id="btnLogout">Log out</button></div></div>';
  }
  var cards = state.guilds.map(function (g) {
    return '<div class="guild" data-id="' + escapeAttr(g.id) + '">' +
      (g.icon ? '<img src="' + iconUrl(g) + '" alt=""/>' : '<div class="avatar-prev"></div>') +
      '<div><div style="font-weight:600">' + escapeHtml(g.name) + '</div>' +
      '<div class="status">' + (g.owner ? 'Owner' : 'Manager') + '</div></div></div>';
  }).join('');
  return '<div class="center"><div style="width:min(720px,100%)">' +
    '<div class="card"><h2>Select a server</h2><p class="help">Choose which Discord server to manage.</p>' +
    '<div class="guild-grid">' + cards + '</div>' +
    '<div class="row" style="margin-top:1rem"><button class="btn ghost" id="btnLogout">Log out</button></div>' +
    '</div></div></div>';
}

function renderToggleGroup(title, toggles, fields) {
  var html = '<div class="card"><h2>' + escapeHtml(title) + '</h2>';
  (toggles || []).forEach(function (t) {
    var id = t[0], label = t[1];
    var on = !!settingVal(id);
    html += '<div class="switch"><span>' + escapeHtml(label) + '</span>' +
      '<input type="checkbox" data-setting="' + escapeAttr(id) + '"' + (on ? ' checked' : '') + '/></div>';
  });
  (fields || []).forEach(function (f) {
    var id = f[0], label = f[1], type = f[2] || 'text';
    var val = settingVal(id);
    html += '<div class="field"><label>' + escapeHtml(label) + '</label>';
    if (type === 'channel') {
      html += '<select data-setting="' + escapeAttr(id) + '">' + channelOptions(val) + '</select>';
    } else if (type === 'role') {
      html += '<select data-setting="' + escapeAttr(id) + '">' + roleOptions(val) + '</select>';
    } else if (type === 'number') {
      html += '<input type="number" data-setting="' + escapeAttr(id) + '" value="' + escapeAttr(val) + '"/>';
    } else if (type === 'textarea') {
      html += '<textarea data-setting="' + escapeAttr(id) + '">' + escapeHtml(val) + '</textarea>';
    } else {
      html += '<input type="text" data-setting="' + escapeAttr(id) + '" value="' + escapeAttr(val) + '"/>';
    }
    html += '</div>';
  });
  html += '<div class="row"><button class="btn" id="btnSaveSettings">Save settings</button></div></div>';
  return html;
}

function renderOverview() {
  var enabled = 0;
  if (state.settings) {
    Object.keys(state.settings).forEach(function (k) {
      if (state.settings[k] === true) enabled++;
    });
  }
  var bot = state.bot || {};
  var stats = state.stats || {};
  var online = bot.online ? 'Online' : 'Offline';
  var onlineCls = bot.online ? 'ok' : 'err';
  return '<div class="card"><h2>' + escapeHtml(state.guild.name) + '</h2>' +
    '<p class="help">Server overview and live bot status.</p>' +
    '<div class="grid2">' +
    '<div class="stat"><div class="status">Bot status</div><div class="pill ' + onlineCls + '">' + online + '</div></div>' +
    '<div class="stat"><div class="status">Members</div><strong>' + escapeHtml(stats.members != null ? stats.members : '—') + '</strong></div>' +
    '<div class="stat"><div class="status">AI used today</div><strong>' + escapeHtml((stats.aiUsedToday != null ? stats.aiUsedToday : 0) + ' / ' + (stats.aiLimit != null ? stats.aiLimit : 20)) + '</strong></div>' +
    '<div class="stat"><div class="status">Warnings</div><strong>' + escapeHtml(stats.warnings != null ? stats.warnings : 0) + '</strong></div>' +
    '<div class="stat"><div class="status">Active giveaways</div><strong>' + escapeHtml(stats.activeGiveaways != null ? stats.activeGiveaways : 0) + '</strong></div>' +
    '<div class="stat"><div class="status">Reaction-role panels</div><strong>' + escapeHtml(stats.reactionRolePanels != null ? stats.reactionRolePanels : 0) + '</strong></div>' +
    '<div class="stat"><div class="status">Enabled features</div><strong>' + enabled + '</strong></div>' +
    '<div class="stat"><div class="status">Latency</div><strong>' + escapeHtml(bot.latencyMs != null ? bot.latencyMs + ' ms' : '—') + '</strong></div>' +
    '</div>' +
    '<p class="status" style="margin-top:1rem">Logged in as ' + escapeHtml((state.user && (state.user.username || state.user.global_name)) || 'user') + '</p>' +
    '</div>';
}

function avatarSafe(url) { return String(url).replace(/"/g, ''); }

function renderPersona(p) {
  p = p || {};
  var avatarSrc = p.avatarUrl ? (API + p.avatarUrl) : '';
  var bannerSrc = p.bannerUrl ? (API + p.bannerUrl) : '';
  return '<div class="card"><h2>Bot Personality</h2>' +
    '<p class="help">Per-server AI personality and nickname. Avatar/banner are stored for this guild (Discord cannot set different bot avatars per server).</p>' +
    (bannerSrc ? '<img class="banner-prev" src="' + avatarSafe(bannerSrc) + '" alt="Banner"/>' : '<div class="banner-prev"></div>') +
    '<div class="row" style="margin:1rem 0">' +
    (avatarSrc ? '<img class="avatar-prev" src="' + avatarSafe(avatarSrc) + '" alt="Avatar"/>' : '<div class="avatar-prev"></div>') +
    '<div class="field" style="flex:1"><label>Avatar</label><input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp,image/gif"/>' +
    '<div class="row"><button class="btn sm" id="btnUploadAvatar">Upload</button><button class="btn ghost sm" id="btnClearAvatar">Remove</button></div></div></div>' +
    '<div class="field"><label>Banner</label><input type="file" id="bannerFile" accept="image/png,image/jpeg,image/webp,image/gif"/>' +
    '<div class="row" style="margin-top:.5rem"><button class="btn sm" id="btnUploadBanner">Upload</button><button class="btn ghost sm" id="btnClearBanner">Remove</button></div></div>' +
    '<div class="grid2">' +
    '<div class="field"><label>Display name</label><input type="text" id="pDisplayName" maxlength="32" value="' + escapeAttr(p.displayName || '') + '"/></div>' +
    '<div class="field"><label>Server nickname</label><input type="text" id="pNickname" maxlength="32" value="' + escapeAttr(p.nickname || '') + '"/></div>' +
    '</div>' +
    '<div class="field"><label>Bio</label><textarea id="pBio" maxlength="500">' + escapeHtml(p.bio || '') + '</textarea></div>' +
    '<div class="field"><label>Personality instructions</label><textarea id="pPersonality" maxlength="2000" style="min-height:160px">' + escapeHtml(p.personality || '') + '</textarea></div>' +
    '<div class="field"><label>Greeting style</label><input type="text" id="pGreeting" maxlength="300" value="' + escapeAttr(p.greetingStyle || '') + '"/></div>' +
    '<div class="grid2">' +
    '<div class="field"><label>Tone</label><select id="pTone">' + opt('chill', p.tone) + opt('friendly', p.tone) + opt('professional', p.tone) + opt('funny', p.tone) + '</select></div>' +
    '<div class="field"><label>Emoji usage</label><select id="pEmoji">' + opt('off', p.emojiUsage) + opt('low', p.emojiUsage) + opt('medium', p.emojiUsage) + opt('high', p.emojiUsage) + '</select></div>' +
    '</div>' +
    '<div class="field"><label>GIF usage</label><select id="pGif">' + opt('off', p.gifUsage) + opt('occasional', p.gifUsage) + opt('frequent', p.gifUsage) + '</select></div>' +
    '<div class="row"><button class="btn" id="btnSavePersona">Save personality</button><button class="btn ghost" id="btnResetPersona">Reset</button></div></div>';
}
