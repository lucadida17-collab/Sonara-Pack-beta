"use strict";
// Module unique de l'identification légale, rangé à côté de bank.js / profile-creator.js.
// Le retour mène TOUJOURS au Dashboard management, jamais aux paramètres.
const appLayout = document.querySelector(".app-layout");
function renderAccountHeader(title) {
  return `<header class="settings-header">
    <button class="settings-back-button" type="button" aria-label="Retour au Dashboard management"><i data-lucide="arrow-left">←</i></button>
    <h1 class="settings-title">${title}</h1><div class="settings-header-space"></div>
  </header>`;
}
function activateAccountBackButton() {
  if (window.lucide) window.lucide.createIcons();
  appLayout.querySelector(".settings-back-button")?.addEventListener("click", () => {
    window.location.href = "/app/pages/creator/dashboard.html?mode=management";
  });
}
// Liste locale pour conserver les menus utilisables même si l'API ne répond pas.
// Le serveur reste l'unique autorité pour valider et enregistrer une immatriculation.
const ARTIST_LEGAL_FALLBACK_COUNTRIES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const ARTIST_LEGAL_FALLBACK_TYPES = {
  FR:["FR_SIRET","FR_SIREN"],US:["US_EIN","US_STATE_REG"],GB:["GB_CRN"],CA:["CA_BN","CA_NEQ"],
  BE:["BE_BCE"],CH:["CH_UID"],AU:["AU_ABN"],NZ:["NZ_NZBN"],IE:["IE_CRO"],DE:["DE_HRB"],
  NL:["NL_KVK"],LU:["LU_RCS"],MA:["MA_ICE"],
  CI:["OHADA_RCCM"],SN:["OHADA_RCCM"],CM:["OHADA_RCCM"],BJ:["OHADA_RCCM"],BF:["OHADA_RCCM"],
  ML:["OHADA_RCCM"],NE:["OHADA_RCCM"],TG:["OHADA_RCCM"],GA:["OHADA_RCCM"],CG:["OHADA_RCCM"],
  CD:["OHADA_RCCM"],CF:["OHADA_RCCM"],TD:["OHADA_RCCM"],GQ:["OHADA_RCCM"],GW:["OHADA_RCCM"],
  KM:["OHADA_RCCM"],GN:["OHADA_RCCM"]
};
const ARTIST_LEGAL_FALLBACK_LABELS = {
  FR_SIRET:"SIRET (14 chiffres)",FR_SIREN:"SIREN (9 chiffres)",US_EIN:"EIN (9 chiffres)",
  US_STATE_REG:"State business registration number",GB_CRN:"Companies House (CRN)",
  CA_BN:"Business Number (BN)",CA_NEQ:"Numéro d’entreprise du Québec (NEQ)",
  BE_BCE:"Numéro d’entreprise BCE / KBO",CH_UID:"IDE / UID (CHE)",AU_ABN:"Australian Business Number (ABN)",
  NZ_NZBN:"New Zealand Business Number (NZBN)",IE_CRO:"Company Registration Office (CRO)",
  DE_HRB:"Registre du commerce (HRB / HRA)",NL_KVK:"Numéro KVK",LU_RCS:"Registre de commerce (RCS)",
  MA_ICE:"Identifiant commun de l'entreprise (ICE)",OHADA_RCCM:"Registre du commerce (RCCM)",
  LOCAL_REGISTRATION:"Autre identifiant d’immatriculation local"
};

