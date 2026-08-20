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
    return ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' })[c];
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
    api('/guilds/' + id + '/roles')
  ]);
  if (results[0].status === 'fulfilled') state.settings = results[0].value;
  else state.settings = {};
  if (results[1].status === 'fulfilled') state.persona = results[1].value;
  else state.persona = {};
  if (results[2].status === 'fulfilled') {
    const ch = results[2].value;
    state.channels = Array.isArray(ch) ? ch : (ch.channels || []);
  } else state.channels = [];
  if (results[3].status === 'fulfilled') {
    const r = results[3].value;
    state.roles = Array.isArray(r) ? r : (r.roles || []);
  } else state.roles = [];
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
  return '<div class="card"><h2>' + escapeHtml(state.guild.name) + '</h2>' +
    '<p class="help">OmniBot dashboard for this server. Use the sidebar to configure features.</p>' +
    '<p class="status">Enabled flags: <strong>' + enabled + '</strong></p>' +
    '<p class="status">Logged in as ' + escapeHtml((state.user && (state.user.username || state.user.global_name)) || 'user') + '</p>' +
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

function renderSection() {
  switch (state.section) {
    case 'overview': return renderOverview();
    case 'persona': return renderPersona(state.persona);
    case 'ai': return renderToggleGroup('AI', [
      ['ai.enabled', 'AI enabled'],
      ['ai.memoryEnabled', 'Memory enabled'],
      ['ai.naturalInvocation', 'Natural invocation']
    ], [
      ['ai.dailyLimit', 'Daily AI limit', 'number'],
      ['ai.memoryMaxMessages', 'Memory messages', 'number'],
      ['ai.commandPrefix', 'Command prefix', 'text']
    ]);
    case 'moderation': return renderToggleGroup('Moderation', [
      ['moderation.automodEnabled', 'AutoMod'],
      ['moderation.antiSpamEnabled', 'Anti-spam'],
      ['security.enabled', 'Security / anti-nuke']
    ], [
      ['moderation.blockedWords', 'Blocked words (comma-separated)', 'textarea'],
      ['moderation.modLogChannel', 'Mod log channel', 'channel'],
      ['security.mode', 'Security mode', 'text'],
      ['security.windowSeconds', 'Anti-nuke window (seconds)', 'number']
    ]);
    case 'deadchat': return renderToggleGroup('Dead Chat Reviver', [
      ['deadchat.enabled', 'Enabled']
    ], [
      ['deadchat.channel', 'Target channel', 'channel'],
      ['deadchat.minutes', 'Idle minutes', 'number']
    ]);
    case 'welcome': return renderToggleGroup('Welcome / Goodbye', [
      ['welcome.enabled', 'Welcome enabled'],
      ['goodbye.enabled', 'Goodbye enabled'],
      ['autorole.enabled', 'Autorole enabled']
    ], [
      ['welcome.channel', 'Welcome channel', 'channel'],
      ['welcome.message', 'Welcome message', 'textarea'],
      ['goodbye.channel', 'Goodbye channel', 'channel'],
      ['goodbye.message', 'Goodbye message', 'textarea'],
      ['autorole.role', 'Autorole', 'role']
    ]);
    case 'leveling': return renderToggleGroup('Leveling', [
      ['leveling.enabled', 'Enabled'],
      ['leveling.announceLevelUp', 'Announce level-ups']
    ], [
      ['leveling.xpMin', 'XP min', 'number'],
      ['leveling.xpMax', 'XP max', 'number'],
      ['leveling.cooldownSeconds', 'Cooldown (seconds)', 'number']
    ]);
    case 'appeals': return renderToggleGroup('Appeals', [
      ['appeals.enabled', 'Enabled'],
      ['appeals.logEnabled', 'Log appeals']
    ], [
      ['appeals.channel', 'Appeals channel', 'channel'],
      ['appeals.cooldownHours', 'Cooldown (hours)', 'number'],
      ['appeals.acceptMessage', 'Accept message', 'textarea'],
      ['appeals.rejectMessage', 'Reject message', 'textarea']
    ]);
    case 'quiz': return renderToggleGroup('Quiz', [
      ['quiz.enabled', 'Enabled'],
      ['quiz.rewardsEnabled', 'Rewards'],
      ['quiz.leaderboardEnabled', 'Leaderboard']
    ], [
      ['quiz.channel', 'Default channel', 'channel'],
      ['quiz.questionCount', 'Questions', 'number'],
      ['quiz.timeLimitSeconds', 'Time limit (seconds)', 'number']
    ]);
    default:
      return '<div class="card"><h2>' + escapeHtml(state.section) + '</h2><p class="help">This section is not available yet.</p></div>';
  }
}

function renderDashboard() {
  return '<div class="layout">' +
    '<aside class="sidebar">' +
    '<div class="brand"><div class="logo"><img src="/logo.svg" alt="OmniBot"/></div><div>OmniBot</div></div>' +
    '<nav class="nav">' +
    navBtn('overview', 'Overview') +
    navBtn('persona', 'Personality') +
    navBtn('ai', 'AI') +
    navBtn('moderation', 'Moderation') +
    navBtn('deadchat', 'Dead Chat') +
    navBtn('welcome', 'Welcome') +
    navBtn('leveling', 'Leveling') +
    navBtn('appeals', 'Appeals') +
    navBtn('quiz', 'Quiz') +
    '</nav>' +
    '<button class="btn ghost" id="btnChangeServer">Change server</button>' +
    '<button class="btn ghost" id="btnLogout">Log out</button>' +
    '</aside>' +
    '<main class="main">' +
    '<div class="topbar"><h1 style="margin:0">' + escapeHtml(state.section === 'persona' ? 'Bot Personality' : state.section) + '</h1>' +
    '<span class="pill">' + escapeHtml(state.guild.name) + '</span></div>' +
    renderSection() +
    '</main></div>';
}

