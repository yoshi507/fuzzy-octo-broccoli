function renderLogin() {
  return '<div class="center"><div class="card login-card"><div style="text-align:center;margin-bottom:1rem"><div class="login-logo"><img src="/logo.svg" alt="OmniBot"/></div><div style="font-size:1.25rem;font-weight:700">OmniBot</div></div><p class="help">Manage your server, add OmniBot, appeal a punishment, or discover communities.</p><button class="btn" id="btnOpenDashboard" style="width:100%;margin-bottom:.75rem">Open Dashboard</button><a class="btn ghost" style="display:block;margin-bottom:.75rem" href="' + INVITE + '" target="_blank" rel="noopener">Add to Discord</a><button class="btn ghost" id="btnAppealPunishment" style="width:100%;margin-bottom:.75rem">Appeal a punishment</button><button class="btn ghost" id="btnAdvertise" style="width:100%">Advertise</button><p class="status" style="margin-top:1rem">API: same-origin · <a href="/health" target="_blank">/health</a></p><p class="status" style="margin-top:.75rem"><a href="/tos">Terms of Service</a> · <a href="/privacy-policy">Privacy Policy</a></p></div></div>';
}
function renderServerSelect() {
  if (!state.guilds.length) return '<div class="center"><div class="card login-card"><h2>No manageable servers</h2><p class="help">You need Manage Server on a server where OmniBot is present.</p><button class="btn" id="btnLogout">Log out</button></div></div>';
  var cards = state.guilds.map(function (g) {
    return '<div class="guild" data-id="' + escapeAttr(g.id) + '">' + (g.icon ? '<img src="' + iconUrl(g) + '" alt=""/>' : '<div class="avatar-prev"></div>') + '<div><div style="font-weight:600">' + escapeHtml(g.name) + '</div><div class="status">' + (g.owner ? 'Owner' : 'Manager') + '</div></div></div>';
  }).join('');
  return '<div class="center"><div style="width:min(720px,100%)"><div class="card"><h2>Select a server</h2><p class="help">Choose which Discord server to manage.</p><div class="guild-grid">' + cards + '</div><div class="row" style="margin-top:1rem"><button class="btn ghost" id="btnLogout">Log out</button></div></div></div></div>';
}
function renderDashboard() {
  return '<div class="layout"><aside class="sidebar"><div class="brand"><div class="logo"><img src="/logo.svg" alt="OmniBot"/></div><div>OmniBot</div></div><nav class="nav"><div class="nav-label">General</div>' +
    navBtn('overview','Overview') + navBtn('ai','AI & Personality') + navBtn('chat','Chat & Engagement') + navBtn('fun','Fun') + navBtn('moderation','Moderation') + navBtn('support','Support') + navBtn('server','Server Config') + navBtn('analytics','Analytics') + navBtn('logs','Logs') + navBtn('security','Security') + navBtn('advanced','Advanced') + navBtn('account','Account') +
    '</nav><button class="btn ghost" id="btnChangeServer">Change server</button><button class="btn ghost" id="btnLogout">Log out</button></aside><main class="main"><div class="topbar"><h1 style="margin:0">' + escapeHtml(state.section) + '</h1><div class="row"><button class="btn ghost sm" id="btnRefresh">Refresh</button><span class="pill">' + escapeHtml(state.guild.name) + '</span></div></div>' + (typeof renderSection === 'function' ? renderSection() : renderOverview()) + '</main></div>';
}
function renderSection() {
  if (state.section === 'overview') return renderOverview();
  if (state.section === 'advanced') {
    var bot = state.bot || {};
    return '<div class="card"><h2>Advanced</h2><p class="status">Bot online: <strong>' + (bot.online ? 'Yes' : 'No') + '</strong></p><p class="status">Tag: <code>' + escapeHtml(bot.tag || '—') + '</code></p><p class="status">Guild ID: <code>' + escapeHtml(state.guild.id) + '</code></p><p class="status">Latency: ' + escapeHtml(bot.latencyMs != null ? bot.latencyMs + ' ms' : '—') + '</p></div>';
  }
  if (state.section === 'account') {
    var u = state.user || {};
    return '<div class="card"><h2>Account</h2><p class="status">Logged in as <strong>' + escapeHtml(u.username || u.id || '—') + '</strong></p><button class="btn ghost" id="btnLogout">Log out</button></div>';
  }
  return renderOverview() + '<div class="card"><p class="help">This section uses the full settings UI after deploy. Overview and bot status are live.</p></div>';
}
function bind() {
  var root = document.getElementById('app'); if (!root) return;
  root.querySelector('#btnOpenDashboard')?.addEventListener('click', function () { startLogin('dashboard'); });
  root.querySelector('#btnAppealPunishment')?.addEventListener('click', function () { startLogin('appeals'); });
  root.querySelectorAll('#btnLogout').forEach(function (b) { b.addEventListener('click', function () { logout(); }); });
  root.querySelectorAll('.guild[data-id]').forEach(function (el) {
    el.addEventListener('click', async function () {
      var id = el.getAttribute('data-id');
      state.guild = state.guilds.find(function (g) { return String(g.id) === String(id); });
      if (state.guild) {
        localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild));
        try { await loadGuildData(); state.section = 'overview'; render(); } catch (e) { toast(e.message || 'Failed to load server', 'err'); }
      }
    });
  });
  root.querySelector('#btnChangeServer')?.addEventListener('click', function () { state.guild = null; localStorage.removeItem(GUILD_KEY); render(); });
  root.querySelector('#btnRefresh')?.addEventListener('click', function () { refreshGuildData(false); });
  root.querySelectorAll('[data-section]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.section = btn.getAttribute('data-section') || 'overview';
      render();
    });
  });
}
function render() {
  var root = document.getElementById('app'); if (!root) return;
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
          if (!still) { state.guild = null; localStorage.removeItem(GUILD_KEY); }
          else { state.guild = still; await loadGuildData(); }
        } else if (state.guilds.length === 1) {
          state.guild = state.guilds[0];
          localStorage.setItem(GUILD_KEY, JSON.stringify(state.guild));
          await loadGuildData();
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
    if (state.token && state.guild && document.visibilityState === 'visible') refreshGuildData(true);
  }, 20000);
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && state.token && state.guild) refreshGuildData(true);
});
boot();
