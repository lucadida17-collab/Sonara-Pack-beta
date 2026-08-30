
const CreatePack = document.querySelector(".create-pack");

if (!CreatePack) {
  throw new Error("Conteneur .create-pack introuvable.");
}

function createPackTranslate(value) {
  return window.SonaraI18n?.t?.(value) || value;
}


const artistProfile = readArtistProfile();
const draftId = new URLSearchParams(window.location.search).get("draft") || "current";
const draftKey = `artist:${artistProfile.id || artistProfile.accountId || "unknown"}:${draftId}`;

const DRAFT_DATABASE = "sonara-create-pack";
const DRAFT_STORE = "drafts";
const MAX_TRACKS = 20;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_AUDIO_SIZE = 250 * 1024 * 1024;
const MAX_RESOURCE_SIZE = 250 * 1024 * 1024;
const MAX_RESOURCES = 20;
const TRACK_MIN_PRICE = 1;
const TRACK_MAX_PRICE = 100;
const PACK_MIN_PRICE = 1;
const PACK_MAX_PRICE = 100000;
const FORCE_NEW_PACK_KEY = "sonara-create-pack-force-new";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_MIDI_EXTENSIONS = new Set([".mid", ".midi"]);
const ALLOWED_DAW_EXTENSIONS = new Set([".flp", ".als", ".rpp", ".logicx", ".cpr", ".ptx", ".song"]);
const DAW_OPTIONS = [
  ["fl-studio", "FL Studio"],
  ["ableton-live", "Ableton Live"],
  ["logic-pro", "Logic Pro"],
  ["reaper", "Reaper"],
  ["cubase", "Cubase"],
  ["pro-tools", "Pro Tools"],
  ["studio-one", "Studio One"],
  ["other", "Autre"]
];

const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac"
];

const distributionCategories = [
  ["rap-hiphop", "Rap & Hip-Hop"],
  ["pop", "Pop"],
  ["rnb-soul", "R&B & Soul"],
  ["electronic", "Électro"],
  ["rock-alternative", "Rock & Alternative"],
  ["chanson", "Chanson"],
  ["vocal", "Vocal & chant"],
  ["beats-production", "Beatmaking & production"],
  ["afro", "Afro"],
  ["reggae-dancehall", "Reggae & Dancehall"],
  ["jazz", "Jazz"],
  ["piano", "Piano"],
  ["cinematic", "Cinématique"],
  ["classical", "Classique"],
  ["drums-percussion", "Batterie & percussions"],
  ["violin-strings", "Violon & cordes"],
  ["guitar", "Guitare"],
  ["orchestral", "Orchestre"],
  ["ambient-textures", "Ambient & textures"],
  ["sound-design", "Sound design"],
  ["other", "Autre"]
];

const CREATE_PACK_LICENSE_PERMISSIONS = [
  ["personalProjects", "Projets personnels", "Utilisation dans ses propres créations personnelles."],
  ["commercialProjects", "Projets commerciaux", "Utilisation professionnelle ou commerciale."],
  ["monetization", "Monétisation", "Les projets intégrant les sons peuvent générer des revenus."],
  ["socialMedia", "Réseaux sociaux", "TikTok, Instagram, YouTube et plateformes similaires."],
  ["videoFilm", "Vidéos et films", "Films, courts métrages, documentaires et contenus vidéo."],
  ["advertising", "Publicités", "Campagnes publicitaires et contenus de marque."],
  ["gamesApps", "Jeux et applications", "Jeux vidéo, applications et expériences interactives."],
  ["podcasts", "Podcasts", "Podcasts, émissions et contenus audio parlés."],
  ["liveStreaming", "Live et streaming", "Diffusion en direct et rediffusions."],
  ["clientWork", "Travail client", "Créations réalisées pour le compte d’un client."],
  ["soundEditing", "Modification dans un DAW", "Découpe, effets, mixage et transformation créative."],
  ["unlimitedProjects", "Projets illimités", "La licence n’impose pas de limite de projets."]
];

const CREATE_PACK_LICENSE_RESTRICTIONS = [
  ["standaloneResale", "Revente isolée", "Interdiction de revendre les sons seuls ou presque inchangés."],
  ["redistribution", "Partage ou redistribution", "Interdiction de partager le pack ou ses fichiers sources."],
  ["musicPlatformUpload", "Upload musical autonome", "Interdiction de publier les sons seuls comme morceau sur une plateforme musicale."],
  ["contentIdRegistration", "Enregistrement Content ID", "Interdiction d’enregistrer les sons seuls dans un système de revendication automatique."],
  ["sublicensing", "Sous-licence", "Interdiction de revendre ou transférer la licence à une autre personne."],
  ["misleadingOwnership", "Fausse propriété", "Interdiction de prétendre être l’auteur original des sons."]
];

function createDefaultPackLicense() {
  return {
    template: "sonara-standard",
    version: 1,
    name: "Licence standard Sonara",
    creditRequired: false,
    permissions: Object.fromEntries(
      CREATE_PACK_LICENSE_PERMISSIONS.map(([key]) => [key, true])
    ),
    restrictions: Object.fromEntries(
      CREATE_PACK_LICENSE_RESTRICTIONS.map(([key]) => [key, true])
    ),
    customPermissions: [],
    customRestrictions: [],
    customTerms: ""
  };
}

function cloneCreatePackLicense(value) {
  const fallback = createDefaultPackLicense();
  const source = value && typeof value === "object" ? value : {};
  return {
    ...fallback,
    ...source,
    version: 1,
    permissions: {
      ...fallback.permissions,
      ...(source.permissions || {})
    },
    restrictions: {
      ...fallback.restrictions,
      ...(source.restrictions || {})
    },
    customPermissions: Array.isArray(source.customPermissions)
      ? source.customPermissions.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    customRestrictions: Array.isArray(source.customRestrictions)
      ? source.customRestrictions.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    customTerms: String(source.customTerms || "")
  };
}

let currentStep = 0;
let createPackV1FeaturesEnabled = false;
let saveTimer = null;
let isSubmitting = false;
let objectUrls = new Set();

const packData = {
  identity: {
    title: "",
    categorie: "",
    contentType: "audio",
    primaryAudience: "",
    dawName: "",
    dawVersion: "",
    dawPlugins: "",
    coverFile: null
  },
  tracks: [createEmptyTrack()],
  resources: [],
  globalPrice: "",
  globalIsFree: false,
  globalPriceCustomized: false,
  license: createDefaultPackLicense(),
  rightsDeclarationAccepted: false,
  creationProcess: {
    humanCreationConfirmed: false, daw: "", instruments: [], plugins: [], midiPresent: false,
    aiAssistanceUsed: false, aiAssistanceType: "none", aiAssistanceDetails: "", processComment: ""
  },
  creationEvidenceFiles: [],
  updatedAt: null
};

const resourceDraftsByType = {
  midi: [],
  daw: []
};


CreatePack.innerHTML = `
  <button type="button" class="back-btn">Retour Dashboard</button>

  <section class="hero">
    <p class="create-pack-eyebrow">SONARA CREATOR</p>
    <h1>Créer un pack</h1>
    <span>Construis un pack complet, propre et prêt à être validé.</span>
  </section>

  <section class="progress" aria-label="Progression">
    <button type="button" class="step active" data-step="0">Pack</button>
    <button type="button" class="step" data-step="1">Contenu</button>
    <button type="button" class="step" data-step="2">Prix global</button>
    <button type="button" class="step" data-step="3">Licence</button>
  </section>

  <section class="draft-state" aria-live="polite">
    <span class="draft-state-dot"></span>
    <span class="draft-state-text">Chargement du brouillon…</span>
  </section>

  <section class="mission-card" id="missionCard"></section>
`;

const missionCard = document.querySelector("#missionCard");
const steps = [...document.querySelectorAll(".step")];

document.querySelector(".back-btn").addEventListener("click", async () => {
  await leaveCreatePackAndSaveDraft();
});

steps.forEach((step) => {
  step.addEventListener("click", async () => {
    const requestedStep = Number(step.dataset.step);

    if (requestedStep >= currentStep) return;

    await persistCurrentScreen();
    currentStep = requestedStep;
    render();
  });
});

window.addEventListener("beforeunload", () => {
  releaseObjectUrls();
});

init();

