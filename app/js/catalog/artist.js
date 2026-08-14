const artistContent = document.querySelector(".artist-public-content");
const artistParams = new URLSearchParams(window.location.search);
const requestedArtistId = String(artistParams.get("id") || "").trim();

let artistCatalogue = [];
let artistPacks = [];
let publicArtist = null;
let activePreview = null;

function artistSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function artistEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function artistFilePath(file) {
  if (!file) return "";

  const rawValue = typeof file === "object"
    ? (file.url || file.path || file.key || file.location || file.src || "")
    : file;

  const value = String(rawValue || "")
    .trim()
    .replace(/\\/g, "/");

  if (!value) return "";
  if (value.startsWith("/app/")) return encodeURI(value);
  if (value.startsWith("app/")) return encodeURI(`/${value}`);

  if (/^(https?:|blob:|data:)/i.test(value)) return encodeURI(value);
  if (value.startsWith("/downloads/")) return encodeURI(`${API_URL}${value}`);
  if (value.startsWith("downloads/")) return encodeURI(`${API_URL}/${value}`);
  if (value.startsWith("/uploads/")) return encodeURI(`${API_URL}${value}`);
  if (value.startsWith("uploads/")) return encodeURI(`${API_URL}/${value}`);

  return encodeURI(`${API_URL}/uploads/${value.replace(/^\/+/, "")}`);
}

function artistPrice(value) {
  if (window.SonaraCommercial?.getState?.().mode === "PRE_V1") {
    return "Gratuit";
  }

  const price = String(value ?? "").trim();

  if (!price) return "Voir";
  if (["gratuit", "free"].includes(price.toLowerCase())) return "Gratuit";

  const numeric = Number(
    price
      .replace(/\s*€\s*$/, "")
      .replace(",", ".")
  );

  if (Number.isFinite(numeric)) {
    return `${numeric.toFixed(2)}€`;
  }

  return /€\s*$/.test(price) ? price : `${price}€`;
}

function getPackArtistId(pack = {}) {
  return String(
    pack.artistProfile?.accountId ||
    pack.accountId ||
    pack.artistAccountId ||
    pack.artistId ||
    ""
  ).trim();
}

function getPackArtist(pack = {}) {
  const profile = pack.artistProfile && typeof pack.artistProfile === "object"
    ? pack.artistProfile
    : {};

  return {
    accountId: getPackArtistId(pack),
    name: String(
      profile.name ||
      profile.pseudo ||
      pack.artist ||
      pack.pseudo ||
      "Artiste Sonara"
    ).trim(),
    avatar:
      profile.avatar ||
      profile.imageArtist ||
      profile.imageProfile ||
      pack.imageArtist ||
      pack.imageProfile ||
      "",
    imageArtist: profile.imageArtist || pack.imageArtist || "",
    artistRewards: Array.isArray(profile.artistRewards) ? profile.artistRewards : [],
    imageProfile: profile.imageProfile || pack.imageProfile || "",
    biography: String(profile.biography || "").trim()
  };
}

function artistInitials(name = "") {
  return String(name || "Artiste")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "S";
}

function artistPackDestination(pack = {}, track = null) {
  if (!pack?.id) return "#";

  const base = `/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}`;

  return track?.id
    ? `${base}&trackId=${encodeURIComponent(track.id)}`
    : base;
}

function getStoredArtistViewer() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
  } catch {
    return null;
  }
}

function refreshArtistIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  window.SonaraI18n?.refresh?.();
}

function setupArtistNavigation() {
  const version = document.querySelector(".desktop-brand-version");
  if (version) {
    version.textContent = `Version ${window.SONARA_VERSION || "V5.3.8.56"}`;
  }

  const destinations = {
    home: "/home.html",
    create: "/app/pages/creator/dashboard.html",
    library: "/app/pages/catalog/library.html"
  };

  document.querySelectorAll("[data-artist-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const destination = destinations[button.dataset.artistNav];
      if (destination) window.location.href = destination;
    });
  });
}

function renderArtistFailure(title, message) {
  artistContent.innerHTML = `
    <section class="artist-public-state">
      <span class="artist-public-state-icon" aria-hidden="true">
        <i data-lucide="user-round-x"></i>
      </span>
      <h1>${artistEscape(title)}</h1>
      <p>${artistEscape(message)}</p>
      <button class="artist-public-state-button" type="button">Retour à l'accueil</button>
    </section>
  `;

  artistContent.querySelector(".artist-public-state-button")
    ?.addEventListener("click", () => {
      window.location.href = "/home.html";
    });

  refreshArtistIcons();
}

