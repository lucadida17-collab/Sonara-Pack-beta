const appLayout = document.querySelector(".app-layout");

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



function showAccountPopup({
  title = "Information",
  message = "",
  type = "info",
  buttonText = "Fermer",
  onClose = null,
  locked = false
}) {
  const oldPopup = document.querySelector(".account-popup");

  if (oldPopup) {
    oldPopup.remove();
  }

  const popup = document.createElement("div");

  popup.className = `account-popup account-popup-${type}`;
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "true");
  document.body.classList.add("account-popup-open");

  popup.innerHTML = `
    <div class="account-popup-content">

      <div class="account-popup-icon">
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

      <h2 class="account-popup-title">
        ${title}
      </h2>

      <p class="account-popup-message">
        ${message}
      </p>

      <button
        type="button"
        class="account-popup-button"
      >
        ${buttonText}
      </button>

    </div>
  `;

  document.body.appendChild(popup);

  lucide.createIcons();

  const closeButton = popup.querySelector(
    ".account-popup-button"
  );

  function closePopup() {
    document.body.classList.remove("account-popup-open");
    popup.remove();

    if (typeof onClose === "function") {
      onClose();
    }
  }

  closeButton.addEventListener("click", closePopup);

  popup.addEventListener("click", (event) => {
    if (!locked && event.target === popup) {
      closePopup();
    }
  });
}


function getStoredProfile() {
  try {
    return JSON.parse(
      localStorage.getItem("sonaraProfile")
    ) || {};
  } catch (error) {
    console.error(
      "Impossible de récupérer le compte :",
      error
    );

    return {};
  }
}

const KNOWN_ACCOUNTS_STORAGE_KEY = "sonaraKnownAccounts";
const KNOWN_ACCOUNTS_LIMIT = 50;

function getKnownAccountKey(profile = {}) {
  const userId = String(profile.userId || "").trim();
  const accountId = String(
    profile.accountId ||
    profile.id ||
    ""
  ).trim();

  return userId && accountId
    ? `${userId}:${accountId}`
    : "";
}

function sanitizeKnownAccount(profile = {}) {
  const key = getKnownAccountKey(profile);

  if (!key) {
    return null;
  }

  const safeProfile = {
    ...profile,
    userId: String(profile.userId),
    accountId: String(
      profile.accountId ||
      profile.id
    )
  };

  [
    "password",
    "verificationToken",
    "token",
    "accessToken",
    "refreshToken"
  ].forEach((field) => {
    delete safeProfile[field];
  });

  return safeProfile;
}

function getKnownAccounts() {
  try {
    const storedAccounts = JSON.parse(
      sessionStorage.getItem(
        KNOWN_ACCOUNTS_STORAGE_KEY
      )
    );

    if (!Array.isArray(storedAccounts)) {
      return [];
    }

    const uniqueAccounts = new Map();

    storedAccounts.forEach((profile) => {
      const safeProfile =
        sanitizeKnownAccount(profile);

      if (!safeProfile) {
        return;
      }

      const key =
        getKnownAccountKey(safeProfile);

      uniqueAccounts.set(
        key,
        uniqueAccounts.has(key)
          ? {
              ...uniqueAccounts.get(key),
              ...safeProfile
            }
          : safeProfile
      );
    });

    return [
      ...uniqueAccounts.values()
    ].slice(0, KNOWN_ACCOUNTS_LIMIT);
  } catch (error) {
    console.error(
      "Impossible de récupérer les comptes mémorisés :",
      error
    );

    return [];
  }
}

function saveKnownAccounts(accounts = []) {
  const uniqueAccounts = new Map();

  accounts.forEach((profile) => {
    const safeProfile =
      sanitizeKnownAccount(profile);

    if (!safeProfile) {
      return;
    }

    const key =
      getKnownAccountKey(safeProfile);

    uniqueAccounts.set(
      key,
      uniqueAccounts.has(key)
        ? {
            ...uniqueAccounts.get(key),
            ...safeProfile
          }
        : safeProfile
    );
  });

  const savedAccounts = [
    ...uniqueAccounts.values()
  ].slice(0, KNOWN_ACCOUNTS_LIMIT);

  try {
    sessionStorage.setItem(
      KNOWN_ACCOUNTS_STORAGE_KEY,
      JSON.stringify(savedAccounts)
    );
  } catch (error) {
    console.error(
      "Impossible de mémoriser les comptes :",
      error
    );
  }

  return savedAccounts;
}

function rememberKnownAccounts(accounts = []) {
  const knownAccounts =
    getKnownAccounts();

  const indexesByKey = new Map(
    knownAccounts.map(
      (profile, index) => [
        getKnownAccountKey(profile),
        index
      ]
    )
  );

  accounts.forEach((profile) => {
    const safeProfile =
      sanitizeKnownAccount(profile);

    if (!safeProfile) {
      return;
    }

    const key =
      getKnownAccountKey(safeProfile);

    if (indexesByKey.has(key)) {
      const index = indexesByKey.get(key);

      knownAccounts[index] = {
        ...knownAccounts[index],
        ...safeProfile
      };

      return;
    }

    indexesByKey.set(
      key,
      knownAccounts.length
    );

    knownAccounts.push(safeProfile);
  });

  return saveKnownAccounts(
    knownAccounts
  );
}

function rememberKnownAccount(profile = {}) {
  return rememberKnownAccounts([profile]);
}


const ACCOUNT_PASSWORD_MIN_LENGTH = 8;
const ACCOUNT_PASSWORD_MAX_LENGTH = 128;

function ensureAccountValidationContainer(input) {
  let container = input.closest(
    ".account-password-field, .account-validation-field, .account-field"
  );

  if (!container) {
    container = document.createElement("div");
    container.className = "account-validation-field";
    input.parentNode.insertBefore(container, input);
    container.appendChild(input);
  }

  return container;
}

function getAccountFieldKey(input) {
  if (input.classList.contains("add-account-mail")) return "mail";
  if (input.classList.contains("add-account-password")) return "password";
  if (input.classList.contains("add-account-pseudo")) return "pseudo";
  if (input.classList.contains("connect-account-mail")) return "connect-mail";
  if (input.classList.contains("connect-account-password")) return "connect-password";
  if (input.classList.contains("connect-account-phone")) return "connect-phone";
  if (input.classList.contains("connect-account-code")) return "connect-code";
  if (input.classList.contains("add-account-code")) return "add-account-code";
  return input.name || "field";
}

function setAccountFieldMessage(input, message = "", type = "") {
  if (!input) return;

  const container = ensureAccountValidationContainer(input);
  const fieldKey = getAccountFieldKey(input);
  const form = input.closest("form");
  const selector = `.account-field-message[data-for="${fieldKey}"]`;
  const existingMessages = form
    ? [...form.querySelectorAll(selector)]
    : [...container.querySelectorAll(selector)];

  let fieldMessage = existingMessages.find(
    (element) => element.parentElement === container
  ) || existingMessages[0];

  if (!fieldMessage) {
    fieldMessage = document.createElement("p");
  }

  existingMessages.forEach((element) => {
    if (element !== fieldMessage) element.remove();
  });

  if (fieldMessage.parentElement !== container) {
    container.appendChild(fieldMessage);
  }

  fieldMessage.textContent = message;
  fieldMessage.dataset.for = fieldKey;
  fieldMessage.className = `account-field-message${type ? ` account-field-message-${type}` : ""}`;
  input.classList.toggle("input-error", type === "error");
  input.classList.toggle("input-success", type === "success");
}