async function verifyStripeBeforeCreatePack() {
  const artistId = artistProfile.accountId || artistProfile.id || "";

  if (!artistId) return false;

  try {
    const response = await fetch(`${API_URL}/api/stripe/account-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistId })
    });
    const data = await response.json().catch(() => ({}));

    return response.ok && data.stripeStatus === "verified";
  } catch (error) {
    console.warn("Vérification Stripe Create Pack impossible :", error);
    return false;
  }
}

async function init() {
  // L'accès à Create Pack est décidé depuis le dashboard Creator.
  // Les formats Boutique (MIDI / DAW) restent invisibles et bloqués jusqu'à la V1.
  const commercialState = await window.SonaraCommercial?.ready?.()
    || window.SonaraCommercial?.getState?.()
    || { paymentsActive: false };
  createPackV1FeaturesEnabled = commercialState.paymentsActive === true;

  if (commercialState.bankRequiredForPackCreation === true) {
    const stripeVerified = await verifyStripeBeforeCreatePack();
    if (!stripeVerified) {
      window.location.replace("/app/pages/creator/management/bank.html");
      return;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const forceNewPack = sessionStorage.getItem(FORCE_NEW_PACK_KEY) === "true";

  if (forceNewPack) {
    sessionStorage.removeItem(FORCE_NEW_PACK_KEY);
    await deleteDraftSafely(draftKey);
  } else if (params.get("new") === "true") {
    await deleteDraftSafely(draftKey);
  } else {
    const saved = await readDraft(draftKey);
    const savedType = String(saved?.identity?.contentType || "audio").toLowerCase();
    if (saved && (createPackV1FeaturesEnabled || savedType === "audio")) {
      hydratePackData(saved);
    }
  }

  if (!createPackV1FeaturesEnabled) {
    // PRE_V1 = Create Pack historique : audio uniquement.
    // Les nouveaux choix Boutique / MIDI / DAW / audience restent invisibles jusqu'à COMMERCIAL.
    packData.identity.contentType = "audio";
    packData.identity.primaryAudience = "both";
    packData.identity.dawName = "";
    packData.identity.dawVersion = "";
    packData.identity.dawPlugins = "";
    packData.resources = [];
  }

  updateDraftState("Brouillon prêt", "ready");
  render();
}

function readArtistProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null") || {};
  } catch {
    return {};
  }
}

function createEmptyTrack({ coverFile = null, coverMode = "pack" } = {}) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `track_${Date.now()}_${Math.random()}`,
    title: "",
    price: "",
    isFree: false,
    coverMode: coverMode === "custom" ? "custom" : "pack",
    coverFile,
    audioFile: null,
    duration: 0
  };
}

function trackUsesPackCover(track) {
  // La cover du pack/album est la cover par défaut d'une track.
  // Un ancien brouillon peut encore annoncer "custom" sans contenir
  // de vraie cover personnalisée : dans ce cas on retombe sur l'album.
  if (track?.coverMode !== "custom") return true;
  if (!track?.coverFile) return true;
  return sameFileIdentity(track.coverFile, packData.identity.coverFile);
}

function sameFileIdentity(firstFile, secondFile) {
  if (!firstFile || !secondFile) return false;
  return (
    String(firstFile.name || "") === String(secondFile.name || "") &&
    Number(firstFile.size || 0) === Number(secondFile.size || 0) &&
    String(firstFile.type || "") === String(secondFile.type || "") &&
    Number(firstFile.lastModified || 0) === Number(secondFile.lastModified || 0)
  );
}

function resolveHydratedTrackCoverMode(track, packCoverFile) {
  if (track?.coverMode === "custom") {
    // Compatibilité anciens brouillons : sans vraie cover personnalisée,
    // la cover du pack/album reste bien celle de la track.
    if (!track?.coverFile || sameFileIdentity(track.coverFile, packCoverFile)) {
      return "pack";
    }
    return "custom";
  }
  if (track?.coverMode === "pack") return "pack";

  // Migration des brouillons créés avant l'héritage automatique des covers.
  // Une ancienne track qui contient la même image que le pack doit être
  // considérée comme héritée, pas comme une cover personnalisée obligatoire.
  if (!track?.coverFile || sameFileIdentity(track.coverFile, packCoverFile)) {
    return "pack";
  }

  return "custom";
}

function getEffectiveTrackCover(track) {
  return trackUsesPackCover(track)
    ? packData.identity.coverFile || null
    : track?.coverFile || null;
}

function syncInheritedTrackCovers() {
  packData.tracks.forEach((track) => {
    if (!trackUsesPackCover(track)) return;
    track.coverMode = "pack";
    track.coverFile = packData.identity.coverFile || null;
  });
}

function titleFromAudioFile(file) {
  return String(file?.name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function isBlankTrack(track) {
  return Boolean(track) && !String(track.title || "").trim() && !track.audioFile;
}

function hydratePackData(saved) {
  packData.identity = {
    title: saved.identity?.title || "",
    categorie: saved.identity?.categorie || "",
    contentType: ["audio", "midi", "daw"].includes(saved.identity?.contentType)
      ? saved.identity.contentType
      : "audio",
    primaryAudience: ["creators", "artists", "both"].includes(saved.identity?.primaryAudience)
      ? saved.identity.primaryAudience
      : "both",
    dawName: String(saved.identity?.dawName || ""),
    dawVersion: String(saved.identity?.dawVersion || ""),
    dawPlugins: String(saved.identity?.dawPlugins || ""),
    coverFile: saved.identity?.coverFile || null
  };

  packData.tracks =
    Array.isArray(saved.tracks) && saved.tracks.length
      ? saved.tracks.map((track) => ({
          id: track.id || createEmptyTrack().id,
          title: track.title || "",
          price: track.price || "",
          isFree: Boolean(track.isFree),
          coverMode: resolveHydratedTrackCoverMode(
            track,
            saved.identity?.coverFile || null
          ),
          coverFile: track.coverFile || null,
          audioFile: track.audioFile || null,
          duration: Number(track.duration) || 0
        }))
      : [createEmptyTrack()];

  syncInheritedTrackCovers();

  packData.resources = Array.isArray(saved.resources)
    ? saved.resources.map((resource) => ({
        id: resource.id || createResourceId(),
        title: String(resource.title || titleFromResourceFile(resource.file) || "Ressource"),
        price: String(resource.price || ""),
        isFree: Boolean(resource.isFree),
        coverMode: resource?.coverMode === "custom" && resource?.coverFile ? "custom" : "pack",
        coverFile: resource?.coverMode === "custom" && resource?.coverFile
          ? resource.coverFile
          : (saved.identity?.coverFile || resource.coverFile || null),
        file: resource.file || null,
        originalName: String(resource.originalName || resource.file?.name || ""),
        size: Number(resource.size || resource.file?.size || 0),
        extension: String(resource.extension || getFileExtension(resource.file?.name || resource.originalName || ""))
      }))
    : [];
  syncInheritedResourceCovers();
  if (["midi", "daw"].includes(packData.identity.contentType)) {
    resourceDraftsByType[packData.identity.contentType] = packData.resources;
  }

  packData.globalPrice = saved.globalPrice || "";
  packData.globalIsFree = Boolean(saved.globalIsFree);
  packData.globalPriceCustomized = Boolean(saved.globalPriceCustomized);
  packData.license = cloneCreatePackLicense(saved.license);
  packData.rightsDeclarationAccepted = Boolean(saved.rightsDeclarationAccepted);
  packData.creationProcess = {
    humanCreationConfirmed: Boolean(saved.creationProcess?.humanCreationConfirmed),
    daw: String(saved.creationProcess?.daw || ""),
    instruments: Array.isArray(saved.creationProcess?.instruments) ? saved.creationProcess.instruments : [],
    plugins: Array.isArray(saved.creationProcess?.plugins) ? saved.creationProcess.plugins : [],
    midiPresent: Boolean(saved.creationProcess?.midiPresent),
    aiAssistanceUsed: Boolean(saved.creationProcess?.aiAssistanceUsed),
    aiAssistanceType: String(saved.creationProcess?.aiAssistanceType || "none"),
    aiAssistanceDetails: String(saved.creationProcess?.aiAssistanceDetails || ""),
    processComment: String(saved.creationProcess?.processComment || "")
  };
  packData.creationEvidenceFiles = [];
  packData.updatedAt = saved.updatedAt || null;
}

function updateSteps() {
  steps.forEach((step, index) => {
    step.classList.toggle("active", index === currentStep);
    step.classList.toggle("completed", index < currentStep);
  });
}

function render() {
  releaseObjectUrls();
  updateSteps();
  missionCard.classList.toggle("is-license-step", currentStep === 3);

  const screens = [
    renderIdentity,
    renderContent,
    renderPrice,
    renderLicense
  ];

  screens[currentStep]();
  requestAnimationFrame(() => window.SonaraI18n?.refresh?.());
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function visibilityChoiceIcon(iconKey) {
  const icons = {
    audio: `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M7 17v-2a9 9 0 0 1 18 0v2"></path>
        <path d="M7 17h2.5v7H7a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z"></path>
        <path d="M25 17h-2.5v7H25a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2Z"></path>
        <path d="M12 20h1.5l1.2-3.5 2.3 7 1.7-5 1.1 1.5H22"></path>
      </svg>`,
    midi: `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect x="4.5" y="7" width="23" height="18" rx="3"></rect>
        <path d="M9 7v18M14 7v18M19 7v18M24 7v18"></path>
        <path class="icon-fill" d="M7.5 7h3v10h-3zM12.5 7h3v10h-3zM22.5 7h3v10h-3z"></path>
      </svg>`,
    daw: `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect x="4" y="5" width="24" height="22" rx="3"></rect>
        <path d="M4 11h24M11 11v16M18 11v16"></path>
        <path d="M7 15h2M7 19h2M7 23h2M14 15h2M14 21h2M21 16h4M21 20h3M21 24h4"></path>
        <circle class="icon-fill" cx="15" cy="18" r="1.4"></circle>
      </svg>`,
    creators: `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M5 11h22v15H5z"></path>
        <path d="M5 11 8 5h19l-3 6"></path>
        <path d="M10 5 7 11M16 5l-3 6M22 5l-3 6"></path>
        <path class="icon-fill" d="m14 16 6 3.5-6 3.5z"></path>
      </svg>`,
    artists: `
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect x="7" y="5" width="8" height="14" rx="4"></rect>
        <path d="M4.5 15a6.5 6.5 0 0 0 13 0M11 21.5V27M7 27h8"></path>
        <path d="M21 10v11"></path>
        <path d="M21 10 27 8v9"></path>
        <circle class="icon-fill" cx="19" cy="22" r="2.4"></circle>
        <circle class="icon-fill" cx="25" cy="18" r="2.4"></circle>
      </svg>`,
    both: `
      <svg viewBox="0 0 36 32" aria-hidden="true" focusable="false">
        <rect x="2.5" y="7" width="14" height="18" rx="3"></rect>
        <path d="M2.5 12h14M5 7l2 5M10 7l2 5"></path>
        <path class="icon-fill" d="m8 16 5 3-5 3z"></path>
        <rect x="21" y="5" width="7" height="13" rx="3.5"></rect>
        <path d="M18.5 15a6 6 0 0 0 12 0M24.5 21v6M21 27h7"></path>
        <path d="M31 9v10"></path>
        <circle class="icon-fill" cx="29" cy="20" r="2"></circle>
      </svg>`
  };
  return icons[iconKey] || icons.audio;
}

function renderVisibilityChoice(group, value, title, description, iconKey) {
  const active = String(packData.identity?.[group] || "") === String(value);
  const safeIconKey = ["audio", "midi", "daw", "creators", "artists", "both"].includes(iconKey)
    ? iconKey
    : "audio";
  return `
    <button
      type="button"
      class="visibility-v2-choice visibility-v2-choice--${safeIconKey} ${active ? "is-active" : ""}"
      data-visibility-group="${group}"
      data-visibility-value="${value}"
      aria-pressed="${active ? "true" : "false"}"
    >
      <span class="visibility-v2-choice-icon">${visibilityChoiceIcon(safeIconKey)}</span>
      <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
    </button>
  `;
}

function cameraIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2h5Z"></path>
      <circle cx="12" cy="13" r="3.5"></circle>
    </svg>
  `;
}

function renderImageDropzone(inputId, file, title, subtitle) {
  const previewUrl = file ? createObjectUrl(file) : "";

  return `
    <label class="cover-picker ${file ? "has-file" : ""}" for="${inputId}">
      <input id="${inputId}" type="file" accept="image/jpeg,image/png,image/webp">

      ${file ? `
        <img class="cover-picker-preview" src="${previewUrl}" alt="Aperçu de la cover sélectionnée">
        <span class="cover-picker-action">
          <span class="cover-picker-camera">${cameraIcon()}</span>
          <span>
            <strong>Changer la cover</strong>
            <small>${escapeHtml(file.name)}</small>
          </span>
        </span>
      ` : `
        <span class="cover-picker-camera">${cameraIcon()}</span>
        <span class="cover-picker-copy">
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </span>
      `}
    </label>
  `;
}

function isAudioContent() {
  return String(packData.identity.contentType || "audio") === "audio";
}

function isMidiContent() {
  return String(packData.identity.contentType || "") === "midi";
}

function isDawContent() {
  return String(packData.identity.contentType || "") === "daw";
}

function renderIdentity() {
  missionCard.innerHTML = `
    <section class="step-panel">
      <header class="step-header">
        <p class="step-number">ÉTAPE 1 SUR 4</p>
        <h2>Identité du pack</h2>
      </header>

      <div class="form-grid">
        <label class="field">
          <span>Titre du pack</span>
          <input
            class="pack-title"
            maxlength="70"
            placeholder="Mettez votre titre"
            value="${escapeHtml(packData.identity.title)}"
          >
          <small class="field-hint">Choisissez un titre qui frappe dès le premier regard.</small>
          <small class="field-error" data-error="identity-title"></small>
        </label>

        <label class="field">
          <span>Catégorie</span>
          <select class="pack-category">
            <option value="">Choisir une catégorie</option>
            ${distributionCategories.map(([value, label]) => `
              <option value="${value}" ${packData.identity.categorie === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
          <small class="field-hint">Mettez une catégorie pour que Sonara puisse correctement retrouver l’ambiance du pack et mieux vous mettre en avant.</small>
          <small class="field-error" data-error="identity-category"></small>
        </label>
      </div>

      ${createPackV1FeaturesEnabled ? `
      <section class="visibility-v2-block" aria-labelledby="content-type-title">
        <div class="visibility-v2-heading">
          <h3 id="content-type-title">Type de contenu</h3>
          <small>L’audio garde le fonctionnement Sonara actuel. MIDI et projets DAW sont des ressources de production.</small>
        </div>
        <div class="visibility-v2-choice-grid visibility-v2-content-types">
          ${renderVisibilityChoice("contentType", "audio", "Audio", "Morceaux, prods, instrumentales, samples et autres fichiers audio.", "audio")}
          ${renderVisibilityChoice("contentType", "midi", "MIDI", "Fichiers MIDI destinés à la création et à la production musicale.", "midi")}
          ${renderVisibilityChoice("contentType", "daw", "Projet DAW", "Projet de production à ouvrir dans un logiciel compatible.", "daw")}
        </div>
      </section>

      ${isAudioContent() ? `
      <section class="visibility-v2-block" aria-labelledby="primary-audience-title">
        <div class="visibility-v2-heading">
          <h3 id="primary-audience-title">Destiné principalement à</h3>
          <small>Ce choix améliore la mise en avant. Il ne bloque jamais l’achat par un autre public.</small>
        </div>
        <div class="visibility-v2-choice-grid visibility-v2-audiences">
          ${renderVisibilityChoice("primaryAudience", "creators", "Créateurs & projets", "Pour les vidéos, films, jeux, contenus, podcasts et autres projets créatifs.", "creators")}
          ${renderVisibilityChoice("primaryAudience", "artists", "Artistes / producteurs", "Pour les artistes, compositeurs et producteurs souhaitant créer ou produire de la musique.", "artists")}
          ${renderVisibilityChoice("primaryAudience", "both", "Les deux", "Le contenu peut convenir aux deux publics.", "both")}
        </div>
        <small class="field-error visibility-v2-error" data-error="identity-audience"></small>
      </section>` : `
      <section class="visibility-v2-block visibility-v2-store-routing" aria-label="Visibilité Boutique">
        <span class="visibility-v2-store-routing-icon"><i data-lucide="store"></i></span>
        <span>
          <strong>Boutique artistes</strong>
          <small>Artistes / producteurs</small>
        </span>
      </section>`}
      ` : ""}

      <div class="upload-section">
        <div class="upload-heading">
          <div>
            <h3>Cover du pack</h3>
          </div>
          <span>JPG, PNG ou WEBP · 8 Mo max</span>
        </div>

        ${renderImageDropzone(
          "pack-cover-input",
          packData.identity.coverFile,
          "Dépose la cover du pack",
          "Format carré recommandé · minimum 1000 × 1000 px"
        )}

        <small class="field-error" data-error="identity-cover"></small>
      </div>

      <div class="actions actions-end">
        <button type="button" class="next-btn">Continuer</button>
      </div>
    </section>
  `;

  const titleInput = document.querySelector(".pack-title");
  const categoryInput = document.querySelector(".pack-category");
  const coverInput = document.querySelector("#pack-cover-input");

  document.querySelectorAll("[data-visibility-group]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.visibilityGroup;
      const value = button.dataset.visibilityValue;
      if (!group || !value) return;
      if (group === "primaryAudience") {
        packData.identity.primaryAudience = value;
        clearFieldError("identity-audience");
      }

      if (group === "contentType") {
        if (!createPackV1FeaturesEnabled && ["midi", "daw"].includes(value)) return;
        const previousType = String(packData.identity.contentType || "audio");
        if (previousType === value) return;

        if (["midi", "daw"].includes(previousType)) {
          resourceDraftsByType[previousType] = packData.resources;
        }

        packData.identity.contentType = value;

        if (value === "audio") {
          if (!packData.tracks.length) {
            packData.tracks = [createEmptyTrack({
              coverFile: packData.identity.coverFile,
              coverMode: "pack"
            })];
          }
          syncGlobalPriceFromTracks();
        } else {
          packData.identity.primaryAudience = "artists";
          packData.resources = resourceDraftsByType[value] || [];
          syncInheritedResourceCovers();
          syncGlobalPriceFromResources();
        }
      }
      renderIdentity();
    });
  });

  if (window.lucide) lucide.createIcons();

  /*
    Un ancien brouillon peut encore contenir une ambiance V1.
    On ne la réinterprète pas silencieusement : l'artiste choisit
    explicitement une vraie catégorie de distribution.
  */
  packData.identity.categorie = categoryInput?.value || "";

  titleInput.addEventListener("input", () => {
    packData.identity.title = titleInput.value;
    clearFieldError("identity-title");
  });

  categoryInput.addEventListener("change", () => {
    packData.identity.categorie = categoryInput.value;
    clearFieldError("identity-category");
  });

  coverInput.addEventListener("change", async () => {
    const file = coverInput.files?.[0];
    if (!file) return;

    const error = await validateCoverImage(file);

    if (error) {
      showFieldError("identity-cover", error);
      coverInput.value = "";
      return;
    }

    packData.identity.coverFile = file;
    syncInheritedTrackCovers();
    syncInheritedResourceCovers();
    clearFieldError("identity-cover");
    renderIdentity();
  });

  document.querySelector(".next-btn").addEventListener("click", async () => {
    if (!validateIdentity()) return;

    syncInheritedTrackCovers();
    currentStep = 1;
    render();
  });
}

function createResourceId() {
  return crypto.randomUUID ? crypto.randomUUID() : `resource_${Date.now()}_${Math.random()}`;
}

function getFileExtension(fileName = "") {
  const match = String(fileName || "").trim().toLowerCase().match(/(\.[a-z0-9]+)$/i);
  return match ? match[1] : "";
}

function titleFromResourceFile(file) {
  return String(file?.name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function createResourceFromFile(file = null) {
  return {
    id: createResourceId(),
    title: titleFromResourceFile(file) || "",
    price: "",
    isFree: false,
    coverMode: "pack",
    coverFile: packData?.identity?.coverFile || null,
    file,
    originalName: String(file?.name || ""),
    size: Number(file?.size || 0),
    extension: getFileExtension(file?.name || "")
  };
}

function resourceUsesPackCover(resource) {
  if (resource?.coverMode !== "custom") return true;
  if (!resource?.coverFile) return true;
  return sameFileIdentity(resource.coverFile, packData.identity.coverFile);
}

function getEffectiveResourceCover(resource) {
  return resourceUsesPackCover(resource)
    ? (packData.identity.coverFile || resource?.coverFile || null)
    : (resource?.coverFile || packData.identity.coverFile || null);
}

function syncInheritedResourceCovers() {
  packData.resources.forEach((resource) => {
    if (!resourceUsesPackCover(resource)) return;
    resource.coverMode = "pack";
    resource.coverFile = packData.identity.coverFile || null;
  });
}

function validateResourceFile(file) {
  if (!(file instanceof File)) return "Ajoute un fichier de ressource.";
  if (file.size > MAX_RESOURCE_SIZE) return "Le fichier dépasse 250 Mo.";
  const extension = getFileExtension(file.name);

  if (isMidiContent() && !ALLOWED_MIDI_EXTENSIONS.has(extension)) {
    return "Utilise un fichier MIDI .mid ou .midi.";
  }

  if (isDawContent() && !ALLOWED_DAW_EXTENSIONS.has(extension)) {
    return "Le fichier du projet DAW doit conserver son extension d’origine.";
  }

  return "";
}

function renderContent() {
  if (isAudioContent()) {
    renderTracks();
    return;
  }
  renderResources();
}

function renderResources() {
  const contentLabel = isMidiContent() ? "MIDI" : "Projet DAW";
  const accept = isMidiContent()
    ? ".mid,.midi,audio/midi,audio/x-midi"
    : ".flp,.als,.rpp,.logicx,.cpr,.ptx,.song";

  missionCard.innerHTML = `
    <section class="step-panel visibility-v2-resources-step">
      <button type="button" class="content-type-back" data-return-to-pack>
        <span aria-hidden="true">‹</span>
        <span>Pack</span>
      </button>
      <header class="step-header">
        <p class="step-number">ÉTAPE 2 SUR 4</p>
        <h2>${contentLabel}</h2>
        <p>${isMidiContent()
          ? "Ajoute les fichiers MIDI que l’acheteur recevra dans leur format d’origine."
          : "Le nom du DAW aide l’artiste à savoir avec quel logiciel ouvrir le projet."}</p>
      </header>

      ${isDawContent() ? `
        <section class="visibility-v2-daw-meta">
          <label class="field visibility-v2-daw-field">
            <span>Logiciel DAW</span>
            <select class="visibility-v2-daw-select">
              <option value="">Choisir le DAW</option>
              ${DAW_OPTIONS.map(([value, label]) => `<option value="${value}" ${packData.identity.dawName === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
            <small class="field-error" data-error="resource-daw"></small>
          </label>
          <label class="field">
            <span>Version du DAW</span>
            <input class="visibility-v2-daw-version" maxlength="40" placeholder="Ex. 7.33, 12.1, 2026" value="${escapeHtml(packData.identity.dawVersion || "")}">
            
          </label>
          <label class="field visibility-v2-daw-plugins-field">
            <span>Plugins externes requis</span>
            <input class="visibility-v2-daw-plugins" maxlength="220" placeholder="Ex. Serum, Kontakt — ou Aucun" value="${escapeHtml(packData.identity.dawPlugins || "")}">
            
          </label>
          <p class="visibility-v2-daw-explainer"><i data-lucide="info"></i><span>Le nom du DAW aide l’artiste à savoir avec quel logiciel ouvrir le projet.</span></p>
        </section>
      ` : ""}

      <section class="visibility-v2-resource-list">
        ${packData.resources.length ? packData.resources.map((resource, index) => {
          const usesPackCover = resourceUsesPackCover(resource);
          const coverFile = getEffectiveResourceCover(resource);
          const fileLabel = isMidiContent() ? "Fichier MIDI" : "Fichier projet DAW";
          return `
          <article class="visibility-v2-resource-card visibility-v2-resource-editor" data-resource-index="${index}">
            <header class="visibility-v2-resource-card-head">
              <span class="visibility-v2-resource-icon"><i data-lucide="${isMidiContent() ? "piano" : "panels-top-left"}"></i></span>
              <span><small>${contentLabel.toUpperCase()} ${index + 1}</small><strong>${escapeHtml(resource.title || `Nouveau ${contentLabel}`)}</strong></span>
              <button type="button" class="visibility-v2-resource-remove" aria-label="Supprimer la ressource">Supprimer</button>
            </header>

            <div class="visibility-v2-resource-fields">
              <label class="field">
                <span>Titre</span>
                <input class="visibility-v2-resource-title" maxlength="70" placeholder="Titre" value="${escapeHtml(resource.title || "")}">
                <small class="field-error" data-resource-error="title"></small>
              </label>

              <div class="field">
                <span>Accès</span>
                <div class="price-mode">
                  <button type="button" class="price-mode-btn ${!resource.isFree ? "active" : ""}" data-resource-price-mode="paid">Payant</button>
                  <button type="button" class="price-mode-btn ${resource.isFree ? "active" : ""}" data-resource-price-mode="free">Gratuit</button>
                </div>
                <div class="price-input ${resource.isFree ? "is-hidden" : ""}">
                  <input class="visibility-v2-resource-price" type="text" inputmode="decimal" autocomplete="off" placeholder="Entre 1 et 100" value="${resource.isFree ? "" : escapeHtml(resource.price || "")}" ${resource.isFree ? "disabled" : ""}>
                  <span>€</span>
                </div>
                <small class="field-error" data-resource-error="price"></small>
              </div>
            </div>

            <div class="visibility-v2-resource-upload-grid">
              <div class="upload-section compact">
                <div class="upload-heading track-cover-heading">
                  <div><h3>${usesPackCover ? "Cover du pack" : `Cover du ${contentLabel}`}</h3></div>
                  ${!usesPackCover ? `<button type="button" class="visibility-v2-use-pack-cover">Cover du pack</button>` : ""}
                </div>
                ${renderImageDropzone(
                  `resource-cover-${index}`,
                  coverFile,
                  "Dépose la cover",
                  "Image carrée · JPG, PNG ou WEBP"
                )}
                <small class="field-error" data-resource-error="cover"></small>
              </div>

              <div class="upload-section compact">
                <div class="upload-heading"><div><h3>${fileLabel}</h3></div></div>
                <label class="visibility-v2-resource-file-picker ${resource.file ? "has-file" : ""}" for="resource-file-${index}">
                  <input id="resource-file-${index}" class="visibility-v2-resource-file" type="file" accept="${accept}">
                  <span class="visibility-v2-resource-file-mark"><i data-lucide="${isMidiContent() ? "piano" : "file-cog"}"></i></span>
                  <span>
                    <strong>${resource.file ? "Changer le fichier" : `Ajouter ${fileLabel.toLowerCase()}`}</strong>
                    <small>${escapeHtml(resource.file?.name || resource.originalName || (isMidiContent() ? ".mid / .midi" : ".flp / .als / .rpp / .logicx / .cpr / .ptx / .song"))}</small>
                  </span>
                </label>
                <small class="field-error" data-resource-error="file"></small>
              </div>
            </div>
          </article>`;
        }).join("") : `
          <div class="visibility-v2-resource-empty">
            <i data-lucide="file-plus-2"></i>
            <strong>Aucune ressource ajoutée</strong>
            <small>Ajoute un ou plusieurs fichiers pour commencer.</small>
          </div>
        `}
      </section>

      <label class="add-track-btn visibility-v2-resource-add ${packData.resources.length >= MAX_RESOURCES ? "is-disabled" : ""}">
        <input class="visibility-v2-resource-input" type="file" multiple accept="${accept}" ${packData.resources.length >= MAX_RESOURCES ? "disabled" : ""}>
        <span>+</span>
        ${isMidiContent() ? "Ajouter plusieurs MIDI" : "Ajouter plusieurs projets DAW"}
      </label>
      <small class="field-error visibility-v2-resource-error" data-error="resources"></small>

      <div class="actions">
        <button type="button" class="prev-btn">Retour</button>
        <button type="button" class="next-btn">Continuer</button>
      </div>
    </section>
  `;

  if (window.lucide) lucide.createIcons();

  document.querySelector("[data-return-to-pack]")?.addEventListener("click", () => {
    currentStep = 0;
    render();
  });

  document.querySelector(".visibility-v2-daw-select")?.addEventListener("change", (event) => {
    packData.identity.dawName = event.currentTarget.value;
    clearFieldError("resource-daw");
  });
  document.querySelector(".visibility-v2-daw-version")?.addEventListener("input", (event) => {
    packData.identity.dawVersion = event.currentTarget.value;
  });
  document.querySelector(".visibility-v2-daw-plugins")?.addEventListener("input", (event) => {
    packData.identity.dawPlugins = event.currentTarget.value;
  });

  document.querySelector(".visibility-v2-resource-input")?.addEventListener("change", (event) => {
    const files = Array.from(event.currentTarget.files || []);
    if (!files.length) return;
    const available = Math.max(0, MAX_RESOURCES - packData.resources.length);
    const selected = files.slice(0, available);
    const error = selected.map(validateResourceFile).find(Boolean);
    if (error) {
      showFieldError("resources", error);
      event.currentTarget.value = "";
      return;
    }
    selected.forEach((file) => packData.resources.push(createResourceFromFile(file)));
    syncGlobalPriceFromResources();
    clearFieldError("resources");
    renderResources();
  });

  document.querySelectorAll(".visibility-v2-resource-editor").forEach((card) => {
    const index = Number(card.dataset.resourceIndex);
    const resource = packData.resources[index];
    if (!resource) return;

    card.querySelector(".visibility-v2-resource-title")?.addEventListener("input", (event) => {
      resource.title = event.currentTarget.value;
      card.querySelector(".visibility-v2-resource-card-head strong").textContent = resource.title.trim() || `Nouveau ${contentLabel}`;
      card.querySelector('[data-resource-error="title"]')?.replaceChildren();
    });

    card.querySelectorAll("[data-resource-price-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        resource.isFree = button.dataset.resourcePriceMode === "free";
        resource.price = resource.isFree ? "0.00" : "";
        syncGlobalPriceFromResources();
        renderResources();
      });
    });

    const priceInput = card.querySelector(".visibility-v2-resource-price");
    priceInput?.addEventListener("input", () => {
      resource.price = normalizePriceInput(priceInput.value);
      syncGlobalPriceFromResources();
    });
    priceInput?.addEventListener("blur", () => {
      const numeric = normalizePrice(priceInput.value);
      if (priceInput.value.trim() && Number.isFinite(numeric)) {
        resource.price = numeric.toFixed(2);
        priceInput.value = resource.price;
        syncGlobalPriceFromResources();
      }
    });

    card.querySelector(`#resource-cover-${index}`)?.addEventListener("change", async (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      const error = await validateCoverImage(file);
      if (error) {
        const errorRoot = card.querySelector('[data-resource-error="cover"]');
        if (errorRoot) errorRoot.textContent = error;
        event.currentTarget.value = "";
        return;
      }
      resource.coverMode = "custom";
      resource.coverFile = file;
      renderResources();
    });

    card.querySelector(".visibility-v2-use-pack-cover")?.addEventListener("click", () => {
      resource.coverMode = "pack";
      resource.coverFile = packData.identity.coverFile;
      renderResources();
    });

    card.querySelector(".visibility-v2-resource-file")?.addEventListener("change", (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      const error = validateResourceFile(file);
      if (error) {
        const errorRoot = card.querySelector('[data-resource-error="file"]');
        if (errorRoot) errorRoot.textContent = error;
        event.currentTarget.value = "";
        return;
      }
      resource.file = file;
      resource.originalName = file.name;
      resource.size = Number(file.size || 0);
      resource.extension = getFileExtension(file.name);
      if (!resource.title.trim()) resource.title = titleFromResourceFile(file);
      renderResources();
    });

    card.querySelector(".visibility-v2-resource-remove")?.addEventListener("click", () => {
      packData.resources.splice(index, 1);
      syncGlobalPriceFromResources();
      renderResources();
    });
  });

  document.querySelector(".prev-btn")?.addEventListener("click", () => {
    currentStep = 0;
    render();
  });

  document.querySelector(".next-btn")?.addEventListener("click", () => {
    if (!validateResources(true)) return;
    currentStep = 2;
    render();
  });
}

function renderTracks() {
  missionCard.innerHTML = `
    <section class="step-panel">
      <button type="button" class="content-type-back" data-return-to-pack>
        <span aria-hidden="true">‹</span>
        <span>Pack</span>
      </button>
      <header class="step-header">
        <p class="step-number">ÉTAPE 2 SUR 4</p>
        <h2>Tracks du pack</h2>
      </header>

      <section class="tracks-list">
        ${packData.tracks.map((track, index) => renderTrackCard(track, index)).join("")}
      </section>

      <div class="track-footer">
        <div class="track-footer-actions">
          <button
            type="button"
            class="add-track-btn"
            ${packData.tracks.length >= MAX_TRACKS ? "disabled" : ""}
          >
            <span>+</span>
            Ajouter une nouvelle track
          </button>

          <label class="add-track-btn import-tracks-btn ${packData.tracks.length >= MAX_TRACKS && !packData.tracks.some(isBlankTrack) ? "is-disabled" : ""}">
            <input
              class="import-tracks-input"
              type="file"
              multiple
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/flac,audio/x-flac"
              ${packData.tracks.length >= MAX_TRACKS && !packData.tracks.some(isBlankTrack) ? "disabled" : ""}
            >
            <span>+</span>
            Ajouter plusieurs tracks
          </label>
        </div>

        <small>${packData.tracks.length} / ${MAX_TRACKS} tracks</small>
      </div>

      <small class="field-error track-import-error" data-track-import-error></small>

      <div class="actions">
        <button type="button" class="prev-btn">Retour</button>
        <button type="button" class="next-btn">Continuer</button>
      </div>
    </section>
  `;

  bindTrackCards();

  document.querySelector("[data-return-to-pack]")?.addEventListener("click", () => {
    currentStep = 0;
    render();
  });

  document.querySelector("button.add-track-btn").addEventListener("click", async () => {
    if (packData.tracks.length >= MAX_TRACKS) return;

    packData.tracks.push(createEmptyTrack({
      coverFile: packData.identity.coverFile,
      coverMode: "pack"
    }));
    syncGlobalPriceFromTracks();
    renderTracks();

    requestAnimationFrame(() => {
      document.querySelector(".track-card:last-child")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    });
  });

  document.querySelector(".import-tracks-input")?.addEventListener("change", async (event) => {
    await importMultipleTrackAudios(event.currentTarget.files);
  });

  document.querySelector(".prev-btn").addEventListener("click", async () => {
    currentStep = 0;
    render();
  });

  document.querySelector(".next-btn").addEventListener("click", async () => {
    const allValid = packData.tracks.every((_, index) => validateTrack(index, true));

    if (!allValid || packData.tracks.length < 1) {
      scrollToFirstError();
      return;
    }

    currentStep = 2;
    render();
  });
}

async function importMultipleTrackAudios(fileList) {
  const selectedFiles = Array.from(fileList || []);
  if (!selectedFiles.length) return;

  const blankIndexes = packData.tracks
    .map((track, index) => (isBlankTrack(track) ? index : -1))
    .filter((index) => index >= 0);
  const availableSlots = blankIndexes.length + Math.max(0, MAX_TRACKS - packData.tracks.length);
  const rejected = [];
  const validFiles = [];

  selectedFiles.forEach((file) => {
    const error = validateAudioFile(file);
    if (error) rejected.push(error);
    else validFiles.push(file);
  });

  const accepted = validFiles.slice(0, availableSlots);
  const durations = await Promise.all(accepted.map((file) => readAudioDuration(file)));

  accepted.forEach((file, acceptedIndex) => {
    const blankIndex = blankIndexes.shift();
    const duration = durations[acceptedIndex] || 0;

    if (blankIndex !== undefined) {
      const track = packData.tracks[blankIndex];
      track.title = titleFromAudioFile(file) || `Track ${blankIndex + 1}`;
      track.audioFile = file;
      track.duration = duration;
      if (track.coverMode !== "custom") {
        track.coverMode = "pack";
        track.coverFile = packData.identity.coverFile;
      }
      return;
    }

    const track = createEmptyTrack({
      coverFile: packData.identity.coverFile,
      coverMode: "pack"
    });
    track.title = titleFromAudioFile(file) || `Track ${packData.tracks.length + 1}`;
    track.audioFile = file;
    track.duration = duration;
    packData.tracks.push(track);
  });

  syncGlobalPriceFromTracks();
  renderTracks();

  const feedback = document.querySelector("[data-track-import-error]");
  if (!feedback) return;

  if (validFiles.length > availableSlots) {
    feedback.textContent = `${MAX_TRACKS} tracks maximum par pack.`;
    return;
  }

  if (rejected.length) {
    feedback.textContent = rejected[0];
  }
}

function renderTrackCard(track, index) {
  const usesPackCover = trackUsesPackCover(track);

  return `
    <article class="track-card" data-track-index="${index}">
      <header class="track-card-header">
        <div>
          <p>TRACK ${index + 1}</p>
          <h3>${escapeHtml(track.title || `Nouvelle track ${index + 1}`)}</h3>
        </div>

        ${packData.tracks.length > 1 ? `
          <button type="button" class="remove-track-btn" aria-label="Supprimer la track">
            Supprimer
          </button>
        ` : ""}
      </header>

      <div class="track-fields">
        <label class="field">
          <span>Titre de la track</span>
          <div class="track-title-spacer" aria-hidden="true"></div>
          <input
            class="track-title"
            maxlength="70"
            placeholder="Titre de la track"
            value="${escapeHtml(track.title)}"
          >
          <small class="field-error" data-track-error="title"></small>
        </label>

        <div class="field">
          <span>Accès à la track</span>

          <div class="price-mode">
            <button type="button" class="price-mode-btn ${!track.isFree ? "active" : ""}" data-price-mode="paid">
              Payante
            </button>
            <button type="button" class="price-mode-btn ${track.isFree ? "active" : ""}" data-price-mode="free">
              Gratuite
            </button>
          </div>

          <div class="price-input ${track.isFree ? "is-hidden" : ""}">
            <input
              class="track-price"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="Entre 1 et 100"
              value="${track.isFree ? "" : escapeHtml(track.price)}"
              ${track.isFree ? "disabled" : ""}
            >
            <span>€</span>
          </div>

          <small class="field-hint">
            Prix autorisé : de 1 € à 100 € par track.
          </small>
          <small class="field-error" data-track-error="price"></small>
        </div>
      </div>

      <div class="track-upload-grid">
        <div class="upload-section compact">
          <div class="upload-heading track-cover-heading">
            <div>
              <h3>${usesPackCover ? "Cover du pack" : "Cover de la track"}</h3>
            </div>
            ${!usesPackCover ? `
              <button type="button" class="use-pack-cover-btn">Cover du pack</button>
            ` : ""}
          </div>

          ${renderImageDropzone(
            `track-cover-${index}`,
            track.coverFile,
            "Dépose la cover",
            "Image carrée · JPG, PNG ou WEBP"
          )}

          <small class="field-error" data-track-error="cover"></small>
        </div>

        <div class="upload-section compact">
          <div class="upload-heading">
            <div>
              <h3>Fichier audio</h3>
            </div>
          </div>

          ${renderAudioDropzone(
            `track-audio-${index}`,
            track.audioFile,
            track.duration,
            track.coverFile,
            track.title || `Track ${index + 1}`
          )}

          <small class="field-error" data-track-error="audio"></small>
        </div>
      </div>
    </article>
  `;
}

function cameraIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2h5Z"></path>
      <circle cx="12" cy="13" r="3.5"></circle>
    </svg>
  `;
}

function audioIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 18V5l10-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="16" cy="16" r="3"></circle>
    </svg>
  `;
}

function renderImageDropzone(inputId, file, title, subtitle) {
  const previewUrl = file ? createObjectUrl(file) : "";

  return `
    <label class="cover-picker ${file ? "has-file" : ""}" for="${inputId}">
      <input id="${inputId}" type="file" accept="image/jpeg,image/png,image/webp">

      ${file ? `
        <img class="cover-picker-preview" src="${previewUrl}" alt="Aperçu de la cover sélectionnée">
        <span class="cover-picker-action">
          <span class="cover-picker-camera">${cameraIcon()}</span>
          <span>
            <strong>Changer la cover</strong>
            <small>${escapeHtml(file.name)}</small>
          </span>
        </span>
      ` : `
        <span class="cover-picker-camera">${cameraIcon()}</span>
        <span class="cover-picker-copy">
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </span>
      `}
    </label>
  `;
}

function renderAudioDropzone(inputId, file, duration, coverFile, trackTitle) {
  const audioUrl = file ? createObjectUrl(file) : "";
  const coverUrl = coverFile ? createObjectUrl(coverFile) : "";

  return `
    <div class="audio-picker ${file ? "has-file" : ""}">
      <input
        id="${inputId}"
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/flac,audio/x-flac"
      >

      ${file ? `
        <div class="sonara-track-preview" data-audio-preview>
          <div class="sonara-track-preview-main">
            <div class="sonara-track-cover ${coverUrl ? "has-cover" : ""}">
              ${coverUrl
                ? `<img src="${coverUrl}" alt="Cover de ${escapeHtml(trackTitle)}">`
                : `<span>${audioIcon()}</span>`}

              <button type="button" class="sonara-preview-play is-play" aria-label="Lire la track"></button>
            </div>

            <div class="sonara-track-meta">
              <strong class="sonara-preview-title">${escapeHtml(trackTitle)}</strong>
              <span>${escapeHtml(file.name)}</span>
              <small>${formatFileSize(file.size)}${duration ? ` · ${formatDuration(duration)}` : ""}</small>
            </div>

            <label class="replace-file-btn" for="${inputId}">Remplacer</label>
          </div>

          <audio class="sonara-preview-audio" preload="metadata" src="${audioUrl}"></audio>

          <div class="sonara-preview-progress-row">
            <span class="sonara-preview-current">0:00</span>
            <button type="button" class="sonara-preview-progress" aria-label="Déplacer la lecture">
              <span class="sonara-preview-progress-fill"></span>
            </button>
            <span class="sonara-preview-duration">${duration ? formatDuration(duration) : "0:00"}</span>
          </div>
        </div>
      ` : `
        <label class="audio-picker-empty" for="${inputId}">
          <span class="audio-picker-icon">${audioIcon()}</span>
          <span>
            <strong>Choisir le fichier audio</strong>
            <small>MP3, WAV ou FLAC · 250 Mo max</small>
          </span>
        </label>
      `}
    </div>
  `;
}

function bindTrackCards() {
  document.querySelectorAll(".track-card").forEach((card) => {
    const index = Number(card.dataset.trackIndex);
    const track = packData.tracks[index];
    const titleInput = card.querySelector(".track-title");
    const priceInput = card.querySelector(".track-price");
    const coverInput = card.querySelector(`#track-cover-${index}`);
    const audioInput = card.querySelector(`#track-audio-${index}`);
    bindAudioPreview(card);

    titleInput.addEventListener("input", () => {
      track.title = titleInput.value;
      const nextTitle = titleInput.value.trim() || `Nouvelle track ${index + 1}`;
      card.querySelector("h3").textContent = nextTitle;
      const previewTitle = card.querySelector(".sonara-preview-title");
      if (previewTitle) previewTitle.textContent = nextTitle;
      clearTrackError(card, "title");
      });

    card.querySelectorAll("[data-price-mode]").forEach((button) => {
      button.addEventListener("click", async () => {
        track.isFree = button.dataset.priceMode === "free";
        track.price = track.isFree ? "0.00" : "";
        syncGlobalPriceFromTracks();
        renderTracks();
      });
    });

    priceInput?.addEventListener("input", () => {
      track.price = normalizePriceInput(priceInput.value);
      syncGlobalPriceFromTracks();
      clearTrackError(card, "price");
      });

    priceInput?.addEventListener("blur", () => {
      const rawPrice = priceInput.value.trim();
      const numericPrice = normalizePrice(rawPrice);
      const normalized = rawPrice && Number.isFinite(numericPrice)
        ? numericPrice.toFixed(2)
        : normalizePriceInput(rawPrice);
      track.price = normalized;
      priceInput.value = normalized;
      syncGlobalPriceFromTracks();
    });

    coverInput.addEventListener("change", async () => {
      const file = coverInput.files?.[0];
      if (!file) return;

      const error = await validateCoverImage(file);

      if (error) {
        showTrackError(card, "cover", error);
        coverInput.value = "";
        return;
      }

      track.coverMode = "custom";
      track.coverFile = file;
      clearTrackError(card, "cover");
      renderTracks();
    });

    card.querySelector(".use-pack-cover-btn")?.addEventListener("click", () => {
      track.coverMode = "pack";
      track.coverFile = packData.identity.coverFile;
      clearTrackError(card, "cover");
      renderTracks();
    });

    audioInput.addEventListener("change", async () => {
      const file = audioInput.files?.[0];
      if (!file) return;

      const error = validateAudioFile(file);

      if (error) {
        showTrackError(card, "audio", error);
        audioInput.value = "";
        return;
      }

      track.audioFile = file;
      track.duration = await readAudioDuration(file);
      clearTrackError(card, "audio");
      renderTracks();
    });

    card.querySelector(".remove-track-btn")?.addEventListener("click", async () => {
      packData.tracks.splice(index, 1);
      syncGlobalPriceFromTracks();
      renderTracks();
    });
  });
}

function renderAudioPrice() {
  syncGlobalPriceFromTracks();
  const tracksTotal = calculateTracksTotal();
  const displayedPrice = packData.globalIsFree
    ? 0
    : normalizePrice(packData.globalPrice);

  missionCard.innerHTML = `
    <section class="step-panel">
      <header class="step-header">
        <p class="step-number">ÉTAPE 3 SUR 4</p>
        <h2>Prix du pack</h2>
      </header>

      <section class="auto-price-card">
        <span>Prix final du pack</span>
        <strong class="global-price-preview">
          ${packData.globalIsFree ? "Gratuit" : `${displayedPrice.toFixed(2)} €`}
        </strong>
        <small>Base automatique : ${tracksTotal.toFixed(2)} € · ${packData.tracks.length} track${packData.tracks.length > 1 ? "s" : ""}</small>

        <div class="global-price-control ${packData.globalIsFree ? "is-free" : ""}">
          <button type="button" class="global-price-step" data-price-step="-1" aria-label="Baisser le prix de 1 euro">−</button>
          <div class="global-price-input-wrap">
            <input
              class="global-price-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              value="${packData.globalIsFree ? "0.00" : escapeHtml(packData.globalPrice)}"
              ${packData.globalIsFree ? "disabled" : ""}
              aria-label="Prix final du pack"
            >
            <span>€</span>
          </div>
          <button type="button" class="global-price-step" data-price-step="1" aria-label="Augmenter le prix de 1 euro">+</button>
        </div>

        <button type="button" class="reset-global-price" ${packData.globalIsFree ? "disabled" : ""}>
          Revenir au total automatique
        </button>
      </section>

      <section class="price-summary">
        <div>
          <span>Nombre de tracks</span>
          <strong>${packData.tracks.length}</strong>
        </div>
        <div>
          <span>Tracks payantes</span>
          <strong>${packData.tracks.filter((track) => !track.isFree).length}</strong>
        </div>
        <div>
          <span>Total des tracks</span>
          <strong>${tracksTotal.toFixed(2)} €</strong>
        </div>
      </section>

      <small class="field-error" data-error="global-price"></small>

      <div class="actions">
        <button type="button" class="prev-btn">Retour</button>
        <button type="button" class="next-btn">Continuer</button>
      </div>
    </section>
  `;

  const input = document.querySelector(".global-price-input");
  const updateManualPrice = (nextValue) => {
    const numeric = Math.min(PACK_MAX_PRICE, Math.max(PACK_MIN_PRICE, nextValue));
    packData.globalIsFree = false;
    packData.globalPriceCustomized = true;
    packData.globalPrice = numeric.toFixed(2);
    renderPrice();
  };

  document.querySelectorAll("[data-price-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = normalizePrice(packData.globalPrice) || tracksTotal || PACK_MIN_PRICE;
      updateManualPrice(current + Number(button.dataset.priceStep));
    });
  });

  input?.addEventListener("input", () => {
    packData.globalPriceCustomized = true;
    packData.globalPrice = normalizePriceInput(input.value);
    clearFieldError("global-price");
  });

  input?.addEventListener("blur", () => {
    const value = normalizePrice(input.value);
    if (!Number.isFinite(value)) {
      showFieldError("global-price", "Entre un prix valide.");
      return;
    }
    updateManualPrice(value);
  });

  document.querySelector(".reset-global-price")?.addEventListener("click", () => {
    packData.globalPriceCustomized = false;
    syncGlobalPriceFromTracks();
    renderPrice();
  });

  document.querySelector(".prev-btn").addEventListener("click", async () => {
    currentStep = 1;
    render();
  });

  document.querySelector(".next-btn").addEventListener("click", async () => {
    if (!validateGlobalPrice()) return;
    currentStep = 3;
    render();
  });
}


