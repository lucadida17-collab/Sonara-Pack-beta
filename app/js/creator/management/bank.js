const bankPage = document.querySelector(".bank-page");

function readSonaraProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null") || {};
  } catch (error) {
    console.error("Profil Sonara invalide :", error);
    return {};
  }
}

function getArtistId(profile = {}) {
  return profile.accountId || profile.id || "";
}

function stripeIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function stripeEscape(value = "") {
  const element = document.createElement("div");
  element.textContent = String(value);
  return element.innerHTML;
}

function showBankToast(message, type = "success") {
  let toast = document.querySelector(".bank-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "bank-toast";
    document.body.appendChild(toast);
  }

  toast.className = `bank-toast ${type}`;
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("show"));

  clearTimeout(showBankToast.timer);
  showBankToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`Réponse vide du serveur (${response.status}).`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse serveur invalide (${response.status}).`);
  }
}

async function fetchFreshArtistProfile() {
  const localProfile = readSonaraProfile();
  const artistId = getArtistId(localProfile);

  if (!artistId) {
    throw new Error("Identifiant artiste introuvable.");
  }

  const response = await fetch(
    `${API_URL}/api/profile/${encodeURIComponent(artistId)}`
  );

  const profile = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      profile.message ||
      profile.error ||
      "Impossible de récupérer le profil artiste."
    );
  }

  const mergedProfile = {
    ...localProfile,
    ...profile
  };

  localStorage.setItem(
    "sonaraProfile",
    JSON.stringify(mergedProfile)
  );

  return mergedProfile;
}


function persistCreatorStripeUnlock(account = {}, { replayAnimation = false } = {}) {
  if (String(account.stripeStatus || "").toLowerCase() !== "verified") return;

  const accountKey = account.accountId || account.id || "unknown";
  localStorage.setItem(`sonaraCreatorStripeUnlocked:${accountKey}`, "true");

  if (replayAnimation) {
    localStorage.removeItem(`sonaraCreatorStripeAnimationV5355:${accountKey}`);
  }

  const currentProfile = readSonaraProfile();
  localStorage.setItem(
    "sonaraProfile",
    JSON.stringify({
      ...currentProfile,
      ...account,
      canCreatePack: true,
      stripeVerified: true,
      stripeStatus: "verified"
    })
  );
}

function bankStatusMarkup(account = {}) {
  const stripeStatus = account.stripeStatus || "not_connected";
  const stripeAccountId = account.stripeAccountId || "";

  if (!stripeAccountId || stripeStatus === "not_connected") {
    return `
      <section class="bank-card">
        <i data-lucide="landmark"></i>
        <h2>Ajouter un compte bancaire</h2>
        <p>
          Sonara Pack utilise Stripe pour sécuriser les paiements
          et les versements destinés aux artistes.
        </p>
        <button type="button" class="bank-connect-btn">
          Connecter avec Stripe
        </button>
      </section>
    `;
  }

  if (stripeStatus === "verified") {
    return `
      <section class="bank-status-card">
        <h2>Compte bancaire</h2>
        <p class="success">Compte Stripe vérifié</p>

        <div class="bank-info">
          <p>ID Stripe</p>
          <b>${stripeEscape(stripeAccountId)}</b>

          <p>Statut</p>
          <b>Vérifié</b>

          <p>Paiements</p>
          <b>Activés</b>
        </div>

        <button type="button" class="bank-dashboard-btn">
          Gérer mon compte Stripe
        </button>

        <button type="button" class="bank-refresh-btn">
          Actualiser le statut
        </button>
      </section>
    `;
  }

  return `
    <section class="bank-status-card">
      <h2>Statut du compte</h2>
      <p class="pending">Vérification en cours</p>

      <p>
        Termine les informations demandées par Stripe.
        La création de packs restera bloquée tant que le compte
        ne sera pas entièrement vérifié.
      </p>

      <p>
        ID Stripe :
        <strong>${stripeEscape(stripeAccountId)}</strong>
      </p>

      <button type="button" class="bank-manage-btn">
        Continuer la vérification
      </button>

      <button type="button" class="bank-refresh-btn">
        Actualiser le statut
      </button>
    </section>
  `;
}


// L'identification professionnelle appartient exclusivement à la V1 commerciale LOCAL.
// La politique du serveur reste la source d'autorité, jamais l'URL seule.
function isV1LocalBankActive(state = window.SonaraCommercial?.getState?.()) {
  return state?.confirmedByApi === true &&
    state.environment === "local" &&
    state.mode === "COMMERCIAL" &&
    state.bankAccessible === true &&
    state.stripeEnabled === true;
}

// La carte Stripe bancaire reste indépendante. Ce module utilise le registre
// légal existant, sans prétendre que Stripe immatricule une activité.
const bankRegistration = {
  loaded: false, loading: false, busy: false, error: "", feedback: "",
  country: "", identifierType: "", registrationNumber: "", legalName: "",
  showExisting: false, ownershipAttested: false,
  countries: [], typesByCountry: {}, typeLabels: {}, registrationPortals: {},
  identity: null
};

function suggestedRegistrationCountry() {
  const language = String(localStorage.getItem("sonaraLanguage") || navigator.language || "fr")
    .trim().toLowerCase().replaceAll("_", "-");
  const main = language.split("-")[0];
  const region = language.split("-")[1]?.toUpperCase();
  // Une langue n'est pas une nationalité. On suggère un pays, modifiable.
  if (region && /^[A-Z]{2}$/.test(region)) return region;
  const suggestions = {
    fr:"FR", en:"GB", sq:"AL", ar:"MA", tr:"TR", id:"ID",
    es:"ES", de:"DE", it:"IT", pt:"PT", nl:"NL", pl:"PL",
    ro:"RO", ru:"RU", zh:"CN", sw:"KE"
  };
  return suggestions[main] || "FR";
}

function bankRegistrationTypes(country) {
  return [...new Set([
    ...(bankRegistration.typesByCountry[country] || []),
    "LOCAL_REGISTRATION"
  ])];
}

function bankRegistrationStatus(identity) {
  if (!identity || identity.status === "not_provided") {
    return {tone:"neutral",text:"Aucune déclaration renseignée"};
  }
  if (identity.testOnly) return {tone:"warning",text:"Simulation LOCAL — aucune vérification officielle"};
  const status = identity.registrationCheck?.status;
  if (status === "registry_matched") {
    return {tone:"warning",text:"Immatriculation trouvée au registre — titulaire non vérifié"};
  }
  if (status === "format_only") {
    return {tone:"warning",text:"Numéro au format valide — registre non contrôlé"};
  }
  return {tone:"neutral",text:"Déclaration enregistrée — vérification à faire"};
}

function bankLegalMarkup() {
  if (!bankRegistration.loaded) {
    return `<section class="bank-status-card bank-legal-card">
      <h2>Déclaration d'activité</h2>
      <p>${bankRegistration.error ? stripeEscape(bankRegistration.error) : "Chargement des démarches officielles…"}</p>
      ${bankRegistration.error ? `<button type="button" class="bank-legal-retry">Réessayer</button>` : ""}
    </section>`;
  }
  const state = bankRegistration;
  const country = state.country;
  const names = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([localStorage.getItem("sonaraLanguage") || "fr"], {type:"region"})
    : null;
  const options = state.countries.map(code => `<option value="${stripeEscape(code)}" ${code === country ? "selected" : ""}>
    ${stripeEscape(names?.of(code) || code)}</option>`).join("");
  const portal = state.registrationPortals[country];
  const countryName = names?.of(country) || country;
  const types = bankRegistrationTypes(country);
  const typeOptions = types.map(type => `<option value="${stripeEscape(type)}" ${type === state.identifierType ? "selected" : ""}>
    ${stripeEscape(state.typeLabels[type] || type)}</option>`).join("");
  const current = bankRegistrationStatus(state.identity);
  const existing = state.showExisting;
  const regInfo = state.identity?.registrationCheck;
  const statusMore = regInfo?.status === "registry_matched"
    ? `<p class="bank-legal-registry-name">Registre : ${stripeEscape(regInfo.registryName || "Entreprise retrouvée")}</p>` : "";
  const registryLink = regInfo?.status === "registry_matched" && /^https:\/\/annuaire-entreprises\.data\.gouv\.fr\//.test(regInfo.registryUrl || "")
    ? `<a class="bank-legal-secondary-link" href="${stripeEscape(regInfo.registryUrl)}" target="_blank" rel="noopener noreferrer">Consulter la fiche officielle</a>` : "";
  return `
    <section class="bank-status-card bank-legal-card">
      <h2>Déclaration d'activité</h2>
      <p>Déclare ton activité auprès de l'administration compétente dans ton pays, si ton statut l'exige.
         Sonara Pack ne réalise pas cette formalité à ta place.</p>
      <p class="bank-legal-state">
        <span class="bank-legal-dot ${current.tone}"></span>
        ${stripeEscape(current.text)}
      </p>
      ${statusMore}
      ${registryLink}
      <div class="bank-registration-group">
        <label for="bankRegistrationCountry">Pays d'activité ou d'immatriculation</label>
        <select id="bankRegistrationCountry" class="bank-registration-control">${options}</select>
        <small>Pays proposé selon la langue Sonara ; vérifie-le et change-le si besoin.</small>
      </div>
      <div class="bank-legal-portal">
        <strong>Démarche officielle — ${stripeEscape(countryName)}</strong>
        ${portal
          ? `<a href="${stripeEscape(portal.url)}" target="_blank" rel="noopener noreferrer" class="bank-legal-portal-link">
               <i data-lucide="external-link" aria-hidden="true"></i>
               ${stripeEscape(portal.name)}
             </a>${portal.other ? `<a href="${stripeEscape(portal.other.url)}" target="_blank" rel="noopener noreferrer" class="bank-legal-secondary-link">${stripeEscape(portal.other.name)}</a>` : ""}`
          : `<p>Nous n'avons pas encore de lien officiel confirmé pour ce pays.
               Vérifie la démarche auprès du registre ou de l'administration compétente ; aucun site non vérifié n'est proposé.</p>`}
        <small>La formalité et le numéro exigé dépendent du pays et de ton statut (artiste, indépendant, société…).</small>
      </div>
      <button type="button" class="bank-registration-existing-btn" aria-expanded="${existing}">
        ${existing ? "Masquer le formulaire" : "J'ai déjà un numéro professionnel (SIRET ou équivalent)"}
      </button>
      ${existing ? `
        <form class="bank-registration-form" novalidate>
          <div class="bank-registration-group">
            <label for="bankRegistrationType">Type d'identifiant</label>
            <select id="bankRegistrationType" class="bank-registration-control">${typeOptions}</select>
          </div>
          <div class="bank-registration-group">
            <label for="bankRegistrationNumber">Numéro d'immatriculation professionnel</label>
            <input id="bankRegistrationNumber" class="bank-registration-control"
              type="text" maxlength="40" autocomplete="off" spellcheck="false"
              value="${stripeEscape(state.registrationNumber)}" placeholder="Numéro délivré par le registre officiel" required>
            <small>Pas de numéro personnel de sécurité sociale, passeport ou identifiant fiscal personnel.</small>
          </div>
          <label class="bank-registration-confirm">
            <input type="checkbox" class="bank-registration-attest" ${state.ownershipAttested ? "checked" : ""} required>
            Je confirme que cet identifiant correspond à mon activité.
          </label>
          <button type="submit" class="bank-registration-check-btn" ${state.busy ? "disabled" : ""}>
            ${state.busy ? "Vérification en cours…" : "Vérifier mon numéro"}
          </button>
        </form>` : ""}
      <p class="bank-registration-feedback" role="status" aria-live="polite">${stripeEscape(state.feedback || state.error)}</p>
      <p class="bank-legal-notice">
        Un numéro au bon format ne prouve pas une immatriculation. Une fiche retrouvée au registre
        ne prouve pas que tu en es le titulaire ni que toutes tes obligations sont remplies.
        Ce contrôle n'active aucun paiement ni aucune autorisation commerciale.
      </p>
    </section>`;
}

function renderBankLegalCard() {
  const old = document.querySelector(".bank-legal-card");
  if (!old || !isV1LocalBankActive()) return;
  old.outerHTML = bankLegalMarkup();
  stripeIcons();
  bindBankLegalActions();
}

async function loadBankRegistration() {
  bankRegistration.loading = true;
  try {
    const response = await fetch(`${API_URL}/api/creator/legal-identity`, {headers:{Accept:"application/json"}});
    const data = await readJsonResponse(response);
    if (!response.ok || !data.success) throw new Error(data.message || data.code || "Déclaration indisponible.");
    bankRegistration.loaded = true;
    bankRegistration.countries = Array.isArray(data.countries) ? data.countries : [];
    bankRegistration.typesByCountry = data.typesByCountry || {};
    bankRegistration.typeLabels = data.typeLabels || {};
    bankRegistration.registrationPortals = data.registrationPortals || {};
    bankRegistration.identity = data.legalIdentity || null;
    const suggested = suggestedRegistrationCountry();
    const preferred = data.legalIdentity?.country || bankRegistration.country || suggested;
    bankRegistration.country = bankRegistration.countries.includes(preferred) ? preferred : "FR";
    bankRegistration.identifierType = data.legalIdentity?.identifierType || bankRegistrationTypes(bankRegistration.country)[0];
    bankRegistration.registrationNumber = data.legalIdentity?.registrationNumber || "";
    bankRegistration.error = "";
  } catch (error) {
    bankRegistration.error = error.message || "Impossible de charger les démarches.";
  } finally {
    bankRegistration.loading = false;
    renderBankLegalCard();
  }
}

function bindBankLegalActions() {
  document.querySelector(".bank-legal-retry")?.addEventListener("click", () => void loadBankRegistration());
  const country = document.querySelector("#bankRegistrationCountry");
  country?.addEventListener("change", () => {
    bankRegistration.country = country.value;
    bankRegistration.identifierType = bankRegistrationTypes(country.value)[0];
    bankRegistration.registrationNumber = "";
    bankRegistration.feedback = "";
    bankRegistration.ownershipAttested = false;
    renderBankLegalCard();
  });
  document.querySelector(".bank-registration-existing-btn")?.addEventListener("click", () => {
    bankRegistration.showExisting = !bankRegistration.showExisting;
    bankRegistration.feedback = "";
    renderBankLegalCard();
  });
  document.querySelector("#bankRegistrationType")?.addEventListener("change", (event) => {
    bankRegistration.identifierType = event.target.value;
    bankRegistration.registrationNumber = "";
    bankRegistration.feedback = "";
    renderBankLegalCard();
  });
  document.querySelector("#bankRegistrationNumber")?.addEventListener("input", (event) => {
    bankRegistration.registrationNumber = event.target.value;
  });
  document.querySelector(".bank-registration-attest")?.addEventListener("change", event => {
    bankRegistration.ownershipAttested = event.target.checked;
  });
  document.querySelector(".bank-registration-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (bankRegistration.busy) return;
    if (!bankRegistration.registrationNumber.trim() || !bankRegistration.ownershipAttested) {
      bankRegistration.feedback = "Saisis le numéro et confirme qu'il correspond à ton activité.";
      renderBankLegalCard();
      return;
    }
    bankRegistration.busy = true;
    bankRegistration.feedback = "";
    renderBankLegalCard();
    try {
      const response = await fetch(`${API_URL}/api/creator/legal-identity/check-registration`, {
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({country:bankRegistration.country,
          identifierType:bankRegistration.identifierType,
          registrationNumber:bankRegistration.registrationNumber,
          ownershipAttested:bankRegistration.ownershipAttested})
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.messageEn || data.code || "Vérification indisponible.");
      }
      if (data.legalIdentity) bankRegistration.identity = data.legalIdentity;
      bankRegistration.feedback = data.message || "Contrôle terminé.";
      if (data.registrationCheck?.status === "not_found") {
        bankRegistration.feedback += " Vérifie le numéro ou consulte l'annuaire officiel.";
      }
    } catch (error) {
      bankRegistration.feedback = error.message || "Vérification indisponible.";
    } finally {
      bankRegistration.busy = false;
      renderBankLegalCard();
    }
  });
}

function renderBankPage(
  account = {},
  verification = null,
  verificationError = ""
) {
  bankPage.innerHTML = `
    <button type="button" class="creator-settings-btn">
      <i data-lucide="settings"></i>
    </button>

    <button type="button" class="creator-settings-btn-desktop">
      <i data-lucide="settings"></i>
    </button>

    <header class="bank-header">
      <p class="bank-label">SONARA MANAGEMENT</p>
      <h1>Compte bancaire</h1>
      <p class="bank-subtitle">
        Connecte ton compte Stripe pour recevoir automatiquement
        les revenus de tes ventes.
      </p>
    </header>

    <button type="button" class="btn-home back-dashboard">
      Retourner au dashboard
    </button>

    ${bankStatusMarkup(account)}

    ${isV1LocalBankActive()
      ? bankLegalMarkup()
      : ""}
  `;

  stripeIcons();
  bindBankActions(account);
  bindBankLegalActions();
}

function setButtonLoading(button, text) {
  if (!button) return () => {};

  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = text;

  return () => {
    button.disabled = false;
    button.innerHTML = original;
    stripeIcons();
  };
}

async function connectStripe(account) {
  const button = document.querySelector(".bank-connect-btn");
  const restore = setButtonLoading(button, "Connexion…");

  try {
    const artistId = getArtistId(account);

    if (!artistId) {
      throw new Error("Identifiant artiste introuvable.");
    }

    const response = await fetch(`${API_URL}/api/stripe/connect-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        artistId,
        email: account.mail || account.email || ""
      })
    });

    const data = await readJsonResponse(response);

    if (!response.ok || !data.url) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible de lancer Stripe."
      );
    }

    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify({
        ...account,
        stripeAccountId: data.accountId || account.stripeAccountId,
        stripeStatus: data.stripeStatus || "onboarding_started"
      })
    );

    window.location.href = data.url;
  } catch (error) {
    showBankToast(error.message, "error");
    restore();
  }
}

