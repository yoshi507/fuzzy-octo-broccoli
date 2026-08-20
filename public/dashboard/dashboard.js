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
  appealSubmitting: false
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
  try { state.oauth = await api('/auth/config'); } catch (e) { state.oauth = null; }
}
function startLogin(intent) {
  if (intent === 'appeals' || intent === 'dashboard') {
    localStorage.setItem(INTENT_KEY, intent);
    state.mode = intent;
  }
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
    state.token = session.accessToken || session.token || null;
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
async function loadMe() { state.user = await api('/auth/me'); }
async function loadGuilds() {
  const data = await api('/guilds');
  state.guilds = Array.isArray(data) ? data : (data.guilds || []);
}
async function refreshGuildData(silent) {
  if (!state.guild) return;
  try {
    await loadGuildData();
    if (!silent) toast('Synced with server', 'ok');
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
  render();
}
async function savePersona(body) {
  const id = state.guild.id;
  state.persona = await api('/guilds/' + id + '/persona', { method: 'PUT', body: JSON.stringify(body) });
  toast('Personality saved', 'ok');
  render();
}
async function resetPersona() {
  state.persona = await api('/guilds/' + state.guild.id + '/persona/reset', { method: 'POST', body: '{}' });
  toast('Personality reset', 'ok');
  render();
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch (e) {}
  state.token = null; state.user = null; state.guild = null; state.guilds = [];
  state.appealForm = null; state.appealGuild = null; state.appealDirectory = [];
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(GUILD_KEY);
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
function roleOptions(selected) {
  var html = '<option value="">None</option>';
  (state.roles || []).forEach(function (r) {
    var id = r.id || r; var name = r.name || id;
    html += '<option value="' + escapeAttr(id) + '"' + (String(selected) === String(id) ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
  });
  return html;
}
function appealIconUrl(g) {
  if (!g || !g.icon) return '';
  return 'https://cdn.discordapp.com/icons/' + g.id + '/' + g.icon + '.png?size=128';
}
async function loadAppealDirectory() {
  const data = await api('/appeals/directory');
  state.appealDirectory = Array.isArray(data.guilds) ? data.guilds : (Array.isArray(data) ? data : []);
  state.appealDirectoryMeta = data;
}
async function loadAppealForm(guildId) {
  state.appealForm = await api('/appeals/guilds/' + guildId + '/form');
  state.appealGuild = state.appealDirectory.find(function (g) { return String(g.id) === String(guildId); }) || {
    id: guildId,
    name: state.appealForm.guildName,
    icon: state.appealForm.guildIcon
  };
}
function renderAppealSelect() {
  var q = (state.appealSearch || '').trim().toLowerCase();
  var list = (state.appealDirectory || []).filter(function (g) {
    if (!q) return true;
    return String(g.name || '').toLowerCase().indexOf(q) !== -1 || String(g.id).indexOf(q) !== -1;
  });
  var meta = state.appealDirectoryMeta || {};
  var refreshed = meta.refreshedAt ? new Date(meta.refreshedAt).toLocaleString() : '—';
  var cards = list.map(function (g) {
    var icon = appealIconUrl(g);
    return '<div class="guild" data-appeal-id="' + escapeAttr(g.id) + '">' +
      (icon ? '<img src="' + escapeAttr(icon) + '" alt=""/>' : '<div class="avatar-prev"></div>') +
      '<div><div style="font-weight:600">' + escapeHtml(g.name) + '</div>' +
      '<div class="status">' + escapeHtml(g.category || 'ban') + ' appeals</div></div></div>';
  }).join('') || '<p class="help">No servers match your search, or no servers currently accept appeals.</p>';
  return '<div class="center"><div style="width:min(720px,100%)"><div class="card">' +
    '<h2>Appeal a punishment</h2>' +
    '<p class="help">Search for a server that has OmniBot appeals enabled. The list refreshes about once an hour.</p>' +
    '<div class="field"><label>Search servers</label><input type="search" id="appealSearch" placeholder="Server name…" value="' + escapeAttr(state.appealSearch || '') + '"/></div>' +
    '<div class="guild-grid" id="appealGrid">' + cards + '</div>' +
    '<p class="status" style="margin-top:1rem">Last directory refresh: ' + escapeHtml(refreshed) + ' · ' + list.length + ' shown</p>' +
    '<div class="row" style="margin-top:1rem"><button class="btn ghost" id="btnBackHome">Back</button><button class="btn ghost" id="btnLogout">Log out</button></div>' +
    '</div></div></div>';
}
function renderAppealFormView() {
  var form = state.appealForm || {};
  var g = state.appealGuild || {};
  var icon = appealIconUrl(g);
  if (form.openAppealId) {
    return '<div class="center"><div class="card login-card"><h2>Open appeal already exists</h2><p class="help">You already have open appeal <code>' + escapeHtml(form.openAppealId) + '</code> on <strong>' + escapeHtml(form.guildName || g.name || 'this server') + '</strong>.</p><div class="row"><button class="btn" id="btnBackAppealList">Back to servers</button><button class="btn ghost" id="btnLogout">Log out</button></div></div></div>';
  }
  var fields = (form.questions || []).map(function (q) {
    return '<div class="field"><label>' + escapeHtml(q.label) + (q.required ? ' *' : '') + '</label>' +
      '<textarea data-appeal-q="' + escapeAttr(q.id) + '" ' + (q.required ? 'required' : '') + ' maxlength="1000" placeholder="Your answer…"></textarea></div>';
  }).join('') || '<p class="help">This server has no appeal questions configured.</p>';
  return '<div class="center"><div style="width:min(640px,100%)"><div class="card">' +
    '<div class="row" style="margin-bottom:1rem">' +
    (icon ? '<img class="avatar-prev" src="' + escapeAttr(icon) + '" alt=""/>' : '<div class="avatar-prev"></div>') +
    '<div><h2 style="margin:0">Appeal — ' + escapeHtml(form.guildName || g.name || 'Server') + '</h2>' +
    '<p class="status">Type: ' + escapeHtml(form.category || 'ban') + '</p></div></div>' +
    '<p class="help">Answer the questions below. Your appeal will be sent to this server\'s staff appeals channel.</p>' +
    fields +
    '<div class="row"><button class="btn" id="btnSubmitAppeal"' + (state.appealSubmitting ? ' disabled' : '') + '>Submit appeal</button>' +
    '<button class="btn ghost" id="btnBackAppealList">Back</button></div>' +
    '</div></div></div>';
}
function renderLogin() {
  return '<div class="center"><div class="card login-card"><div style="text-align:center;margin-bottom:1rem"><div class="login-logo"><img src="/logo.svg" alt="OmniBot"/></div><div style="font-size:1.25rem;font-weight:700">OmniBot</div></div><p class="help">Manage your server, add OmniBot, or appeal a punishment. You will sign in with Discord when needed.</p><button class="btn" id="btnOpenDashboard" style="width:100%;margin-bottom:.75rem">Open Dashboard</button><a class="btn ghost" style="display:block;margin-bottom:.75rem" href="' + INVITE + '" target="_blank" rel="noopener">Add to Discord</a><button class="btn ghost" id="btnAppealPunishment" style="width:100%">Appeal a punishment</button><p class="status" style="margin-top:1rem">API: same-origin · <a href="/health" target="_blank">/health</a></p></div></div>';
}
function renderServerSelect() {
  if (!state.guilds.length) return '<div class="center"><div class="card login-card"><h2>No manageable servers</h2><p class="help">You need Manage Server permission on a server where OmniBot is present.</p><button class="btn" id="btnLogout">Log out</button></div></div>';
  var cards = state.guilds.map(function (g) {
    return '<div class="guild" data-id="' + escapeAttr(g.id) + '">' + (g.icon ? '<img src="' + iconUrl(g) + '" alt=""/>' : '<div class="avatar-prev"></div>') + '<div><div style="font-weight:600">' + escapeHtml(g.name) + '</div><div class="status">' + (g.owner ? 'Owner' : 'Manager') + '</div></div></div>';
  }).join('');
  return '<div class="center"><div style="width:min(720px,100%)"><div class="card"><h2>Select a server</h2><p class="help">Choose which Discord server to manage.</p><div class="guild-grid">' + cards + '</div><div class="row" style="margin-top:1rem"><button class="btn ghost" id="btnLogout">Log out</button></div></div></div></div>';
}
function renderToggleGroup(title, toggles, fields) {
  var html = '<div class="card"><h2>' + escapeHtml(title) + '</h2>';
  (toggles || []).forEach(function (t) {
    html += '<div class="switch"><span>' + escapeHtml(t[1]) + '</span><input type="checkbox" data-setting="' + escapeAttr(t[0]) + '"' + (settingVal(t[0]) ? ' checked' : '') + '/></div>';
  });
  (fields || []).forEach(function (f) {
    var id = f[0], label = f[1], type = f[2] || 'text', val = settingVal(id);
    html += '<div class="field"><label>' + escapeHtml(label) + '</label>';
    if (type === 'channel') html += '<select data-setting="' + escapeAttr(id) + '">' + channelOptions(val) + '</select>';
    else if (type === 'role') html += '<select data-setting="' + escapeAttr(id) + '">' + roleOptions(val) + '</select>';
    else if (type === 'number') html += '<input type="number" data-setting="' + escapeAttr(id) + '" value="' + escapeAttr(val) + '"/>';
    else if (type === 'textarea') html += '<textarea data-setting="' + escapeAttr(id) + '">' + escapeHtml(val) + '</textarea>';
    else html += '<input type="text" data-setting="' + escapeAttr(id) + '" value="' + escapeAttr(val) + '"/>';
    html += '</div>';
  });
  html += '<div class="row"><button class="btn" id="btnSaveSettings">Save settings</button></div></div>';
  return html;
}
function renderOverview() {
  var enabled = 0;
  if (state.settings) Object.keys(state.settings).forEach(function (k) { if (state.settings[k] === true) enabled++; });
  var bot = state.bot || {}, stats = state.stats || {};
  var online = bot.online ? 'Online' : 'Offline';
  var onlineCls = bot.online ? 'ok' : 'err';
  return '<div class="card"><h2>' + escapeHtml(state.guild.name) + '</h2><p class="help">Server overview and live bot status. Use Refresh after changing settings in Discord.</p><div class="grid2"><div class="stat"><div class="status">Bot status</div><div class="pill ' + onlineCls + '">' + online + '</div></div><div class="stat"><div class="status">Members</div><strong>' + escapeHtml(stats.members != null ? stats.members : '—') + '</strong></div><div class="stat"><div class="status">AI used today</div><strong>' + escapeHtml((stats.aiUsedToday != null ? stats.aiUsedToday : 0) + ' / 20') + '</strong></div><div class="stat"><div class="status">Warnings</div><strong>' + escapeHtml(stats.warnings != null ? stats.warnings : 0) + '</strong></div><div class="stat"><div class="status">Active giveaways</div><strong>' + escapeHtml(stats.activeGiveaways != null ? stats.activeGiveaways : 0) + '</strong></div><div class="stat"><div class="status">Reaction-role panels</div><strong>' + escapeHtml(stats.reactionRolePanels != null ? stats.reactionRolePanels : 0) + '</strong></div><div class="stat"><div class="status">Enabled features</div><strong>' + enabled + '</strong></div><div class="stat"><div class="status">Latency</div><strong>' + escapeHtml(bot.latencyMs != null ? bot.latencyMs + ' ms' : '—') + '</strong></div></div></div>';
}
function renderPersona(p) {
  p = p || {};
  return '<div class="card"><h2>Bot Personality</h2><p class="help">Per-server AI personality and server nickname. These affect how OmniBot responds in this Discord server.</p>' +
    '<div class="field"><label>Server nickname</label><input type="text" id="pNickname" maxlength="32" value="' + escapeAttr(p.nickname || '') + '" placeholder="e.g. Omni"/></div>' +
    '<div class="field"><label>Personality instructions</label><textarea id="pPersonality" maxlength="2000" style="min-height:140px" placeholder="Describe how OmniBot should behave in this server…">' + escapeHtml(p.personality || '') + '</textarea></div>' +
    '<div class="field"><label>Greeting style</label><input type="text" id="pGreeting" maxlength="300" value="' + escapeAttr(p.greetingStyle || '') + '"/></div>' +
    '<div class="grid2"><div class="field"><label>Tone</label><select id="pTone">' + opt('chill', p.tone) + opt('friendly', p.tone) + opt('professional', p.tone) + opt('funny', p.tone) + '</select></div><div class="field"><label>Emoji usage</label><select id="pEmoji">' + opt('off', p.emojiUsage) + opt('low', p.emojiUsage) + opt('medium', p.emojiUsage) + opt('high', p.emojiUsage) + '</select></div></div>' +
    '<div class="field"><label>GIF usage</label><select id="pGif">' + opt('off', p.gifUsage) + opt('occasional', p.gifUsage) + opt('frequent', p.gifUsage) + '</select></div>' +
    '<div class="row"><button class="btn" id="btnSavePersona">Save personality</button><button class="btn ghost" id="btnResetPersona">Reset</button></div></div>';
}
function renderGiveaways() {
  var data = state.giveaways || { settings: {}, active: [] };
  var rows = (data.active || []).map(function (g) {
    return '<tr><td>' + escapeHtml(g.prize || g.id) + '</td><td>' + escapeHtml(g.entries) + '</td><td>' + escapeHtml(g.endsAt ? new Date(g.endsAt).toLocaleString() : '—') + '</td><td>' + escapeHtml(g.status || 'active') + '</td></tr>';
  }).join('') || '<tr><td colspan="4">No active giveaways. Use <code>/giveaway</code> in Discord.</td></tr>';
  return '<div class="card"><h2>Giveaways</h2><p class="help">Live data from the bot database.</p><div class="switch"><span>Giveaways enabled</span><input type="checkbox" id="gwEnabled"' + ((data.settings && data.settings.enabled !== false) ? ' checked' : '') + '/></div><div class="row"><button class="btn sm" id="btnSaveGw">Save giveaway settings</button></div><table class="table"><thead><tr><th>Prize</th><th>Entries</th><th>Ends</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function renderReactionRoles() {
  var data = state.reactionRoles || { configs: [] };
  var rows = (data.configs || []).map(function (c) {
    return '<tr><td>' + escapeHtml(c.id || '—') + '</td><td>' + escapeHtml(c.emoji || '—') + '</td><td>' + escapeHtml(c.roleId || '—') + '</td><td><button class="btn ghost sm" data-rr-del="' + escapeAttr(c.id) + '">Delete</button></td></tr>';
  }).join('') || '<tr><td colspan="4">No panels. Use <code>/reactionrole</code> in Discord.</td></tr>';
  return '<div class="card"><h2>Reaction Roles</h2><table class="table"><thead><tr><th>ID</th><th>Emoji</th><th>Role</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function renderSection() {
  switch (state.section) {
    case 'overview': return renderOverview();
    case 'ai': return renderToggleGroup('AI settings', [['ai.enabled','AI enabled'],['ai.memoryEnabled','Memory enabled'],['ai.naturalInvocation','Natural invocation']], [['ai.memoryMaxMessages','Memory messages','number'],['ai.commandPrefix','Command prefix','text']]) + renderPersona(state.persona);
    case 'chat': return renderToggleGroup('Dead Chat Reviver', [['deadchat.enabled','Enabled']], [['deadchat.channel','Target channel','channel'],['deadchat.minutes','Idle minutes','number']]) + renderToggleGroup('Welcome / Goodbye / Autorole', [['welcome.enabled','Welcome enabled'],['goodbye.enabled','Goodbye enabled'],['autorole.enabled','Autorole enabled']], [['welcome.channel','Welcome channel','channel'],['welcome.message','Welcome message','textarea'],['goodbye.channel','Goodbye channel','channel'],['goodbye.message','Goodbye message','textarea'],['autorole.role','Autorole','role']]) + renderToggleGroup('Anti-spam', [['moderation.antiSpamEnabled','Anti-spam enabled']], []);
    case 'fun': return renderGiveaways() + renderReactionRoles() + renderToggleGroup('Quiz', [['quiz.enabled','Enabled'],['quiz.rewardsEnabled','Rewards'],['quiz.leaderboardEnabled','Leaderboard']], [['quiz.channel','Default channel','channel'],['quiz.questionCount','Questions','number'],['quiz.timeLimitSeconds','Time limit (seconds)','number']]);
    case 'moderation': return renderToggleGroup('Moderation', [['moderation.automodEnabled','AutoMod'],['moderation.antiSpamEnabled','Anti-spam'],['security.enabled','Security / anti-nuke']], [['moderation.blockedWords','Blocked words (comma-separated)','textarea'],['moderation.modLogChannel','Mod log channel','channel'],['security.mode','Security mode','text'],['security.windowSeconds','Anti-nuke window (seconds)','number'],['security.thresholdChannelDelete','Channel delete threshold','number'],['security.thresholdRoleDelete','Role delete threshold','number']]);
    case 'support': return renderToggleGroup('Appeals', [['appeals.enabled','Appeals enabled'],['appeals.logEnabled','Log appeals']], [['appeals.channel','Appeals channel','channel'],['appeals.cooldownHours','Cooldown (hours)','number'],['appeals.acceptMessage','Accept message','textarea'],['appeals.rejectMessage','Reject message','textarea']]) + '<div class="card"><h2>Tickets</h2><p class="help">Create panels with <code>/ticketsetup</code>.</p><p class="status">Enabled: <strong>' + ((state.tickets && state.tickets.settings && state.tickets.settings.enabled) ? 'Yes' : 'No') + '</strong></p>' + renderToggleGroup('Ticket settings', [['tickets.enabled','Tickets enabled']], [['tickets.panelChannel','Panel channel','channel']]) + '</div>';
    case 'server': return renderToggleGroup('Server configuration', [['leveling.enabled','Leveling'],['leveling.announceLevelUp','Announce level-ups'],['music.enabled','Music'],['logging.enabled','Logging']], [['ai.commandPrefix','Command prefix','text'],['leveling.xpMin','XP min','number'],['leveling.xpMax','XP max','number'],['leveling.cooldownSeconds','Leveling cooldown (seconds)','number'],['music.defaultVolume','Default music volume','number'],['logging.channel','Log channel','channel'],['server.suggestionsChannel','Suggestions channel','channel'],['server.announcementRole','Announcement role','role']]);
    case 'analytics': {
      var stats = state.stats || {}, mod = state.modSummary || {};
      return '<div class="card"><h2>Analytics</h2><p class="help">Real metrics only.</p><div class="grid2"><div class="stat"><div class="status">Members</div><strong>' + escapeHtml(stats.members != null ? stats.members : '—') + '</strong></div><div class="stat"><div class="status">AI today</div><strong>' + escapeHtml((stats.aiUsedToday || 0) + ' / 20') + '</strong></div><div class="stat"><div class="status">Warnings</div><strong>' + escapeHtml(mod.warningCount != null ? mod.warningCount : (stats.warnings || 0)) + '</strong></div><div class="stat"><div class="status">Giveaways</div><strong>' + escapeHtml(stats.activeGiveaways || 0) + '</strong></div><div class="stat"><div class="status">Reaction roles</div><strong>' + escapeHtml(stats.reactionRolePanels || 0) + '</strong></div><div class="stat"><div class="status">Commands today</div><strong><span class="status">Not tracked</span></strong></div></div></div>';
    }
    case 'logs': {
      var hist = (state.settingsHistory && state.settingsHistory.history) || [];
      var rows = hist.map(function (h) { return '<tr><td>' + escapeHtml(h.at || '') + '</td><td>' + escapeHtml(h.user || '') + '</td><td>' + escapeHtml((h.keys || []).join(', ')) + '</td></tr>'; }).join('') || '<tr><td colspan="3">No configuration changes yet.</td></tr>';
      return renderToggleGroup('Log channels', [['logging.enabled','Logging enabled']], [['logging.channel','Log channel','channel'],['moderation.modLogChannel','Mod log channel','channel']]) + '<div class="card"><h2>Configuration change log</h2><table class="table"><thead><tr><th>When</th><th>User</th><th>Keys</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    case 'security': return renderToggleGroup('Security & anti-nuke', [['security.enabled','Security enabled'],['security.autoTimeoutExecutor','Auto-timeout executor']], [['security.mode','Mode (monitor / alert / lockdown)','text'],['security.windowSeconds','Detection window (seconds)','number'],['security.thresholdChannelDelete','Channel delete threshold','number'],['security.thresholdRoleDelete','Role delete threshold','number'],['security.autoTimeoutMinutes','Timeout duration (minutes)','number']]) + '<div class="card"><h2>Dashboard security</h2><p class="help">Sessions and guild permissions are verified server-side. Secrets are never sent to the browser.</p></div>';
    case 'advanced': {
      var bot = state.bot || {};
      return '<div class="card"><h2>Advanced</h2><p class="status">Bot online: <strong>' + (bot.online ? 'Yes' : 'No') + '</strong></p><p class="status">Uptime: <strong>' + (bot.uptimeSeconds != null ? Math.floor(bot.uptimeSeconds / 60) + ' min' : '—') + '</strong></p><p class="status">Version: <strong>' + escapeHtml(bot.version || '—') + '</strong></p><p class="status">Guild ID: <code>' + escapeHtml(state.guild.id) + '</code></p><p class="status"><a href="/health" target="_blank">/health</a></p></div>';
    }
    case 'account': {
      var u = state.user || {};
      var list = (state.guilds || []).map(function (g) { return '<li>' + escapeHtml(g.name) + ' <span class="status">(' + escapeHtml(g.id) + ')</span></li>'; }).join('');
      return '<div class="card"><h2>Account</h2><p class="status">Discord user: <strong>' + escapeHtml(u.global_name || u.username || '—') + '</strong></p><p class="status">User ID: <code>' + escapeHtml(u.id || '—') + '</code></p><h3 style="margin-top:1rem">Accessible servers</h3><ul>' + list + '</ul><div class="row"><button class="btn ghost" id="btnLogout">Log out</button></div></div>';
    }
    default: return '<div class="card"><h2>' + escapeHtml(state.section) + '</h2></div>';
  }
}
function renderDashboard() {
  return '<div class="layout"><aside class="sidebar"><div class="brand"><div class="logo"><img src="/logo.svg" alt="OmniBot"/></div><div>OmniBot</div></div><nav class="nav"><div class="nav-label">General</div>' +
    navBtn('overview','Overview') + navBtn('ai','AI & Personality') + navBtn('chat','Chat & Engagement') + navBtn('fun','Fun') + navBtn('moderation','Moderation') + navBtn('support','Support') + navBtn('server','Server Config') + navBtn('analytics','Analytics') + navBtn('logs','Logs') + navBtn('security','Security') + navBtn('advanced','Advanced') + navBtn('account','Account') +
    '</nav><button class="btn ghost" id="btnChangeServer">Change server</button><button class="btn ghost" id="btnLogout">Log out</button></aside><main class="main"><div class="topbar"><h1 style="margin:0">' + escapeHtml(state.section) + '</h1><div class="row"><button class="btn ghost sm" id="btnRefresh">Refresh</button><span class="pill">' + escapeHtml(state.guild.name) + '</span></div></div>' + renderSection() + '</main></div>';
}
function bind() {
  var root = document.getElementById('app'); if (!root) return;
  root.querySelector('#btnOpenDashboard')?.addEventListener('click', function () { startLogin('dashboard'); });
  root.querySelector('#btnLogin')?.addEventListener('click', function () { startLogin('dashboard'); });
  root.querySelector('#btnAppealPunishment')?.addEventListener('click', function () { startLogin('appeals'); });
  root.querySelector('#btnBackHome')?.addEventListener('click', function () {
    state.mode = 'dashboard';
    localStorage.setItem(INTENT_KEY, 'dashboard');
    state.appealForm = null;
    state.appealGuild = null;
    render();
  });
  root.querySelector('#btnBackAppealList')?.addEventListener('click', function () {
    state.appealForm = null;
    state.appealGuild = null;
    render();
  });
  var search = root.querySelector('#appealSearch');
  if (search) {
    search.addEventListener('input', function () {
      state.appealSearch = search.value || '';
      render();
      var el = document.getElementById('appealSearch');
      if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
    });
  }
  root.querySelectorAll('[data-appeal-id]').forEach(function (el) {
    el.addEventListener('click', async function () {
      try {
        await loadAppealForm(el.getAttribute('data-appeal-id'));
        render();
      } catch (e) { toast(e.message || 'Failed to load appeal form', 'err'); }
    });
  });
  root.querySelector('#btnSubmitAppeal')?.addEventListener('click', async function () {
    if (!state.appealForm || state.appealSubmitting) return;
    try {
      state.appealSubmitting = true;
      var answers = {};
      document.querySelectorAll('[data-appeal-q]').forEach(function (ta) {
        answers[ta.getAttribute('data-appeal-q')] = ta.value || '';
      });
      var result = await api('/appeals/guilds/' + state.appealForm.guildId + '/submit', {
        method: 'POST',
        body: JSON.stringify({ answers: answers, type: state.appealForm.category || 'ban' })
      });
      toast((result && result.message) || ('Appeal ' + (result && result.id ? result.id : '') + ' submitted'), 'ok');
      state.appealForm = null;
      state.appealGuild = null;
      state.appealSubmitting = false;
      render();
    } catch (e) {
      state.appealSubmitting = false;
      toast(e.message || 'Submit failed', 'err');
      render();
    }
  });
  root.querySelectorAll('#btnLogout').forEach(function (b) { b.addEventListener('click', function () { logout(); }); });
  root.querySelectorAll('.guild').forEach(function (el) {
    if (el.getAttribute('data-appeal-id')) return;
    el.addEventListener('click', async function () {
      var g = state.guilds.find(function (x) { return String(x.id) === String(el.getAttribute('data-id')); });
      if (!g) return;
      state.guild = g; localStorage.setItem(GUILD_KEY, JSON.stringify(g));
      try { await loadGuildData(); state.section = 'overview'; render(); } catch (e) { toast(e.message || 'Failed to load server', 'err'); }
    });
  });
  root.querySelector('#btnChangeServer')?.addEventListener('click', function () { state.guild = null; localStorage.removeItem(GUILD_KEY); render(); });
  root.querySelectorAll('[data-section]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      state.section = btn.getAttribute('data-section');
      try { await loadGuildData(); } catch (e) {}
      render();
    });
  });
  root.querySelector('#btnRefresh')?.addEventListener('click', function () { refreshGuildData(false); });
  root.querySelectorAll('#btnSaveSettings').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      try {
        var patch = {}, card = btn.closest('.card') || root;
        card.querySelectorAll('[data-setting]').forEach(function (el) {
          var id = el.getAttribute('data-setting');
          if (el.type === 'checkbox') patch[id] = el.checked;
          else if (el.type === 'number') patch[id] = el.value === '' ? null : Number(el.value);
          else patch[id] = el.value === '' ? null : el.value;
        });
        await saveSettings(patch);
      } catch (e) { toast(e.message || 'Save failed', 'err'); }
    });
  });
  root.querySelector('#btnSavePersona')?.addEventListener('click', async function () {
    try {
      await savePersona({
        nickname: document.getElementById('pNickname')?.value || '',
        personality: document.getElementById('pPersonality')?.value || '',
        greetingStyle: document.getElementById('pGreeting')?.value || '',
        tone: document.getElementById('pTone')?.value || 'chill',
        emojiUsage: document.getElementById('pEmoji')?.value || 'low',
        gifUsage: document.getElementById('pGif')?.value || 'off'
      });
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
  });
  root.querySelector('#btnResetPersona')?.addEventListener('click', function () { resetPersona().catch(function (e) { toast(e.message, 'err'); }); });
  root.querySelector('#btnSaveGw')?.addEventListener('click', async function () {
    try {
      await api('/guilds/' + state.guild.id + '/features/giveaways/settings', { method: 'PUT', body: JSON.stringify({ enabled: !!document.getElementById('gwEnabled')?.checked }) });
      state.giveaways = await api('/guilds/' + state.guild.id + '/features/giveaways');
      toast('Giveaway settings saved', 'ok'); render();
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
  });
  root.querySelectorAll('[data-rr-del]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      try {
        state.reactionRoles = await api('/guilds/' + state.guild.id + '/features/reaction-roles/' + encodeURIComponent(btn.getAttribute('data-rr-del')), { method: 'DELETE' });
        toast('Reaction role removed', 'ok'); render();
      } catch (e) { toast(e.message || 'Delete failed', 'err'); }
    });
  });
}
function render() {
  var root = document.getElementById('app'); if (!root) return;
  if (!state.token) root.innerHTML = renderLogin();
  else if (state.mode === 'appeals') {
    if (state.appealForm) root.innerHTML = renderAppealFormView();
    else root.innerHTML = renderAppealSelect();
  } else if (!state.guild) root.innerHTML = renderServerSelect();
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
        var intent = localStorage.getItem(INTENT_KEY) || 'dashboard';
        state.mode = intent === 'appeals' ? 'appeals' : 'dashboard';
        if (state.mode === 'appeals') {
          await loadAppealDirectory();
        } else {
          await loadGuilds();
          if (state.guild) {
            var still = state.guilds.find(function (g) { return String(g.id) === String(state.guild.id); });
            if (!still) { state.guild = null; localStorage.removeItem(GUILD_KEY); }
            else { state.guild = still; await loadGuildData(); }
          } else if (state.guilds.length === 1) {
            state.guild = state.guilds[0]; localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild)); await loadGuildData();
          }
        }
      } catch (e) {
        toast(e.message || 'Session error', 'err');
        if (e.status === 401) { state.token = null; localStorage.removeItem(TOKEN_KEY); }
      }
    }
  } catch (e) {
    var app = document.getElementById('app');
    if (app) app.innerHTML = '<div class="center"><div class="card login-card"><h2>Dashboard failed to load</h2><p class="help">' + escapeHtml(e.message || String(e)) + '</p><button class="btn" onclick="location.reload()">Retry</button></div></div>';
    return;
  }
  render();
}
if (!window.__omnibotSyncTimer) {
  window.__omnibotSyncTimer = setInterval(function () {
    if (state.token && state.guild && document.visibilityState === 'visible') {
      refreshGuildData(true);
    }
  }, 20000);
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && state.token && state.guild) {
    refreshGuildData(true);
  }
});
boot();
