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

function renderMidiPreview(preview = {}) {
  const notes = Array.isArray(preview.notes) ? preview.notes : [];
  if (!notes.length) {
    return `<div class="artist-store-preview-empty"><i data-lucide="piano"></i><span>${shopEscape(shopT("Aperçu indisponible"))}</span></div>`;
  }
  const totalTicks = Math.max(1, Number(preview.totalTicks || 1));
  const low = Number.isFinite(Number(preview.lowestNote)) ? Number(preview.lowestNote) : Math.min(...notes.map((note) => Number(note.note || 60)));
  const high = Number.isFinite(Number(preview.highestNote)) ? Number(preview.highestNote) : Math.max(...notes.map((note) => Number(note.note || 60)));
  const noteRange = Math.max(1, high - low + 1);
  const rects = notes.slice(0, 96).map((note) => {
    const x = Math.max(0, Math.min(996, (Number(note.start || 0) / totalTicks) * 996));
    const width = Math.max(3, Math.min(996 - x, (Number(note.duration || 1) / totalTicks) * 996));
    const y = Math.max(2, Math.min(232, ((high - Number(note.note || low)) / noteRange) * 230 + 3));
    const velocity = Math.max(.36, Math.min(1, Number(note.velocity || 80) / 127));
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${Math.max(3, 220 / noteRange).toFixed(2)}" rx="2" opacity="${velocity.toFixed(2)}"></rect>`;
  }).join("");
  return `<svg class="artist-store-midi-roll" viewBox="0 0 1000 240" preserveAspectRatio="none" aria-label="${shopEscape(shopT("Aperçu MIDI"))}">
    <g class="artist-store-midi-grid">${Array.from({ length: 9 }, (_, index) => `<line x1="${index * 125}" y1="0" x2="${index * 125}" y2="240"></line>`).join("")}</g>
    <g class="artist-store-midi-notes">${rects}</g>
  </svg>`;
}

function renderResourcePreview(resource = {}) {
  const resourceId = String(resource.id || "");
  const preview = shopResourcePreviews.get(resourceId) || resource.preview || {};
  if (shopPackType === "midi") {
    return `<div class="artist-store-resource-preview">
      <div class="artist-store-preview-label"><i data-lucide="scan-eye"></i><span>${shopEscape(shopT("Aperçu MIDI"))}</span></div>
      ${renderMidiPreview(preview)}
    </div>`;
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
                  <strong>${shopEscape(resource.title || resource.originalName || `${shopTypeLabel()} ${index + 1}`)}</strong>
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

async function redownloadShopContent(resourceId = null, button = null) {
  const profile = currentProfile();
  const userId = profile?.accountId || profile?.id;
  if (!userId) return;
  const previousText = button?.textContent || "";
  if (button) { button.disabled = true; button.textContent = shopT("Préparation…"); }
  try {
    const response = await fetch(`${API_URL}/api/downloads/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, packId: shopPackData.id, resourceId: resourceId || null })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.fileUrl) throw new Error(data.message || shopT("Téléchargement impossible"));
    window.location.href = `${API_URL}${data.fileUrl}`;
  } catch (error) {
    if (button) button.textContent = error.message || shopT("Téléchargement impossible");
    window.setTimeout(() => { if (button) { button.disabled = false; button.textContent = previousText; } }, 1800);
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
