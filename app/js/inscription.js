const chaosPage = document.querySelector(".chaos");

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function normalizeLoginPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0033") && digits.length === 13) return `0${digits.slice(4)}`;
  if (digits.startsWith("33") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function getAccountRedirect(profile = {}) {
  const status = String(profile.status || "").toLowerCase();
  const role = String(profile.role || "").toLowerCase();

  if ((status === "rejected" || status === "banned") && role === "both") {
    return "/home.html";
  }

  if (status === "pending") {
    return "/app/pages/pending.html";
  }

  if (role === "artist" || role === "both") {
    return "/app/pages/creator.html";
  }

  return "/home.html";
}


function showInscriptionPopup({
  title = "Information",
  message = "",
  type = "info",
  buttonText = "Fermer"
}) {
  document.querySelector(".inscription-popup")?.remove();

  const popup = document.createElement("div");
  popup.className = `inscription-popup inscription-popup-${type}`;

  popup.innerHTML = `
    <div class="inscription-popup-content">
      <div class="inscription-popup-icon">
        <i data-lucide="${
          type === "success"
            ? "circle-check"
            : type === "error"
              ? "circle-x"
              : type === "warning"
                ? "triangle-alert"
                : "info"
        }"></i>
      </div>

      <h2>${title}</h2>
      <p>${message}</p>

      <button type="button" class="inscription-popup-button">
        ${buttonText}
      </button>
    </div>
  `;

  document.body.appendChild(popup);

  if (window.lucide) {
    lucide.createIcons();
  }

  const close = () => popup.remove();

  popup
    .querySelector(".inscription-popup-button")
    .addEventListener("click", close);

  popup.addEventListener("click", (event) => {
    if (event.target === popup) {
      close();
    }
  });
}

function getRegistrationFieldKey(input) {
  if (input.classList.contains("mail-input")) return "mail";
  if (input.classList.contains("password-input")) return "password";
  if (input.classList.contains("phone-input")) return "phone";
  if (input.classList.contains("pseudo-input")) return "pseudo";
  if (input.classList.contains("login-code-input")) return "login-verification-code";
  if (input.classList.contains("registration-code-input")) return "verification-code";
  return input.name || "field";
}

function ensureFieldMessage(input) {
  const fieldKey = getRegistrationFieldKey(input);
  const form = input.closest("form");
  let container = input.closest(".password-field, .registration-validation-field");

  if (!container) {
    container = document.createElement("div");
    container.className = "registration-validation-field";
    input.parentNode.insertBefore(container, input);
    container.appendChild(input);
  }

  const selector = `.field-message[data-for="${fieldKey}"]`;
  const existingMessages = form
    ? [...form.querySelectorAll(selector)]
    : [...container.querySelectorAll(selector)];

  let message = existingMessages.find(
    (element) => element.parentElement === container
  ) || existingMessages[0];

  if (!message) {
    message = document.createElement("p");
  }

  existingMessages.forEach((element) => {
    if (element !== message) element.remove();
  });

  if (message.parentElement !== container) {
    container.appendChild(message);
  }

  message.className = "field-message";
  message.dataset.for = fieldKey;
  return message;
}

function setFieldMessage(input, message = "", type = "") {
  if (!input) return;

  const fieldMessage = ensureFieldMessage(input);
  fieldMessage.textContent = message;
  fieldMessage.className = `field-message${type ? ` field-message-${type}` : ""}`;
  input.classList.toggle("input-error", type === "error");
  input.classList.toggle("input-success", type === "success");
}

function clearFormFieldErrors(form) {
  form.querySelectorAll(".formulaire").forEach((input) => {
    input.classList.remove("input-error", "input-success");
  });

  form.querySelectorAll(".field-message").forEach((message) => {
    if (!message.classList.contains("password-hint")) {
      message.textContent = "";
      message.className = "field-message";
    }
  });
}

function applyRegistrationFieldErrors(form, fieldErrors = {}) {
  const selectors = {
    mail: ".mail-input",
    pseudo: ".pseudo-input",
    password: ".password-input"
  };

  Object.entries(fieldErrors).forEach(([field, message]) => {
    const input = form.querySelector(selectors[field]);
    setFieldMessage(input, message, "error");
    form._blockedRegistrationFields?.add(field);
  });

  form._updateRegistrationSubmitState?.();
}


async function checkRegistrationFieldAvailability(form, field) {
  const inputs = {
    mail: form.querySelector(".mail-input"),
    pseudo: form.querySelector(".pseudo-input"),
    password: form.querySelector(".password-input")
  };

  const input = inputs[field];
  if (!input) return;

  const rawValue = field === "password" ? input.value : input.value.trim();

  const canCheck =
    field === "mail"
      ? rawValue !== "" && input.checkValidity()
      : field === "pseudo"
        ? rawValue !== ""
        : rawValue.length >= PASSWORD_MIN_LENGTH && rawValue.length <= PASSWORD_MAX_LENGTH;

  if (!canCheck) {
    form._registrationAvailability[field] = "unknown";
    form._updateRegistrationSubmitState?.();
    return;
  }

  const requestId = (form._registrationRequestIds[field] || 0) + 1;
  form._registrationRequestIds[field] = requestId;
  form._registrationAvailability[field] = "pending";
  form._updateRegistrationSubmitState?.();

  const payload = { [field]: rawValue };

  try {
    const response = await fetch(`${API_URL}/api/account-security/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (form._registrationRequestIds[field] !== requestId) return;
    if (!response.ok || !data.success) {
      form._registrationAvailability[field] = "unknown";
      form._updateRegistrationSubmitState?.();
      return;
    }

    const errorMessage = data.fieldErrors?.[field];

    if (errorMessage) {
      setFieldMessage(input, errorMessage, "error");
      form._blockedRegistrationFields.add(field);
      form._registrationAvailability[field] = "error";
    } else {
      const successMessages = {
        mail: "Adresse e-mail disponible.",
        pseudo: "Pseudo disponible.",
        password: "Mot de passe disponible."
      };
      setFieldMessage(input, successMessages[field], "success");
      form._blockedRegistrationFields.delete(field);
      form._registrationAvailability[field] = "valid";
    }

    form._updateRegistrationSubmitState?.();
  } catch (error) {
    if (form._registrationRequestIds[field] !== requestId) return;
    form._registrationAvailability[field] = "unknown";
    form._updateRegistrationSubmitState?.();
    console.error(`Erreur vérification ${field} :`, error);
  }
}


function createLoginLiveVerifier({
  mailInput,
  passwordInput,
  phoneInput,
  setMessage,
  onStateChange
}) {
  let timer = null;
  let requestId = 0;
  const state = { mail: false, password: false, phone: false, pending: false };

  const publish = () => onStateChange?.({ ...state });

  const schedule = () => {
    clearTimeout(timer);
    const mail = mailInput.value.trim();
    const password = passwordInput.value;
    const phone = normalizeLoginPhone(phoneInput.value);

    state.mail = false;
    state.password = false;
    state.phone = false;

    if (!mail) setMessage(mailInput);
    else if (!mailInput.checkValidity()) setMessage(mailInput, "Adresse e-mail invalide.", "error");
    else setMessage(mailInput, "Vérification de l’adresse e-mail…");

    if (!phone) setMessage(phoneInput);
    else setMessage(phoneInput, "Vérification du numéro…");

    if (password.length >= PASSWORD_MIN_LENGTH) {
      setMessage(passwordInput, "Vérification du mot de passe…");
    }

    if (!mail || !mailInput.checkValidity()) {
      state.pending = false;
      publish();
      return;
    }

    state.pending = true;
    publish();
    const currentRequest = ++requestId;

    timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/api/login/live-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mail, password, phone })
        });
        const data = await response.json();
        if (currentRequest !== requestId) return;

        const checks = data.checks || {};
        state.mail = checks.mail === true;
        state.phone = checks.phone === true;
        state.password = checks.password === true;
        state.pending = false;

        setMessage(
          mailInput,
          state.mail ? "Adresse e-mail reconnue." : "Adresse e-mail incorrecte.",
          state.mail ? "success" : "error"
        );

        if (phone) {
          setMessage(
            phoneInput,
            state.phone ? "Numéro de téléphone correct." : "Numéro de téléphone incorrect.",
            state.phone ? "success" : "error"
          );
        }

        if (password.length >= PASSWORD_MIN_LENGTH) {
          setMessage(
            passwordInput,
            state.password ? "Mot de passe correct." : "Mot de passe incorrect.",
            state.password ? "success" : "error"
          );
        }

        publish();
      } catch (error) {
        if (currentRequest !== requestId) return;
        state.pending = false;
        publish();
        console.error("Erreur vérification connexion en direct :", error);
      }
    }, 450);
  };

  return { state, schedule };
}

async function sendRegistrationVerificationCode({ form, mail, pseudo, password }) {
  const sendResponse = await fetch(`${API_URL}/api/account-security/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mail, pseudo, password, purpose: "register" })
  });
  const sendData = await sendResponse.json();

  if (!sendResponse.ok || !sendData.success) {
    applyRegistrationFieldErrors(form, sendData.fieldErrors || {});
    throw new Error(sendData.message || "Impossible d'envoyer le code.");
  }
}

