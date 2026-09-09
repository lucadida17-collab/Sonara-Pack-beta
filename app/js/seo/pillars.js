(() => {
  "use strict";

  function syncMeta() {
    const i18n = window.SonaraI18n;
    if (!i18n?.t) return;
    const titleSource = document.documentElement.dataset.pillarSeoTitle || document.title;
    const descriptionSource = document.documentElement.dataset.pillarSeoDescription || document.querySelector('meta[name="description"]')?.content || "";
    const title = i18n.t(titleSource);
    const description = i18n.t(descriptionSource);
    document.title = title;
    document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]').forEach((node) => { node.content = description; });
    document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]').forEach((node) => { node.content = title; });
  }

  async function init() {
    await window.SonaraI18n?.ready?.catch?.(() => null);
    syncMeta();
    window.addEventListener("sonara:languagechange", syncMeta);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
