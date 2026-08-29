(() => {
  "use strict";

  const ENTRY_SELECTOR = "[data-sonara-montage-entry]";
  const MONTAGE_URL = "/app/pages/catalog/montage.html";

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
        window.location.assign(MONTAGE_URL);
      });
    });
  }

  async function refresh() {
    bindEntries();

    // Sonara Sync ne dépend plus de Bibliothèque.
    // L'accès est disponible dès qu'une session Sonara valide est présente.
    let profile = getStoredProfile();

    try {
      const authResult = await window.SonaraAuth?.ready;
      if (authResult?.profile) profile = authResult.profile;
    } catch (error) {
      console.warn("Montage : session non resynchronisée.", error);
    }

    const allowed = Boolean(profile);
    setEntriesVisible(allowed);

    const result = { allowed, profile };
    window.dispatchEvent(new CustomEvent("sonara:montage-access", { detail: result }));
    return result;
  }

  // Compatibilité avec le code existant : cette méthode ne teste plus
  // Bibliothèque ; Sync est indépendant des acquisitions.
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
