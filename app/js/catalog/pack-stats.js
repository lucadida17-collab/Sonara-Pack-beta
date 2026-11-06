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

  function renderStats(packs, { type = "pack", title = "" } = {}) {
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
      <div class="sonara-stats-panel-heading">
        <span class="sonara-stats-kicker">SONARA PACK</span>
        <strong>${escape(sectionTitle)}</strong>
        ${title ? `<small data-user-content>${escape(title)}</small>` : ""}
      </div>
      <div class="sonara-stats-grid">
        ${stats.map(([label, value]) => `<div class="sonara-stats-cell"><span>${escape(label)}</span>${value}</div>`).join("")}
      </div>`;
  }

  // These panels live INSIDE the existing hero: never below it.
  function renderPanel(packs, options, surface) {
    const klass = surface === "cover" ? "sonara-stats-cover-panel" : "sonara-stats-hero-panel";
    return `<div class="${klass}" data-sonara-stats-panel hidden>
      ${renderStats(packs, options)}
    </div>`;
  }

  // One icon, no swipe instructions. The same button reverses direction when open.
  function renderNav(surface = "cover") {
    const klass = surface === "cover" ? "sonara-stats-nav-cover" : "sonara-stats-nav-desktop";
    return `<button class="sonara-stats-nav ${klass}" type="button"
        data-sonara-stats-toggle aria-expanded="false"
        aria-label="Voir les statistiques" title="Voir les statistiques">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>`;
  }

  function setOpen(hero, open) {
    if (!hero) return;
    hero.classList.toggle("is-open", open);
    hero.querySelectorAll("[data-sonara-stats-panel]").forEach((panel) => {
      panel.hidden = !open;
    });
    hero.querySelectorAll("[data-sonara-stats-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Retour" : "Voir les statistiques");
      button.setAttribute("title", open ? "Retour" : "Voir les statistiques");
    });
    window.SonaraI18n?.refresh?.();
  }

  // Delegated handlers work after every Pack, Library, and Artist re-render.
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-sonara-stats-toggle]");
    if (!button) return;
    const hero = button.closest("[data-sonara-stats-hero]");
    if (hero) setOpen(hero, !hero.classList.contains("is-open"));
  });

  // Avoid the browser's native image drag stealing a desktop swipe.
  document.addEventListener("dragstart", (event) => {
    if (event.target.matches?.("img") && event.target.closest?.("[data-sonara-stats-cover-surface]")) {
      event.preventDefault();
    }
  });

  const activePointers = new Map();
  function mobileLayout() {
    return window.matchMedia?.("(max-width: 899px)")?.matches ?? false;
  }
  function isInteractive(element) {
    return Boolean(element?.closest?.("button, a, input, textarea, select, audio, video, [role=button]"));
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const hero = event.target.closest?.("[data-sonara-stats-hero]");
    if (!hero || isInteractive(event.target)) return;
    // Mobile/tablet: gestures belong to the cover only.
    // Desktop: gestures belong to the whole cover + information hero.
    if (mobileLayout() && !event.target.closest("[data-sonara-stats-cover-surface]")) return;
    activePointers.set(event.pointerId, { hero, x: event.clientX, y: event.clientY });
  }, { passive: true });

  document.addEventListener("pointerup", (event) => {
    const start = activePointers.get(event.pointerId);
    activePointers.delete(event.pointerId);
    if (!start || !start.hero.isConnected) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      // Right reveals the statistics; left returns to the cover.
      setOpen(start.hero, dx > 0);
    }
  }, { passive: true });
  document.addEventListener("pointercancel", (event) => activePointers.delete(event.pointerId), { passive: true });

  // Trackpad horizontal swipes on desktop (vertical page scrolling is untouched).
  const lastWheel = new WeakMap();
  document.addEventListener("wheel", (event) => {
    if (mobileLayout()) return;
    const hero = event.target.closest?.("[data-sonara-stats-hero]");
    if (!hero || Math.abs(event.deltaX) < 30 || Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.3) return;
    const now = Date.now();
    if (now - (lastWheel.get(hero) || 0) < 450) return;
    lastWheel.set(hero, now);
    // Native trackpad swiping right typically has negative deltaX.
    setOpen(hero, event.deltaX < 0);
  }, { passive: true });

  window.SonaraPackStats = Object.freeze({
    calculate,
    formatDuration,
    trackDuration: (track) => {
      const value = fullTrackDuration(track);
      return value === null ? "—" : formatDuration(value);
    },
    renderNav,
    renderPackCover: (pack) => renderPanel([pack], { title: pack?.title || "" }, "cover"),
    renderPackHero: (pack) => renderPanel([pack], { title: pack?.title || "" }, "hero"),
    renderArtistCover: (packs, name) => renderPanel(packs, { type: "artist", title: name }, "cover"),
    renderArtistHero: (packs, name) => renderPanel(packs, { type: "artist", title: name }, "hero"),
    // Keep the old methods available to integrations and existing unit tests.
    renderPack: (pack) => renderPanel([pack], { title: pack?.title || "" }, "hero"),
    renderArtist: (packs, name) => renderPanel(packs, { type: "artist", title: name }, "hero")
  });
})();
