const API_BASES = Object.freeze({
  test: String(process.env.SONARA_API_TEST || "https://sonara-pack-beta-1.onrender.com").replace(/\/+$/, ""),
  main: String(process.env.SONARA_API_MAIN || "https://sonara-pack-beta.onrender.com").replace(/\/+$/, ""),
  mainBackup: String(process.env.SONARA_API_MAIN_BACKUP || "https://api--sonara-pack-main-backup--xm8lv9y66wnw.code.run").replace(/\/+$/, "")
});

function headerValue(headers = {}, name) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] || "") : "";
}

function hostFromEvent(event = {}) {
  return headerValue(event.headers, "x-forwarded-host") || headerValue(event.headers, "host") || "";
}

function environmentFromEvent(event = {}) {
  const host = hostFromEvent(event).toLowerCase().split(":")[0];
  if (host === "sonarapack.com" || host === "www.sonarapack.com") return "main";
  return "test";
}

function pageOrigin(event = {}) {
  const host = hostFromEvent(event) || "sonarapack.com";
  const proto = headerValue(event.headers, "x-forwarded-proto") || "https";
  return `${proto.split(",")[0]}://${host.split(",")[0]}`.replace(/\/+$/, "");
}

function apiCandidates(environment) {
  return environment === "main"
    ? [API_BASES.main, API_BASES.mainBackup].filter(Boolean)
    : [API_BASES.test].filter(Boolean);
}