function setupAccountPasswordExperience(form, selector) {
  const input = form.querySelector(selector);

  if (!input || input.dataset.accountPasswordExperienceBound === "true") {
    return;
  }
  input.dataset.accountPasswordExperienceBound = "true";

  input.minLength = ACCOUNT_PASSWORD_MIN_LENGTH;
  input.maxLength = ACCOUNT_PASSWORD_MAX_LENGTH;
  input.autocomplete = "new-password";

  const field = document.createElement("div");
  field.className = "account-validation-field account-password-field";
  input.parentNode.insertBefore(field, input);

  const inputRow = document.createElement("div");
  inputRow.className = "account-password-input-row";
  field.appendChild(inputRow);
  inputRow.appendChild(input);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "account-password-toggle";
  toggle.setAttribute("aria-label", "Afficher le mot de passe");
  toggle.innerHTML = '<i data-lucide="eye"></i>';
  inputRow.appendChild(toggle);

  setAccountFieldMessage(
    input,
    `${ACCOUNT_PASSWORD_MIN_LENGTH} caractères minimum`
  );

  input.addEventListener("input", () => {
    const length = input.value.length;

    const remaining = Math.max(ACCOUNT_PASSWORD_MIN_LENGTH - length, 0);

    if (length === 0) {
      setAccountFieldMessage(
        input,
        `${ACCOUNT_PASSWORD_MIN_LENGTH} caractères minimum`
      );
      return;
    }

    if (remaining > 0) {
      setAccountFieldMessage(
        input,
        `${remaining} caractère${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""}`,
        "error"
      );
      return;
    }

    setAccountFieldMessage(input, "Vérification du mot de passe…");
  });

  toggle.addEventListener("click", () => {
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    toggle.setAttribute(
      "aria-label",
      visible ? "Afficher le mot de passe" : "Masquer le mot de passe"
    );
    toggle.innerHTML = `<i data-lucide="${visible ? "eye" : "eye-off"}"></i>`;
    lucide.createIcons();
    input.focus();
  });

  lucide.createIcons();
}

function clearAddAccountFieldErrors(form) {
  form
    .querySelectorAll(".account-field-message-error")
    .forEach((message) => {
      message.textContent = "";
      message.className = "account-field-message";
    });

  form
    .querySelectorAll(".input-error")
    .forEach((input) => {
      input.classList.remove("input-error");
    });
}

function applyAddAccountFieldErrors(form, fieldErrors = {}) {
  const selectors = {
    mail: ".add-account-mail",
    pseudo: ".add-account-pseudo",
    password: ".add-account-password"
  };

  let firstInvalidInput = null;

  Object.entries(fieldErrors).forEach(([field, message]) => {
    const input = form.querySelector(selectors[field]);

    if (!input) {
      return;
    }

    setAccountFieldMessage(
      input,
      message,
      "error"
    );

    form._blockedAccountFields?.add(field);

    if (!firstInvalidInput) {
      firstInvalidInput = input;
    }
  });

  form._updateAccountSubmitState?.();

  return firstInvalidInput;
}


async function checkAddAccountFieldAvailability(form, field) {
  const inputs = {
    mail: form.querySelector(".add-account-mail"),
    pseudo: form.querySelector(".add-account-pseudo"),
    password: form.querySelector(".add-account-password")
  };

  const input = inputs[field];
  if (!input) return;

  const rawValue = field === "password" ? input.value : input.value.trim();

  const canCheck =
    field === "mail"
      ? rawValue !== "" && input.checkValidity()
      : field === "pseudo"
        ? rawValue !== ""
        : rawValue.length >= ACCOUNT_PASSWORD_MIN_LENGTH && rawValue.length <= ACCOUNT_PASSWORD_MAX_LENGTH;

  if (!canCheck) {
    form._accountAvailability[field] = "unknown";
    form._updateAccountSubmitState?.();
    return;
  }

  const requestId = (form._accountRequestIds[field] || 0) + 1;
  form._accountRequestIds[field] = requestId;
  form._accountAvailability[field] = "pending";
  form._updateAccountSubmitState?.();

  try {
    const response = await fetch(`${API_URL}/api/account-security/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: rawValue })
    });
    const data = await response.json();

    if (form._accountRequestIds[field] !== requestId) return;
    if (!response.ok || !data.success) {
      form._accountAvailability[field] = "unknown";
      form._updateAccountSubmitState?.();
      return;
    }

    const errorMessage = data.fieldErrors?.[field];

    if (errorMessage) {
      setAccountFieldMessage(input, errorMessage, "error");
      form._blockedAccountFields.add(field);
      form._accountAvailability[field] = "error";
    } else {
      const successMessages = {
        mail: "Adresse e-mail disponible.",
        pseudo: "Pseudo disponible.",
        password: "Mot de passe disponible."
      };
      setAccountFieldMessage(input, successMessages[field], "success");
      form._blockedAccountFields.delete(field);
      form._accountAvailability[field] = "valid";
    }

    form._updateAccountSubmitState?.();
  } catch (error) {
    if (form._accountRequestIds[field] !== requestId) return;
    form._accountAvailability[field] = "unknown";
    form._updateAccountSubmitState?.();
    console.error(`Erreur vérification ${field} ajout compte :`, error);
  }
}

async function sendAddAccountVerificationCode({ form, profile, userId }) {
  const sendResponse = await fetch(`${API_URL}/api/account-security/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mail: profile.mail,
      pseudo: profile.pseudo,
      password: profile.password,
      purpose: "add-account",
      userId
    })
  });
  const sendData = await sendResponse.json();

  if (!sendResponse.ok || !sendData.success) {
    applyAddAccountFieldErrors(form, sendData.fieldErrors || {});
    throw new Error(sendData.message || "Impossible d'envoyer le code.");
  }
}