function renderResourcePrice() {
  syncGlobalPriceFromResources();
  const resourceCount = packData.resources.length;
  const resourcesTotal = calculateResourcesTotal();
  const displayedPrice = packData.globalIsFree ? 0 : normalizePrice(packData.globalPrice);

  missionCard.innerHTML = `
    <section class="step-panel">
      <header class="step-header">
        <p class="step-number">ÉTAPE 3 SUR 4</p>
        <h2>Prix du pack</h2>
      </header>

      <section class="auto-price-card">
        <span>Prix final du pack</span>
        <strong class="global-price-preview">${packData.globalIsFree ? "Gratuit" : `${displayedPrice.toFixed(2)} €`}</strong>
        <small>Base automatique : ${resourcesTotal.toFixed(2)} € · ${resourceCount} ${isMidiContent() ? "MIDI" : "projet"}${resourceCount > 1 ? "s" : ""}</small>

        <div class="global-price-control ${packData.globalIsFree ? "is-free" : ""}">
          <button type="button" class="global-price-step" data-price-step="-1" aria-label="Baisser le prix de 1 euro">−</button>
          <div class="global-price-input-wrap">
            <input class="global-price-input" type="text" inputmode="decimal" autocomplete="off" value="${packData.globalIsFree ? "0.00" : escapeHtml(packData.globalPrice)}" ${packData.globalIsFree ? "disabled" : ""} aria-label="Prix final du pack">
            <span>€</span>
          </div>
          <button type="button" class="global-price-step" data-price-step="1" aria-label="Augmenter le prix de 1 euro">+</button>
        </div>
        <button type="button" class="reset-global-price" ${packData.globalIsFree ? "disabled" : ""}>Revenir au total automatique</button>
      </section>

      <section class="price-summary">
        <div><span>Type de contenu</span><strong>${isMidiContent() ? "MIDI" : "Projet DAW"}</strong></div>
        <div><span>Ressources payantes</span><strong>${packData.resources.filter((resource) => !resource.isFree).length}</strong></div>
        <div><span>Total des ressources</span><strong>${resourcesTotal.toFixed(2)} €</strong></div>
      </section>

      <small class="field-error" data-error="global-price"></small>
      <div class="actions">
        <button type="button" class="prev-btn">Retour</button>
        <button type="button" class="next-btn">Continuer</button>
      </div>
    </section>
  `;

  const input = document.querySelector(".global-price-input");
  const updateManualPrice = (nextValue) => {
    const numeric = Math.min(PACK_MAX_PRICE, Math.max(PACK_MIN_PRICE, nextValue));
    packData.globalIsFree = false;
    packData.globalPriceCustomized = true;
    packData.globalPrice = numeric.toFixed(2);
    renderResourcePrice();
  };

  document.querySelectorAll("[data-price-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = normalizePrice(packData.globalPrice) || resourcesTotal || PACK_MIN_PRICE;
      updateManualPrice(current + Number(button.dataset.priceStep));
    });
  });
  input?.addEventListener("input", () => {
    packData.globalPriceCustomized = true;
    packData.globalPrice = normalizePriceInput(input.value);
    clearFieldError("global-price");
  });
  input?.addEventListener("blur", () => {
    const value = normalizePrice(input.value);
    if (!Number.isFinite(value)) {
      showFieldError("global-price", "Entre un prix valide.");
      return;
    }
    updateManualPrice(value);
  });
  document.querySelector(".reset-global-price")?.addEventListener("click", () => {
    packData.globalPriceCustomized = false;
    syncGlobalPriceFromResources();
    renderResourcePrice();
  });
  document.querySelector(".prev-btn")?.addEventListener("click", () => { currentStep = 1; render(); });
  document.querySelector(".next-btn")?.addEventListener("click", () => {
    if (!validateGlobalPrice()) return;
    currentStep = 3;
    render();
  });
}

