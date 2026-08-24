"use strict";

const shopPackRoot = document.querySelector("[data-artist-shop-pack]");
const shopPackType = String(document.body.dataset.shopPackType || "midi").toLowerCase();
const shopPackParams = new URLSearchParams(window.location.search);
const shopPackId = shopPackParams.get("id");
let shopPackData = null;
let shopPurchase = { type: "pack", resourceId: null };
const shopOwnedViewRequested = shopPackParams.get("library") === "1";
let shopOwnership = { ownsPack: false, resourceIds: new Set() };
let shopResourcePreviews = new Map();

const SHOP_LICENSE_PERMISSION_LABELS = {
  personalProjects: "Projets personnels",
  commercialProjects: "Projets commerciaux",
  monetization: "Monétisation",
  socialMedia: "Réseaux sociaux",
  videoFilm: "Vidéos et films",
  advertising: "Publicités",
  gamesApps: "Jeux et applications",
  podcasts: "Podcasts",
  liveStreaming: "Live et streaming",
  clientWork: "Travail client",
  soundEditing: "Modification dans un DAW",
  unlimitedProjects: "Projets illimités"
};

const SHOP_LICENSE_RESTRICTION_LABELS = {
  standaloneResale: "Revente isolée",
  redistribution: "Partage ou redistribution",
  musicPlatformUpload: "Upload musical autonome",
  contentIdRegistration: "Enregistrement Content ID",
  sublicensing: "Sous-licence",
  misleadingOwnership: "Fausse propriété"
};

function normalizeShopLicense(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: Number(source.version || 1),
    name: String(source.name || "Licence standard Sonara"),
    creditRequired: Boolean(source.creditRequired),
    permissions: Object.fromEntries(
      Object.keys(SHOP_LICENSE_PERMISSION_LABELS).map((key) => [key, source.permissions?.[key] !== false])
    ),
    restrictions: Object.fromEntries(
      Object.keys(SHOP_LICENSE_RESTRICTION_LABELS).map((key) => [key, source.restrictions?.[key] !== false])
    ),
    customPermissions: Array.isArray(source.customPermissions) ? source.customPermissions.filter(Boolean) : [],
    customRestrictions: Array.isArray(source.customRestrictions) ? source.customRestrictions.filter(Boolean) : [],
    customTerms: String(source.customTerms || "").trim()
  };
}

function shopLicenseItems(labels, states, customItems) {
  return [
    ...Object.entries(labels)
      .filter(([key]) => Boolean(states?.[key]))
      .map(([, label]) => shopT(label)),
    ...(Array.isArray(customItems) ? customItems : [])
  ];
}

function shopT(value) {
  return window.SonaraI18n?.t?.(value) || value;
}

function shopEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function shopFileUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("/uploads/")) return `${API_URL}${raw}`;
  if (raw.startsWith("uploads/")) return `${API_URL}/${raw}`;
  return `${API_URL}/uploads/${raw.replace(/^\/+/, "")}`;
}

function shopPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return shopT("Gratuit");
  if (["gratuit", "free"].includes(raw.toLowerCase())) return shopT("Gratuit");
  const number = Number(raw.replace("€", "").replace(",", ".").trim());
  return Number.isFinite(number) ? `${number.toFixed(2)}€` : raw;
}

function isFreeItem(item = {}) {
  return item.isFree === true || ["gratuit", "free"].includes(String(item.price || "").trim().toLowerCase());
}

function shopTypeLabel() {
  return shopPackType === "midi" ? "MIDI" : "Projets DAW";
}

function shopTypeIcon() {
  return shopPackType === "midi" ? "piano" : "panels-top-left";
}

function shopDawLabel(value) {
  const labels = {
    "fl-studio": "FL Studio",
    ableton: "Ableton Live",
    logic: "Logic Pro",
    reaper: "Reaper",
    cubase: "Cubase",
    "pro-tools": "Pro Tools",
    "studio-one": "Studio One",
    other: shopT("Autre")
  };
  const key = String(value || "").toLowerCase();
  return labels[key] || String(value || "DAW").replaceAll("-", " ");
}

function resourceCountLabel(count) {
  if (shopPackType === "midi") return `${count} MIDI`;
  return `${count} ${count > 1 ? shopT("Projets DAW") : shopT("Projet DAW")}`;
}

function isShopResourceOwned(resourceId) {
  return shopOwnership.ownsPack || shopOwnership.resourceIds.has(String(resourceId || ""));
}

