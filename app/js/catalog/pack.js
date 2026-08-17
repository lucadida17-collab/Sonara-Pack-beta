
function packArtistRewardBadgeMarkup(profile = {}) {
  const rewards = Array.isArray(profile?.artistRewards) ? profile.artistRewards : [];
  const reward = rewards.find((item) => item?.type === "BADGE_AND_TITLE" && item?.badgeImage);
  if (!reward) return "";
  return `<img class="pack-artist-reward-badge" src="${getFilePath(reward.badgeImage)}" alt="${reward.badgeLabel || reward.title || "Badge artiste"}" title="${reward.title || ""}">`;
}

function showPopup({ type = "info", title = "", message = "" }) {
  const oldPopup = document.querySelector(".sonara-popup-overlay");
  if (oldPopup) oldPopup.remove();

  const popup = document.createElement("div");
  popup.className = "sonara-popup-overlay";

  popup.innerHTML = `
    <div class="sonara-popup ${type}">
      <h3>${title}</h3>
      <p>${message}</p>
      <button class="sonara-popup-btn">OK</button>
    </div>
  `;

  document.body.appendChild(popup);
  window.SonaraI18n?.refresh?.();

  popup.querySelector(".sonara-popup-btn").addEventListener("click", () => {
    popup.remove();
  });
}

let selectedPackId = null;
let selectedTrackId = null;
let selectedPurchaseType = null;

/*
  Le titre principal du pack garde sa taille CSS normale tant qu'elle tient.
  Si le titre devient long, Sonara réduit automatiquement la police jusqu'à
  un seuil lisible. Contrairement aux cartes du catalogue, le titre complet
  reste toujours visible sur la page Pack : aucune ellipse ici.
*/
let packTitleFitFrame = 0;

function fitPackPageTitle() {
  const titleElement = document.querySelector("body.pack-page .pack-info > .title");
  if (!(titleElement instanceof HTMLElement)) return;

  titleElement.style.removeProperty("font-size");

  const baseStyle = window.getComputedStyle(titleElement);
  const baseSize = Number.parseFloat(baseStyle.fontSize);

  if (!Number.isFinite(baseSize) || baseSize <= 0 || titleElement.clientWidth <= 0) {
    return;
  }

  const isMobile = window.innerWidth < 900;
  const targetLines = isMobile ? 3 : 2;
  const minimumSize = Math.max(isMobile ? 22 : 24, baseSize * 0.58);

  const lineCount = () => {
    const style = window.getComputedStyle(titleElement);
    const lineHeight = Number.parseFloat(style.lineHeight) ||
      (Number.parseFloat(style.fontSize) * 1.05);
    return lineHeight > 0 ? titleElement.scrollHeight / lineHeight : 1;
  };

  if (lineCount() <= targetLines + 0.05) {
    return;
  }

  let low = minimumSize;
  let high = baseSize;

  for (let index = 0; index < 8; index += 1) {
    const candidate = (low + high) / 2;
    titleElement.style.setProperty("font-size", `${candidate}px`, "important");

    if (lineCount() <= targetLines + 0.05) {
      low = candidate;
    } else {
      high = candidate;
    }
  }

  titleElement.style.setProperty("font-size", `${low.toFixed(2)}px`, "important");
}

function schedulePackPageTitleFit() {
  window.cancelAnimationFrame(packTitleFitFrame);
  packTitleFitFrame = window.requestAnimationFrame(fitPackPageTitle);
}

window.addEventListener("resize", schedulePackPageTitleFit, { passive: true });

if (document.fonts?.ready) {
  document.fonts.ready.then(schedulePackPageTitleFit).catch(() => {});
}

const PACK_LICENSE_PERMISSION_LABELS = {
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

const PACK_LICENSE_RESTRICTION_LABELS = {
  standaloneResale: "Revente isolée",
  redistribution: "Partage ou redistribution",
  musicPlatformUpload: "Upload musical autonome",
  contentIdRegistration: "Enregistrement Content ID",
  sublicensing: "Sous-licence",
  misleadingOwnership: "Fausse propriété"
};

const PACK_DEFAULT_LICENSE = {
  version: 1,
  name: "Licence standard Sonara",
  creditRequired: false,
  permissions: Object.fromEntries(
    Object.keys(PACK_LICENSE_PERMISSION_LABELS).map((key) => [key, true])
  ),
  restrictions: Object.fromEntries(
    Object.keys(PACK_LICENSE_RESTRICTION_LABELS).map((key) => [key, true])
  ),
  customPermissions: [],
  customRestrictions: [],
  customTerms: ""
};

function escapePackLicenseHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizePackLicense(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...PACK_DEFAULT_LICENSE,
    ...source,
    permissions: {
      ...PACK_DEFAULT_LICENSE.permissions,
      ...(source.permissions || {})
    },
    restrictions: {
      ...PACK_DEFAULT_LICENSE.restrictions,
      ...(source.restrictions || {})
    },
    customPermissions: Array.isArray(source.customPermissions)
      ? source.customPermissions.filter(Boolean)
      : [],
    customRestrictions: Array.isArray(source.customRestrictions)
      ? source.customRestrictions.filter(Boolean)
      : []
  };
}

function packLicenseList(labels, states, customItems) {
  return [
    ...Object.entries(labels)
      .filter(([key]) => Boolean(states?.[key]))
      .map(([, label]) => label),
    ...(Array.isArray(customItems) ? customItems : [])
  ];
}