async function renderArtistLegalIdentity() {
  const english = (localStorage.getItem("sonaraLanguage") || navigator.language || "fr").toLowerCase().startsWith("en");
  const tr = (fr, en) => english ? en : fr;
  appLayout.innerHTML = `<section class="account-page artist-legal-page">
    ${renderAccountHeader(tr("Identification légale de l’activité", "Business & legal identity"))}
    <div class="account-content artist-legal-content">
      <form class="account-form artist-legal-form" novalidate>
        <div class="artist-legal-intro">
          <div class="artist-legal-kicker"><span class="artist-legal-kicker-dot" aria-hidden="true"></span>${tr("ESPACE ARTISTE · CONFORMITÉ", "ARTIST SPACE · COMPLIANCE")}</div>
          <h2>${tr("Identité professionnelle", "Business identity")}</h2>
          <p>${tr("Déclare ton activité selon les règles de ton pays. Ces informations restent privées et seront examinées avant toute activation commerciale.","Declare your business according to your country's rules. This information stays private and may be reviewed before commercial activation.")}</p>
          <div class="artist-legal-current" aria-live="polite">
            <span class="artist-legal-current-dot" aria-hidden="true"></span>
            <span class="artist-legal-current-text">${tr("Chargement de ta déclaration…","Loading your declaration…")}</span>
          </div>
        </div>
        <div class="artist-legal-fields">
          <div class="account-field artist-legal-field">
            <label class="account-label" for="artistLegalCountry">${tr("Pays d’activité ou d’immatriculation", "Business or registration country")}</label>
            <div class="artist-legal-select-wrap">
              <select class="account-input artist-legal-control" id="artistLegalCountry" required aria-describedby="artistLegalCountryHint"></select>
            </div>
            <span class="artist-legal-hint" id="artistLegalCountryHint">${tr("Sélectionne le pays où ton activité est déclarée.", "Choose the country where your business is registered.")}</span>
          </div>
          <div class="artist-registration-portal artist-legal-full" aria-live="polite">
            <strong>${tr("Démarche officielle selon ton pays", "Official registration steps for your country")}</strong>
            <div class="artist-registration-portal-content">${tr("Chargement du portail…", "Loading official portal…")}</div>
            <small>${tr("La langue suggère un pays, mais tu peux choisir ton pays d'activité librement.", "Language only suggests a country; choose where your business is registered.")}</small>
          </div>
          <div class="account-field artist-legal-field">
            <label class="account-label" for="artistActivityType">${tr("Situation professionnelle", "Business status")}</label>
            <div class="artist-legal-select-wrap">
              <select class="account-input artist-legal-control" id="artistActivityType">
                <option value="">${tr("Choisis ta situation", "Choose your business status")}</option>
                <option value="registered">${tr("Activité immatriculée", "Registered business")}</option>
                <option value="individual_no_number">${tr("Indépendant sans numéro obligatoire", "Individual without mandatory registration")}</option>
              </select>
            </div>
            <span class="artist-legal-hint">${tr("Tu peux compléter ou modifier cela plus tard.", "You can complete or change this later.")}</span>
          </div>
          <div class="account-field artist-legal-field artist-registered-field" hidden>
            <label class="account-label" for="artistIdType">${tr("Type d’identifiant officiel", "Official identifier type")}</label>
            <div class="artist-legal-select-wrap">
              <select class="account-input artist-legal-control" id="artistIdType"></select>
            </div>
          </div>
          <div class="account-field artist-legal-field artist-registered-field" hidden>
            <label class="account-label" for="artistRegistrationNumber">${tr("Numéro d’immatriculation", "Registration number")}</label>
            <input class="account-input artist-legal-control" id="artistRegistrationNumber" type="text" maxlength="40" autocomplete="off" spellcheck="false" aria-describedby="artistRegistrationHint" placeholder="${tr("Numéro délivré par le registre officiel", "Official registration number")}">
            <span class="artist-legal-hint" id="artistRegistrationHint" aria-live="polite"></span>
          </div>
          <div class="account-field artist-legal-field artist-registered-field artist-legal-full" hidden>
            <label class="account-label" for="artistLegalName">${tr("Nom légal ou raison sociale", "Legal or registered business name")} <span class="artist-legal-optional">${tr("Facultatif", "Optional")}</span></label>
            <input class="account-input artist-legal-control" id="artistLegalName" type="text" maxlength="140" autocomplete="organization" placeholder="${tr("Nom figurant sur l’immatriculation", "Name on the registration")}">
          </div>
        </div>
        <label class="artist-legal-attestation" hidden>
          <input id="artistIndividualAttestation" type="checkbox">
          <span>${tr("Je confirme exercer sous un statut individuel et déclare qu’aucun numéro d’immatriculation professionnelle n’est obligatoire pour mon activité dans ce pays. Cette déclaration restera à examiner.","I confirm that I operate individually and declare that no business registration number is mandatory for my activity in this country. This declaration remains subject to review.")}</span>
        </label>
        <section class="artist-legal-proof" aria-label="Justificatif d'immatriculation">
          <strong>${tr("Justificatif PDF · obligatoire pour la V1 réelle","PDF proof · required for real V1")}</strong>
          <p>${tr("Le document devra être fourni et contrôlé via un prestataire habilité. Sonara ne stocke pas de pièces sensibles dans ce formulaire.","The document must be submitted and verified through an authorized provider. Sonara does not store sensitive documents here.")}</p>
          <p class="artist-legal-proof-test" hidden>${tr("LOCAL : justificatif désactivé pour cette simulation. Aucun PDF n'est transmis ni validé.","LOCAL: proof is disabled for this simulation. No PDF is uploaded or verified.")}</p>
        </section>
        <label class="artist-legal-test-switch" hidden>
          <input type="checkbox" id="artistLegalLocalTest">
          <span><strong>${tr("Test LOCAL", "LOCAL test")}</strong><small>${tr("Accepter un numéro fictif composé de zéros, sans justificatif PDF. Simulation uniquement.","Allow all-zero test numbers without PDF proof. Simulation only.")}</small></span>
        </label>
        <div class="artist-legal-notice">
          <span class="artist-legal-notice-icon" aria-hidden="true">i</span>
          <p>${tr("Ne saisis aucun numéro personnel (sécurité sociale, passeport ou identifiant fiscal personnel). Cette déclaration n’est pas une vérification officielle et ne débloque aucun paiement.","Never enter personal identification numbers (social security, passport or personal tax number). This declaration is not official verification and does not enable payments.")}</p>
        </div>
        <section class="artist-legal-provider" aria-label="Vérification externe" aria-live="polite">
          <div class="artist-legal-provider-heading">
            <span class="artist-legal-provider-icon" aria-hidden="true"><i data-lucide="shield-check"></i></span>
            <div><strong>${tr("Vérification externe", "External verification")}</strong>
              <small>${tr("Stripe Connect · contrôle par prestataire", "Stripe Connect · third-party review")}</small></div>
          </div>
          <p class="artist-legal-provider-status">${tr("Vérification du statut…", "Checking verification status…")}</p>
          <p class="artist-legal-provider-help">${tr("Une déclaration ne prouve pas l’immatriculation. Sonara ne collecte aucune pièce d’identité ni document bancaire dans ce formulaire.", "A declaration does not prove registration. Sonara does not collect ID documents or bank statements in this form.")}</p>
          <p class="artist-legal-provider-help artist-legal-provider-separation">${tr("Les informations saisies ici sont enregistrées dans Sonara, pas envoyées automatiquement à Stripe. Stripe collecte ses propres informations lors de l’onboarding Connect.", "Information entered here is saved in Sonara, not automatically sent to Stripe. Stripe collects its own information during Connect onboarding.")}</p>
          <a class="artist-legal-provider-action" hidden href="/app/pages/creator/management/bank.html">${tr("Configurer Stripe Connect (TEST)", "Set up Stripe Connect (TEST)")}</a>
          <p class="artist-legal-provider-test" hidden>${tr("Stripe TEST : ce statut est simulé et ne vaut pas vérification légale réelle.", "Stripe TEST: this status is simulated and is not real legal verification.")}</p>
        </section>
        <div class="artist-legal-instant-check" hidden>
          <label><input class="artist-legal-owner-attest" type="checkbox">
            ${tr("Je confirme que ce numéro correspond à mon activité.","I confirm that this registration number belongs to my business activity.")}
          </label>
          <button type="button" class="artist-legal-check-registry">${tr("Vérifier mon numéro maintenant", "Check my registration number now")}</button>
          <small>${tr("France : registre public vérifié. Autres pays : seul le format est contrôlé, sans attestation de titulaire.","France: public registry lookup. Other countries: format only, without ownership verification.")}</small>
        </div>
        <div class="artist-legal-feedback" role="status" aria-live="polite" hidden>
          <span class="artist-legal-status"></span>
          <button type="button" class="artist-legal-retry" hidden>${tr("Réessayer", "Retry")}</button>
        </div>
        <button class="account-save-button artist-legal-save" type="submit" disabled>${tr("Enregistrer ma déclaration", "Save my declaration")}</button>
        <button class="artist-legal-clear" type="button" hidden>${tr("Supprimer ma déclaration", "Delete my declaration")}</button>
      </form>
    </div>
  </section>`;
  activateAccountBackButton();
  const form = appLayout.querySelector(".artist-legal-form");
  const country = form.querySelector("#artistLegalCountry");
  const activity = form.querySelector("#artistActivityType");
  const idType = form.querySelector("#artistIdType");
  const number = form.querySelector("#artistRegistrationNumber");
  const legalName = form.querySelector("#artistLegalName");
  const numberHint = form.querySelector("#artistRegistrationHint");
  const individualAttestation = form.querySelector("#artistIndividualAttestation");
  const attestationRow = form.querySelector(".artist-legal-attestation");
  const clearButton = form.querySelector(".artist-legal-clear");
  const testSwitch = form.querySelector("#artistLegalLocalTest");
  const testRow = form.querySelector(".artist-legal-test-switch");
  const proofTest = form.querySelector(".artist-legal-proof-test");
  const portalContent = form.querySelector(".artist-registration-portal-content");
  const instantCheck = form.querySelector(".artist-legal-instant-check");
  const ownerAttest = form.querySelector(".artist-legal-owner-attest");
  const instantCheckButton = form.querySelector(".artist-legal-check-registry");
  let registrationPortals = {};
  function suggestedCountryFromLanguage() {
    const code = String(localStorage.getItem("sonaraLanguage") || navigator.language || "fr").toLowerCase().replaceAll("_","-");
    const region = code.split("-")[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) return region;
    const map={fr:"FR",en:"GB",sq:"AL",ar:"MA",tr:"TR",id:"ID",es:"ES",de:"DE",it:"IT",pt:"PT",nl:"NL",pl:"PL",ro:"RO",ru:"RU",zh:"CN",sw:"KE"};
    return map[code.split("-")[0]] || "FR";
  }
  function showOfficialPortal() {
    const portal = registrationPortals[country.value];
    portalContent.replaceChildren();
    if (!portal || !/^https:\/\//.test(portal.url)) {
      portalContent.textContent = tr("Lien officiel non confirmé pour ce pays. Consulte l'administration compétente.","No confirmed official link for this country. Contact the responsible authority.");
      return;
    }
    const links = [portal,portal.other].filter(Boolean);
    for (const entry of links) {
      if (!/^https:\/\//.test(entry.url)) continue;
      const link=document.createElement("a");
      link.href=entry.url;link.target="_blank";link.rel="noopener noreferrer";
      link.textContent=entry.name;portalContent.append(link);
    }
  }

  let localTestAllowed = false;
  const statusBox = form.querySelector(".artist-legal-feedback");
  const status = form.querySelector(".artist-legal-status");
  const retry = form.querySelector(".artist-legal-retry");
  const current = form.querySelector(".artist-legal-current-text");
  const currentBadge = form.querySelector(".artist-legal-current");
  const button = form.querySelector(".artist-legal-save");
  const providerStatus = form.querySelector(".artist-legal-provider-status");
  const providerAction = form.querySelector(".artist-legal-provider-action");
  const providerTest = form.querySelector(".artist-legal-provider-test");
  // Match account-authentication feedback: one red border and one precise reason per field.
  // Server validation codes/fields are authoritative; browser checks prevent obvious mistakes.
  const legalControls = {country,activityType:activity,identifierType:idType,
    registrationNumber:number,legalName,individualAttested:individualAttestation};
  const legalErrorNodes = {};
  let validationAttempted = false;
  for (const [field, control] of Object.entries(legalControls)) {
    const holder = field === "individualAttested" ? attestationRow : control.closest(".artist-legal-field");
    const node = document.createElement("small");
    node.className = "artist-legal-field-error";
    node.id = `artistLegalError-${field}`;
    node.hidden = true;
    node.setAttribute("aria-live", "polite");
    holder.append(node);
    legalErrorNodes[field] = node;
    const oldDescription = control.getAttribute("aria-describedby") || "";
    control.setAttribute("aria-describedby", `${oldDescription} ${node.id}`.trim());
  }
  function clearFieldError(field) {
    const control = legalControls[field], node = legalErrorNodes[field];
    if (!control || !node) return;
    control.removeAttribute("aria-invalid");
    control.classList.remove("artist-legal-invalid");
    node.textContent = "";
    node.hidden = true;
    const holder = field === "individualAttested" ? attestationRow : control.closest(".artist-legal-field");
    holder.classList.remove("artist-legal-has-error");
  }
  function setFieldError(field, message) {
    const control = legalControls[field], node = legalErrorNodes[field];
    if (!control || !node) return false;
    control.setAttribute("aria-invalid", "true");
    control.classList.add("artist-legal-invalid");
    node.textContent = message;
    node.hidden = false;
    const holder = field === "individualAttested" ? attestationRow : control.closest(".artist-legal-field");
    holder.classList.add("artist-legal-has-error");
    return true;
  }
  function clearAllFieldErrors() {
    for (const field of Object.keys(legalControls)) clearFieldError(field);
  }
  function collectClientErrors() {
    const errors = {};
    if (!country.value) errors.country = tr("Sélectionne ton pays d'activité.","Choose your business country.");
    if (!activity.value) errors.activityType = tr("Sélectionne ta situation professionnelle.","Choose your business status.");
    if (activity.value === "registered") {
      if (!idType.value) errors.identifierType = tr("Sélectionne un type d'identifiant officiel.","Choose an official identifier type.");
      if (!number.value.trim()) errors.registrationNumber = tr("Saisis ton numéro d'immatriculation.","Enter your registration number.");
      else if (idType.value) {
        const reason = numberError();
        if (reason) errors.registrationNumber = reason;
      }
      if (legalName.value.length > 140 || /[<>\u0000-\u001f]/.test(legalName.value))
        errors.legalName = tr("Nom légal invalide (140 caractères maximum, sans balises).","Invalid legal name (max. 140 characters, no markup).");
    }
    if (activity.value === "individual_no_number" && !individualAttestation.checked)
      errors.individualAttested = tr("Confirme cette déclaration pour continuer.","Confirm this declaration to continue.");
    return errors;
  }
  function validateVisibleFields() {
    clearAllFieldErrors();
    const errors = collectClientErrors();
    for (const [field, reason] of Object.entries(errors)) setFieldError(field, reason);
    const first = Object.keys(errors)[0];
    if (first) {
      setFeedback(tr("Corrige les champs entourés en rouge avant d'enregistrer.","Correct the fields highlighted in red before saving."),"error");
      legalControls[first].focus({preventScroll:true});
      legalControls[first].scrollIntoView({behavior:"smooth",block:"center"});
      return false;
    }
    return true;
  }
  function onLegalFieldEdit(field) {
    clearFieldError(field);
    if (validationAttempted) {
      const errors = collectClientErrors();
      if (errors[field]) setFieldError(field,errors[field]);
      if (Object.keys(errors).length === 0) setFeedback("");
    }
    refreshSaveState();
  }
  async function loadExternalVerification() {
    const texts = {
      country_not_supported: tr("Stripe Connect LOCAL est actuellement limité aux comptes français dans Sonara. Le pays doit être pris en charge par Stripe avant d’activer des versements.", "Sonara LOCAL Stripe Connect currently supports French accounts only. Country support must be verified before enabling payouts."),
      disabled: tr("Pré-V1 : vérification externe non activée. Aucun paiement réel autorisé.", "Pre-V1: external verification not enabled. No live payments authorized."),
      not_connected: tr("Compte Stripe Connect non connecté.", "Stripe Connect account not connected."),
      needs_information: tr("Informations demandées par Stripe à compléter.", "Stripe requires additional information."),
      in_review: tr("Dossier en cours d’examen chez Stripe.", "Stripe is reviewing the account."),
      test_ready: tr("Compte Stripe TEST opérationnel (simulation uniquement).", "Stripe TEST account ready (simulation only)."),
      unavailable: tr("Statut du contrôleur temporairement indisponible.", "Verification provider status temporarily unavailable.")
    };
    try {
      const response = await fetch(`${API_URL}/api/creator/legal-identity/verification`, {
        method:"GET", cache:"no-store", headers:{Accept:"application/json"}
      });
      const result = await readApiJson(response);
      providerStatus.textContent = texts[result.status] || texts.unavailable;
      providerStatus.dataset.tone = result.status === "test_ready" ? "simulated" : "informational";
      providerTest.hidden = result.environment !== "local";
      providerAction.hidden = result.environment !== "local" || result.status === "test_ready" || result.status === "unavailable" || result.status === "country_not_supported" || country.value !== "FR";
      // A completed Stripe TEST onboarding is NOT an officially verified company.
    } catch (_) {
      providerStatus.textContent = texts.unavailable;
      providerStatus.dataset.tone = "informational";
      providerTest.hidden = true;
      providerAction.hidden = true;
    }
  }

  let ready = false;
  let typesByCountry = ARTIST_LEGAL_FALLBACK_TYPES;
  let typeLabels = ARTIST_LEGAL_FALLBACK_LABELS;
  const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([english ? "en" : "fr"], {type:"region"}) : null;

  function setFeedback(message, tone = "info", showRetry = false) {
    statusBox.hidden = !message;
    statusBox.dataset.tone = tone;
    status.textContent = message || "";
    retry.hidden = !showRetry;
  }
  function setCurrent(value, tone = "pending") {
    current.textContent = value;
    currentBadge.dataset.tone = tone;
  }
  function updateCountries(codes, selected) {
    const chosen = selected || country.value || "FR";
    const all = [...new Set(codes)].filter(code => /^[A-Z]{2}$/.test(code));
    const popular = ["FR", "US", "GB", "CA", "BE", "CH", "AU", "NZ", "IE"].filter(code => all.includes(code));
    const sorted = all.map(code => ({code, label: names?.of(code) || code}))
      .sort((a,b) => a.label.localeCompare(b.label, english ? "en" : "fr"));
    country.replaceChildren();
    const commonly = document.createElement("optgroup");
    commonly.label = tr("Pays fréquents", "Common countries");
    const others = document.createElement("optgroup");
    others.label = tr("Tous les pays et territoires", "All countries and territories");
    for (const code of popular) {
      const option = document.createElement("option");
      option.value = code; option.textContent = names?.of(code) || code;
      commonly.append(option);
    }
    for (const entry of sorted) {
      if (popular.includes(entry.code)) continue;
      const option = document.createElement("option");
      option.value = entry.code; option.textContent = entry.label;
      others.append(option);
    }
    country.append(commonly, others);
    country.value = all.includes(chosen) ? chosen : "FR";
  }
  function updateTypes(selected) {
    const previous = selected || null;
    const permitted = [...new Set([...(typesByCountry[country.value] || []), "LOCAL_REGISTRATION"])];
    idType.replaceChildren();
    for (const code of permitted) {
      const option = document.createElement("option");
      option.value = code; option.textContent = typeLabels[code] || code;
      idType.append(option);
    }
    if (permitted.includes(previous)) idType.value = previous;
  }
  const DIGIT_LENGTHS = Object.freeze({FR_SIRET:14,FR_SIREN:9,US_EIN:9,CA_BN:9,CA_NEQ:10,BE_BCE:10,AU_ABN:11,NZ_NZBN:13,NL_KVK:8,MA_ICE:15});
  let storedIdentity = null;
  let busy = false;
  function updateNumberRules() {
    const kind = idType.value;
    const length = DIGIT_LENGTHS[kind];
    number.maxLength = length || (kind === "GB_CRN" ? 8 : kind === "CH_UID" ? 15 : 40);
    number.inputMode = length ? "numeric" : "text";
    number.pattern = length ? `\\d{${length}}` : "";
    numberHint.textContent = length ? tr(`Exactement ${length} chiffres requis${kind === "FR_SIRET" || kind === "FR_SIREN" ? " (clé de contrôle vérifiée)" : ""}.`, `Exactly ${length} digits required${kind === "FR_SIRET" || kind === "FR_SIREN" ? " (check digit validated)" : ""}.`)
      : kind === "GB_CRN" ? tr("Jusqu’à 8 caractères, selon le format Companies House.","Up to 8 characters, according to the Companies House format.")
      : tr("Le format dépend du registre local ; il sera contrôlé à l’enregistrement.","Format depends on the local registry; it will be checked on save.");
    number.setCustomValidity("");
    refreshSaveState();
  }
  function numberError() {
    if (activity.value !== "registered") return "";
    if (!idType.value) return tr("Sélectionne le type d'identifiant.","Choose the identifier type.");
    if (!number.value.trim()) return tr("Saisis un numéro d'immatriculation.","Enter a registration number.");
    const length = DIGIT_LENGTHS[idType.value];
    if (length && !new RegExp(`^\\d{${length}}$`).test(number.value)) return tr(`Ce numéro exige exactement ${length} chiffres.`, `This number requires exactly ${length} digits.`);
    if (length && /^0+$/.test(number.value) && !(localTestAllowed && testSwitch.checked)) return tr("Un numéro composé uniquement de zéros n'est pas accepté.","An all-zero number is not accepted.");
    if (!length && idType.value === "GB_CRN" && !/^(?:[0-9]{1,8}|[A-Za-z]{2}[0-9]{6})$/.test(number.value.trim())) return tr("Numéro Companies House invalide.","Invalid Companies House number.");
    if (!length && idType.value === "CH_UID" && !/^CHE[ .\-]?[0-9]{3}[ .]?[0-9]{3}[ .]?[0-9]{3}$/i.test(number.value.trim())) return tr("Format UID attendu : CHE-123.456.789.","Expected UID format: CHE-123.456.789.");
    if (!length && idType.value !== "GB_CRN" && idType.value !== "CH_UID" && !/^[A-Za-z0-9][A-Za-z0-9 .\/_-]{2,39}$/.test(number.value.trim())) return tr("Saisis un identifiant professionnel au format attendu.","Enter a properly formatted business identifier.");
    return "";
  }
  function refreshSaveState() {
    if (!ready || busy) {button.disabled=true;return;}
    const registered = activity.value === "registered";
    const individual = activity.value === "individual_no_number";
    // Keep Save clickable for incomplete forms: a click must explain WHAT is wrong.
    // Server connectivity and an in-progress request are the only reasons to disable it.
    button.disabled = false;
  }
  function updateActivity() {
    const show = activity.value === "registered";
    const individual = activity.value === "individual_no_number";
    form.querySelectorAll(".artist-registered-field").forEach(field => {field.hidden = !show;});
    number.required = show;
    idType.required = show;
    instantCheck.hidden = !show;
    attestationRow.hidden = !individual;
    individualAttestation.required = individual;
    refreshSaveState();
  }
  function updateSummary(identity) {
    if (identity?.status === "test_simulated") setCurrent(tr("Simulation LOCAL · aucune vérification officielle", "LOCAL simulation · not officially verified"), "pending");
    else if (identity?.registrationCheck?.status === "registry_matched") setCurrent(tr("Immatriculation trouvée au registre · titulaire non vérifié", "Registry entry found · ownership not verified"), "pending");
    else if (identity?.registrationCheck?.status === "format_only") setCurrent(tr("Format vérifié · registre non contrôlé", "Format checked · registry not checked"), "pending");
    else if (identity?.status === "declared_unverified") setCurrent(tr("Identifiant déclaré · à vérifier", "Identifier declared · pending verification"), "pending");
    else if (identity?.status === "self_declared_unverified") setCurrent(tr("Déclaration individuelle · à examiner", "Individual declaration · pending review"), "pending");
    else setCurrent(tr("Aucune identification déclarée", "No business identity declared"), "empty");
  }
  function friendlyError(error, code) {
    if (code === "DOCUMENT_VERIFICATION_REQUIRED") return tr("Le justificatif doit être contrôlé par le prestataire. En LOCAL, coche Test pour simuler ce parcours.","The provider must verify the document. In LOCAL, select Test to simulate this flow.");
    if (code === "LOCAL_SIMULATION_FORBIDDEN") return tr("Mode test indisponible pour cet environnement.", "Test mode is unavailable in this environment.");
    if (code === "AUTH_REQUIRED" || error.httpStatus === 401) return tr("Ta session a expiré. Reconnecte-toi puis ouvre de nouveau cette page.","Your session has expired. Sign in again, then reopen this page.");
    if (error.code === "NON_JSON_RESPONSE") return tr(`Le serveur a renvoyé une page HTML au lieu de données JSON (HTTP ${error.httpStatus || "?"}). Vérifie que le backend ${IS_LOCAL ? "LOCAL (port 3001)" : "MAIN"} est démarré et à jour.`, `The server returned an HTML page instead of JSON (HTTP ${error.httpStatus || "?"}). Check that the ${IS_LOCAL ? "LOCAL backend (port 3001)" : "MAIN backend"} is running and up to date.`);
    if (error.code === "INVALID_JSON_RESPONSE") return tr("La réponse de l’API est invalide. Vérifie la version du serveur.","The API response is invalid. Check the backend version.");
    if (error instanceof TypeError) return tr(`Impossible de contacter le serveur ${IS_LOCAL ? "LOCAL (port 3001)" : "MAIN"}. Vérifie qu’il fonctionne.`, `Cannot reach the ${IS_LOCAL ? "LOCAL server (port 3001)" : "MAIN server"}. Make sure it is running.`);
    if (code === "ACTIVITY_TYPE_REQUIRED") return tr("Sélectionne une situation professionnelle avant d’enregistrer.","Choose your business status before saving.");
    if (code === "INDIVIDUAL_ATTESTATION_REQUIRED") return tr("Confirme ta déclaration individuelle pour continuer.","Confirm your individual declaration to continue.");
    if (code === "REGISTRATION_FORMAT_INVALID" || code === "REGISTRATION_NUMBER_INVALID" || code === "REGISTRATION_PLACEHOLDER_INVALID" || code === "SIRET_CHECKSUM_INVALID" || code === "SIREN_CHECKSUM_INVALID" || code === "ABN_CHECKSUM_INVALID") return tr("Numéro invalide. Vérifie le type et le numéro saisis.","Invalid registration number. Check its type and value.");
    if (error.httpStatus === 429) return tr("Trop de demandes. Réessaie dans quelques instants.","Too many requests. Please retry shortly.");
    return error.message || tr("Impossible de charger ou d’enregistrer ces informations.","Could not load or save this information.");
  }
  async function readApiJson(response) {
    // Never call response.json() blindly: a stale server / HTML fallback produced
    // the visible "Unexpected token '<' ... is not valid JSON" failure.
    const contentType = String(response.headers?.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
      throw Object.assign(new Error("Réponse non JSON"), {code:"NON_JSON_RESPONSE", httpStatus:response.status});
    }
    let data;
    try { data = await response.json(); }
    catch { throw Object.assign(new Error("JSON invalide"), {code:"INVALID_JSON_RESPONSE", httpStatus:response.status}); }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw Object.assign(new Error("JSON invalide"), {code:"INVALID_JSON_RESPONSE", httpStatus:response.status});
    }
    if (!response.ok || data.success !== true) {
      throw Object.assign(new Error(typeof data.message === "string" ? data.message : ""), {
        code:data.code, field:typeof data.field === "string" ? data.field : null,
        messageEn:typeof data.messageEn === "string" ? data.messageEn : "", httpStatus:response.status
      });
    }
    return data;
  }

  // Populate all country options immediately, even before network requests complete.
  updateCountries(ARTIST_LEGAL_FALLBACK_COUNTRIES, suggestedCountryFromLanguage());
  showOfficialPortal();
  updateTypes();
  updateActivity();
  updateNumberRules();
  country.addEventListener("change", () => {
    showOfficialPortal();
    onLegalFieldEdit("country");
    clearFieldError("identifierType");clearFieldError("registrationNumber");
    updateTypes();
    number.value = "";
    updateNumberRules();
    // Ne jamais proposer un onboarding français pour une immatriculation étrangère.
    if (country.value !== "FR") {
      providerAction.hidden = true;
      providerStatus.textContent = tr("La vérification Stripe Connect de ce pays n’est pas encore intégrée dans Sonara LOCAL.", "Stripe Connect verification for this country is not yet integrated in Sonara LOCAL.");
    } else {
      void loadExternalVerification();
    }
  });
  activity.addEventListener("change", () => {
    updateActivity();clearAllFieldErrors();onLegalFieldEdit("activityType");
  });
  idType.addEventListener("change", () => {
    number.value = "";updateNumberRules();clearFieldError("registrationNumber");onLegalFieldEdit("identifierType");
  });
  individualAttestation.addEventListener("change", () => onLegalFieldEdit("individualAttested"));
  testSwitch.addEventListener("change", () => {
    if (testSwitch.checked && localTestAllowed) {
      // Simulate automatically, without overwriting a number the artist typed.
      if (!activity.value) { activity.value = "registered"; updateActivity(); }
      const length = DIGIT_LENGTHS[idType.value];
      if (activity.value === "registered" && length && !number.value.trim()) {
        number.value = "0".repeat(length);
      }
    } else if (/^0+$/.test(number.value)) {
      // Do not leave a simulated placeholder in an un-checked form.
      number.value = "";
    }
    proofTest.hidden = !testSwitch.checked;
    onLegalFieldEdit("registrationNumber");
  });
  legalName.addEventListener("input", () => onLegalFieldEdit("legalName"));
  // Do not silently truncate a long pasted number into a seemingly valid registration.
  number.addEventListener("paste", event => {
    const length = DIGIT_LENGTHS[idType.value];
    if (!length) return;
    const raw = event.clipboardData?.getData("text") || "";
    const normalized = raw.replace(/[\s.\-]/g, "");
    event.preventDefault();
    const start = number.selectionStart ?? number.value.length;
    const end = number.selectionEnd ?? start;
    const resulting = number.value.slice(0,start) + normalized + number.value.slice(end);
    if (!/^\d+$/.test(normalized) || resulting.length > length) {
      validationAttempted = true;
      setFieldError("registrationNumber",tr(`Valeur refusée : exactement ${length} chiffres attendus, sans caractère supplémentaire.`, `Value rejected: exactly ${length} digits expected, with no extra characters.`));
      setFeedback(tr("Vérifie le champ entouré en rouge.","Check the field highlighted in red."),"error");
      return;
    }
    number.value = resulting;
    onLegalFieldEdit("registrationNumber");
  });
  number.addEventListener("input", () => {
    const length = DIGIT_LENGTHS[idType.value];
    if (length) number.value = number.value.replace(/[^0-9]/g, "");
    onLegalFieldEdit("registrationNumber");
  });

  async function loadDeclaration() {
    button.disabled = true;
    retry.hidden = true;
    setFeedback("");
    try {
      const response = await fetch(`${API_URL}/api/creator/legal-identity`, {
        cache:"no-store", headers:{Accept:"application/json"}
      });
      const data = await readApiJson(response);
      if (!data.legalIdentity || typeof data.legalIdentity !== "object") throw Object.assign(new Error("Réponse API incomplète"), {code:"INVALID_JSON_RESPONSE"});
      localTestAllowed = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && data.localV1Simulation === true && data.documentPolicy?.localTestBypass === true;
      testRow.hidden = !localTestAllowed;
      testSwitch.checked = false;
      proofTest.hidden = true;
      typesByCountry = data.typesByCountry || ARTIST_LEGAL_FALLBACK_TYPES;
      typeLabels = data.typeLabels || ARTIST_LEGAL_FALLBACK_LABELS;
      registrationPortals = data.registrationPortals || {};
      const selectedCountry = data.legalIdentity?.country || suggestedCountryFromLanguage();
      updateCountries(Array.isArray(data.countries) && data.countries.length ? data.countries : ARTIST_LEGAL_FALLBACK_COUNTRIES, selectedCountry);
      showOfficialPortal();
      storedIdentity = data.legalIdentity;
      if (localTestAllowed && data.legalIdentity.testOnly === true) {
        testSwitch.checked = true;proofTest.hidden = false;
      }
      validationAttempted = false;clearAllFieldErrors();
      activity.value = data.legalIdentity?.activityType === "not_provided" ? "" : (data.legalIdentity?.activityType || "");
      updateTypes(data.legalIdentity?.identifierType);
      updateNumberRules();
      number.value = data.legalIdentity?.registrationNumber || "";
      legalName.value = data.legalIdentity?.legalName || "";
      individualAttestation.checked = false;
      updateActivity();
      updateSummary(data.legalIdentity);
      clearButton.hidden = data.legalIdentity.status === "not_provided";
      ready = true;
      refreshSaveState();
      setFeedback("");
    } catch (error) {
      ready = false;
      setCurrent(tr("Connexion au serveur indisponible", "Server connection unavailable"), "error");
      setFeedback(friendlyError(error, error.code), "error", true);
      button.disabled = true;
    }
  }
  instantCheckButton.addEventListener("click", async () => {
    if (!ready || busy || activity.value !== "registered") return;
    if (!ownerAttest.checked) {
      setFeedback(tr("Confirme que ce numéro correspond à ton activité.","Confirm that this number belongs to your activity."),"error");
      return;
    }
    if (!validateVisibleFields()) return;
    busy=true;instantCheckButton.disabled=true;
    setFeedback(tr("Consultation du registre…", "Checking the register…"),"info");
    try {
      const response=await fetch(`${API_URL}/api/creator/legal-identity/check-registration`,{
        method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({country:country.value,identifierType:idType.value,
          registrationNumber:number.value,legalName:legalName.value,ownershipAttested:ownerAttest.checked})
      });
      const data=await readApiJson(response);
      if (data.legalIdentity) {
        storedIdentity=data.legalIdentity;updateSummary(storedIdentity);
        clearButton.hidden=false;
      }
      setFeedback(data.message || tr("Contrôle terminé.","Check completed."),"pending");
    } catch (error) {
      setFeedback(friendlyError(error,error.code),"error");
    } finally {busy=false;instantCheckButton.disabled=false;refreshSaveState();}
  });
  retry.addEventListener("click", loadDeclaration);
  clearButton.addEventListener("click", async () => {
    if (!ready || !storedIdentity || storedIdentity.status === "not_provided") return;
    if (!window.confirm(tr("Supprimer cette déclaration enregistrée ?", "Delete this saved declaration?"))) return;
    busy = true;clearButton.disabled = true;button.disabled = true;
    try {
      const response = await fetch(`${API_URL}/api/creator/legal-identity`, {
        method:"PATCH",headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({activityType:"not_provided",clear:true})
      });
      const data = await readApiJson(response);
      storedIdentity = data.legalIdentity;
      validationAttempted = false;clearAllFieldErrors();
      activity.value = "";number.value="";legalName.value="";individualAttestation.checked=false;testSwitch.checked=false;proofTest.hidden=true;
      updateActivity();updateSummary(storedIdentity);clearButton.hidden=true;
      setFeedback(tr("Déclaration supprimée.","Declaration deleted."),"pending");
    } catch (error) {setFeedback(friendlyError(error,error.code),"error");}
    finally {busy=false;clearButton.disabled=false;refreshSaveState();}
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!ready) return;
    validationAttempted = true;
    if (!validateVisibleFields()) return;
    busy = true;button.disabled = true;
    setFeedback(tr("Enregistrement en cours…", "Saving…"), "info");
    try {
      const response = await fetch(`${API_URL}/api/creator/legal-identity`, {
        method:"PATCH", headers:{"Content-Type":"application/json", Accept:"application/json"},
        body:JSON.stringify({country:country.value, activityType:activity.value,identifierType:idType.value,
          registrationNumber:number.value,legalName:legalName.value,individualAttested:individualAttestation.checked,
          localTestMode:localTestAllowed && testSwitch.checked})
      });
      const data = await readApiJson(response);
      if (!data.legalIdentity || typeof data.legalIdentity !== "object") throw Object.assign(new Error("Réponse API incomplète"), {code:"INVALID_JSON_RESPONSE"});
      storedIdentity = data.legalIdentity;
      validationAttempted = false;clearAllFieldErrors();
      updateSummary(storedIdentity);
      clearButton.hidden = storedIdentity.status === "not_provided";
      void loadExternalVerification();
      setFeedback(storedIdentity.testOnly === true
        ? tr("Simulation LOCAL enregistrée · aucun justificatif PDF ni contrôle officiel effectué.","LOCAL simulation saved · no PDF proof or official verification performed.")
        : tr("Déclaration reçue · non vérifiée. La vérification officielle reste à effectuer.","Declaration received · not verified. Official verification is still pending."), "pending");
    } catch (error) {
      // Back-end validation is authoritative: use its field + precise localized reason.
      // Never interpret a 400 response as success, and never mark a TEST status verified.
      const serverReason = english && error.messageEn ? error.messageEn : error.message;
      if (error.httpStatus === 409 && error.code === "DOCUMENT_VERIFICATION_REQUIRED") {
        setFeedback(friendlyError(error,error.code), "error");
      } else if ((error.httpStatus === 400 || error.httpStatus === 403) && error.field && legalControls[error.field]) {
        validationAttempted = true;
        clearAllFieldErrors();
        setFieldError(error.field, serverReason || friendlyError(error,error.code));
        legalControls[error.field].focus({preventScroll:true});
        legalControls[error.field].scrollIntoView({behavior:"smooth",block:"center"});
        setFeedback(tr("Le serveur a refusé la déclaration. Corrige le champ en rouge.","The server rejected the declaration. Correct the field highlighted in red."),"error");
      } else {
        setFeedback(friendlyError(error, error.code), "error", error.code === "NON_JSON_RESPONSE" || error.code === "INVALID_JSON_RESPONSE");
      }
      if (error.code === "NON_JSON_RESPONSE" || error.code === "INVALID_JSON_RESPONSE") ready = false;
    } finally {
      busy = false;
      refreshSaveState();
    }
  });
  await Promise.all([loadDeclaration(), loadExternalVerification()]);
}

// Fail closed on direct URL access: the commercial mode must be confirmed by THIS server.
(async () => {
  const state = await window.SonaraCommercial?.ready?.();
  if (!(state?.confirmedByApi === true && state.mode === "COMMERCIAL" && state.stripeEnabled === true && state.environment === "local")) {
    window.location.replace("/app/pages/creator/dashboard.html?mode=management");
    return;
  }
  await renderArtistLegalIdentity();
})().catch(() => window.location.replace("/app/pages/creator/dashboard.html?mode=management"));
