const appLayout = document.querySelector(".app-layout");

function readArtistProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null") || {};
  } catch (error) {
    console.error("Profil artiste illisible :", error);
    return {};
  }
}

function safeText(value = "") {
  const element = document.createElement("div");
  element.textContent = String(value);
  return element.innerHTML;
}

function profileImageUrl(value = "") {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/.test(value)) return value;
  const baseUrl = typeof API_URL === "string" ? API_URL.replace(/\/$/, "") : "";
  return `${baseUrl}/uploads/${value}`;
}

function profileIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showProfileMessage(message, type = "success") {
  let toast = document.querySelector(".artist-profile-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "artist-profile-toast";
    document.body.appendChild(toast);
  }

  toast.className = `artist-profile-toast ${type}`;
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("show"));

  clearTimeout(showProfileMessage.timer);
  showProfileMessage.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function renderArtistProfile() {
  const profile = readArtistProfile();
  const pseudo = profile.pseudo || profile.username || "Artiste";
  const biography = profile.biography || "";
  const image = profileImageUrl(profile.imageProfile || "");

  appLayout.innerHTML = `
    <section class="artist-profile-page">
      <header class="artist-profile-topbar">
        <button type="button" class="artist-round-button artist-profile-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>

        <button type="button" class="artist-round-button artist-profile-settings" aria-label="Paramètres">
          <i data-lucide="settings"></i>
        </button>
      </header>

      <main class="artist-profile-content">
        <div class="artist-profile-avatar">
          ${image
            ? `<img src="${safeText(image)}" alt="Photo de profil de ${safeText(pseudo)}">`
            : `<span><i data-lucide="user-round"></i></span>`
          }
        </div>

        <p class="artist-profile-label">SONARA CREATOR</p>
        <h1>${safeText(pseudo)}</h1>

        ${biography
          ? `<p class="artist-profile-biography">${safeText(biography)}</p>`
          : `<p class="artist-profile-biography empty">Aucune biographie pour le moment.</p>`
        }

        <button type="button" class="artist-profile-edit">
          Éditer le profil
        </button>
      </main>
    </section>
  `;

  profileIcons();

  document.querySelector(".artist-profile-back").addEventListener("click", () => {
    window.location.href = "../creator.html?mode=management";
  });

  document.querySelector(".artist-profile-settings").addEventListener("click", () => {
    window.location.href = "settings-creator/settings-creator.html";
  });

  document.querySelector(".artist-profile-edit").addEventListener("click", renderArtistProfileEditor);
}