function midiNoteName(value) {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const note = Math.max(0, Math.min(127, Number(value) || 0));
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

function isMidiBlackKey(value) {
  return [1, 3, 6, 8, 10].includes((Number(value) || 0) % 12);
}

function midiPreviewPanelId(resourceId) {
  const safeId = String(resourceId || "resource").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `artist-midi-preview-${safeId}`;
}

function midiWhitePitches(low, high) {
  const result = [];
  for (let pitch = low; pitch <= high; pitch += 1) {
    if (!isMidiBlackKey(pitch)) result.push(pitch);
  }
  return result;
}

function midiNaturalBounds(low, high) {
  let safeLow = Math.max(0, Math.min(127, Number(low) || 0));
  let safeHigh = Math.max(safeLow, Math.min(127, Number(high) || safeLow));
  while (safeLow > 0 && isMidiBlackKey(safeLow)) safeLow -= 1;
  while (safeHigh < 127 && isMidiBlackKey(safeHigh)) safeHigh += 1;
  return { low: safeLow, high: safeHigh };
}

function midiPitchY(pitch, whitePitches, whiteKeyHeight) {
  const value = Math.max(0, Math.min(127, Number(pitch) || 0));
  const whiteCount = whitePitches.length;
  const exactIndex = whitePitches.indexOf(value);
  if (exactIndex >= 0) {
    const top = (whiteCount - 1 - exactIndex) * whiteKeyHeight;
    return top + whiteKeyHeight / 2;
  }

  let lowerWhite = value - 1;
  while (lowerWhite >= 0 && isMidiBlackKey(lowerWhite)) lowerWhite -= 1;
  const lowerIndex = whitePitches.indexOf(lowerWhite);
  if (lowerIndex < 0) return whiteKeyHeight / 2;
  return (whiteCount - 1 - lowerIndex) * whiteKeyHeight;
}

function renderMidiPreview(preview = {}, zoomScale = null) {
  const notes = Array.isArray(preview.notes) ? preview.notes : [];
  if (!notes.length) {
    return `<div class="artist-store-preview-empty"><i data-lucide="piano"></i><span>${shopEscape(shopT("Aperçu indisponible"))}</span></div>`;
  }

  const visibleNotes = notes.map((note) => ({
    note: Math.max(0, Math.min(127, Number(note.note || 60))),
    start: Math.max(0, Number(note.start || 0)),
    duration: Math.max(1, Number(note.duration || 1)),
    velocity: Math.max(1, Math.min(127, Number(note.velocity || 80)))
  }));
  const ticksPerQuarter = Math.max(1, Number(preview.ticksPerQuarter || 480));
  const totalTicks = Math.max(
    ticksPerQuarter * 4,
    Number(preview.totalTicks || 0),
    ...visibleNotes.map((note) => note.start + note.duration)
  );
  const rawLow = Number.isFinite(Number(preview.lowestNote))
    ? Number(preview.lowestNote)
    : Math.min(...visibleNotes.map((note) => note.note));
  const rawHigh = Number.isFinite(Number(preview.highestNote))
    ? Number(preview.highestNote)
    : Math.max(...visibleNotes.map((note) => note.note));
  const bounds = midiNaturalBounds(Math.max(0, rawLow - 2), Math.min(127, rawHigh + 2));
  const whitePitches = midiWhitePitches(bounds.low, bounds.high);
  const whiteKeyHeight = 28;
  const rollHeight = Math.max(280, whitePitches.length * whiteKeyHeight);
  const headerHeight = window.matchMedia?.("(max-width: 767px)")?.matches ? 70 : 84;
  const availableHeight = Math.max(220, (window.innerHeight || 800) - headerHeight - 2);
  const fitScale = Math.max(.22, Math.min(1, availableHeight / rollHeight));
  const appliedScale = Math.max(.22, Math.min(1.8, Number.isFinite(Number(zoomScale)) ? Number(zoomScale) : fitScale));
  const scaledRollHeight = Math.max(1, rollHeight * appliedScale);
  const quarterCount = Math.max(4, totalTicks / ticksPerQuarter);
  const timelineWidth = Math.max(1280, Math.min(48000, Math.ceil(quarterCount * 76)));
  const noteHeight = Math.max(8, Math.min(15, whiteKeyHeight * .48));

  const whiteKeys = whitePitches.map((pitch, index) => {
    const top = (whitePitches.length - 1 - index) * whiteKeyHeight;
    const label = pitch % 12 === 0 ? midiNoteName(pitch) : "";
    return `<span class="artist-store-midi-white-key" style="top:${top}px;height:${whiteKeyHeight}px">${label ? `<b>${shopEscape(label)}</b>` : ""}</span>`;
  }).join("");

  const blackKeys = [];
  for (let pitch = bounds.low; pitch <= bounds.high; pitch += 1) {
    if (!isMidiBlackKey(pitch)) continue;
    const center = midiPitchY(pitch, whitePitches, whiteKeyHeight);
    blackKeys.push(`<span class="artist-store-midi-black-key" style="top:${(center - whiteKeyHeight * .29).toFixed(2)}px;height:${(whiteKeyHeight * .58).toFixed(2)}px"></span>`);
  }

  const horizontalGrid = Array.from({ length: whitePitches.length + 1 }, (_, index) => {
    const y = index * whiteKeyHeight;
    return `<line x1="0" y1="${y}" x2="${timelineWidth}" y2="${y}"></line>`;
  }).join("");

  const maxBeatLines = 520;
  const rawBeatCount = Math.max(1, Math.ceil(totalTicks / ticksPerQuarter));
  const beatStride = Math.max(1, Math.ceil(rawBeatCount / maxBeatLines));
  const verticalGrid = [];
  const barLabels = [];
  for (let beat = 0; beat <= rawBeatCount; beat += beatStride) {
    const tick = beat * ticksPerQuarter;
    const x = Math.min(timelineWidth, (tick / totalTicks) * timelineWidth);
    const isBar = beat % 4 === 0;
    verticalGrid.push(`<line class="${isBar ? "is-bar" : ""}" x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${rollHeight}"></line>`);
    if (isBar) barLabels.push(`<text x="${Math.min(timelineWidth - 10, x + 7).toFixed(2)}" y="17">${Math.floor(beat / 4) + 1}</text>`);
  }

  const rects = visibleNotes.map((note) => {
    const x = Math.max(0, Math.min(timelineWidth - 2, (note.start / totalTicks) * timelineWidth));
    const width = Math.max(5, Math.min(timelineWidth - x, (note.duration / totalTicks) * timelineWidth));
    const centerY = midiPitchY(note.note, whitePitches, whiteKeyHeight);
    const y = Math.max(1, Math.min(rollHeight - noteHeight - 1, centerY - noteHeight / 2));
    const opacity = Math.max(.58, Math.min(1, note.velocity / 127));
    return `<rect class="${isMidiBlackKey(note.note) ? "is-sharp" : ""}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${noteHeight.toFixed(2)}" rx="3" opacity="${opacity.toFixed(2)}"></rect>`;
  }).join("");

  return `<section class="artist-store-midi-preview-shell" role="dialog" aria-modal="true" aria-label="${shopEscape(shopT("Aperçu MIDI"))}">
    <header class="artist-store-midi-preview-header">
      <div>
        <small>SONARA ARTIST · MIDI</small>
        <strong>${shopEscape(shopT("Aperçu MIDI"))}</strong>
      </div>
      <span>${visibleNotes.length} ♪ · ${shopEscape(midiNoteName(rawLow))} → ${shopEscape(midiNoteName(rawHigh))}</span>
      <div class="artist-store-midi-preview-actions">
        <div class="artist-store-midi-zoom" role="group" aria-label="${shopEscape(shopT("Zoom de l’aperçu"))}">
          <button type="button" data-midi-zoom-out aria-label="${shopEscape(shopT("Dézoomer"))}" title="${shopEscape(shopT("Dézoomer"))}"><i data-lucide="minus"></i></button>
          <button type="button" class="artist-store-midi-zoom-fit" data-midi-zoom-fit data-fit-scale="${fitScale.toFixed(4)}" aria-label="${shopEscape(shopT("Adapter à l’écran"))}" title="${shopEscape(shopT("Adapter à l’écran"))}"><span data-midi-zoom-value>${Math.round(appliedScale * 100)}%</span></button>
          <button type="button" data-midi-zoom-in aria-label="${shopEscape(shopT("Zoomer"))}" title="${shopEscape(shopT("Zoomer"))}"><i data-lucide="plus"></i></button>
        </div>
        <button type="button" class="artist-store-midi-preview-close" data-midi-preview-close aria-label="${shopEscape(shopT("Fermer"))}"><i data-lucide="chevron-down"></i></button>
      </div>
    </header>
    <div class="artist-store-midi-scroll" data-midi-preview-scroll>
      <div class="artist-store-midi-stage" data-midi-zoom-stage data-base-height="${rollHeight}" style="width:${timelineWidth + 96}px;height:${scaledRollHeight.toFixed(2)}px">
        <div class="artist-store-midi-canvas" data-midi-zoom-canvas style="width:${timelineWidth + 96}px;height:${rollHeight}px;--midi-preview-zoom:${appliedScale.toFixed(4)}">
          <div class="artist-store-midi-keyboard" style="height:${rollHeight}px">
          ${whiteKeys}${blackKeys.join("")}
        </div>
        <svg class="artist-store-midi-roll" width="${timelineWidth}" height="${rollHeight}" viewBox="0 0 ${timelineWidth} ${rollHeight}" role="img" aria-label="${shopEscape(shopT("Aperçu MIDI"))}">
          <rect class="artist-store-midi-roll-bg" x="0" y="0" width="${timelineWidth}" height="${rollHeight}"></rect>
          <g class="artist-store-midi-grid-horizontal">${horizontalGrid}</g>
          <g class="artist-store-midi-grid-vertical">${verticalGrid.join("")}</g>
          <g class="artist-store-midi-bar-labels">${barLabels.join("")}</g>
          <g class="artist-store-midi-notes">${rects}</g>
          </svg>
        </div>
      </div>
    </div>
  </section>`;
}

function renderResourcePreview(resource = {}) {
  const resourceId = String(resource.id || "");
  const preview = shopResourcePreviews.get(resourceId) || resource.preview || {};
  if (shopPackType === "midi") {
    const panelId = midiPreviewPanelId(resourceId);
    return `<div class="artist-store-resource-preview is-midi" id="${shopEscape(panelId)}" data-midi-preview-panel data-midi-preview-resource-id="${shopEscape(resourceId)}" hidden aria-hidden="true"></div>`;
  }
  const daw = shopDawLabel(preview.dawName || resource.dawName || shopPackData?.dawName);
  const version = String(preview.dawVersion || resource.dawVersion || shopPackData?.dawVersion || "").trim();
  const plugins = String(preview.dawPlugins || resource.dawPlugins || shopPackData?.dawPlugins || "").trim();
  return `<div class="artist-store-resource-preview is-daw">
    <div class="artist-store-preview-label"><i data-lucide="scan-eye"></i><span>${shopEscape(shopT("Aperçu du projet"))}</span></div>
    <div class="artist-store-daw-preview">
      <span><i data-lucide="panels-top-left"></i></span>
      <div><strong>${shopEscape(daw)}</strong>${version ? `<small>v${shopEscape(version)}</small>` : ""}</div>
      <p>${plugins ? `${shopEscape(shopT("Plugins externes requis"))} · ${shopEscape(plugins)}` : shopEscape(resource.originalName || shopT("Projet DAW"))}</p>
    </div>
  </div>`;
}

function renderShopPack() {
  const resources = Array.isArray(shopPackData?.resources) ? shopPackData.resources : [];
  const cover = shopFileUrl(shopPackData?.coverPack);
  const artist = shopPackData?.artistProfile?.name || shopPackData?.artist || shopT("Artiste Sonara");
  const packPrice = shopPrice(shopPackData?.price || shopPackData?.packPrice || shopPackData?.totalPrice);
  const dawName = shopDawLabel(shopPackData?.dawName);
  const dawVersion = String(shopPackData?.dawVersion || "").trim();
  const dawPlugins = String(shopPackData?.dawPlugins || "").trim();
  const ownedPackView = shopOwnedViewRequested && shopOwnership.ownsPack;

  shopPackRoot.innerHTML = `
    <header class="artist-store-pack-header">
      <button type="button" class="artist-store-pack-back" data-shop-back aria-label="${shopEscape(shopT("Retour à la Boutique"))}">
        <i data-lucide="chevron-left"></i><span>${shopEscape(shopOwnedViewRequested ? shopT("Mes achats") : shopT("Boutique"))}</span>
      </button>
      <div class="artist-store-pack-brand">
        <small>SONARA ARTIST</small>
        <strong>${shopEscape(shopTypeLabel())}</strong>
      </div>
      <button type="button" class="artist-store-pack-dashboard" data-shop-dashboard>
        <span>${shopEscape(shopT("Dashboard"))}</span><i data-lucide="layout-dashboard"></i>
      </button>
    </header>

    <main class="artist-store-pack-main">
      <section class="artist-store-pack-hero">
        <div class="artist-store-pack-cover">
          ${cover ? `<img src="${shopEscape(cover)}" alt="">` : `<span><i data-lucide="${shopTypeIcon()}"></i></span>`}
        </div>
        <div class="artist-store-pack-intro">
          <div class="artist-store-pack-kicker"><i data-lucide="${shopTypeIcon()}"></i><span>${shopEscape(shopPackType === "midi" ? "MIDI PACK" : "DAW PACK")}</span></div>
          <h1>${shopEscape(shopPackData?.title || shopT("Pack Sonara"))}</h1>
          <button type="button" class="artist-store-pack-artist" data-artist-link><span>${shopEscape(artist)}</span></button>
          <div class="artist-store-pack-facts">
            <span>${shopEscape(resourceCountLabel(resources.length))}</span>
            ${shopPackType === "daw" ? `<span>${shopEscape(dawName)}</span>` : ""}
            ${shopPackType === "daw" && dawVersion ? `<span>v${shopEscape(dawVersion)}</span>` : ""}
          </div>
          <div class="artist-store-pack-buybox ${ownedPackView ? "is-owned" : ""}">
            <div><small>${shopEscape(ownedPackView ? shopT("Déjà téléchargé") : shopT("Pack complet"))}</small>${ownedPackView ? "" : `<strong>${shopEscape(packPrice)}</strong>`}</div>
            ${ownedPackView
              ? `<button type="button" data-download-pack><i data-lucide="download"></i>${shopEscape(shopT("Retélécharger gratuitement"))}</button>`
              : `<button type="button" data-buy-pack>${shopEscape(shopT("Obtenir le pack"))}</button>`}
          </div>
        </div>
      </section>

      ${shopPackType === "daw" && (dawVersion || dawPlugins) ? `
        <section class="artist-store-pack-compatibility">
          <div><small>${shopEscape(shopT("Compatibilité"))}</small><strong>${shopEscape(dawName)}</strong></div>
          ${dawVersion ? `<div><small>${shopEscape(shopT("Version du DAW"))}</small><strong>${shopEscape(dawVersion)}</strong></div>` : ""}
          ${dawPlugins ? `<div class="is-wide"><small>${shopEscape(shopT("Plugins externes requis"))}</small><strong>${shopEscape(dawPlugins)}</strong></div>` : ""}
        </section>` : ""}

      <section class="artist-store-pack-resources">
        <header>
          <div><small>${shopEscape(shopT("CONTENU DU PACK"))}</small><h2>${shopEscape(shopPackType === "midi" ? shopT("Fichiers MIDI") : shopT("Projets DAW"))}</h2></div>
          <span>${resources.length}</span>
        </header>
        <div class="artist-store-resource-list">
          ${resources.map((resource, index) => {
            const resourceCover = shopFileUrl(resource.coverPack || shopPackData.coverPack);
            const resourceId = String(resource.id || `${shopPackData.id}-resource-${index + 1}`);
            const owned = isShopResourceOwned(resourceId);
            const ownedResourceView = shopOwnedViewRequested && owned;
            const meta = shopPackType === "midi"
              ? String(resource.originalName || resource.extension || ".mid")
              : `${shopDawLabel(resource.dawName || shopPackData.dawName)}${resource.dawVersion || shopPackData.dawVersion ? ` · v${resource.dawVersion || shopPackData.dawVersion}` : ""}`;
            return `
              <article class="artist-store-resource ${ownedResourceView ? "is-owned" : ""}" data-resource-id="${shopEscape(resourceId)}">
                <span class="artist-store-resource-number">${String(index + 1).padStart(2, "0")}</span>
                <div class="artist-store-resource-cover">${resourceCover ? `<img src="${shopEscape(resourceCover)}" alt="">` : `<i data-lucide="${shopTypeIcon()}"></i>`}</div>
                <div class="artist-store-resource-copy">
                  <div class="artist-store-resource-copy-title">
                    <strong>${shopEscape(resource.title || resource.originalName || `${shopTypeLabel()} ${index + 1}`)}</strong>
                    ${shopPackType === "midi" ? `<button type="button" class="artist-store-preview-toggle" data-midi-preview-toggle aria-expanded="false" aria-controls="${shopEscape(midiPreviewPanelId(resourceId))}" aria-label="${shopEscape(shopT("Aperçu MIDI"))}"><i data-lucide="eye"></i></button>` : ""}
                  </div>
                  <small>${shopEscape(meta)}</small>
                </div>
                ${ownedResourceView ? `<span class="artist-store-resource-owned"><i data-lucide="circle-check"></i>${shopEscape(shopT("Déjà téléchargé"))}</span>` : `<strong class="artist-store-resource-price">${shopEscape(shopPrice(resource.price || shopPackData.price))}</strong>`}
                ${ownedResourceView
                  ? `<button type="button" class="artist-store-resource-buy" data-download-resource="${shopEscape(resourceId)}">${shopEscape(shopT("Retélécharger gratuitement"))}</button>`
                  : `<button type="button" class="artist-store-resource-buy" data-buy-resource="${shopEscape(resourceId)}">${shopEscape(shopT("Obtenir"))}</button>`}
                ${renderResourcePreview(resource)}
              </article>`;
          }).join("")}
        </div>
        <p class="artist-store-pack-note"><i data-lucide="file-down"></i><span>${shopEscape(shopT("Les fichiers sont conservés dans leur format d’origine."))}</span></p>
      </section>
    </main>

    <div class="artist-store-license" data-license-overlay hidden>
      <section class="artist-store-license-card" role="dialog" aria-modal="true" aria-labelledby="shopLicenseTitle">
        <button type="button" class="artist-store-license-close" data-license-close aria-label="${shopEscape(shopT("Fermer"))}"><i data-lucide="x"></i></button>
        <header class="artist-store-license-header">
          <div class="artist-store-license-icon"><i data-lucide="shield-check"></i></div>
          <div><small>${shopEscape(shopT("LICENCE SONARA PACK"))}</small><h2 id="shopLicenseTitle">${shopEscape(shopT("Licence d’utilisation"))}</h2><p data-license-item></p></div>
          <strong class="artist-store-license-price" data-license-price></strong>
        </header>
        <div class="artist-store-license-summary">
          <span><i data-lucide="globe-2"></i>${shopEscape(shopT("Monde entier"))}</span>
          <span><i data-lucide="infinity"></i>${shopEscape(shopT("Durée permanente"))}</span>
          <span><i data-lucide="user-round"></i>${shopEscape(shopT("Liée à votre compte"))}</span>
        </div>
        <div class="artist-store-license-grid">
          <section class="artist-store-license-column is-allowed"><h3><i data-lucide="circle-check-big"></i>${shopEscape(shopT("Vous pouvez"))}</h3><ul data-license-permissions></ul></section>
          <section class="artist-store-license-column is-forbidden"><h3><i data-lucide="circle-slash-2"></i>${shopEscape(shopT("Interdit"))}</h3><ul data-license-restrictions></ul></section>
        </div>
        <section class="artist-store-license-custom" data-license-custom-wrap hidden><h3>${shopEscape(shopT("Conditions complémentaires"))}</h3><p data-license-custom></p></section>
        <p class="artist-store-license-credit" data-license-credit hidden><i data-lucide="at-sign"></i>${shopEscape(shopT("Le crédit de l’artiste est obligatoire pour toute publication."))}</p>
        <p class="artist-store-license-terms">${shopEscape(shopT("En continuant, vous confirmez avoir lu et accepté la licence du pack."))}</p>
        <div class="artist-store-license-actions"><button type="button" data-license-cancel>${shopEscape(shopT("Annuler"))}</button><button type="button" data-license-accept>${shopEscape(shopT("Accepter et continuer"))}</button></div>
      </section>
    </div>
  `;

  wireShopPack();
  window.lucide?.createIcons?.();
  requestAnimationFrame(() => window.SonaraI18n?.refresh?.());
}

function currentProfile() {
  try { return JSON.parse(localStorage.getItem("sonaraProfile") || "null"); }
  catch { return null; }
}

async function loadShopOwnership() {
  const profile = currentProfile();
  const userId = profile?.accountId || profile?.id;
  if (!userId || !shopPackData?.id) return;
  try {
    const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    const account = data?.account || {};
    shopOwnership = {
      ownsPack: (Array.isArray(account.downloadedPacks) ? account.downloadedPacks : []).some((id) => String(id) === String(shopPackData.id)),
      resourceIds: new Set((Array.isArray(account.downloadedResources) ? account.downloadedResources : []).map(String))
    };
  } catch (error) {
    console.warn("Achats Boutique indisponibles :", error);
  }
}

async function loadShopResourcePreviews() {
  const resources = Array.isArray(shopPackData?.resources) ? shopPackData.resources : [];
  shopResourcePreviews = new Map();
  resources.forEach((resource) => {
    const resourceId = String(resource?.id || "");
    if (resourceId && resource?.preview && typeof resource.preview === "object") {
      shopResourcePreviews.set(resourceId, resource.preview);
    }
  });
}

function shopDownloadUrl(fileUrl) {
  const raw = String(fileUrl || "").trim();
  if (!raw) return "";
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
  return `${API_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function markShopDownloadComplete(button) {
  if (!button) return;
  button.disabled = true;
  button.classList.remove("is-preparing");
  button.classList.add("is-download-complete");
  button.removeAttribute("aria-busy");
  button.setAttribute("aria-label", shopT("Déjà téléchargé"));
  button.innerHTML = '<i data-lucide="circle-check-big"></i>';
  window.lucide?.createIcons?.();
}

function startShopProtectedDownload(fileUrl) {
  const finalUrl = shopDownloadUrl(fileUrl);
  if (!finalUrl) throw new Error(shopT("Téléchargement impossible"));
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.src = finalUrl;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 30000);
}

async function redownloadShopContent(resourceId = null, button = null) {
  const profile = currentProfile();
  const userId = profile?.accountId || profile?.id;
  if (!userId) return;
  const previousHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.classList.add("is-preparing");
    button.setAttribute("aria-busy", "true");
    button.textContent = shopT("Préparation…");
  }
  try {
    const response = await fetch(`${API_URL}/api/downloads/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, packId: shopPackData.id, resourceId: resourceId || null })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.fileUrl) throw new Error(data.message || shopT("Téléchargement impossible"));
    startShopProtectedDownload(data.fileUrl);
    window.setTimeout(() => markShopDownloadComplete(button), 320);
  } catch (error) {
    if (button) {
      button.classList.remove("is-preparing");
      button.removeAttribute("aria-busy");
      button.innerHTML = previousHtml;
      button.disabled = false;
      window.lucide?.createIcons?.();
    }
    console.error("Retéléchargement Boutique impossible :", error);
  }
}