function renderPrice() {
  if (isAudioContent()) return renderAudioPrice();
  return renderResourcePrice();
}

function createPackLicenseCheckboxGroup(items, values, type) {
  return items.map(([key, title, description]) => `
    <label class="create-license-choice ${values[key] ? "is-active" : ""}">
      <input type="checkbox" name="${type}_${key}" ${values[key] ? "checked" : ""}>
      <span class="create-license-choice-mark" aria-hidden="true">${type === "permission" ? "✓" : "−"}</span>
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
    </label>
  `).join("");
}

function createPackLicenseLineList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function readCreatePackLicenseForm(form) {
  if (!form) return cloneCreatePackLicense(packData.license);
  const data = new FormData(form);
  return cloneCreatePackLicense({
    template: "sonara-standard",
    version: 1,
    name: String(data.get("licenseName") || "Licence standard Sonara").trim(),
    creditRequired: data.get("creditRequired") === "on",
    permissions: Object.fromEntries(
      CREATE_PACK_LICENSE_PERMISSIONS.map(([key]) => [key, data.get(`permission_${key}`) === "on"])
    ),
    restrictions: Object.fromEntries(
      CREATE_PACK_LICENSE_RESTRICTIONS.map(([key]) => [key, data.get(`restriction_${key}`) === "on"])
    ),
    customPermissions: String(data.get("customPermissions") || "")
      .split("\n").map((item) => item.trim()).filter(Boolean),
    customRestrictions: String(data.get("customRestrictions") || "")
      .split("\n").map((item) => item.trim()).filter(Boolean),
    customTerms: String(data.get("customTerms") || "").trim()
  });
}

