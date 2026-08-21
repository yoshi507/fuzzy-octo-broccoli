function siteFooter() {
  return (
    '<div class="site-footer" style="margin-top:2rem;padding:1.25rem 1rem 1.5rem;text-align:center;border-top:1px solid var(--border)">' +
    '<a class="btn ghost sm" style="display:inline-block" href="https://discord.gg/WpdH42HShV" target="_blank" rel="noopener">Join our Discord</a>' +
    '<p class="status" style="margin-top:.75rem"><a href="/tos">Terms of Service</a> · <a href="/privacy-policy">Privacy Policy</a></p>' +
    '</div>'
  );
}

function sectionTitle(id) {
  var map = {
    overview: 'Overview', ai: 'AI & Personality', chat: 'Chat & Engagement', fun: 'Fun',
    moderation: 'Moderation', support: 'Support', server: 'Server Config', analytics: 'Analytics',
    logs: 'Logs', security: 'Security', advanced: 'Advanced', account: 'Account'
  };
  return map[id] || id;
}

function renderLogin() {
  var err = (!state.token && state.oauthError)
    ? '<p class="help" style="color:var(--err);white-space:pre-wrap;margin-bottom:1rem">' + escapeHtml(state.oauthError) + '</p>'
    : '';
  var cfg = state.oauth && state.oauth.configured === false
    ? '<p class="help" style="color:var(--warn)">Discord login is not fully configured on the server yet.</p>'
    : '';
  return '<div class="center"><div class="card login-card"><div style="text-align:center;margin-bottom:1rem"><div class="login-logo"><img src="/logo.svg" alt="OmniBot"/></div><div style="font-size:1.25rem;font-weight:700">OmniBot</div></div>' +
    err + cfg +
    '<p class="help">Manage your server, add OmniBot, appeal a punishment, or discover communities.</p>' +
    '<button type="button" class="btn" id="btnOpenDashboard" style="width:100%;margin-bottom:.75rem" onclick="startLogin(\'dashboard\')">Open Dashboard</button>' +
    '<a class="btn ghost" style="display:block;margin-bottom:.75rem;text-align:center" href="' + INVITE + '" target="_blank" rel="noopener">Add to Discord</a>' +
    '<button type="button" class="btn ghost" id="btnAppealPunishment" style="width:100%;margin-bottom:.75rem" onclick="startLogin(\'appeals\')">Appeal a punishment</button>' +
    '<button type="button" class="btn ghost" id="btnAdvertise" style="width:100%">Advertise</button>' +
    '<p class="status" style="margin-top:1rem">API: same-origin · <a href="/health" target="_blank">/health</a></p>' +
    siteFooter() + '</div></div>';
}

function renderServerSelect() {
  if (!state.guilds.length) {
    return '<div class="center"><div class="card login-card"><h2>No manageable servers</h2><p class="help">You need Manage Server on a server where OmniBot is present.</p><button class="btn" id="btnLogout">Log out</button></div></div>';
  }
  var cards = state.guilds.map(function (g) {
    return '<div class="guild" data-id="' + escapeAttr(g.id) + '">' +
      (g.icon ? '<img src="' + iconUrl(g) + '" alt=""/>' : '<div class="avatar-prev"></div>') +
      '<div><div style="font-weight:600">' + escapeHtml(g.name) + '</div><div class="status">' + (g.owner ? 'Owner' : 'Manager') + '</div></div></div>';
  }).join('');
  return '<div class="center"><div style="width:min(720px,100%)"><div class="card"><h2>Select a server</h2><p class="help">Choose which Discord server to manage.</p><div class="guild-grid">' + cards + '</div><div class="row" style="margin-top:1rem"><button class="btn ghost" id="btnLogout">Log out</button></div></div></div></div>';
}

