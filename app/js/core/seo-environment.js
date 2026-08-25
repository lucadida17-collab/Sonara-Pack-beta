(() => {
  const host = String(window.location.hostname || '').toLowerCase();
  const isMain = host === 'sonarapack.com' || host === 'www.sonarapack.com';
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement('meta');
    robots.name = 'robots';
    document.head.appendChild(robots);
  }
  robots.content = isMain ? 'index, follow' : 'noindex, nofollow';
})();