function createPackLicensePreviewItems(items, values, customItems) {
  return [
    ...items.filter(([key]) => values[key]).map(([, title]) => title),
    ...(Array.isArray(customItems) ? customItems : [])
  ];
}

function updateCreatePackLicensePreview(form) {
  const license = readCreatePackLicenseForm(form);
  const preview = document.querySelector(".create-license-preview");
  if (!preview) return;

  const permissions = createPackLicensePreviewItems(
    CREATE_PACK_LICENSE_PERMISSIONS,
    license.permissions,
    license.customPermissions
  );
  const restrictions = createPackLicensePreviewItems(
    CREATE_PACK_LICENSE_RESTRICTIONS,
    license.restrictions,
    license.customRestrictions
  );

  preview.innerHTML = `
    <header class="create-license-preview-head">
      <span>LICENCE V1</span>
      <strong>${escapeHtml(license.name || "Licence Sonara")}</strong>
    </header>
    <div class="create-license-preview-columns">
      <section>
        <h3>Vous pouvez</h3>
        <ul>${permissions.length
          ? permissions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
          : "<li>Aucune permission sélectionnée.</li>"}</ul>
      </section>
      <section class="is-restricted">
        <h3>Interdit</h3>
        <ul>${restrictions.length
          ? restrictions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
          : "<li>Aucune restriction supplémentaire.</li>"}</ul>
      </section>
    </div>
    ${license.creditRequired ? '<p class="create-license-preview-credit">Crédit de l’artiste obligatoire.</p>' : ""}
    ${license.customTerms ? `<p class="create-license-preview-terms">${escapeHtml(license.customTerms)}</p>` : ""}
  `;
  requestAnimationFrame(() => window.SonaraI18n?.refresh?.());
}

function syncCreatePackLicenseForm(form) {
  packData.license = readCreatePackLicenseForm(form);
  clearFieldError("license");
  updateCreatePackLicensePreview(form);
}

function bindCreatePackLicenseForm(form) {
  form.querySelectorAll(".create-license-choice input").forEach((input) => {
    input.addEventListener("change", () => {
      input.closest(".create-license-choice")?.classList.toggle("is-active", input.checked);
      syncCreatePackLicenseForm(form);
    });
  });

  form.querySelectorAll("input, textarea").forEach((field) => {
    field.addEventListener("input", () => syncCreatePackLicenseForm(form));
    field.addEventListener("change", () => syncCreatePackLicenseForm(form));
  });
}

function splitCreationList(value) {
  return [...new Set(String(value || "").split(/[,\n;]/g).map((item) => item.trim()).filter(Boolean))].slice(0, 30);
}

function inferCreationEvidenceKind(file) {
  const extension = String(file?.name || "").toLowerCase().split(".").pop();
  if (["mid", "midi"].includes(extension)) return "midi";
  if (["flp", "als", "logicx", "rpp", "cpr", "ptx", "song"].includes(extension)) return "project";
  if (["wav", "flac", "aif", "aiff", "zip"].includes(extension)) return "stems";
  if (["png", "jpg", "jpeg", "webp", "pdf"].includes(extension)) return "capture";
  return "other";
}

function syncHumanCreationForm(form) {
  if (!form) return;
  const aiUsed = Boolean(form.elements.aiAssistanceUsed?.checked);
  packData.creationProcess = {
    humanCreationConfirmed: Boolean(form.elements.humanCreationConfirmed?.checked),
    daw: String(form.elements.creationDaw?.value || "").trim(),
    instruments: splitCreationList(form.elements.creationInstruments?.value),
    plugins: splitCreationList(form.elements.creationPlugins?.value),
    midiPresent: Boolean(form.elements.creationMidiPresent?.checked),
    aiAssistanceUsed: aiUsed,
    aiAssistanceType: aiUsed ? String(form.elements.aiAssistanceType?.value || "other") : "none",
    aiAssistanceDetails: aiUsed ? String(form.elements.aiAssistanceDetails?.value || "").trim() : "",
    processComment: String(form.elements.creationProcessComment?.value || "").trim()
  };
}

