const appLayout = document.querySelector(".app-layout");

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile")) || {};
  } catch (error) {
    console.error("Impossible de récupérer le profil :", error);
    return {};
  }
}

function profileImageUrl(value = "") {
  if (!value) return "";

  const normalized = String(value).trim();

  if (/^(https?:|blob:|data:)/i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("/uploads/")) {
    return `${API_URL}${normalized}`;
  }

  if (normalized.startsWith("uploads/")) {
    return `${API_URL}/${normalized}`;
  }

  return `${API_URL}/uploads/${normalized.replace(/^\/+/, "")}`;
}

function renderProfile() {
  const profile = getStoredProfile();

  const pseudo =
    profile.pseudo ||
    profile.username ||
    profile.pseudo;

const rawProfileImage = profile.imageProfile || "";
  const profileImage = profileImageUrl(rawProfileImage);

  appLayout.innerHTML = `
    <section class="profile-page">

      <header class="profile-topbar">

        <button
          type="button"
          class="profile-icon-button profile-back-button"
          aria-label="Retour"
        >
          <i data-lucide="arrow-left"></i>
        </button>

        <button
          type="button"
          class="profile-icon-button profile-settings-button"
          aria-label="Paramètres"
        >
          <i data-lucide="settings"></i>
        </button>

      </header>

      <div class="profile-content">

        <div class="profile-avatar">
          ${
            profileImage
              ? `
                <img
                  src="${profileImage}"
                  alt="Photo de profil de ${pseudo}"
                  class="profile-avatar-image"
                >
              `
              : `
                <div class="profile-avatar-fallback">
                  <i data-lucide="user"></i>
                </div>
              `
          }
        </div>

        <h1 class="profile-username">${pseudo}</h1>

        <button
          type="button"
          class="profile-edit-button"
        >
          Éditer le profil
        </button>

      </div>

    </section>
  `;

  lucide.createIcons();

  const backButton = document.querySelector(".profile-back-button");
  const settingsButton = document.querySelector(
    ".profile-settings-button"
  );
  const editButton = document.querySelector(".profile-edit-button");

  backButton.addEventListener("click", () => {
    window.location.href = "/home.html";
  });

  settingsButton.addEventListener("click", () => {
    window.location.href = "settings/index.html";
  });

  editButton.addEventListener("click", () => {
    renderEditProfile();
  });
}

function renderEditProfile() {
  const storedProfile = getStoredProfile();

  const currentPseudo = storedProfile.pseudo || "";
  const rawProfileImage = storedProfile.imageProfile || "";
  const currentProfileImage = profileImageUrl(rawProfileImage);

  let selectedImageFile = null;
  let previewImageUrl = currentProfileImage;

  appLayout.innerHTML = `
    <section class="edit-profile-page">

      <header class="edit-profile-header">

        <button
          type="button"
          class="edit-profile-cancel-button"
        >
          Annuler
        </button>

        <h1 class="edit-profile-title">
          Modifier le profil
        </h1>

        <button
          type="button"
          class="edit-profile-save-button"
          disabled
        >
          Enregistrer
        </button>

      </header>

      <div class="edit-profile-content">

        <div class="edit-profile-avatar-wrapper">

          <div class="edit-profile-avatar">
            ${
              currentProfileImage
                ? `
                  <img
                    src="${currentProfileImage}"
                    alt=""
                    class="edit-profile-avatar-image"
                  >
                `
                : `
                  <div class="edit-profile-avatar-fallback">
                    <i data-lucide="user"></i>
                  </div>
                `
            }
          </div>

          <button
            type="button"
            class="edit-profile-photo-button"
            aria-label="Modifier la photo de profil"
          >
            <i data-lucide="camera"></i>
          </button>

          <input
            type="file"
            class="edit-profile-file-input"
            accept="image/*"
            hidden
          >

        </div>

        <div class="edit-profile-field">

          <label
            for="edit-profile-pseudo"
            class="edit-profile-label"
          >
            Pseudo
          </label>

          <input
            type="text"
            id="edit-profile-pseudo"
            class="edit-profile-input"
            value="${currentPseudo}"
            maxlength="30"
            autocomplete="off"
          >

        </div>

      </div>

    </section>
  `;

  lucide.createIcons();

  const cancelButton = document.querySelector(
    ".edit-profile-cancel-button"
  );

  const saveButton = document.querySelector(
    ".edit-profile-save-button"
  );

  const photoButton = document.querySelector(
    ".edit-profile-photo-button"
  );

  const fileInput = document.querySelector(
    ".edit-profile-file-input"
  );

  const pseudoInput = document.querySelector(
    ".edit-profile-input"
  );

  const avatar = document.querySelector(
    ".edit-profile-avatar"
  );

  function updateSaveButton() {
    const newPseudo = pseudoInput.value.trim();

    const pseudoChanged =
      newPseudo !== currentPseudo;

    const imageChanged =
      selectedImageFile !== null;

    const hasChanges =
      pseudoChanged || imageChanged;

    const pseudoIsValid =
      newPseudo.length > 0 &&
      newPseudo.length <= 30;

    saveButton.disabled =
      !hasChanges || !pseudoIsValid;
  }

  cancelButton.addEventListener("click", () => {
    if (
      previewImageUrl &&
      previewImageUrl.startsWith("blob:")
    ) {
      URL.revokeObjectURL(previewImageUrl);
    }

    renderProfile();
  });

  photoButton.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      fileInput.value = "";
      return;
    }

    selectedImageFile = file;

    if (
      previewImageUrl &&
      previewImageUrl.startsWith("blob:")
    ) {
      URL.revokeObjectURL(previewImageUrl);
    }

    previewImageUrl = URL.createObjectURL(file);

    avatar.innerHTML = `
      <img
        src="${previewImageUrl}"
        alt=""
        class="edit-profile-avatar-image"
      >
    `;

    updateSaveButton();
  });

  pseudoInput.addEventListener(
    "input",
    updateSaveButton
  );

