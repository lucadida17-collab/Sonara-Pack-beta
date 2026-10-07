(() => {
  "use strict";

  const ENTRY_SELECTOR = "[data-sonara-montage-entry]";
  const MONTAGE_URL = "/app/pages/catalog/montage.html";
  const V2_DIRECT_PATHS = new Set([
    "/app/pages/catalog/montage.html",
    "/app/pages/catalog/sync-saves.html"
  ]);

  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  function getStoredProfile() {
    try {
      return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
    } catch (error) {
      console.warn("Montage : profil local illisible.", error);
      return null;
    }
  }

  function getEntries() {
    return Array.from(document.querySelectorAll(ENTRY_SELECTOR));
  }

  function createDesktopEntry() {
    const button = document.createElement("button");
    button.className = "desktop-nav-btn";
    button.type = "button";
    button.setAttribute("data-sonara-montage-entry", "");
    button.setAttribute("data-sonara-v2-injected", "true");
    button.innerHTML = `
      <i data-lucide="clapperboard"></i>
      <span><strong>Sync</strong><small>Synchroniser vos sons</small></span>
    `;
    return button;
  }

  function createMobileEntry() {
    const button = document.createElement("button");
    button.className = "nav-mobile-btn nav-mobile-montage";
    button.type = "button";
    button.setAttribute("data-sonara-montage-entry", "");
    button.setAttribute("data-sonara-v2-injected", "true");
    button.innerHTML = `<i data-lucide="clapperboard"></i><span>Sync</span>`;
    return button;
  }

  function ensureV2Entries() {
    // PRE-V1 / V1 contain no Sync control in their HTML.
    // The control is created only after the official V2 launch gate is open.
    if (getEntries().length) return;

    document.querySelector(".desktop-side-nav")?.appendChild(createDesktopEntry());
    document.querySelector(".nav-mobile")?.appendChild(createMobileEntry());
    window.lucide?.createIcons?.();
  }

  function removeInjectedV2Entries() {
    document.querySelectorAll('[data-sonara-v2-injected="true"]').forEach((entry) => entry.remove());
  }

  function setEntriesVisible(visible) {
    getEntries().forEach((entry) => {
      entry.hidden = !visible;
      entry.setAttribute("aria-hidden", visible ? "false" : "true");
    });
  }

  function bindEntries() {
    getEntries().forEach((entry) => {
      if (entry.dataset.sonaraMontageBound === "true") return;
      entry.dataset.sonaraMontageBound = "true";
      entry.addEventListener("click", () => {
        if (!window.SonaraV2?.isSyncEnabled?.()) return;
        window.location.assign(MONTAGE_URL);
      });
    });
  }

  function isDirectV2Page() {
    return V2_DIRECT_PATHS.has(window.location.pathname);
  }

  async function resolveV2State() {
    try {
      if (window.SonaraV2?.ready) {
        return await window.SonaraV2.ready();
      }
    } catch (error) {
      console.warn("V2 : état indisponible.", error);
    }
    return { enabled: false, syncEnabled: false };
  }

  async function refresh() {
    removeInjectedV2Entries();
    setEntriesVisible(false);

    const v2State = await resolveV2State();
    const syncEnabled = v2State?.enabled === true && v2State?.syncEnabled === true;

    // PRE-V1 et V1 : aucune fonction / entrée Sync n'est montée dans la navigation.
    // SONARA_V2_ENABLED=true est le switch de lancement OFFICIEL de la V2.
    if (!syncEnabled) {
      if (isDirectV2Page()) {
        window.location.replace("/home.html");
      }

      const result = { allowed: false, profile: null, v2Enabled: false };
      window.dispatchEvent(new CustomEvent("sonara:montage-access", { detail: result }));
      return result;
    }

    ensureV2Entries();
    bindEntries();

    let profile = getStoredProfile();

    try {
      const authResult = await window.SonaraAuth?.ready;
      if (authResult?.profile) profile = authResult.profile;
    } catch (error) {
      console.warn("Montage : session non resynchronisée.", error);
    }

    const allowed = Boolean(profile);
    setEntriesVisible(allowed);

    const result = { allowed, profile, v2Enabled: true };
    window.dispatchEvent(new CustomEvent("sonara:montage-access", { detail: result }));
    return result;
  }

  function hasDownloadedContent() {
    return true;
  }

  window.SonaraMontageAccess = Object.freeze({
    ready,
    refresh,
    hasDownloadedContent,
    url: MONTAGE_URL
  });

  async function initialize() {
    const result = await refresh();
    resolveReady(result);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