function flattenArtistTracks(packs = []) {
  const tracks = [];

  packs.forEach((pack) => {
    (Array.isArray(pack.tracks) ? pack.tracks : []).forEach((track) => {
      tracks.push({
        track,
        pack,
        referenceDate: Date.parse(
          pack.publishedAt ||
          pack.moderatedAt ||
          pack.updatedAt ||
          pack.createdAt ||
          ""
        ) || 0
      });
    });
  });

  return tracks.sort((a, b) => b.referenceDate - a.referenceDate);
}

function resolveDiscoveryPacks(allPacks = [], ownerId = "") {
  let ordered = [...allPacks];

  if (
    window.SonaraDistribution &&
    typeof window.SonaraDistribution.createHomeDistribution === "function"
  ) {
    const distribution = window.SonaraDistribution.createHomeDistribution(
      allPacks,
      { userContext: getStoredArtistViewer() }
    );

    if (Array.isArray(distribution?.items)) {
      ordered = distribution.items;
    }
  }

  const foreign = ordered.filter((pack) => getPackArtistId(pack) !== ownerId);
  const sameArtist = ordered.filter((pack) => getPackArtistId(pack) === ownerId);

  /*
    Les autres artistes passent d'abord. Si le catalogue est encore petit,
    les propres packs de l'artiste complètent la section au lieu de laisser
    un trou artificiel sur la page.
  */
  return [...foreign, ...sameArtist].slice(0, 10);
}


function artistPrimaryReward(profile = {}) {
  const rewards = Array.isArray(profile.artistRewards) ? profile.artistRewards : [];
  return rewards.find((reward) => reward?.type === "BADGE_AND_TITLE") || null;
}

function renderArtistRewardBadge(profile = {}) {
  const reward = artistPrimaryReward(profile);
  if (!reward?.badgeImage) return "";
  const src = artistFilePath(reward.badgeImage);
  if (!src) return "";
  return `<img class="artist-public-reward-badge" src="${artistEscape(src)}" alt="${artistEscape(reward.badgeLabel || reward.title || "Badge artiste")}" title="${artistEscape(reward.title || "")}">`;
}

function renderArtistRewardTitle(profile = {}) {
  const reward = artistPrimaryReward(profile);
  if (!reward?.title) return "";
  return `<p class="artist-public-reward-title">${renderArtistRewardBadge(profile)}<span>${artistEscape(reward.title)}</span></p>`;
}

function renderArtistPhoto(profile) {
  const image = artistFilePath(
    profile.imageArtist || profile.avatar || profile.imageProfile
  );

  if (image) {
    return `<img src="${artistEscape(image)}" alt="Photo de ${artistEscape(profile.name)}">`;
  }

  return `<span class="artist-public-photo-fallback">${artistEscape(artistInitials(profile.name))}</span>`;
}

function renderArtistMiniAvatar(profile = {}) {
  const image = artistFilePath(
    profile.avatar ||
    profile.imageArtist ||
    profile.imageProfile
  );

  return `
    <span class="artist-public-mini-avatar" aria-hidden="true">
      <span>${artistEscape(artistInitials(profile.name))}</span>
      ${image
        ? `<img src="${artistEscape(image)}" alt="" loading="lazy">`
        : ""
      }
    </span>
  `;
}