function renderAppealSelect() {
  var q = (state.appealSearch || '').toLowerCase();
  var list = (state.appealDirectory || []).filter(function (g) {
    if (!q) return true;
    return String(g.name || '').toLowerCase().indexOf(q) !== -1;
  });
  var cards = list.map(function (g) {
    var icon = g.icon ? '<img class="avatar-prev" src="' + escapeAttr(g.icon) + '" alt=""/>' : '<div class="avatar-prev"></div>';
    return '<div class="guild" data-appeal-id="' + escapeAttr(g.id) + '">' + icon +
      '<div><div style="font-weight:600">' + escapeHtml(g.name || g.id) + '</div><div class="status">Click to open appeal form</div></div></div>';
  }).join('') || '<p class="help">No servers with appeals enabled were found. Enable appeals in a server dashboard (Support → Appeals), then try again.</p>';
  return '<div class="center"><div style="width:min(720px,100%)"><div class="card"><h2>Appeal a punishment</h2><p class="help">Search for the server, then fill in the appeal form.</p>' +
    '<div class="field"><label>Search</label><input type="search" id="appealSearch" value="' + escapeAttr(state.appealSearch || '') + '" placeholder="Server name…"/></div>' +
    '<div class="guild-grid">' + cards + '</div>' +
    '<div class="row" style="margin-top:1rem"><button class="btn ghost" id="btnBackHome">Back</button><button class="btn ghost" id="btnLogout">Log out</button></div></div></div></div>';
}

function renderAppealFormView() {
  var form = state.appealForm || {};
  var g = state.appealGuild || {};
  if (form.openAppealId) {
    return '<div class="center"><div class="card login-card"><h2>Appeal already open</h2><p class="help">You already have open appeal <code>' + escapeHtml(form.openAppealId) + '</code>.</p><div class="row"><button class="btn" id="btnBackAppealList">Back to servers</button><button class="btn ghost" id="btnLogout">Log out</button></div></div></div>';
  }
  var questions = Array.isArray(form.questions) ? form.questions : [
    { id: 'why', label: 'Why should this punishment be removed?', required: true },
    { id: 'extra', label: 'Anything else we should know?', required: false }
  ];
  var fields = questions.map(function (q, i) {
    var id = q.id || ('q' + i);
    return '<div class="field"><label>' + escapeHtml(q.label || id) + (q.required ? ' *' : '') + '</label><textarea data-appeal-q="' + escapeAttr(id) + '" ' + (q.required ? 'required' : '') + '></textarea></div>';
  }).join('');
  return '<div class="center"><div style="width:min(640px,100%)"><div class="card">' +
    '<h2 style="margin:0 0 .5rem">Appeal — ' + escapeHtml(form.guildName || g.name || 'Server') + '</h2>' +
    '<div class="field"><label>Punishment type</label><select id="appealType"><option value="ban">Ban</option><option value="timeout">Timeout / Mute</option><option value="warn">Warning</option></select></div>' +
    fields +
    '<div class="row"><button class="btn" id="btnSubmitAppeal">Submit appeal</button><button class="btn ghost" id="btnBackAppealList">Back</button></div></div></div></div>';
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
    else if (type === 'textarea') html += '<textarea data-setting="' + escapeAttr(id) + '">' + escapeHtml(val || '') + '</textarea>';
    else if (type === 'number') html += '<input type="number" data-setting="' + escapeAttr(id) + '" value="' + escapeAttr(val != null ? val : '') + '"/>';
    else html += '<input type="text" data-setting="' + escapeAttr(id) + '" value="' + escapeAttr(val != null ? val : '') + '"/>';
    html += '</div>';
  });
  html += '<div class="row"><button type="button" class="btn btnSaveSettings">Save</button></div></div>';
  return html;
}