function renderLicense() {
  const license = cloneCreatePackLicense(packData.license);

  missionCard.innerHTML = `
    <section class="step-panel create-license-step">
      <header class="step-header">
        <p class="step-number">ÉTAPE 4 SUR 4</p>
        <h2>Licence d’utilisation</h2>
      </header>

      <div class="create-license-layout">
        <form class="create-license-editor">
          <div class="create-license-intro">
            <div>
              <strong>Licence du pack complet</strong>
              <small>Elle s’applique au pack et à toutes ses tracks vendues séparément.</small>
            </div>
            <button class="create-license-reset" type="button">Licence Sonara par défaut</button>
          </div>

          <label class="create-license-name">
            <span>Nom de la licence</span>
            <input name="licenseName" maxlength="90" value="${escapeHtml(license.name)}" required>
            <small>Ce nom sera visible par l’acheteur.</small>
          </label>

          <fieldset class="create-license-fieldset">
            <legend>Utilisations autorisées</legend>
            <div class="create-license-choice-grid">
              ${createPackLicenseCheckboxGroup(CREATE_PACK_LICENSE_PERMISSIONS, license.permissions, "permission")}
            </div>
          </fieldset>

          <fieldset class="create-license-fieldset is-danger">
            <legend>Utilisations interdites</legend>
            <div class="create-license-choice-grid">
              ${createPackLicenseCheckboxGroup(CREATE_PACK_LICENSE_RESTRICTIONS, license.restrictions, "restriction")}
            </div>
          </fieldset>

          <label class="create-license-credit">
            <input type="checkbox" name="creditRequired" ${license.creditRequired ? "checked" : ""}>
            <span>
              <strong>Crédit de l’artiste obligatoire</strong>
              <small>L’acheteur devra mentionner l’artiste dans son projet publié.</small>
            </span>
          </label>

          <div class="create-license-custom-grid">
            <label>
              <span>Autorisations personnalisées</span>
              <textarea name="customPermissions" maxlength="2200" placeholder="Une autorisation par ligne">${escapeHtml(createPackLicenseLineList(license.customPermissions))}</textarea>
            </label>
            <label>
              <span>Interdictions personnalisées</span>
              <textarea name="customRestrictions" maxlength="2200" placeholder="Une interdiction par ligne">${escapeHtml(createPackLicenseLineList(license.customRestrictions))}</textarea>
            </label>
          </div>

          <label>
            <span>Conditions complémentaires</span>
            <textarea name="customTerms" maxlength="1600" placeholder="Précisions particulières visibles par l’acheteur">${escapeHtml(license.customTerms || "")}</textarea>
          </label>

          <label class="create-license-credit create-rights-declaration">
            <input type="checkbox" name="rightsDeclarationAccepted" ${packData.rightsDeclarationAccepted ? "checked" : ""}>
            <span>
              <strong>Déclaration de droits obligatoire</strong>
              <small>Je confirme disposer des droits nécessaires pour publier et licencier ce contenu sur Sonara Pack.</small>
            </span>
          </label>

          <section class="create-human-proof">
            <div class="create-human-proof-head">
              <div>
                <strong>Création humaine & vérification</strong>
                <small>Ces informations et justificatifs restent privés et sont visibles uniquement par la modération.</small>
              </div>
              <span class="create-human-badge">HUMAN FIRST</span>
            </div>

            <label class="create-license-credit create-human-declaration">
              <input type="checkbox" name="humanCreationConfirmed" ${packData.creationProcess.humanCreationConfirmed ? "checked" : ""}>
              <span>
                <strong>Déclaration de création humaine obligatoire</strong>
                <small>Je confirme que cette musique a été créée principalement par un humain, que je possède les droits nécessaires et qu’elle n’a pas été générée majoritairement par une intelligence artificielle.</small>
              </span>
            </label>

            <div class="create-human-grid">
              <label><span>DAW utilisé</span><input name="creationDaw" maxlength="100" value="${escapeHtml(packData.creationProcess.daw || "")}" placeholder="FL Studio, Ableton Live…"></label>
              <label><span>Instruments utilisés</span><input name="creationInstruments" maxlength="900" value="${escapeHtml((packData.creationProcess.instruments || []).join(", "))}" placeholder="Piano, violon, batterie…"></label>
              <label><span>VST / plugins principaux</span><input name="creationPlugins" maxlength="1200" value="${escapeHtml((packData.creationProcess.plugins || []).join(", "))}" placeholder="Kontakt, Serum, FabFilter…"></label>
              <label class="create-human-check"><input type="checkbox" name="creationMidiPresent" ${packData.creationProcess.midiPresent ? "checked" : ""}><span>MIDI utilisé dans la création</span></label>
            </div>

            <label class="create-human-check"><input type="checkbox" name="aiAssistanceUsed" ${packData.creationProcess.aiAssistanceUsed ? "checked" : ""}><span>Une aide IA technique a été utilisée</span></label>
            <div class="create-human-ai-fields" ${packData.creationProcess.aiAssistanceUsed ? "" : "hidden"}>
              <label><span>Type d’aide IA</span><select name="aiAssistanceType">
                <option value="mastering" ${packData.creationProcess.aiAssistanceType === "mastering" ? "selected" : ""}>Mastering assisté</option>
                <option value="cleanup" ${packData.creationProcess.aiAssistanceType === "cleanup" ? "selected" : ""}>Nettoyage audio</option>
                <option value="correction" ${packData.creationProcess.aiAssistanceType === "correction" ? "selected" : ""}>Correction technique</option>
                <option value="stem-separation" ${packData.creationProcess.aiAssistanceType === "stem-separation" ? "selected" : ""}>Séparation de stems</option>
                <option value="technical" ${packData.creationProcess.aiAssistanceType === "technical" ? "selected" : ""}>Autre aide technique</option>
                <option value="other" ${packData.creationProcess.aiAssistanceType === "other" ? "selected" : ""}>Autre</option>
              </select></label>
              <label><span>Précision sur l’aide IA</span><textarea name="aiAssistanceDetails" maxlength="700" placeholder="Explique brièvement ce que l’outil a fait.">${escapeHtml(packData.creationProcess.aiAssistanceDetails || "")}</textarea></label>
            </div>

            <label><span>Commentaire sur le processus de création</span><textarea name="creationProcessComment" maxlength="1600" placeholder="Optionnel : composition, enregistrement, arrangement, mix…">${escapeHtml(packData.creationProcess.processComment || "")}</textarea></label>

            <label class="create-human-evidence-upload">
              <span>Justificatifs privés pour la modération</span>
              <input type="file" name="creationEvidenceFiles" multiple accept=".mid,.midi,.flp,.als,.logicx,.rpp,.cpr,.ptx,.song,.wav,.flac,.aif,.aiff,.zip,.png,.jpg,.jpeg,.webp,.pdf">
              <small>MIDI, projet DAW, stems, capture ou document · 8 fichiers max · 100 Mo max par fichier.</small>
            </label>
            <div class="create-human-evidence-list"></div>
          </section>
        </form>

        <aside class="create-license-preview-panel">
          <p class="step-number">APERÇU ACHETEUR</p>
          <h3>Licence affichée avant l’achat</h3>
          <div class="create-license-preview"></div>
        </aside>
      </div>

      <section class="final-summary create-license-final-summary">
        ${renderSummaryRow("Titre", packData.identity.title)}
        ${createPackV1FeaturesEnabled ? renderSummaryRow("Type de contenu", isAudioContent() ? "Audio" : (isMidiContent() ? "MIDI" : "Projet DAW")) : ""}
        ${renderSummaryRow(isAudioContent() ? "Tracks" : "Ressources", String(isAudioContent() ? packData.tracks.length : packData.resources.length))}
        ${createPackV1FeaturesEnabled ? renderSummaryRow("Destiné principalement à", primaryAudienceLabel(packData.identity.primaryAudience)) : ""}
        ${renderSummaryRow("Prix global", packData.globalIsFree ? "Gratuit" : `${normalizePrice(packData.globalPrice).toFixed(2)} €`)}
        ${renderSummaryRow("Licence", license.name)}
      </section>

      <small class="field-error" data-error="license"></small>
      <section class="submit-error" hidden></section>

      <div class="actions">
        <button type="button" class="prev-btn">Retour</button>
        <button type="button" class="submit-btn">${escapeHtml(createPackTranslate("Envoyer à la modération"))}</button>
      </div>
    </section>
  `;

  const form = document.querySelector(".create-license-editor");
  bindCreatePackLicenseForm(form);
  updateCreatePackLicensePreview(form);
  const aiToggle = form.elements.aiAssistanceUsed;
  const aiFields = form.querySelector(".create-human-ai-fields");
  const evidenceInput = form.elements.creationEvidenceFiles;
  const evidenceList = form.querySelector(".create-human-evidence-list");
  const renderEvidenceList = () => {
    if (!evidenceList) return;
    evidenceList.innerHTML = packData.creationEvidenceFiles.length
      ? packData.creationEvidenceFiles.map((file) => `<span>${escapeHtml(file.name)} <small>${escapeHtml(inferCreationEvidenceKind(file))}</small></span>`).join("")
      : `<small>Aucun justificatif ajouté.</small>`;
  };
  aiToggle?.addEventListener("change", () => {
    if (aiFields) aiFields.hidden = !aiToggle.checked;
    syncHumanCreationForm(form);
  });
  form.querySelectorAll('[name^="creation"], [name="aiAssistanceType"], [name="aiAssistanceDetails"]').forEach((field) => {
    field.addEventListener("input", () => syncHumanCreationForm(form));
    field.addEventListener("change", () => syncHumanCreationForm(form));
  });
  evidenceInput?.addEventListener("change", () => {
    const files = Array.from(evidenceInput.files || []).slice(0, 8);
    const oversized = files.find((file) => file.size > 100 * 1024 * 1024);
    if (oversized) {
      showFieldError("license", "Un justificatif dépasse 100 Mo.");
      evidenceInput.value = "";
      return;
    }
    packData.creationEvidenceFiles = files;
    if (files.some((file) => ["midi", "project"].includes(inferCreationEvidenceKind(file)))) {
      packData.creationProcess.midiPresent = packData.creationProcess.midiPresent || files.some((file) => inferCreationEvidenceKind(file) === "midi");
    }
    renderEvidenceList();
  });
  renderEvidenceList();

  document.querySelector(".create-license-reset").addEventListener("click", () => {
    packData.license = createDefaultPackLicense();
    renderLicense();
  });

  document.querySelector(".prev-btn").addEventListener("click", async () => {
    syncCreatePackLicenseForm(form);
    currentStep = 2;
    render();
  });

  document.querySelector(".submit-btn").addEventListener("click", () => {
    syncCreatePackLicenseForm(form);
    syncHumanCreationForm(form);
    packData.rightsDeclarationAccepted = Boolean(form.elements.rightsDeclarationAccepted?.checked);
    submitPack();
  });
}

function primaryAudienceLabel(value) {
  if (value === "artists") return "Artistes / producteurs";
  if (value === "creators") return "Créateurs & projets";
  return "Les deux";
}

function renderSummaryRow(label, value) {
  return `
    <div>
      <span>${label}</span>
      <strong>${escapeHtml(value || "Manquant")}</strong>
    </div>
  `;
}


const PACK_SUBMISSION_TIPS = [
  "Une cover simple et lisible reste plus forte dans le catalogue mobile.",
  "Un titre court et identifiable aide les utilisateurs à retrouver ton pack.",
  "Pour un album, garde une vraie cohérence entre les tracks pour renforcer son identité.",
  "Évite les silences inutiles au début des sons : l'écoute doit commencer proprement.",
  "Des noms de tracks clairs facilitent leur utilisation dans les projets des utilisateurs.",
  "Vérifie le volume de chaque track avant publication pour garder un pack homogène.",
  "Une licence claire rassure l'utilisateur au moment d'intégrer le son dans son projet.",
  "Publier régulièrement aide ton catalogue à rester vivant et à être redécouvert.",
  "Teste toujours tes sons au casque et sur des haut-parleurs avant de les envoyer.",
  "Si plusieurs sons appartiennent au même univers, garde une identité visuelle cohérente."
];

