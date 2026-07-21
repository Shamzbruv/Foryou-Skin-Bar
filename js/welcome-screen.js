(function () {
  const screen = document.getElementById('welcomeScreen');
  if (!screen) return;

  const STORAGE_KEY = 'foryou_welcome_last_seen';
  const SHOW_AGAIN_AFTER_MS = 6 * 60 * 60 * 1000;
  const VISIBLE_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1200 : 4200;
  const FADE_MS = 800;

  function navigationType() {
    const entry = performance.getEntriesByType?.('navigation')?.[0];
    return entry?.type || (performance.navigation?.type === 1 ? 'reload' : 'navigate');
  }

  function shouldShow() {
    const lastSeen = Number(localStorage.getItem(STORAGE_KEY) || 0);
    const stale = !lastSeen || Date.now() - lastSeen > SHOW_AGAIN_AFTER_MS;
    return navigationType() === 'reload' || stale;
  }

  function closeWelcome() {
    screen.classList.add('is-leaving');
    document.body.classList.remove('welcome-screen-active');
    window.setTimeout(() => {
      screen.classList.remove('is-visible', 'is-leaving');
      screen.hidden = true;
    }, FADE_MS);
  }

  if (!shouldShow()) {
    screen.remove();
    return;
  }

  localStorage.setItem(STORAGE_KEY, String(Date.now()));
  screen.hidden = false;
  document.body.classList.add('welcome-screen-active');

  requestAnimationFrame(() => {
    screen.classList.add('is-visible');
  });

  const autoCloseTimer = window.setTimeout(closeWelcome, VISIBLE_MS);
  document.getElementById('welcomeSkipBtn')?.addEventListener('click', () => {
    window.clearTimeout(autoCloseTimer);
    closeWelcome();
  });
  screen.addEventListener('click', (event) => {
    if (event.target === screen) {
      window.clearTimeout(autoCloseTimer);
      closeWelcome();
    }
  });
})();
