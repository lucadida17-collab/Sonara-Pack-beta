"use strict";

function downloadTranslate(value) {
  return window.SonaraI18n?.t?.(value) || value;
}
function getFilePath(file) {
  if (!file) return "";

  const value = String(file).trim();

  if (/^(https?:|blob:|data:)/i.test(value)) return value;

  if (value.startsWith("/downloads/")) return `${API_URL}${value}`;
  if (value.startsWith("downloads/")) return `${API_URL}/${value}`;

  if (value.startsWith("/uploads/")) return `${API_URL}${value}`;
  if (value.startsWith("uploads/")) return `${API_URL}/${value}`;

  return `${API_URL}/uploads/${value.replace(/^\/+/, "")}`;
}

const downloadPage = document.querySelector(".download-page");

const params = new URLSearchParams(window.location.search);
const packId = params.get("id");
const trackId = params.get("trackId");
const resourceId = params.get("resourceId");
const acceptanceId = params.get("acceptanceId");

let currentUser = JSON.parse(
  localStorage.getItem("sonaraProfile")
);

if (!currentUser) {
  console.log("Aucun Utilisateur connecter")
}


let selectedDownload = null;
let selectedPack = null;

const isMobile =
  window.innerWidth <= 768 ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function renderLayout() {
  if (isMobile) {
    downloadPage.innerHTML = `
      <section class="download-mobile">
        <div class="download-mobile-card">
          <p class="download-kicker">SONARA PACK</p>

          <h1 class="download-mobile-title">${escapeDownloadHtml(downloadTranslate("Téléchargement prêt"))}</h1>

          <p class="download-mobile-text">
            ${escapeDownloadHtml(downloadTranslate("Votre fichier est prêt. Sur mobile, appuyez sur le bouton ci-dessous pour lancer le téléchargement."))}
          </p>

          <button class="download-button">${escapeDownloadHtml(downloadTranslate("Télécharger le fichier"))}</button>
          <button class="download-home-button">${escapeDownloadHtml(downloadTranslate("Retour à l’accueil"))}</button>
        </div>
      </section>
    `;
  } else {
    downloadPage.innerHTML = `
      <section class="download-desktop">
        <div class="download-desktop-card">
          <p class="download-kicker">SONARA PACK</p>

          <h1 class="download-title">${escapeDownloadHtml(downloadTranslate("Préparation du téléchargement"))}</h1>

          <div class="download-loader"></div>

          <p class="download-text">
            ${escapeDownloadHtml(downloadTranslate("Votre fichier est en cours de préparation..."))}
          </p>
        </div>
      </section>
    `;
  }
}

function renderError(message) {
  downloadPage.innerHTML = `
    <section class="download-desktop">
      <div class="download-desktop-card">
        <p class="download-kicker">SONARA PACK</p>
        <h1 class="download-title">${escapeDownloadHtml(downloadTranslate("Téléchargement impossible"))}</h1>
        <p class="download-text">${escapeDownloadHtml(downloadTranslate(message))}</p>
        <button class="download-home-button">${escapeDownloadHtml(downloadTranslate("Retour à l’accueil"))}</button>
      </div>
    </section>
  `;

  const homeButton = document.querySelector(".download-home-button");
  if (homeButton) {
    homeButton.addEventListener("click", () => {
      window.location.href = "/home.html";
    });
  }
}