function formatSubmissionElapsed(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function openPackSubmissionLoader(finalPack) {
  document.querySelector(".pack-submission-overlay")?.remove();

  const isAudio = String(finalPack?.contentType || "audio") === "audio";
  const trackCount = isAudio
    ? (Array.isArray(finalPack?.tracks) ? finalPack.tracks.length : packData.tracks.length)
    : (Array.isArray(finalPack?.resources) ? finalPack.resources.length : packData.resources.length);
  const formatLabel = isAudio
    ? (trackCount > 1 ? "Album" : "Single")
    : (String(finalPack?.contentType) === "midi" ? "MIDI" : "Projet DAW");
  const overlay = document.createElement("div");
  overlay.className = "pack-submission-overlay sonara-loading-surface";
  overlay.dataset.sonaraLoadingAudience = "artist";
  overlay.dataset.sonaraLoadingNativeTips = "true";
  overlay.innerHTML = `
    <section class="pack-submission-dialog" role="status" aria-live="polite" aria-busy="true">

      <p class="pack-submission-eyebrow">SONARA CREATOR</p>
      <h2>${escapeHtml(createPackTranslate("Envoi de ton pack"))}</h2>
      <p class="pack-submission-status" data-submit-status>${escapeHtml(createPackTranslate("Envoi et traitement en cours…"))}</p>

      <div class="pack-submission-pulse" aria-hidden="true"><span></span></div>

      <div class="pack-submission-meta">
        <div><span>${escapeHtml(createPackTranslate("Format"))}</span><strong>${escapeHtml(createPackTranslate(formatLabel))}</strong></div>
        <div><span>${escapeHtml(createPackTranslate(isAudio ? "Tracks" : "Ressources"))}</span><strong>${trackCount}</strong></div>
        <div><span>${escapeHtml(createPackTranslate("Temps écoulé"))}</span><strong data-submit-elapsed>00:00</strong></div>
      </div>

      <aside class="pack-submission-tip">
        <div>
          <span class="pack-submission-tip-label">${escapeHtml(createPackTranslate("CONSEIL ARTISTE"))}</span>
          <strong data-submit-tip>${escapeHtml(createPackTranslate(PACK_SUBMISSION_TIPS[0]))}</strong>
        </div>
        <span class="pack-submission-tip-actions">
          <button type="button" class="sonara-loading-advice-button pack-submission-previous-tip" aria-label="${escapeHtml(createPackTranslate("Conseil précédent"))}"></button>
          <button type="button" class="sonara-loading-advice-button pack-submission-next-tip" aria-label="${escapeHtml(createPackTranslate("Conseil suivant"))}"></button>
        </span>
      </aside>

      <small class="pack-submission-note">${escapeHtml(createPackTranslate("Tu peux rester sur cette page pendant que Sonara finalise l’envoi. Ne ferme pas l’onglet."))}</small>
    </section>
  `;

  document.body.appendChild(overlay);
  const startedAt = Date.now();
  const elapsed = overlay.querySelector("[data-submit-elapsed]");
  const tip = overlay.querySelector("[data-submit-tip]");
  const previousTipButton = overlay.querySelector(".pack-submission-previous-tip");
  const nextTipButton = overlay.querySelector(".pack-submission-next-tip");
  const progressBar = overlay.querySelector(".pack-submission-pulse");
  const progressFill = overlay.querySelector(".pack-submission-pulse span");
  let tipIndex = 0;

  const showTip = (direction) => {
    tipIndex = (tipIndex + direction + PACK_SUBMISSION_TIPS.length) % PACK_SUBMISSION_TIPS.length;
    tip.classList.remove("is-changing");
    void tip.offsetWidth;
    tip.classList.add("is-changing");
    tip.textContent = createPackTranslate(PACK_SUBMISSION_TIPS[tipIndex]);
  };

  const showNextTip = () => showTip(1);
  const showPreviousTip = () => showTip(-1);
  const loadingIcons = window.SonaraLoadingExperience?.icons;
  if (previousTipButton) previousTipButton.innerHTML = loadingIcons?.left || "‹";
  if (nextTipButton) nextTipButton.innerHTML = loadingIcons?.right || "›";

  previousTipButton?.addEventListener("click", showPreviousTip);
  nextTipButton?.addEventListener("click", showNextTip);
  const unbindTipKeyboard = window.SonaraLoadingExperience?.bindTipNavigation?.(overlay, {
    onPrevious: showPreviousTip,
    onNext: showNextTip,
    previousButton: previousTipButton,
    nextButton: nextTipButton
  }) || (() => {});

  const timer = window.setInterval(() => {
    elapsed.textContent = formatSubmissionElapsed((Date.now() - startedAt) / 1000);
  }, 250);

  const tipTimer = window.setInterval(showNextTip, 6500);

  requestAnimationFrame(() => overlay.classList.add("is-visible"));

  return {
    setStatus(message) {
      const status = overlay.querySelector("[data-submit-status]");
      if (status && message) status.textContent = createPackTranslate(message);
    },
    setUploadProgress(value) {
      const percent = Math.max(0, Math.min(100, Number(value) || 0));
      progressBar?.classList.add("is-upload-progress");
      progressBar?.setAttribute("role", "progressbar");
      progressBar?.setAttribute("aria-valuemin", "0");
      progressBar?.setAttribute("aria-valuemax", "100");
      progressBar?.setAttribute("aria-valuenow", String(Math.round(percent)));
      if (progressFill) progressFill.style.width = `${percent}%`;
    },
    setProcessing() {
      progressBar?.classList.remove("is-upload-progress");
      progressBar?.removeAttribute("role");
      progressBar?.removeAttribute("aria-valuemin");
      progressBar?.removeAttribute("aria-valuemax");
      progressBar?.removeAttribute("aria-valuenow");
      if (progressFill) progressFill.style.width = "36%";
    },
    waitMinimum() {
      return window.SonaraLoadingExperience?.waitMinimum?.(startedAt, 6000) || Promise.resolve();
    },
    close() {
      window.clearInterval(timer);
      window.clearInterval(tipTimer);
      unbindTipKeyboard();
      overlay.classList.remove("is-visible");
      window.setTimeout(() => overlay.remove(), 220);
    }
  };
}

async function sendPackFormData(formData, submissionLoader) {
  await window.SonaraApiRouter?.ready?.();

  const activeApi = window.SonaraApiRouter?.getState?.().active || API_URL;
  const requestUrl = `${String(activeApi || API_URL).replace(/\/+$/, "")}/api/packs/pending`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", requestUrl, true);
    xhr.timeout = 180000;

    const token = window.SonaraSession?.getToken?.();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      submissionLoader?.setUploadProgress((event.loaded / event.total) * 100);
    });

    xhr.upload.addEventListener("load", () => {
      submissionLoader?.setUploadProgress(100);
      submissionLoader?.setStatus("Fichiers reçus · vérification du pack…");
      window.setTimeout(() => submissionLoader?.setProcessing(), 180);
    });

    xhr.addEventListener("load", () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        responseText: xhr.responseText || ""
      });
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Connexion interrompue pendant l’envoi du pack."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("L’envoi du pack a été interrompu."));
    });

    xhr.addEventListener("timeout", () => {
      reject(new Error("Le serveur met trop de temps à finaliser l’envoi du pack. Réessaie dans un instant."));
    });

    submissionLoader?.setUploadProgress(0);
    xhr.send(formData);
  });
}