function renderShopLicense(resource = null) {
  const license = normalizeShopLicense(shopPackData?.license);
  const permissions = shopLicenseItems(
    SHOP_LICENSE_PERMISSION_LABELS,
    license.permissions,
    license.customPermissions
  );
  const restrictions = shopLicenseItems(
    SHOP_LICENSE_RESTRICTION_LABELS,
    license.restrictions,
    license.customRestrictions
  );
  const selectedItem = resource || shopPackData;
  const itemTitle = resource
    ? `${resource.title || resource.originalName || shopTypeLabel()} — ${shopPackData.title || shopT("Pack Sonara")}`
    : (shopPackData.title || shopT("Pack Sonara"));

  const title = document.getElementById("shopLicenseTitle");
  const item = document.querySelector("[data-license-item]");
  const price = document.querySelector("[data-license-price]");
  const permissionList = document.querySelector("[data-license-permissions]");
  const restrictionList = document.querySelector("[data-license-restrictions]");
  const customWrap = document.querySelector("[data-license-custom-wrap]");
  const custom = document.querySelector("[data-license-custom]");
  const credit = document.querySelector("[data-license-credit]");

  if (title) title.textContent = license.name || shopT("Licence d’utilisation");
  if (item) item.textContent = itemTitle;
  if (price) price.textContent = shopPrice(selectedItem?.price || selectedItem?.packPrice || selectedItem?.totalPrice);
  if (permissionList) {
    permissionList.innerHTML = permissions.length
      ? permissions.map((value) => `<li>${shopEscape(value)}</li>`).join("")
      : `<li>${shopEscape(shopT("Aucune utilisation supplémentaire n’est accordée."))}</li>`;
  }
  if (restrictionList) {
    restrictionList.innerHTML = restrictions.length
      ? restrictions.map((value) => `<li>${shopEscape(value)}</li>`).join("")
      : `<li>${shopEscape(shopT("Aucune restriction personnalisée supplémentaire."))}</li>`;
  }
  if (customWrap && custom) {
    customWrap.hidden = !license.customTerms;
    custom.textContent = license.customTerms;
  }
  if (credit) credit.hidden = !license.creditRequired;
}