function renderPersona(p) {
  p = p || {};
  function opt(v, cur) {
    return '<option value="' + escapeAttr(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + escapeHtml(v) + '</option>';
  }
  return '<div class="card"><h2>Personality</h2><p class="help">Custom instructions for AI replies in this server.</p>' +
    '<div class="field"><label>Instructions</label><textarea id="pPersonality">' + escapeHtml(p.personality || '') + '</textarea></div>' +
    '<div class="field"><label>Tone</label><select id="pTone">' + opt('chill', p.tone) + opt('professional', p.tone) + opt('sarcastic', p.tone) + opt('friendly', p.tone) + '</select></div>' +
    '<div class="row"><button type="button" class="btn" id="btnSavePersona">Save personality</button><button type="button" class="btn ghost" id="btnResetPersona">Reset</button></div></div>';
}

function renderSection() {
  var s = state.section || 'overview';
  switch (s) {
    case 'overview': return renderOverview();
    case 'ai':
      return renderToggleGroup('AI settings', [
        ['ai.enabled', 'AI enabled'], ['ai.memoryEnabled', 'Memory enabled'], ['ai.naturalInvocation', 'Natural invocation']
      ], [['ai.commandPrefix', 'Command prefix', 'text'], ['ai.memoryMaxMessages', 'Memory max messages', 'number']]) + renderPersona(state.persona);
    case 'chat':
      return renderToggleGroup('Dead Chat Reviver', [['deadchat.enabled', 'Enabled']], [
        ['deadchat.channel', 'Target channel', 'channel'], ['deadchat.minutes', 'Idle minutes', 'number']
      ]) + renderToggleGroup('Welcome / Goodbye / Autorole', [
        ['welcome.enabled', 'Welcome enabled'], ['goodbye.enabled', 'Goodbye enabled'], ['autorole.enabled', 'Autorole enabled']
      ], [['welcome.channel', 'Welcome channel', 'channel'], ['welcome.message', 'Welcome message', 'textarea']]);
    case 'fun':
      return renderToggleGroup('Leveling', [
        ['leveling.enabled', 'Leveling enabled'], ['leveling.announceLevelUp', 'Announce level-ups']
      ], [['leveling.xpMin', 'XP min', 'number'], ['leveling.xpMax', 'XP max', 'number'], ['leveling.cooldownSeconds', 'Cooldown (seconds)', 'number']]) +
        renderToggleGroup('Quiz', [
          ['quiz.enabled', 'Quiz enabled'], ['quiz.rewardsEnabled', 'Rewards enabled'], ['quiz.leaderboardEnabled', 'Leaderboard enabled']
        ], [['quiz.channel', 'Quiz channel', 'channel'], ['quiz.questionCount', 'Questions per quiz', 'number'], ['quiz.timeLimitSeconds', 'Seconds per question', 'number']]);
    case 'moderation':
      return renderToggleGroup('AutoMod', [['moderation.automodEnabled', 'AutoMod enabled']], [
        ['moderation.blockedWords', 'Blocked words (comma-separated)', 'textarea'], ['moderation.modLogChannel', 'Mod log channel', 'channel']
      ]) + renderToggleGroup('Anti-spam', [['moderation.antiSpamEnabled', 'Anti-spam enabled']], []);
    case 'support':
      return renderToggleGroup('Appeals', [['appeals.enabled', 'Appeals enabled'], ['appeals.logEnabled', 'Log appeals']], [
        ['appeals.channel', 'Appeals channel', 'channel'], ['appeals.cooldownHours', 'Cooldown (hours)', 'number'],
        ['appeals.acceptMessage', 'Accept message', 'textarea'], ['appeals.rejectMessage', 'Reject message', 'textarea'],
        ['appeals.pendingMessage', 'Pending message', 'textarea']
      ]);
    case 'server':
      return renderToggleGroup('Server channels & roles', [], [
        ['server.suggestionsChannel', 'Suggestions channel', 'channel'], ['welcome.channel', 'Welcome channel', 'channel'],
        ['moderation.modLogChannel', 'Mod log channel', 'channel']
      ]) + renderToggleGroup('Prefix', [], [['ai.commandPrefix', 'Command prefix', 'text']]);
    case 'analytics': {
      var stats = state.stats || {}; var bot = state.bot || {};
      return '<div class="card"><h2>Analytics</h2><div class="grid2">' +
        '<div class="stat"><div class="status">Members</div><strong>' + escapeHtml(stats.members != null ? stats.members : '—') + '</strong></div>' +
        '<div class="stat"><div class="status">AI used today</div><strong>' + escapeHtml((stats.aiUsedToday != null ? stats.aiUsedToday : 0) + ' / 20') + '</strong></div>' +
        '<div class="stat"><div class="status">Warnings</div><strong>' + escapeHtml(stats.warnings != null ? stats.warnings : 0) + '</strong></div>' +
        '<div class="stat"><div class="status">Active giveaways</div><strong>' + escapeHtml(stats.activeGiveaways != null ? stats.activeGiveaways : 0) + '</strong></div>' +
        '<div class="stat"><div class="status">Reaction-role panels</div><strong>' + escapeHtml(stats.reactionRolePanels != null ? stats.reactionRolePanels : 0) + '</strong></div>' +
        '<div class="stat"><div class="status">Latency</div><strong>' + escapeHtml(bot.latencyMs != null ? bot.latencyMs + ' ms' : '—') + '</strong></div></div></div>';
    }
    case 'logs': {
      var hist = state.settingsHistory;
      var list = Array.isArray(hist) ? hist : (hist && hist.history) || (hist && hist.items) || [];
      var rows = !list.length ? '<p class="help">No recent configuration changes recorded yet.</p>' :
        '<ul class="status" style="padding-left:1.1rem">' + list.slice(0, 25).map(function (h) {
          var when = h.at || h.timestamp || h.time || '';
          var who = h.user || h.by || h.username || 'unknown';
          var what = h.summary || h.action || JSON.stringify(h.patch || h.changes || h).slice(0, 120);
          return '<li><strong>' + escapeHtml(String(who)) + '</strong> — ' + escapeHtml(String(what)) +
            (when ? ' <span class="status">(' + escapeHtml(String(when)) + ')</span>' : '') + '</li>';
        }).join('') + '</ul>';
      return '<div class="card"><h2>Configuration logs</h2>' + rows + '</div>';
    }
    case 'security':
      return renderToggleGroup('Anti-nuke / security', [
        ['security.enabled', 'Security enabled'], ['security.autoTimeoutExecutor', 'Auto-timeout executors']
      ], [
        ['security.mode', 'Mode (monitor / alert / lockdown)', 'text'],
        ['security.autoTimeoutMinutes', 'Timeout minutes', 'number'],
        ['security.thresholdChannelDelete', 'Channel delete threshold', 'number'],
        ['security.thresholdRoleDelete', 'Role delete threshold', 'number'],
        ['security.windowSeconds', 'Window (seconds)', 'number']
      ]);
    case 'advanced': {
      var bot2 = state.bot || {};
      return '<div class="card"><h2>Advanced</h2><p class="status">Bot online: <strong>' + (bot2.online ? 'Yes' : 'No') +
        '</strong></p><p class="status">Tag: <code>' + escapeHtml(bot2.tag || '—') + '</code></p><p class="status">Guild ID: <code>' +
        escapeHtml(state.guild.id) + '</code></p><p class="help">Use Discord commands for features not shown here (<code>/help</code>).</p></div>';
    }
    case 'account': {
      var u = state.user || {};
      return '<div class="card"><h2>Account</h2><p class="status">Logged in as <strong>' + escapeHtml(u.username || u.id || '—') +
        '</strong></p><button type="button" class="btn ghost" id="btnLogout">Log out</button></div>';
    }
    default:
      return '<div class="card"><h2>' + escapeHtml(sectionTitle(s)) + '</h2><p class="help">This section is not available.</p></div>';
  }
}

function renderDashboard() {
  var nav = ['overview', 'ai', 'chat', 'fun', 'moderation', 'support', 'server', 'analytics', 'logs', 'security', 'advanced', 'account']
    .map(function (id) { return navBtn(id, sectionTitle(id)); }).join('');
  return '<div class="layout"><aside class="sidebar" id="dash-sidebar"><div class="brand"><div class="logo"><img src="/logo.svg" alt="OmniBot"/></div><div>OmniBot</div></div><nav class="nav"><div class="nav-label">General</div>' +
    nav + '</nav><button type="button" class="btn ghost" id="btnChangeServer">Change server</button><button type="button" class="btn ghost" id="btnLogout">Log out</button></aside><main class="main"><div class="topbar"><h1 style="margin:0" id="section-title">' +
    escapeHtml(sectionTitle(state.section)) + '</h1><div class="row"><button type="button" class="btn ghost sm" id="btnRefresh">Refresh</button><span class="pill">' +
    escapeHtml(state.guild.name) + '</span></div></div><div id="main-panel">' + renderSection() + '</div></main></div>';
}

function switchSection(id) {
  if (!id) id = 'overview';
  state.section = id;
  var panel = document.getElementById('main-panel');
  var title = document.getElementById('section-title');
  if (title) title.textContent = sectionTitle(id);
  document.querySelectorAll('#dash-sidebar [data-section]').forEach(function (btn) {
    if (btn.getAttribute('data-section') === id) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  if (panel) {
    panel.innerHTML = renderSection();
    bindPanelControls();
  } else {
    render();
  }
}

function bindPanelControls() {
  var root = document.getElementById('main-panel') || document.getElementById('app');
  if (!root) return;
  root.querySelectorAll('.btnSaveSettings').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      try {
        var patch = {};
        var card = btn.closest('.card') || root;
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
  var saveP = root.querySelector('#btnSavePersona');
  if (saveP) {
    saveP.addEventListener('click', async function () {
      try {
        var pEl = document.getElementById('pPersonality');
        var tEl = document.getElementById('pTone');
        await savePersona({ personality: pEl ? pEl.value : '', tone: tEl ? tEl.value : 'chill' });
      } catch (e) { toast(e.message || 'Save failed', 'err'); }
    });
  }
  var resetP = root.querySelector('#btnResetPersona');
  if (resetP) resetP.addEventListener('click', function () { resetPersona().catch(function (e) { toast(e.message, 'err'); }); });
  var logoutBtn = root.querySelector('#btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', function () { logout(); });
}

function bind() {
  var root = document.getElementById('app');
  if (!root) return;
  function on(sel, evt, fn) {
    var el = root.querySelector(sel);
    if (el) el.addEventListener(evt, fn);
  }
  on('#btnOpenDashboard', 'click', function (e) { e.preventDefault(); startLogin('dashboard'); });
  on('#btnAppealPunishment', 'click', function (e) { e.preventDefault(); startLogin('appeals'); });
  on('#btnBackHome', 'click', function () {
    state.mode = 'dashboard';
    try { localStorage.setItem(INTENT_KEY, 'dashboard'); location.hash = ''; } catch (e) {}
    state.appealForm = null; state.appealGuild = null;
    if (state.token) goToIntent('dashboard'); else render();
  });
  on('#btnBackAppealList', 'click', function () { state.appealForm = null; state.appealGuild = null; render(); });
  var search = root.querySelector('#appealSearch');
  if (search) {
    search.addEventListener('input', function () {
      state.appealSearch = search.value || '';
      var pos = search.selectionStart;
      render();
      var el = document.getElementById('appealSearch');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
    });
  }
  root.querySelectorAll('[data-appeal-id]').forEach(function (el) {
    el.addEventListener('click', async function () {
      try { await loadAppealForm(el.getAttribute('data-appeal-id')); render(); }
      catch (e) { toast(e.message || 'Failed to load form', 'err'); }
    });
  });
  on('#btnSubmitAppeal', 'click', async function () {
    if (!state.appealForm || state.appealSubmitting) return;
    var answers = {};
    root.querySelectorAll('[data-appeal-q]').forEach(function (ta) { answers[ta.getAttribute('data-appeal-q')] = ta.value || ''; });
    var typeEl = document.getElementById('appealType');
    var appealType = (typeEl && typeEl.value) || 'ban';
    state.appealSubmitting = true;
    try {
      await api('/appeals/guilds/' + state.appealForm.guildId + '/submit', { method: 'POST', body: JSON.stringify({ type: appealType, answers: answers }) });
      toast('Appeal submitted', 'ok');
      state.appealForm = null; state.appealGuild = null; render();
    } catch (e) { toast(e.message || 'Submit failed', 'err'); }
    finally { state.appealSubmitting = false; }
  });
  root.querySelectorAll('#btnLogout').forEach(function (b) { b.addEventListener('click', function () { logout(); }); });
  root.querySelectorAll('.guild[data-id]').forEach(function (el) {
    el.addEventListener('click', async function () {
      var id = el.getAttribute('data-id');
      state.guild = state.guilds.find(function (g) { return String(g.id) === String(id); });
      if (state.guild) {
        localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild));
        try {
          await loadGuildData();
          state.section = 'overview';
          state.mode = 'dashboard';
          try { localStorage.setItem(INTENT_KEY, 'dashboard'); } catch (e) {}
          render();
        } catch (e) { toast(e.message || 'Failed to load server', 'err'); }
      }
    });
  });
  on('#btnChangeServer', 'click', function () { state.guild = null; localStorage.removeItem(GUILD_KEY); render(); });
  on('#btnRefresh', 'click', function () { refreshGuildData(false); });
  root.querySelectorAll('#dash-sidebar [data-section]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      switchSection(btn.getAttribute('data-section') || 'overview');
    });
  });
  bindPanelControls();
}