async function prepareProtectedDownload() {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error("Reconnecte-toi pour accéder à ce téléchargement.");
  }

  const response = await fetch(`${API_URL}/api/downloads/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      userId,
      packId,
      trackId: trackId || null,
      resourceId: resourceId || null,
      acceptanceId: acceptanceId || null
    })
  });
  const data = await readJsonResponse(response);
  if (!data.fileUrl) {
    throw new Error("Aucun fichier ZIP disponible pour ce téléchargement.");
  }
  return /^(https?:|blob:|data:)/i.test(data.fileUrl)
    ? data.fileUrl
    : `${API_URL}${String(data.fileUrl).startsWith("/") ? "" : "/"}${data.fileUrl}`;
}

async function downloadFile() {
  try {
    const finalUrl = await prepareProtectedDownload();
    const link = document.createElement("a");
    link.href = finalUrl;
    link.download = resourceId
      ? String(selectedDownload?.originalName || selectedDownload?.title || "sonara-resource")
      : `${selectedDownload?.title || "sonara-pack"}.zip`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (error) {
    console.error("Téléchargement protégé refusé :", error);
    renderError(error.message || "Accès au téléchargement refusé.");
    return false;
  }
}

function escapeDownloadHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPlatformContext() {
  const userAgent = navigator.userAgent || "";
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isMac = /Macintosh|Mac OS X/i.test(userAgent) && !isAppleMobile;
  const isWindows = /Windows/i.test(userAgent);

  if (isAppleMobile) return { key: "ios", label: "iPhone / iPad", downloads: downloadTranslate("l’app Fichiers") };
  if (isAndroid) return { key: "android", label: "Android", downloads: downloadTranslate("le dossier Téléchargements") };
  if (isMac) return { key: "mac", label: "Mac", downloads: downloadTranslate("le dossier Téléchargements du Finder") };
  if (isWindows) return { key: "windows", label: "Windows", downloads: downloadTranslate("le dossier Téléchargements") };
  return {
    key: "desktop",
    label: downloadTranslate(isMobile ? "Mobile" : "Ordinateur"),
    downloads: downloadTranslate("vos téléchargements")
  };
}

function getDownloadKind() {
  if (resourceId) return "resource";
  if (["midi", "daw"].includes(String(selectedPack?.contentType || "").toLowerCase())) return "pack";
  if (trackId) return "track";
  return Array.isArray(selectedPack?.tracks) && selectedPack.tracks.length > 1
    ? "pack"
    : "track";
}

function getProjectChoices() {
  const contentType = String(selectedPack?.contentType || "audio").toLowerCase();
  if (contentType === "midi") {
    return [{ key: "music", icon: "piano", title: downloadTranslate("Musique / DAW"), description: downloadTranslate("Importer le MIDI dans une session de production.") }];
  }
  if (contentType === "daw") {
    return [{ key: "music", icon: "panels-top-left", title: downloadTranslate("Projet DAW"), description: downloadTranslate("Ouvrir le projet dans le DAW compatible.") }];
  }
  return [
    {
      key: "video",
      icon: "clapperboard",
      title: downloadTranslate("Vidéo / Film"),
      description: downloadTranslate("Synchroniser le son avec des images.")
    },
    {
      key: "music",
      icon: "audio-lines",
      title: downloadTranslate("Musique / DAW"),
      description: downloadTranslate("Importer le son dans une session audio.")
    },
    {
      key: "game",
      icon: "gamepad-2",
      title: downloadTranslate("Jeu / Expérience"),
      description: downloadTranslate("Ajouter le fichier comme ressource audio.")
    },
    {
      key: "other",
      icon: "folder-open",
      title: downloadTranslate("Autre projet"),
      description: downloadTranslate("Voir une méthode d’import universelle.")
    }
  ];
}

function buildIntegrationGuide(kind) {
  const platform = getPlatformContext();
  const contentType = String(selectedPack?.contentType || "audio").toLowerCase();
  const downloadKind = getDownloadKind();
  const firstStep = (
    downloadKind === "pack"
      ? downloadTranslate("Ouvrez {0} puis décompressez le ZIP Sonara Pack.")
      : downloadTranslate("Ouvrez {0} puis repérez le fichier Sonara téléchargé.")
  ).replace("{0}", platform.downloads);

  if (contentType === "midi") {
    return {
      title: downloadTranslate("Utiliser le fichier MIDI"),
      steps: [
        firstStep,
        downloadTranslate("Ouvrez votre DAW puis importez le fichier MIDI sur une piste instrument ou MIDI."),
        downloadTranslate("Choisissez votre instrument virtuel, adaptez le tempo ou les notes selon votre projet."),
        downloadTranslate("Conservez le fichier original Sonara avec votre licence.")
      ]
    };
  }

  if (contentType === "daw") {
    return {
      title: downloadTranslate("Ouvrir le projet DAW"),
      steps: [
        firstStep,
        downloadTranslate("Vérifiez le DAW indiqué sur la page du pack avant d’ouvrir le projet."),
        downloadTranslate("Ouvrez le fichier de projet dans le logiciel compatible puis sauvegardez une copie de travail."),
        downloadTranslate("Conservez les fichiers originaux Sonara avec votre licence.")
      ]
    };
  }

  const guides = {
    video: {
      title: downloadTranslate("Introduire le son dans une vidéo"),
      steps: [
        firstStep,
        downloadTranslate("Ouvrez votre projet vidéo et ajoutez le fichier Sonara comme piste audio."),
        downloadTranslate("Placez le son sous la vidéo, alignez son départ avec l’image puis ajustez son volume."),
        downloadTranslate("Vous pouvez aussi ouvrir Sonara Sync pour faire cette synchronisation directement ici.")
      ]
    },
    music: {
      title: downloadTranslate("Introduire le son dans une session audio"),
      steps: [
        firstStep,
        downloadTranslate("Créez ou sélectionnez une piste audio dans votre projet."),
        downloadTranslate("Importez le fichier Sonara sur cette piste et placez-le à l’endroit voulu dans la timeline."),
        downloadTranslate("Ajustez le niveau, les fondus et le placement sans modifier votre fichier original.")
      ]
    },
    game: {
      title: downloadTranslate("Introduire le son dans un projet interactif"),
      steps: [
        firstStep,
        downloadTranslate("Importez le fichier dans le dossier audio ou assets de votre projet."),
        downloadTranslate("Associez-le ensuite à la scène, l’événement, l’objet ou l’action qui doit le déclencher."),
        downloadTranslate("Gardez le fichier Sonara original intact et travaillez avec une copie dans le projet.")
      ]
    },
    other: {
      title: downloadTranslate("Méthode universelle"),
      steps: [
        firstStep,
        downloadTranslate("Ouvrez votre logiciel ou application puis cherchez Importer, Ajouter un média ou Ajouter un fichier."),
        downloadTranslate("Sélectionnez le fichier audio Sonara depuis vos téléchargements."),
        downloadTranslate("Placez-le dans votre projet puis sauvegardez votre projet avant de modifier le son.")
      ]
    }
  };

  return guides[kind] || guides.video;
}

function renderIntegrationGuide(kind) {
  const guide = buildIntegrationGuide(kind);
  const container = document.querySelector(".download-integration-guide");
  if (!container) return;

  container.innerHTML = `
    <p class="download-guide-kicker">${escapeDownloadHtml(downloadTranslate("GUIDE DYNAMIQUE"))}</p>
    <h2>${escapeDownloadHtml(guide.title)}</h2>
    <ol>
      ${guide.steps.map((step) => `<li>${escapeDownloadHtml(step)}</li>`).join("")}
    </ol>
  `;
}

function renderPostDownloadAssistant() {
  const platform = getPlatformContext();
  const choices = getProjectChoices();
  const itemTitle = selectedDownload?.title || selectedPack?.title || downloadTranslate("Votre fichier Sonara");

  downloadPage.innerHTML = `
    <section class="download-after">
      <div class="download-after-shell">
        <header class="download-after-header">
          <p class="download-kicker">SONARA PACK · ${escapeDownloadHtml(platform.label)}</p>
          <span class="download-after-check" aria-hidden="true">✓</span>
          <h1>${escapeDownloadHtml(downloadTranslate("Téléchargement lancé."))}</h1>
          <p><strong data-user-content>${escapeDownloadHtml(itemTitle)}</strong> ${escapeDownloadHtml(downloadTranslate("est prêt. Dites à Sonara dans quel type de projet vous voulez l’utiliser."))}</p>
        </header>

        <div class="download-project-choices">
          ${choices.map((choice, index) => `
            <button class="download-project-choice ${index === 0 ? "active" : ""}" type="button" data-project-kind="${choice.key}">
              <i data-lucide="${choice.icon}"></i>
              <span><strong>${escapeDownloadHtml(choice.title)}</strong><small>${escapeDownloadHtml(choice.description)}</small></span>
            </button>
          `).join("")}
        </div>

        <section class="download-integration-guide"></section>

        <div class="download-after-actions">
          <button class="download-montage-button" type="button"><i data-lucide="clapperboard"></i>${escapeDownloadHtml(downloadTranslate("Ouvrir Sonara Sync"))}</button>
          <button class="download-library-button" type="button">${escapeDownloadHtml(downloadTranslate("Bibliothèque"))}</button>
          <button class="download-home-button" type="button">${escapeDownloadHtml(downloadTranslate("Accueil"))}</button>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-project-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-project-kind]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderIntegrationGuide(button.dataset.projectKind);
    });
  });

  document.querySelector(".download-montage-button")?.addEventListener("click", () => {
    window.location.assign("/app/pages/catalog/montage.html");
  });

  document.querySelector(".download-library-button")?.addEventListener("click", () => {
    const contentType = String(selectedPack?.contentType || "audio").toLowerCase();
    if (["midi", "daw"].includes(contentType)) {
      window.location.assign(`/app/pages/creator/dashboard.html?mode=shop&shopType=${encodeURIComponent(contentType)}&library=1`);
      return;
    }
    window.location.assign("/app/pages/catalog/library.html");
  });

  document.querySelector(".download-home-button")?.addEventListener("click", () => {
    window.location.assign("/home.html");
  });

  renderIntegrationGuide("video");
  if (window.lucide) window.lucide.createIcons();
}

