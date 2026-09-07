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

function audioObject(track = {}) {
  if (!track.previewAudioUrl) return undefined;
  const duration = Math.min(30, Math.max(1, Number(track.previewDuration || 30)));
  return {
    "@type": "AudioObject",
    contentUrl: track.previewAudioUrl,
    encodingFormat: "audio/mpeg",
    duration: `PT${Math.round(duration)}S`
  };
}

function audioMarkup(track = {}) {
  if (!track.previewAudioUrl) return "";
  const previewDuration = Math.min(30, Math.max(1, Number(track.previewDuration || 30)));
  const title = escapeHtml(track.title || "Track Sonara");
  const linkedTitle = track.canonicalUrl
    ? `<a class="public-catalog-track-link" href="${escapeHtml(track.canonicalUrl)}" data-user-content>${title}</a>`
    : `<strong data-user-content>${title}</strong>`;
  return `<div class="public-catalog-audio-row" data-public-preview-player>
    <button class="public-catalog-preview-play" type="button" data-preview-toggle aria-label="Aperçu audio"></button>
    <div class="public-catalog-preview-body">
      ${linkedTitle}
      <div class="public-catalog-preview-progress" data-preview-progress role="slider" tabindex="0" aria-label="Aperçu audio" aria-valuemin="0" aria-valuemax="${Math.round(previewDuration)}" aria-valuenow="0">
        <span class="public-catalog-preview-progress-fill" data-preview-progress-fill></span>
        <span class="public-catalog-preview-progress-thumb" data-preview-progress-thumb></span>
      </div>
      <div class="public-catalog-preview-time"><span data-preview-current>0:00</span><span data-preview-total>0:${String(Math.round(previewDuration)).padStart(2, "0")}</span></div>
    </div>
    <audio class="public-catalog-preview-audio" preload="metadata" src="${escapeHtml(track.previewAudioUrl)}" data-public-preview data-preview-start="${Math.max(0, Number(track.previewStart || 0))}" data-preview-duration="${previewDuration}"></audio>
  </div>`;
}

function semanticLinksMarkup(data = {}) {
  const links = [];
  if (data.artist?.url) links.push(data.artist);
  for (const key of ["categories", "genres", "moods", "usages"]) {
    for (const item of Array.isArray(data[key]) ? data[key] : []) links.push(item);
  }
  const unique = new Map();
  for (const item of links) {
    if (!item?.url || !item?.label || unique.has(item.url)) continue;
    unique.set(item.url, item);
  }
  const selected = [...unique.values()].slice(0, 8);
  if (!selected.length) return "";
  return `<nav class="public-catalog-semantic-links" aria-label="Catalogue Sonara">${selected
    .map((item) => `<a href="${escapeHtml(item.url)}" data-user-content>${escapeHtml(item.label)}</a>`)
    .join("")}</nav>`;
}