function openLicense(type, resourceId = null) {
  shopPurchase = { type, resourceId };
  const resource = resourceId
    ? shopPackData.resources?.find((item) => String(item.id) === String(resourceId))
    : null;
  const overlay = document.querySelector("[data-license-overlay]");
  renderShopLicense(resource);
  if (overlay) overlay.hidden = false;
  document.body.classList.add("artist-store-license-open");
  window.lucide?.createIcons?.();
}

function closeLicense() {
  const overlay = document.querySelector("[data-license-overlay]");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("artist-store-license-open");
}

async function beginPurchase() {
  const profile = currentProfile();
  const userId = profile?.accountId || profile?.id;
  if (!userId) {
    alert(shopT("Reconnecte-toi puis réessaie."));
    return;
  }

  const resource = shopPurchase.resourceId
    ? shopPackData.resources?.find((item) => String(item.id) === String(shopPurchase.resourceId))
    : null;
  const selectedItem = resource || shopPackData;
  const commercialState = await window.SonaraCommercial?.ready?.() || window.SonaraCommercial?.getState?.() || { freeAcquisitionEnabled: true };
  const licenseVersion = Number(shopPackData?.license?.version || 1);
  const licenseId = String(shopPackData?.license?.id || `${shopPackData.id}:license:v${licenseVersion}`);

  if (commercialState.freeAcquisitionEnabled) {
    const response = await fetch(`${API_URL}/api/free-download-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        packId: shopPackData.id,
        resourceId: shopPurchase.resourceId || null,
        licenseVersion,
        licenseId
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.redirectUrl) {
      alert(data.message || data.error || shopT("Téléchargement impossible"));
      return;
    }
    window.location.href = data.redirectUrl;
    return;
  }

  sessionStorage.setItem("sonaraStripePurchase", JSON.stringify({
    userId,
    packId: shopPackData.id,
    resourceId: shopPurchase.resourceId || null,
    purchaseType: shopPurchase.resourceId ? "resource" : "pack",
    returnUrl: window.location.href,
    licenseVersion,
    licenseId,
    createdAt: Date.now()
  }));
  window.location.href = "/app/pages/system/stripe-loading.html";
}

function wireShopPack() {
  document.querySelector("[data-shop-back]")?.addEventListener("click", () => {
    const owned = shopOwnedViewRequested ? "&library=1" : "";
    window.location.href = `/app/pages/creator/dashboard.html?mode=shop&shopType=${encodeURIComponent(shopPackType)}${owned}`;
  });
  document.querySelector("[data-shop-dashboard]")?.addEventListener("click", () => {
    window.location.href = "/app/pages/creator/dashboard.html";
  });
  document.querySelector("[data-buy-pack]")?.addEventListener("click", () => openLicense("pack"));
  document.querySelector("[data-download-pack]")?.addEventListener("click", (event) => redownloadShopContent(null, event.currentTarget));
  document.querySelectorAll("[data-download-resource]").forEach((button) => {
    button.addEventListener("click", () => redownloadShopContent(button.dataset.downloadResource, button));
  });
  document.querySelectorAll("[data-buy-resource]").forEach((button) => {
    button.addEventListener("click", () => openLicense("resource", button.dataset.buyResource));
  });
  const closeMidiPreview = (panel, button) => {
    if (!panel || panel.hidden || panel.classList.contains("is-closing")) return;
    panel.classList.add("is-closing");
    button?.setAttribute("aria-expanded", "false");
    button?.classList.remove("is-open");
    window.setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove("is-closing");
      panel.setAttribute("aria-hidden", "true");
      document.body.classList.remove("artist-store-midi-preview-open");
      button?.focus({ preventScroll: true });
    }, 240);
  };

  const bindMidiPreviewClose = (panel, button) => {
    panel.querySelector("[data-midi-preview-close]")?.addEventListener("click", () => closeMidiPreview(panel, button), { once: true });
  };

  const bindMidiPreviewZoom = (panel) => {
    const canvas = panel?.querySelector("[data-midi-zoom-canvas]");
    const stage = panel?.querySelector("[data-midi-zoom-stage]");
    const value = panel?.querySelector("[data-midi-zoom-value]");
    const fitButton = panel?.querySelector("[data-midi-zoom-fit]");
    if (!canvas || !stage || !value || !fitButton) return;

    const baseHeight = Math.max(1, Number(stage.dataset.baseHeight || 1));
    const fitScale = Math.max(.22, Math.min(1.8, Number(fitButton.dataset.fitScale || 1)));
    let scale = Math.max(.22, Math.min(1.8, Number.parseFloat(canvas.style.getPropertyValue("--midi-preview-zoom")) || fitScale));

    const applyZoom = (nextScale, preserveCenter = true) => {
      const scroll = panel.querySelector("[data-midi-preview-scroll]");
      const previousScale = scale;
      const previousScrollTop = scroll?.scrollTop || 0;
      const viewportCenter = previousScrollTop + ((scroll?.clientHeight || 0) / 2);

      scale = Math.max(.22, Math.min(1.8, nextScale));
      canvas.style.setProperty("--midi-preview-zoom", scale.toFixed(4));
      stage.style.height = `${Math.max(1, baseHeight * scale).toFixed(2)}px`;
      value.textContent = `${Math.round(scale * 100)}%`;

      if (scroll && preserveCenter && previousScale > 0) {
        const logicalCenter = viewportCenter / previousScale;
        window.requestAnimationFrame(() => {
          scroll.scrollTop = Math.max(0, (logicalCenter * scale) - (scroll.clientHeight / 2));
        });
      } else if (scroll) {
        window.requestAnimationFrame(() => { scroll.scrollTop = 0; });
      }
    };

    panel.querySelector("[data-midi-zoom-out]")?.addEventListener("click", () => applyZoom(scale - .12));
    panel.querySelector("[data-midi-zoom-in]")?.addEventListener("click", () => applyZoom(scale + .12));
    fitButton.addEventListener("click", () => applyZoom(fitScale, false));
  };

  document.querySelectorAll("[data-midi-preview-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      const panelId = button.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      const resourceId = String(panel?.dataset.midiPreviewResourceId || "");
      if (!panel || !resourceId || button.dataset.previewLoading === "1") return;

      let preview = shopResourcePreviews.get(resourceId) || {};
      if (preview.fullPreview !== true) {
        button.dataset.previewLoading = "1";
        button.disabled = true;
        button.innerHTML = '<i data-lucide="loader-circle"></i>';
        button.classList.add("is-loading");
        window.lucide?.createIcons?.();
        try {
          const response = await fetch(`${API_URL}/api/packs/${encodeURIComponent(shopPackData.id)}/resources/${encodeURIComponent(resourceId)}/midi-preview`, { cache: "no-store" });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.preview && typeof data.preview === "object") {
            preview = data.preview;
            shopResourcePreviews.set(resourceId, preview);
          }
        } catch {}
        button.dataset.previewLoading = "0";
        button.disabled = false;
        button.classList.remove("is-loading");
        button.innerHTML = '<i data-lucide="eye"></i>';
      }

      panel.innerHTML = renderMidiPreview(preview);
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      button.setAttribute("aria-expanded", "true");
      button.classList.add("is-open");
      document.body.classList.add("artist-store-midi-preview-open");
      bindMidiPreviewClose(panel, button);
      bindMidiPreviewZoom(panel);
      panel.querySelector("[data-midi-preview-close]")?.focus({ preventScroll: true });
      window.lucide?.createIcons?.();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const panel = document.querySelector("[data-midi-preview-panel]:not([hidden])");
    if (!panel) return;
    const button = document.querySelector(`[data-midi-preview-toggle][aria-controls="${CSS.escape(panel.id)}"]`);
    closeMidiPreview(panel, button);
  });
  document.querySelector("[data-license-close]")?.addEventListener("click", closeLicense);
  document.querySelector("[data-license-cancel]")?.addEventListener("click", closeLicense);
  document.querySelector("[data-license-overlay]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-license-overlay]")) closeLicense();
  });
  document.querySelector("[data-license-accept]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await beginPurchase(); }
    finally { button.disabled = false; }
  });
}

async function loadShopPack() {
  const commercialState = await window.SonaraCommercial?.ready?.()
    || window.SonaraCommercial?.getState?.()
    || { paymentsActive: false };

  if (commercialState.paymentsActive !== true) {
    window.location.replace("/app/pages/creator/dashboard.html");
    return;
  }

  if (!shopPackId) {
    shopPackRoot.innerHTML = `<div class="artist-store-pack-error">${shopEscape(shopT("Pack introuvable."))}</div>`;
    return;
  }
  try {
    await window.SonaraI18n?.ready;
    const response = await fetch(`${API_URL}/api/packs`, { cache: "no-store" });
    const packs = await response.json();
    shopPackData = Array.isArray(packs) ? packs.find((pack) => String(pack.id) === String(shopPackId)) : null;
    if (!shopPackData || String(shopPackData.contentType || "").toLowerCase() !== shopPackType) {
      throw new Error(shopT("Pack introuvable."));
    }
    await Promise.all([loadShopOwnership(), loadShopResourcePreviews()]);
    renderShopPack();
  } catch (error) {
    shopPackRoot.innerHTML = `<div class="artist-store-pack-error"><i data-lucide="triangle-alert"></i><strong>${shopEscape(error.message || shopT("Pack introuvable."))}</strong></div>`;
    window.lucide?.createIcons?.();
  }
}

loadShopPack();