function finishDesktopDownload() {
  const title = document.querySelector(".download-title");
  const text = document.querySelector(".download-text");

  if (title) title.textContent = downloadTranslate("Téléchargement terminé");
  if (text) {
    text.textContent = downloadTranslate("Le fichier est lancé. Préparation de votre guide d’intégration…");
  }

  setTimeout(renderPostDownloadAssistant, 850);
}

function connectMobileButtons() {
  const downloadButton = document.querySelector(".download-button");
  const homeButton = document.querySelector(".download-home-button");

  if (downloadButton) {
    downloadButton.addEventListener("click", async () => {
      const started = await downloadFile();
      if (!started) return;
      downloadButton.textContent = downloadTranslate("Téléchargement lancé");
      downloadButton.disabled = true;
      setTimeout(renderPostDownloadAssistant, 700);
    });
  }

  if (homeButton) {
    homeButton.addEventListener("click", () => {
      window.location.href = "/home.html";
    });
  }
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Accès au téléchargement refusé.");
  }

  return data;
}

function getCurrentUserId() {
  return currentUser?.accountId || currentUser?.id || "";
}

async function refreshCurrentUser() {
  const userId = getCurrentUserId();

  if (!userId) {
    throw new Error("Reconnecte-toi pour accéder à ce téléchargement.");
  }

  const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  const data = await readJsonResponse(response);
  const profile = data?.account || data;

  currentUser = {
    ...currentUser,
    ...profile
  };

  localStorage.setItem("sonaraProfile", JSON.stringify(currentUser));
  return currentUser;
}