function renderTrackRows(trackEntries = []) {
  if (!trackEntries.length) {
    return `
      <div class="artist-public-empty-section">
        Les sons publiés par cet artiste apparaîtront ici.
      </div>
    `;
  }

  return `
    <div class="artist-track-list">
      ${trackEntries.map(({ track, pack }, index) => {
        const cover = artistFilePath(track.coverPack || pack.coverPack || pack.cover);
        const audio = artistFilePath(track.audioName || track.audio);
        const previewLimit = Math.max(
          1,
          Math.min(30, artistSafeNumber(track.previewDuration, 30) || 30)
        );
        const destination = artistPackDestination(pack, track);

        return `
          <article class="artist-track-row" data-preview-limit="${previewLimit}">
            <span class="artist-track-index">${String(index + 1).padStart(2, "0")}</span>

            <div class="artist-track-cover-wrap">
              <span class="artist-track-cover-fallback" aria-hidden="true">
                <i data-lucide="music-2"></i>
              </span>
              ${cover ? `<img class="artist-track-cover" src="${artistEscape(cover)}" alt="">` : ""}
            </div>

            <div class="artist-track-main">
              <p class="artist-track-title" data-user-content>${artistEscape(track.title || "Sans titre")}</p>
              <p class="artist-track-pack" data-user-content>${artistEscape(pack.title || "Pack Sonara")}</p>
            </div>

            <a class="artist-track-pack-link" href="${artistEscape(destination)}">
              ${artistEscape(pack.title || "Voir le pack")}
            </a>

            <button
              class="artist-track-preview"
              type="button"
              ${audio ? `data-audio="${artistEscape(audio)}"` : "disabled"}
              aria-label="Écouter 30 secondes de ${artistEscape(track.title || "ce son")}" 
            >
              <i data-lucide="play"></i>
              <span class="artist-track-preview-time">${previewLimit}</span>
            </button>

            <a class="artist-track-price" href="${artistEscape(destination)}">
              ${artistEscape(artistPrice(track.price || track.trackPrice || track.unitPrice))}
            </a>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderPackCard(pack = {}) {
  const profile = getPackArtist(pack);
  const cover = artistFilePath(pack.coverPack || pack.cover || pack.coverUrl || pack.imagePack || pack.image);
  const avatar = artistFilePath(profile.avatar);

  return `
    <a class="artist-pack-card" href="${artistEscape(artistPackDestination(pack))}">
      <div class="artist-pack-cover">
        <span class="artist-pack-cover-fallback" aria-hidden="true">
          <i data-lucide="package"></i>
        </span>
        ${cover ? `<img src="${artistEscape(cover)}" alt="Cover de ${artistEscape(pack.title || "Pack Sonara")}" loading="lazy">` : ""}
      </div>

      <p class="artist-pack-title" data-user-content>${artistEscape(pack.title || "Pack sans titre")}</p>

      <div class="artist-pack-meta">
        <span class="artist-pack-avatar" aria-hidden="true">
          <span>${artistEscape(artistInitials(profile.name))}</span>
          ${avatar ? `<img src="${artistEscape(avatar)}" alt="" loading="lazy">` : ""}
        </span>
        ${renderArtistRewardBadge(profile)}
        <span class="artist-pack-artist" data-user-content>${artistEscape(profile.name)}</span>
      </div>
    </a>
  `;
}

function renderPackRail(packs = [], emptyMessage = "Aucun pack pour le moment.") {
  if (!packs.length) {
    return `<div class="artist-public-empty-section">${artistEscape(emptyMessage)}</div>`;
  }

  return `
    <div class="artist-pack-rail">
      ${packs.map(renderPackCard).join("")}
    </div>
  `;
}

function renderArtistPage() {
  const tracks = flattenArtistTracks(artistPacks);
  const discoveryPacks = resolveDiscoveryPacks(
    artistCatalogue,
    publicArtist.accountId
  );
  const firstPack = artistPacks[0] || null;
  const firstTrack = tracks[0] || null;

  artistContent.innerHTML = `
    <section class="artist-public-hero">
      <button class="artist-public-back" type="button" aria-label="Retour">
        <i data-lucide="chevron-left"></i>
      </button>

      <div class="artist-public-photo">
        ${renderArtistPhoto(publicArtist)}
      </div>

      <div class="artist-public-identity">
        <p class="artist-public-eyebrow">ARTISTE SONARA PACK</p>

        <div class="artist-public-name-row">
          ${renderArtistMiniAvatar(publicArtist)}
          ${renderArtistRewardBadge(publicArtist)}
          <h1 class="artist-public-name" data-user-content>${artistEscape(publicArtist.name)}</h1>
        </div>
        ${renderArtistRewardTitle(publicArtist)}

        <div class="artist-public-stats">
          <span>${tracks.length} ${tracks.length > 1 ? "sons" : "son"}</span>
          <span>${artistPacks.length} ${artistPacks.length > 1 ? "packs" : "pack"}</span>
        </div>

        ${publicArtist.biography
          ? `<p class="artist-public-biography" data-user-content>${artistEscape(publicArtist.biography)}</p>`
          : ""
        }

        <div class="artist-public-actions">
          ${firstTrack
            ? `<button class="artist-public-play-all" type="button" data-play-first>
                <i data-lucide="play"></i>
                Écouter
              </button>`
            : ""
          }

          ${firstPack
            ? `<a class="artist-public-open-first-pack" href="${artistEscape(artistPackDestination(firstPack))}">
                <i data-lucide="package-open"></i>
                Voir le pack
              </a>`
            : ""
          }
        </div>
      </div>
    </section>

    <section class="artist-public-section" data-artist-tracks>
      <header class="artist-public-section-header">
        <div class="artist-public-section-copy">
          <h2>Sons</h2>
        </div>
      </header>
      ${renderTrackRows(tracks)}
    </section>

    <section class="artist-public-section">
      <header class="artist-public-section-header">
        <div class="artist-public-section-copy">
          <h2>Discographie</h2>
        </div>
      </header>
      ${renderPackRail(artistPacks, "La discographie de cet artiste arrivera ici.")}
    </section>

    <section class="artist-public-section">
      <header class="artist-public-section-header">
        <div class="artist-public-section-copy">
          <h2>À découvrir sur Sonara Pack</h2>
        </div>
      </header>
      ${renderPackRail(discoveryPacks, "Les prochains packs du catalogue apparaîtront ici.")}
    </section>
  `;

  artistContent.querySelector(".artist-public-back")
    ?.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "/home.html";
      }
    });

  setupPreviewPlayers();

  artistContent.querySelector("[data-play-first]")
    ?.addEventListener("click", () => {
      artistContent.querySelector(".artist-track-preview:not(:disabled)")?.click();
    });

  refreshArtistIcons();
}