function render() {
  var root = document.getElementById('app');
  if (!root) return;
  try {
    var h = (location.hash || '').toLowerCase();
    if (h === '#/appeals') state.mode = 'appeals';
    else if (h === '#/advertise') state.mode = 'advertise';
  } catch (e) {}
  if (state.mode === 'advertise' && typeof renderAdvertise === 'function') {
    root.innerHTML = renderAdvertise() + siteFooter(); bind(); return;
  }
  if (!state.token) { root.innerHTML = renderLogin(); bind(); return; }
  if (state.mode === 'appeals') {
    root.innerHTML = (state.appealForm ? renderAppealFormView() : renderAppealSelect()) + siteFooter();
    bind(); return;
  }
  if (!state.guild) { root.innerHTML = renderServerSelect() + siteFooter(); bind(); return; }
  root.innerHTML = renderDashboard() + siteFooter();
  bind();
}

async function boot() {
  try {
    await loadOAuthConfig();
    await handleOAuthCallback();
    try {
      var h = (location.hash || '').toLowerCase();
      if (h === '#/appeals') { state.mode = 'appeals'; try { localStorage.setItem(INTENT_KEY, 'appeals'); } catch (e) {} }
      else if (h === '#/advertise') { state.mode = 'advertise'; try { localStorage.setItem(INTENT_KEY, 'advertise'); } catch (e) {} }
    } catch (e) {}
    if (state.token) {
      try {
        await loadMe();
        state.oauthError = null;
        try { var t = document.getElementById('toast'); if (t) t.classList.add('hidden'); } catch (e) {}
        var intent = state.mode || localStorage.getItem(INTENT_KEY) || 'dashboard';
        if (intent !== 'appeals' && intent !== 'advertise' && intent !== 'dashboard') intent = 'dashboard';
        state.mode = intent;
        if (typeof goToIntent === 'function') { await goToIntent(intent); return; }
      } catch (e) {
        var msg = e.message || 'Session error';
        if (!(state.token && /invalid_request|invalid.?code|invalid_grant/i.test(msg))) toast(msg, 'err');
        else state.oauthError = null;
        if (e.status === 401) { state.token = null; localStorage.removeItem(TOKEN_KEY); }
      }
    }
  } catch (e) {
    var app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<div class="center"><div class="card login-card"><h2>Dashboard failed to load</h2><p class="help">' +
        escapeHtml(e.message || String(e)) + '</p><button class="btn" onclick="location.reload()">Retry</button></div></div>';
    }
    return;
  }
  render();
}

if (!window.__omnibotSyncTimer) {
  window.__omnibotSyncTimer = setInterval(function () {
    if (state.token && state.guild && state.mode === 'dashboard' && document.visibilityState === 'visible') refreshGuildData(true);
  }, 30000);
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && state.token && state.guild && state.mode === 'dashboard' && !isTyping()) refreshGuildData(true);
});
boot();