async function verifyRegistrationCode({ mail, code }) {
  const verifyResponse = await fetch(`${API_URL}/api/account-security/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mail, code, purpose: "register" })
  });
  const verifyData = await verifyResponse.json();

  if (!verifyResponse.ok || !verifyData.success || !verifyData.verificationToken) {
    throw new Error(verifyData.message || "Code incorrect ou expiré.");
  }

  return verifyData.verificationToken;
}

async function sendLoginVerificationCode({ mail, password, phone }) {
  const response = await fetch(`${API_URL}/api/login/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mail, password, phone })
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || "Impossible d'envoyer le code.");
  }
}

async function verifyLoginCode({ mail, code }) {
  const response = await fetch(`${API_URL}/api/account-security/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mail, code, purpose: "login" })
  });
  const data = await response.json();

  if (!response.ok || !data.success || !data.verificationToken) {
    throw new Error(data.message || "Code incorrect ou expiré.");
  }

  return data.verificationToken;
}

function setupRegistrationSubmitProtection(form, submitSelector) {
  if (form.dataset.registrationProtectionBound === "true") return;
  form.dataset.registrationProtectionBound = "true";

  const submitButton = form.querySelector(submitSelector);

  let codeField = form.querySelector(".registration-code-field");
  if (!codeField) {
    codeField = document.createElement("div");
    codeField.className = "registration-validation-field registration-code-field";
    codeField.hidden = true;
    codeField.innerHTML = `
      <input type="text" class="formulaire registration-code-input" placeholder="Code à 6 chiffres" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <p class="field-message" data-for="verification-code"></p>
    `;
    submitButton.parentNode.insertBefore(codeField, submitButton);
  }
  const codeInput = codeField.querySelector(".registration-code-input");

  const watchedFields = {
    mail: form.querySelector(".mail-input"),
    pseudo: form.querySelector(".pseudo-input"),
    password: form.querySelector(".password-input")
  };

  form._blockedRegistrationFields = new Set();
  form._registrationSubmitting = false;
  form._registrationAvailability = {
    mail: "unknown",
    pseudo: "unknown",
    password: "unknown"
  };
  form._registrationRequestIds = { mail: 0, pseudo: 0, password: 0 };
  form._registrationWaitingForCode = false;
  form._registrationOriginalButtonText = submitButton.textContent;

  const availabilityTimers = {};

  const scheduleAvailabilityCheck = (field) => {
    clearTimeout(availabilityTimers[field]);
    availabilityTimers[field] = setTimeout(() => {
      checkRegistrationFieldAvailability(form, field);
    }, 450);
  };

  const updateSubmitState = () => {
    const password = watchedFields.password?.value || "";
    const passwordValid =
      password.length >= PASSWORD_MIN_LENGTH &&
      password.length <= PASSWORD_MAX_LENGTH;

    const allCheckedAndAvailable = Object.values(
      form._registrationAvailability
    ).every((status) => status === "valid");

    if (form._registrationWaitingForCode) {
      submitButton.disabled =
        form._registrationSubmitting ||
        !/^\d{6}$/.test(codeInput.value.trim());
      return;
    }

    submitButton.disabled =
      form._registrationSubmitting ||
      !form.checkValidity() ||
      !passwordValid ||
      form._blockedRegistrationFields.size > 0 ||
      !allCheckedAndAvailable;
  };

  form._updateRegistrationSubmitState = updateSubmitState;

  Object.entries(watchedFields).forEach(([field, input]) => {
    input?.addEventListener("input", () => {
      if (form._registrationWaitingForCode) {
        form._registrationWaitingForCode = false;
        codeField.hidden = true;
        codeInput.value = "";
        setFieldMessage(codeInput);
        submitButton.textContent = form._registrationOriginalButtonText;
      }
      form._blockedRegistrationFields.delete(field);
      form._registrationAvailability[field] = "unknown";

      if (field !== "password") {
        setFieldMessage(input);
      }

      updateSubmitState();
      scheduleAvailabilityCheck(field);
    });
  });

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    setFieldMessage(codeInput);
    updateSubmitState();
  });

  form.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updateSubmitState);
    input.addEventListener("change", updateSubmitState);
  });

  updateSubmitState();
}

function setupPasswordExperience(form) {
  const input = form.querySelector(".password-input");

  if (!input || input.dataset.passwordExperienceBound === "true") {
    return;
  }
  input.dataset.passwordExperienceBound = "true";

  input.minLength = PASSWORD_MIN_LENGTH;
  input.maxLength = PASSWORD_MAX_LENGTH;
  input.autocomplete = form.classList.contains("form-login")
    ? "current-password"
    : "new-password";

  const wrapper = document.createElement("div");
  wrapper.className = "password-field registration-validation-field";
  input.parentNode.insertBefore(wrapper, input);

  const inputRow = document.createElement("div");
  inputRow.className = "password-input-row";
  wrapper.appendChild(inputRow);
  inputRow.appendChild(input);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "password-toggle";
  toggle.setAttribute("aria-label", "Afficher le mot de passe");
  toggle.innerHTML = '<i data-lucide="eye"></i>';
  inputRow.appendChild(toggle);

  const hint = ensureFieldMessage(input);
  hint.className = "field-message password-hint";
  hint.textContent = `${PASSWORD_MIN_LENGTH} caractères minimum`;

  const refreshHint = () => {
    const length = input.value.length;

    const remaining = Math.max(PASSWORD_MIN_LENGTH - length, 0);

    if (length === 0) {
      setFieldMessage(input, `${PASSWORD_MIN_LENGTH} caractères minimum`);
      return;
    }

    if (remaining > 0) {
      setFieldMessage(
        input,
        `${remaining} caractère${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""}`,
        "error"
      );
      return;
    }

    setFieldMessage(input, "Vérification du mot de passe…");
  };

  input.addEventListener("input", refreshHint);

  toggle.addEventListener("click", () => {
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    toggle.setAttribute(
      "aria-label",
      visible ? "Afficher le mot de passe" : "Masquer le mot de passe"
    );
    toggle.innerHTML = `<i data-lucide="${visible ? "eye" : "eye-off"}"></i>`;

    if (window.lucide) {
      lucide.createIcons();
    }

    input.focus();
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

function validatePasswordInput(input) {
  const value = input.value;

  if (value.length < PASSWORD_MIN_LENGTH) {
    setFieldMessage(
      input,
      `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
      "error"
    );
    input.focus();
    return false;
  }

  if (value.length > PASSWORD_MAX_LENGTH) {
    setFieldMessage(
      input,
      `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`,
      "error"
    );
    input.focus();
    return false;
  }

  return true;
}