saveButton.addEventListener("click", async () => {
  const newPseudo = pseudoInput.value.trim();
  const storedProfile = getStoredProfile();

  // =========================
  // VÉRIFICATIONS
  // =========================

  if (!storedProfile?.id) {
    console.error("Identifiant utilisateur introuvable.");
    return;
  }

  if (!newPseudo) {
    console.error("Le pseudo ne peut pas être vide.");
    return;
  }

  if (newPseudo.length > 30) {
    console.error(
      "Le pseudo ne peut pas dépasser 30 caractères."
    );
    return;
  }

  // =========================
  // CRÉATION DU FORMDATA
  // =========================

  const formData = new FormData();

  formData.append(
    "id",
    String(storedProfile.id)
  );

  formData.append(
    "pseudo",
    newPseudo
  );

  if (selectedImageFile) {
    formData.append(
      "imageProfile",
      selectedImageFile
    );
  }

  try {
    // =========================
    // BOUTON EN CHARGEMENT
    // =========================

    saveButton.disabled = true;
    saveButton.textContent = "Enregistrement...";

    // =========================
    // ENVOI AU SERVEUR
    // =========================

    const response = await fetch(
      `${API_URL}/api/profile`,
      {
        method: "PATCH",
        body: formData
      }
    );

    const responseText = await response.text();

    let result = null;

    try {
      result = responseText
        ? JSON.parse(responseText)
        : null;
    } catch {
      throw new Error(
        `Réponse serveur invalide (${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        result?.message ||
        "Impossible de modifier le profil."
      );
    }

    if (!result?.profile) {
      throw new Error(
        "Le serveur n’a pas renvoyé le profil actualisé."
      );
    }

    // =========================
    // MISE À JOUR DU LOCALSTORAGE
    // =========================

    const updatedProfile = {
      ...storedProfile,
      ...result.profile
    };

    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(updatedProfile)
    );

    // Informe les autres composants du changement
    window.dispatchEvent(
      new CustomEvent("sonaraProfileUpdated", {
        detail: updatedProfile
      })
    );

    // =========================
    // NETTOYAGE DE L’APERÇU
    // =========================

    if (
      previewImageUrl &&
      previewImageUrl.startsWith("blob:")
    ) {
      URL.revokeObjectURL(previewImageUrl);
    }

    selectedImageFile = null;

    // =========================
    // RETOUR AU PROFIL
    // =========================

    renderProfile();
  } catch (error) {
    console.error(
      "Erreur pendant la sauvegarde du profil :",
      error
    );

    saveButton.textContent = "Enregistrer";

    // Recalcule si le bouton peut être recliqué
    updateSaveButton();
  }
});

  updateSaveButton();
}

function initProfilePage() {
  if (!appLayout) {
    console.error("Conteneur .app-layout introuvable.");
    return;
  }

  renderProfile();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initProfilePage,
    { once: true }
  );
} else {
  initProfilePage();
}