function setupArtistImageFallbacks() {
  artistContent
    .querySelectorAll(
      ".artist-public-photo img, .artist-public-mini-avatar img, .artist-track-cover, .artist-pack-cover img, .artist-pack-avatar img"
    )
    .forEach((image) => {
      image.addEventListener(
        "error",
        () => image.remove(),
        { once: true }
      );
    });
}

function stopArtistPreview(reset = true) {
  if (!activePreview) return;

  const { audio, button, row, limit, onTimeUpdate, onEnded } = activePreview;

  audio.pause();
  audio.removeEventListener("timeupdate", onTimeUpdate);
  audio.removeEventListener("ended", onEnded);

  if (reset) audio.currentTime = 0;

  button.classList.remove("is-playing");
  button.innerHTML = `
    <i data-lucide="play"></i>
    <span class="artist-track-preview-time">${limit}</span>
  `;
  row?.classList.remove("is-playing");

  activePreview = null;
  refreshArtistIcons();
}

function setupPreviewPlayers() {
  artistContent.querySelectorAll(".artist-track-preview[data-audio]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        if (activePreview?.button === button) {
          stopArtistPreview(true);
          return;
        }

        stopArtistPreview(true);

        const row = button.closest(".artist-track-row");
        const limit = Math.max(
          1,
          Math.min(30, artistSafeNumber(row?.dataset.previewLimit, 30))
        );
        const audio = new Audio(button.dataset.audio);
        audio.preload = "metadata";

        button.classList.add("is-playing");
        button.innerHTML = `
          <i data-lucide="pause"></i>
          <span class="artist-track-preview-time">${limit}</span>
        `;
        row?.classList.add("is-playing");
        refreshArtistIcons();

        const timer = button.querySelector(".artist-track-preview-time");

        const updateTimer = () => {
          const remaining = Math.max(0, Math.ceil(limit - audio.currentTime));
          if (timer) timer.textContent = String(remaining);

          if (audio.currentTime >= limit) {
            stopArtistPreview(true);
          }
        };

        const handleEnded = () => stopArtistPreview(true);

        activePreview = {
          audio,
          button,
          row,
          timer,
          limit,
          onTimeUpdate: updateTimer,
          onEnded: handleEnded
        };

        audio.addEventListener("timeupdate", updateTimer);
        audio.addEventListener("ended", handleEnded);

        try {
          audio.currentTime = 0;
          await audio.play();
        } catch (error) {
          console.error("Lecture preview artiste impossible :", error);
          stopArtistPreview(true);
        }
      });
    });
}

async function loadPublicArtist() {
  if (!requestedArtistId) {
    renderArtistFailure(
      "Artiste introuvable",
      "Aucun identifiant artiste n'a été fourni."
    );
    return;
  }

  try {
    await window.SonaraCommercial?.ready?.();

    const response = await fetch(`${API_URL}/api/packs`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    const data = await response.json();

    if (!response.ok || !Array.isArray(data)) {
      throw new Error(data?.message || data?.error || "Catalogue indisponible.");
    }

    artistCatalogue = data.filter((pack) =>
      String(pack?.status || "").toLowerCase() === "approved" &&
      pack?.moderationHidden !== true
    );

    artistPacks = artistCatalogue.filter((pack) =>
      getPackArtistId(pack) === requestedArtistId
    );

    if (!artistPacks.length) {
      renderArtistFailure(
        "Profil indisponible",
        "Aucun contenu public de cet artiste n'est disponible pour le moment."
      );
      return;
    }

    publicArtist = getPackArtist(artistPacks[0]);

    renderArtistPage();
  } catch (error) {
    console.error("Erreur profil artiste public :", error);
    renderArtistFailure(
      "Impossible d'ouvrir ce profil",
      "Sonara Pack n'arrive pas à charger la discographie pour le moment."
    );
  }
}

window.addEventListener("beforeunload", () => stopArtistPreview(false));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopArtistPreview(true);
});

setupArtistNavigation();
refreshArtistIcons();
loadPublicArtist();
