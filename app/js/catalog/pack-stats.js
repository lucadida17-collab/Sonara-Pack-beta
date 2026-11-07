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
    // Mobile face stays mounted behind the artwork for continuous finger tracking.
    // It is hidden from assistive technology until the gesture settles open.
    const state = surface === "cover" ? 'aria-hidden="true"' : 'hidden';
    return `<div class="${klass}" data-sonara-stats-panel ${state}>
      ${renderStats(packs, options)}
    </div>`;
  }

  // One icon, no swipe instructions. The same button reverses direction when open.
  function renderNav(surface = "cover") {
    // Mobile: no arrow or fake swipe button. Only a subtle two-page indicator.
    if (surface === "cover") {
      return '<span class="sonara-swipe-indicator" aria-hidden="true"><i></i><i></i></span>';
    }
    const klass = "sonara-stats-nav-desktop";
    return `<button class="sonara-stats-nav ${klass}" type="button"
        data-sonara-stats-toggle aria-expanded="false"
        aria-label="Voir les statistiques" title="Voir les statistiques">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>`;
  }

  function setOpen(hero, open) {
    if (!hero) return;
    hero.classList.toggle("is-open", open);
    hero.querySelectorAll("[data-sonara-stats-panel]").forEach((panel) => {
      if (panel.classList.contains("sonara-stats-cover-panel")) {
        panel.hidden = false;
        panel.setAttribute("aria-hidden", String(!open));
      } else {
        panel.hidden = !open;
      }
    });
    const cover = hero.querySelector("[data-sonara-stats-cover-surface]");
    cover?.style.setProperty("--sonara-swipe-progress", open ? "1" : "0");
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
  const recentSwipes = new WeakMap();
  const clamp = (n) => Math.max(0, Math.min(1, n));
  function mobileLayout() {
    return window.matchMedia?.("(max-width: 899px)")?.matches ?? false;
  }
  function isInteractive(element) {
    return Boolean(element?.closest?.("button, a, input, textarea, select, audio, video, [role=button]"));
  }

  function putProgress(state, x) {
    const progress = clamp(state.initial - (x - state.x) / state.distance);
    state.cover.style.setProperty("--sonara-swipe-progress", progress.toFixed(4));
    state.progress = progress;
    return progress;
  }

  function finishMobileGesture(state, event, cancelled = false) {
    const { hero, cover } = state;
    hero.classList.remove("is-dragging");
    if (state.captured && cover.hasPointerCapture?.(state.id)) {
      cover.releasePointerCapture?.(state.id);
    }
    if (!hero.isConnected) return;
    if (state.axis !== "x") return;
    const x = event.clientX ?? state.lastX;
    const progress = putProgress(state, x);
    const time = Number.isFinite(event.timeStamp) ? event.timeStamp : state.lastTime;
    // Short, recent motion matters more than a slow drag's overall speed.
    const sample = state.samples.find((s) => time - s.time >= 35) || state.samples[0];
    const velocity = sample && time > sample.time ? (x - sample.x) / (time - sample.time) : 0;
    const open = cancelled ? Boolean(state.initial) :
      (Math.abs(velocity) > 0.48 && Math.abs(x - state.x) > 20
        ? velocity < 0 : progress >= 0.48);
    // An intentional drag must not accidentally activate the cover/player click.
    recentSwipes.set(cover, Date.now());
    setOpen(hero, open);
  }

  // The cover itself is the gesture surface. Finger movement drives the visual
  // position continuously; nothing waits for pointerup to start moving.
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const hero = event.target.closest?.("[data-sonara-stats-hero]");
    if (!hero || isInteractive(event.target)) return;
    const mobile = mobileLayout();
    const cover = hero.querySelector("[data-sonara-stats-cover-surface]");
    if (!cover || (mobile && !event.target.closest("[data-sonara-stats-cover-surface]"))) return;
    const initial = hero.classList.contains("is-open") ? 1 : 0;
    activePointers.set(event.pointerId, {
      id: event.pointerId, hero, cover, mobile, initial,
      x: event.clientX, y: event.clientY, lastX: event.clientX,
      lastTime: event.timeStamp, samples: [{ x: event.clientX, time: event.timeStamp }],
      distance: Math.max(165, cover.getBoundingClientRect().width * 0.78),
      axis: null, captured: false, progress: initial
    });
  }, { passive: true });

  document.addEventListener("pointermove", (event) => {
    const state = activePointers.get(event.pointerId);
    if (!state || !state.mobile || !state.hero.isConnected) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 9) return;
      // Do not trap normal vertical page or statistics-panel scrolling.
      state.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (state.axis !== "x") return;
      state.hero.classList.add("is-dragging");
      if (state.cover.setPointerCapture) {
        try {
          state.cover.setPointerCapture(event.pointerId);
          state.captured = true;
        } catch { /* Fall back to document-level pointer tracking. */ }
      }
    }
    if (state.axis !== "x") return;
    putProgress(state, event.clientX);
    state.lastX = event.clientX;
    state.lastTime = event.timeStamp;
    state.samples.push({ x: event.clientX, time: event.timeStamp });
    state.samples = state.samples.filter((s) => event.timeStamp - s.time <= 130).slice(-6);
  }, { passive: true });

  document.addEventListener("pointerup", (event) => {
    const state = activePointers.get(event.pointerId);
    activePointers.delete(event.pointerId);
    if (!state || !state.hero.isConnected) return;
    if (state.mobile) {
      finishMobileGesture(state, event);
      return;
    }
    // Desktop keeps its original full-hero gesture behavior.
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      setOpen(state.hero, dx < 0);
    }
  }, { passive: true });

  document.addEventListener("pointercancel", (event) => {
    const state = activePointers.get(event.pointerId);
    activePointers.delete(event.pointerId);
    if (state?.mobile) finishMobileGesture(state, event, true);
  }, { passive: true });

  // Dragging the artwork must not trigger a synthetic click on release.
  document.addEventListener("click", (event) => {
    const cover = event.target.closest?.("[data-sonara-stats-cover-surface]");
    if (cover && Date.now() - (recentSwipes.get(cover) || 0) < 400) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // Keyboard users can also turn the cover without a visible arrow button.
  document.addEventListener("keydown", (event) => {
    if (!mobileLayout() || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const cover = event.target.closest?.("[data-sonara-stats-cover-surface]");
    if (!cover || isInteractive(event.target)) return;
    const hero = cover.closest("[data-sonara-stats-hero]");
    if (!hero) return;
    event.preventDefault();
    setOpen(hero, event.key === "ArrowLeft");
  });

  // Trackpad horizontal swipes on desktop (vertical page scrolling is untouched).
  const lastWheel = new WeakMap();
  document.addEventListener("wheel", (event) => {
    if (mobileLayout()) return;
    const hero = event.target.closest?.("[data-sonara-stats-hero]");
    if (!hero || Math.abs(event.deltaX) < 30 || Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.3) return;
    const now = Date.now();
    if (now - (lastWheel.get(hero) || 0) < 450) return;
    lastWheel.set(hero, now);
    // Trackpad swipe toward the left reveals the stats, as on touch screens.
    setOpen(hero, event.deltaX > 0);
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