function renderPackLicenseNotice(pack, selectedItem = null) {
  const license = normalizePackLicense(pack?.license);
  const permissions = packLicenseList(
    PACK_LICENSE_PERMISSION_LABELS,
    license.permissions,
    license.customPermissions
  );
  const restrictions = packLicenseList(
    PACK_LICENSE_RESTRICTION_LABELS,
    license.restrictions,
    license.customRestrictions
  );
  const itemTitle = selectedItem && selectedItem !== pack
    ? `${selectedItem.title || "Track"} — ${pack?.title || pack?.name || "Pack Sonara"}`
    : (pack?.title || pack?.name || "Pack Sonara");

  const packLabel = document.querySelector(".notice-license-pack");
  const title = document.getElementById("licenseNoticeTitle");
  const permissionList = document.querySelector(".notice-license-permissions");
  const restrictionList = document.querySelector(".notice-license-restrictions");
  const details = document.querySelector(".notice-license-details");
  const customTerms = document.querySelector(".notice-license-custom");
  const credit = document.querySelector(".notice-license-credit");
  const price = document.querySelector(".notice-license-price");
  const confirmation = document.querySelector(".notice-license-confirmation");

  if (title) title.textContent = license.name || "Licence d’utilisation";
  if (packLabel) packLabel.textContent = itemTitle;
  if (price) {
    const displayedPrice = displayPriceWithEuro(
      selectedItem?.price ??
      selectedItem?.trackPrice ??
      selectedItem?.unitPrice ??
      pack?.price ??
      pack?.packPrice ??
      pack?.totalPrice
    ) || "Prix indisponible";

    price.textContent = isPreV1CommercialMode()
      ? `Prix prévu : ${displayedPrice}`
      : displayedPrice;
  }

  if (confirmation) {
    confirmation.textContent = isPreV1CommercialMode()
      ? "En acceptant, cette licence sera associée à votre téléchargement."
      : "En acceptant, vous confirmez avoir lu cette licence. La version acceptée sera associée à votre achat.";
  }
  if (permissionList) {
    permissionList.innerHTML = permissions.length
      ? permissions.map((item) => `<li>${escapePackLicenseHtml(item)}</li>`).join("")
      : "<li>Aucune utilisation supplémentaire n’est accordée.</li>";
  }
  if (restrictionList) {
    restrictionList.innerHTML = restrictions.length
      ? restrictions.map((item) => `<li>${escapePackLicenseHtml(item)}</li>`).join("")
      : "<li>Aucune restriction personnalisée supplémentaire.</li>";
  }
  if (details && customTerms) {
    const hasTerms = Boolean(String(license.customTerms || "").trim());
    details.hidden = !hasTerms;
    customTerms.textContent = hasTerms ? license.customTerms : "";
  }
  if (credit) credit.hidden = !license.creditRequired;

  if (window.lucide) lucide.createIcons();
  window.SonaraI18n?.refresh?.();
}

function openPackLicenseNotice(selectedItem = null) {
  renderPackLicenseNotice(packData, selectedItem);
  const overlay = document.querySelector(".notice-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  document.body.classList.add("license-modal-open");
  overlay.querySelector(".notice-close")?.focus();
}

function closePackLicenseNotice() {
  const overlay = document.querySelector(".notice-overlay");
  if (overlay) overlay.style.display = "none";
  document.body.classList.remove("license-modal-open");
}

function getStoredPackProfile() {
  const rawProfile = localStorage.getItem("sonaraProfile");

  if (!rawProfile) {
    return null;
  }

  try {
    return JSON.parse(rawProfile);
  } catch (error) {
    console.error("Profil Sonara local invalide :", error);
    return null;
  }
}


const PACK_MIN_LOADING_TIME = 700;

function updatePackLoading(progress, message) {
  const loader = document.querySelector(".my-pack-page-loader");
  const fill = loader?.querySelector(".my-pack-loader-progress-fill");
  const label = loader?.querySelector(".my-pack-loader-message");
  const value = Math.min(100, Math.max(0, Number(progress) || 0));

  if (fill) fill.style.width = `${value}%`;
  if (label && message) label.textContent = message;
  loader?.setAttribute("aria-valuenow", String(value));
}

function waitForPackMinimum(startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, PACK_MIN_LOADING_TIME - elapsed);

  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}

async function finishPackLoading(startedAt, message = "Pack prêt") {
  updatePackLoading(92, "Finalisation de l’affichage…");
  await waitForPackMinimum(startedAt);

  updatePackLoading(100, message);

  await new Promise((resolve) => {
    window.setTimeout(resolve, 280);
  });

  const loader = document.querySelector(".my-pack-page-loader");
  const content = document.querySelector(".my-pack-loaded-content");

  loader?.classList.add("is-hidden");
  content?.classList.add("is-ready");

  window.setTimeout(() => loader?.remove(), 500);
}

function isFreeCatalogItem(item = {}) {
  return (
    item.isFree === true ||
    ["gratuit", "free"].includes(String(item.price || "").trim().toLowerCase())
  );
}

function getCommercialState() {
  return window.SonaraCommercial?.getState?.() || {
    mode: "PRE_V1",
    paymentsActive: false,
    freeAcquisitionEnabled: true
  };
}

function isPreV1CommercialMode() {
  return getCommercialState().mode === "PRE_V1";
}

function displayPreV1TrackAction(track = {}) {
  if (!isPreV1CommercialMode()) {
    return displayPriceWithEuro(track.price || track.trackPrice || track.unitPrice);
  }

  return "Gratuit";
}

