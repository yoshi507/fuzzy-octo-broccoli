(async function () {
  async function load(src) {
    const r = await fetch(src + "?v=" + Date.now());
    if (!r.ok) throw new Error("Failed to load " + src + " (" + r.status + ")");
    return r.text();
  }
  try {
    const parts = await Promise.all([load("/dash-p0.js"), load("/dash-p1.js"), load("/dash-p2.js")]);
    (0, eval)(parts.join(""));
  } catch (err) {
    var app = document.getElementById("app");
    if (app) app.innerHTML = '<div class="center"><div class="card login-card"><h2>Dashboard failed to load</h2><p class="help">' +
      String(err && err.message ? err.message : err) + '</p><button class="btn" onclick="location.reload()">Retry</button></div></div>';
  }
})();