async function verifyAddAccountCode({ profile, userId, code }) {
  const verifyResponse = await fetch(`${API_URL}/api/account-security/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mail: profile.mail,
      code,
      purpose: "add-account",
      userId
    })
  });
  const verifyData = await verifyResponse.json();

  if (!verifyResponse.ok || !verifyData.success || !verifyData.verificationToken) {
    throw new Error(verifyData.message || "Code incorrect ou expiré.");
  }

  return verifyData.verificationToken;
}

function setupAddAccountSubmitProtection(form) {
  if (form.dataset.accountProtectionBound === "true") return;
  form.dataset.accountProtectionBound = "true";

  const submitButton = form.querySelector(".add-account-submit-button");

  let codeField = form.querySelector(".add-account-code-field");
  if (!codeField) {
    codeField = document.createElement("div");
    codeField.className = "account-validation-field add-account-code-field";
    codeField.hidden = true;
    codeField.innerHTML = `
      <input type="text" class="account-input add-account-code" placeholder="Code à 6 chiffres" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <p class="account-field-message" data-for="add-account-code"></p>
    `;
    submitButton.parentNode.insertBefore(codeField, submitButton);
  }
  const codeInput = codeField.querySelector(".add-account-code");

  const watchedFields = {
    mail: form.querySelector(".add-account-mail"),
    pseudo: form.querySelector(".add-account-pseudo"),
    password: form.querySelector(".add-account-password")
  };

  form._blockedAccountFields = new Set();
  form._accountSubmitting = false;
  form._accountAvailability = {
    mail: "unknown",
    pseudo: "unknown",
    password: "unknown"
  };
  form._accountRequestIds = { mail: 0, pseudo: 0, password: 0 };
  form._accountWaitingForCode = false;
  form._accountOriginalButtonText = submitButton.textContent;

  const availabilityTimers = {};

  const scheduleAvailabilityCheck = (field) => {
    clearTimeout(availabilityTimers[field]);
    availabilityTimers[field] = setTimeout(() => {
      checkAddAccountFieldAvailability(form, field);
    }, 450);
  };

  const updateSubmitState = () => {
    const password = watchedFields.password?.value || "";
    const passwordValid =
      password.length >= ACCOUNT_PASSWORD_MIN_LENGTH &&
      password.length <= ACCOUNT_PASSWORD_MAX_LENGTH;

    const allCheckedAndAvailable = Object.values(
      form._accountAvailability
    ).every((status) => status === "valid");

    if (form._accountWaitingForCode) {
      submitButton.disabled =
        form._accountSubmitting ||
        !/^\d{6}$/.test(codeInput.value.trim());
      return;
    }

    submitButton.disabled =
      form._accountSubmitting ||
      !form.checkValidity() ||
      !passwordValid ||
      form._blockedAccountFields.size > 0 ||
      !allCheckedAndAvailable;
  };

  form._updateAccountSubmitState = updateSubmitState;

  Object.entries(watchedFields).forEach(([field, input]) => {
    input?.addEventListener("input", () => {
      if (form._accountWaitingForCode) {
        form._accountWaitingForCode = false;
        codeField.hidden = true;
        codeInput.value = "";
        setAccountFieldMessage(codeInput);
        submitButton.textContent = form._accountOriginalButtonText;
      }
      form._blockedAccountFields.delete(field);
      form._accountAvailability[field] = "unknown";

      if (field !== "password") {
        setAccountFieldMessage(input);
      }

      updateSubmitState();
      scheduleAvailabilityCheck(field);
    });
  });

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    setAccountFieldMessage(codeInput);
    updateSubmitState();
  });

  form.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updateSubmitState);
    input.addEventListener("change", updateSubmitState);
  });

  updateSubmitState();
}

function renderAccount() {
  appLayout.innerHTML = `
    <section class="settings-page">

      <header class="settings-header">

        <button
          type="button"
          class="settings-back-button"
          aria-label="Retour"
        >
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="settings-title">
          Compte créateur
        </h1>

        <div class="settings-header-space"></div>

      </header>

      <div class="settings-content">

        <div class="settings-group">

          <button
            type="button"
            class="settings-row"
            data-account="informations"
          >
            <span class="settings-row-left">
              <i data-lucide="user-round"></i>
              <span>Informations du compte</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

          <button
            type="button"
            class="settings-row"
            data-account="email"
          >
            <span class="settings-row-left">
              <i data-lucide="mail"></i>
              <span>Adresse e-mail</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

          <button
            type="button"
            class="settings-row"
            data-account="password"
          >
            <span class="settings-row-left">
              <i data-lucide="lock-keyhole"></i>
              <span>Mot de passe</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

        </div>

        <div class="settings-group">

          <button
            type="button"
            class="settings-row"
            data-account="addAccount"
          >
            <span class="settings-row-left">
              <i data-lucide="user-round-plus"></i>
              <span>Compte</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

          <button
            type="button"
            class="settings-row settings-row-danger"
            data-account="logout"
          >
            <span class="settings-row-left">
              <i data-lucide="log-out"></i>
              <span>Se déconnecter</span>
            </span>

            <i
              data-lucide="chevron-right"
              class="settings-chevron"
            ></i>
          </button>

        </div>

      </div>

    </section>
  `;

  lucide.createIcons();

  document
    .querySelector(".settings-back-button")
    .addEventListener("click", () => {
      window.location.href = "settings-creator.html";
    });

  document
    .querySelectorAll(".settings-row")
    .forEach((row) => {
      row.addEventListener("click", () => {
        renderAccountPage(row.dataset.account);
      });
    });
}

function renderAccountPage(accountKey) {
  switch (accountKey) {
    case "informations":
      renderAccountInformations();
      break;

    case "email":
      renderAccountEmail();
      break;

    case "password":
      renderAccountPassword();
      break;

    case "addAccount":
      renderAddAccount();
      break;

    case "logout":
      renderLogout();
      break;

    default:
      renderAccount();
  }
}

function renderAccountHeader(title) {
  return `
    <header class="settings-header">

      <button
        type="button"
        class="settings-back-button"
        aria-label="Retour"
      >
        <i data-lucide="arrow-left"></i>
      </button>

      <h1 class="settings-title">
        ${title}
      </h1>

      <div class="settings-header-space"></div>

    </header>
  `;
}

function activateAccountBackButton() {
  lucide.createIcons();

  document
    .querySelector(".settings-back-button")
    .addEventListener("click", renderAccount);
}

/* =========================
   INFORMATIONS DU COMPTE
========================= */

function renderAccountInformations() {
  const profile = getStoredProfile();

  const firstname = profile.firstname || "";
  const lastname = profile.lastname || "";
  const date = profile.date || "";
  const phone = profile.phone || "";

  appLayout.innerHTML = `
    <section class="account-page">

      ${renderAccountHeader("Informations du compte")}

      <div class="account-content">

        <form class="account-form account-information-form">

          <div class="account-field">
            <label
              class="account-label"
              for="account-firstname"
            >
              Prénom
            </label>

            <input
              type="text"
              id="account-firstname"
              class="account-input"
              value="${firstname}"
              autocomplete="given-name"
            >
          </div>

          <div class="account-field">
            <label
              class="account-label"
              for="account-lastname"
            >
              Nom
            </label>

            <input
              type="text"
              id="account-lastname"
              class="account-input"
              value="${lastname}"
              autocomplete="family-name"
            >
          </div>

          <div class="account-field">
            <label
              class="account-label"
              for="account-date"
            >
              Date de naissance
            </label>

            <input
              type="date"
              id="account-date"
              class="account-input"
              value="${date}"
            >
          </div>

          <div class="account-field">
            <label
              class="account-label"
              for="account-phone"
            >
              Téléphone
            </label>

            <input
              type="tel"
              id="account-phone"
              class="account-input"
              value="${phone}"
              autocomplete="tel"
            >
          </div>

          <button
            type="submit"
            class="account-save-button"
          >
            Enregistrer
          </button>

        </form>

      </div>

    </section>
  `;

  activateAccountBackButton();

  const form = document.querySelector(
    ".account-information-form"
  );

  form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const storedProfile = getStoredProfile();

  const firstname = document
    .querySelector("#account-firstname")
    .value
    .trim();

  const lastname = document
    .querySelector("#account-lastname")
    .value
    .trim();

  const date = document
    .querySelector("#account-date")
    .value;

  const phone = document
    .querySelector("#account-phone")
    .value
    .trim();

  const saveButton = document.querySelector(
    ".account-save-button"
  );

  if (!storedProfile?.id) {
    showAccountPopup({
      title: "Modification impossible",
      message:
        "Impossible d'identifier votre compte. Veuillez réessayer.",
      type: "error"
    });

    return;
  }

  if (!firstname || !lastname) {
    showAccountPopup({
      title: "Champs incomplets",
      message:
        "Le prénom et le nom sont obligatoires.",
      type: "warning"
    });

    return;
  }

  try {
    saveButton.disabled = true;
    saveButton.textContent = "Enregistrement...";

    const response = await fetch(
      `${API_URL}/api/account/informations`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          id: String(storedProfile.id),
          firstname,
          lastname,
          date,
          phone
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      showAccountPopup({
        title: "Enregistrement impossible",
        message:
          result.message ||
          "Impossible de modifier les informations. Veuillez réessayer.",
        type: "error"
      });

      saveButton.disabled = false;
      saveButton.textContent = "Enregistrer";

      return;
    }

    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(result.account)
    );

    showAccountPopup({
      title: "Informations enregistrées",
      message:
        "Les informations de votre compte ont été mises à jour.",
      type: "success",
      buttonText: "Continuer",
      onClose: renderAccount
    });

  } catch (error) {
    console.error(
      "Erreur modification informations du compte :",
      error
    );

    showAccountPopup({
      title: "Erreur de connexion",
      message:
        "Impossible de contacter le serveur. Veuillez réessayer.",
      type: "error"
    });

    saveButton.disabled = false;
    saveButton.textContent = "Enregistrer";
  }
});

}

/* =========================
   ADRESSE E-MAIL
========================= */

function renderAccountEmail() {
  const profile = getStoredProfile();

  const currentEmail = profile.mail || profile.email || "";

  appLayout.innerHTML = `
    <section class="account-page">

      ${renderAccountHeader("Adresse e-mail")}

      <div class="account-content">

        <form class="account-form account-email-form">

          <div class="account-info-block">

            <span class="account-info-label">
              Adresse e-mail actuelle
            </span>

            <span class="account-info-value">
              ${currentEmail || "Aucune adresse e-mail"}
            </span>

          </div>

          <div class="account-field account-field-column">

            <label
              class="account-label"
              for="account-new-email"
            >
              Nouvelle adresse e-mail
            </label>

            <input
              type="email"
              id="account-new-email"
              class="account-input"
              autocomplete="email"
              placeholder="Nouvelle adresse e-mail"
            >

          </div>

          <div class="account-field account-field-column">

            <label
              class="account-label"
              for="account-email-password"
            >
              Mot de passe
            </label>

            <input
              type="password"
              id="account-email-password"
              class="account-input"
              autocomplete="current-password"
              placeholder="Confirmer avec votre mot de passe"
            >

          </div>

          <button
            type="submit"
            class="account-save-button"
          >
            Modifier l’adresse e-mail
          </button>

        </form>

      </div>

    </section>
  `;

  activateAccountBackButton();

  document
  .querySelector(".account-email-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const storedProfile = getStoredProfile();

    const newMail = document
      .querySelector("#account-new-email")
      .value
      .trim();

    const currentPassword = document
      .querySelector("#account-email-password")
      .value;

    const saveButton = document.querySelector(
      ".account-save-button"
    );

    if (!storedProfile?.id) {
      showAccountPopup({
        title: "Modification impossible",
        message:
          "Impossible d'identifier votre compte. Veuillez réessayer.",
        type: "error"
      });

      return;
    }

    if (!newMail || !currentPassword) {
      showAccountPopup({
        title: "Champs incomplets",
        message: "Veuillez remplir tous les champs.",
        type: "warning"
      });

      return;
    }

    try {
      saveButton.disabled = true;
      saveButton.textContent = "Enregistrement...";

      const response = await fetch(
        `${API_URL}/api/account/email`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            id: String(storedProfile.id),
            newMail,
            currentPassword
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        showAccountPopup({
          title: "Modification impossible",
          message:
            result.message ||
            "Impossible de modifier l'adresse e-mail. Veuillez réessayer.",
          type: "error"
        });

        saveButton.disabled = false;
        saveButton.textContent =
          "Modifier l’adresse e-mail";

        return;
      }

      localStorage.setItem(
        "sonaraProfile",
        JSON.stringify(result.account)
      );

      showAccountPopup({
        title: "Adresse e-mail modifiée",
        message:
          "Votre nouvelle adresse e-mail a été enregistrée.",
        type: "success",
        buttonText: "Continuer",
        onClose: renderAccount
      });

    } catch (error) {
      console.error(
        "Erreur modification adresse e-mail :",
        error
      );

      showAccountPopup({
        title: "Erreur de connexion",
        message:
          "Impossible de contacter le serveur. Veuillez réessayer.",
        type: "error"
      });

      saveButton.disabled = false;
      saveButton.textContent =
        "Modifier l’adresse e-mail";
    }
  });

}

/* =========================
   MOT DE PASSE
========================= */

function renderAccountPassword() {
  appLayout.innerHTML = `
    <section class="account-page">

      ${renderAccountHeader("Mot de passe")}

      <div class="account-content">

        <form class="account-form account-password-form">

          <div class="account-field account-field-column">

            <label
              class="account-label"
              for="account-current-password"
            >
              Mot de passe actuel
            </label>

            <input
              type="password"
              id="account-current-password"
              class="account-input"
              autocomplete="current-password"
              placeholder="Mot de passe actuel"
            >

          </div>

          <div class="account-field account-field-column">

            <label
              class="account-label"
              for="account-new-password"
            >
              Nouveau mot de passe
            </label>

            <input
              type="password"
              id="account-new-password"
              class="account-input"
              autocomplete="new-password"
              placeholder="Nouveau mot de passe"
            >

          </div>

          <div class="account-field account-field-column">

            <label
              class="account-label"
              for="account-confirm-password"
            >
              Confirmer le mot de passe
            </label>

            <input
              type="password"
              id="account-confirm-password"
              class="account-input"
              autocomplete="new-password"
              placeholder="Confirmer le nouveau mot de passe"
            >

          </div>

          <button
            type="submit"
            class="account-save-button"
          >
            Modifier le mot de passe
          </button>

        </form>

      </div>

    </section>
  `;

  activateAccountBackButton();

document
  .querySelector(".account-password-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const storedProfile = getStoredProfile();

    const currentPassword = document
      .querySelector("#account-current-password")
      .value;

    const newPassword = document
      .querySelector("#account-new-password")
      .value;

    const confirmPassword = document
      .querySelector("#account-confirm-password")
      .value;

    const saveButton = document.querySelector(
      ".account-save-button"
    );

    if (!storedProfile?.id) {
      showAccountPopup({
        title: "Modification impossible",
        message: "Impossible d'identifier votre compte. Veuillez réessayer.",
        type: "error"
      });

      return;
    }

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      showAccountPopup({
        title: "Champs incomplets",
        message: "Veuillez remplir tous les champs.",
        type: "warning"
      });

      return;
    }

    if (newPassword !== confirmPassword) {
      showAccountPopup({
        title: "Mots de passe différents",
        message: "Les nouveaux mots de passe ne correspondent pas.",
        type: "warning"
      });

      return;
    }

    try {
      saveButton.disabled = true;
      saveButton.textContent = "Enregistrement...";

      const response = await fetch(
        `${API_URL}/api/account/password`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            id: String(storedProfile.id),
            type: "password",
            currentPassword,
            newPassword
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        showAccountPopup({
          title: "Modification impossible",
          message:
            result.message ||
            "Impossible de modifier le mot de passe. Veuillez réessayer.",
          type: "error"
        });

        saveButton.disabled = false;
        saveButton.textContent = "Modifier le mot de passe";

        return;
      }

      showAccountPopup({
        title: "Mot de passe modifié",
        message: "Votre mot de passe a été modifié avec succès.",
        type: "success",
        buttonText: "Continuer",
        onClose: renderAccount
      });

    } catch (error) {
      console.error(
        "Erreur modification mot de passe :",
        error
      );

      showAccountPopup({
        title: "Erreur de connexion",
        message: "Impossible de contacter le serveur. Veuillez réessayer.",
        type: "error"
      });

      saveButton.disabled = false;
      saveButton.textContent = "Modifier le mot de passe";
    }
  });

}
/* =========================
   AJOUTER UN COMPTE
========================= */

function escapeKnownAccountHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderKnownAccountRows(
  accountsList,
  accounts,
  currentProfile
) {
  const safeAccounts = saveKnownAccounts(
    accounts
  );

  if (safeAccounts.length === 0) {
    accountsList.innerHTML = `
      <p class="account-profile-name">
        Aucun compte mémorisé.
      </p>
    `;

    lucide.createIcons();
    return;
  }

  const currentAccountKey =
    getKnownAccountKey(currentProfile);

  const accountsByKey = new Map(
    safeAccounts.map((account) => [
      getKnownAccountKey(account),
      account
    ])
  );

  accountsList.innerHTML = safeAccounts
    .map((account) => {
      const accountKey =
        getKnownAccountKey(account);

      const isCurrent =
        accountKey === currentAccountKey;

      const pseudo =
        account.pseudo ||
        account.artistname ||
        "Utilisateur";

      const imageProfile =
        account.imageProfile || "";

      const imageProfileUrl =
        `${API_URL}/uploads/${imageProfile}`;

      return `
        <button
          type="button"
          class="account-profile-row${isCurrent ? " account-profile-row-current" : ""}"
          data-user-id="${escapeKnownAccountHtml(account.userId)}"
          data-account-id="${escapeKnownAccountHtml(account.accountId)}"
          ${isCurrent ? `aria-current="true"` : ""}
        >
          <div class="account-profile-image">
            ${imageProfile
              ? `<img src="${escapeKnownAccountHtml(imageProfileUrl)}" alt="${escapeKnownAccountHtml(pseudo)}">`
              : `<i data-lucide="user-round"></i>`}
          </div>
          <span class="account-profile-name">${escapeKnownAccountHtml(pseudo)}</span>
          ${isCurrent
            ? `<i data-lucide="circle-check-big" class="account-current-icon"></i>`
            : ""}
        </button>
      `;
    })
    .join("");

  accountsList
    .querySelectorAll(".account-profile-row")
    .forEach((row) => {
      row.addEventListener("click", async () => {
        const targetUserId =
          row.dataset.userId;

        const targetAccountId =
          row.dataset.accountId;

        const targetKey =
          `${targetUserId}:${targetAccountId}`;

        if (targetKey === currentAccountKey) {
          return;
        }

        row.disabled = true;

        try {
          let nextProfile = null;

          if (
            String(targetUserId) ===
            String(currentProfile.userId)
          ) {
            const switchResponse = await fetch(
              `${API_URL}/api/accounts/switch`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  userId: String(
                    currentProfile.userId
                  ),
                  currentAccountId: String(
                    currentProfile.accountId
                  ),
                  targetAccountId: String(
                    targetAccountId
                  )
                })
              }
            );

            const switchData =
              await switchResponse.json();

            if (
              !switchResponse.ok ||
              !switchData.success ||
              !switchData.profile
            ) {
              throw new Error(
                switchData.error ||
                "Changement de compte impossible."
              );
            }

            nextProfile =
              switchData.profile;
          } else {
            const targetResponse = await fetch(
              `${API_URL}/api/accounts/list`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  userId: String(
                    targetUserId
                  ),
                  currentAccountId: String(
                    targetAccountId
                  )
                })
              }
            );

            const targetData =
              await targetResponse.json();

            if (
              !targetResponse.ok ||
              !targetData.success ||
              !Array.isArray(
                targetData.accounts
              )
            ) {
              throw new Error(
                targetData.error ||
                "Ce compte mémorisé n'est plus disponible."
              );
            }

            rememberKnownAccounts(
              targetData.accounts
            );

            nextProfile =
              targetData.accounts.find(
                (account) =>
                  getKnownAccountKey(account) ===
                  targetKey
              ) ||
              accountsByKey.get(targetKey);
          }

          if (!nextProfile) {
            throw new Error(
              "Compte mémorisé introuvable."
            );
          }

          rememberKnownAccount(nextProfile);

          window.SonaraSession.persist(
            window.SonaraSession.getToken(),
            nextProfile
          );

          window.location.href =
            getAccountRedirect(nextProfile);
        } catch (error) {
          console.error(
            "Erreur changement de compte :",
            error
          );

          row.disabled = false;

          showAccountPopup({
            title: "Changement impossible",
            message:
              error.message ||
              "Impossible de changer de compte.",
            type: "error"
          });
        }
      });
    });

  lucide.createIcons();
}

async function renderAddAccount() {
  const currentProfile = getStoredProfile();

  if (!currentProfile?.userId || !currentProfile?.accountId) {
    showAccountPopup({
      title: "Session introuvable",
      message: "Impossible de charger les comptes liés à cette session.",
      type: "error"
    });
    return;
  }

  rememberKnownAccount(currentProfile);

  appLayout.innerHTML = `
    <section class="account-page">
      ${renderAccountHeader("Compte")}
      <div class="account-content">
        <div class="accounts-list">
          <p class="account-profile-name">Chargement des comptes...</p>
        </div>
        <div class="account-actions">
          <button type="button" class="account-action-button add-account-button">
            <i data-lucide="user-round-plus"></i>
            <span>Ajouter un compte</span>
          </button>
          <button type="button" class="account-action-button connect-account-button">
            <i data-lucide="log-in"></i>
            <span>Se connecter à un compte existant</span>
          </button>
        </div>
      </div>
    </section>
  `;

  activateAccountBackButton();

  document.querySelector(".add-account-button")
    .addEventListener("click", renderAddAccountRoleChoice);

  document.querySelector(".connect-account-button")
    .addEventListener("click", renderConnectExistingAccount);

  try {
    const response = await fetch(`${API_URL}/api/accounts/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: String(currentProfile.userId),
        currentAccountId: String(currentProfile.accountId)
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success || !Array.isArray(data.accounts)) {
      throw new Error(data.error || "Impossible de charger les comptes.");
    }

    rememberKnownAccounts(data.accounts);

    renderKnownAccountRows(
      document.querySelector(".accounts-list"),
      getKnownAccounts(),
      currentProfile
    );
  } catch (error) {
    console.error("Erreur chargement comptes :", error);

    const knownAccounts =
      getKnownAccounts();

    if (knownAccounts.length > 0) {
      renderKnownAccountRows(
        document.querySelector(".accounts-list"),
        knownAccounts,
        currentProfile
      );
    } else {
      document.querySelector(
        ".accounts-list"
      ).innerHTML = `
        <p class="account-profile-name">
          Impossible de charger les comptes.
        </p>
      `;

      lucide.createIcons();
    }
  }
}

