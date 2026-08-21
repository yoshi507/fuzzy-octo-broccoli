/* Advertise directory overlay — loaded after dashboard.js */
(function () {
  if (typeof state === 'undefined' || typeof render !== 'function') {
    console.warn('[Advertise] dashboard not ready');
    return;
  }

  state.advertiseDirectory = state.advertiseDirectory || [];
  state.advertiseMeta = state.advertiseMeta || null;
  state.advertiseSearch = state.advertiseSearch || '';
  state.advertiseCategory = state.advertiseCategory || 'all';
  state.advertiseShowAdd = state.advertiseShowAdd || false;

  var origRender = render;
  var origBind = bind;
  var origRenderLogin = renderLogin;

  function loadAdvertiseDirectory() {
    var q = '/advertise/directory?category=' + encodeURIComponent(state.advertiseCategory || 'all');
    if (state.advertiseSearch) q += '&search=' + encodeURIComponent(state.advertiseSearch);
    return api(q)
      .then(function (data) {
        state.advertiseDirectory = (data && data.guilds) || [];
        state.advertiseMeta = data || null;
      })
      .catch(function (e) {
        state.advertiseDirectory = [];
        state.advertiseMeta = { error: e.message || String(e) };
      });
  }

  function renderAdvertise() {
    var cats = (state.advertiseMeta && state.advertiseMeta.categories) || [
      { id: 'gaming', label: 'Gaming' },
      { id: 'community', label: 'Community' },
      { id: 'social', label: 'Social' },
      { id: 'economy', label: 'Economy / Farming' },
      { id: 'roleplay', label: 'Roleplay' },
      { id: 'education', label: 'Education / Study' },
      { id: 'anime', label: 'Anime / Media' },
      { id: 'music', label: 'Music' },
      { id: 'tech', label: 'Tech / Coding' },
      { id: 'other', label: 'Other' }
    ];
    var byCat = (state.advertiseMeta && state.advertiseMeta.byCategory) || {};
    var inviteBot = (state.advertiseMeta && state.advertiseMeta.inviteBotUrl) || INVITE;

    var catOpts =
      '<option value="all"' +
      (state.advertiseCategory === 'all' ? ' selected' : '') +
      '>All categories</option>';
    cats.forEach(function (c) {
      catOpts +=
        '<option value="' +
        escapeAttr(c.id) +
        '"' +
        (state.advertiseCategory === c.id ? ' selected' : '') +
        '>' +
        escapeHtml(c.label) +
        '</option>';
    });

    function card(g) {
      var icon = g.icon
        ? '<img class="avatar-prev" src="' + escapeAttr(g.icon) + '" alt=""/>'
        : '<div class="avatar-prev"></div>';
      return (
        '<div class="guild">' +
        icon +
        '<div><div style="font-weight:600">' +
        escapeHtml(g.name) +
        '</div><div class="status">' +
        (g.memberCount || 0) +
        ' members</div>' +
        (g.description
          ? '<p class="help" style="margin:.35rem 0 0">' + escapeHtml(g.description) + '</p>'
          : '') +
        (g.inviteUrl
          ? '<a class="btn" style="margin-top:.5rem;display:inline-block" href="' +
            escapeAttr(g.inviteUrl) +
            '" target="_blank" rel="noopener">Join</a>'
          : '') +
        '</div></div>'
      );
    }

    var body = '';
    if (state.advertiseMeta && state.advertiseMeta.error) {
      body =
        '<p class="help">Could not load directory: ' +
        escapeHtml(state.advertiseMeta.error) +
        '</p>';
    } else if (!state.advertiseDirectory.length) {
      body =
        '<p class="help">No servers listed yet. Be the first — use <strong>Add your server</strong>.</p>';
    } else if (state.advertiseCategory && state.advertiseCategory !== 'all') {
      body +=
        '<div class="card"><h2>' +
        escapeHtml(
          (cats.find(function (c) {
            return c.id === state.advertiseCategory;
          }) || {}).label || state.advertiseCategory
        ) +
        '</h2><div class="guild-grid">';
      state.advertiseDirectory.forEach(function (g) {
        body += card(g);
      });
      body += '</div></div>';
    } else {
      cats.forEach(function (c) {
        var list = byCat[c.id] || [];
        if (!list.length) return;
        body +=
          '<div class="card"><h2>' +
          escapeHtml(c.label) +
          ' <span class="status">(' +
          list.length +
          ')</span></h2><div class="guild-grid">';
        list.forEach(function (g) {
          body += card(g);
        });
        body += '</div></div>';
      });
      if (!body) body = '<p class="help">No servers listed yet.</p>';
    }

    var addPanel = '';
    if (state.advertiseShowAdd) {
      addPanel =
        '<div class="card" style="margin-top:1rem"><h2>Add your server</h2>' +
        '<ol class="help" style="padding-left:1.2rem;line-height:1.6">' +
        '<li>Click <strong>Add OmniBot</strong> and invite the bot (Manage Server required).</li>' +
        '<li>In Discord run:<br><code>/advertise publish</code><br><code>!advertise publish</code><br><code>omni advertise publish</code></li>' +
        '<li>Choose a <strong>category</strong> and optional description. Omni fills name, icon, and member count.</li>' +
        '<li>Refresh this page to see your server under that category.</li>' +
        '</ol>' +
        '<div class="row" style="margin-top:1rem;flex-wrap:wrap;gap:.5rem">' +
        '<a class="btn" href="' +
        escapeAttr(inviteBot) +
        '" target="_blank" rel="noopener">Add OmniBot</a>' +
        '<button class="btn ghost" id="btnAdvertiseHideAdd">Close</button></div>' +
        '<p class="status" style="margin-top:.75rem">Remove later with <code>/advertise unpublish</code>.</p></div>';
    }

    return (
      '<div class="center"><div style="width:min(900px,100%)">' +
      '<div class="card"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem">' +
      '<div><h2 style="margin:0">Advertise</h2><p class="help" style="margin:.25rem 0 0">Discover OmniBot communities by category.</p></div>' +
      '<div class="row" style="gap:.5rem;flex-wrap:wrap">' +
      '<button class="btn" id="btnAdvertiseAdd">Add your server</button>' +
      '<button class="btn ghost" id="btnAdvertiseBack">Back</button></div></div>' +
      '<div class="row" style="margin-top:1rem;gap:.75rem;flex-wrap:wrap">' +
      '<div class="field" style="flex:1;min-width:160px;margin:0"><label>Category</label><select id="advertiseCategory">' +
      catOpts +
      '</select></div>' +
      '<div class="field" style="flex:2;min-width:180px;margin:0"><label>Search</label><input type="search" id="advertiseSearch" value="' +
      escapeAttr(state.advertiseSearch || '') +
      '" placeholder="Search servers…"/></div>' +
      '<div style="align-self:flex-end"><button class="btn ghost" id="btnAdvertiseRefresh">Refresh</button></div></div>' +
      '<p class="status" style="margin-top:.5rem">' +
      (state.advertiseMeta && state.advertiseMeta.total != null
        ? state.advertiseMeta.total
        : state.advertiseDirectory.length) +
      ' server(s) listed</p></div>' +
      addPanel +
      body +
      '</div></div>'
    );
  }

  renderLogin = function () {
    var html = origRenderLogin();
    if (html.indexOf('btnAdvertise') !== -1) return html;
    html = html.replace(
      'or appeal a punishment',
      'appeal a punishment, or discover communities'
    );
    html = html.replace(
      'id="btnAppealPunishment" style="width:100%"',
      'id="btnAppealPunishment" style="width:100%;margin-bottom:.75rem"'
    );
    html = html.replace(
      '</button><p class="status" style="margin-top:1rem">API:',
      '</button><button class="btn ghost" id="btnAdvertise" style="width:100%">Advertise</button><p class="status" style="margin-top:1rem">API:'
    );
    return html;
  };

  render = function () {
    var root = document.getElementById('app');
    if (!root) return;
    if (state.mode === 'advertise') {
      root.innerHTML = renderAdvertise();
      bind();
      return;
    }
    origRender();
  };

  bind = function () {
    origBind();
    var root = document.getElementById('app');
    if (!root) return;
    var btn = root.querySelector('#btnAdvertise');
    if (btn) {
      btn.addEventListener('click', async function () {
        localStorage.setItem(INTENT_KEY, 'advertise');
        state.mode = 'advertise';
        state.advertiseShowAdd = false;
        await loadAdvertiseDirectory();
        render();
      });
    }
    var back = root.querySelector('#btnAdvertiseBack');
    if (back) {
      back.addEventListener('click', function () {
        localStorage.removeItem(INTENT_KEY);
        state.mode = 'dashboard';
        state.advertiseShowAdd = false;
        render();
      });
    }
    var add = root.querySelector('#btnAdvertiseAdd');
    if (add) {
      add.addEventListener('click', function () {
        state.advertiseShowAdd = true;
        render();
      });
    }
    var hide = root.querySelector('#btnAdvertiseHideAdd');
    if (hide) {
      hide.addEventListener('click', function () {
        state.advertiseShowAdd = false;
        render();
      });
    }
    var cat = root.querySelector('#advertiseCategory');
    if (cat) {
      cat.addEventListener('change', async function () {
        state.advertiseCategory = cat.value || 'all';
        await loadAdvertiseDirectory();
        render();
      });
    }
    var search = root.querySelector('#advertiseSearch');
    if (search) {
      search.addEventListener('keydown', async function (e) {
        if (e.key === 'Enter') {
          state.advertiseSearch = search.value || '';
          await loadAdvertiseDirectory();
          render();
        }
      });
    }
    var refresh = root.querySelector('#btnAdvertiseRefresh');
    if (refresh) {
      refresh.addEventListener('click', async function () {
        var s = document.getElementById('advertiseSearch');
        if (s) state.advertiseSearch = s.value || '';
        await loadAdvertiseDirectory();
        render();
      });
    }
  };

  var intent = localStorage.getItem(INTENT_KEY);
  if (intent === 'advertise') {
    state.mode = 'advertise';
    loadAdvertiseDirectory().then(function () {
      render();
    });
  }
})();