async function startStripePayment() {
  console.log("====================================");
  console.log("🟢 [FRONT 1] startStripePayment lancé");

  try {
    const commercialState = await window.SonaraCommercial?.ready?.() || getCommercialState();
    const rawProfile = localStorage.getItem("sonaraProfile");

    console.log("🟢 [FRONT 2] rawProfile :", rawProfile);

    if (!rawProfile) {
      console.log("🔴 [STOP FRONT] Aucun profil localStorage");
      showPopup({
        type: "error",
        title: "Profil introuvable",
        message: "Reconnecte-toi puis réessaie."
      });
      return;
    }

    const profile = JSON.parse(rawProfile);

    console.log("🟢 [FRONT 3] Profile parsé :", profile);
    console.log("profile.id :", profile?.id);

    console.log("🟢 [FRONT 4] Sélection actuelle");
    console.log("selectedPackId :", selectedPackId);
    console.log("selectedTrackId :", selectedTrackId);
    console.log("selectedPurchaseType :", selectedPurchaseType);

    if (!selectedPackId) {
      console.log("🔴 [STOP FRONT] selectedPackId manquant");

      showPopup({
        type: "error",
        title: "Pack introuvable",
        message: "Recharge la page puis réessaie."
      });

      return;
    }

    const selectedItem = selectedTrackId
      ? packData?.tracks?.find((track) => String(track.id) === String(selectedTrackId))
      : packData;

    if (!selectedItem) {
      showPopup({
        type: "error",
        title: "Contenu introuvable",
        message: "Recharge la page puis réessaie."
      });
      return;
    }

    const userId = profile.accountId || profile.id;

    if (!userId) {
      showPopup({
        type: "error",
        title: "Compte introuvable",
        message: "Reconnecte-toi puis réessaie."
      });
      return;
    }

    const purchaseType = selectedTrackId ? "track" : "pack";

    if (commercialState.freeAcquisitionEnabled || isFreeCatalogItem(selectedItem)) {
      const freeResponse = await fetch(`${API_URL}/api/free-download-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          packId: selectedPackId,
          trackId: selectedTrackId || null,
          licenseVersion: Number(packData?.license?.version || 1),
          licenseId: String(
            packData?.license?.id ||
            `${selectedPackId}:license:v${Number(packData?.license?.version || 1)}`
          )
        })
      });

      const freeData = await freeResponse.json();

      if (!freeResponse.ok || !freeData.redirectUrl) {
        showPopup({
          type: "error",
          title: "Téléchargement impossible",
          message: freeData.message || freeData.error || "Réessaie dans un instant."
        });
        return;
      }

      window.location.href = freeData.redirectUrl;
      return;
    }

    const payload = {
      userId,
      packId: selectedPackId,
      trackId: selectedTrackId || null,
      purchaseType
    };

    console.log("🟢 [FRONT 5] Préparation du chargement Stripe :", payload);

    sessionStorage.setItem(
      "sonaraStripePurchase",
      JSON.stringify({
        ...payload,
        returnUrl: window.location.href,
        licenseVersion: Number(packData?.license?.version || 1),
        licenseId: String(packData?.license?.id || `${selectedPackId}:license:v${Number(packData?.license?.version || 1)}`),
        createdAt: Date.now()
      })
    );

    const noticeOverlay = document.querySelector(".notice-overlay");
    const acceptButton = document.querySelector(".notice-accept");

    if (noticeOverlay) closePackLicenseNotice();
    if (acceptButton) {
      acceptButton.disabled = true;
      acceptButton.textContent = "Chargement...";
    }

    window.location.href = "/app/pages/system/stripe-loading.html";

  } catch (err) {
    console.log("🔴 [ERREUR FRONT CATCH]");
    console.error(err);
    console.log("Message :", err.message);
    console.log("====================================");

    showPopup({
      type: "error",
      title: "Erreur paiement",
      message: "Impossible de lancer le paiement pour le moment."
    });
  }
}
function getFilePath(file) {
  if (!file) return "";

  const value = String(file).trim();

  if (value.startsWith("/app/")) return encodeURI(value);
  if (value.startsWith("app/")) return encodeURI(`/${value}`);

  if (/^(https?:|blob:|data:)/i.test(value)) return value;

  if (value.startsWith("/downloads/")) return `${API_URL}${value}`;
  if (value.startsWith("downloads/")) return `${API_URL}/${value}`;

  if (value.startsWith("/uploads/")) return `${API_URL}${value}`;
  if (value.startsWith("uploads/")) return `${API_URL}/${value}`;

  return `${API_URL}/uploads/${value.replace(/^\/+/, "")}`;
}

function displayPriceWithEuro(value) {
  const price = String(value ?? "").trim();

  if (!price) return "";
  if (["gratuit", "free"].includes(price.toLowerCase())) return "Gratuit";

  const numericPrice = Number(
    price
      .replace(/\s*€\s*$/, "")
      .replace(",", ".")
  );

  if (Number.isFinite(numericPrice)) {
    return `${numericPrice.toFixed(2)}€`;
  }

  return /€\s*$/.test(price) ? price : `${price}€`;
}

const params = new URLSearchParams(window.location.search);

const packId = params.get("id");
const trackId = params.get("trackId");

let packData = null;

async function loadPack() {

  const response = await fetch(`${API_URL}/api/packs`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Chargement du pack impossible (${response.status}).`);
  }

  const packs = await response.json();

  console.log("ID DANS URL :", packId);
  console.log("PACKS REÇUS :", packs);
  console.log("IDS DISPONIBLES :", packs.map(pack => pack.id));

  packData = packs.find(pack => pack.id === packId);

  console.log("PACK :", packData);

  if (!packData) {
    throw new Error("Pack introuvable.");
  }

  renderPack();
  return packData;

}

const packList = document.querySelector(".pack-list");


const btnAccueil = document.querySelector('.accueil-btn');
const pageName = document.querySelector('.page');


const PACK_PREVIEW_DURATION = 30;
let packPreviewAnalysisPromise = null;
let packPreviewAudio = null;
let packPreviewState = null;

function packTrackPreviewReady(track = {}) {
  return Number.isFinite(Number(track.previewStart)) &&
    Number(track.previewAnalysisVersion || 0) >= 1;
}

function preparePackPreviewIntelligence() {
  if (!packData || !Array.isArray(packData.tracks)) {
    return Promise.resolve();
  }

  if (packData.tracks.every(packTrackPreviewReady)) {
    return Promise.resolve();
  }

  if (packPreviewAnalysisPromise) return packPreviewAnalysisPromise;

  packPreviewAnalysisPromise = fetch(
    `${API_URL}/api/packs/${encodeURIComponent(packData.id)}/preview-analysis`,
    {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json" }
    }
  )
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Analyse preview indisponible.");
      }

      const previewByTrack = new Map(
        (Array.isArray(data.tracks) ? data.tracks : [])
          .map((track) => [String(track.id), track])
      );

      packData.tracks.forEach((track) => {
        const preview = previewByTrack.get(String(track.id));
        if (!preview) return;
        track.previewStart = Number(preview.previewStart || 0);
        track.previewDuration = Number(preview.previewDuration || PACK_PREVIEW_DURATION);
        track.previewAnalysisVersion = Number(preview.previewAnalysisVersion || 0);
      });
    })
    .catch((error) => {
      console.warn("Sélection intelligente du preview indisponible, fallback conservé :", error);
    })
    .finally(() => {
      packPreviewAnalysisPromise = null;
    });

  return packPreviewAnalysisPromise;
}

function formatPackPreviewTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function fallbackPackPreviewStart(track, duration) {
  const stored = Number(track?.previewStart);
  if (Number.isFinite(stored) && stored >= 0) {
    return Math.min(stored, Math.max(0, duration - 1));
  }

  if (!Number.isFinite(duration) || duration <= PACK_PREVIEW_DURATION) return 0;

  return Math.min(
    Math.max(0, duration * 0.32),
    Math.max(0, duration - PACK_PREVIEW_DURATION)
  );
}

function ensurePackPreviewPlayerMarkup() {
  document.querySelector(".pack-preview-player-root")?.remove();

  const root = document.createElement("div");
  root.className = "pack-preview-player-root";
  root.innerHTML = `
    <div class="mini-player-mobile" aria-label="Lecteur preview Sonara">
      <img class="mini-player-cover" src="" alt="">

      <div class="mini-player-info">
        <h3 class="mini-player-title"></h3>
        <p class="mini-player-artist"></p>

        <div class="mini-player-progress" aria-hidden="true">
          <div class="mini-player-progress-fill"></div>
        </div>
      </div>

      <button class="mini-player-btn" type="button" aria-label="Lecture ou pause">▶</button>
    </div>

    <div class="grand-player" aria-label="Grand lecteur preview Sonara">
      <button class="grand-player-back" type="button" aria-label="Réduire le lecteur">⌄</button>

      <div class="grand-player-shell">
        <img class="grand-player-cover" src="" alt="">

        <div class="position">
          <div class="player-progress-content">
            <div class="player-time-row">
              <span class="current-time">0:00</span>
              <span class="total-time">0:30</span>
            </div>

            <div class="player-progress-bar" role="slider" aria-valuemin="0" aria-valuemax="30" aria-valuenow="0" tabindex="0">
              <div class="player-progress-fill"></div>
              <div class="player-progress-thumb"></div>
            </div>
          </div>

          <div class="grand-player-controls">
            <button class="back" type="button" aria-label="Track précédente">
              <svg class="grand-player-icon" viewBox="0 0 100 100" aria-hidden="true">
                <rect x="24" y="25" width="8" height="50" rx="2"></rect>
                <polygon points="72,25 38,50 72,75"></polygon>
              </svg>
            </button>

            <button class="grand-player-play" type="button" aria-label="Lecture ou pause">
              <svg class="grand-player-icon grand-player-play-icon" viewBox="0 0 100 100" aria-hidden="true">
                <polygon points="38,25 38,75 76,50"></polygon>
              </svg>
            </button>

            <button class="grand-player-next" type="button" aria-label="Track suivante">
              <svg class="grand-player-icon" viewBox="0 0 100 100" aria-hidden="true">
                <polygon points="28,25 62,50 28,75"></polygon>
                <rect x="68" y="25" width="8" height="50" rx="2"></rect>
              </svg>
            </button>
          </div>

          <div class="grand-player-info">
            <h3 class="grand-player-title"></h3>
            <p class="grand-player-artist"></p>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  return root;
}

function alignPackMiniPlayerToContent() {
  const miniPlayer = document.querySelector(
    "body.pack-page .pack-preview-player-root .mini-player-mobile"
  );

  if (!miniPlayer) return;

  if (!window.matchMedia("(min-width: 900px)").matches) {
    miniPlayer.style.removeProperty("left");
    miniPlayer.style.removeProperty("right");
    miniPlayer.style.removeProperty("width");
    return;
  }

  const packContent = document.querySelector("body.pack-page .pack-content");
  if (!packContent) return;

  const rect = packContent.getBoundingClientRect();
  miniPlayer.style.left = `${Math.round(rect.left)}px`;
  miniPlayer.style.right = "auto";
  miniPlayer.style.width = `${Math.round(rect.width)}px`;
}

if (!window.__sonaraPackPreviewPlayerAlignBound) {
  window.__sonaraPackPreviewPlayerAlignBound = true;
  window.addEventListener("resize", alignPackMiniPlayerToContent, { passive: true });
}

function setupPackPreviewPlayer() {
  const tracks = Array.isArray(packData?.tracks) ? packData.tracks : [];
  if (!tracks.length) return;

  if (packPreviewAudio) {
    packPreviewAudio.pause();
    packPreviewAudio.removeAttribute("src");
    packPreviewAudio.load();
  }

  const root = ensurePackPreviewPlayerMarkup();
  const audio = new Audio();
  audio.preload = "metadata";
  packPreviewAudio = audio;
  packPreviewState = null;

  const miniPlayer = root.querySelector(".mini-player-mobile");
  const miniCover = root.querySelector(".mini-player-cover");
  const miniTitle = root.querySelector(".mini-player-title");
  const miniArtist = root.querySelector(".mini-player-artist");
  const miniButton = root.querySelector(".mini-player-btn");
  const miniProgressFill = root.querySelector(".mini-player-progress-fill");

  const grandPlayer = root.querySelector(".grand-player");
  const grandBack = root.querySelector(".grand-player-back");
  const grandCover = root.querySelector(".grand-player-cover");
  const grandTitle = root.querySelector(".grand-player-title");
  const grandArtist = root.querySelector(".grand-player-artist");
  const grandPlay = root.querySelector(".grand-player-play");
  const grandPrevious = root.querySelector(".back");
  const grandNext = root.querySelector(".grand-player-next");
  const grandProgressBar = root.querySelector(".player-progress-bar");
  const grandProgressFill = root.querySelector(".player-progress-fill");
  const grandProgressThumb = root.querySelector(".player-progress-thumb");
  const grandCurrent = root.querySelector(".current-time");
  const grandTotal = root.querySelector(".total-time");
  const heroPlayButton = document.querySelector("body.pack-page .playerBtnMob");

  let switchingTrack = false;
  let draggingProgress = false;

  const currentTrack = () => Number.isInteger(packPreviewState?.trackIndex)
    ? tracks[packPreviewState.trackIndex]
    : null;

  function setGrandPlayIcon(isPlaying) {
    grandPlay.innerHTML = isPlaying
      ? `<svg class="grand-player-icon" viewBox="0 0 100 100" aria-hidden="true">
          <rect x="32" y="25" width="12" height="50" rx="2"></rect>
          <rect x="56" y="25" width="12" height="50" rx="2"></rect>
        </svg>`
      : `<svg class="grand-player-icon grand-player-play-icon" viewBox="0 0 100 100" aria-hidden="true">
          <polygon points="38,25 38,75 76,50"></polygon>
        </svg>`;
  }

  function syncPlayButtons() {
    const playing = Boolean(packPreviewState) && !audio.paused;
    miniButton.textContent = playing ? "❚❚" : "▶";
    setGrandPlayIcon(playing);

    if (heroPlayButton) {
      const firstTrackActive = packPreviewState?.trackIndex === 0;
      heroPlayButton.classList.toggle("pause", firstTrackActive && playing);
      heroPlayButton.classList.toggle("play", !(firstTrackActive && playing));
    }
  }

  function syncRows() {
    const activeTrack = currentTrack();
    const activeId = String(activeTrack?.id || "");
    const playing = Boolean(activeTrack) && !audio.paused;
    const remaining = packPreviewState
      ? Math.max(0, Math.ceil(packPreviewState.end - audio.currentTime))
      : PACK_PREVIEW_DURATION;

    document.querySelectorAll("body.pack-page [data-track-id]").forEach((row) => {
      const isActive = String(row.dataset.trackId || "") === activeId;
      const isPlaying = isActive && playing;

      row.classList.toggle("mobile-playing", isPlaying);

      const playButton = row.querySelector(".track-btn-play");
      if (playButton) {
        playButton.classList.toggle("active", isActive);
        playButton.classList.toggle("pause", isPlaying);
        playButton.classList.toggle("play", !isPlaying);
        if (isActive) playButton.style.opacity = "1";
        else playButton.style.removeProperty("opacity");
      }

      const timer = row.querySelector(".track-preview-time, .mobile-preview-time");
      if (timer) {
        timer.textContent = String(Math.min(PACK_PREVIEW_DURATION, remaining));
        if (isPlaying) timer.style.display = "flex";
        else timer.style.removeProperty("display");
      }
    });
  }

  function updatePlayerIdentity(track) {
    const title = track?.title || "Track Sonara";
    const artist = track?.artist || packData?.artistProfile?.name || packData?.artist || "Artiste Sonara";
    const cover = getFilePath(track?.coverPack || packData?.coverPack);

    miniCover.src = cover;
    miniTitle.textContent = title;
    miniArtist.textContent = artist;
    grandCover.src = cover;
    grandTitle.textContent = title;
    grandArtist.textContent = artist;
    miniPlayer.classList.add("active");
  }

  function previewWindowDuration() {
    if (!packPreviewState) return PACK_PREVIEW_DURATION;
    return Math.max(0.1, packPreviewState.end - packPreviewState.start);
  }

  function syncProgress() {
    if (!packPreviewState) return;

    const duration = previewWindowDuration();
    const elapsed = Math.max(
      0,
      Math.min(duration, audio.currentTime - packPreviewState.start)
    );
    const ratio = Math.min(1, elapsed / duration);

    miniProgressFill.style.width = `${ratio * 100}%`;
    grandProgressFill.style.width = `${ratio * 100}%`;
    grandProgressThumb.style.left = `${ratio * 100}%`;
    grandProgressBar.setAttribute("aria-valuemax", String(Math.round(duration)));
    grandProgressBar.setAttribute("aria-valuenow", String(Math.round(elapsed)));
    grandCurrent.textContent = formatPackPreviewTime(elapsed);
    grandTotal.textContent = formatPackPreviewTime(duration);
    syncRows();
  }

  function waitForMetadata() {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Audio preview indisponible."));
      };
      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("loadedmetadata", onLoaded, { once: true });
      audio.addEventListener("error", onError, { once: true });
    });
  }

  async function selectTrack(index, { autoplay = true } = {}) {
    const track = tracks[index];
    if (!track) return;

    await Promise.race([
      preparePackPreviewIntelligence(),
      new Promise((resolve) => window.setTimeout(resolve, 2200))
    ]);

    const source = getFilePath(track.audioName || track.audio);
    if (!source) return;

    let absoluteSource = source;
    try {
      absoluteSource = new URL(source, window.location.href).href;
    } catch {}

    if (audio.src !== absoluteSource) {
      audio.pause();
      audio.src = source;
      audio.load();

      try {
        await waitForMetadata();
      } catch (error) {
        showPopup({
          type: "error",
          title: "Preview indisponible",
          message: error.message
        });
        return;
      }
    }

    const duration = Number(audio.duration || track.duration || 0);
    const start = fallbackPackPreviewStart(track, duration);
    const requestedDuration = Math.min(
      PACK_PREVIEW_DURATION,
      Math.max(1, Number(track.previewDuration || PACK_PREVIEW_DURATION))
    );
    const end = duration > 0
      ? Math.min(duration, start + requestedDuration)
      : start + requestedDuration;

    packPreviewState = {
      trackIndex: index,
      start,
      end
    };

    updatePlayerIdentity(track);
    audio.currentTime = start;
    syncProgress();

    if (autoplay) {
      try {
        await audio.play();
      } catch (error) {
        console.warn("Lecture preview bloquée :", error);
      }
    }

    syncPlayButtons();
    syncRows();
  }

  function togglePlayback() {
    if (!packPreviewState) {
      selectTrack(0, { autoplay: true });
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    if (audio.currentTime >= packPreviewState.end - 0.05) {
      audio.currentTime = packPreviewState.start;
    }

    audio.play().catch(() => {});
  }

  async function finishCurrentPreview() {
    if (!packPreviewState || switchingTrack) return;
    switchingTrack = true;

    const currentIndex = packPreviewState.trackIndex;
    const nextIndex = currentIndex + 1;

    if (nextIndex < tracks.length) {
      await selectTrack(nextIndex, { autoplay: true });
    } else {
      audio.pause();
      audio.currentTime = packPreviewState.end;
      syncProgress();
      syncPlayButtons();
      syncRows();
    }

    switchingTrack = false;
  }

  function seekPreviewFromPointer(event) {
    if (!packPreviewState) return;

    const rect = grandProgressBar.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const duration = previewWindowDuration();
    audio.currentTime = packPreviewState.start + ratio * duration;
    syncProgress();
  }

  audio.addEventListener("timeupdate", () => {
    syncProgress();
    if (packPreviewState && audio.currentTime >= packPreviewState.end - 0.04) {
      finishCurrentPreview();
    }
  });
  audio.addEventListener("ended", finishCurrentPreview);
  audio.addEventListener("play", () => {
    syncPlayButtons();
    syncRows();
  });
  audio.addEventListener("pause", () => {
    syncPlayButtons();
    syncRows();
  });

  miniButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePlayback();
  });

  miniPlayer.addEventListener("click", () => {
    if (!packPreviewState) return;
    grandPlayer.classList.add("active");
    syncProgress();
  });

  grandBack.addEventListener("click", () => {
    grandPlayer.classList.remove("active");
  });

  grandPlay.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePlayback();
  });

  grandPrevious.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!tracks.length) return;

    const currentIndex = Number.isInteger(packPreviewState?.trackIndex)
      ? packPreviewState.trackIndex
      : 0;
    const previousIndex = currentIndex - 1 >= 0
      ? currentIndex - 1
      : tracks.length - 1;
    selectTrack(previousIndex, { autoplay: true });
  });

  grandNext.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!tracks.length) return;

    const currentIndex = Number.isInteger(packPreviewState?.trackIndex)
      ? packPreviewState.trackIndex
      : -1;
    const nextIndex = currentIndex + 1 < tracks.length
      ? currentIndex + 1
      : 0;
    selectTrack(nextIndex, { autoplay: true });
  });

  grandProgressBar.addEventListener("pointerdown", (event) => {
    if (!packPreviewState) return;
    draggingProgress = true;
    grandProgressBar.setPointerCapture?.(event.pointerId);
    seekPreviewFromPointer(event);
  });

  grandProgressBar.addEventListener("pointermove", (event) => {
    if (!draggingProgress) return;
    seekPreviewFromPointer(event);
  });

  const stopDragging = (event) => {
    draggingProgress = false;
    try {
      grandProgressBar.releasePointerCapture?.(event.pointerId);
    } catch {}
  };

  grandProgressBar.addEventListener("pointerup", stopDragging);
  grandProgressBar.addEventListener("pointercancel", stopDragging);

  grandProgressBar.addEventListener("keydown", (event) => {
    if (!packPreviewState || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();

    const direction = event.key === "ArrowRight" ? 1 : -1;
    const duration = previewWindowDuration();
    const elapsed = Math.max(0, audio.currentTime - packPreviewState.start);
    const nextElapsed = Math.max(0, Math.min(duration, elapsed + direction * 5));
    audio.currentTime = packPreviewState.start + nextElapsed;
    syncProgress();
  });

  document.querySelectorAll("body.pack-page .track-btn-play").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const row = button.closest("[data-track-id]");
      const index = tracks.findIndex((track) => String(track.id) === String(row?.dataset.trackId || ""));
      if (index < 0) return;

      if (packPreviewState?.trackIndex === index) togglePlayback();
      else selectTrack(index, { autoplay: true });
    });
  });

  document.querySelectorAll("body.pack-page .track-row-mobile").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest(".track-price-mobile")) return;

      const index = tracks.findIndex((track) => String(track.id) === String(row.dataset.trackId || ""));
      if (index < 0) return;

      if (packPreviewState?.trackIndex === index) togglePlayback();
      else selectTrack(index, { autoplay: true });
    });
  });

  heroPlayButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (packPreviewState?.trackIndex === 0) togglePlayback();
    else selectTrack(0, { autoplay: true });
  });

  window.requestAnimationFrame(alignPackMiniPlayerToContent);
  preparePackPreviewIntelligence();
}

function renderPack() {

  if (packData && packList) {
    const preV1 = isPreV1CommercialMode();
    const futurePackPrice = displayPriceWithEuro(
      packData.price || packData.packPrice || packData.totalPrice
    );
    const packActionLabel = preV1
      ? "Télécharger gratuitement"
      : futurePackPrice;
    const plannedPriceMarkup = preV1 && futurePackPrice && futurePackPrice !== "Gratuit"
      ? `<small class="pre-v1-price-note">Prix prévu : ${futurePackPrice}</small>`
      : "";

    packList.innerHTML = `
<button class="retour">
    <i data-lucide="ChevronLeft"></i>
   </button>
    

    <section class="body-pack">
    <div class="pack-hero">
    <div class="left-side">

    <div class="card">
      <img 
      src="${getFilePath(packData.coverPack)}"
      class="cover">
      <alt="${packData.title} cover image"
      >
     
          <button class="playerBtnMob play"></button>
          <audio src="${getFilePath(packData.audio || packData.audioName)}">
            </audio>
    </div>
    

   
    </div>
    

      <div class="pack-info">
        <h1 class="title">${packData.title}</h1>
        <div class="artist-info">
          <img src="${getFilePath(
            packData.artistProfile?.avatar ||
            packData.artistProfile?.imageArtist ||
            packData.artistProfile?.imageProfile ||
            packData.imageProfile
          )}" class="artist-image">
          ${packArtistRewardBadgeMarkup(packData.artistProfile)}
          <p class="artist">${packData.artistProfile?.name || packData.artist}</p>

        <button class="btn-acheter">${packActionLabel}</button>
        </div>
         <button class="btn-acheter-desktop">${packActionLabel}</button>
         ${plannedPriceMarkup}
      </div>
    </div>

    <div class="track">

    <div class="track-list-center">
      <div class="track-list">
      <span class="track-number">#</span>
      <span class="track-title">Titre</span>
      <span class="track-artist-placement">Artiste</span>
      <span class="track-duration-placement">Durée</span>
      <span class="track-price-placement">Prix</span>
      </div>
    </div> 

    ${packData.tracks.map((track, index) => `
    
 

      <div class="track-row" data-track-id="${track.id}">

      <span class="track-number">#${index + 1}</span>

<div class="track-title-column">

    <div class="track-card">
      <img src="${track.coverPack ? `${getFilePath(track.coverPack)}` : ''}"
      alt="${track.title} cover" 
     class="track-cover"
    >
   <button class="track-btn-play">
 <span class="track-preview-time">30</span> 

 </button>
  <audio
class="track-audio"
src="${getFilePath(track.audioName || track.audio)}"
></audio>
    </div>

      <p class="track-title">${track.title}</p>
      </div>
    
          <p class="track-artist">${track.artist}</p>

         

    <div class="track-duration">
          <span class="duration">${Math.floor(track.previewDuration / 60)}:${track.previewDuration % 60 < 10 ? '00' : ''}${track.previewDuration % 60}</span>
        </div>

        <button class="track-price"
        data-telechargement-url="${track.downloadZip}"
        data-download="${track.downloadPage}"
        title="${preV1 ? `Prix prévu : ${displayPriceWithEuro(track.price || track.trackPrice || track.unitPrice)}` : ""}"
        >${displayPreV1TrackAction(track)}</button>
      </div> 

  <div class="track-row-mobile" data-track-id="${track.id}">

      <span class="track-number-mobile">#${index + 1}</span>


    <div class="track-card-mobile">
      <img src="${getFilePath(track.coverPack)}"
      alt="${track.title} cover" 
     class="track-cover-mobile"
    >   
    <span class="mobile-preview-time">30</span>
    <audio class="mobile-track-audio" src="${getFilePath(track.audioName || track.audio)}"></audio>

    </div>

  
  

      <div class="track-info">
          <p class="track-title-mobile">${track.title}</p>
          <p class="track-artist-mobile">${track.artist}</p>
      </div>
         


        <button class="track-price-mobile"
        data-telechargement-url="${track.downloadZip}"
        data-download="${track.downloadPage}"
        title="${preV1 ? `Prix prévu : ${displayPriceWithEuro(track.price || track.trackPrice || track.unitPrice)}` : ""}"
        >${displayPreV1TrackAction(track)}</button>
      </div> 

  
    `).join('')}
    </div>
    </div>
    </section>
    `;

    schedulePackPageTitleFit();

    const retourBtn = document.querySelector('.retour');

    retourBtn.addEventListener('click', () => {
      window.location.href = "/home.html";
    });

    const publicArtistId = String(
      packData.artistProfile?.accountId ||
      packData.accountId ||
      packData.artistAccountId ||
      packData.artistId ||
      ""
    ).trim();

    if (publicArtistId) {
      const artistDestination =
        `/app/pages/catalog/artist.html?id=${encodeURIComponent(publicArtistId)}`;

      document.querySelectorAll('.artist-image, .artist-info > .artist')
        .forEach((element) => {
          element.classList.add('pack-artist-profile-link');
          element.setAttribute('role', 'link');
          element.setAttribute('tabindex', '0');
          element.setAttribute('aria-label', 'Voir le profil artiste');

          const openArtist = (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.location.href = artistDestination;
          };

          element.addEventListener('click', openArtist);
          element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              openArtist(event);
            }
          });
        });
    }

    if (pageName) {
      pageName.textContent = "V0.9.3 - Sonara ";
    };

    if (btnAccueil) {
      btnAccueil.addEventListener("click", () => {
        console.log("click accueil")

        window.location.href = "/home.html";
        btnAccueil.classList.add("active");
      });
    }

    lucide.createIcons();

    setupPackPreviewPlayer();

    const btnAcheter = document.querySelectorAll('.btn-acheter, .btn-acheter-desktop');
    const noticeOverlay = document.querySelector('.notice-overlay');
    const noticeClose = document.querySelector('.notice-close');
    const noticeRefuse = document.querySelector('.notice-refuse');
    const noticeAccept = document.querySelector('.notice-accept');

    const zipTrackButtons = document.querySelectorAll(".track-price, .track-price-mobile");


    let selectedDownloadUrl = null

    zipTrackButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const trackRow = btn.closest("[data-track-id]");

        selectedPackId = packData.id;
        selectedTrackId = trackRow?.dataset.trackId || null;
        selectedPurchaseType = "track";
        selectedDownloadUrl = btn.dataset.download;

        if (!selectedTrackId) {
          showPopup({
            type: "error",
            title: "Track introuvable",
            message: "Recharge la page puis réessaie."
          });
          return;
        }

        openPackLicenseNotice(
          packData.tracks?.find((track) => String(track.id) === String(selectedTrackId)) || null
        );
      });
    });


    btnAcheter.forEach(btn => {
      btn.addEventListener("click", () => {

        selectedPackId = packData.id;
        selectedTrackId = null;
        selectedPurchaseType = "pack";

        openPackLicenseNotice(packData);
      });
    });


    noticeClose.addEventListener("click", closePackLicenseNotice);

    noticeRefuse.addEventListener("click", closePackLicenseNotice);

    noticeOverlay.addEventListener("click", (event) => {
      if (event.target === noticeOverlay) closePackLicenseNotice();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && noticeOverlay.style.display === "flex") {
        closePackLicenseNotice();
      }
    });

    noticeAccept.addEventListener("click", () => {
      startStripePayment();
    });




  }

};



const profile = getStoredPackProfile();

const mobileCreateBtn = document.querySelector(".nav-mobile-create");

if (mobileCreateBtn && profile?.role !== "both") {
  mobileCreateBtn.style.display = "none";
}

function setActiveNav(activeBtn) {
  document.querySelectorAll(".nav-mobile-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  activeBtn.classList.add("active");
}


document.querySelector(".nav-mobile-home").addEventListener("click", () => {
    setActiveNav(document.querySelector(".nav-mobile-home"))
  window.location.href = "/home.html";
});

document.querySelector(".nav-mobile-create").addEventListener("click", () => {
  window.location.href = "/app/pages/creator/dashboard.html";
});

document.querySelector(".nav-mobile-library").addEventListener("click", () => {


  window.location.href = "/app/pages/catalog/library.html"
});

async function initializePackPage() {
  const loadingStartedAt = Date.now();

  try {
    updatePackLoading(10, "Préparation du pack…");

    if (!packId) {
      throw new Error("Lien de pack invalide.");
    }

    updatePackLoading(48, "Connexion au catalogue Sonara…");
    updatePackLoading(66, "Chargement du pack…");

    await window.SonaraCommercial?.ready?.();
    await loadPack();
    await finishPackLoading(loadingStartedAt, "Pack prêt");
  } catch (error) {
    console.error("Erreur ouverture du pack :", error);

    const message =
      error?.message ||
      "Impossible d’ouvrir ce pack.";

    updatePackLoading(100, message);
    await waitForPackMinimum(loadingStartedAt);

    showPopup({
      type: "error",
      title: "Pack indisponible",
      message
    });
  }
}

initializePackPage();

