/* Server Growth Advisor UI helpers (loaded after dashboard-app.js) */
(function () {
  if (typeof window === 'undefined') return;

  window.renderGrowthAdvisor = function renderGrowthAdvisor() {
    var plan = state.advisorPlan;
    var html = '<div class="card"><h2>Server Growth Advisor</h2>' +
      '<p class="help">Ask Omni to analyse roles, channels, members, and current OmniBot settings, then suggest improvements for member growth. Each analysis uses <strong>1</strong> AI request from this server\'s daily limit (20/day).</p>' +
      '<div class="row"><button type="button" class="btn" id="btnAdvisorAnalyze">Analyse server</button></div>' +
      '<p class="status" id="advisorStatus" style="margin-top:.75rem"></p>';

    if (!plan || !plan.plan) {
      html += '<p class="help" style="margin-top:1rem">No analysis yet. Click <strong>Analyse server</strong> to start.</p></div>';
      return html;
    }

    var p = plan.plan;
    html += '<div style="margin-top:1rem">';
    if (p.growthScore != null) {
      html += '<p class="status">Growth score: <strong>' + escapeHtml(String(p.growthScore)) + '/10</strong></p>';
    }
    if (p.summary) {
      html += '<p style="margin:.5rem 0 1rem;line-height:1.45">' + escapeHtml(String(p.summary)) + '</p>';
    }
    if (p.strengths && p.strengths.length) {
      html += '<p class="status"><strong>Strengths</strong></p><ul class="status" style="padding-left:1.1rem">' +
        p.strengths.map(function (s) { return '<li>' + escapeHtml(String(s)) + '</li>'; }).join('') + '</ul>';
    }
    if (p.weaknesses && p.weaknesses.length) {
      html += '<p class="status"><strong>Gaps</strong></p><ul class="status" style="padding-left:1.1rem">' +
        p.weaknesses.map(function (s) { return '<li>' + escapeHtml(String(s)) + '</li>'; }).join('') + '</ul>';
    }

    var recs = Array.isArray(p.recommendations) ? p.recommendations : [];
    if (recs.length) {
      html += '<h3 style="margin:1rem 0 .5rem;font-size:1rem">Recommendations</h3>';
      recs.forEach(function (r, i) {
        var hasAction = r.action && r.action.type;
        html += '<div style="border:1px solid var(--border);border-radius:10px;padding:.85rem;margin-bottom:.65rem">' +
          '<div style="display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap">' +
          '<strong>' + escapeHtml(r.title || ('Suggestion ' + (i + 1))) + '</strong>' +
          '<span class="pill">' + escapeHtml(String(r.impact || 'medium')) + '</span></div>' +
          '<p class="help" style="margin:.4rem 0">' + escapeHtml(r.detail || '') + '</p>';
        if (hasAction) {
          html += '<p class="status">Action: <code>' + escapeHtml(r.action.type) + '</code></p>' +
            '<button type="button" class="btn sm btnAdvisorExec" data-idx="' + i + '">Apply this change</button>';
        } else {
          html += '<p class="status">Advice only — no automatic change.</p>';
        }
        html += '</div>';
      });
      var actionable = recs.filter(function (r) { return r.action && r.action.type; });
      if (actionable.length) {
        html += '<div class="row" style="margin-top:.5rem"><button type="button" class="btn" id="btnAdvisorExecAll">Apply all safe changes</button></div>';
      }
    }
    if (plan.remaining != null) {
      html += '<p class="status" style="margin-top:1rem">AI requests left today: <strong>' +
        escapeHtml(String(plan.remaining)) + '/' + escapeHtml(String(plan.limit || 20)) + '</strong></p>';
    }
    html += '</div></div>';
    return html;
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      if (typeof renderSection !== 'function') return;
      var original = renderSection;
      renderSection = function () {
        var html = original();
        if ((state.section || 'overview') === 'ai' && html.indexOf('Server Growth Advisor') === -1) {
          html += renderGrowthAdvisor();
        }
        return html;
      };

      if (typeof bindPanelControls === 'function') {
        var originalBind = bindPanelControls;
        bindPanelControls = function () {
          originalBind();
          var root = document.getElementById('main-panel') || document.getElementById('app');
          if (!root) return;
          var analyzeBtn = root.querySelector('#btnAdvisorAnalyze');
          if (analyzeBtn && !analyzeBtn._advisorBound) {
            analyzeBtn._advisorBound = true;
            analyzeBtn.addEventListener('click', async function () {
              var st = document.getElementById('advisorStatus');
              try {
                analyzeBtn.disabled = true;
                if (st) st.textContent = 'Analysing server (uses 1 AI request)…';
                var data = await api('/guilds/' + encodeURIComponent(state.guild.id) + '/advisor/analyze', { method: 'POST', body: '{}' });
                state.advisorPlan = data;
                if (st) st.textContent = 'Analysis complete.';
                toast('Server analysis ready', 'ok');
                switchSection('ai');
              } catch (e) {
                if (st) st.textContent = e.message || 'Analysis failed';
                toast(e.message || 'Analysis failed', 'err');
              } finally {
                analyzeBtn.disabled = false;
              }
            });
          }
          root.querySelectorAll('.btnAdvisorExec').forEach(function (btn) {
            if (btn._advisorBound) return;
            btn._advisorBound = true;
            btn.addEventListener('click', async function () {
              var idx = Number(btn.getAttribute('data-idx'));
              var rec = state.advisorPlan && state.advisorPlan.plan && state.advisorPlan.plan.recommendations
                ? state.advisorPlan.plan.recommendations[idx]
                : null;
              if (!rec || !rec.action) return;
              try {
                btn.disabled = true;
                var data = await api('/guilds/' + encodeURIComponent(state.guild.id) + '/advisor/execute', {
                  method: 'POST',
                  body: JSON.stringify({ actions: [rec.action] })
                });
                var ok = (data.results || []).filter(function (r) { return r.ok; }).length;
                toast('Applied ' + ok + ' change(s)', ok ? 'ok' : 'err');
                try { await loadGuildData(state.guild); } catch (e2) {}
                switchSection('ai');
              } catch (e) {
                toast(e.message || 'Execute failed', 'err');
              } finally {
                btn.disabled = false;
              }
            });
          });
          var execAll = root.querySelector('#btnAdvisorExecAll');
          if (execAll && !execAll._advisorBound) {
            execAll._advisorBound = true;
            execAll.addEventListener('click', async function () {
              var recs = state.advisorPlan && state.advisorPlan.plan
                ? (state.advisorPlan.plan.recommendations || []).filter(function (r) { return r.action && r.action.type; })
                : [];
              if (!recs.length) return;
              try {
                execAll.disabled = true;
                var data = await api('/guilds/' + encodeURIComponent(state.guild.id) + '/advisor/execute', {
                  method: 'POST',
                  body: JSON.stringify({ actions: recs.map(function (r) { return r.action; }) })
                });
                var ok = (data.results || []).filter(function (r) { return r.ok; }).length;
                toast('Applied ' + ok + ' of ' + recs.length + ' change(s)', ok ? 'ok' : 'err');
                try { await loadGuildData(state.guild); } catch (e2) {}
                switchSection('ai');
              } catch (e) {
                toast(e.message || 'Execute failed', 'err');
              } finally {
                execAll.disabled = false;
              }
            });
          }
        };
      }
    }, 0);
  });
})();
