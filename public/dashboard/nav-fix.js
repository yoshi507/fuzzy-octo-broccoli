/* Nav fix — loaded last. Overrides section switching to be fail-safe. */
(function () {
  function title(id) {
    if (typeof sectionTitle === 'function') return sectionTitle(id);
    return id || 'overview';
  }

  function safeRenderSection(id) {
    state.section = id || 'overview';
    try {
      if (typeof renderSection === 'function') return renderSection();
    } catch (err) {
      console.error('[nav-fix] renderSection', id, err);
      return (
        '<div class="card"><h2>' +
        (typeof escapeHtml === 'function' ? escapeHtml(title(id)) : title(id)) +
        '</h2><p class="help" style="color:var(--err)">Failed to render: ' +
        (typeof escapeHtml === 'function'
          ? escapeHtml(err && err.message ? err.message : String(err))
          : String(err)) +
        '</p></div>'
      );
    }
    return '<div class="card"><h2>' + title(id) + '</h2><p class="help">Section unavailable.</p></div>';
  }

  function switchSectionFixed(id) {
    id = id || 'overview';
    state.section = id;
    var panel = document.getElementById('main-panel');
    var t = document.getElementById('section-title');
    if (t) t.textContent = title(id);
    document.querySelectorAll('[data-section]').forEach(function (btn) {
      if (btn.getAttribute('data-section') === id) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    var html = safeRenderSection(id);
    if (panel) {
      panel.innerHTML = html;
      if (typeof bindPanelControls === 'function') {
        try {
          bindPanelControls();
        } catch (e) {
          console.error(e);
        }
      }
    } else if (typeof render === 'function') {
      render();
    }
  }

  window.__omniSwitchSection = switchSectionFixed;
  window.switchSection = switchSectionFixed;

  if (!window.__omniNavDelegated2) {
    window.__omniNavDelegated2 = true;
    document.addEventListener(
      'click',
      function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest('[data-section]');
        if (!btn) return;
        if (!state || !state.token || !state.guild) return;
        if (state.mode && state.mode !== 'dashboard') return;
        var id = btn.getAttribute('data-section');
        if (!id) return;
        ev.preventDefault();
        ev.stopPropagation();
        switchSectionFixed(id);
      },
      true
    );
  }

  console.log('[OmniBot] nav-fix loaded');
})();