async function submitRegistration({
  form,
  formData,
  submitButton,
  onSuccess
}) {
  const codeField = form.querySelector(".registration-code-field");
  const codeInput = form.querySelector(".registration-code-input");
  const profile = JSON.parse(formData.get("profile"));

  try {
    form._registrationSubmitting = true;
    form._updateRegistrationSubmitState?.();

    if (!form._registrationWaitingForCode) {
      submitButton.textContent = "Envoi du code...";
      await sendRegistrationVerificationCode({
        form,
        mail: profile.mail,
        pseudo: profile.pseudo,
        password: profile.password
      });

      form._registrationWaitingForCode = true;
      form._registrationSubmitting = false;
      codeField.hidden = false;
      setFieldMessage(codeInput, `Code envoyé à ${profile.mail}.`, "success");
      submitButton.textContent = "Valider le code";
      form._updateRegistrationSubmitState?.();
      codeInput.focus();
      return;
    }

    submitButton.textContent = "Vérification...";
    const verificationToken = await verifyRegistrationCode({
      mail: profile.mail,
      code: codeInput.value.trim()
    });

    formData.append("verificationToken", verificationToken);
    submitButton.textContent = "Création...";

    const response = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      body: formData
    });
    const data = await response.json();

    if (!response.ok || !data.success || !data.profile) {
      applyRegistrationFieldErrors(form, data.fieldErrors || {});
      throw new Error(data.message || "Création impossible.");
    }

    localStorage.setItem("sonaraProfile", JSON.stringify(data.profile));
    localStorage.setItem("sonaraProfileCreated", "true");
    onSuccess(data);
  } catch (error) {
    console.error("ERREUR BACKEND :", error);

    if (form._registrationWaitingForCode) {
      setFieldMessage(codeInput, error.message || "Code incorrect ou expiré.", "error");
      codeField.hidden = false;
      submitButton.textContent = "Valider le code";
    } else {
      const mailInput = form.querySelector(".mail-input");
      setFieldMessage(mailInput, error.message || "Impossible d'envoyer le code.", "error");
      submitButton.textContent = form._registrationOriginalButtonText || "Créer mon compte";
    }
  } finally {
    form._registrationSubmitting = false;
    form._updateRegistrationSubmitState?.();
  }
}

