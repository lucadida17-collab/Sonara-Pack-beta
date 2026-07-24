
const CreatePack = document.querySelector(".create-pack");

if (!CreatePack) {
  throw new Error("Conteneur .create-pack introuvable.");
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

const moods = [
  ["dark", "Dark"],
  ["emotional", "Émotionnel"],
  ["epic", "Épique"],
  ["calm", "Calme"],
  ["cinematic", "Cinématique"],
  ["melancholic", "Mélancolique"],
  ["classical", "Classique"]
];

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
  rights: {
    accepted: false,
    acceptedAt: null
  },
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
    <button type="button" class="step" data-step="3">Droits</button>
  </section>

  <section class="draft-state" aria-live="polite">
    <span class="draft-state-dot"></span>
    <span class="draft-state-text">Chargement du brouillon…</span>
  </section>

  <section class="mission-card" id="missionCard"></section>
`;

const missionCard = document.querySelector("#missionCard");
const steps = [...document.querySelectorAll(".step")];

document.querySelector(".back-btn").addEventListener("click", () => {
  leaveCreatePackAndClearDraft();
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
  const stripeVerified = await verifyStripeBeforeCreatePack();

  if (!stripeVerified) {
    window.location.replace("../page-management/bank.html");
    return;
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

function createEmptyTrack() {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `track_${Date.now()}_${Math.random()}`,
    title: "",
    price: "",
    isFree: false,
    coverFile: null,
    audioFile: null,
    duration: 0
  };
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
          coverFile: track.coverFile || null,
          audioFile: track.audioFile || null,
          duration: Number(track.duration) || 0
        }))
      : [createEmptyTrack()];

  packData.globalPrice = saved.globalPrice || "";
  packData.globalIsFree = Boolean(saved.globalIsFree);
  packData.globalPriceCustomized = Boolean(saved.globalPriceCustomized);
  packData.rights = {
    accepted: Boolean(saved.rights?.accepted),
    acceptedAt: saved.rights?.acceptedAt || null
  };
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

  const screens = [
    renderIdentity,
    renderTracks,
    renderPrice,
    renderLegal
  ];

  screens[currentStep]();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderIdentity() {
  missionCard.innerHTML = `
    <section class="step-panel">
      <header class="step-header">
        <p class="step-number">ÉTAPE 1 SUR 4</p>
        <h2>Identité du pack</h2>
        <p>Le titre, l’ambiance et la cover doivent expliquer immédiatement ce que contient le pack.</p>
      </header>

      <div class="form-grid">
        <label class="field">
          <span>Titre du pack</span>
          <input
            class="pack-title"
            maxlength="70"
            placeholder="Ex : Nuit cinématique"
            value="${escapeHtml(packData.identity.title)}"
          >
          <small class="field-hint">Un nom court et reconnaissable.</small>
          <small class="field-error" data-error="identity-title"></small>
        </label>

        <label class="field">
          <span>Ambiance principale</span>
          <select class="pack-mood">
            <option value="">Choisir une ambiance</option>
            ${moods.map(([value, label]) => `
              <option value="${value}" ${packData.identity.categorie === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
          <small class="field-hint">Sonara ajoutera ensuite les catégories de distribution cohérentes.</small>
          <small class="field-error" data-error="identity-mood"></small>
        </label>
      </div>

      <div class="upload-section">
        <div class="upload-heading">
          <div>
            <h3>Cover du pack</h3>
            <p>Image carrée visible dans le catalogue et sur la page du pack.</p>
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
  const moodInput = document.querySelector(".pack-mood");
  const coverInput = document.querySelector("#pack-cover-input");

  titleInput.addEventListener("input", () => {
    packData.identity.title = titleInput.value;
    clearFieldError("identity-title");
    scheduleDraftSave();
  });

  moodInput.addEventListener("change", () => {
    packData.identity.categorie = moodInput.value;
    clearFieldError("identity-mood");
    scheduleDraftSave();
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
    clearFieldError("identity-cover");
    await saveDraftNow();
    renderIdentity();
  });

  document.querySelector(".next-btn").addEventListener("click", async () => {
    if (!validateIdentity()) return;

    await saveDraftNow();
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
        <p>Chaque carte représente une track complète : titre, prix, cover et fichier audio.</p>
      </header>

      <section class="tracks-list">
        ${packData.tracks.map((track, index) => renderTrackCard(track, index)).join("")}
      </section>

      <div class="track-footer">
        <button
          type="button"
          class="add-track-btn"
          ${packData.tracks.length >= MAX_TRACKS ? "disabled" : ""}
        >
          <span>+</span>
          Ajouter une nouvelle track
        </button>

        <small>${packData.tracks.length} / ${MAX_TRACKS} tracks</small>
      </div>

      <div class="actions">
        <button type="button" class="prev-btn">Retour</button>
        <button type="button" class="next-btn">Continuer</button>
      </div>
    </section>
  `;

  bindTrackCards();

  document.querySelector(".add-track-btn").addEventListener("click", async () => {
    const lastIndex = packData.tracks.length - 1;

    if (!validateTrack(lastIndex, true)) return;
    if (packData.tracks.length >= MAX_TRACKS) return;

    packData.tracks.push(createEmptyTrack());
    syncGlobalPriceFromTracks();
    await saveDraftNow();
    renderTracks();
  });

  document.querySelector(".prev-btn").addEventListener("click", async () => {
    await saveDraftNow();
    currentStep = 0;
    render();
  });

  document.querySelector(".next-btn").addEventListener("click", async () => {
    const allValid = packData.tracks.every((_, index) => validateTrack(index, true));

    if (!allValid || packData.tracks.length < 1) {
      scrollToFirstError();
      return;
    }

    await saveDraftNow();
    currentStep = 2;
    render();
  });
}

function renderTrackCard(track, index) {
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
            placeholder="Ex : Dernier souffle"
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
          <div class="upload-heading">
            <div>
              <h3>Cover de la track</h3>
              <p>Image représentative de ce son.</p>
            </div>
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
              <p>Le fichier original qui sera vendu.</p>
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
      scheduleDraftSave();
    });

    card.querySelectorAll("[data-price-mode]").forEach((button) => {
      button.addEventListener("click", async () => {
        track.isFree = button.dataset.priceMode === "free";
        track.price = track.isFree ? "0.00" : "";
        syncGlobalPriceFromTracks();
        await saveDraftNow();
        renderTracks();
      });
    });

    priceInput?.addEventListener("input", () => {
      track.price = normalizePriceInput(priceInput.value);
      syncGlobalPriceFromTracks();
      clearTrackError(card, "price");
      scheduleDraftSave();
    });

    priceInput?.addEventListener("blur", () => {
      const normalized = normalizePriceInput(priceInput.value).trim();
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

      track.coverFile = file;
      clearTrackError(card, "cover");
      await saveDraftNow();
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
      await saveDraftNow();
      renderTracks();
    });

    card.querySelector(".remove-track-btn")?.addEventListener("click", async () => {
      packData.tracks.splice(index, 1);
      syncGlobalPriceFromTracks();
      await saveDraftNow();
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
        <p>Le total des tracks sert de base. Tu peux ensuite ajuster le prix final du pack.</p>
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
    await saveDraftNow();
    currentStep = 1;
    render();
  });

  document.querySelector(".next-btn").addEventListener("click", async () => {
    if (!validateGlobalPrice()) return;
    await saveDraftNow();
    currentStep = 3;
    render();
  });
}

