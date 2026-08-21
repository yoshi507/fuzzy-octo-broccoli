function siteFooter() {
  return (
    '<div class="site-footer" style="margin-top:2rem;padding:1.25rem 1rem 1.5rem;text-align:center;border-top:1px solid var(--border)">' +
    '<a class="btn ghost sm" style="display:inline-block" href="https://discord.gg/WpdH42HShV" target="_blank" rel="noopener">Join our Discord</a>' +
    '<p class="status" style="margin-top:.75rem"><a href="/tos">Terms of Service</a> · <a href="/privacy-policy">Privacy Policy</a></p>' +
    '</div>'
  );
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
    siteFooter() +
    '</div></div>';
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
  }).join('') || '<p class="help">No servers with appeals enabled were found. Try again later (list refreshes hourly).</p>';
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
  html += '<div class="row"><button class="btn btnSaveSettings">Save</button></div></div>';
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
    '<div class="row"><button class="btn" id="btnSavePersona">Save personality</button><button class="btn ghost" id="btnResetPersona">Reset</button></div></div>';
}

function renderSection() {
  switch (state.section) {
    case 'overview': return renderOverview();
    case 'ai':
      return renderToggleGroup('AI settings', [['ai.enabled', 'AI enabled'], ['ai.memoryEnabled', 'Memory enabled'], ['ai.naturalInvocation', 'Natural invocation']], [['ai.commandPrefix', 'Command prefix', 'text']]) + renderPersona(state.persona);
    case 'chat':
      return renderToggleGroup('Dead Chat Reviver', [['deadchat.enabled', 'Enabled']], [['deadchat.channel', 'Target channel', 'channel'], ['deadchat.minutes', 'Idle minutes', 'number']]) +
        renderToggleGroup('Welcome / Goodbye / Autorole', [['welcome.enabled', 'Welcome enabled'], ['goodbye.enabled', 'Goodbye enabled'], ['autorole.enabled', 'Autorole enabled']], [['welcome.channel', 'Welcome channel', 'channel'], ['welcome.message', 'Welcome message', 'textarea']]);
    case 'moderation':
      return renderToggleGroup('AutoMod', [['moderation.automodEnabled', 'AutoMod enabled']], [['moderation.blockedWords', 'Blocked words (comma-separated)', 'textarea']]) +
        renderToggleGroup('Anti-spam', [['moderation.antiSpamEnabled', 'Anti-spam enabled']], []);
    case 'support':
      return renderToggleGroup('Appeals', [['appeals.enabled', 'Appeals enabled']], [['appeals.channel', 'Appeals channel', 'channel']]);
    case 'advanced': {
      var bot = state.bot || {};
      return '<div class="card"><h2>Advanced</h2><p class="status">Bot online: <strong>' + (bot.online ? 'Yes' : 'No') + '</strong></p><p class="status">Tag: <code>' + escapeHtml(bot.tag || '—') + '</code></p><p class="status">Guild ID: <code>' + escapeHtml(state.guild.id) + '</code></p></div>';
    }
    case 'account': {
      var u = state.user || {};
      return '<div class="card"><h2>Account</h2><p class="status">Logged in as <strong>' + escapeHtml(u.username || u.id || '—') + '</strong></p><button class="btn ghost" id="btnLogout">Log out</button></div>';
    }
    default:
      return renderOverview() + '<div class="card"><p class="help">More controls available via Discord commands (<code>/help</code>).</p></div>';
  }
}

