(function () {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');

  function applyTheme(theme) {
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
      if (icon) icon.textContent = '☀️';
    } else {
      root.removeAttribute('data-theme');
      if (icon) icon.textContent = '🌙';
    }
    // Beri tahu modul lain agar chart yang sudah dirender bisa diwarnai ulang
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  const saved = localStorage.getItem('kimigold-theme') || 'dark';
  applyTheme(saved);

  toggle?.addEventListener('click', () => {
    const isLight = root.getAttribute('data-theme') === 'light';
    const next = isLight ? 'dark' : 'light';
    localStorage.setItem('kimigold-theme', next);
    applyTheme(next);
  });
})();
