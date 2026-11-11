/* Compare has no local account actions. Reflect only a Network-verified account in its navbar. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    try { if (localStorage.getItem('ov_sso_hint') === 'guest') return; } catch { /* no hint */ }
    const nav = window.OpenVibeNavbar;
    if (!nav || typeof nav.checkNetworkSession !== 'function') return;
    nav.checkNetworkSession().then(state => {
      if (!state || state.signedIn !== true) return;
      const username = typeof state.username === 'string' && state.username.length <= 100 ? state.username : null;
      nav.setUser(username ? { username } : { id: 'network-account' });
    }).catch(() => {});
  });
})();