function renderChoicePage() {
  chaosPage.innerHTML = `

  <section class="btn-login">
  <button class="login-btn"><i data-lucide="log-in"></i><span>Se connecter</span></button>
  </section>

<section class="chaos-hero">

<h1> Bienvenue sur Sonara Pack </h1>

<p>
Choisis comment tu veut utiliser la plateforme.
</p>
</section>


<section class="chaos-page">

<button class="chaos-card user-card" data-role="user">
<i data-lucide="shopping-bag"></i>
<h2>Utilisateur</h2>

<p>
Acheter, découvrir et télécharger des packs.
 </p>

 </button>

<button class="chaos-card artist-card" data-role="artist">
<i data-lucide="music-2"></i>
<h2> Artist</h2>

<p>
 Publier des packs et vendre tes créations
 </p>

 </button>

 <button class="chaos-card both-card" data-role="both">
    <i data-lucide="layers-3"></i>
    <h2> Les deux</h2>

    <p>
     Acheter des packs et publier des packs sur la plateforme. 
    </p>
</button>
</section>
</section>


`;

if (window.lucide) {
  lucide.createIcons();
}

const btnLogin = document.querySelector(".login-btn")

btnLogin.addEventListener("click", () =>{
  renderLogin();
})

  const btnCardChoice = document.querySelector(".chaos-card");

  const choiceCard = document.querySelectorAll(".chaos-card");

  choiceCard.forEach((card) => {
    card.addEventListener("click", () => {
      const role = card.dataset.role;

      if (role === "user") {
        renderUserForm();
      }

      function renderUserForm() {
        chaosPage.innerHTML = `
            <section class="form-page"> 
            <button class="back-btn"> Retour</button>

            <h1>Profil Utilisateur </h1>
            <p> Crée ton compte pour acheter, télécharger et retrouver tes packs. </p>

            <form class="user-form">
              <input type="text" placeholder="Prénom"  class="formulaire firstname-input" required>
              <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
              <input type="date" class="formulaire date-input" required>
              <input type="email" placeholder="Email" class="formulaire mail-input" required>
              <input type="password" placeholder="Mot de passe" class="formulaire password-input" minlength="8" maxlength="128" required>
              <input type="tel" placeholder="Téléphone facultatif" class="formulaire phone-input">
               <input type="text" placeholder="Nom d’artiste"class="formulaire pseudo-input"  required>

                   <div class="profile-upload">
    <div class="profile-avatar-upload">
    <i data-lucide="user" class="user-icon"></i>
        <i data-lucide="camera" class="camera-icon"></i>
    </div>

    <p>Choisir une photo de profil</p>

    <input
        type="file"
        id="imageProfile"
        name="imageProfile"
        accept="image/*"
        hidden
        required
    >
</div>
     
              <button type="submit" class="create-profil-user">Crée mon compte </button>
            </form>
            </section>
            `;

        if (window.lucide) {
          lucide.createIcons();
        }


        const avatarUpload = document.querySelector(".profile-avatar-upload");
        const imageProfileInput = document.getElementById("imageProfile");
        const userIcon = document.querySelector(".user-icon");
        const cameraIcon = document.querySelector(".camera-icon");

        let previewImage = null;

        avatarUpload.addEventListener("click", () => {
          imageProfileInput.click();
        });

        imageProfileInput.addEventListener("change", () => {
          const file = imageProfileInput.files[0];

          if (!file) return;

          if (!file.type.startsWith("image/")) {
            showInscriptionPopup({
              title: "Fichier invalide",
              message: "Choisissez une image uniquement.",
              type: "warning"
            });
            imageProfileInput.value = "";
            return;
          }

          const imageUrl = URL.createObjectURL(file);

          if (!previewImage) {
            previewImage = document.createElement("img");
            previewImage.classList.add("artist-preview");
            avatarUpload.appendChild(previewImage);
          }

          previewImage.src = imageUrl;

          userIcon.style.opacity = "0";
          cameraIcon.style.display = "none";
        });

        const userForm = document.querySelector(".user-form");
        setupPasswordExperience(userForm);
        setupRegistrationSubmitProtection(
          userForm,
          ".create-profil-user"
        );

        const firstnameInput = document.querySelector(".firstname-input");
        const lastnameInput = document.querySelector(".lastname-input");
        const dateInput = document.querySelector(".date-input");
        const mailInput = document.querySelector(".mail-input");
        const passwordInput = document.querySelector(".password-input");
        const telInput = document.querySelector(".phone-input")
        const pseudo = document.querySelector(".pseudo-input");


        userForm.addEventListener("submit", async (e) => {
          e.preventDefault();

          if (!validatePasswordInput(passwordInput)) return;

          console.log(firstnameInput.value);
          console.log(lastnameInput.value);
          console.log(dateInput.value);
          console.log(mailInput.value);
          console.log(passwordInput.value);
          console.log(telInput.value);

          const profile = {
            firstname: firstnameInput.value,
            lastname: lastnameInput.value,
            date: dateInput.value,
            mail: mailInput.value,
            password: passwordInput.value,
            phone: telInput.value,
            pseudo: pseudo.value,
            role: "user",
            status: "approved",
            imageProfile: null,
            createdAt: new Date().toISOString()

          };


          const formData = new FormData();

          formData.append("profile", JSON.stringify(profile));

          const imageProfileInput = document.getElementById("imageProfile");

          if (imageProfileInput && imageProfileInput.files[0]) {
            formData.append("imageProfile", imageProfileInput.files[0]);
          }

          console.log(profile)
          await submitRegistration({
            form: userForm,
            formData,
            submitButton: document.querySelector(".create-profil-user"),
            onSuccess: () => {
              window.location.href = "/home.html";
            }
          });

        });

        document.querySelector(".back-btn").addEventListener("click", renderChoicePage)
      }



      if (role === "artist") {
        renderArtistForm();
      }

      function renderArtistForm() {
        chaosPage.innerHTML = `
    <section class="form-page">
      <button class="back-btn">Retour</button>

      <h1>Profil artiste</h1>
      <p>Crée ton profil artiste pour publier et vendre tes packs.</p>

      <form class="artist-form">
        <input type="text" placeholder="Prénom" class="formulaire firstname-input" required>
        <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
        <input type="date" class="formulaire date-input"  required>
        <input type="text" placeholder="Adresse complète" class="formulaire adress-input" required>
        <input type="email" placeholder="Email" class="formulaire mail-input" required>
        <input type="password" placeholder="Mot de passe"class="formulaire password-input" minlength="8" maxlength="128" required>
        <input type="tel" placeholder="Téléphone" class="formulaire phone-input"  required>
        <input type="text" placeholder="Nom d’artiste"class="formulaire pseudo-input"  required>
   
            
        <div class="profile-upload">
    <div class="profile-avatar-upload">
    <i data-lucide="user" class="user-icon"></i>
        <i data-lucide="camera" class="camera-icon"></i>
    </div>

    <p>Choisir une photo de profil</p>

    <input
        type="file"
        class="profile-image-input"
        name="imageProfile"
        accept="image/*"
        hidden
        required
    >
</div>

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je confirme être majeur pour commencer a vendre
        </label>

        <label class="checkbox-line">
          <input type="checkbox" required >
          Je confirme posséder les droits des sons que je publierai
        </label>

        <button type="submit" class="create-profil-artist">Créer mon compte</button>
      </form>
    </section>
  `;

        if (window.lucide) {
          lucide.createIcons();
        }


        const avatarUpload = document.querySelector(".profile-avatar-upload");
     const imageProfileInput = document.querySelector(".profile-image-input");
        const userIcon = document.querySelector(".user-icon");
        const cameraIcon = document.querySelector(".camera-icon");

        let previewImage = null;

        avatarUpload.addEventListener("click", () => {
          imageProfileInput.click();
        });

        imageProfileInput.addEventListener("change", () => {
          const file = imageProfileInput.files[0];

          if (!file) return;

          if (!file.type.startsWith("image/")) {
            showInscriptionPopup({
              title: "Fichier invalide",
              message: "Choisissez une image uniquement.",
              type: "warning"
            });
            imageProfileInput.value = "";
            return;
          }

          const imageUrl = URL.createObjectURL(file);

          if (!previewImage) {
            previewImage = document.createElement("img");
            previewImage.classList.add("artist-preview");
            avatarUpload.appendChild(previewImage);
          }

          previewImage.src = imageUrl;

          userIcon.style.opacity = "0";
          cameraIcon.style.display = "none";
        });
        const artistForm = document.querySelector(".artist-form");
        setupPasswordExperience(artistForm);
        setupRegistrationSubmitProtection(
          artistForm,
          ".create-profil-artist"
        );


        const firstnameInput = document.querySelector(".firstname-input");
        const lastnameInput = document.querySelector(".lastname-input");
        const dateInput = document.querySelector(".date-input");
        const adressInput = document.querySelector(".adress-input")
        const mailInput = document.querySelector(".mail-input");
        const passwordInput = document.querySelector(".password-input");
        const telInput = document.querySelector(".phone-input");
        const pseudo = document.querySelector(".pseudo-input");
        const siretInput = document.querySelector(".siret-input")



        artistForm.addEventListener("submit", async (e) => {
          e.preventDefault();

          if (!validatePasswordInput(passwordInput)) return;



          const profile = {
            firstname: firstnameInput.value,
            lastname: lastnameInput.value,
            date: dateInput.value,
            mail: mailInput.value,
            password: passwordInput.value,
            phone: telInput.value,
            pseudo: pseudo.value,
            role: "artist",
            status: "pending",
            createdAt: new Date().toISOString()
          };

           const imageProfileInput = document.querySelector(".profile-image-input");
          const imageProfileFile = imageProfileInput.files[0];

          const formData = new FormData();

          formData.append("profile", JSON.stringify(profile));

          if (imageProfileFile) {
            formData.append("imageProfile", imageProfileFile);
          }
          await submitRegistration({
            form: artistForm,
            formData,
            submitButton: document.querySelector(".create-profil-artist"),
            onSuccess: (data) => {
              if (data.stripeOnboardingUrl) {
                window.location.href = data.stripeOnboardingUrl;
                return;
              }

              window.location.href = getAccountRedirect(data.profile);
            }
          });
        });

        document.querySelector(".back-btn").addEventListener("click", renderChoicePage);
      }

      if (role === "both") {
        renderBothForm();
      }


      function renderBothForm() {
        chaosPage.innerHTML = `
    <section class="form-page">
    <button class="back-btn">Retour</button>

      <h1>Profil complet</h1>
      <p>Crée un compte utilisateur + artiste.</p>

      <form class="both-form">
        <input type="text" placeholder="Prénom"  class="formulaire firstname-input" required>
        <input type="text" placeholder="Nom" class="formulaire lastname-input" required>
        <input type="date" class="formulaire date-input" required>
        <input type="text" placeholder="Adresse complète" class="formulaire adress-input" required>
        <input type="email" placeholder="Email" class="formulaire mail-input" required>
        <input type="password" placeholder="Mot de passe" class="formulaire password-input" minlength="8" maxlength="128" required>
        <input type="tel" placeholder="Téléphone" class="formulaire phone-input" required>
        <input type="text" placeholder="Nom d’artiste" class="formulaire pseudo-input" required>
   
        <div class="profile-upload">
    <div class="profile-avatar-upload">
       <i data-lucide="user" class="user-icon"></i>
        <i data-lucide="camera" class="camera-icon"></i>
    </div>

    <p>Choisir une photo de profil</p>

    <input
        type="file"
        class="profile-image-input"
        name="imageProfile"
        accept="image/*"
        hidden
     required
     >
</div>

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je confirme être majeur pour commencer a vendre
        </label>

        <label class="checkbox-line">
          <input type="checkbox" required>
          Je suis consentent a vendre mes fichiers sons 
        </label>

        <button type="submit" class="create-profil-both">Créer mon compte</button>
      </form>
    </section>
  `;

        if (window.lucide) {
          lucide.createIcons();
        }

        const avatarUpload = document.querySelector(".profile-avatar-upload");
          const imageProfileInput = document.querySelector(".profile-image-input");
        const userIcon = document.querySelector(".user-icon");
        const cameraIcon = document.querySelector(".camera-icon");

        let previewImage = null;

        avatarUpload.addEventListener("click", () => {
          imageProfileInput.click();
        });

        imageProfileInput.addEventListener("change", () => {
          const file = imageProfileInput.files[0];

          if (!file) return;

          if (!file.type.startsWith("image/")) {
            showInscriptionPopup({
              title: "Fichier invalide",
              message: "Choisissez une image uniquement.",
              type: "warning"
            });
            imageProfileInput.value = "";
            return;
          }

          const imageUrl = URL.createObjectURL(file);

          if (!previewImage) {
            previewImage = document.createElement("img");
            previewImage.classList.add("artist-preview");
            avatarUpload.appendChild(previewImage);
          }

          previewImage.src = imageUrl;

          userIcon.style.opacity = "0";
          cameraIcon.style.display = "none";
        });
        const bothForm = document.querySelector(".both-form")
        setupPasswordExperience(bothForm);
        setupRegistrationSubmitProtection(
          bothForm,
          ".create-profil-both"
        );

        const firstnameInput = document.querySelector(".firstname-input");
        const lastnameInput = document.querySelector(".lastname-input");
        const dateInput = document.querySelector(".date-input");
        const adressInput = document.querySelector(".adress-input")
        const mailInput = document.querySelector(".mail-input");
        const passwordInput = document.querySelector(".password-input");
        const telInput = document.querySelector(".phone-input");
        const pseudo = document.querySelector(".pseudo-input");
        



        bothForm.addEventListener("submit", async (e) => {
          e.preventDefault();

          if (!validatePasswordInput(passwordInput)) return;

          console.log(firstnameInput.value);
          console.log(lastnameInput.value);
          console.log(dateInput.value);
          console.log(mailInput.value);
          console.log(passwordInput.value);
          console.log(telInput.value);
          console.log(pseudo.value);
          const profile = {
            firstname: firstnameInput.value,
            lastname: lastnameInput.value,
            date: dateInput.value,
            mail: mailInput.value,
            password: passwordInput.value,
            phone: telInput.value,
            pseudo: pseudo.value,
            role: "both",
            status: "pending",
            createdAt: new Date().toISOString()
          };

           const imageProfileInput = document.querySelector(".profile-image-input");
          const imageProfileFile = imageProfileInput.files[0];

          const formData = new FormData();

          formData.append("profile", JSON.stringify(profile));

          if (imageProfileFile) {
            formData.append("imageProfile", imageProfileFile);
          }
          await submitRegistration({
            form: bothForm,
            formData,
            submitButton: document.querySelector(".create-profil-both"),
            onSuccess: (data) => {
              if (data.stripeOnboardingUrl) {
                window.location.href = data.stripeOnboardingUrl;
                return;
              }

              window.location.href = getAccountRedirect(data.profile);
            }
          });

        });

        document.querySelector(".back-btn").addEventListener("click", renderChoicePage);
      }
    });
  });
}