function renderArtistProfileEditor() {
  const storedProfile = readArtistProfile();
  const currentPseudo = storedProfile.pseudo || "";
  const currentBiography = storedProfile.biography || "";
  const currentImage = profileImageUrl(
    storedProfile.imageProfile || ""
  );

  let selectedImage = null;
  let previewUrl = currentImage;

  appLayout.innerHTML = `
    <section class="artist-profile-editor">
      <header class="artist-editor-header">
        <button type="button" class="artist-editor-cancel">Annuler</button>
        <h1>Modifier le profil</h1>
        <button type="button" class="artist-editor-save" disabled>Enregistrer</button>
      </header>

      <main class="artist-editor-content">
        <div class="artist-editor-avatar-wrap">
          <div class="artist-editor-avatar">
            ${currentImage
              ? `<img src="${safeText(currentImage)}" alt="">`
              : `<span><i data-lucide="user-round"></i></span>`
            }
          </div>

          <button type="button" class="artist-editor-camera" aria-label="Changer la photo">
            <i data-lucide="camera"></i>
          </button>

          <input class="artist-editor-file" type="file" accept="image/*" hidden>
        </div>

        <label class="artist-editor-field">
          <span>Pseudo artiste</span>
          <input
            class="artist-editor-pseudo"
            type="text"
            maxlength="30"
            value="${safeText(currentPseudo)}"
            autocomplete="off"
          >
          <small class="artist-field-error" data-error="pseudo"></small>
        </label>

        <label class="artist-editor-field">
          <span>Biographie</span>
          <textarea
            class="artist-editor-biography"
            maxlength="500"
            rows="7"
            placeholder="Présente ton univers, ton style et ce que tu proposes."
          >${safeText(currentBiography)}</textarea>
          <div class="artist-field-footer">
            <small class="artist-field-error" data-error="biography"></small>
            <small class="artist-biography-count">${currentBiography.length} / 500</small>
          </div>
        </label>
      </main>
    </section>
  `;

  profileIcons();

  const cancel = document.querySelector(".artist-editor-cancel");
  const save = document.querySelector(".artist-editor-save");
  const camera = document.querySelector(".artist-editor-camera");
  const file = document.querySelector(".artist-editor-file");
  const avatar = document.querySelector(".artist-editor-avatar");
  const pseudo = document.querySelector(".artist-editor-pseudo");
  const biography = document.querySelector(".artist-editor-biography");
  const counter = document.querySelector(".artist-biography-count");

  function validate() {
    const newPseudo = pseudo.value.trim();
    const newBiography = biography.value.trim();

    document.querySelector('[data-error="pseudo"]').textContent =
      newPseudo.length === 0 ? "Le pseudo est obligatoire." :
      newPseudo.length > 30 ? "30 caractères maximum." : "";

    document.querySelector('[data-error="biography"]').textContent =
      newBiography.length > 500 ? "500 caractères maximum." : "";

    const changed =
      newPseudo !== currentPseudo ||
      newBiography !== currentBiography ||
      selectedImage !== null;

    save.disabled =
      !changed ||
      newPseudo.length === 0 ||
      newPseudo.length > 30 ||
      newBiography.length > 500;
  }

  cancel.addEventListener("click", () => {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    renderArtistProfile();
  });

  camera.addEventListener("click", () => file.click());

  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    if (!chosen) return;

    if (!chosen.type.startsWith("image/")) {
      showProfileMessage("Choisis uniquement une image.", "error");
      file.value = "";
      return;
    }

    if (chosen.size > 8 * 1024 * 1024) {
      showProfileMessage("L’image ne doit pas dépasser 8 Mo.", "error");
      file.value = "";
      return;
    }

    selectedImage = chosen;

    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(chosen);

    avatar.innerHTML = `<img src="${previewUrl}" alt="">`;
    validate();
  });

  pseudo.addEventListener("input", validate);

  biography.addEventListener("input", () => {
    counter.textContent = `${biography.value.length} / 500`;
    validate();
  });

  save.addEventListener("click", async () => {
    const profile = readArtistProfile();
    const id = profile.id || profile.accountId;

    if (!id) {
      showProfileMessage("Identifiant du profil introuvable.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("id", String(id));
    formData.append("pseudo", pseudo.value.trim());
    formData.append("biography", biography.value.trim());

    if (selectedImage) {
      formData.append("imageProfile", selectedImage);
    }

    save.disabled = true;
    save.textContent = "Enregistrement…";

    try {
      const response = await fetch(`${API_URL}/api/profile`, {
        method: "PATCH",
        body: formData
      });

      const responseText = await response.text();
      let result;

      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(`Réponse serveur invalide (${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(result.message || "Impossible de modifier le profil.");
      }

      const updated = { ...profile, ...result.profile };
      localStorage.setItem("sonaraProfile", JSON.stringify(updated));

      window.dispatchEvent(new CustomEvent("sonaraProfileUpdated", {
        detail: updated
      }));

      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);

      showProfileMessage("Profil artiste mis à jour.");
      renderArtistProfile();
    } catch (error) {
      showProfileMessage(error.message, "error");
      save.disabled = false;
      save.textContent = "Enregistrer";
    }
  });

  validate();
}

renderArtistProfile();
