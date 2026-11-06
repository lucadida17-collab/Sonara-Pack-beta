/* Sonara Pack — informations coulissantes, sans dépendance au player.
   Durées : fichiers intégraux uniquement (jamais previewDuration).
   Tarifs : valeurs de catalogue, sans modifier la logique d'achat. */
(() => {
  "use strict";

  const escape = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function seconds(value) {
    if (value == null || value === "") return null;
    if (typeof value === "string" && /^\d{1,3}:\d{2}(?::\d{2})?$/.test(value.trim())) {
      const parts = value.trim().split(":").map(Number);
      const n = parts.reduce((total, part) => total * 60 + part, 0);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function fullTrackDuration(track = {}) {
    // previewDuration describes a 30-second excerpt, NOT the original song.
    return seconds(track.audioDuration) ?? seconds(track.duration) ??
      seconds(track.durationSeconds) ?? seconds(track.fullDuration);
  }

  function parseEuro(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    if (/^(gratuit|free)$/i.test(String(value).trim())) return 0;
    const normalized = String(value).trim().replace(/\s/g, "").replace(/€/g, "").replace(",", ".");
    return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : null;
  }

  function packEuro(pack = {}) {
    for (const key of ["price", "packPrice", "totalPrice"]) {
      const found = parseEuro(pack[key]);
      if (found !== null) return found;
    }
    return null;
  }

  function calculate(packs = []) {
    const list = Array.isArray(packs) ? packs : [];
    let tracks = 0;
    let duration = 0;
    let missingDurations = 0;
    let price = 0;
    let missingPrices = 0;

    list.forEach((pack) => {
      const items = Array.isArray(pack?.tracks) ? pack.tracks : [];
      tracks += items.length;
      items.forEach((track) => {
        const value = fullTrackDuration(track);
        if (value === null) missingDurations += 1;
        else duration += value;
      });
      const amount = packEuro(pack);
      if (amount === null) missingPrices += 1;
      else price += amount;
    });

    return { packs: list.length, tracks, duration, missingDurations, price, missingPrices };
  }

  function formatDuration(value) {
    const total = Math.floor(Math.max(0, value));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${sec}` : `${minutes}:${sec}`;
  }

  function isPreV1() {
    return window.SonaraCommercial?.getState?.()?.mode === "PRE_V1";
  }

  function valueMarkup(value, suffix = "") {
    return `<strong>${escape(value)}</strong>${suffix ? `<small>${escape(suffix)}</small>` : ""}`;
  }

  function render(packs, { type = "pack", title = "" } = {}) {
    const artist = type === "artist";
    const data = calculate(packs);
    const knownDuration = data.tracks === 0 ? "0:00" : data.missingDurations ? "—" : formatDuration(data.duration);
    const durationNote = data.missingDurations ? "Durée indisponible pour certains sons" : "";
    const knownPrice = data.missingPrices ? "—" : `${data.price.toFixed(2).replace(".", ",")} €`;
    const priceNote = data.missingPrices ? "Prix indisponible pour certains packs" : "";
    const sectionTitle = artist ? "Informations de l’artiste" : "Informations du pack";
    const plannedPrice = isPreV1();
    const priceLabel = artist
      ? (plannedPrice ? "Prix total prévu" : "Prix total des packs")
      : (plannedPrice ? "Prix prévu" : "Prix du pack");
    const packLabel = artist ? "Packs publiés" : "Packs";
    const stats = [
      ["Sons", valueMarkup(data.tracks)],
      ["Durée totale", valueMarkup(knownDuration, durationNote)],
      [packLabel, valueMarkup(data.packs)],
      [priceLabel, valueMarkup(knownPrice, priceNote)]
    ];

    return `
      <section class="sonara-stats-swipe" data-sonara-stats aria-label="${escape(sectionTitle)}">
        <div class="sonara-stats-face sonara-stats-front">
          <div class="sonara-stats-copy">
            <span class="sonara-stats-kicker">SONARA PACK</span>
            <strong>${escape(sectionTitle)}</strong>
            ${title ? `<small data-user-content>${escape(title)}</small>` : ""}
          </div>
          <button class="sonara-stats-action" type="button" data-sonara-stats-toggle aria-expanded="false" aria-label="Voir les statistiques">
            <span>Glisser vers la droite</span><span aria-hidden="true">→</span>
          </button>
        </div>
        <div class="sonara-stats-face sonara-stats-back" hidden>
          <div class="sonara-stats-top">
            <span class="sonara-stats-kicker">${escape(sectionTitle)}</span>
            <button class="sonara-stats-back-action" type="button" data-sonara-stats-toggle aria-expanded="true" aria-label="Retour aux informations">← <span>Retour</span></button>
          </div>
          <div class="sonara-stats-grid">
            ${stats.map(([label, value]) => `<div class="sonara-stats-cell"><span>${escape(label)}</span>${value}</div>`).join("")}
          </div>
        </div>
      </section>`;
  }

  function setOpen(section, open) {
    if (!section) return;
    section.querySelector(".sonara-stats-front").hidden = open;
    section.querySelector(".sonara-stats-back").hidden = !open;
    section.classList.toggle("is-open", open);
    section.querySelectorAll("[data-sonara-stats-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
    });
    window.SonaraI18n?.refresh?.();
  }

  // Délégation : résiste aux rerenders de Library, Pack et profil artiste.
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-sonara-stats-toggle]");
    if (!button) return;
    const section = button.closest("[data-sonara-stats]");
    setOpen(section, !section.classList.contains("is-open"));
  });

  const gestures = new WeakMap();
  document.addEventListener("touchstart", (event) => {
    const section = event.target.closest?.("[data-sonara-stats]");
    if (!section || event.touches.length !== 1) return;
    gestures.set(section, { x: event.touches[0].clientX, y: event.touches[0].clientY });
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    const section = event.target.closest?.("[data-sonara-stats]");
    const start = section && gestures.get(section);
    if (!start || !event.changedTouches.length) return;
    gestures.delete(section);
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    // Swipe right reveals details; swipe left returns to the cover summary.
    if (dx > 0) setOpen(section, true);
    else setOpen(section, false);
  }, { passive: true });

  window.SonaraPackStats = Object.freeze({
    calculate,
    formatDuration,
    trackDuration: (track) => {
      const value = fullTrackDuration(track);
      return value === null ? "—" : formatDuration(value);
    },
    renderPack: (pack) => render([pack], { title: pack?.title || "" }),
    renderArtist: (packs, name) => render(packs, { type: "artist", title: name })
  });
})();