function renderLegal() {
  missionCard.innerHTML = `
    <section class="step-panel">
      <header class="step-header">
        <p class="step-number">ÉTAPE 4 SUR 4</p>
        <h2>Validation finale</h2>
        <p>Vérifie que le pack est complet avant son envoi à la modération.</p>
      </header>

      <section class="final-summary">
        ${renderSummaryRow("Titre", packData.identity.title)}
        ${renderSummaryRow("Ambiance", moodLabel(packData.identity.categorie))}
        ${renderSummaryRow("Cover du pack", packData.identity.coverFile?.name)}
        ${renderSummaryRow("Tracks complètes", String(packData.tracks.length))}
        ${renderSummaryRow("Prix global", packData.globalIsFree ? "Gratuit" : `${normalizePrice(packData.globalPrice).toFixed(2)} €`)}
      </section>

      <label class="legal-check-row">
        <input class="legal-check" type="checkbox" ${packData.rights.accepted ? "checked" : ""}>
        <span>
          <strong>Je confirme posséder les droits nécessaires.</strong>
          <small>
            Je comprends que tout contenu volé, trompeur ou non autorisé peut être refusé et entraîner une sanction.
          </small>
        </span>
      </label>

      <small class="field-error" data-error="rights"></small>
      <section class="submit-error" hidden></section>

      <div class="actions">
        <button type="button" class="prev-btn">Retour</button>
        <button type="button" class="submit-btn">Envoyer en validation</button>
      </div>
    </section>
  `;

  const checkbox = document.querySelector(".legal-check");

  checkbox.addEventListener("change", () => {
    packData.rights.accepted = checkbox.checked;
    packData.rights.acceptedAt = checkbox.checked ? new Date().toISOString() : null;
    clearFieldError("rights");
    scheduleDraftSave();
  });

  document.querySelector(".prev-btn").addEventListener("click", async () => {
    await saveDraftNow();
    currentStep = 2;
    render();
  });

  document.querySelector(".submit-btn").addEventListener("click", submitPack);
}

