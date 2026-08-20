(async function () {
  const parts = Array.from({ length: 20 }, (_, i) => '/assets/b' + i);
  const b64 = (
    await Promise.all(
      parts.map(async (p) => {
        const r = await fetch(p);
        if (!r.ok) throw new Error('Failed to load ' + p);
        return r.text();
      })
    )
  ).join('');
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bin]).stream().pipeThrough(ds);
  const text = await new Response(stream).text();
  const blob = new Blob([text], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  await import(url);
})().catch((err) => {
  console.error(err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<div style="font-family:system-ui;padding:2rem;background:#0f1117;color:#e8eaed"><h1>Dashboard failed to load</h1><pre>' +
      String(err && err.message ? err.message : err) +
      '</pre></div>';
  }
});