async function continueStripeOnboarding(
  account,
  button = document.querySelector(".bank-manage-btn")
) {
  const restore = setButtonLoading(button, "Ouverture…");

  try {
    const response = await fetch(
      `${API_URL}/api/stripe/continue-onboarding`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          artistId: getArtistId(account)
        })
      }
    );

    const data = await readJsonResponse(response);

    if (!response.ok || !data.url) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible de continuer la vérification."
      );
    }

    window.location.href = data.url;
  } catch (error) {
    showBankToast(error.message, "error");
    restore();
  }
}

async function openStripeDashboard(
  account,
  button = document.querySelector(".bank-dashboard-btn")
) {
  const restore = setButtonLoading(button, "Ouverture…");

  try {
    const response = await fetch(
      `${API_URL}/api/stripe/login-link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          artistId: getArtistId(account)
        })
      }
    );

    const data = await readJsonResponse(response);

    if (!response.ok || !data.url) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible d’ouvrir le dashboard Stripe."
      );
    }

    window.location.href = data.url;
  } catch (error) {
    showBankToast(error.message, "error");
    restore();
  }
}

async function refreshStripeStatus(account, silent = false) {
  const button = document.querySelector(".bank-refresh-btn");
  const restore = setButtonLoading(button, "Actualisation…");

  try {
    const response = await fetch(
      `${API_URL}/api/stripe/account-status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          artistId: getArtistId(account)
        })
      }
    );

    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible d’actualiser le statut Stripe."
      );
    }

    const updatedProfile = {
      ...account,
      stripeAccountId:
        data.stripeAccountId ||
        account.stripeAccountId ||
        null,
      stripeStatus:
        data.stripeStatus ||
        account.stripeStatus ||
        "onboarding_started"
    };

    localStorage.setItem(
      "sonaraProfile",
      JSON.stringify(updatedProfile)
    );

    if (updatedProfile.stripeStatus === "verified") {
      persistCreatorStripeUnlock(updatedProfile, { replayAnimation: true });
    }

    renderBankPage(updatedProfile, data);

    if (!silent) {
      showBankToast(
        updatedProfile.stripeStatus === "verified"
          ? "Compte Stripe vérifié."
          : "Statut Stripe actualisé."
      );
    }
  } catch (error) {
    console.error("Erreur de récupération du statut Stripe :", error);
    renderBankPage(account, null, error.message);
    if (!silent) showBankToast(error.message, "error");
    restore();
  }
}

