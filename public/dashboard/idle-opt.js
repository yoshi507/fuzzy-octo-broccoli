/* Clears legacy dashboard 30s sync timer if present */
(function () {
  try {
    if (window.__omnibotSyncTimer) {
      clearInterval(window.__omnibotSyncTimer);
      window.__omnibotSyncTimer = null;
    }
  } catch (e) {}
})();
