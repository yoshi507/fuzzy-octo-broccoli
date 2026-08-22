(function () {
  if (typeof window === 'undefined') return;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function renderChatLog() {
    var log = state.advisorChat || [];
    if (!log.length) {
      return '<p class="help">Ask things like: <em>“Set up this new server for community growth”</em> or <em>“Apply those recommendations”</em>.</p>';
    }
    return log.map(function (m) {
      var who = m.role === 'user' ? 'You' : 'Omni Advisor';
      return '<div style="margin:.55rem 0;padding:.65rem .75rem;border-radius:10px;border:1px solid var(--border);' +
        (m.role === 'user' ? 'background:rgba(88,101,242,.08)' : '') + '">' +
        '<strong style="font-size:.8rem">' + escapeHtml(who) + '</strong>' +
        '<div style="margin-top:.35rem;white-space:pre-wrap">' + escapeHtml(m.content) + '</div></div>';
    }).join('');
  }

  function renderGrowthAdvisor() {
    var plan = state.advisorPlan;
    var html =
      '<div class="card" style="margin-top:1.25rem">' +
      '<div class="card-h"><h2>Server Growth Advisor</h2>' +
      '<p class="help">Talk to the advisor to analyse your server, apply changes, or fully set up a new community. Uses the shared daily AI allowance.</p></div>' +
      '<div class="card-b">' +
      '<div class="row" style="gap:.5rem;flex-wrap:wrap">' +
      '<button type="button" class="btn" id="btnAdvisorAnalyze">Run analysis</button>' +
      '</div>' +
      '<p class="status" id="advisorStatus" style="margin-top:.75rem"></p>';

    if (plan && plan.plan) {
      var p = plan.plan;
      if (p.summary) {
        html += '<p style="margin-top:1rem"><strong>Summary</strong><br>' + escapeHtml(p.summary) + '</p>';
      }
      if (Array.isArray(p.strengths) && p.strengths.length) {
        html += '<p style="margin-top:.75rem"><strong>Strengths</strong></p><ul class="status" style="padding-left:1.1rem">' +
          p.strengths.map(function (s) { return '<li>' + escapeHtml(String(s)) + '</li>'; }).join('') + '</ul>';
      }
      if (Array.isArray(p.weaknesses) && p.weaknesses.length) {
        html += '<p style="margin-top:.75rem"><strong>Gaps</strong></p><ul class="status" style="padding-left:1.1rem">' +
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
          html += '<div class="row" style="margin-top:.5rem;gap:.5rem;flex-wrap:wrap">' +
            '<button type="button" class="btn" id="btnAdvisorExecAll">Apply all safe changes</button>' +
            '</div>';
        }
      }
      if (plan.remaining != null) {
        html += '<p class="status" style="margin-top:1rem">AI requests left today: <strong>' +
          escapeHtml(String(plan.remaining)) + '/' + escapeHtml(String(plan.limit || 20)) + '</strong></p>';
      }
    }

    html +=
      '<h3 style="margin:1.25rem 0 .5rem;font-size:1rem">Talk to the advisor</h3>' +
      '<div id="advisorChatLog" style="max-height:280px;overflow:auto;margin-bottom:.65rem">' +
      renderChatLog() +
      '</div>' +
      '<div class="row" style="gap:.5rem;align-items:flex-start;flex-wrap:wrap">' +
      '<textarea id="advisorChatInput" rows="2" style="flex:1;min-width:220px" placeholder="e.g. Set up this new server for a gaming community, or: apply all recommendations"></textarea>' +
      '<button type="button" class="btn" id="btnAdvisorChat">Send</button>' +
      '</div>' +
      '<p class="help" style="margin-top:.5rem">Examples: “Apply the recommendations”, “Set up roles and channels for a support server”, “Enable dead chat and leveling”.</p>' +
      '</div></div>';
    return html;
  }

  async function sendAdvisorChat() {
    var input = document.getElementById('advisorChatInput');
    var st = document.getElementById('advisorStatus');
    if (!input || !state.guild) return;
    var text = String(input.value || '').trim();
    if (!text) return;

    if (!state.advisorChat) state.advisorChat = [];
    state.advisorChat.push({ role: 'user', content: text });
    input.value = '';
    if (st) st.textContent = 'Thinking…';

    try {
      var body = {
        message: text,
        history: state.advisorChat.slice(-10),
        lastPlan: state.advisorPlan && state.advisorPlan.plan
          ? state.advisorPlan.plan
          : null
      };
      var data = await api(
        '/guilds/' + encodeURIComponent(state.guild.id) + '/advisor/chat',
        { method: 'POST', body: JSON.stringify(body) }
      );
      state.advisorChat.push({
        role: 'assistant',
        content: data.reply || 'Done.'
      });
      if (data.plan) {
        state.advisorPlan = {
          plan: data.plan,
          remaining: data.remaining,
          limit: data.limit
        };
      } else if (data.remaining != null && state.advisorPlan) {
        state.advisorPlan.remaining = data.remaining;
      }
      if (typeof toast === 'function') {
        if (data.results) {
          var ok = (data.results || []).filter(function (r) { return r.ok; }).length;
          toast('Advisor applied ' + ok + ' change(s)', ok ? 'ok' : 'err');
        }
      }
      try {
        if (data.results && typeof loadGuildData === 'function') {
          await loadGuildData(state.guild);
        }
      } catch (e2) {}
      if (typeof switchSection === 'function') switchSection('ai');
      else if (typeof render === 'function') render();
    } catch (e) {
      state.advisorChat.push({
        role: 'assistant',
        content: e.message || 'Request failed'
      });
      if (st) st.textContent = e.message || 'Chat failed';
      if (typeof toast === 'function') toast(e.message || 'Chat failed', 'err');
      if (typeof switchSection === 'function') switchSection('ai');
    } finally {
      if (st && st.textContent === 'Thinking…') st.textContent = '';
    }
  }

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

          var analyzeBtn = document.getElementById('btnAdvisorAnalyze');
          if (analyzeBtn && !analyzeBtn._advisorBound) {
            analyzeBtn._advisorBound = true;
            analyzeBtn.addEventListener('click', async function () {
              var st = document.getElementById('advisorStatus');
              if (st) st.textContent = 'Analysing server…';
              analyzeBtn.disabled = true;
              try {
                var data = await api(
                  '/guilds/' + encodeURIComponent(state.guild.id) + '/advisor/analyze',
                  { method: 'POST', body: '{}' }
                );
                state.advisorPlan = data;
                if (st) st.textContent = 'Analysis complete — ask the advisor to apply changes, or use the buttons.';
                if (typeof switchSection === 'function') switchSection('ai');
              } catch (e) {
                if (st) st.textContent = e.message || 'Analysis failed';
                if (typeof toast === 'function') toast(e.message || 'Analysis failed', 'err');
              } finally {
                analyzeBtn.disabled = false;
              }
            });
          }

          document.querySelectorAll('.btnAdvisorExec').forEach(function (btn) {
            if (btn._advisorBound) return;
            btn._advisorBound = true;
            btn.addEventListener('click', async function () {
              var idx = Number(btn.getAttribute('data-idx'));
              var rec =
                state.advisorPlan &&
                state.advisorPlan.plan &&
                state.advisorPlan.plan.recommendations
                  ? state.advisorPlan.plan.recommendations[idx]
                  : null;
              if (!rec || !rec.action) return;
              btn.disabled = true;
              try {
                var data = await api(
                  '/guilds/' + encodeURIComponent(state.guild.id) + '/advisor/execute',
                  {
                    method: 'POST',
                    body: JSON.stringify({ actions: [rec.action] })
                  }
                );
                var ok = data.results && data.results[0] && data.results[0].ok;
                if (typeof toast === 'function') {
                  toast(ok ? 'Change applied' : (data.results && data.results[0] && data.results[0].error) || 'Failed', ok ? 'ok' : 'err');
                }
                try { if (typeof loadGuildData === 'function') await loadGuildData(state.guild); } catch (e2) {}
                if (typeof switchSection === 'function') switchSection('ai');
              } catch (e) {
                if (typeof toast === 'function') toast(e.message || 'Execute failed', 'err');
              } finally {
                btn.disabled = false;
              }
            });
          });

          var execAll = document.getElementById('btnAdvisorExecAll');
          if (execAll && !execAll._advisorBound) {
            execAll._advisorBound = true;
            execAll.addEventListener('click', async function () {
              var recs =
                state.advisorPlan && state.advisorPlan.plan
                  ? (state.advisorPlan.plan.recommendations || []).filter(function (r) {
                      return r.action && r.action.type;
                    })
                  : [];
              if (!recs.length) return;
              execAll.disabled = true;
              try {
                var data = await api(
                  '/guilds/' + encodeURIComponent(state.guild.id) + '/advisor/execute',
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      actions: recs.map(function (r) { return r.action; })
                    })
                  }
                );
                var ok = (data.results || []).filter(function (r) { return r.ok; }).length;
                if (typeof toast === 'function') {
                  toast('Applied ' + ok + ' of ' + recs.length + ' change(s)', ok ? 'ok' : 'err');
                }
                try { if (typeof loadGuildData === 'function') await loadGuildData(state.guild); } catch (e2) {}
                if (typeof switchSection === 'function') switchSection('ai');
              } catch (e) {
                if (typeof toast === 'function') toast(e.message || 'Execute failed', 'err');
              } finally {
                execAll.disabled = false;
              }
            });
          }

          var chatBtn = document.getElementById('btnAdvisorChat');
          if (chatBtn && !chatBtn._advisorBound) {
            chatBtn._advisorBound = true;
            chatBtn.addEventListener('click', function () {
              sendAdvisorChat();
            });
          }
          var chatInput = document.getElementById('advisorChatInput');
          if (chatInput && !chatInput._advisorBound) {
            chatInput._advisorBound = true;
            chatInput.addEventListener('keydown', function (ev) {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                sendAdvisorChat();
              }
            });
          }
        };
      }
    }, 0);
  });
})();
