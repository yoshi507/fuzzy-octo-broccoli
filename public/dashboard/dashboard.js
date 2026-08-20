(async function () {
  async function load(src) {
    const r = await fetch(src + '?v=' + Date.now());
    if (!r.ok) throw new Error('Failed to load ' + src + ' (' + r.status + ')');
    return r.text();
  }
  try {
    const a = await load('/dashboard-core.js');
    const b = await load('/dashboard-app.js');
    (0, eval)(a + '\n' + b);
  } catch (err) {
    var app = document.getElementById('app');
    if (app) app.innerHTML = '<div class="center"><div class="card login-card"><h2>Dashboard failed to load</h2><p class="help">' +
      String(err && err.message ? err.message : err) + '</p><button class="btn" onclick="location.reload()">Retry</button></div></div>';
  }
})();
