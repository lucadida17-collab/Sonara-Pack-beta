
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
const TRACK_MIN_PRICE = 1;
const TRACK_MAX_PRICE = 100;
const PACK_MIN_PRICE = 1;
const PACK_MAX_PRICE = 100000;
const FORCE_NEW_PACK_KEY = "sonara-create-pack-force-new";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
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
let saveTimer = null;
let isSubmitting = false;
let objectUrls = new Set();

const packData = {
  identity: {
    title: "",
    categorie: "",
    coverFile: null
  },
  tracks: [createEmptyTrack()],
  globalPrice: "",
  globalIsFree: false,
  globalPriceCustomized: false,
  license: createDefaultPackLicense(),
  rightsDeclarationAccepted: false,
  updatedAt: null
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
    <button type="button" class="step" data-step="1">Tracks</button>
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
  // Aucune redirection automatique vers bank.html ne doit se produire ici :
  // un compte déjà vérifié doit conserver définitivement son accès.
  const params = new URLSearchParams(window.location.search);
  const forceNewPack = sessionStorage.getItem(FORCE_NEW_PACK_KEY) === "true";

  if (forceNewPack) {
    sessionStorage.removeItem(FORCE_NEW_PACK_KEY);
    await deleteDraftSafely(draftKey);
  } else if (params.get("new") === "true") {
    await deleteDraftSafely(draftKey);
  } else {
    const saved = await readDraft(draftKey);
    if (saved) hydratePackData(saved);
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

function syncInheritedTrackCovers() {
  packData.tracks.forEach((track) => {
    if (track.coverMode === "custom") return;
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
    coverFile: saved.identity?.coverFile || null
  };

  packData.tracks =
    Array.isArray(saved.tracks) && saved.tracks.length
      ? saved.tracks.map((track) => ({
          id: track.id || createEmptyTrack().id,
          title: track.title || "",
          price: track.price || "",
          isFree: Boolean(track.isFree),
          coverMode: track.coverMode === "pack"
            ? "pack"
            : track.coverMode === "custom"
              ? "custom"
              : track.coverFile
                ? "custom"
                : "pack",
          coverFile: track.coverFile || null,
          audioFile: track.audioFile || null,
          duration: Number(track.duration) || 0
        }))
      : [createEmptyTrack()];

  syncInheritedTrackCovers();

  packData.globalPrice = saved.globalPrice || "";
  packData.globalIsFree = Boolean(saved.globalIsFree);
  packData.globalPriceCustomized = Boolean(saved.globalPriceCustomized);
  packData.license = cloneCreatePackLicense(saved.license);
  packData.rightsDeclarationAccepted = Boolean(saved.rightsDeclarationAccepted);
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
    renderTracks,
    renderPrice,
    renderLicense
  ];

  screens[currentStep]();
  requestAnimationFrame(() => window.SonaraI18n?.refresh?.());
  window.scrollTo({ top: 0, behavior: "smooth" });
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

function renderTracks() {
  missionCard.innerHTML = `
    <section class="step-panel">
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
  const usesPackCover = track.coverMode !== "custom";

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

function renderPrice() {
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
        </form>

        <aside class="create-license-preview-panel">
          <p class="step-number">APERÇU ACHETEUR</p>
          <h3>Licence affichée avant l’achat</h3>
          <div class="create-license-preview"></div>
        </aside>
      </div>

      <section class="final-summary create-license-final-summary">
        ${renderSummaryRow("Titre", packData.identity.title)}
        ${renderSummaryRow("Tracks", String(packData.tracks.length))}
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
    packData.rightsDeclarationAccepted = Boolean(form.elements.rightsDeclarationAccepted?.checked);
    submitPack();
  });
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

  const trackCount = Array.isArray(finalPack?.tracks) ? finalPack.tracks.length : packData.tracks.length;
  const formatLabel = trackCount > 1 ? "Album" : "Single";
  const overlay = document.createElement("div");
  overlay.className = "pack-submission-overlay";
  overlay.innerHTML = `
    <section class="pack-submission-dialog" role="status" aria-live="polite" aria-busy="true">
      <div class="pack-submission-orbit" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>

      <p class="pack-submission-eyebrow">SONARA CREATOR</p>
      <h2>${escapeHtml(createPackTranslate("Envoi de ton pack"))}</h2>
      <p class="pack-submission-status" data-submit-status>${escapeHtml(createPackTranslate("Envoi et traitement en cours…"))}</p>

      <div class="pack-submission-pulse" aria-hidden="true"><span></span></div>

      <div class="pack-submission-meta">
        <div><span>${escapeHtml(createPackTranslate("Format"))}</span><strong>${escapeHtml(createPackTranslate(formatLabel))}</strong></div>
        <div><span>${escapeHtml(createPackTranslate("Tracks"))}</span><strong>${trackCount}</strong></div>
        <div><span>${escapeHtml(createPackTranslate("Temps écoulé"))}</span><strong data-submit-elapsed>00:00</strong></div>
      </div>

      <aside class="pack-submission-tip">
        <div>
          <span class="pack-submission-tip-label">${escapeHtml(createPackTranslate("CONSEIL ARTISTE"))}</span>
          <strong data-submit-tip>${escapeHtml(createPackTranslate(PACK_SUBMISSION_TIPS[0]))}</strong>
        </div>
        <button type="button" class="pack-submission-next-tip" aria-label="${escapeHtml(createPackTranslate("Afficher le conseil suivant"))}">${escapeHtml(createPackTranslate("Conseil suivant"))}</button>
      </aside>

      <small class="pack-submission-note">${escapeHtml(createPackTranslate("Tu peux rester sur cette page pendant que Sonara finalise l’envoi. Ne ferme pas l’onglet."))}</small>
    </section>
  `;

  document.body.appendChild(overlay);
  const startedAt = Date.now();
  const elapsed = overlay.querySelector("[data-submit-elapsed]");
  const tip = overlay.querySelector("[data-submit-tip]");
  const nextTipButton = overlay.querySelector(".pack-submission-next-tip");
  let tipIndex = 0;

  const showNextTip = () => {
    tipIndex = (tipIndex + 1) % PACK_SUBMISSION_TIPS.length;
    tip.classList.remove("is-changing");
    void tip.offsetWidth;
    tip.classList.add("is-changing");
    tip.textContent = createPackTranslate(PACK_SUBMISSION_TIPS[tipIndex]);
  };

  nextTipButton.addEventListener("click", showNextTip);

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
    close() {
      window.clearInterval(timer);
      window.clearInterval(tipTimer);
      overlay.classList.remove("is-visible");
      window.setTimeout(() => overlay.remove(), 220);
    }
  };
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

    packData.tracks.forEach((track, index) => {
      formData.append(`trackCover_${index}`, track.coverFile);
      formData.append(`trackAudio_${index}`, track.audioFile);
    });

    submissionLoader?.setStatus("Tes fichiers sont envoyés à Sonara…");

    const response = await fetch(`${API_URL}/api/packs/pending`, {
      method: "POST",
      body: formData
    });

    submissionLoader?.setStatus("Fichiers reçus · vérification du pack…");
    const responseText = await response.text();
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
    submissionLoader?.close();
    await finalizePublishedPack(storedPack);
    return;
  } catch (error) {
    submissionLoader?.close();
    submitError.hidden = false;
    submitError.textContent = error.message;
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
    coverPack: packData.identity.coverFile.name,
    packLink: `app/pages/catalog/pack.html?id=${packId}`,
    isFree: packData.globalIsFree,
    price: packData.globalIsFree ? "Gratuit" : formatPriceForSubmission(packData.globalPrice),
    categorie: getDistributionCategories(packData.identity.categorie),
    downloadPage: `app/pages/catalog/download.html?id=${packId}`,
    paymentReady: false,
    tracks: packData.tracks.map((track, index) => ({
      id: `${packId}-${index + 1}`,
      trackLink: `app/pages/catalog/pack.html?id=${packId}&trackId=${packId}-${index + 1}`,
      downloadPage: `app/pages/catalog/download.html?id=${packId}&trackId=${packId}-${index + 1}`,
      title: track.title.trim(),
      artist: artistProfile.pseudo || "",
      coverPack: track.coverFile.name,
      audioName: track.audioFile.name,
      isFree: track.isFree,
      price: track.isFree ? "Gratuit" : formatPriceForSubmission(track.price),
      previewDuration: 30,
      duration: track.duration || 0
    })),
    license: {
      ...cloneCreatePackLicense(packData.license),
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedByAccountId: artistProfile.accountId || artistProfile.id || null
    },
    rightsDeclarationAccepted: packData.rightsDeclarationAccepted === true,
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

  if (!track.coverFile) {
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

function validateGlobalPrice() {
  syncGlobalPriceFromTracks();

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
    !packData.identity.coverFile
  ) {
    return {
      valid: false,
      step: 0,
      show: validateIdentity
    };
  }

  const invalidTrackIndex = packData.tracks.findIndex((track) =>
    !track.title.trim() ||
    (!track.isFree && !isPaidPrice(track.price)) ||
    !track.coverFile ||
    !track.audioFile
  );

  if (invalidTrackIndex !== -1 || !packData.tracks.length) {
    return {
      valid: false,
      step: 1,
      show: () => validateTrack(Math.max(invalidTrackIndex, 0), true)
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

  if (currentStep === 2) {
    syncGlobalPriceFromTracks();
  }

  if (currentStep === 3) {
    const licenseForm = document.querySelector(".create-license-editor");
    if (licenseForm) {
      packData.license = readCreatePackLicenseForm(licenseForm);
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