function bindBankActions(account) {
  document.querySelector(".creator-settings-btn")?.addEventListener(
    "click",
    () => {
      window.location.href = "/app/pages/creator/dashboard.html?mode=management";
    }
  );

  document.querySelector(".creator-settings-btn-desktop")?.addEventListener(
    "click",
    () => {
      window.location.href = "/app/pages/creator/dashboard.html?mode=management";
    }
  );

  document.querySelector(".back-dashboard")?.addEventListener(
    "click",
    () => {
      window.location.href = "/app/pages/creator/dashboard.html?mode=management";
    }
  );

  document.querySelector(".bank-connect-btn")?.addEventListener(
    "click",
    () => connectStripe(account)
  );

  document.querySelector(".bank-manage-btn")?.addEventListener(
    "click",
    () => continueStripeOnboarding(account)
  );

  document.querySelector(".bank-dashboard-btn")?.addEventListener(
    "click",
    () => openStripeDashboard(account)
  );

  document.querySelector(".bank-refresh-btn")?.addEventListener(
    "click",
    () => refreshStripeStatus(account)
  );


}

async function initBankPage() {
  if (!bankPage) return;

  const commercialState = await window.SonaraCommercial?.ready?.();

  if (!isV1LocalBankActive(commercialState)) {
    window.location.replace("/app/pages/creator/dashboard.html?mode=management");
    return;
  }

  bankPage.innerHTML = `
    <section class="bank-status-card">
      <h2>Chargement du compte Stripe…</h2>
    </section>
  `;

  try {
    const account = await fetchFreshArtistProfile();
    persistCreatorStripeUnlock(account);
    renderBankPage(account);
    if (account.stripeAccountId) {
      await refreshStripeStatus(account, true);
    }
    await loadBankRegistration();

    const params = new URLSearchParams(window.location.search);

    if (
      params.get("stripe") === "success" &&
      account.stripeAccountId
    ) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
  } catch (error) {
    bankPage.innerHTML = `
      <section class="bank-status-card">
        <h2>Chargement impossible</h2>
        <p>${stripeEscape(error.message)}</p>
        <button type="button" class="bank-retry-btn">
          Réessayer
        </button>
      </section>
    `;

    document.querySelector(".bank-retry-btn")?.addEventListener(
      "click",
      initBankPage
    );
  }

  stripeIcons();
}

initBankPage();