function renderSummaryRow(label, value) {
  return `
    <div>
      <span>${label}</span>
      <strong>${escapeHtml(value || "Manquant")}</strong>
    </div>
  `;
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
  submitButton.textContent = "Envoi en cours…";
  submitError.hidden = true;

  try {
    const finalPack = buildFinalPack();
    const formData = new FormData();

    formData.append("packData", JSON.stringify(finalPack));
    formData.append("coverPack", packData.identity.coverFile);

    packData.tracks.forEach((track, index) => {
      formData.append(`trackCover_${index}`, track.coverFile);
      formData.append(`trackAudio_${index}`, track.audioFile);
    });

    const response = await fetch(`${API_URL}/api/packs/pending`, {
      method: "POST",
      body: formData
    });

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

    showPackSentSuccess();
    return;
  } catch (error) {
    submitError.hidden = false;
    submitError.textContent = error.message;
    submitButton.disabled = false;
    submitButton.textContent = "Envoyer en validation";
    isSubmitting = false;
  }
}

function buildFinalPack() {
  const packId = `pack_${Date.now()}`;

  return {
    id: packId,
    title: packData.identity.title.trim(),
    artist: artistProfile.pseudo || "",
    artistId: artistProfile.id || artistProfile.accountId || "",
    imageProfile: artistProfile.imageProfile || null,
    coverPack: packData.identity.coverFile.name,
    packLink: `app/pages/pack.html?id=${packId}`,
    isFree: packData.globalIsFree,
    price: packData.globalIsFree ? "Gratuit" : `${normalizePrice(packData.globalPrice).toFixed(2)}€`,
    categorie: getDistributionCategories(packData.identity.categorie),
    downloadPage: `app/pages/download.html?id=${packId}`,
    tracks: packData.tracks.map((track, index) => ({
      id: `${packId}-${index + 1}`,
      trackLink: `app/pages/pack.html?id=${packId}&trackId=${packId}-${index + 1}`,
      downloadPage: `app/pages/download.html?id=${packId}&trackId=${packId}-${index + 1}`,
      title: track.title.trim(),
      artist: artistProfile.pseudo || "",
      coverPack: track.coverFile.name,
      audioName: track.audioFile.name,
      isFree: track.isFree,
      price: track.isFree ? "Gratuit" : `${normalizePrice(track.price).toFixed(2)}€`,
      previewDuration: 30,
      duration: track.duration || 0
    })),
    rights: {
      accepted: true,
      acceptedAt: packData.rights.acceptedAt
    },
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
    showFieldError("identity-mood", "Choisis une ambiance principale.");
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

  if (!packData.rights.accepted) {
    return {
      valid: false,
      step: 3,
      show: () => showFieldError("rights", "Tu dois confirmer les droits avant l’envoi.")
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

function scheduleDraftSave() {
  updateDraftState("Sauvegarde…", "saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraftNow, 350);
}

async function persistCurrentScreen() {
  if (currentStep === 0) {
    packData.identity.title = document.querySelector(".pack-title")?.value ?? packData.identity.title;
    packData.identity.categorie = document.querySelector(".pack-mood")?.value ?? packData.identity.categorie;
  }

  if (currentStep === 2) {
    syncGlobalPriceFromTracks();
  }

  if (currentStep === 3) {
    const checkbox = document.querySelector(".legal-check");
    if (checkbox) {
      packData.rights.accepted = checkbox.checked;
      packData.rights.acceptedAt = checkbox.checked
        ? packData.rights.acceptedAt || new Date().toISOString()
        : null;
    }
  }
}

async function saveDraftNow() {
  clearTimeout(saveTimer);
  packData.updatedAt = new Date().toISOString();

  try {
    await writeDraft(draftKey, structuredClone(packData));
    updateDraftState("Brouillon sauvegardé", "saved");
  } catch (error) {
    console.error("Sauvegarde du brouillon impossible :", error);
    updateDraftState("Sauvegarde impossible", "error");
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

function showPackSentSuccess() {
  isSubmitting = true;
  stopPendingDraftSave();
  sessionStorage.setItem(FORCE_NEW_PACK_KEY, "true");
  localStorage.setItem("creatorToast", "Pack envoyé en validation");
  void deleteDraftSafely(draftKey);

  const overlay = document.createElement("div");
  overlay.className = "pack-sent-overlay";
  overlay.innerHTML = `
    <div class="pack-sent-dialog" role="status" aria-live="assertive">
      <strong>Pack envoyé en validation</strong>
      <span>Retour au dashboard…</span>
    </div>
  `;

  document.body.appendChild(overlay);

  const dashboardUrl = `${window.location.origin}/app/pages/creator.html`;

  window.setTimeout(() => {
    window.location.replace(dashboardUrl);
  }, 700);

  window.setTimeout(() => {
    if (window.location.pathname.includes("create-pack.html")) {
      window.location.href = dashboardUrl;
    }
  }, 1600);
}

function leaveCreatePackAndClearDraft() {
  stopPendingDraftSave();

  // Sécurité : si IndexedDB est interrompu pendant la navigation,
  // le prochain accès à Create Pack repartira quand même de zéro.
  sessionStorage.setItem(FORCE_NEW_PACK_KEY, "true");

  // Nettoyage en arrière-plan, sans bloquer la redirection.
  void deleteDraftSafely(draftKey);

  const dashboardUrl = new URL("../creator.html", window.location.href).href;
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

function moodLabel(value) {
  return moods.find(([key]) => key === value)?.[1] || value;
}

function getDistributionCategories(mainMood) {
  const map = {
    dark: ["dark", "cinematic", "melancholic"],
    emotional: ["emotional", "melancholic", "calm"],
    epic: ["epic", "cinematic", "dark"],
    calm: ["calm", "emotional", "classical"],
    cinematic: ["cinematic", "epic", "dark"],
    melancholic: ["melancholic", "emotional", "calm"],
    classical: ["classical", "calm", "cinematic"]
  };

  return map[mainMood] || [mainMood].filter(Boolean);
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}