function visibleSemanticMarkup(semantic = {}) {
  const values = Array.isArray(semantic.visibleTerms) ? semantic.visibleTerms.slice(0, 6) : [];
  if (!values.length && !semantic.description) return "";
  return `<section class="public-catalog-section public-catalog-semantic-context">
    ${semantic.description ? `<p data-user-content>${escapeHtml(semantic.description)}</p>` : ""}
    ${values.length ? `<div class="public-catalog-semantic-terms">${values.map((value) => `<span data-user-content>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
  </section>`;
}

function sharedHead({ title, description, canonical, image, imageAlt = "", ogType, robots, structuredData }) {
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta name="googlebot" content="${escapeHtml(robots)}">
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="Sonara Pack">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:alt" content="${escapeHtml(imageAlt || title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHtml(image)}"><meta name="twitter:image:alt" content="${escapeHtml(imageAlt || title)}">` : `<meta name="twitter:card" content="summary">`}
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/assets/image/logo-sonara-pack.PNG" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/app/css/catalog/public-catalog.css?v=organic-visibility-v4-semantic">
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
    <a class="public-catalog-brand" href="/home.html"><img src="/assets/image/logo-sonara-pack.PNG" alt="" width="44" height="44"><span>Sonara Pack</span></a>
    <section data-public-catalog-root>${markup}</section>
  </main>
  <script>window.SONARA_PUBLIC_API_URL=${jsonForHtml(apiBase)};window.SONARA_PUBLIC_ORIGIN=${jsonForHtml(origin)};</script>
  <script src="/app/js/growth/organic-attribution.js?v=organic-acquisition-internal-v2"></script>
  <script src="/app/js/catalog/public-catalog.js?v=organic-visibility-v6-semantic"></script>
  <script src="/app/js/core/i18n.js?v=organic-visibility-v1" defer></script>
</body>
</html>`;
}

function renderPackPage(event, apiBase, pack) {
  const origin = pageOrigin(event);
  const canonical = pack.canonicalUrl || `${origin}/catalog/packs/${encodeURIComponent(pack.id)}`;
  const title = pack.seo?.title || `${pack.title} - ${pack.artist} | Sonara Pack`;
  const description = pack.seo?.description || `Découvrez ${pack.title} par ${pack.artist} sur Sonara Pack.`.slice(0, 160);
  const robots = environmentFromEvent(event) === "main" ? "index, follow, max-image-preview:large" : "noindex, nofollow";
  const category = categoryLabel(pack.category);
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
  const previews = tracks.filter((track) => track.previewAudioUrl).slice(0, 6).map(audioMarkup).join("") || "<p>Aucun aperçu audio disponible.</p>";
  const imageAlt = pack.seo?.imageAlt || `${pack.title} by ${pack.artist} on Sonara Pack`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: pack.title,
    description,
    byArtist: { "@type": "MusicGroup", name: pack.artist },
    genre: (pack.semantic?.genres?.length ? pack.semantic.genres : pack.categories) || [],
    numTracks: Number(pack.trackCount || 0),
    image: pack.coverUrl || undefined,
    url: canonical,
    track: tracks.slice(0, 25).map((track) => ({
      "@type": "MusicRecording",
      name: track.title,
      byArtist: { "@type": "MusicGroup", name: track.artist || pack.artist },
      url: track.canonicalUrl || undefined,
      audio: audioObject(track)
    }))
  };

  const markup = `<article class="public-catalog-card">
    <div>
      <img class="public-catalog-cover" src="${escapeHtml(pack.coverUrl || "")}" alt="${escapeHtml(imageAlt)}" width="1000" height="1000" fetchpriority="high" data-user-content>
      ${pack.promoImageUrl ? `<img class="public-catalog-promo-image" src="${escapeHtml(pack.promoImageUrl)}" alt="${escapeHtml(`${pack.title} by ${pack.artist} – Sonara Pack visual`)}" loading="lazy" data-user-content>` : ""}
    </div>
    <div>
      <p class="public-catalog-eyebrow">Catalogue public Sonara</p>
      <h1 class="public-catalog-title" data-user-content>${escapeHtml(pack.title)}</h1>
      <p class="public-catalog-artist" data-user-content>${escapeHtml(pack.artist)}</p>
      <div class="public-catalog-meta"><span>Catégorie · <b data-user-content>${escapeHtml(category)}</b></span><span>Nombre de titres · ${escapeHtml(countLabel(pack.trackCount))}</span></div>
      ${semanticLinksMarkup(pack.seoLinks)}
      ${visibleSemanticMarkup(pack.semantic)}
      <section class="public-catalog-section"><h2>Aperçu audio</h2><div class="public-catalog-audio-list">${previews}</div></section>
      <section class="public-catalog-section public-catalog-license"><h2>Licence</h2><p>${escapeHtml(pack.license?.name || "Licence standard Sonara")}</p></section>
      <div class="public-catalog-actions"><a class="public-catalog-action primary" href="${escapeHtml(onboardingHref(`/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}`))}">Découvrir sur Sonara Pack</a><a class="public-catalog-action" href="/home.html">Retour au catalogue</a></div>
    </div>
  </article>`;

  return shell({
    event,
    apiBase,
    type: "pack",
    head: sharedHead({ title, description, canonical, image: pack.coverUrl, imageAlt, ogType: "music.album", robots, structuredData }),
    markup
  });
}

function renderTrackPage(event, apiBase, pack, track) {
  const origin = pageOrigin(event);
  const canonical = track.canonicalUrl || `${origin}/catalog/tracks/${encodeURIComponent(pack.id)}/${encodeURIComponent(track.id)}`;
  const title = track.seo?.title || `${track.title} - ${track.artist} | Sonara Pack`;
  const description = track.seo?.description || `Écoutez un aperçu de ${track.title} par ${track.artist} sur Sonara Pack.`.slice(0, 160);
  const robots = environmentFromEvent(event) === "main" ? "index, follow, max-image-preview:large" : "noindex, nofollow";
  const category = categoryLabel(pack.category);
  const imageAlt = track.seo?.imageAlt || `${track.title} by ${track.artist} on Sonara Pack`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: track.title,
    description,
    byArtist: { "@type": "MusicGroup", name: track.artist },
    genre: (track.semantic?.genres?.length ? track.semantic.genres : pack.categories) || [],
    inAlbum: pack.title ? { "@type": "MusicAlbum", name: pack.title, url: pack.canonicalUrl || undefined } : undefined,
    image: track.coverUrl || undefined,
    url: canonical,
    audio: audioObject(track)
  };

  const markup = `<article class="public-catalog-card">
    <div><img class="public-catalog-cover" src="${escapeHtml(track.coverUrl || "")}" alt="${escapeHtml(imageAlt)}" width="1000" height="1000" fetchpriority="high" data-user-content></div>
    <div>
      <p class="public-catalog-eyebrow">Publié sur Sonara Pack</p>
      <h1 class="public-catalog-title" data-user-content>${escapeHtml(track.title)}</h1>
      <p class="public-catalog-artist" data-user-content>${escapeHtml(track.artist)}</p>
      <div class="public-catalog-meta"><span>Catégorie · <b data-user-content>${escapeHtml(category)}</b></span><span>Pack · <a class="public-catalog-inline-link" href="${escapeHtml(pack.canonicalUrl || `/catalog/packs/${encodeURIComponent(pack.id)}`)}" data-user-content>${escapeHtml(pack.title || "Sonara Pack")}</a></span></div>
      ${semanticLinksMarkup(pack.seoLinks)}
      ${visibleSemanticMarkup(track.semantic)}
      <section class="public-catalog-section"><h2>Aperçu audio</h2><div class="public-catalog-audio-list">${audioMarkup(track) || "<p>Aucun aperçu audio disponible.</p>"}</div></section>
      <div class="public-catalog-actions"><a class="public-catalog-action primary" href="${escapeHtml(onboardingHref(`/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}&trackId=${encodeURIComponent(track.id)}`))}">Ouvrir le pack complet</a><a class="public-catalog-action" href="/home.html">Retour au catalogue</a></div>
    </div>
  </article>`;

  return shell({
    event,
    apiBase,
    type: "track",
    head: sharedHead({ title, description, canonical, image: track.coverUrl, imageAlt, ogType: "music.song", robots, structuredData }),
    markup
  });
}

function renderCollectionPage(event, apiBase, collection, packs, type = "facet") {
  const origin = pageOrigin(event);
  const canonical = collection.canonicalUrl || `${origin}${String(event.path || "")}`;
  const title = `${collection.label} | Sonara Pack`;
  const description = String(collection.description || `Explore ${collection.label} on Sonara Pack.`).slice(0, 180);
  const robots = environmentFromEvent(event) === "main" ? "index, follow, max-image-preview:large" : "noindex, nofollow";
  const rows = Array.isArray(packs) ? packs : [];
  const leadImage = type === "artist" ? (collection.avatarUrl || rows[0]?.coverUrl || "") : (rows[0]?.coverUrl || "");
  const imageAlt = `${collection.label} – Sonara Pack`;
  const itemList = rows.map((pack, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: pack.canonicalUrl,
    name: pack.title
  }));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": type === "artist" ? "ProfilePage" : "CollectionPage",
    name: collection.label,
    description,
    url: canonical,
    image: leadImage || undefined,
    mainEntity: { "@type": "ItemList", numberOfItems: itemList.length, itemListElement: itemList }
  };
  const cards = rows.map((pack) => `<article class="public-catalog-list-card">
    <a href="${escapeHtml(pack.canonicalUrl)}"><img src="${escapeHtml(pack.coverUrl || "")}" alt="${escapeHtml(pack.seo?.imageAlt || pack.title)}" width="1000" height="1000" loading="lazy" data-user-content></a>
    <div><h2><a href="${escapeHtml(pack.canonicalUrl)}" data-user-content>${escapeHtml(pack.title)}</a></h2><p data-user-content>${escapeHtml(pack.artist)}</p><p>${escapeHtml(pack.seo?.primaryPhrase || pack.semantic?.primaryPhrase || "")}</p></div>
  </article>`).join("");
  const markup = `<article class="public-catalog-collection">
    <p class="public-catalog-eyebrow">Catalogue public Sonara</p>
    <h1 class="public-catalog-title" data-user-content>${escapeHtml(collection.label)}</h1>
    <p class="public-catalog-collection-description" data-user-content>${escapeHtml(description)}</p>
    <p class="public-catalog-collection-count">${escapeHtml(countLabel(rows.length))}</p>
    <div class="public-catalog-list">${cards}</div>
    <div class="public-catalog-actions"><a class="public-catalog-action" href="/home.html">Retour au catalogue</a></div>
  </article>`;
  return shell({
    event,
    apiBase,
    type,
    head: sharedHead({ title, description, canonical, image: leadImage, imageAlt, ogType: "website", robots, structuredData }),
    markup
  });
}

function renderFacetPage(event, apiBase, facet, packs) {
  return renderCollectionPage(event, apiBase, facet, packs, "facet");
}

function renderArtistPage(event, apiBase, artist, packs) {
  return renderCollectionPage(event, apiBase, artist, packs, "artist");
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
  renderFacetPage,
  renderArtistPage,
  htmlResponse,
  escapeHtml
};