function renderLogin() {
  chaosPage.innerHTML = `
  <section class="btn-login">
  <button class="login-btn"><i data-lucide="user-plus"></i><span>S'inscrire</span></button>
  </section>

  <section class="form">

  <section class="chaos-hero">

<h1> Ravis de vous revoirs </h1>

<p>
Connectez-vous à votre compte Sonara Pack.
</p>
</section>

<section class="form-login">
   <input type="email" placeholder="Email" class="formulaire mail-input" autocomplete="email" required>
        <input type="password" placeholder="Mot de passe" class="formulaire password-input" minlength="8" maxlength="128" autocomplete="current-password" required>
        <input type="tel" placeholder="Téléphone" class="formulaire phone-input" autocomplete="tel" required>
</section>


              <button type="submit" class="login" disabled>Envoyer le code de vérification</button>
            </form>
</section>

  `;

  if (window.lucide) {
    lucide.createIcons();
  }

  const loginForm = document.querySelector(".form-login");
  setupPasswordExperience(loginForm);

  const inscriptionBtn = document.querySelector(".login-btn");
  const loginBtn = document.querySelector(".login");
  const mailInput = loginForm.querySelector(".mail-input");
  const passwordInput = loginForm.querySelector(".password-input");
  const phoneInput = loginForm.querySelector(".phone-input");

  const codeField = document.createElement("div");
  codeField.className = "registration-validation-field login-code-field";
  codeField.hidden = true;
  codeField.innerHTML = `
    <input type="text" class="formulaire login-code-input" placeholder="Code à 6 chiffres" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
    <p class="field-message" data-for="login-verification-code"></p>
  `;
  loginForm.appendChild(codeField);

  const codeInput = codeField.querySelector(".login-code-input");
  let waitingForCode = false;
  let submitting = false;
  let liveChecks = { mail: false, password: false, phone: false, pending: false };

  const resetCodeStep = () => {
    if (!waitingForCode) return;
    waitingForCode = false;
    codeField.hidden = true;
    codeInput.value = "";
    setFieldMessage(codeInput);
    loginBtn.textContent = "Envoyer le code de vérification";
  };

  const updateLoginButtonState = () => {
    const credentialsReady = Boolean(
      mailInput.value.trim() &&
      mailInput.checkValidity() &&
      passwordInput.value.length >= PASSWORD_MIN_LENGTH &&
      passwordInput.value.length <= PASSWORD_MAX_LENGTH &&
      normalizeLoginPhone(phoneInput.value) &&
      liveChecks.mail &&
      liveChecks.password &&
      liveChecks.phone &&
      !liveChecks.pending
    );

    loginBtn.disabled = submitting || (
      waitingForCode
        ? !/^\d{6}$/.test(codeInput.value.trim())
        : !credentialsReady
    );
  };

  const liveVerifier = createLoginLiveVerifier({
    mailInput,
    passwordInput,
    phoneInput,
    setMessage: setFieldMessage,
    onStateChange: (nextState) => {
      liveChecks = nextState;
      updateLoginButtonState();
    }
  });

  [mailInput, passwordInput, phoneInput].forEach((input) => {
    input.addEventListener("input", () => {
      resetCodeStep();
      liveVerifier.schedule();
      updateLoginButtonState();
    });
  });

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    setFieldMessage(codeInput);
    updateLoginButtonState();
  });

  inscriptionBtn.addEventListener("click", () => {
    renderChoicePage();
  });

  loginBtn.addEventListener("click", async (event) => {
    event.preventDefault();

    const mail = mailInput.value.trim();
    const password = passwordInput.value;
    const phone = normalizeLoginPhone(phoneInput.value);

    if (!mail || !mailInput.checkValidity() || password.length < PASSWORD_MIN_LENGTH || !phone) {
      if (!mail || !mailInput.checkValidity()) {
        setFieldMessage(mailInput, "Adresse e-mail valide obligatoire.", "error");
      }
      if (password.length < PASSWORD_MIN_LENGTH) {
        setFieldMessage(passwordInput, `${PASSWORD_MIN_LENGTH} caractères minimum`, "error");
      }
      if (!phone) {
        setFieldMessage(phoneInput, "Numéro de téléphone obligatoire.", "error");
      }
      updateLoginButtonState();
      return;
    }

    try {
      submitting = true;
      updateLoginButtonState();

      if (!waitingForCode) {
        loginBtn.textContent = "Envoi du code...";
        await sendLoginVerificationCode({ mail, password, phone });

        waitingForCode = true;
        codeField.hidden = false;
        setFieldMessage(codeInput, `Code envoyé à ${mail}.`, "success");
        loginBtn.textContent = "Valider le code";
        codeInput.focus();
        return;
      }

      loginBtn.textContent = "Vérification...";
      const verificationToken = await verifyLoginCode({
        mail,
        code: codeInput.value.trim()
      });

      loginBtn.textContent = "Connexion...";
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mail, password, phone, verificationToken })
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.account) {
        throw new Error(data.error || "Connexion impossible.");
      }

      localStorage.setItem("sonaraProfile", JSON.stringify(data.account));
      localStorage.setItem("sonaraProfileCreated", "true");
      window.location.href = getAccountRedirect(data.account || data.profile);
    } catch (error) {
      console.error("Erreur connexion sécurisée :", error);

      if (waitingForCode) {
        setFieldMessage(codeInput, error.message || "Code incorrect ou expiré.", "error");
        codeField.hidden = false;
        loginBtn.textContent = "Valider le code";
      } else {
        setFieldMessage(mailInput, error.message || "Impossible d'envoyer le code.", "error");
        setFieldMessage(passwordInput, "Vérifiez votre mot de passe.", "error");
        setFieldMessage(phoneInput, "Vérifiez votre numéro de téléphone.", "error");
        loginBtn.textContent = "Envoyer le code de vérification";
      }
    } finally {
      submitting = false;
      updateLoginButtonState();
    }
  });

  updateLoginButtonState();
}

renderChoicePage();



