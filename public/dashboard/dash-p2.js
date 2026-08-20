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

  root.querySelectorAll('#btnSaveSettings').forEach(function (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async function () {
      try {
        var patch = {};
        var card = saveSettingsBtn.closest('.card') || root;
        card.querySelectorAll('[data-setting]').forEach(function (el) {
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
  });

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

  var saveGw = root.querySelector('#btnSaveGw');
  if (saveGw) saveGw.addEventListener('click', async function () {
    try {
      var enabled = !!(document.getElementById('gwEnabled') || {}).checked;
      await api('/guilds/' + state.guild.id + '/features/giveaways/settings', {
        method: 'PUT',
        body: JSON.stringify({ enabled: enabled })
      });
      state.giveaways = await api('/guilds/' + state.guild.id + '/features/giveaways');
      toast('Giveaway settings saved', 'ok');
      render();
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
  });
  root.querySelectorAll('[data-rr-del]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      try {
        var id = btn.getAttribute('data-rr-del');
        state.reactionRoles = await api('/guilds/' + state.guild.id + '/features/reaction-roles/' + encodeURIComponent(id), { method: 'DELETE' });
        toast('Reaction role removed', 'ok');
        render();
      } catch (e) { toast(e.message || 'Delete failed', 'err'); }
    });
  });
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