async function submitPack() {
  if (isSubmitting) return;

  const validation = validateEverything();

  if (!validation.valid) {
    currentStep = validation.step;
    render();

    requestAnimationFrame(() => {
      validation.show?.();
      scrollToFirstError();
    });

    return;
  }

  const submitButton = document.querySelector(".submit-btn");
  const submitError = document.querySelector(".submit-error");

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = createPackTranslate("Envoi en cours…");
  submitError.hidden = true;

  let submissionLoader = null;

  try {
    const finalPack = buildFinalPack();
    submissionLoader = openPackSubmissionLoader(finalPack);
    const formData = new FormData();

    formData.append("packData", JSON.stringify(finalPack));
    formData.append("coverPack", packData.identity.coverFile);

    if (isAudioContent()) {
      packData.tracks.forEach((track, index) => {
        // N'envoie une cover de track que si elle est réellement personnalisée.
        // La cover du pack est envoyée une seule fois et sert aux tracks héritées.
        if (!trackUsesPackCover(track) && track.coverFile) {
          formData.append(`trackCover_${index}`, track.coverFile);
        }
        formData.append(`trackAudio_${index}`, track.audioFile);
      });
    } else {
      packData.resources.forEach((resource, index) => {
        if (!resourceUsesPackCover(resource) && resource.coverFile) {
          formData.append(`resourceCover_${index}`, resource.coverFile);
        }
        formData.append(`resourceFile_${index}`, resource.file);
      });
    }

    packData.creationEvidenceFiles.forEach((file, index) => {
      formData.append(`creationEvidence_${index}`, file);
    });

    submissionLoader?.setStatus("Tes fichiers sont envoyés à Sonara…");

    const response = await sendPackFormData(formData, submissionLoader);
    const responseText = response.responseText;
    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`Le serveur a renvoyé une réponse invalide (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(
        result.message ||
        result.error ||
        "Le pack n’a pas pu être envoyé."
      );
    }

    submissionLoader?.setStatus("Pack confirmé · finalisation…");
    const storedPack = await confirmPackPersistence(finalPack, result);
    await submissionLoader?.waitMinimum?.();
    submissionLoader?.close();
    await finalizePublishedPack(storedPack);
    return;
  } catch (error) {
    submissionLoader?.close();
    submitError.hidden = false;
    submitError.textContent = createPackTranslate(error.message);
    submitButton.disabled = false;
    submitButton.textContent = createPackTranslate("Envoyer à la modération");
    isSubmitting = false;
  }
}

async function confirmPackPersistence(finalPack, result) {
  const responsePack = result?.pack;

  if (
    result?.success !== true ||
    !responsePack?.id ||
    String(responsePack.id) !== String(finalPack.id) ||
    String(responsePack.status || "").toLowerCase() !== "pending"
  ) {
    throw new Error(
      "Le serveur n’a pas confirmé l’enregistrement du pack. Le formulaire est conservé."
    );
  }

  if (result.persisted === true) {
    return responsePack;
  }

  const verificationResponse = await fetch(
    `${API_URL}/api/packs/pending?packId=${encodeURIComponent(finalPack.id)}`,
    { cache: "no-store" }
  );
  const verificationText = await verificationResponse.text();
  let verificationData = [];

  try {
    verificationData = verificationText
      ? JSON.parse(verificationText)
      : [];
  } catch {
    throw new Error(
      "Le pack a été reçu, mais sa sauvegarde n’a pas pu être vérifiée. Le formulaire est conservé."
    );
  }

  if (!verificationResponse.ok) {
    throw new Error(
      verificationData.message ||
      verificationData.error ||
      "Impossible de vérifier la sauvegarde du pack."
    );
  }

  const packs = Array.isArray(verificationData)
    ? verificationData
    : Array.isArray(verificationData.items)
      ? verificationData.items
      : Array.isArray(verificationData.packs)
        ? verificationData.packs
        : [];

  const storedPack = packs.find(
    (pack) =>
      String(pack?.id || "") === String(finalPack.id) &&
      String(pack?.status || "").toLowerCase() === "pending"
  );

  if (!storedPack) {
    throw new Error(
      "Le serveur n’a pas retrouvé le pack après l’envoi. Le formulaire est conservé."
    );
  }

  return storedPack;
}

function buildFinalPack() {
  const packId = `pack_${Date.now()}`;

  return {
    id: packId,
    title: packData.identity.title.trim(),
    artist: artistProfile.pseudo || "",
    artistId: artistProfile.accountId || artistProfile.id || "",
    accountId: artistProfile.accountId || artistProfile.id || "",
    userId: artistProfile.userId || artistProfile.rootUserId || "",
    rootUserId: artistProfile.rootUserId || artistProfile.userId || "",
    imageProfile: artistProfile.imageProfile || null,
    contentType: packData.identity.contentType || "audio",
    primaryAudience: packData.identity.primaryAudience || "both",
    dawName: isDawContent() ? packData.identity.dawName || "" : "",
    dawVersion: isDawContent() ? packData.identity.dawVersion || "" : "",
    dawPlugins: isDawContent() ? packData.identity.dawPlugins || "" : "",
    coverPack: packData.identity.coverFile.name,
    packLink: `app/pages/catalog/pack.html?id=${packId}`,
    isFree: packData.globalIsFree,
    price: packData.globalIsFree ? "Gratuit" : formatPriceForSubmission(packData.globalPrice),
    categorie: getDistributionCategories(packData.identity.categorie),
    downloadPage: `app/pages/catalog/download.html?id=${packId}`,
    paymentReady: false,
    tracks: isAudioContent() ? packData.tracks.map((track, index) => {
      const usesPackCover = trackUsesPackCover(track);
      const effectiveCover = getEffectiveTrackCover(track);

      return {
        id: `${packId}-${index + 1}`,
        trackLink: `app/pages/catalog/pack.html?id=${packId}&trackId=${packId}-${index + 1}`,
        downloadPage: `app/pages/catalog/download.html?id=${packId}&trackId=${packId}-${index + 1}`,
        title: track.title.trim(),
        artist: artistProfile.pseudo || "",
        coverMode: usesPackCover ? "pack" : "custom",
        coverPack: effectiveCover?.name || "",
        audioName: track.audioFile.name,
        isFree: track.isFree,
        price: track.isFree ? "Gratuit" : formatPriceForSubmission(track.price),
        previewDuration: 30,
        duration: track.duration || 0
      };
    }) : [],
    resources: isAudioContent() ? [] : packData.resources.map((resource, index) => {
      const usesPackCover = resourceUsesPackCover(resource);
      const effectiveCover = getEffectiveResourceCover(resource);
      const resourceId = `${packId}-resource-${index + 1}`;
      return {
        id: resourceId,
        resourceLink: `app/pages/catalog/pack.html?id=${packId}&resourceId=${resourceId}`,
        downloadPage: `app/pages/catalog/download.html?id=${packId}&resourceId=${resourceId}`,
        title: String(resource.title || resource.originalName || `Ressource ${index + 1}`).trim(),
        coverMode: usesPackCover ? "pack" : "custom",
        coverPack: effectiveCover?.name || "",
        isFree: resource.isFree,
        price: resource.isFree ? "Gratuit" : formatPriceForSubmission(resource.price),
        originalName: String(resource.originalName || resource.file?.name || ""),
        extension: String(resource.extension || getFileExtension(resource.file?.name || resource.originalName || "")),
        size: Number(resource.size || resource.file?.size || 0),
        resourceType: packData.identity.contentType,
        dawName: isDawContent() ? packData.identity.dawName || "" : "",
        dawVersion: isDawContent() ? packData.identity.dawVersion || "" : "",
        dawPlugins: isDawContent() ? packData.identity.dawPlugins || "" : ""
      };
    }),
    license: {
      ...cloneCreatePackLicense(packData.license),
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedByAccountId: artistProfile.accountId || artistProfile.id || null
    },
    rightsDeclarationAccepted: packData.rightsDeclarationAccepted === true,
    creationProcess: { ...packData.creationProcess, declaredAt: new Date().toISOString() },
    creationEvidenceKinds: packData.creationEvidenceFiles.map(inferCreationEvidenceKind),
    status: "pending",
    createdAt: new Date().toISOString()
  };
}

function validateIdentity() {
  let valid = true;

  if (!packData.identity.title.trim()) {
    showFieldError("identity-title", "Le titre du pack est obligatoire.");
    valid = false;
  }

  if (!packData.identity.categorie) {
    showFieldError("identity-category", "Choisis une catégorie de distribution.");
    valid = false;
  }

  if (!createPackV1FeaturesEnabled) {
    packData.identity.contentType = "audio";
    packData.identity.primaryAudience = "both";
  } else if (!isAudioContent()) {
    packData.identity.primaryAudience = "artists";
  } else if (!["creators", "artists", "both"].includes(packData.identity.primaryAudience)) {
    showFieldError("identity-audience", "Choisis à qui ce pack est principalement destiné.");
    valid = false;
  }

  if (!packData.identity.coverFile) {
    showFieldError("identity-cover", "Ajoute la cover du pack.");
    valid = false;
  }

  if (!valid) scrollToFirstError();
  return valid;
}

function validateTrack(index, focus = false) {
  const track = packData.tracks[index];
  const card = document.querySelector(`[data-track-index="${index}"]`);
  let valid = true;

  if (!track.title.trim()) {
    showTrackError(card, "title", "Le titre de cette track est obligatoire.");
    valid = false;
  }

  if (!track.isFree && !isPaidPrice(track.price)) {
    showTrackError(card, "price", `Le prix doit être compris entre ${TRACK_MIN_PRICE} € et ${TRACK_MAX_PRICE} €.`);
    valid = false;
  }

  // Une track est valide si elle a soit sa propre cover, soit la cover
  // du pack/album. L'erreur n'apparaît ici que si aucune des deux n'existe.
  if (!getEffectiveTrackCover(track)) {
    showTrackError(card, "cover", "Ajoute la cover de cette track.");
    valid = false;
  }

  if (!track.audioFile) {
    showTrackError(card, "audio", "Ajoute le fichier audio de cette track.");
    valid = false;
  }

  if (!valid && focus) {
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return valid;
}

function validateResources(focus = false) {
  let valid = true;

  if (!packData.resources.length) {
    showFieldError("resources", "Ajoute au moins une ressource.");
    valid = false;
  }

  for (let index = 0; index < packData.resources.length; index += 1) {
    const resource = packData.resources[index];
    const card = document.querySelector(`[data-resource-index="${index}"]`);
    const setError = (key, message) => {
      const root = card?.querySelector(`[data-resource-error="${key}"]`);
      if (root) root.textContent = message;
      valid = false;
    };

    if (!String(resource.title || "").trim()) setError("title", "Le titre est obligatoire.");
    if (!resource.isFree && !isPaidPrice(resource.price)) setError("price", `Le prix doit être compris entre ${TRACK_MIN_PRICE} € et ${TRACK_MAX_PRICE} €.`);
    if (!getEffectiveResourceCover(resource)) setError("cover", "Ajoute une cover.");
    const fileError = validateResourceFile(resource.file);
    if (fileError) setError("file", fileError);
  }

  if (isDawContent() && !String(packData.identity.dawName || "").trim()) {
    showFieldError("resource-daw", "Choisis le logiciel DAW correspondant.");
    valid = false;
  }

  if (!valid && focus) scrollToFirstError();
  return valid;
}

function validateGlobalPrice() {
  if (isAudioContent()) syncGlobalPriceFromTracks();
  else syncGlobalPriceFromResources();

  if (!packData.globalIsFree && !isValidGlobalPrice(packData.globalPrice)) {
    showFieldError("global-price", `Le prix global calculé doit rester entre ${PACK_MIN_PRICE} € et ${PACK_MAX_PRICE.toLocaleString("fr-FR")} €.`);
    scrollToFirstError();
    return false;
  }

  return true;
}

function validateEverything() {
  if (
    !packData.identity.title.trim() ||
    !packData.identity.categorie ||
    (createPackV1FeaturesEnabled && isAudioContent() && !["creators", "artists", "both"].includes(packData.identity.primaryAudience)) ||
    !packData.identity.coverFile
  ) {
    return {
      valid: false,
      step: 0,
      show: validateIdentity
    };
  }

  if (isAudioContent()) {
    const invalidTrackIndex = packData.tracks.findIndex((track) =>
      !track.title.trim() ||
      (!track.isFree && !isPaidPrice(track.price)) ||
      !getEffectiveTrackCover(track) ||
      !track.audioFile
    );

    if (invalidTrackIndex !== -1 || !packData.tracks.length) {
      return {
        valid: false,
        step: 1,
        show: () => validateTrack(Math.max(invalidTrackIndex, 0), true)
      };
    }
  } else if (!validateResources(false)) {
    return {
      valid: false,
      step: 1,
      show: () => validateResources(true)
    };
  }

  if (!packData.globalIsFree && !isValidGlobalPrice(packData.globalPrice)) {
    return {
      valid: false,
      step: 2,
      show: validateGlobalPrice
    };
  }

  if (!String(packData.license?.name || "").trim()) {
    return {
      valid: false,
      step: 3,
      show: () => showFieldError("license", "Donne un nom à la licence avant l’envoi.")
    };
  }

  if (packData.rightsDeclarationAccepted !== true) {
    return {
      valid: false,
      step: 3,
      show: () => showFieldError("license", "Confirme la déclaration de droits avant l’envoi.")
    };
  }

  if (packData.creationProcess?.humanCreationConfirmed !== true) {
    return {
      valid: false,
      step: 3,
      show: () => showFieldError("license", "Confirme la déclaration de création humaine avant l’envoi.")
    };
  }

  return { valid: true };
}

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Format refusé. Utilise JPG, PNG ou WEBP.";
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return "Cette image dépasse 8 Mo.";
  }

  return "";
}

async function validateCoverImage(file) {
  const fileError = validateImageFile(file);
  if (fileError) return fileError;

  try {
    const dimensions = await readImageDimensions(file);
    const ratio = dimensions.width / dimensions.height;

    if (dimensions.width < 600 || dimensions.height < 600) {
      return "Choisis une image d’au moins 600 × 600 px.";
    }

    if (ratio < 0.92 || ratio > 1.08) {
      return "La cover doit être carrée.";
    }
  } catch {
    return "Cette image ne peut pas être lue.";
  }

  return "";
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };

    image.src = url;
  });
}

function validateAudioFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const allowedExtension = ["mp3", "wav", "flac"].includes(extension);

  if (!ALLOWED_AUDIO_TYPES.includes(file.type) && !allowedExtension) {
    return "Format refusé. Utilise MP3, WAV ou FLAC.";
  }

  if (file.size > MAX_AUDIO_SIZE) {
    return "Ce fichier audio dépasse 250 Mo.";
  }

  return "";
}

function isValidPrice(value) {
  if (value === "" || value === null || value === undefined) return false;
  const number = normalizePrice(value);
  return Number.isFinite(number) && number >= 0;
}

function isPaidPrice(value) {
  const number = normalizePrice(value);
  return Number.isFinite(number) && number >= TRACK_MIN_PRICE && number <= TRACK_MAX_PRICE;
}

function isValidGlobalPrice(value) {
  const number = normalizePrice(value);
  return Number.isFinite(number) && number >= PACK_MIN_PRICE && number <= PACK_MAX_PRICE;
}

function normalizePrice(value) {
  return Number(String(value).replace(",", "."));
}

function normalizePriceInput(value) {
  return String(value).replace(",", ".");
}

function formatPriceForSubmission(value) {
  return `${normalizePrice(value).toFixed(2)}€`;
}

function calculateTracksTotal() {
  return packData.tracks.reduce((total, track) => {
    if (track.isFree) return total;
    const value = normalizePrice(track.price);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function calculateResourcesTotal() {
  return packData.resources.reduce((total, resource) => {
    if (resource.isFree) return total;
    const value = normalizePrice(resource.price);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function syncGlobalPriceFromResources() {
  const total = calculateResourcesTotal();
  if (total === 0) {
    packData.globalIsFree = true;
    packData.globalPriceCustomized = false;
    packData.globalPrice = "0.00";
    return;
  }
  packData.globalIsFree = false;
  if (!packData.globalPriceCustomized) packData.globalPrice = total.toFixed(2);
}

function syncGlobalPriceFromTracks() {
  const total = calculateTracksTotal();

  if (total === 0) {
    packData.globalIsFree = true;
    packData.globalPriceCustomized = false;
    packData.globalPrice = "0.00";
    return;
  }

  packData.globalIsFree = false;

  if (!packData.globalPriceCustomized) {
    packData.globalPrice = total.toFixed(2);
  }
}

function bindAudioPreview(card) {
  const preview = card.querySelector("[data-audio-preview]");
  if (!preview) return;

  const audio = preview.querySelector(".sonara-preview-audio");
  const playButton = preview.querySelector(".sonara-preview-play");
  const progressButton = preview.querySelector(".sonara-preview-progress");
  const progressFill = preview.querySelector(".sonara-preview-progress-fill");
  const currentLabel = preview.querySelector(".sonara-preview-current");
  const durationLabel = preview.querySelector(".sonara-preview-duration");

  const updateProgress = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const ratio = duration > 0 ? audio.currentTime / duration : 0;
    progressFill.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
    currentLabel.textContent = formatDuration(Math.floor(audio.currentTime || 0));
    if (duration > 0) durationLabel.textContent = formatDuration(Math.floor(duration));
  };

  playButton.addEventListener("click", async () => {
    if (audio.paused) {
      document.querySelectorAll(".sonara-preview-audio").forEach((otherAudio) => {
        if (otherAudio !== audio) otherAudio.pause();
      });
      try {
        await audio.play();
      } catch (error) {
        console.error("Lecture audio impossible :", error);
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => {
    playButton.classList.remove("is-play");
    playButton.classList.add("is-pause");
    playButton.setAttribute("aria-label", "Mettre en pause");
  });

  audio.addEventListener("pause", () => {
    playButton.classList.remove("is-pause");
    playButton.classList.add("is-play");
    playButton.setAttribute("aria-label", "Lire la track");
  });

  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    updateProgress();
  });

  progressButton.addEventListener("click", (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = progressButton.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    audio.currentTime = Math.min(Math.max(ratio, 0), 1) * audio.duration;
  });
}

function showFieldError(key, message) {
  const element = document.querySelector(`[data-error="${key}"]`);
  if (!element) return;
  element.textContent = message;
  element.closest(".field, .upload-section, .step-panel")?.classList.add("has-error");
}

function clearFieldError(key) {
  const element = document.querySelector(`[data-error="${key}"]`);
  if (!element) return;
  element.textContent = "";
  element.closest(".field, .upload-section, .step-panel")?.classList.remove("has-error");
}

function showTrackError(card, key, message) {
  const element = card?.querySelector(`[data-track-error="${key}"]`);
  if (!element) return;
  element.textContent = message;
  element.closest(".field, .upload-section")?.classList.add("has-error");
}

function clearTrackError(card, key) {
  const element = card?.querySelector(`[data-track-error="${key}"]`);
  if (!element) return;
  element.textContent = "";
  element.closest(".field, .upload-section")?.classList.remove("has-error");
}

function scrollToFirstError() {
  document.querySelector(".field-error:not(:empty)")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

async function persistCurrentScreen() {
  if (currentStep === 0) {
    packData.identity.title = document.querySelector(".pack-title")?.value ?? packData.identity.title;
    packData.identity.categorie = document.querySelector(".pack-category")?.value ?? packData.identity.categorie;
  }

  if (currentStep === 2 && isAudioContent()) {
    syncGlobalPriceFromTracks();
  }

  if (currentStep === 3) {
    const licenseForm = document.querySelector(".create-license-editor");
    if (licenseForm) {
      packData.license = readCreatePackLicenseForm(licenseForm);
      syncHumanCreationForm(licenseForm);
      packData.rightsDeclarationAccepted = Boolean(licenseForm.elements.rightsDeclarationAccepted?.checked);
    }
  }
}

async function saveDraftNow() {
  clearTimeout(saveTimer);
  packData.updatedAt = new Date().toISOString();

  try {
    await writeDraft(draftKey, structuredClone(packData));
    updateDraftState("Brouillon sauvegardé", "saved");
    return true;
  } catch (error) {
    console.error("Sauvegarde du brouillon impossible :", error);
    updateDraftState("Sauvegarde impossible", "error");
    return false;
  }
}

function stopPendingDraftSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

async function deleteDraftSafely(key) {
  try {
    await deleteDraft(key);
    return true;
  } catch (error) {
    console.error("Suppression du brouillon impossible :", error);
    return false;
  }
}

async function finalizePublishedPack(storedPack = {}) {
  isSubmitting = true;
  stopPendingDraftSave();

  // Un pack confirmé "pending" ne doit plus rester dans Create Pack.
  // On attend réellement la suppression IndexedDB avant la redirection.
  let draftDeleted = await deleteDraftSafely(draftKey);

  if (!draftDeleted) {
    draftDeleted = await deleteDraftSafely(draftKey);
  }

  // Sécurité de reprise : même si IndexedDB refuse exceptionnellement la suppression,
  // le prochain accès à Create Pack supprimera ce brouillon avant tout affichage.
  sessionStorage.setItem(FORCE_NEW_PACK_KEY, "true");
  localStorage.setItem("creatorToast", createPackTranslate("Pack envoyé à la modération"));

  const dashboardUrl = new URL(
    "/app/pages/creator/dashboard.html",
    window.location.origin
  );
  dashboardUrl.searchParams.set(
    "packSent",
    String(storedPack.id || "confirmed")
  );

  const overlay = document.createElement("div");
  overlay.className = "pack-sent-overlay";
  overlay.innerHTML = `
    <div class="pack-sent-dialog" role="status" aria-live="assertive">
      <strong>${escapeHtml(createPackTranslate("Pack envoyé à la modération"))}</strong>
      <span>${escapeHtml(createPackTranslate("Retour au dashboard…"))}</span>
      <button type="button" class="submit-btn pack-sent-dashboard">
        ${escapeHtml(createPackTranslate("Ouvrir le dashboard Creator"))}
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  const navigateToDashboard = () => {
    window.location.replace(dashboardUrl.href);
  };

  overlay
    .querySelector(".pack-sent-dashboard")
    .addEventListener("click", navigateToDashboard);

  window.setTimeout(navigateToDashboard, 600);
}

async function leaveCreatePackAndSaveDraft() {
  stopPendingDraftSave();
  await persistCurrentScreen();

  const saved = await saveDraftNow();

  if (!saved) {
    updateDraftState("Retour impossible : brouillon non sauvegardé", "error");
    return;
  }

  const dashboardUrl = new URL("/app/pages/creator/dashboard.html", window.location.href).href;
  window.location.replace(dashboardUrl);
}

function updateDraftState(text, state) {
  const status = document.querySelector(".draft-state");
  const label = document.querySelector(".draft-state-text");

  if (!status || !label) return;

  status.dataset.state = state;
  label.textContent = text;
}

function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_DATABASE, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeDraft(key, value) {
  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readDraft(key) {
  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, "readonly");
    const request = transaction.objectStore(DRAFT_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteDraft(key) {
  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function createObjectUrl(file) {
  const url = URL.createObjectURL(file);
  objectUrls.add(url);
  return url;
}

function releaseObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);

    audio.preload = "metadata";
    audio.src = url;

    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration)
        ? Math.round(audio.duration)
        : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

function formatFileSize(size) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} Ko`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function categoryLabel(value) {
  return distributionCategories.find(([key]) => key === value)?.[1] || value;
}

function getDistributionCategories(selectedCategory) {
  /*
    Une seule catégorie éditoriale est choisie par l'artiste.
    Les regroupements supplémentaires sont calculés dynamiquement
    par le moteur de Home : aucun mapping fixe n'est écrit ici.
  */
  return [selectedCategory].filter(Boolean);
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}