function renderDashboard() {
  return '<div class="layout"><aside class="sidebar"><div class="brand"><div class="logo"><img src="/logo.svg" alt="OmniBot"/></div><div>OmniBot</div></div><nav class="nav"><div class="nav-label">General</div>' +
    navBtn('overview', 'Overview') + navBtn('ai', 'AI & Personality') + navBtn('chat', 'Chat & Engagement') + navBtn('fun', 'Fun') + navBtn('moderation', 'Moderation') + navBtn('support', 'Support') + navBtn('server', 'Server Config') + navBtn('analytics', 'Analytics') + navBtn('logs', 'Logs') + navBtn('security', 'Security') + navBtn('advanced', 'Advanced') + navBtn('account', 'Account') +
    '</nav><button class="btn ghost" id="btnChangeServer">Change server</button><button class="btn ghost" id="btnLogout">Log out</button></aside><main class="main"><div class="topbar"><h1 style="margin:0">' + escapeHtml(state.section) + '</h1><div class="row"><button class="btn ghost sm" id="btnRefresh">Refresh</button><span class="pill">' + escapeHtml(state.guild.name) + '</span></div></div>' + renderSection() + '</main></div>';
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
    localStorage.setItem(INTENT_KEY, 'dashboard');
    state.appealForm = null;
    state.appealGuild = null;
    render();
  });
  on('#btnBackAppealList', 'click', function () {
    state.appealForm = null;
    state.appealGuild = null;
    render();
  });
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
    root.querySelectorAll('[data-appeal-q]').forEach(function (ta) {
      answers[ta.getAttribute('data-appeal-q')] = ta.value || '';
    });
    var typeEl = document.getElementById('appealType');
    var appealType = (typeEl && typeEl.value) || 'ban';
    state.appealSubmitting = true;
    try {
      await api('/appeals/guilds/' + state.appealForm.guildId + '/submit', {
        method: 'POST',
        body: JSON.stringify({ type: appealType, answers: answers })
      });
      toast('Appeal submitted', 'ok');
      state.appealForm = null;
      state.appealGuild = null;
      render();
    } catch (e) { toast(e.message || 'Submit failed', 'err'); }
    finally { state.appealSubmitting = false; }
  });
  root.querySelectorAll('#btnLogout').forEach(function (b) {
    b.addEventListener('click', function () { logout(); });
  });
  root.querySelectorAll('.guild[data-id]').forEach(function (el) {
    el.addEventListener('click', async function () {
      var id = el.getAttribute('data-id');
      state.guild = state.guilds.find(function (g) { return String(g.id) === String(id); });
      if (state.guild) {
        localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild));
        try { await loadGuildData(); state.section = 'overview'; render(); }
        catch (e) { toast(e.message || 'Failed to load server', 'err'); }
      }
    });
  });
  on('#btnChangeServer', 'click', function () {
    state.guild = null;
    localStorage.removeItem(GUILD_KEY);
    render();
  });
  on('#btnRefresh', 'click', function () { refreshGuildData(false); });
  root.querySelectorAll('[data-section]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.section = btn.getAttribute('data-section') || 'overview';
      render();
    });
  });
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
  on('#btnSavePersona', 'click', async function () {
    try {
      var pEl = document.getElementById('pPersonality');
      var tEl = document.getElementById('pTone');
      await savePersona({ personality: pEl ? pEl.value : '', tone: tEl ? tEl.value : 'chill' });
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
  });
  on('#btnResetPersona', 'click', function () {
    resetPersona().catch(function (e) { toast(e.message, 'err'); });
  });
}

function render() {
  var root = document.getElementById('app');
  if (!root) return;
  if (state.mode === 'advertise' && typeof renderAdvertise === 'function') {
    root.innerHTML = renderAdvertise() + siteFooter();
    bind();
    return;
  }
  if (!state.token) {
    root.innerHTML = renderLogin();
    bind();
    return;
  }
  if (state.mode === 'appeals') {
    if (state.appealForm) root.innerHTML = renderAppealFormView() + siteFooter();
    else root.innerHTML = renderAppealSelect() + siteFooter();
  } else if (!state.guild) {
    root.innerHTML = renderServerSelect() + siteFooter();
  } else {
    root.innerHTML = renderDashboard() + siteFooter();
  }
  bind();
}

async function boot() {
  try {
    await loadOAuthConfig();
    await handleOAuthCallback();
    if (state.token) {
      try {
        await loadMe();
        state.oauthError = null;
        try { var t = document.getElementById('toast'); if (t) t.classList.add('hidden'); } catch (e) {}
        var intent = localStorage.getItem(INTENT_KEY) || 'dashboard';
        if (intent !== 'appeals' && intent !== 'advertise' && intent !== 'dashboard') intent = 'dashboard';
        state.mode = intent;
        if (typeof goToIntent === 'function') {
          await goToIntent(intent);
          return;
        }
        if (state.mode === 'appeals') {
          await loadAppealDirectory();
        } else if (state.mode === 'advertise') {
          /* advertise page script handles directory */
        } else {
          await loadGuilds();
          if (state.guild) {
            var still = state.guilds.find(function (g) { return String(g.id) === String(state.guild.id); });
            if (!still) { state.guild = null; localStorage.removeItem(GUILD_KEY); }
            else { state.guild = still; await loadGuildData(); }
          } else if (state.guilds.length === 1) {
            state.guild = state.guilds[0];
            localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild));
            await loadGuildData();
          }
        }
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
        escapeHtml(e.message || String(e)) +
        '</p><button class="btn" onclick="location.reload()">Retry</button></div></div>';
    }
    return;
  }
  render();
}

if (!window.__omnibotSyncTimer) {
  window.__omnibotSyncTimer = setInterval(function () {
    if (state.token && state.guild && document.visibilityState === 'visible') refreshGuildData(true);
  }, 30000);
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && state.token && state.guild && !isTyping()) refreshGuildData(true);
});
boot();
