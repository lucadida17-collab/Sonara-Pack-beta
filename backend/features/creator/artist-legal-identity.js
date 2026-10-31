"use strict";
const {REGISTRATION_PORTALS} = require("./legal-registration-portals");

// Business registration is country-specific, and a declaration does not prove legal status.
// Never collect a national personal ID (SSN/SIN/NIN/UTR) via this form.
const ISO_COUNTRIES = Object.freeze("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" "));
const COUNTRY_SET = new Set(ISO_COUNTRIES);
const COMMON_TYPES = Object.freeze({
  FR: ["FR_SIRET", "FR_SIREN"],
  US: ["US_EIN", "US_STATE_REG"],
  GB: ["GB_CRN"],
  CA: ["CA_BN", "CA_NEQ"],
  BE: ["BE_BCE"],
  CH: ["CH_UID"],
  AU: ["AU_ABN"],
  NZ: ["NZ_NZBN"],
  IE: ["IE_CRO"],
  DE: ["DE_HRB"],
  NL: ["NL_KVK"],
  LU: ["LU_RCS"],
  MA: ["MA_ICE"],
  CI: ["OHADA_RCCM"], SN: ["OHADA_RCCM"], CM: ["OHADA_RCCM"],
  BJ: ["OHADA_RCCM"], BF: ["OHADA_RCCM"], ML: ["OHADA_RCCM"],
  NE: ["OHADA_RCCM"], TG: ["OHADA_RCCM"], GA: ["OHADA_RCCM"],
  CG: ["OHADA_RCCM"], CD: ["OHADA_RCCM"], CF: ["OHADA_RCCM"],
  TD: ["OHADA_RCCM"], GQ: ["OHADA_RCCM"], GW: ["OHADA_RCCM"],
  KM: ["OHADA_RCCM"], GN: ["OHADA_RCCM"]
});
const TYPE_LABELS = Object.freeze({
  FR_SIRET: "SIRET (établissement · 14 chiffres)", FR_SIREN: "SIREN (entreprise · 9 chiffres)",
  US_EIN: "EIN (entreprise · 9 chiffres)", US_STATE_REG: "State business registration number",
  GB_CRN: "Companies House number (CRN)",
  CA_BN: "Business Number (BN · 9 chiffres)", CA_NEQ: "Numéro d’entreprise du Québec (NEQ)",
  BE_BCE: "Numéro d’entreprise BCE / KBO", CH_UID: "IDE / UID (CHE)",
  AU_ABN: "Australian Business Number (ABN)", NZ_NZBN: "New Zealand Business Number (NZBN)",
  IE_CRO: "Company Registration Office number (CRO)", DE_HRB: "Numéro du registre du commerce (HRB / HRA)",
  NL_KVK: "Numéro KVK", LU_RCS: "Registre de commerce et des sociétés (RCS)",
  MA_ICE: "Identifiant commun de l'entreprise (ICE)", OHADA_RCCM: "Registre du commerce et du crédit mobilier (RCCM)",
  LOCAL_REGISTRATION: "Autre identifiant d’immatriculation professionnelle local"
});

function normalizeSiret(value) { return String(value == null ? "" : value).replace(/[ \t.-]/g, ""); }
function hasValidLuhn(value) {
  let sum = 0;
  for (let index = value.length - 1, double = false; index >= 0; index--, double = !double) {
    let digit = Number(value[index]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}
function validateSiret(value) {
  const siret = normalizeSiret(value);
  if (!/^\d{14}$/.test(siret)) return { valid: false, code: "SIRET_FORMAT_INVALID" };
  if (/^0+$/.test(siret)) return {valid:false,code:"REGISTRATION_PLACEHOLDER_INVALID"};
  if (!hasValidLuhn(siret)) return { valid: false, code: "SIRET_CHECKSUM_INVALID" };
  return { valid: true, siret };
}
function allowedTypes(country) {
  return [...(COMMON_TYPES[country] || []), "LOCAL_REGISTRATION"];
}
function validateRegistrationNumber(type, value, {localTestSimulation = false} = {}) {
  if (typeof value !== "string" || value.length > 80) return { valid: false, code: "REGISTRATION_NUMBER_INVALID" };
  const clean = value.normalize("NFKC").trim();
  const digits = clean.replace(/[\s.\-]/g, "");
  const requiredDigits = {FR_SIREN:9,FR_SIRET:14,US_EIN:9,CA_BN:9,CA_NEQ:10,BE_BCE:10,AU_ABN:11,NZ_NZBN:13,NL_KVK:8,MA_ICE:15};
  if (Object.prototype.hasOwnProperty.call(requiredDigits, type)) {
    if (!/^\d+$/.test(digits) || digits.length !== requiredDigits[type]) return { valid: false, code: "REGISTRATION_FORMAT_INVALID" };
    // A sequence of zeros passes some mathematical checks, but is not a valid issued number.
    if (/^0+$/.test(digits) && !localTestSimulation) return {valid:false,code:"REGISTRATION_PLACEHOLDER_INVALID"};
    if (type === "FR_SIRET" && !localTestSimulation && !hasValidLuhn(digits)) return {valid:false,code:"SIRET_CHECKSUM_INVALID"};
    if (type === "FR_SIREN" && !localTestSimulation && !hasValidLuhn(digits)) return {valid:false,code:"SIREN_CHECKSUM_INVALID"};
    if (type === "AU_ABN" && !localTestSimulation) {
      const weights = [10,1,3,5,7,9,11,13,15,17,19];
      const sum = [...digits].reduce((n,d,i)=>n + (Number(d)-(i===0?1:0))*weights[i],0);
      if (sum % 89 !== 0) return {valid:false,code:"ABN_CHECKSUM_INVALID"};
    }
    return { valid: true, registrationNumber: digits };
  }
  if (type === "GB_CRN") {
    const n = clean.replace(/\s/g, "").toUpperCase();
    if (!/^(?:\d{1,8}|[A-Z]{2}\d{6})$/.test(n)) return {valid:false,code:"REGISTRATION_FORMAT_INVALID"};
    return {valid:true,registrationNumber:n};
  }
  if (type === "CH_UID") {
    const n = clean.replace(/[\s.\-]/g, "").toUpperCase();
    if (!/^CHE\d{9}$/.test(n)) return {valid:false,code:"REGISTRATION_FORMAT_INVALID"};
    return {valid:true,registrationNumber:`CHE-${n.slice(3,6)}.${n.slice(6,9)}.${n.slice(9)}`};
  }
  // Generic registrations are format checked only, not matched against a national registry.
  if (!/^[A-Za-z0-9][A-Za-z0-9 .\/_-]{2,39}$/.test(clean)) return { valid:false,code:"REGISTRATION_FORMAT_INVALID" };
  return {valid:true,registrationNumber:clean};
}
function normalizeSubmission(body, {localTestSimulation = false} = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {valid:false,code:"INVALID_REQUEST"};
  // Compatibility with the preceding French-only interface, including deletion.
  if (typeof body.siret === "string" && body.country == null && body.identifierType == null) {
    if (body.siret.length > 32) return {valid:false,code:"SIRET_FORMAT_INVALID"};
    if (!body.siret.trim()) return { valid:true,clear:true };
    const checked = validateSiret(body.siret);
    return checked.valid ? {valid:true,country:"FR",activityType:"registered",identifierType:"FR_SIRET",registrationNumber:checked.siret,legalName:""} : checked;
  }
  // Saving an untouched form must NEVER be interpreted as a declaration or a deletion.
  // Clearing is an explicit and separate user action; retain legacy SIRET-only API above.
  if (body.activityType === "not_provided" || body.activityType === "") {
    return body.clear === true ? {valid:true,clear:true} : {valid:false,code:"ACTIVITY_TYPE_REQUIRED"};
  }
  const country = String(body.country || "").toUpperCase();
  if (!COUNTRY_SET.has(country)) return {valid:false,code:"COUNTRY_INVALID"};
  if (body.activityType === "individual_no_number") {
    // Require an explicit attestation: this option is not a shortcut for an empty form.
    if (body.individualAttested !== true) return {valid:false,code:"INDIVIDUAL_ATTESTATION_REQUIRED"};
    return {valid:true,country,activityType:"individual_no_number",identifierType:null,registrationNumber:null,legalName:""};
  }
  if (body.activityType !== "registered") return {valid:false,code:"ACTIVITY_TYPE_INVALID"};
  const identifierType = String(body.identifierType || "");
  if (!allowedTypes(country).includes(identifierType)) return {valid:false,code:"IDENTIFIER_TYPE_INVALID"};
  const checked = validateRegistrationNumber(identifierType,body.registrationNumber,{localTestSimulation:localTestSimulation && body.localTestMode === true});
  if (!checked.valid) return checked;
  if (body.legalName != null && (typeof body.legalName !== "string" || body.legalName.length > 140 || /[\u0000-\u001f<>]/.test(body.legalName))) {
    return {valid:false,code:"LEGAL_NAME_INVALID"};
  }
  const legalName = String(body.legalName || "").normalize("NFKC").trim();
  return {valid:true,country,activityType:"registered",identifierType,registrationNumber:checked.registrationNumber,legalName, testOnly: localTestSimulation && body.localTestMode === true};
}
// Stable field identifiers let the form highlight the precise control rejected by the server.
// Do not return untrusted user input in an error message.
function explainLegalIdentityError(code, body = {}) {
  const numberLengths = {FR_SIRET:14,FR_SIREN:9,US_EIN:9,CA_BN:9,CA_NEQ:10,BE_BCE:10,AU_ABN:11,NZ_NZBN:13,NL_KVK:8,MA_ICE:15};
  const type = String(body?.identifierType || (body?.siret !== undefined ? "FR_SIRET" : ""));
  const length = numberLengths[type];
  const label = ({FR_SIRET:"SIRET",FR_SIREN:"SIREN",US_EIN:"EIN",CA_BN:"BN",CA_NEQ:"NEQ",BE_BCE:"BCE",AU_ABN:"ABN",NZ_NZBN:"NZBN",NL_KVK:"KVK",MA_ICE:"ICE"})[type] || "numéro d'immatriculation";
  const rules = {
    INVALID_REQUEST:[null,"La demande envoyée est invalide.","Invalid request."],
    COUNTRY_INVALID:["country","Sélectionne un pays reconnu.","Select a supported country."],
    ACTIVITY_TYPE_REQUIRED:["activityType","Sélectionne ta situation professionnelle.","Choose your business status."],
    ACTIVITY_TYPE_INVALID:["activityType","Cette situation professionnelle n'est pas autorisée.","This business status is not supported."],
    INDIVIDUAL_ATTESTATION_REQUIRED:["individualAttested","Confirme la déclaration individuelle pour continuer.","Confirm your individual declaration to continue."],
    IDENTIFIER_TYPE_INVALID:["identifierType","Choisis un identifiant compatible avec le pays sélectionné.","Choose an identifier supported in the selected country."],
    REGISTRATION_NUMBER_INVALID:["registrationNumber","Saisis un numéro d'immatriculation professionnel valide.","Enter a valid business registration number."],
    REGISTRATION_PLACEHOLDER_INVALID:["registrationNumber","Ce numéro fictif ou composé uniquement de zéros est refusé.","Placeholder or all-zero registration numbers are not accepted."],
    SIRET_CHECKSUM_INVALID:["registrationNumber","La clé de contrôle du SIRET est invalide.","The SIRET check digit is invalid."],
    SIREN_CHECKSUM_INVALID:["registrationNumber","La clé de contrôle du SIREN est invalide.","The SIREN check digit is invalid."],
    ABN_CHECKSUM_INVALID:["registrationNumber","La clé de contrôle de l'ABN est invalide.","The ABN checksum is invalid."],
    LOCAL_SIMULATION_FORBIDDEN:["localTestMode","Le mode test est strictement réservé au serveur LOCAL V1.","Test mode is only available on the LOCAL V1 server."],
    DOCUMENT_VERIFICATION_REQUIRED:["proof","La vérification du justificatif par le prestataire n’est pas configurée. Utilise le mode test LOCAL ou termine la configuration du prestataire.","External document verification is not configured. Use LOCAL test mode or configure the provider."],
    LEGAL_NAME_INVALID:["legalName","Le nom légal contient des caractères interdits ou dépasse 140 caractères.","The legal name contains forbidden characters or exceeds 140 characters."]
  };
  if (code === "REGISTRATION_FORMAT_INVALID" || code === "SIRET_FORMAT_INVALID") {
    const fr = length ? `Le ${label} doit comporter exactement ${length} chiffres.` :
      type === "GB_CRN" ? "Le numéro Companies House doit contenir jusqu'à 8 caractères valides." :
      type === "CH_UID" ? "Le format suisse attendu est CHE-123.456.789." :
      "Le format du numéro d'immatriculation n'est pas valide pour ce registre.";
    const en = length ? `The ${label} must contain exactly ${length} digits.` :
      type === "GB_CRN" ? "The Companies House number must have up to 8 valid characters." :
      type === "CH_UID" ? "The expected Swiss format is CHE-123.456.789." :
      "The business registration number format is invalid for this registry.";
    return {field:"registrationNumber",message:fr,messageEn:en};
  }
  const [field,message,messageEn] = rules[code] || [null,"Déclaration refusée par le serveur.","Declaration rejected by the server."];
  return {field,message,messageEn};
}

function artistLegalSummary(account = {}) {
  const source = account.artistLegalIdentity || {};
  const legacy = typeof source.siret === "string" && /^\d{14}$/.test(source.siret) ? source.siret : "";
  const country = COUNTRY_SET.has(source.country) ? source.country : (legacy ? "FR" : null);
  const registrationNumber = typeof source.registrationNumber === "string" && source.registrationNumber.length <= 80
    ? source.registrationNumber : legacy;
  const activityType = source.activityType === "individual_no_number" ? "individual_no_number"
    : (registrationNumber ? "registered" : "not_provided");
  const identifierType = activityType === "registered" ? (source.identifierType || (legacy ? "FR_SIRET" : "LOCAL_REGISTRATION")) : null;
  return {
    country, activityType, identifierType,
    countryName: country ? new Intl.DisplayNames(["fr"], { type: "region" }).of(country) : null,
    identifierLabel: identifierType ? TYPE_LABELS[identifierType] || TYPE_LABELS.LOCAL_REGISTRATION : null,
    registrationNumber: activityType === "registered" ? (registrationNumber || null) : null,
    legalName: activityType === "registered" ? String(source.legalName || "").slice(0,140) : "",
    // Preserve existing Founder and clients that read SIRET, without mislabelling other countries.
    siret: identifierType === "FR_SIRET" && source.testOnly !== true ? registrationNumber || null : null,
    status: source.testOnly === true ? "test_simulated" : activityType === "registered" ? "declared_unverified" : activityType === "individual_no_number" ? "self_declared_unverified" : "not_provided",
    testOnly: source.testOnly === true,
    registrationCheck: source.registrationCheck && ["registry_matched", "format_only"].includes(source.registrationCheck.status)
      ? { status: source.registrationCheck.status,
          checkedAt: source.registrationCheck.checkedAt || null,
          source: source.registrationCheck.source || null,
          registryName: String(source.registrationCheck.registryName || "").slice(0,140),
          registryUrl: String(source.registrationCheck.registryUrl || "").slice(0,220),
          ownershipVerified: false }
      : null,
    updatedAt: source.updatedAt || null
  };
}
// Never conflate Stripe payment capabilities with verified business registration.
// Only the external provider may attest to its checks. TEST is explicitly simulated.
function externalVerificationSummary(stripeAccount, environment="local") {
  const requirements = stripeAccount?.requirements || {};
  const due = Array.isArray(requirements.currently_due) ? requirements.currently_due.length : 0;
  const pending = Array.isArray(requirements.pending_verification) ? requirements.pending_verification.length : 0;
  let status = "needs_information";
  if (due === 0 && pending > 0) status="in_review";
  else if (due === 0 && pending === 0 && stripeAccount?.details_submitted && stripeAccount?.charges_enabled && stripeAccount?.payouts_enabled) status="test_ready";
  return {
    status,
    environment,
    provider:"stripe_connect",
    // No account IDs, uploaded documents, personal data or full requirements are returned.
    officiallyVerified:false,
    isTestOnly:true
  };
}
// Public French company registry. This verifies a published registry entry,
// NOT its ownership by the artist nor permission to sell on the marketplace.
async function lookupFrenchBusiness(checked, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("REGISTRY_UNAVAILABLE");
  const wanted = checked.registrationNumber;
  const response = await fetchImpl(
    `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(wanted)}&per_page=2`,
    { headers: { Accept: "application/json", "User-Agent": "SonaraPack-LocalRegistrationCheck/1.0" },
      signal: AbortSignal.timeout(7000) }
  );
  if (!response.ok) throw new Error("REGISTRY_UNAVAILABLE");
  const payload = await response.json();
  const businesses = Array.isArray(payload?.results) ? payload.results : [];
  const entry = businesses.find(item => {
    if (!item || typeof item.siren !== "string") return false;
    if (checked.identifierType === "FR_SIREN") return item.siren === wanted;
    if (item.siren !== wanted.slice(0, 9)) return false;
    const establishments = [item.siege, ...(Array.isArray(item.matching_etablissements) ? item.matching_etablissements : [])];
    return establishments.some(site => site?.siret === wanted);
  });
  if (!entry) return { status: "not_found" };
  const name = String(entry.nom_complet || entry.nom_raison_sociale || "").slice(0, 140);
  return { status: "registry_matched", registryName: name,
    registryUrl: `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(entry.siren)}` };
}

function registerArtistLegalIdentityRoutes({ app, saveAccountState, verificationProvider = null, localV1Simulation = false, requireProviderDocument = false, registryLookup = lookupFrenchBusiness }) {
  function currentArtist(req,res) {
    const identity = req.sonaraIdentity;
    if (!identity?.account || !identity.rootUser) { res.status(401).json({success:false,code:"AUTH_REQUIRED"}); return null; }
    if (!["artist","both"].includes(String(identity.account.role || "").toLowerCase())) {
      res.status(403).json({success:false,code:"ARTIST_REQUIRED"}); return null;
    }
    return identity;
  }
  // Read-only controller status for the authenticated artist only.
  // Stripe Connect is already part of LOCAL; MAIN/TEST never contact Stripe here.
  app.get("/api/creator/legal-identity/verification", async (req,res) => {
    const auth=currentArtist(req,res); if (!auth) return;
    res.setHeader("Cache-Control","no-store");
    const enabled=verificationProvider?.enabled === true && verificationProvider.environment === "local";
    if (!enabled) return res.json({success:true,status:"disabled",environment:"main",provider:"none",officiallyVerified:false});
    // Existing LOCAL Connect creation is configured for French Express accounts.
    // Do not present it as a universal registry validator for 249 jurisdictions.
    const declaredCountry=artistLegalSummary(auth.account).country;
    if (declaredCountry && declaredCountry !== "FR") return res.json({
      success:true,status:"country_not_supported",environment:"local",provider:"stripe_connect",
      officiallyVerified:false,isTestOnly:true
    });
    if (!auth.account.stripeAccountId) return res.json({success:true,status:"not_connected",environment:"local",provider:"stripe_connect",officiallyVerified:false,isTestOnly:true});
    try {
      const providerAccount=await verificationProvider.retrieveAccount(auth.account.stripeAccountId);
      if (!providerAccount || providerAccount.livemode === true) {
        // Local is strictly TEST: never permit a live Stripe connection here.
        return res.status(503).json({success:false,code:"INVALID_PROVIDER_ENVIRONMENT"});
      }
      return res.json({success:true,...externalVerificationSummary(providerAccount,"local")});
    } catch (error) {
      console.warn("[LEGAL] Statut Connect indisponible:",error?.type || "PROVIDER_ERROR");
      return res.status(503).json({success:false,code:"EXTERNAL_VERIFICATION_UNAVAILABLE"});
    }
  });
  app.get("/api/creator/legal-identity", (req,res) => {
    const auth=currentArtist(req,res); if (!auth) return;
    res.setHeader("Cache-Control","no-store");
    return res.json({success:true,legalIdentity:artistLegalSummary(auth.account),countries:ISO_COUNTRIES,registrationPortals:REGISTRATION_PORTALS,typesByCountry:COMMON_TYPES,typeLabels:TYPE_LABELS,localV1Simulation,documentPolicy:{requiredForLiveV1:true,localTestBypass:localV1Simulation,uploadHandledBy:"external_provider",providerReady:false}});
  });
  // REGISTRY CHECK — LOCAL V1 only. Authenticated artist; no client artistId is trusted.
  // No fake "verified" status for unsupported countries, and no payment unlock.
  app.post("/api/creator/legal-identity/check-registration", async (req,res) => {
    const auth=currentArtist(req,res); if (!auth) return;
    res.setHeader("Cache-Control", "no-store");
    if (!localV1Simulation) return res.status(403).json({success:false,code:"LOCAL_V1_ONLY"});
    if (req.body?.ownershipAttested !== true) {
      return res.status(400).json({success:false,code:"OWNERSHIP_ATTESTATION_REQUIRED",
        message:"Confirme que ce numéro correspond à ton activité avant la vérification."});
    }
    const checked = normalizeSubmission({...req.body, activityType:"registered", localTestMode:false});
    if (!checked.valid) return res.status(400).json({success:false,code:checked.code,
      ...explainLegalIdentityError(checked.code,req.body)});
    const country=checked.country;
    let result = {status:"format_only"};
    if (country === "FR" && ["FR_SIRET","FR_SIREN"].includes(checked.identifierType)) {
      try { result = await registryLookup(checked); }
      catch (error) {
        console.warn("[LEGAL] Registre français indisponible:",error?.message || "REGISTRY_UNAVAILABLE");
        return res.status(503).json({success:false,code:"REGISTRY_UNAVAILABLE",
          message:"Le registre officiel est indisponible. Aucun résultat n'a été validé ; réessaie plus tard."});
      }
      if (result.status !== "registry_matched") return res.status(200).json({
        success:true,registrationCheck:{status:"not_found",ownershipVerified:false},
        message:"Aucune correspondance dans les données publiques. Cela ne prouve pas que ton activité n'est pas déclarée."});
    }
    const registryCheck={status:result.status,source:result.status === "registry_matched" ? "api_recherche_entreprises" : "local_format",
      checkedAt:new Date().toISOString(), registryName:result.registryName || "",registryUrl:result.registryUrl || "",
      ownershipVerified:false};
    const next={country,activityType:"registered",identifierType:checked.identifierType,
      registrationNumber:checked.registrationNumber,legalName:checked.legalName || "",
      siret:checked.identifierType === "FR_SIRET" ? checked.registrationNumber : null,
      testOnly:false,registrationCheck:registryCheck,updatedAt:new Date().toISOString()};
    const previousRecord = auth.account.artistLegalIdentity;
    auth.account.artistLegalIdentity=next;
    try { await saveAccountState(auth.rootUser,auth.account); }
    catch(error) {
      if (previousRecord === undefined) delete auth.account.artistLegalIdentity;
      else auth.account.artistLegalIdentity = previousRecord;
      console.error("[LEGAL] Enregistrement impossible:",error?.message);
      return res.status(503).json({success:false,code:"SAVE_UNAVAILABLE"});
    }
    return res.json({success:true,legalIdentity:artistLegalSummary(auth.account),registrationCheck:registryCheck,
      message:result.status === "registry_matched" ? "Immatriculation retrouvée dans le registre public français. Le titulaire et ses obligations restent à vérifier." :
        "Format du numéro contrôlé. Aucune vérification dans un registre officiel n'est disponible pour ce pays."});
  });
  app.patch("/api/creator/legal-identity", async (req,res) => {
    const auth=currentArtist(req,res); if (!auth) return;
    // A client-controlled checkbox never authorizes production bypasses.
    // LOCAL simulation also requires a loopback connection, not just an API flag.
    const rawIp = String(req.socket?.remoteAddress || req.ip || "");
    const loopback = rawIp === "127.0.0.1" || rawIp === "::1" || rawIp === "::ffff:127.0.0.1";
    const simulate = localV1Simulation && loopback && req.body?.localTestMode === true;
    if (req.body?.localTestMode === true && !simulate) {
      return res.status(403).json({success:false,code:"LOCAL_SIMULATION_FORBIDDEN",...explainLegalIdentityError("LOCAL_SIMULATION_FORBIDDEN",req.body)});
    }
    const checked=normalizeSubmission(req.body,{localTestSimulation:simulate});
    if (checked.valid && !checked.clear && requireProviderDocument && !simulate) {
      // Fail closed rather than pretend a PDF has been checked or uploaded to Stripe.
      return res.status(409).json({success:false,code:"DOCUMENT_VERIFICATION_REQUIRED",...explainLegalIdentityError("DOCUMENT_VERIFICATION_REQUIRED",req.body)});
    }
    if (!checked.valid) return res.status(400).json({success:false,code:checked.code,...explainLegalIdentityError(checked.code,req.body)});
    const previous=artistLegalSummary(auth.account);
    const next=checked.clear ? null : {
      country:checked.country,activityType:checked.activityType,identifierType:checked.identifierType,
      registrationNumber:checked.registrationNumber,legalName:checked.legalName,
      testOnly:simulate,
      // Backward compatibility with the previous SIRET field; never for non-French registrations.
      siret:checked.identifierType === "FR_SIRET" ? checked.registrationNumber : null,
      updatedAt:new Date().toISOString()
    };
    if (next && previous.country === next.country && previous.identifierType === next.identifierType &&
        previous.registrationNumber === next.registrationNumber && previous.registrationCheck) {
      next.registrationCheck = previous.registrationCheck;
    }
    const same=checked.clear ? previous.activityType === "not_provided" :
      previous.country === next.country && previous.activityType === next.activityType && previous.identifierType === next.identifierType &&
      previous.registrationNumber === next.registrationNumber && (previous.legalName||"") === next.legalName && previous.testOnly === next.testOnly;
    if (!same) {
      if (checked.clear) delete auth.account.artistLegalIdentity;
      else auth.account.artistLegalIdentity=next;
      try { await saveAccountState(auth.rootUser,auth.account); }
      catch (error) { console.error("Erreur enregistrement identification légale:",error.message); return res.status(503).json({success:false,code:"SAVE_UNAVAILABLE"}); }
    }
    res.setHeader("Cache-Control","no-store");
    return res.json({success:true,legalIdentity:artistLegalSummary(auth.account)});
  });
}
module.exports={lookupFrenchBusiness,explainLegalIdentityError,externalVerificationSummary,ISO_COUNTRIES,COMMON_TYPES,TYPE_LABELS,normalizeSiret,hasValidLuhn,validateSiret,validateRegistrationNumber,normalizeSubmission,artistLegalSummary,registerArtistLegalIdentityRoutes};
