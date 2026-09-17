(() => {
  const menu = document.querySelector("[data-public-legal-menu]");
  const panels = [...document.querySelectorAll("[data-legal-panel]")];
  const keys = new Set(panels.map((panel) => panel.dataset.legalPanel));

  function refreshIcons() {
    if (globalThis.lucide?.createIcons) globalThis.lucide.createIcons();
  }

  function requestedSection() {
    const value = new URLSearchParams(window.location.search).get("section") || "";
    return keys.has(value) ? value : "";
  }

  function setSection(section, { historyMode = "push" } = {}) {
    const selected = keys.has(section) ? section : "";
    menu.hidden = Boolean(selected);
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.legalPanel !== selected;
    });

    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("section", selected);
    else url.searchParams.delete("section");

    if (historyMode === "replace") window.history.replaceState({ legalSection: selected }, "", url);
    else if (historyMode === "push") window.history.pushState({ legalSection: selected }, "", url);

    window.scrollTo({ top: 0, behavior: "auto" });
    refreshIcons();
    window.SonaraI18n?.refresh?.();
  }

  document.querySelectorAll("[data-legal]").forEach((button) => {
    button.addEventListener("click", () => setSection(button.dataset.legal));
  });

  document.querySelectorAll("[data-public-legal-back]").forEach((button) => {
    button.addEventListener("click", () => setSection(""));
  });

  document.querySelector("[data-public-legal-exit]")?.addEventListener("click", () => {
    if (document.referrer) {
      try {
        const referrer = new URL(document.referrer);
        if (referrer.origin === window.location.origin) {
          window.history.back();
          return;
        }
      } catch {}
    }
    window.location.href = "/how-it-works";
  });

  window.addEventListener("popstate", () => setSection(requestedSection(), { historyMode: "none" }));
  setSection(requestedSection(), { historyMode: "replace" });
})();