/* =========================
   SE CONNECTER À UN COMPTE EXISTANT
========================= */


function createExistingAccountLiveVerifier({
  mailInput,
  passwordInput,
  phoneInput,
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

    if (!mail) setAccountFieldMessage(mailInput);
    else if (!mailInput.checkValidity()) setAccountFieldMessage(mailInput, "Adresse e-mail invalide.", "error");
    else setAccountFieldMessage(mailInput, "Vérification de l’adresse e-mail…");

    if (!phone) setAccountFieldMessage(phoneInput);
    else setAccountFieldMessage(phoneInput, "Vérification du numéro…");

    if (password.length >= ACCOUNT_PASSWORD_MIN_LENGTH) {
      setAccountFieldMessage(passwordInput, "Vérification du mot de passe…");
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

        setAccountFieldMessage(
          mailInput,
          state.mail ? "Adresse e-mail reconnue." : "Adresse e-mail incorrecte.",
          state.mail ? "success" : "error"
        );

        if (phone) {
          setAccountFieldMessage(
            phoneInput,
            state.phone ? "Numéro de téléphone correct." : "Numéro de téléphone incorrect.",
            state.phone ? "success" : "error"
          );
        }

        if (password.length >= ACCOUNT_PASSWORD_MIN_LENGTH) {
          setAccountFieldMessage(
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

async function sendExistingAccountLoginVerificationCode({ mail, password, phone }) {
  const response = await fetch(`${API_URL}/api/accounts/login/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mail, password, phone })
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || "Impossible d'envoyer le code.");
  }
}

async function verifyExistingAccountLoginCode({ mail, code }) {
  const response = await fetch(`${API_URL}/api/account-security/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mail, code, purpose: "login-existing" })
  });
  const data = await response.json();

  if (!response.ok || !data.success || !data.verificationToken) {
    throw new Error(data.message || "Code incorrect ou expiré.");
  }

  return data.verificationToken;
}

function renderConnectExistingAccount() {
  appLayout.innerHTML = `
    <section class="account-page">
      ${renderAccountHeader("Compte existant")}
      <div class="account-content">
        <form class="account-form connect-existing-account-form" novalidate>
          <div class="account-validation-field">
            <input type="email" class="account-input connect-account-mail" placeholder="Adresse e-mail" autocomplete="email" required>
          </div>
          <div class="account-validation-field account-password-field">
            <div class="account-password-input-row">
              <input type="password" class="account-input connect-account-password" placeholder="Mot de passe" autocomplete="current-password" minlength="8" maxlength="128" required>
              <button type="button" class="account-password-toggle connect-account-password-toggle" aria-label="Afficher le mot de passe">
                <i data-lucide="eye"></i>
              </button>
            </div>
          </div>
          <div class="account-validation-field">
            <input type="tel" class="account-input connect-account-phone" placeholder="Téléphone" autocomplete="tel" required>
          </div>
          <div class="account-validation-field connect-code-field" hidden>
            <input type="text" class="account-input connect-account-code" placeholder="Code à 6 chiffres" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
          </div>
          <button type="submit" class="account-save-button connect-existing-account-submit" disabled>Envoyer le code de vérification</button>
        </form>
      </div>
    </section>
  `;

  lucide.createIcons();
  document.querySelector(".settings-back-button").addEventListener("click", renderAddAccount);

  const form = document.querySelector(".connect-existing-account-form");
  const submitButton = form.querySelector(".connect-existing-account-submit");
  const mailInput = form.querySelector(".connect-account-mail");
  const passwordInput = form.querySelector(".connect-account-password");
  const passwordToggle = form.querySelector(".connect-account-password-toggle");
  const phoneInput = form.querySelector(".connect-account-phone");
  const codeInput = form.querySelector(".connect-account-code");
  const codeField = form.querySelector(".connect-code-field");
  let waitingForCode = false;
  let submitting = false;
  let liveChecks = { mail: false, password: false, phone: false, pending: false };

  const resetCodeStep = () => {
    if (!waitingForCode) return;

    waitingForCode = false;
    codeField.hidden = true;
    codeInput.value = "";
    setAccountFieldMessage(codeInput);
    submitButton.textContent = "Envoyer le code de vérification";
  };

  passwordToggle.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    passwordToggle.setAttribute(
      "aria-label",
      isVisible ? "Afficher le mot de passe" : "Masquer le mot de passe"
    );
    passwordToggle.innerHTML = `<i data-lucide="${isVisible ? "eye" : "eye-off"}"></i>`;
    lucide.createIcons();
    passwordInput.focus();
  });

  const updateButtonState = () => {
    const credentialsReady = Boolean(
      mailInput.value.trim() &&
      mailInput.checkValidity() &&
      passwordInput.value.length >= ACCOUNT_PASSWORD_MIN_LENGTH &&
      passwordInput.value.length <= ACCOUNT_PASSWORD_MAX_LENGTH &&
      normalizeLoginPhone(phoneInput.value) &&
      liveChecks.mail &&
      liveChecks.password &&
      liveChecks.phone &&
      !liveChecks.pending
    );
    const codeReady = /^\d{6}$/.test(codeInput.value.trim());

    submitButton.disabled = submitting || (
      waitingForCode
        ? !codeReady
        : !credentialsReady
    );
  };

  const liveVerifier = createExistingAccountLiveVerifier({
    mailInput,
    passwordInput,
    phoneInput,
    onStateChange: (nextState) => {
      liveChecks = nextState;
      updateButtonState();
    }
  });

  [mailInput, passwordInput, phoneInput].forEach((input) => {
    input.addEventListener("input", () => {
      resetCodeStep();
      liveVerifier.schedule();
      updateButtonState();
    });
  });

  passwordInput.addEventListener("input", () => {
    const remaining = Math.max(0, ACCOUNT_PASSWORD_MIN_LENGTH - passwordInput.value.length);

    if (!passwordInput.value) {
      setAccountFieldMessage(passwordInput, `${ACCOUNT_PASSWORD_MIN_LENGTH} caractères minimum`);
    } else if (remaining > 0) {
      setAccountFieldMessage(
        passwordInput,
        `${remaining} caractère${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""}`,
        "error"
      );
    } else {
      setAccountFieldMessage(passwordInput, "Vérification du mot de passe…");
    }

    updateButtonState();
  });

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    setAccountFieldMessage(codeInput);
    updateButtonState();
  });

  setAccountFieldMessage(passwordInput, `${ACCOUNT_PASSWORD_MIN_LENGTH} caractères minimum`);
  updateButtonState();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const mail = mailInput.value.trim();
    const password = passwordInput.value;
    const phone = normalizeLoginPhone(phoneInput.value);

    if (
      !mail ||
      !mailInput.checkValidity() ||
      password.length < ACCOUNT_PASSWORD_MIN_LENGTH ||
      password.length > ACCOUNT_PASSWORD_MAX_LENGTH ||
      !phone
    ) {
      if (!mail || !mailInput.checkValidity()) {
        setAccountFieldMessage(mailInput, "Adresse e-mail valide obligatoire.", "error");
      }
      if (
        password.length < ACCOUNT_PASSWORD_MIN_LENGTH ||
        password.length > ACCOUNT_PASSWORD_MAX_LENGTH
      ) {
        setAccountFieldMessage(
          passwordInput,
          `Le mot de passe doit contenir entre ${ACCOUNT_PASSWORD_MIN_LENGTH} et ${ACCOUNT_PASSWORD_MAX_LENGTH} caractères.`,
          "error"
        );
      }
      if (!phone) {
        setAccountFieldMessage(phoneInput, "Numéro de téléphone obligatoire.", "error");
      }
      updateButtonState();
      return;
    }

    try {
      submitting = true;
      updateButtonState();

      if (!waitingForCode) {
        submitButton.textContent = "Envoi du code...";
        await sendExistingAccountLoginVerificationCode({ mail, password, phone });

        waitingForCode = true;
        codeField.hidden = false;
        setAccountFieldMessage(codeInput, `Code envoyé à ${mail}.`, "success");
        submitButton.textContent = "Valider le code";
        codeInput.focus();
        return;
      }

      submitButton.textContent = "Vérification...";
      const verificationToken = await verifyExistingAccountLoginCode({
        mail,
        code: codeInput.value.trim()
      });

      submitButton.textContent = "Connexion...";
      const response = await fetch(`${API_URL}/api/accounts/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mail, password, phone, verificationToken })
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.profile) {
        throw new Error(data.error || data.message || "Connexion impossible.");
      }

      if (!data.sessionToken || !window.SonaraSession) {
        throw new Error("La session sécurisée n'a pas été créée.");
      }

      if (
        String(data.profile.userId) !==
        String(currentProfile.userId)
      ) {
        sessionStorage.removeItem(KNOWN_ACCOUNTS_STORAGE_KEY);
      }

      rememberKnownAccount(data.profile);
      window.SonaraSession.persist(data.sessionToken, data.profile);
      window.location.href = getAccountRedirect(data.profile);
    } catch (error) {
      console.error("Erreur connexion compte existant sécurisée :", error);

      if (waitingForCode) {
        setAccountFieldMessage(
          codeInput,
          error.message || "Code incorrect ou expiré.",
          "error"
        );
        codeField.hidden = false;
        submitButton.textContent = "Valider le code";
      } else {
        setAccountFieldMessage(
          mailInput,
          error.message || "Impossible d'envoyer le code.",
          "error"
        );
        setAccountFieldMessage(passwordInput, "Vérifiez votre mot de passe.", "error");
        setAccountFieldMessage(phoneInput, "Vérifiez votre numéro de téléphone.", "error");
        submitButton.textContent = "Envoyer le code de vérification";
      }
    } finally {
      submitting = false;
      updateButtonState();
    }
  });
}


function renderAddAccountRoleChoice() {
  appLayout.innerHTML = `
    <section class="account-page">

      ${renderAccountHeader("Ajouter un compte")}

      <div class="account-content">

        <div class="add-account-role-choice">

          <button
            type="button"
            class="add-account-role-card"
            data-role="user"
          >
            <i data-lucide="user-round"></i>
            <span>Utilisateur</span>
          </button>

          <button
            type="button"
            class="add-account-role-card"
            data-role="artist"
          >
            <i data-lucide="music-2"></i>
            <span>Artiste</span>
          </button>

          <button
            type="button"
            class="add-account-role-card"
            data-role="both"
          >
            <i data-lucide="users-round"></i>
            <span>Les deux</span>
          </button>

        </div>

      </div>

    </section>
  `;

  lucide.createIcons();

  document
    .querySelector(".settings-back-button")
    .addEventListener("click", renderAddAccount);

  document
    .querySelectorAll(".add-account-role-card")
    .forEach((card) => {
      card.addEventListener("click", () => {
        renderAddAccountForm(card.dataset.role);
      });
    });
}

function renderAddAccountForm(role) {
  const isSeller =
    role === "artist" ||
    role === "both";

  const title =
    role === "user"
      ? "Compte utilisateur"
      : role === "artist"
        ? "Compte artiste"
        : "Compte utilisateur + artiste";

  appLayout.innerHTML = `
    <section class="account-page">

      ${renderAccountHeader(title)}

      <div class="account-content">

        <form class="account-form add-account-form">

          <input
            type="text"
            class="account-input add-account-firstname"
            placeholder="Prénom"
            required
          >

          <input
            type="text"
            class="account-input add-account-lastname"
            placeholder="Nom"
            required
          >

          <input
            type="date"
            class="account-input add-account-date"
            required
          >

          <input
            type="email"
            class="account-input add-account-mail"
            placeholder="Adresse e-mail"
            required
          >

          <input
            type="password"
            class="account-input add-account-password"
            placeholder="Mot de passe"
            minlength="8"
            maxlength="128"
            required
          >

          <input
            type="tel"
            class="account-input add-account-phone"
            placeholder="Téléphone"
          >

          <input
            type="text"
            class="account-input add-account-pseudo"
            placeholder="Pseudo${isSeller ? " / nom d’artiste" : ""}"
            required
          >

          <div class="profile-upload add-account-profile-upload">
            <div class="profile-avatar-upload add-account-avatar-upload">
              <i data-lucide="user" class="add-account-user-icon"></i>
              <i data-lucide="camera" class="add-account-camera-icon"></i>
            </div>

            <p>Choisir une photo de profil</p>

            <input
              type="file"
              class="add-account-image-input"
              name="imageProfile"
              accept="image/*"
              hidden
              required
            >
          </div>

          ${
            isSeller
              ? `
                <label class="checkbox-line">
                  <input type="checkbox" required>
                  Je confirme être majeur pour commencer à vendre
                </label>

                <label class="checkbox-line">
                  <input type="checkbox" required>
                  Je confirme posséder les droits des sons que je publierai
                </label>
              `
              : ""
          }

          <button
            type="submit"
            class="account-save-button add-account-submit-button"
          >
            Ajouter le compte
          </button>

        </form>

      </div>

    </section>
  `;

  lucide.createIcons();

  const addAccountForm = document.querySelector(".add-account-form");
  setupAccountPasswordExperience(
    addAccountForm,
    ".add-account-password"
  );

  setupAddAccountSubmitProtection(addAccountForm);

  document
    .querySelector(".settings-back-button")
    .addEventListener("click", renderAddAccountRoleChoice);

  const avatarUpload = document.querySelector(
    ".add-account-avatar-upload"
  );

  const imageProfileInput = document.querySelector(
    ".add-account-image-input"
  );

  const userIcon = document.querySelector(
    ".add-account-user-icon"
  );

  const cameraIcon = document.querySelector(
    ".add-account-camera-icon"
  );

  let previewImage = null;

  avatarUpload.addEventListener("click", () => {
    imageProfileInput.click();
  });

  imageProfileInput.addEventListener("change", () => {
    const file = imageProfileInput.files[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showAccountPopup({
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

  addAccountForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      clearAddAccountFieldErrors(addAccountForm);

      const currentProfile = getStoredProfile();

      if (!currentProfile?.userId) {
        showAccountPopup({
          title: "Ajout impossible",
          message:
            "Impossible d'identifier la racine de vos comptes. Veuillez vous reconnecter.",
          type: "error"
        });

        return;
      }

      const passwordInput = document.querySelector(
        ".add-account-password"
      );

      if (passwordInput.value.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
        setAccountFieldMessage(
          passwordInput,
          `Le mot de passe doit contenir au moins ${ACCOUNT_PASSWORD_MIN_LENGTH} caractères.`,
          "error"
        );
        passwordInput.focus();
        return;
      }

      if (passwordInput.value.length > ACCOUNT_PASSWORD_MAX_LENGTH) {
        setAccountFieldMessage(
          passwordInput,
          `Le mot de passe ne peut pas dépasser ${ACCOUNT_PASSWORD_MAX_LENGTH} caractères.`,
          "error"
        );
        passwordInput.focus();
        return;
      }

      const profile = {
        firstname: document
          .querySelector(".add-account-firstname")
          .value
          .trim(),

        lastname: document
          .querySelector(".add-account-lastname")
          .value
          .trim(),

        date: document
          .querySelector(".add-account-date")
          .value,

        mail: document
          .querySelector(".add-account-mail")
          .value
          .trim(),

        password: document
          .querySelector(".add-account-password")
          .value,

        phone: document
          .querySelector(".add-account-phone")
          .value
          .trim(),

        pseudo: document
          .querySelector(".add-account-pseudo")
          .value
          .trim(),

        role
      };

      const submitButton = document.querySelector(
        ".add-account-submit-button"
      );

      const formData = new FormData();

      formData.append(
        "userId",
        String(currentProfile.userId)
      );

      formData.append(
        "profile",
        JSON.stringify(profile)
      );

      if (imageProfileInput.files[0]) {
        formData.append(
          "imageProfile",
          imageProfileInput.files[0]
        );
      }

      try {
        addAccountForm._accountSubmitting = true;
        addAccountForm._updateAccountSubmitState?.();

        const codeField = addAccountForm.querySelector(".add-account-code-field");
        const codeInput = addAccountForm.querySelector(".add-account-code");

        if (!addAccountForm._accountWaitingForCode) {
          submitButton.textContent = "Envoi du code...";
          await sendAddAccountVerificationCode({
            form: addAccountForm,
            profile,
            userId: String(currentProfile.userId)
          });

          addAccountForm._accountWaitingForCode = true;
          addAccountForm._accountSubmitting = false;
          codeField.hidden = false;
          setAccountFieldMessage(codeInput, `Code envoyé à ${profile.mail}.`, "success");
          submitButton.textContent = "Valider le code";
          addAccountForm._updateAccountSubmitState?.();
          codeInput.focus();
          return;
        }

        submitButton.textContent = "Vérification...";
        const verificationToken = await verifyAddAccountCode({
          profile,
          userId: String(currentProfile.userId),
          code: codeInput.value.trim()
        });

        formData.append("verificationToken", verificationToken);
        submitButton.textContent = "Ajout...";

        const response = await fetch(
          `${API_URL}/api/accounts`,
          {
            method: "POST",
            body: formData
          }
        );

        const responseText = await response.text();
        let data = {};

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {};
        } catch (parseError) {
          console.error(
            "Réponse serveur invalide pendant l'ajout du compte :",
            parseError
          );
        }

        if (
          !response.ok ||
          !data.success ||
          !data.profile
        ) {
          const firstInvalidInput =
            applyAddAccountFieldErrors(
              addAccountForm,
              data.fieldErrors || {}
            );

          showAccountPopup({
            title: "Ajout impossible",
            message:
              data.message ||
              "Le compte n'a pas été ajouté. Vérifiez les informations puis réessayez.",
            type: "error",
            buttonText: "Fermer",
            locked: true,
            onClose: () => {
              addAccountForm._accountSubmitting = false;
              submitButton.textContent = "Ajouter le compte";
              addAccountForm._updateAccountSubmitState?.();
              firstInvalidInput?.focus();
            }
          });

          return;
        }

        rememberKnownAccount(data.profile);

        window.SonaraSession.persist(
          data.sessionToken ||
            window.SonaraSession.getToken(),
          data.profile
        );

        window.location.href = getAccountRedirect(data.profile);

      } catch (error) {
        console.error("Erreur ajout compte :", error);

        const codeInput = addAccountForm.querySelector(".add-account-code");
        if (addAccountForm._accountWaitingForCode) {
          setAccountFieldMessage(
            codeInput,
            error.message || "Code incorrect ou expiré.",
            "error"
          );
          submitButton.textContent = "Valider le code";
        } else {
          setAccountFieldMessage(
            addAccountForm.querySelector(".add-account-mail"),
            error.message || "Impossible d'envoyer le code.",
            "error"
          );
          submitButton.textContent = addAccountForm._accountOriginalButtonText || "Ajouter le compte";
        }

        addAccountForm._accountSubmitting = false;
        addAccountForm._updateAccountSubmitState?.();
      }
    });
}

/* =========================
   DÉCONNEXION
========================= */

function renderLogout() {
  appLayout.innerHTML = `
    <section class="account-page">

      ${renderAccountHeader("Se déconnecter")}

      <div class="account-content">

        <div class="account-message-card">

          <i
            data-lucide="log-out"
            class="account-message-icon"
          ></i>

          <h2 class="account-message-title">
            Se déconnecter ?
          </h2>

          <p class="account-message-text">
            Vous devrez vous reconnecter pour accéder
            de nouveau à votre compte Sonara Pack.
          </p>

          <button
            type="button"
            class="account-danger-button logout-confirm-button"
          >
            Se déconnecter
          </button>

          <button
            type="button"
            class="account-secondary-button logout-cancel-button"
          >
            Annuler
          </button>

        </div>

      </div>

    </section>
  `;

  activateAccountBackButton();

  document
    .querySelector(".logout-cancel-button")
    .addEventListener("click", renderAccount);

  document
    .querySelector(".logout-confirm-button")
    .addEventListener("click", async () => {
      if (window.SonaraSession) {
        await window.SonaraSession.logout();
      } else {
        sessionStorage.removeItem("sonaraSessionToken");
        sessionStorage.removeItem(KNOWN_ACCOUNTS_STORAGE_KEY);
        localStorage.removeItem("sonaraProfile");
        localStorage.removeItem("sonaraProfileCreated");
        localStorage.removeItem(KNOWN_ACCOUNTS_STORAGE_KEY);
      }

      window.location.href = "/index.html";
    });
}

renderAccount();