function bind() {
  var root = document.getElementById('app');
  if (!root) return;

  var loginBtn = root.querySelector('#btnLogin');
  if (loginBtn) loginBtn.addEventListener('click', startLogin);

  var logoutBtn = root.querySelector('#btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', function () { logout(); });

  root.querySelectorAll('.guild').forEach(function (el) {
    el.addEventListener('click', async function () {
      var id = el.getAttribute('data-id');
      var g = state.guilds.find(function (x) { return String(x.id) === String(id); });
      if (!g) return;
      state.guild = g;
      localStorage.setItem(GUILD_KEY, JSON.stringify(g));
      try {
        await loadGuildData();
        state.section = 'overview';
        render();
      } catch (e) {
        toast(e.message || 'Failed to load server', 'err');
      }
    });
  });

  var change = root.querySelector('#btnChangeServer');
  if (change) change.addEventListener('click', function () {
    state.guild = null;
    localStorage.removeItem(GUILD_KEY);
    render();
  });

  root.querySelectorAll('[data-section]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.section = btn.getAttribute('data-section');
      render();
    });
  });

  var saveSettingsBtn = root.querySelector('#btnSaveSettings');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async function () {
      try {
        var patch = {};
        root.querySelectorAll('[data-setting]').forEach(function (el) {
          var id = el.getAttribute('data-setting');
          if (el.type === 'checkbox') patch[id] = el.checked;
          else if (el.type === 'number') patch[id] = el.value === '' ? null : Number(el.value);
          else patch[id] = el.value === '' ? null : el.value;
        });
        await saveSettings(patch);
      } catch (e) {
        toast(e.message || 'Save failed', 'err');
      }
    });
  }

  var savePersonaBtn = root.querySelector('#btnSavePersona');
  if (savePersonaBtn) {
    savePersonaBtn.addEventListener('click', async function () {
      try {
        await savePersona({
          displayName: (document.getElementById('pDisplayName') || {}).value || '',
          nickname: (document.getElementById('pNickname') || {}).value || '',
          bio: (document.getElementById('pBio') || {}).value || '',
          personality: (document.getElementById('pPersonality') || {}).value || '',
          greetingStyle: (document.getElementById('pGreeting') || {}).value || '',
          tone: (document.getElementById('pTone') || {}).value || 'chill',
          emojiUsage: (document.getElementById('pEmoji') || {}).value || 'low',
          gifUsage: (document.getElementById('pGif') || {}).value || 'off'
        });
      } catch (e) {
        toast(e.message || 'Save failed', 'err');
      }
    });
  }

  var resetPersonaBtn = root.querySelector('#btnResetPersona');
  if (resetPersonaBtn) resetPersonaBtn.addEventListener('click', function () {
    resetPersona().catch(function (e) { toast(e.message, 'err'); });
  });

  var upA = root.querySelector('#btnUploadAvatar');
  if (upA) upA.addEventListener('click', async function () {
    try {
      var f = (document.getElementById('avatarFile') || {}).files;
      f = f && f[0];
      if (!f) return toast('Choose an image first', 'err');
      await uploadImage('avatar', f);
    } catch (e) { toast(e.message, 'err'); }
  });
  var upB = root.querySelector('#btnUploadBanner');
  if (upB) upB.addEventListener('click', async function () {
    try {
      var f = (document.getElementById('bannerFile') || {}).files;
      f = f && f[0];
      if (!f) return toast('Choose an image first', 'err');
      await uploadImage('banner', f);
    } catch (e) { toast(e.message, 'err'); }
  });
  var clA = root.querySelector('#btnClearAvatar');
  if (clA) clA.addEventListener('click', function () { clearImage('avatar').catch(function (e) { toast(e.message, 'err'); }); });
  var clB = root.querySelector('#btnClearBanner');
  if (clB) clB.addEventListener('click', function () { clearImage('banner').catch(function (e) { toast(e.message, 'err'); }); });
}

function render() {
  var root = document.getElementById('app');
  if (!root) return;
  if (!state.token) root.innerHTML = renderLogin();
  else if (!state.guild) root.innerHTML = renderServerSelect();
  else root.innerHTML = renderDashboard();
  bind();
}

async function boot() {
  try {
    await loadOAuthConfig();
    await handleOAuthCallback();
    if (state.token) {
      try {
        await loadMe();
        await loadGuilds();
        if (state.guild) {
          var still = state.guilds.find(function (g) { return String(g.id) === String(state.guild.id); });
          if (!still) {
            state.guild = null;
            localStorage.removeItem(GUILD_KEY);
          } else {
            state.guild = still;
            await loadGuildData();
          }
        } else if (state.guilds.length === 1) {
          state.guild = state.guilds[0];
          localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild));
          await loadGuildData();
        }
      } catch (e) {
        toast(e.message || 'Session error', 'err');
        if (e.status === 401) {
          state.token = null;
          localStorage.removeItem(TOKEN_KEY);
        }
      }
    }
  } catch (e) {
    console.error(e);
    var app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<div class="center"><div class="card login-card"><h2>Dashboard failed to load</h2><p class="help">' +
        escapeHtml(e.message || String(e)) +
        '</p><button class="btn" onclick="location.reload()">Retry</button></div></div>';
    }
    return;
  }
  render();
}

boot();