async function fetchJson(event, pathname) {
  const environment = environmentFromEvent(event);
  const errors = [];

  for (const base of apiCandidates(environment)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${base}${pathname}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || `API ${response.status}`);
        error.statusCode = response.status;
        throw error;
      }
      return { data, apiBase: base, environment };
    } catch (error) {
      errors.push(error);
      if (Number(error?.statusCode) === 404) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw errors.at(-1) || new Error("API Sonara indisponible.");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function categoryLabel(value = "") {
  const category = String(value || "").trim().replace(/[_-]+/g, " ");
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : "Sonara";
}

function countLabel(count) {
  return Number(count) === 1 ? "1 titre" : `${Number(count) || 0} titres`;
}

function onboardingHref(destination = "") {
  const safeDestination = String(destination || "").trim();
  return `/index.html?language=choose&returnTo=${encodeURIComponent(safeDestination)}`;
}

function audioMarkup(track = {}) {
  if (!track.previewAudioUrl) return "";
  const previewDuration = Math.min(30, Math.max(1, Number(track.previewDuration || 30)));
  return `<div class="public-catalog-audio-row" data-public-preview-player>
    <button class="public-catalog-preview-play" type="button" data-preview-toggle aria-label="Aperçu audio"></button>
    <div class="public-catalog-preview-body">
      <strong data-user-content>${escapeHtml(track.title || "Track Sonara")}</strong>
      <div class="public-catalog-preview-progress" data-preview-progress role="slider" tabindex="0" aria-label="Aperçu audio" aria-valuemin="0" aria-valuemax="${Math.round(previewDuration)}" aria-valuenow="0">
        <span class="public-catalog-preview-progress-fill" data-preview-progress-fill></span>
        <span class="public-catalog-preview-progress-thumb" data-preview-progress-thumb></span>
      </div>
      <div class="public-catalog-preview-time"><span data-preview-current>0:00</span><span data-preview-total>0:${String(Math.round(previewDuration)).padStart(2, "0")}</span></div>
    </div>
    <audio class="public-catalog-preview-audio" preload="metadata" src="${escapeHtml(track.previewAudioUrl)}" data-public-preview data-preview-start="${Math.max(0, Number(track.previewStart || 0))}" data-preview-duration="${previewDuration}"></audio>
  </div>`;
}

function sharedHead({ title, description, canonical, image, ogType, robots, structuredData }) {
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/assets/image/logo-sonara-pack.PNG" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/app/css/catalog/public-catalog.css?v=organic-visibility-v3-player-links">
  <link rel="stylesheet" href="/app/css/core/i18n.css">
  <script type="application/ld+json">${jsonForHtml(structuredData)}</script>`;
}

function shell({ event, apiBase, head, markup, type }) {
  const origin = pageOrigin(event);
  return `<!DOCTYPE html>
<html lang="fr" translate="yes">
<head>${head}</head>
<body class="public-catalog-page" data-public-catalog-type="${escapeHtml(type)}" data-public-catalog-load="false">
  <main class="public-catalog-shell">
    <a class="public-catalog-brand" href="/home.html"><img src="/assets/image/logo-sonara-pack.PNG" alt=""><span>Sonara Pack</span></a>
    <section data-public-catalog-root>${markup}</section>
  </main>
  <script>window.SONARA_PUBLIC_API_URL=${jsonForHtml(apiBase)};window.SONARA_PUBLIC_ORIGIN=${jsonForHtml(origin)};</script>
  <script src="/app/js/growth/organic-attribution.js?v=organic-acquisition-signup-fix-v1"></script>
  <script src="/app/js/catalog/public-catalog.js?v=organic-visibility-v5-return-tunnel"></script>
  <script src="/app/js/core/i18n.js?v=organic-visibility-v1" defer></script>
</body>
</html>`;
}

function renderPackPage(event, apiBase, pack) {
  const origin = pageOrigin(event);
  const canonical = `${origin}/catalog/packs/${encodeURIComponent(pack.id)}`;
  const title = `${pack.title} - ${pack.artist} | Sonara Pack`;
  const description = `Découvrez ${pack.title} par ${pack.artist} sur Sonara Pack.`.slice(0, 160);
  const robots = environmentFromEvent(event) === "main" ? "index, follow" : "noindex, nofollow";
  const category = categoryLabel(pack.category);
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
  const previews = tracks.filter((track) => track.previewAudioUrl).slice(0, 6).map(audioMarkup).join("") || "<p>Aucun aperçu audio disponible.</p>";

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: pack.title,
    byArtist: { "@type": "MusicGroup", name: pack.artist },
    genre: pack.categories || [],
    numTracks: Number(pack.trackCount || 0),
    image: pack.coverUrl || undefined,
    url: canonical
  };

  const markup = `<article class="public-catalog-card">
    <div><img class="public-catalog-cover" src="${escapeHtml(pack.coverUrl || "")}" alt="${escapeHtml(pack.title)}" data-user-content></div>
    <div>
      <p class="public-catalog-eyebrow">Catalogue public Sonara</p>
      <h1 class="public-catalog-title" data-user-content>${escapeHtml(pack.title)}</h1>
      <p class="public-catalog-artist" data-user-content>${escapeHtml(pack.artist)}</p>
      <div class="public-catalog-meta"><span>Catégorie · <b data-user-content>${escapeHtml(category)}</b></span><span>Nombre de titres · ${escapeHtml(countLabel(pack.trackCount))}</span></div>
      <section class="public-catalog-section"><h2>Aperçu audio</h2><div class="public-catalog-audio-list">${previews}</div></section>
      <section class="public-catalog-section public-catalog-license"><h2>Licence</h2><p>${escapeHtml(pack.license?.name || "Licence standard Sonara")}</p></section>
      <div class="public-catalog-actions"><a class="public-catalog-action primary" href="${escapeHtml(onboardingHref(`/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}`))}">Découvrir sur Sonara Pack</a><a class="public-catalog-action" href="/home.html">Retour au catalogue</a></div>
    </div>
  </article>`;

  return shell({
    event,
    apiBase,
    type: "pack",
    head: sharedHead({ title, description, canonical, image: pack.coverUrl, ogType: "music.album", robots, structuredData }),
    markup
  });
}

function renderTrackPage(event, apiBase, pack, track) {
  const origin = pageOrigin(event);
  const canonical = `${origin}/catalog/tracks/${encodeURIComponent(pack.id)}/${encodeURIComponent(track.id)}`;
  const title = `${track.title} - ${track.artist} | Sonara Pack`;
  const description = `Écoutez un aperçu de ${track.title} par ${track.artist} sur Sonara Pack.`.slice(0, 160);
  const robots = environmentFromEvent(event) === "main" ? "index, follow" : "noindex, nofollow";
  const category = categoryLabel(pack.category);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: track.title,
    byArtist: { "@type": "MusicGroup", name: track.artist },
    inAlbum: pack.title ? { "@type": "MusicAlbum", name: pack.title } : undefined,
    image: track.coverUrl || undefined,
    url: canonical
  };

  const markup = `<article class="public-catalog-card">
    <div><img class="public-catalog-cover" src="${escapeHtml(track.coverUrl || "")}" alt="${escapeHtml(track.title)}" data-user-content></div>
    <div>
      <p class="public-catalog-eyebrow">Publié sur Sonara Pack</p>
      <h1 class="public-catalog-title" data-user-content>${escapeHtml(track.title)}</h1>
      <p class="public-catalog-artist" data-user-content>${escapeHtml(track.artist)}</p>
      <div class="public-catalog-meta"><span>Catégorie · <b data-user-content>${escapeHtml(category)}</b></span><span>Pack · <b data-user-content>${escapeHtml(pack.title || "Sonara Pack")}</b></span></div>
      <section class="public-catalog-section"><h2>Aperçu audio</h2><div class="public-catalog-audio-list">${audioMarkup(track) || "<p>Aucun aperçu audio disponible.</p>"}</div></section>
      <div class="public-catalog-actions"><a class="public-catalog-action primary" href="${escapeHtml(onboardingHref(`/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}&trackId=${encodeURIComponent(track.id)}`))}">Ouvrir le pack complet</a><a class="public-catalog-action" href="/home.html">Retour au catalogue</a></div>
    </div>
  </article>`;

  return shell({
    event,
    apiBase,
    type: "track",
    head: sharedHead({ title, description, canonical, image: track.coverUrl, ogType: "music.song", robots, structuredData }),
    markup
  });
}

function htmlResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "X-Content-Type-Options": "nosniff"
    },
    body
  };
}

module.exports = {
  environmentFromEvent,
  pageOrigin,
  fetchJson,
  renderPackPage,
  renderTrackPage,
  htmlResponse,
  escapeHtml
};
