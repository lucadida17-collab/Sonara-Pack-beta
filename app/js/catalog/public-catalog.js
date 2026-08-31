(() => {
  "use strict";

  const root = document.querySelector("[data-public-catalog-root]");
  if (!root) return;

  function escapeHTML(value = "") {
    const node = document.createElement("div");
    node.textContent = String(value ?? "");
    return node.innerHTML;
  }

  function apiBase() {
    try {
      if (typeof API_URL !== "undefined" && API_URL) return String(API_URL).replace(/\/+$/, "");
    } catch {
      // Les pages SSR exposent leur API dans SONARA_PUBLIC_API_URL.
    }
    return String(window.SONARA_PUBLIC_API_URL || "").replace(/\/+$/, "");
  }

  function categoryLabel(value = "") {
    const category = String(value || "").trim().replace(/[_-]+/g, " ");
    return category ? category.charAt(0).toUpperCase() + category.slice(1) : "Sonara";
  }

  function countLabel(count) {
    return Number(count) === 1 ? "1 titre" : `${Number(count) || 0} titres`;
  }

  function setMeta(name, content, attribute = "name") {
    let meta = document.querySelector(`meta[${attribute}="${name}"]`);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attribute, name);
      document.head.appendChild(meta);
    }
    meta.content = String(content || "");
  }

  function setCanonical(url) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }

  function setStructuredData(value) {
    let script = document.getElementById("sonaraPublicStructuredData");
    if (!script) {
      script = document.createElement("script");
      script.id = "sonaraPublicStructuredData";
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(value);
  }

  function updatePackSeo(pack) {
    const url = pack.canonicalUrl || pack.publicUrl || window.location.href;
    const description = `Découvrez ${pack.title} par ${pack.artist} sur Sonara Pack.`.slice(0, 160);
    document.title = `${pack.title} - ${pack.artist} | Sonara Pack`;
    setMeta("description", description);
    setMeta("og:title", document.title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", "music.album", "property");
    setMeta("og:url", url, "property");
    if (pack.coverUrl) setMeta("og:image", pack.coverUrl, "property");
    setCanonical(url);
    setStructuredData({
      "@context": "https://schema.org",
      "@type": "MusicAlbum",
      name: pack.title,
      byArtist: { "@type": "MusicGroup", name: pack.artist },
      genre: pack.categories || [],
      numTracks: Number(pack.trackCount || 0),
      image: pack.coverUrl || undefined,
      url
    });
  }

  function updateTrackSeo(pack, track) {
    const url = track.canonicalUrl || track.publicUrl || window.location.href;
    const description = `Écoutez un aperçu de ${track.title} par ${track.artist} sur Sonara Pack.`.slice(0, 160);
    document.title = `${track.title} - ${track.artist} | Sonara Pack`;
    setMeta("description", description);
    setMeta("og:title", document.title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", "music.song", "property");
    setMeta("og:url", url, "property");
    if (track.coverUrl) setMeta("og:image", track.coverUrl, "property");
    setCanonical(url);
    setStructuredData({
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      name: track.title,
      byArtist: { "@type": "MusicGroup", name: track.artist },
      inAlbum: pack?.title ? { "@type": "MusicAlbum", name: pack.title } : undefined,
      image: track.coverUrl || undefined,
      url
    });
  }

  function audioMarkup(track = {}) {
    if (!track.previewAudioUrl) return "";
    const previewDuration = Math.min(30, Math.max(1, Number(track.previewDuration || 30)));
    return `
      <div class="public-catalog-audio-row" data-public-preview-player>
        <button class="public-catalog-preview-play" type="button" data-preview-toggle aria-label="Aperçu audio"></button>
        <div class="public-catalog-preview-body">
          <strong data-user-content>${escapeHTML(track.title || "Track Sonara")}</strong>
          <div class="public-catalog-preview-progress" data-preview-progress role="slider" tabindex="0" aria-label="Aperçu audio" aria-valuemin="0" aria-valuemax="${Math.round(previewDuration)}" aria-valuenow="0">
            <span class="public-catalog-preview-progress-fill" data-preview-progress-fill></span>
            <span class="public-catalog-preview-progress-thumb" data-preview-progress-thumb></span>
          </div>
          <div class="public-catalog-preview-time"><span data-preview-current>0:00</span><span data-preview-total>0:${String(Math.round(previewDuration)).padStart(2, "0")}</span></div>
        </div>
        <audio
          class="public-catalog-preview-audio"
          preload="metadata"
          src="${escapeHTML(track.previewAudioUrl)}"
          data-public-preview
          data-preview-start="${Math.max(0, Number(track.previewStart || 0))}"
          data-preview-duration="${previewDuration}"
        ></audio>
      </div>`;
  }

  function packMarkup(pack) {
    const category = categoryLabel(pack.category);
    return `
      <article class="public-catalog-card">
        <div>
          <img class="public-catalog-cover" src="${escapeHTML(pack.coverUrl || "")}" alt="${escapeHTML(pack.title)}" data-user-content>
        </div>
        <div>
          <p class="public-catalog-eyebrow">Catalogue public Sonara</p>
          <h1 class="public-catalog-title" data-user-content>${escapeHTML(pack.title)}</h1>
          <p class="public-catalog-artist" data-user-content>${escapeHTML(pack.artist)}</p>
          <div class="public-catalog-meta">
            <span>Catégorie · <b data-user-content>${escapeHTML(category)}</b></span>
            <span>Nombre de titres · ${escapeHTML(countLabel(pack.trackCount))}</span>
          </div>
          <section class="public-catalog-section">
            <h2>Aperçu audio</h2>
            <div class="public-catalog-audio-list">
              ${(Array.isArray(pack.tracks) ? pack.tracks : []).filter((track) => track.previewAudioUrl).slice(0, 6).map(audioMarkup).join("") || "<p>Aucun aperçu audio disponible.</p>"}
            </div>
          </section>
          <section class="public-catalog-section public-catalog-license">
            <h2>Licence</h2>
            <p>${escapeHTML(pack.license?.name || "Licence standard Sonara")}</p>
          </section>
          <div class="public-catalog-actions">
            <a class="public-catalog-action primary" href="/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}">Découvrir sur Sonara Pack</a>
            <a class="public-catalog-action" href="/home.html">Retour au catalogue</a>
          </div>
        </div>
      </article>`;
  }

  function trackMarkup(pack, track) {
    const category = categoryLabel(pack?.category);
    return `
      <article class="public-catalog-card">
        <div>
          <img class="public-catalog-cover" src="${escapeHTML(track.coverUrl || "")}" alt="${escapeHTML(track.title)}" data-user-content>
        </div>
        <div>
          <p class="public-catalog-eyebrow">Publié sur Sonara Pack</p>
          <h1 class="public-catalog-title" data-user-content>${escapeHTML(track.title)}</h1>
          <p class="public-catalog-artist" data-user-content>${escapeHTML(track.artist)}</p>
          <div class="public-catalog-meta">
            <span>Catégorie · <b data-user-content>${escapeHTML(category)}</b></span>
            <span>Pack · <b data-user-content>${escapeHTML(pack?.title || "Sonara Pack")}</b></span>
          </div>
          <section class="public-catalog-section">
            <h2>Aperçu audio</h2>
            <div class="public-catalog-audio-list">${audioMarkup(track) || "<p>Aucun aperçu audio disponible.</p>"}</div>
          </section>
          <div class="public-catalog-actions">
            <a class="public-catalog-action primary" href="/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}&trackId=${encodeURIComponent(track.id)}">Ouvrir le pack complet</a>
            <a class="public-catalog-action" href="/home.html">Retour au catalogue</a>
          </div>
        </div>
      </article>`;
  }

  function formatPreviewTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value || 0)));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function bindPreviews() {
    const players = Array.from(document.querySelectorAll("[data-public-preview-player]"));
    const audios = players.map((player) => player.querySelector("audio[data-public-preview]")).filter(Boolean);

    players.forEach((player) => {
      if (player.dataset.previewBound === "true") return;
      player.dataset.previewBound = "true";

      const audio = player.querySelector("audio[data-public-preview]");
      const toggle = player.querySelector("[data-preview-toggle]");
      const progress = player.querySelector("[data-preview-progress]");
      const fill = player.querySelector("[data-preview-progress-fill]");
      const thumb = player.querySelector("[data-preview-progress-thumb]");
      const currentLabel = player.querySelector("[data-preview-current]");
      const totalLabel = player.querySelector("[data-preview-total]");
      if (!audio || !toggle || !progress || !fill || !thumb) return;

      const requestedStart = Math.max(0, Number(audio.dataset.previewStart || 0));
      const requestedDuration = Math.min(30, Math.max(1, Number(audio.dataset.previewDuration || 30)));
      let start = requestedStart;
      let end = start + requestedDuration;

      function windowDuration() {
        return Math.max(1, end - start);
      }

      function sync() {
        const duration = windowDuration();
        const elapsed = Math.max(0, Math.min(duration, Number(audio.currentTime || 0) - start));
        const ratio = Math.max(0, Math.min(1, elapsed / duration));
        fill.style.width = `${ratio * 100}%`;
        thumb.style.left = `${ratio * 100}%`;
        currentLabel && (currentLabel.textContent = formatPreviewTime(elapsed));
        totalLabel && (totalLabel.textContent = formatPreviewTime(duration));
        progress.setAttribute("aria-valuemax", String(Math.round(duration)));
        progress.setAttribute("aria-valuenow", String(Math.round(elapsed)));
        toggle.classList.toggle("is-playing", !audio.paused);
      }

      function resolveBounds() {
        const fullDuration = Number(audio.duration || 0);
        if (Number.isFinite(fullDuration) && fullDuration > 0) {
          start = Math.min(requestedStart, Math.max(0, fullDuration - 0.05));
          end = Math.min(fullDuration, start + requestedDuration);
        } else {
          start = requestedStart;
          end = start + requestedDuration;
        }
        if (!Number.isFinite(audio.currentTime) || audio.currentTime < start || audio.currentTime >= end) {
          try { audio.currentTime = start; } catch { /* métadonnées pas encore prêtes */ }
        }
        sync();
      }

      function seekRatio(ratio) {
        const clamped = Math.max(0, Math.min(1, Number(ratio || 0)));
        try { audio.currentTime = start + clamped * windowDuration(); } catch { /* lecture non prête */ }
        sync();
      }

      toggle.addEventListener("click", () => {
        if (!audio.paused) {
          audio.pause();
          return;
        }
        audios.forEach((other) => { if (other !== audio && !other.paused) other.pause(); });
        if (!Number.isFinite(audio.currentTime) || audio.currentTime < start || audio.currentTime >= end - 0.04) {
          try { audio.currentTime = start; } catch { /* lecture non prête */ }
        }
        audio.play().catch(() => {});
      });

      progress.addEventListener("pointerdown", (event) => {
        const rect = progress.getBoundingClientRect();
        if (!rect.width) return;
        seekRatio((event.clientX - rect.left) / rect.width);
      });

      progress.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const elapsed = Math.max(0, Number(audio.currentTime || 0) - start);
        const delta = event.key === "ArrowRight" ? 5 : -5;
        seekRatio((elapsed + delta) / windowDuration());
      });

      audio.addEventListener("loadedmetadata", resolveBounds, { once: true });
      audio.addEventListener("play", sync);
      audio.addEventListener("pause", sync);
      audio.addEventListener("timeupdate", () => {
        if (audio.currentTime >= end - 0.04) {
          audio.pause();
          try { audio.currentTime = start; } catch { /* aucun impact */ }
        }
        sync();
      });
      audio.addEventListener("ended", () => {
        try { audio.currentTime = start; } catch { /* aucun impact */ }
        sync();
      });

      if (audio.readyState >= 1) resolveBounds();
      else sync();
    });
  }

  function finishRender(markup) {
    root.className = "";
    root.innerHTML = markup;
    bindPreviews();
    window.SonaraI18n?.refresh?.();
  }

  async function loadFallbackPage() {
    if (document.body.dataset.publicCatalogLoad !== "true") {
      bindPreviews();
      return;
    }

    const type = String(document.body.dataset.publicCatalogType || "pack");
    const params = new URLSearchParams(window.location.search);
    const base = apiBase();
    if (!base) throw new Error("API Sonara indisponible.");

    let url = "";
    if (type === "track") {
      const packId = String(params.get("packId") || params.get("id") || "").trim();
      const trackId = String(params.get("trackId") || "").trim();
      if (!packId || !trackId) throw new Error("Lien de track invalide.");
      url = `${base}/api/public/catalog/track/${encodeURIComponent(packId)}/${encodeURIComponent(trackId)}`;
    } else {
      const packId = String(params.get("id") || "").trim();
      if (!packId) throw new Error("Lien de pack invalide.");
      url = `${base}/api/public/catalog/pack/${encodeURIComponent(packId)}`;
    }

    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success !== true) throw new Error(data.message || "Contenu public indisponible.");

    if (type === "track") {
      updateTrackSeo(data.pack, data.track);
      finishRender(trackMarkup(data.pack, data.track));
    } else {
      updatePackSeo(data.pack);
      finishRender(packMarkup(data.pack));
    }
  }

  loadFallbackPage().catch((error) => {
    console.warn("Page publique Sonara indisponible :", error?.message || error);
    root.className = "public-catalog-error";
    root.textContent = "Contenu public indisponible.";
    window.SonaraI18n?.refresh?.();
  });
})();