function hasOwnedId(values, expectedId) {
  return (
    Array.isArray(values) &&
    values.some((id) => String(id) === String(expectedId))
  );
}

function hasDownloadAccess(profile) {
  const ownsWholePack = hasOwnedId(profile?.downloadedPacks, packId);

  // L'achat du pack complet donne accès au ZIP du pack et à chacune de ses tracks.
  // Une track achetée séparément reste également retéléchargeable seule.
  if (trackId) {
    return (
      ownsWholePack ||
      hasOwnedId(profile?.downloadedTracks, trackId)
    );
  }
  if (resourceId) {
    return (
      ownsWholePack ||
      hasOwnedId(profile?.downloadedResources, resourceId)
    );
  }

  return ownsWholePack;
}

async function confirmStripePurchase() {
  const sessionId = params.get("session_id");

  if (!sessionId) return;

  const response = await fetch(`${API_URL}/api/stripe/confirm-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId,
      userId: getCurrentUserId()
    })
  });

  await readJsonResponse(response);
}

async function loadDownloadData() {
  try {
    await window.SonaraI18n?.ready;
  } catch {}

  renderLayout();

  try {
    if (!currentUser) {
      throw new Error("Reconnecte-toi pour accéder à ce téléchargement.");
    }

    const response = await fetch(`${API_URL}/api/packs`);
    const packs = await readJsonResponse(response);
    selectedPack = packs.find((pack) => String(pack.id) === String(packId));

    if (!selectedPack) {
      throw new Error("Pack introuvable.");
    }

    await confirmStripePurchase();
    const freshProfile = await refreshCurrentUser();

    if (!hasDownloadAccess(freshProfile)) {
      throw new Error("Achat ou accès gratuit non vérifié pour ce compte.");
    }

    selectedDownload = trackId
      ? selectedPack.tracks?.find((track) => String(track.id) === String(trackId))
      : resourceId
        ? selectedPack.resources?.find((resource) => String(resource.id) === String(resourceId))
        : selectedPack;

    if (!selectedDownload) {
      throw new Error("Fichier introuvable.");
    }

    if (isMobile) {
      connectMobileButtons();
    } else {
      setTimeout(async () => {
        const started = await downloadFile();
        if (started) finishDesktopDownload();
      }, 2000);
    }
  } catch (error) {
    console.error("Erreur download :", error);
    renderError(error.message || "Erreur de connexion au serveur.");
  }
}

loadDownloadData();
