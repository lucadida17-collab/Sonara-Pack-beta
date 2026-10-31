const API_BASE = `${window.location.origin}/api/founder`;
const state = {
  token:
    localStorage.getItem(
      "founderSession"
    ) || "",
  view: "dashboard",
  notifications: [],
  overview: null,
  sonaraPackStatistics: null,
  organicVisibility: null,
  administrationSummary: null,
  urssafOpenStage: null,
  legalStateActive: null,
  legalStateTimer: null,
  environment: "local",
  moderationMode: "accounts",
  moderationSearch: "",
  moderationRegistrationSearch: "",
  moderationPacks: [],
  moderationAudioUrls: [],
  moderationAccountsReconciliation: null,
  moderationAccountsRefreshTimer: null,
  moderationAccountsSnapshot: null,
  moderationAccountsSnapshotEnvironment: null,
  moderationAccountsWarmPromise: null,
  moderationLoadId: 0,
  packCatalog: null,
  packPreviewControl: null
};
const founderFeedbackAttachmentUrls = new Set();
const loginView = document.getElementById("loginView");
const founderApp = document.getElementById("founderApp");
const content = document.getElementById("dynamicContent");
const pageTitle = document.getElementById("pageTitle");
const pageEyebrow = document.getElementById("pageEyebrow");

function icons() { if (window.lucide) window.lucide.createIcons(); }
function normalizeEnvironment(value = "local") {
  const environment = String(value || "local").toLowerCase();
  return ["local", "test", "main"].includes(environment) ? environment : "local";
}
function environmentLabel(value) {
  return { local: "LOCAL", test: "TEST", main: "MAIN" }[normalizeEnvironment(value)];
}
function environmentBadge(value) {
  const environment = normalizeEnvironment(value || state.environment);
  return `<span class="environment-badge environment-${environment}">${environmentLabel(environment)}</span>`;
}
function rememberEnvironment(data = {}) {
  state.environment = normalizeEnvironment(data.connectedEnvironment || data.environment || state.environment);
  return state.environment;
}

function escapeHTML(value = "") { const div = document.createElement("div"); div.textContent = String(value); return div.innerHTML; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function asNumber(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function formatDate(value) { if (!value) return "Date inconnue"; return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function formatAdministrationDate(
  value
) {
  if (!value) {
    return "Aucune date";
  }

  const date =
    new Date(
      `${value}T12:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Date invalide";
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      dateStyle: "medium"
    }
  ).format(date);
}

function formatAdministrationMoney(
  value
) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      style: "currency",
      currency: "EUR"
    }
  ).format(
    asNumber(value)
  );
}

function selectedAttribute(
  current,
  expected
) {
  return String(current) ===
    String(expected)
    ? "selected"
    : "";
}

function checkedAttribute(value) {
  return value === true ? "checked" : "";
}

function financialControlPhaseLabel(phase) {
  return {
    locked: "Dashboard verrouillée",
    simulation: "Simulation active",
    real_waiting_connection: "MAIN réel · connexion à compléter",
    real_configuration: "MAIN réel · paramètres à compléter",
    real: "MAIN réel · automatique",
    stripe_live_required: "Stripe Live à vérifier",
    stripe_connect_required: "Connect MAIN à vérifier",
    bank_required: "Banque à vérifier",
    webhook_required: "Webhook Live à vérifier",
    main_ready: "Prêt pour MAIN",
    urssaf_rules_required: "MAIN actif · règles à configurer",
    urssaf_active: "MAIN et obligations actifs"
  }[phase] || "Contrôle financier";
}

function financialControlStepLabel(status) {
  return {
    completed: "Validé",
    action_required: "À faire",
    ready: "Prêt",
    locked: "Verrouillé"
  }[status] || status;
}

function financialForecastStatusLabel(status) {
  return {
    estimated: "Estimation",
    configuration_required: "À configurer",
    not_applicable: "Non applicable",
    official: "Officiel"
  }[status] || status || "À vérifier";
}

function updateAdministrationBadge(
  summary = {}
) {
  state.administrationSummary =
    asObject(summary);

  const badge =
    document.getElementById(
      "navAdministrationBadge"
    );

  if (!badge) {
    return;
  }

  const count =
    asNumber(
      summary.actionRequired
    );

  badge.textContent =
    count > 99
      ? "99+"
      : String(count);

  badge.classList.toggle(
    "is-hidden",
    count <= 0
  );
}

async function refreshAdministrationSection(
  renderSection
) {
  const scrollTop =
    window.scrollY ||
    document.documentElement.scrollTop ||
    0;

  await renderSection();

  window.requestAnimationFrame(
    () => {
      window.scrollTo({
        top: scrollTop,
        left: 0,
        behavior: "auto"
      });
    }
  );
}

function administrationStatusLabel(
  status
) {
  return {
    draft: "Brouillon",
    ready: "Prêt à déposer",
    submitted: "Déposé",
    processing: "En cours",
    approved: "Immatriculé",
    rejected: "À corriger",
    missing: "Manquant",
    accepted: "Accepté",
    todo: "À traiter",
    scheduled: "Planifié",
    paid: "Payé",
    resolved: "Résolu",
    cancelled: "Annulé",
    overdue: "En retard",
    not_connected: "Non connectée"
  }[status] || status || "Inconnu";
}

function administrationTypeLabel(
  type
) {
  return {
    declaration: "Déclaration",
    cotisation: "Cotisation",
    payment: "Paiement",
    message: "Message",
    document: "Document",
    control: "Contrôle",
    other: "Autre"
  }[type] || "Autre";
}
function moderationCoverUrl(item = {}) {
  const value = String(item.coverPack || item.cover || "").trim();
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;

  const baseUrl = String(item.connectedUrl || "").replace(/\/+$/, "");
  if (!baseUrl) return "";

  const clean = value.replace(/^\/+/, "");
  return clean.startsWith("uploads/")
  ? `${baseUrl}/${clean}`
  : `${baseUrl}/uploads/${clean}`;
}
function showToast(message, tone = "success") { const toast = document.createElement("div"); toast.className = `toast ${tone}`; toast.textContent = message; document.getElementById("toastZone").appendChild(toast); setTimeout(() => toast.remove(), 3000); }
async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}), Authorization: `Bearer ${state.token}` } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { logout(false); throw new Error("Session expirée"); }
  if (!response.ok) throw new Error(data.message || `Action impossible (${response.status})`);
  return data;
}
async function apiBlob(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });

  if (response.status === 401) {
    logout(false);
    throw new Error("Session expirée");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Fichier indisponible (${response.status})`);
  }

  return response.blob();
}

function setConnection(ok) { const el = document.getElementById("connectionState"); el.classList.toggle("is-online", ok); el.innerHTML = `<span></span>${ok ? "Sonara Pack connecté" : "Sonara Pack hors ligne"}`; }
function updateBadges(count = 0) { [document.getElementById("bellBadge"), document.getElementById("navUnreadBadge")].forEach(el => { el.textContent = count; el.classList.toggle("is-hidden", count <= 0); }); }
function updateLicenseIncidentBadge(count = 0) { const el = document.getElementById("navLicenseIncidentBadge"); if (!el) return; const safe = Math.max(0, asNumber(count)); el.textContent = safe > 99 ? "99+" : String(safe); el.classList.toggle("is-hidden", safe <= 0); }
function showApp() {
  loginView.classList.add("is-hidden");
  founderApp.classList.remove("is-hidden");
  refreshOverview();
  renderView("dashboard");
  startLegalStateWatch();
}

function logout(notify = true) {
  state.token = "";
  localStorage.removeItem("founderSession");
  if (state.legalStateTimer) {
    window.clearInterval(state.legalStateTimer);
    state.legalStateTimer = null;
  }
  state.legalStateActive = null;
  founderApp.classList.add("is-hidden");
  loginView.classList.remove("is-hidden");
  if (notify) showToast("Session Founder fermée.");
}

async function checkSharedLegalState() {
  if (!state.token) return;

  try {
    const response = asObject(await api("/legal-state"));
    rememberEnvironment(response);
    const legalState = asObject(response.legalState);
    const active = legalState.active === true;
    const previous = state.legalStateActive;
    state.legalStateActive = active;

    if (previous === false && active) {
      showToast(
        normalizeEnvironment(state.environment) === "main"
          ? "Immatriculation réelle détectée : dashboard MAIN activée."
          : `Immatriculation réelle détectée : simulation ${environmentLabel(state.environment)} activée.`
      );
      await refreshOverview();

      if (document.querySelector(".urssaf-progress-panel, .administration-financial-control, .sasu-summary-panel")) {
        state.urssafOpenStage = null;
        await renderAdministrationUrssaf();
      }
    }
  } catch {
    // Le polling juridique ne doit jamais perturber l'utilisation normale de Founder.
  }
}

function startLegalStateWatch() {
  if (state.legalStateTimer) return;
  checkSharedLegalState();
  state.legalStateTimer = window.setInterval(checkSharedLegalState, 15000);
}


async function refreshOverview() {
  try {
    const [overviewResponse, incidentResponse] = await Promise.all([
      api("/overview"),
      api("/license-incidents").catch(() => ({ items: [] }))
    ]);
    const data = asObject(overviewResponse);
    const incidentData = asObject(incidentResponse);
    const incidents = asArray(incidentData.items || incidentData.incidents);

    rememberEnvironment(data);

    const counts =
      asObject(
        data.counts ||
        data.stats
      );

    state.overview = data;

    updateBadges(
      asNumber(
        counts.unreadNotifications
      )
    );

    updateLicenseIncidentBadge(
      incidents.filter((item) => String(item?.status || "PENDING").toUpperCase() === "PENDING").length
    );

    updateAdministrationBadge(
      asObject(
        data.administrationSummary
      )
    );

    setConnection(
      Boolean(
        data.sonaraConnected
      )
    );
  } catch (error) {
    setConnection(false);
  }
}

function metricCard(icon, label, value, hint, view) { return `<button class="metric-card" data-jump="${view}"><span class="metric-icon"><i data-lucide="${icon}"></i></span><span><small>${label}</small><strong>${value ?? 0}</strong><em>${hint}</em></span></button>`; }
async function renderDashboard() {
  content.innerHTML = `<section class="loading-card">Chargement de Sonara Pack…</section>`;
  try {
    const [data, statistics] = await Promise.all([
      api("/overview").then(asObject),
      api("/sonara-pack/statistics").then(asObject).catch(() => ({}))
    ]);
    rememberEnvironment(data);
    const counts = asObject(data.counts || data.stats);
    const downloads = asObject(statistics.downloads);
    const recentNotifications =
      asArray(
        data.recentNotifications ||
        data.notifications
      );

    const administrationSummary =
      asObject(
        data.administrationSummary
      );

    state.overview = data;
    state.sonaraPackStatistics = statistics;

    updateBadges(
      counts.unreadNotifications ||
      0
    );

    updateAdministrationBadge(
      administrationSummary
    );

    setConnection(
      Boolean(
        data.sonaraConnected
      )
    );
    content.innerHTML = `
      <section class="hero-panel"><div><p class="eyebrow">Produit Sonara Pack ${environmentBadge(data.connectedEnvironment)}</p><h2>Piloter Sonara Pack.</h2><p>Les téléchargements, les alertes, la modération et le support de ce produit sont regroupés ici.</p></div><div class="level-card"><span>État du produit</span><strong>${counts.urgent > 0 ? "ALERTE" : "STABLE"}</strong><small>${counts.urgent || 0} urgence(s)</small></div></section>
      <section class="metrics-grid">
        ${metricCard("download", "Packs téléchargés", statistics.success ? asNumber(downloads.packs) : "—", statistics.success ? "Cumul réel" : "Donnée indisponible", "statistics")}
        ${metricCard("bell-ring", "Non lues", counts.unreadNotifications || 0, "À vérifier", "notifications")}
        ${metricCard("life-buoy", "Tickets ouverts", counts.openTickets || 0, "Support", "support")}
        ${metricCard("user-check", "Artistes", counts.pendingArtists || 0, "À modérer", "moderation")}
        ${metricCard("package-check", "Packs", counts.pendingPacks || 0, "À modérer", "moderation")}
      </section>
      <section class="two-columns">
        <article class="panel"><div class="panel-head"><div><p class="eyebrow">Radar</p><h3>Activité récente</h3></div><button class="text-button" data-jump="notifications">Tout voir</button></div><div class="compact-list">${recentNotifications.length ? recentNotifications.map(notificationRow).join("") : emptyState("Aucune alerte récente", "La zone est calme.")}</div></article>
        <article class="panel mission-panel"><p class="eyebrow">Action rapide</p><h3>Choisis ta prochaine mission</h3><div class="mission-buttons"><button data-jump="statistics"><i data-lucide="chart-no-axes-combined"></i>Voir les statistiques</button><button data-jump="support"><i data-lucide="life-buoy"></i>Traiter le support</button><button data-jump="moderation"><i data-lucide="shield"></i>Ouvrir la modération</button><button data-jump="planning"><i data-lucide="target"></i>Fixer la mission du jour</button></div></article>
      </section>`;
    bindJumps(); icons();
  } catch (error) { content.innerHTML = errorState(error.message); }
}

function sonaraPackStatisticCard(icon, label, value, detail, tone = "blue") {
  return `
    <article class="sonara-pack-statistic-card tone-${tone}">
      <span class="sonara-pack-statistic-icon"><i data-lucide="${icon}"></i></span>
      <span>
        <small>${escapeHTML(label)}</small>
        <strong>${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(asNumber(value))}</strong>
        <em>${escapeHTML(detail)}</em>
      </span>
    </article>
  `;
}

function organicSourceCard(row = {}) {
  const source = escapeHTML(row.source || "Other");
  const visitors = asNumber(row.visitors);
  const pageViews = asNumber(row.pageViews ?? row.visits);
  const signups = asNumber(row.signups);
  const conversion = asNumber(row.conversionRate);

  return `
    <article class="organic-source-card">
      <div class="organic-source-card-head">
        <strong>${source}</strong>
        <span>${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(conversion)} %</span>
      </div>
      <div class="organic-source-card-metrics">
        <span><small>Visiteurs</small><b>${new Intl.NumberFormat("fr-FR").format(visitors)}</b></span>
        <span><small>Pages publiques vues</small><b>${new Intl.NumberFormat("fr-FR").format(pageViews)}</b></span>
        <span><small>Inscriptions attribuées</small><b>${new Intl.NumberFormat("fr-FR").format(signups)}</b></span>
      </div>
    </article>
  `;
}

function organicRecentSignupRow(item = {}) {
  const identity = item.pseudo || item.accountId || "Compte Sonara";
  const context = [
    item.source,
    item.inApp ? `app ${item.inApp}` : "",
    item.browser ? `navigateur ${item.browser}` : "",
    item.campaign ? `campagne ${item.campaign}` : "",
    item.packId ? `pack ${item.packId}` : ""
  ].filter(Boolean).join(" · ");

  return `
    <article class="organic-signup-row">
      <span>
        <strong>${escapeHTML(identity)}</strong>
        <small>${escapeHTML(context || "Source organique")}</small>
      </span>
      <time>${formatDate(item.accountCreatedAt || item.linkedAt)}</time>
    </article>
  `;
}

function organicJourneyStepLabel(step = {}) {
  const labels = {
    language_choice: "Choix de langue affiché",
    language_selected: "Langue choisie",
    cinematic_started: "Cinématique démarrée",
    cinematic_completed: "Cinématique terminée",
    registration_started: "Inscription ouverte",
    account_pending: "Compte en attente",
    access_granted: "Accès à Sonara obtenu"
  };
  return labels[String(step.journeyStep || "")] || step.landingPath || "/";
}

function organicJourneyStepContext(step = {}) {
  const pieces = [];
  if (step.journeyKind === "event") pieces.push("Étape onboarding");
  else pieces.push(step.navigationType === "internal" ? "Navigation interne" : (step.source || "Direct"));
  if (step.journeyDetail) pieces.push(step.journeyDetail);
  if (step.inApp) pieces.push(`app ${step.inApp}`);
  if (step.browser) pieces.push(`navigateur ${step.browser}`);
  if (step.platform) pieces.push(step.platform);
  if (step.campaign) pieces.push(step.campaign);
  return pieces.filter(Boolean).join(" · ");
}

function organicJourneyCard(item = {}) {
  const identity = item.pseudo || item.accountId || "Compte Sonara";
  const historicalUnknown = item.attributionStatus === "historical_unknown";
  const observedSource = item.firstObservedSource || "Direct";
  const sourceLabel = historicalUnknown
    ? `Origine d’inscription inconnue · première source observée : ${observedSource}`
    : `Inscription attribuée à ${item.source || observedSource}`;
  const steps = asArray(item.journey);

  return `
    <article class="organic-journey-card">
      <div class="organic-journey-head">
        <div>
          <strong>${escapeHTML(identity)}</strong>
          <small>${escapeHTML(sourceLabel)}</small>
        </div>
        <span class="organic-journey-status ${historicalUnknown ? "is-unknown" : "is-attributed"}">${historicalUnknown ? "Historique antérieur au tracking" : "Source d’inscription connue"}</span>
      </div>
      <div class="organic-journey-meta">
        <span>Compte créé · ${formatDate(item.accountCreatedAt)}</span>
        <span>Première observation · ${formatDate(item.firstObservedAt)}</span>
        <span>Dernière observation · ${formatDate(item.lastObservedAt)}</span>
      </div>
      <div class="organic-journey-steps">
        ${steps.length ? steps.map((step, index) => `
          <div class="organic-journey-step">
            <span class="organic-journey-index">${index + 1}</span>
            <div>
              <strong>${escapeHTML(organicJourneyStepLabel(step))}</strong>
              <small>${escapeHTML(organicJourneyStepContext(step))}</small>
            </div>
            <time>${formatDate(step.capturedAt)}</time>
          </div>`).join("") : `<p class="muted">Aucune étape détaillée enregistrée.</p>`}
      </div>
    </article>
  `;
}

function organicCommunicationKitCard(item = {}) {
  const publicUrl = String(item.publicUrl || "");
  const coverUrl = String(item.coverUrl || "");
  const previewAudioUrl = String(item.previewAudioUrl || "");
  const promoImageUrl = String(item.promoImageUrl || "");
  const title = item.title || "Pack Sonara";
  const artist = item.artist || "Artiste Sonara";
  const category = item.category || "Sans catégorie";
  const trackedLinks = asObject(item.trackedLinks);
  const previewStart = Math.max(0, asNumber(item.previewStart));
  const previewDuration = Math.min(30, Math.max(1, asNumber(item.previewDuration, 30)));

  return `
    <article class="organic-kit-card">
      ${coverUrl ? `<img class="organic-kit-cover" src="${escapeHTML(coverUrl)}" alt="" loading="lazy">` : `<span class="organic-kit-cover organic-kit-cover-empty"><i data-lucide="image"></i></span>`}
      <div class="organic-kit-content">
        <div>
          <p class="eyebrow">${escapeHTML(category)}</p>
          <h4>${escapeHTML(title)}</h4>
          <small>${escapeHTML(artist)} · ${asNumber(item.trackCount)} titre(s)</small>
        </div>
        ${previewAudioUrl ? `<audio controls preload="metadata" src="${escapeHTML(previewAudioUrl)}" data-organic-preview data-preview-start="${previewStart}" data-preview-duration="${previewDuration}"></audio>` : `<p class="muted organic-kit-no-preview">Aucun aperçu audio disponible.</p>`}
        <div class="organic-kit-actions">
          ${publicUrl ? `<a class="text-button organic-kit-open" href="${escapeHTML(publicUrl)}" target="_blank" rel="noopener">Ouvrir la page publique</a>` : ""}
          ${publicUrl ? `<button class="secondary-button organic-kit-copy" type="button" data-copy-organic-link="${escapeHTML(publicUrl)}" data-copy-organic-label="Lien public"><i data-lucide="copy"></i>Lien public</button>` : ""}
          ${coverUrl ? `<a class="text-button organic-kit-open" href="${escapeHTML(coverUrl)}" target="_blank" rel="noopener">Cover</a>` : ""}
          ${promoImageUrl ? `<a class="text-button organic-kit-open" href="${escapeHTML(promoImageUrl)}" target="_blank" rel="noopener">Mockup Sonara</a>` : ""}
          ${trackedLinks.tiktok ? `<button class="secondary-button organic-kit-copy" type="button" data-copy-organic-link="${escapeHTML(trackedLinks.tiktok)}" data-copy-organic-label="Lien TikTok">TikTok</button>` : ""}
          ${trackedLinks.instagram ? `<button class="secondary-button organic-kit-copy" type="button" data-copy-organic-link="${escapeHTML(trackedLinks.instagram)}" data-copy-organic-label="Lien Instagram">Instagram</button>` : ""}
          ${trackedLinks.youtube ? `<button class="secondary-button organic-kit-copy" type="button" data-copy-organic-link="${escapeHTML(trackedLinks.youtube)}" data-copy-organic-label="Lien YouTube">YouTube</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function organicVisibilityMarkup(payload = {}) {
  if (payload.success !== true) {
    return `
      <section class="panel founder-organic-visibility">
        <p class="eyebrow">Acquisition organique</p>
        <h3>Tracking non disponible pour le moment.</h3>
        <p class="muted">Les statistiques Sonara Pack restent intactes. Cette brique peut être relue séparément dès que l’API organique répond.</p>
      </section>
    `;
  }

  const attribution = asObject(payload.attribution);
  const sources = asArray(attribution.bySource);
  const recentSignups = asArray(attribution.recentSignups);
  const journeys = asArray(attribution.journeys);
  const communication = asArray(payload.communication);
  const internalTraffic = asObject(attribution.internalTraffic);

  return `
    <section class="panel founder-organic-visibility">
      <div class="panel-head organic-visibility-head">
        <div>
          <p class="eyebrow">Acquisition organique ${environmentBadge(payload.connectedEnvironment || payload.environment)}</p>
          <h3>D’où viennent les utilisateurs.</h3>
          <p class="muted">Premier point d’entrée conservé par visiteur. Une inscription n’est attribuée que si le compte a été créé après cette arrivée.</p>
        </div>
        <div class="organic-visibility-totals">
          <span><small>Visiteurs</small><strong>${new Intl.NumberFormat("fr-FR").format(asNumber(attribution.visitors))}</strong></span>
          <span><small>Pages publiques vues</small><strong>${new Intl.NumberFormat("fr-FR").format(asNumber(attribution.pageViews ?? attribution.visits))}</strong></span>
          <span><small>Inscriptions attribuées</small><strong>${new Intl.NumberFormat("fr-FR").format(asNumber(attribution.attributedSignups))}</strong></span>
          <span><small>Pages internes exclues</small><strong>${new Intl.NumberFormat("fr-FR").format(asNumber(internalTraffic.pageViews ?? internalTraffic.visits))}</strong></span>
        </div>
      </div>
      <div class="organic-internal-device-actions">
        <button class="secondary-button" type="button" data-founder-internal-device="mark"><i data-lucide="shield-check"></i>Marquer cet appareil comme trafic interne</button>
        <button class="secondary-button" type="button" data-founder-internal-device="clear"><i data-lucide="shield-off"></i>Retirer le marquage de cet appareil</button>
        <p class="muted">Le marqueur sert uniquement aux statistiques de cet environnement. Il ne donne aucun accès Founder et peut être retiré à tout moment.</p>
      </div>
      <div class="organic-source-grid">
        ${sources.length ? sources.map(organicSourceCard).join("") : `<p class="muted">Aucune arrivée organique enregistrée.</p>`}
      </div>
      <div class="organic-visibility-columns">
        <div>
          <p class="eyebrow">Inscriptions attribuées</p>
          <div class="organic-signup-list">
            ${recentSignups.length ? recentSignups.map(organicRecentSignupRow).join("") : `<p class="muted">Aucune inscription organique attribuée pour le moment.</p>`}
          </div>
        </div>
        <div>
          <p class="eyebrow">Règle</p>
          <p class="muted">Google, TikTok, Instagram, YouTube, Direct et les autres sources sont isolés. Pour un compte créé avant l’installation du tracking, Founder n’invente jamais sa source d’origine : il l’affiche comme historique inconnu et commence seulement à tracer ce qui est observé ensuite.</p>
        </div>
      </div>
      <div class="organic-journey-section">
        <div class="organic-journey-title">
          <div><p class="eyebrow">Parcours utilisateurs</p><h4>Route observée depuis l’installation du tracking</h4></div>
          <small>${new Intl.NumberFormat("fr-FR").format(asNumber(attribution.linkedAccounts))} compte(s) relié(s)</small>
        </div>
        <div class="organic-journey-list">
          ${journeys.length ? journeys.map(organicJourneyCard).join("") : `<p class="muted">Aucun parcours lié à un compte n’a encore été observé.</p>`}
        </div>
      </div>
    </section>

    <section class="panel founder-communication-kits">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Communication catalogue</p>
          <h3>Matière prête à utiliser.</h3>
          <p class="muted">Ces éléments sont calculés à partir des packs déjà publiés. Aucun post TikTok, Instagram ou YouTube n’est envoyé automatiquement.</p>
        </div>
      </div>
      <div class="organic-kit-grid">
        ${communication.length ? communication.slice(0, 12).map(organicCommunicationKitCard).join("") : `<p class="muted">Aucun pack public disponible dans cet environnement.</p>`}
      </div>
    </section>
  `;
}

function bindOrganicVisibilityControls() {
  document.querySelectorAll("[data-copy-organic-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = String(button.dataset.copyOrganicLink || "");
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        showToast(`${button.dataset.copyOrganicLabel || "Lien public"} copié.`);
      } catch {
        showToast("Copie du lien impossible.", "error");
      }
    });
  });

  document.querySelectorAll("[data-founder-internal-device]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.founderInternalDevice === "clear" ? "clear" : "mark";
      button.disabled = true;
      try {
        const result = await api("/organic-visibility/internal-device-link", {
          method: "POST",
          body: JSON.stringify({ action })
        });
        const url = String(result?.url || "");
        if (!url) throw new Error("Lien Sonara indisponible.");
        window.open(url, "_blank", "noopener,noreferrer");
        showToast(action === "mark"
          ? "Sonara s’ouvre pour marquer cet appareil dans cet environnement."
          : "Sonara s’ouvre pour retirer le marquage interne de cet appareil.");
      } catch (error) {
        showToast(error.message || "Action trafic interne impossible.", "error");
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("audio[data-organic-preview]").forEach((audio) => {
    const start = Math.max(0, asNumber(audio.dataset.previewStart));
    const duration = Math.min(30, Math.max(1, asNumber(audio.dataset.previewDuration, 30)));
    const end = start + duration;
    let positioned = false;

    const position = () => {
      if (positioned || !Number.isFinite(audio.duration)) return;
      audio.currentTime = Math.min(start, Math.max(0, audio.duration - 0.05));
      positioned = true;
    };

    audio.addEventListener("loadedmetadata", position, { once: true });
    audio.addEventListener("play", () => {
      if (audio.currentTime < start - 0.25 || audio.currentTime >= end) audio.currentTime = start;
    });
    audio.addEventListener("timeupdate", () => {
      if (audio.currentTime >= end) {
        audio.pause();
        audio.currentTime = start;
      }
    });
  });
}

function registrationDateForGroup(group = {}) {
  const dates = asArray(group.accounts)
    .map((account) => new Date(account?.createdAt || ""))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  return dates.length ? dates[0].toISOString() : "";
}

function registrationAttributionIndex(payload = {}) {
  const index = new Map();
  const add = (item = {}) => {
    const accountId = String(item.accountId || "");
    if (!accountId) return;
    const candidate = {
      accountId,
      signupAttributed: item.signupAttributed === true || item.attributionStatus === "signup_attributed" || Boolean(item.source),
      source: String(item.source || ""),
      firstObservedSource: String(item.firstObservedSource || ""),
      firstObservedAt: item.firstObservedAt || "",
      lastObservedAt: item.lastObservedAt || "",
      attributionStatus: String(item.attributionStatus || (item.source ? "signup_attributed" : "historical_unknown")),
      campaign: String(item.campaign || ""),
      landingPath: String(item.landingPath || ""),
      browser: String(item.browser || ""),
      inApp: String(item.inApp || ""),
      platform: String(item.platform || ""),
      device: String(item.device || "")
    };
    const current = index.get(accountId);
    if (!current) {
      index.set(accountId, candidate);
      return;
    }
    if (!current.signupAttributed && candidate.signupAttributed) {
      index.set(accountId, { ...current, ...candidate });
      return;
    }
    index.set(accountId, {
      ...current,
      campaign: current.campaign || candidate.campaign,
      landingPath: current.landingPath || candidate.landingPath,
      firstObservedSource: current.firstObservedSource || candidate.firstObservedSource,
      firstObservedAt: current.firstObservedAt || candidate.firstObservedAt,
      lastObservedAt: current.lastObservedAt || candidate.lastObservedAt,
      browser: current.browser || candidate.browser,
      inApp: current.inApp || candidate.inApp,
      platform: current.platform || candidate.platform,
      device: current.device || candidate.device
    });
  };

  asArray(payload.accountAttributions).forEach(add);
  asArray(payload.recentSignups).forEach(add);
  asArray(payload.journeys).forEach(add);
  return index;
}

function registrationAttributionForGroup(group = {}, attributionIndex = new Map()) {
  const candidates = asArray(group.accounts)
    .map((account) => attributionIndex.get(String(account.accountId || account.id || "")))
    .filter(Boolean);
  return candidates.find((item) => item.signupAttributed) || candidates[0] || null;
}

function registrationRoleSummary(group = {}) {
  const roles = [...new Set(asArray(group.accounts)
    .map((account) => String(account.originalRole || account.role || "user").toLowerCase())
    .filter(Boolean))];
  return roles.length ? roles.join(" + ") : "user";
}

function registrationSourceInfo(attribution = null) {
  if (attribution?.signupAttributed) {
    return {
      key: String(attribution.source || "Other").toLowerCase(),
      label: attribution.source || "Other",
      detail: attribution.campaign ? `Campagne ${attribution.campaign}` : "Source d’inscription attribuée",
      known: true
    };
  }
  if (attribution?.firstObservedSource) {
    return {
      key: "unknown",
      label: "Historique inconnu",
      detail: `Première source observée : ${attribution.firstObservedSource}`,
      known: false
    };
  }
  return {
    key: "unknown",
    label: "Historique inconnu",
    detail: "Compte créé avant attribution disponible ou parcours non encore relié",
    known: false
  };
}

function founderRegistrationCard(group = {}, attributionIndex = new Map()) {
  const accounts = asArray(group.accounts);
  const primary = group.primaryAccount || accounts[0] || {};
  const rootUserId = String(group.rootUserId || primary.userId || primary.rootUserId || "");
  const identity = primary.pseudo || primary.artistname || primary.mail || "Compte Sonara";
  const email = primary.mail || accounts.find((account) => account.mail)?.mail || "E-mail non renseigné";
  const registrationDate = registrationDateForGroup(group);
  const attribution = registrationAttributionForGroup(group, attributionIndex);
  const source = registrationSourceInfo(attribution);
  const role = registrationRoleSummary(group);
  const accountIds = accounts.map((account) => account.accountId || account.id).filter(Boolean);
  const status = rootAccountControlState(group);
  const returnMetrics = founderGroupReturnMetrics(group);

  return `
    <article class="founder-registration-card" data-registration-source="${escapeHTML(source.key)}" data-registration-role="${escapeHTML(role)}">
      <div class="founder-registration-head">
        <span class="founder-registration-icon"><i data-lucide="user-plus"></i></span>
        <div class="founder-registration-identity">
          <p class="eyebrow">Nouvelle inscription ${environmentBadge(primary.environment || state.environment)}</p>
          <h3>${escapeHTML(identity)}</h3>
          <small>${escapeHTML(email)}</small>
        </div>
        <span class="founder-registration-source ${source.known ? "is-known" : "is-unknown"}">${escapeHTML(source.label)}</span>
      </div>
      <div class="founder-registration-grid">
        <div><span>Inscription</span><strong>${safeAccountDate(registrationDate)}</strong></div>
        <div><span>Dernière visite</span><strong>${returnMetrics.lastSeenAt ? safeAccountDate(returnMetrics.lastSeenAt) : "Non observée"}</strong></div>
        <div><span>Sessions</span><strong>${returnMetrics.sessionCount > 0 ? returnMetrics.sessionCount : "—"}</strong></div>
        <div><span>Jours actifs</span><strong>${returnMetrics.trackingKnown ? returnMetrics.activeDays : "—"}</strong></div>
        <div><span>Statut retour</span><strong>${escapeHTML(founderReturnStatusLabel(returnMetrics.status))}</strong></div>
        <div><span>Rôle initial</span><strong>${escapeHTML(role)}</strong></div>
        <div><span>État actuel</span><strong>${escapeHTML(accountStateLabel(status))}</strong></div>
        <div><span>Comptes liés</span><strong>${accounts.length}</strong></div>
      </div>
      <div class="founder-registration-origin">
        <div>
          <small>Origine</small>
          <strong>${escapeHTML(source.label)}</strong>
          <span>${escapeHTML(source.detail)}</span>
        </div>
        ${attribution?.landingPath ? `<div><small>Page d’arrivée</small><strong>${escapeHTML(attribution.landingPath)}</strong></div>` : ""}
        ${(attribution?.inApp || attribution?.browser || attribution?.platform || attribution?.device) ? `<div><small>Canal technique</small><strong>${escapeHTML([attribution.inApp, attribution.browser].filter(Boolean).join(" · ") || "Navigateur inconnu")}</strong><span>${escapeHTML([attribution.platform, attribution.device].filter(Boolean).join(" · "))}</span></div>` : ""}
      </div>
      <details class="founder-registration-ids">
        <summary>Identifiants techniques</summary>
        <div><span>ID général</span><code>${escapeHTML(rootUserId || "Non renseigné")}</code></div>
        <div><span>accountId</span><code>${escapeHTML(accountIds.join(", ") || "Non renseigné")}</code></div>
      </details>
    </article>`;
}

function bindRegistrationFiltering(groups = [], organicVisibility = {}) {
  const search = document.getElementById("registrationSearch");
  const sourceFilter = document.getElementById("registrationSourceFilter");
  const roleFilter = document.getElementById("registrationRoleFilter");
  const list = document.getElementById("registrationList");
  const count = document.getElementById("registrationVisibleCount");
  if (!search || !sourceFilter || !roleFilter || !list) return;

  const attributionIndex = registrationAttributionIndex(organicVisibility);
  const ordered = [...groups].sort((a, b) =>
    new Date(registrationDateForGroup(b) || 0) - new Date(registrationDateForGroup(a) || 0)
  );

  const draw = () => {
    const query = String(search.value || "").trim().toLowerCase();
    const sourceValue = sourceFilter.value;
    const roleValue = roleFilter.value;
    state.moderationRegistrationSearch = search.value || "";

    const filtered = ordered.filter((group) => {
      const attribution = registrationAttributionForGroup(group, attributionIndex);
      const source = registrationSourceInfo(attribution);
      const role = registrationRoleSummary(group);
      const accounts = asArray(group.accounts);
      const haystack = [
        group.rootUserId,
        source.label,
        source.detail,
        role,
        ...accounts.flatMap((account) => [
          account.pseudo,
          account.artistname,
          account.mail,
          account.accountId,
          account.id,
          account.userId,
          account.rootUserId
        ])
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesQuery = !query || haystack.includes(query);
      const matchesSource = sourceValue === "all" || source.key === sourceValue;
      const matchesRole = roleValue === "all" || role.split(" + ").includes(roleValue);
      return matchesQuery && matchesSource && matchesRole;
    });

    if (count) count.textContent = `${filtered.length} inscription${filtered.length > 1 ? "s" : ""}`;
    list.innerHTML = filtered.length
      ? filtered.map((group) => founderRegistrationCard(group, attributionIndex)).join("")
      : emptyState("Aucune inscription trouvée", "Modifie la recherche ou les filtres.");
    icons();
  };

  search.addEventListener("input", draw);
  sourceFilter.addEventListener("change", draw);
  roleFilter.addEventListener("change", draw);
  draw();
}

function registrationSummary(groups = []) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  const times = groups.map((group) => new Date(registrationDateForGroup(group) || 0).getTime()).filter(Number.isFinite);
  const returnMetrics = groups.map((group) => founderGroupReturnMetrics(group));
  const returned = returnMetrics.filter((metrics) => metrics.status === "returned" || metrics.status === "active").length;
  const neverReturned = returnMetrics.filter((metrics) => metrics.status === "new").length;
  const unknown = returnMetrics.filter((metrics) => metrics.status === "unknown").length;
  const known = returned + neverReturned;
  return {
    total: groups.length,
    today: times.filter((time) => time >= startToday).length,
    sevenDays: times.filter((time) => time >= sevenDaysAgo).length,
    returned,
    neverReturned,
    unknown,
    returnRate: known > 0 ? (returned / known) * 100 : 0
  };
}

async function renderSonaraPackStatistics() {
  content.innerHTML = `<section class="loading-card">Chargement des statistiques Sonara Pack…</section>`;

  try {
    const [data, organicVisibility] = await Promise.all([
      api("/sonara-pack/statistics").then(asObject),
      api("/organic-visibility").then(asObject).catch(() => ({}))
    ]);
    const downloads = asObject(data.downloads);
    const community = asObject(data.community);
    const catalog = asObject(data.catalog);
    const operations = asObject(data.operations);
    const trend = asObject(data.trend);

    rememberEnvironment({
      connectedEnvironment: data.connectedEnvironment || data.environment
    });
    state.sonaraPackStatistics = data;
    state.organicVisibility = organicVisibility;
    setConnection(data.sonaraConnected !== false);

    content.innerHTML = `
      <section class="hero-panel sonara-pack-statistics-hero">
        <div>
          <p class="eyebrow">Statistiques produit ${environmentBadge(data.connectedEnvironment)}</p>
          <h2>Les données de Sonara Pack.</h2>
          <p>Cette vue regroupe uniquement l’activité du produit. Les téléchargements Pre-V1 sont comptés sans les présenter comme des ventes.</p>
        </div>
        <div class="level-card">
          <span>Dernière lecture</span>
          <strong>RÉELLE</strong>
          <small>${formatDate(data.generatedAt)}</small>
        </div>
      </section>

      <section class="sonara-pack-statistics-grid" aria-label="Indicateurs Sonara Pack">
        ${sonaraPackStatisticCard("package-check", "Packs téléchargés", downloads.packs, "Cumul par compte", "cyan")}
        ${sonaraPackStatisticCard("music-2", "Morceaux téléchargés", downloads.tracks, "Obtenus via packs ou à l’unité", "purple")}
        ${sonaraPackStatisticCard("users-round", "Comptes téléchargeurs", downloads.uniqueAccounts, "Au moins un téléchargement", "green")}
        ${sonaraPackStatisticCard("users", "Comptes Sonara Pack", community.accounts, "Comptes suivis", "blue")}
        ${sonaraPackStatisticCard("badge-check", "Packs approuvés", catalog.approvedPacks, "Disponibles dans le catalogue", "gold")}
      </section>

      <section class="administration-sonara-pack-corner sonara-pack-growth" aria-label="Évolution de Sonara Pack">
        ${administrationTrendMarkup(trend)}
      </section>

      ${organicVisibilityMarkup(organicVisibility)}

      <section class="sonara-pack-statistics-details">
        <article class="panel">
          <p class="eyebrow">Règle de comptage</p>
          <h3>Des téléchargements, pas des ventes.</h3>
          <p class="muted">${escapeHTML(downloads.countingRule || "Un pack ou morceau est compté une fois par compte")}. Le passage commercial de la V1 n’est pas activé par cette page.</p>
        </article>
        <article class="panel sonara-pack-environment-panel">
          <p class="eyebrow">Environnement isolé</p>
          <h3>Données ${environmentBadge(data.connectedEnvironment)}</h3>
          <p class="muted">${asNumber(catalog.pendingPacks)} pack(s) à modérer · ${asNumber(operations.openTickets)} ticket(s) ouvert(s) · ${asNumber(operations.unreadNotifications)} notification(s) non lue(s).</p>
        </article>
      </section>
    `;

    bindAdministrationTrendMetricTabs();
    bindOrganicVisibilityControls();
    icons();
  } catch (error) {
    setConnection(false);
    content.innerHTML = errorState(error.message);
  }
}
function notificationRow(n = {}, selectable = false) {
  const id = escapeHTML(n.id || "");
  const status = n.status || (n.read ? "read" : "unread");

  return `<article class="list-row notification-row ${status === "unread" ? "is-unread" : ""}" data-notification-row="${id}">
    ${selectable ? `<button type="button" class="notification-select" data-select-notification="${id}" aria-label="Sélectionner cette notification"><span class="notification-check"></span></button>` : ""}
    <button type="button" class="notification-open" data-notification-id="${id}">
      <span class="row-icon"><i data-lucide="${n.priority === "urgent" ? "triangle-alert" : "bell"}"></i></span>
      <span class="row-main"><strong>${escapeHTML(n.title || "Notification")} ${environmentBadge(n.environment)}</strong><small>${escapeHTML(n.message || "")}</small></span>
      <time>${formatDate(n.createdAt)}</time>
    </button>
  </article>`;
}
function emptyState(title, text) { return `<div class="empty-state"><i data-lucide="inbox"></i><strong>${title}</strong><p>${text}</p></div>`; }
function errorState(message) { return `<section class="empty-state error"><i data-lucide="wifi-off"></i><strong>Connexion impossible</strong><p>${escapeHTML(message)}</p><button class="primary-button" onclick="resetFounderView()">Réessayer</button></section>`; }

function selectedNotificationIds() {
  return [...document.querySelectorAll(".notification-row.is-selected")]
  .map((row) => row.dataset.notificationRow)
  .filter(Boolean);
}

function updateNotificationSelectionUI() {
  const rows = [...document.querySelectorAll(".notification-row")];
  const selected = selectedNotificationIds();
  const count = selected.length;
  const bar = document.getElementById("notificationSelectionBar");
  const countNode = document.getElementById("notificationSelectionCount");
  const selectAllButton = document.getElementById("selectAllNotifications");
  const selectionButton = document.getElementById("toggleNotificationSelection");

  if (bar) bar.classList.toggle("is-visible", count > 0);
  if (countNode) countNode.textContent = `${count} sélectionnée${count > 1 ? "s" : ""}`;
  if (selectAllButton) {
    const allSelected = rows.length > 0 && rows.every((row) => row.classList.contains("is-selected"));
    selectAllButton.textContent = allSelected ? "Tout désélectionner" : "Tout sélectionner";
  }
  if (selectionButton) selectionButton.classList.toggle("active", document.body.classList.contains("notification-selection-mode"));
}

async function deleteSelectedNotifications() {
  const ids = selectedNotificationIds();
  if (!ids.length) return;

  await api("/notifications", {
      method: "DELETE",
      body: JSON.stringify({ ids })
  });

  showToast(`${ids.length} notification${ids.length > 1 ? "s" : ""} supprimée${ids.length > 1 ? "s" : ""}.`);
  document.body.classList.remove("notification-selection-mode");
  renderNotifications();
  refreshOverview();
}


function founderPackStatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("fr-FR").format(number);
}

function founderPackClock(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function founderPackSourceSummary(stats = {}) {
  const sources = asObject(stats.sourceBreakdown);
  return Object.entries(sources)
    .filter(([, count]) => asNumber(count) > 0)
    .sort((a, b) => asNumber(b[1]) - asNumber(a[1]))
    .slice(0, 3)
    .map(([source, count]) => `${escapeHTML(source)} ${founderPackStatValue(count)}`)
    .join(" · ") || "Aucune arrivée attribuée";
}

function founderPackHighlightStorageKey(packId, trackId) {
  const environment = String(state?.environment || document.body?.dataset?.environment || "unknown").toLowerCase();
  return `founder:pack-highlight:${environment}:${String(packId || "")}:${String(trackId || "")}`;
}

function founderPackStoredHighlight(packId, trackId, fallback = 0) {
  try {
    const stored = Number(localStorage.getItem(founderPackHighlightStorageKey(packId, trackId)));
    if (Number.isFinite(stored) && stored >= 0) return stored;
  } catch {}
  return Math.max(0, asNumber(fallback));
}

function founderPackTrackRow(pack, track) {
  const packId = String(pack.packId || "");
  const trackId = String(track?.id || "");
  const start = founderPackStoredHighlight(packId, trackId, track?.previewStart);
  const duration = Math.min(30, Math.max(1, asNumber(track?.previewDuration, 30)));
  const audioUrl = String(track?.previewAudioUrl || "");
  return `
    <article class="founder-pack-track" data-pack-track="${escapeHTML(trackId)}">
      <button type="button" class="founder-pack-play" data-pack-play
        data-pack-id="${escapeHTML(packId)}"
        data-track-id="${escapeHTML(trackId)}"
        data-audio-url="${escapeHTML(audioUrl)}"
        data-preview-start="${start}"
        data-preview-duration="${duration}"
        ${audioUrl ? "" : "disabled"}
        aria-label="Écouter l’extrait">
        <i data-lucide="play"></i>
      </button>
      <div class="founder-pack-track-main">
        <div class="founder-pack-track-title">
          <strong>${escapeHTML(track?.title || "Track Sonara")}</strong>
          <small>${founderPackClock(start)} → ${founderPackClock(start + duration)}</small>
        </div>
        <button type="button" class="founder-pack-progress" data-pack-progress aria-label="Position dans l’extrait" ${audioUrl ? "" : "disabled"}>
          <span data-pack-progress-fill></span>
        </button>
        <small class="founder-pack-time" data-pack-time>0:00 / ${founderPackClock(duration)}</small>
        <div class="founder-pack-highlight" data-pack-highlight data-pack-id="${escapeHTML(packId)}" data-track-id="${escapeHTML(trackId)}" data-preview-start="${start}" data-preview-duration="${duration}">
          <div class="founder-pack-highlight-head"><strong>Moment fort</strong><small data-pack-highlight-label>${founderPackClock(start)} → ${founderPackClock(start + duration)}</small></div>
          <div class="founder-pack-highlight-controls">
            <input type="range" min="0" step="0.1" value="${start}" data-pack-highlight-range aria-label="Début du moment fort">
            <label>Début <input type="number" min="0" step="0.1" value="${start}" data-pack-highlight-number> s</label>
            <button type="button" class="secondary-button compact" data-pack-highlight-listen><i data-lucide="play"></i>Écouter ici</button>
          </div>
          <small class="founder-pack-highlight-help">Ce point sera utilisé pour l’extrait promotionnel de 30 s.</small>
        </div>
      </div>
      <button type="button" class="founder-pack-download compact" data-pack-download-preview
        data-pack-id="${escapeHTML(packId)}" data-track-id="${escapeHTML(trackId)}"
        data-preview-start="${start}" data-preview-duration="${duration}" ${trackId ? "" : "disabled"}>
        <i data-lucide="download"></i><span>Extrait 30 s</span>
      </button>
    </article>`;
}

function founderPackCard(pack = {}) {
  const stats = asObject(pack.stats);
  const tracks = asArray(pack.tracks);
  const rank = Math.max(1, asNumber(pack.rank, 1));
  const score = Math.max(0, Math.min(100, asNumber(pack.score)));
  const coverUrl = String(pack.coverUrl || "");
  const packId = String(pack.packId || "");
  return `
    <details class="founder-pack-card" data-founder-pack="${escapeHTML(packId)}" data-pack-title="${escapeHTML(pack.title || "Pack Sonara")}" data-pack-artist="${escapeHTML(pack.artist || "Artiste Sonara")}" ${rank === 1 ? "open" : ""}>
      <summary class="founder-pack-summary">
        <span class="founder-pack-rank">#${rank}</span>
        <span class="founder-pack-cover">
          ${coverUrl ? `<img src="${escapeHTML(coverUrl)}" alt="" loading="lazy">` : `<i data-lucide="image"></i>`}
        </span>
        <span class="founder-pack-identity">
          <strong>${escapeHTML(pack.title || "Pack Sonara")}</strong>
          <small>${escapeHTML(pack.artist || "Artiste Sonara")} · ${escapeHTML(pack.category || "Sans catégorie")}</small>
          <em>${tracks.length} track${tracks.length > 1 ? "s" : ""} · ${pack.publishedAt ? escapeHTML(formatDate(pack.publishedAt)) : "Date inconnue"}</em>
        </span>
        <span class="founder-pack-score"><small>Score réseau</small><strong>${score.toFixed(1)}</strong><em>/100</em></span>
        <span class="founder-pack-summary-stats">
          <b><i data-lucide="download"></i>${founderPackStatValue(stats.downloads)}</b>
          <b><i data-lucide="mouse-pointer-click"></i>${founderPackStatValue(stats.arrivals)}</b>
          <b><i data-lucide="user-plus"></i>${founderPackStatValue(stats.signups)}</b>
        </span>
        <i class="founder-pack-chevron" data-lucide="chevron-down"></i>
      </summary>

      <div class="founder-pack-detail">
        <section class="founder-pack-stat-grid">
          <article><span>Téléchargements</span><strong>${founderPackStatValue(stats.downloads)}</strong><small>Acquisitions du pack</small></article>
          <article><span>Arrivées</span><strong>${founderPackStatValue(stats.arrivals)}</strong><small>Entrées attribuées à ce pack</small></article>
          <article><span>Inscriptions</span><strong>${founderPackStatValue(stats.signups)}</strong><small>${asNumber(stats.conversionRate).toFixed(1)} % des arrivées</small></article>
          <article><span>Écoutes</span><strong>${founderPackStatValue(stats.listens)}</strong><small>${stats.listens == null ? "Signal pas encore collecté" : "Signal Sonara"}</small></article>
        </section>

        <div class="founder-pack-network-line">
          <i data-lucide="route"></i><span>${founderPackSourceSummary(stats)}</span>
        </div>

        <div class="founder-pack-assets">
          <div class="founder-pack-assets-head">
            <div>
              <p class="eyebrow">Kit communication</p>
              <h4>Assets locaux</h4>
              <p class="muted">Le mockup est généré dans Founder sur ton PC. Chaque extrait 30 s est découpé localement depuis le MP3 source, sans FFmpeg ni encodage Render.</p>
            </div>
          </div>
          <div class="founder-pack-asset-actions">
            <button type="button" class="founder-pack-download" data-pack-download-promo data-pack-id="${escapeHTML(packId)}">
              <i data-lucide="image"></i><span>Mockup PNG</span>
            </button>
            ${pack.publicUrl ? `<a class="founder-pack-public-link" href="${escapeHTML(pack.publicUrl)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Page publique</a>` : ""}
          </div>
          <div class="founder-pack-tracks">
            ${tracks.length ? tracks.map((track) => founderPackTrackRow(pack, track)).join("") : `<p class="muted">Aucune track audio exploitable.</p>`}
          </div>
        </div>
      </div>
    </details>`;
}

function stopFounderPackPreview() {
  const control = state.packPreviewControl;
  if (!control) return;
  try { control.audio.pause(); } catch {}
  if (control.button) control.button.innerHTML = `<i data-lucide="play"></i>`;
  state.packPreviewControl = null;
  icons();
}

function founderPackLevelForElement(element) {
  const card = element?.closest?.("[data-founder-pack]");
  const slider = card?.querySelector?.("[data-pack-level]");
  return Math.min(100, Math.max(70, asNumber(slider?.value, 85)));
}

async function startFounderPackPreview(button) {
  const audioUrl = String(button.dataset.audioUrl || "");
  if (!audioUrl) return;
  const key = `${button.dataset.packId || ""}:${button.dataset.trackId || ""}`;
  const current = state.packPreviewControl;

  if (current?.key === key) {
    if (current.audio.paused) {
      await current.audio.play();
      button.innerHTML = `<i data-lucide="pause"></i>`;
    } else {
      current.audio.pause();
      button.innerHTML = `<i data-lucide="play"></i>`;
    }
    icons();
    return;
  }

  stopFounderPackPreview();
  const row = button.closest("[data-pack-track]");
  const progress = row?.querySelector("[data-pack-progress]");
  const fill = row?.querySelector("[data-pack-progress-fill]");
  const time = row?.querySelector("[data-pack-time]");
  const start = Math.max(0, asNumber(button.dataset.previewStart));
  const duration = Math.min(30, Math.max(1, asNumber(button.dataset.previewDuration, 30)));
  const audio = new Audio(audioUrl);
  audio.preload = "metadata";
  audio.volume = 1;

  const control = { key, audio, button, progress, fill, time, start, duration };
  state.packPreviewControl = control;

  const update = () => {
    if (state.packPreviewControl !== control) return;
    const elapsed = Math.max(0, Math.min(duration, asNumber(audio.currentTime) - start));
    const ratio = duration > 0 ? elapsed / duration : 0;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
    if (time) time.textContent = `${founderPackClock(elapsed)} / ${founderPackClock(duration)}`;
    if (elapsed >= duration - 0.02) {
      audio.pause();
      audio.currentTime = start;
      button.innerHTML = `<i data-lucide="play"></i>`;
      if (fill) fill.style.width = "0%";
      if (time) time.textContent = `0:00 / ${founderPackClock(duration)}`;
      icons();
    }
  };

  audio.addEventListener("timeupdate", update);
  audio.addEventListener("ended", update);
  audio.addEventListener("error", () => {
    if (state.packPreviewControl === control) {
      stopFounderPackPreview();
      showToast("Aperçu audio indisponible.", "error");
    }
  });

  const playFromStart = async () => {
    try {
      audio.currentTime = start;
      await audio.play();
      button.innerHTML = `<i data-lucide="pause"></i>`;
      icons();
    } catch {
      stopFounderPackPreview();
      showToast("Impossible de lancer cet extrait.", "error");
    }
  };

  if (audio.readyState >= 1) await playFromStart();
  else audio.addEventListener("loadedmetadata", playFromStart, { once: true });
}

function bindFounderPackHighlightPickers(zone) {
  zone.querySelectorAll("[data-pack-highlight]").forEach((picker) => {
    const range = picker.querySelector("[data-pack-highlight-range]");
    const number = picker.querySelector("[data-pack-highlight-number]");
    const listen = picker.querySelector("[data-pack-highlight-listen]");
    const label = picker.querySelector("[data-pack-highlight-label]");
    const row = picker.closest("[data-pack-track]");
    const play = row?.querySelector("[data-pack-play]");
    const download = row?.querySelector("[data-pack-download-preview]");
    const titleTime = row?.querySelector(".founder-pack-track-title small");
    const duration = Math.min(30, Math.max(1, asNumber(picker.dataset.previewDuration, 30)));

    const syncMax = () => {
      const audioUrl = String(play?.dataset.audioUrl || "");
      if (!audioUrl) return;
      const probe = new Audio(audioUrl);
      probe.preload = "metadata";
      probe.addEventListener("loadedmetadata", () => {
        const max = Math.max(0, asNumber(probe.duration) - duration);
        if (range) range.max = String(max);
        if (number) number.max = String(max);
        apply(range?.value ?? number?.value ?? 0, false);
      }, { once: true });
    };

    const apply = (value, persist = true) => {
      let start = Math.max(0, asNumber(value, 0));
      const max = Math.max(0, asNumber(range?.max, Number.POSITIVE_INFINITY));
      if (Number.isFinite(max)) start = Math.min(start, max);
      start = Math.round(start * 10) / 10;
      picker.dataset.previewStart = String(start);
      if (range) range.value = String(start);
      if (number) number.value = String(start);
      if (label) label.textContent = `${founderPackClock(start)} → ${founderPackClock(start + duration)}`;
      if (titleTime) titleTime.textContent = `${founderPackClock(start)} → ${founderPackClock(start + duration)}`;
      if (play) play.dataset.previewStart = String(start);
      if (download) download.dataset.previewStart = String(start);
      const control = state.packPreviewControl;
      if (control?.button === play) stopFounderPackPreview();
      if (persist) {
        try { localStorage.setItem(founderPackHighlightStorageKey(picker.dataset.packId, picker.dataset.trackId), String(start)); } catch {}
      }
    };

    range?.addEventListener("input", () => apply(range.value));
    number?.addEventListener("input", () => apply(number.value));
    listen?.addEventListener("click", async (event) => {
      event.preventDefault();
      apply(picker.dataset.previewStart);
      if (play) await startFounderPackPreview(play);
    });
    syncMax();
  });
}

function bindFounderPackCatalog() {
  const zone = document.querySelector("[data-founder-pack-catalog]");
  if (!zone) return;
  bindFounderPackHighlightPickers(zone);

  zone.addEventListener("input", (event) => {
    const slider = event.target.closest("[data-pack-level]");
    if (!slider) return;
    const card = slider.closest("[data-founder-pack]");
    const value = Math.min(100, Math.max(70, asNumber(slider.value, 85)));
    const label = card?.querySelector("[data-pack-level-value]");
    if (label) label.textContent = `${value} %`;
    const control = state.packPreviewControl;
    if (control?.button?.closest("[data-founder-pack]") === card) {
      control.audio.volume = value / 100;
    }
  });

  zone.addEventListener("click", async (event) => {
    const play = event.target.closest("[data-pack-play]");
    if (play) {
      event.preventDefault();
      await startFounderPackPreview(play);
      return;
    }

    const progress = event.target.closest("[data-pack-progress]");
    if (progress) {
      event.preventDefault();
      const control = state.packPreviewControl;
      if (!control || control.progress !== progress) return;
      const rect = progress.getBoundingClientRect();
      const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
      control.audio.currentTime = control.start + control.duration * ratio;
      return;
    }

    const coverButton = event.target.closest("[data-pack-download-cover]");
    if (coverButton) {
      event.preventDefault();
      if (coverButton.disabled) return;
      const packId = String(coverButton.dataset.packId || "");
      const card = coverButton.closest("[data-founder-pack]");
      const title = moderationAssetFallbackName(card?.querySelector(".founder-pack-identity strong")?.textContent, "sonara-pack");
      const original = coverButton.innerHTML;
      coverButton.disabled = true;
      coverButton.innerHTML = `<i data-lucide="loader-circle"></i>Préparation…`;
      icons();
      try {
        const artist = String(card?.dataset.packArtist || "Artiste Sonara");
        await downloadModerationAsset(`/moderation/packs/${encodeURIComponent(packId)}/cover`, `${title}-cover.jpg`);
        await downloadFounderPackPromo({ packId, title: String(card?.dataset.packTitle || title), artist });
        showToast("Cover + visuel promo téléchargés.");
      } catch (error) {
        showToast(error.message || "Cover ou visuel promo indisponible.", "error");
      } finally {
        coverButton.disabled = false;
        coverButton.innerHTML = original;
        icons();
      }
      return;
    }

    const promoButton = event.target.closest("[data-pack-download-promo]");
    if (promoButton) {
      event.preventDefault();
      if (promoButton.disabled) return;
      const packId = String(promoButton.dataset.packId || "");
      const card = promoButton.closest("[data-founder-pack]");
      const title = String(card?.dataset.packTitle || "Pack Sonara");
      const artist = String(card?.dataset.packArtist || "Artiste Sonara");
      const original = promoButton.innerHTML;
      promoButton.disabled = true;
      promoButton.innerHTML = `<i data-lucide="loader-circle"></i>Génération…`;
      icons();
      try {
        await downloadFounderPackPromo({ packId, title, artist });
        showToast("Visuel promo PNG généré.");
      } catch (error) {
        showToast(error.message || "Visuel promo indisponible.", "error");
      } finally {
        promoButton.disabled = false;
        promoButton.innerHTML = original;
        icons();
      }
      return;
    }

    const previewButton = event.target.closest("[data-pack-download-preview]");
    if (previewButton) {
      event.preventDefault();
      if (previewButton.disabled) return;
      const packId = String(previewButton.dataset.packId || "");
      const trackId = String(previewButton.dataset.trackId || "");
      const card = previewButton.closest("[data-founder-pack]");
      const packName = moderationAssetFallbackName(card?.querySelector(".founder-pack-identity strong")?.textContent, "sonara-pack");
      const trackName = moderationAssetFallbackName(previewButton.closest("[data-pack-track]")?.querySelector("strong")?.textContent, "extrait");
      const previewStart = Math.max(0, asNumber(previewButton.dataset.previewStart, 0));
      const previewDuration = Math.min(30, Math.max(1, asNumber(previewButton.dataset.previewDuration, 30)));
      const original = previewButton.innerHTML;
      previewButton.disabled = true;
      previewButton.innerHTML = `<i data-lucide="loader-circle"></i>`;
      icons();
      try {
        await downloadFounderTrackPreviewLocal({
          packId,
          trackId,
          previewStart,
          previewDuration,
          filename: `${packName}-${trackName}-30s.wav`
        });
        showToast("Extrait 30 s généré localement.");
      } catch (error) {
        showToast(error.message || "Extrait indisponible.", "error");
      } finally {
        previewButton.disabled = false;
        previewButton.innerHTML = original;
        icons();
      }
    }
  });
}

async function renderPackCatalog() {
  stopFounderPackPreview();
  content.innerHTML = `<section class="loading-card">Classement des packs Sonara…</section>`;
  try {
    const data = asObject(await api("/catalog-packs"));
    rememberEnvironment(data);
    const items = asArray(data.items);
    state.packCatalog = data;

    const totalDownloads = items.reduce((sum, item) => sum + asNumber(item?.stats?.downloads), 0);
    const totalArrivals = items.reduce((sum, item) => sum + asNumber(item?.stats?.arrivals), 0);
    const totalSignups = items.reduce((sum, item) => sum + asNumber(item?.stats?.signups), 0);

    content.innerHTML = `
      <section class="founder-pack-catalog" data-founder-pack-catalog>
        <div class="founder-pack-catalog-hero">
          <div>
            <p class="eyebrow">Effet réseau · Catalogue</p>
            <h2>Packs Sonara</h2>
            <p>Les packs les plus performants sont automatiquement en haut. Le score utilise uniquement les signaux réellement disponibles dans ${environmentLabel(state.environment)}.</p>
          </div>
          ${environmentBadge(state.environment)}
        </div>
        <div class="founder-pack-catalog-kpis">
          <article><span>Packs publiés</span><strong>${founderPackStatValue(items.length)}</strong></article>
          <article><span>Téléchargements</span><strong>${founderPackStatValue(totalDownloads)}</strong></article>
          <article><span>Arrivées par packs</span><strong>${founderPackStatValue(totalArrivals)}</strong></article>
          <article><span>Inscriptions attribuées</span><strong>${founderPackStatValue(totalSignups)}</strong></article>
        </div>
        <div class="founder-pack-ranking-note">
          <i data-lucide="trophy"></i>
          <span>Classement : téléchargements 50 % · arrivées 20 % · inscriptions 20 % · écoutes 10 % quand cette donnée existe. Les poids absents sont automatiquement redistribués.</span>
        </div>
        <div class="founder-pack-ranking">
          ${items.length ? items.map(founderPackCard).join("") : emptyState("Aucun pack public", "Dès qu’un pack est publié dans cet environnement, il apparaîtra ici.")}
        </div>
      </section>`;

    bindFounderPackCatalog();
    icons();
  } catch (error) {
    content.innerHTML = errorState(error.message);
    icons();
  }
}

async function renderNotifications() {
  content.innerHTML = `<section class="loading-card">Récupération des notifications…</section>`;
  try {
    const data = asObject(await api("/notifications"));
    rememberEnvironment(data);
    const notifications = asArray(data.notifications || data.items).map(item => ({ ...item, environment: item.environment || data.connectedEnvironment }));
    const unreadCount = asNumber(data.unreadCount, notifications.filter(item => (item?.status || (item?.read ? "read" : "unread")) === "unread").length);
    state.notifications = notifications;
    updateBadges(unreadCount);
    document.body.classList.remove("notification-selection-mode");

    content.innerHTML = `<section class="panel full-panel">
      <div class="panel-head notification-panel-head">
        <div><p class="eyebrow">Centre d’alerte</p><h3>Notifications internes</h3></div>
        <div class="notification-head-actions">
          <button id="toggleNotificationSelection" class="secondary-button">Sélectionner</button>
          <button id="readAllButton" class="secondary-button" ${unreadCount ? "" : "disabled"}>Tout marquer comme lu</button>
        </div>
      </div>

      <div class="notification-tools">
        <div class="filter-bar"><button class="filter active" data-filter="all">Toutes</button><button class="filter" data-filter="unread">Non lues</button><button class="filter" data-filter="urgent">Urgentes</button></div>
        <button id="selectAllNotifications" class="text-button notification-select-all">Tout sélectionner</button>
      </div>

      <div id="notificationSelectionBar" class="notification-selection-bar">
        <strong id="notificationSelectionCount">0 sélectionnée</strong>
        <button id="deleteSelectedNotifications" class="reject-button"><i data-lucide="trash-2"></i>Supprimer</button>
      </div>

      <div id="notificationsList" class="main-list">${notifications.length ? notifications.map((n) => notificationRow(n, true)).join("") : emptyState("Aucune notification", "Sonara n’a rien à signaler.")}</div>
    </section>`;
    bindNotificationActions(); icons();
  } catch (error) { content.innerHTML = errorState(error.message); }
}

function bindNotificationActions() {
  document.getElementById("readAllButton")?.addEventListener("click", async () => {
      await api("/notifications/read-all", { method: "PATCH" });
      showToast("Toutes les notifications sont lues.");
      renderNotifications();
      refreshOverview();
  });

  document.getElementById("toggleNotificationSelection")?.addEventListener("click", () => {
      document.body.classList.toggle("notification-selection-mode");
      document.querySelectorAll(".notification-row").forEach((row) => row.classList.remove("is-selected"));
      updateNotificationSelectionUI();
  });

  document.querySelectorAll("[data-select-notification]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        document.body.classList.add("notification-selection-mode");
        button.closest(".notification-row")?.classList.toggle("is-selected");
        updateNotificationSelectionUI();
    });
  });

  document.getElementById("selectAllNotifications")?.addEventListener("click", () => {
      document.body.classList.add("notification-selection-mode");
      const rows = [...document.querySelectorAll(".notification-row")];
      const allSelected = rows.length > 0 && rows.every((row) => row.classList.contains("is-selected"));
      rows.forEach((row) => row.classList.toggle("is-selected", !allSelected));
      updateNotificationSelectionUI();
  });

  document.getElementById("deleteSelectedNotifications")?.addEventListener("click", async () => {
      try { await deleteSelectedNotifications(); }
      catch (error) { showToast(error.message, "error"); }
  });

  document.querySelectorAll(".notification-open").forEach((button) => button.addEventListener("click", async () => {
      if (document.body.classList.contains("notification-selection-mode")) {
        button.closest(".notification-row")?.classList.toggle("is-selected");
        updateNotificationSelectionUI();
        return;
      }
      const id = button.dataset.notificationId;
      await api(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      button.closest(".notification-row")?.classList.remove("is-unread");
      refreshOverview();
}));

  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const filter = button.dataset.filter;
      const items = state.notifications.filter((notification) => filter === "all" || (filter === "unread" && (notification.status || (notification.read ? "read" : "unread")) === "unread") || (filter === "urgent" && notification.priority === "urgent"));
      document.getElementById("notificationsList").innerHTML = items.length ? items.map((n) => notificationRow(n, true)).join("") : emptyState("Rien ici", "Aucun élément pour ce filtre.");
      bindNotificationActions();
      icons();
}));

  updateNotificationSelectionUI();
}

async function renderSupport() {
  content.innerHTML = `<section class="loading-card">Chargement du support…</section>`;

  try {
    const data = asObject(await api("/support"));
    rememberEnvironment(data);
    const tickets = asArray(data.tickets || data.items).map(item => ({ ...item, environment: item.environment || data.connectedEnvironment }));

    content.innerHTML = `
      <section class="panel full-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Assistance</p>
            <h3>Tickets utilisateurs</h3>
          </div>
          <span class="count-chip">${tickets.length} ticket(s)</span>
        </div>

        <div class="main-list">
          ${tickets.length ? tickets.map((ticket) => {
            const id = ticket.ticketId || ticket.id || "";
            const replies = asArray(ticket.replies);

            return `
    <article class="ticket-card" data-ticket-card="${escapeHTML(id)}">
    <div class="ticket-content">
    <span class="status ${escapeHTML(ticket.status || "open")}">
    ${escapeHTML(ticket.status || "open")}
    </span>
    ${environmentBadge(ticket.environment)}

    <h4>${escapeHTML(ticket.subject || ticket.title || "Demande sans objet")}</h4>
    <p>${escapeHTML(ticket.message || ticket.description || "")}</p>
    <small>
    ${escapeHTML(ticket.email || ticket.username || ticket.pseudo || "Utilisateur")}
    · ${formatDate(ticket.createdAt)}
    </small>

    <div class="ticket-replies">
    ${replies.map((reply) => `
                      <div class="ticket-reply">
                        <strong>${reply.sender === "founder" ? "Réponse Sonara" : "Utilisateur"}</strong>
                        <p>${escapeHTML(reply.message || "")}</p>
                        <small>${formatDate(reply.createdAt)}</small>
                      </div>
                    `).join("")}
    </div>

    <form class="ticket-reply-form" data-ticket-id="${escapeHTML(id)}">
    <textarea
    class="ticket-reply-input"
    placeholder="Répondre à l’utilisateur…"
    maxlength="2000"
    required
    ></textarea>
    <button type="submit" class="primary-button">Envoyer la réponse</button>
    </form>
    </div>

    <div class="ticket-actions">
    <select class="ticket-status" data-ticket-id="${escapeHTML(id)}">
    <option value="open" ${(ticket.status || "open") === "open" ? "selected" : ""}>Ouvert</option>
    <option value="in_progress" ${ticket.status === "in_progress" ? "selected" : ""}>En cours</option>
    <option value="resolved" ${ticket.status === "resolved" ? "selected" : ""}>Résolu</option>
    <option value="closed" ${ticket.status === "closed" ? "selected" : ""}>Fermé</option>
    </select>

    <button
    type="button"
    class="reject-button ticket-delete"
    data-ticket-id="${escapeHTML(id)}"
    >
    <i data-lucide="trash-2"></i>
    Supprimer
    </button>
    </div>
    </article>
    `;
          }).join("") : emptyState("Aucun ticket", "Les demandes du support apparaîtront ici.")}
        </div>
      </section>
    `;

    document.querySelectorAll(".ticket-status").forEach((select) => {
        select.addEventListener("change", async () => {
          try {
            await api(`/support/${encodeURIComponent(select.dataset.ticketId)}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status: select.value })
          });
            showToast("Statut du ticket mis à jour.");
            refreshOverview();
          } catch (error) {
            showToast(error.message, "error");
          }
      });
    });

    document.querySelectorAll(".ticket-reply-form").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();

          const input = form.querySelector(".ticket-reply-input");
          const button = form.querySelector("button");
          const message = input.value.trim();

          if (!message) {
            showToast("Écris une réponse avant l’envoi.", "error");
            return;
          }

          button.disabled = true;
          button.textContent = "Envoi…";

          try {
            await api(`/support/${encodeURIComponent(form.dataset.ticketId)}/replies`, {
              method: "POST",
              body: JSON.stringify({ message })
          });

            showToast("Réponse envoyée à l’utilisateur.");
            renderSupport();
            refreshOverview();
          } catch (error) {
            showToast(error.message, "error");
            button.disabled = false;
            button.textContent = "Envoyer la réponse";
          }
      });
    });

    document.querySelectorAll(".ticket-delete").forEach((button) => {
        button.addEventListener("click", async () => {
          const confirmed = window.confirm(
          "Supprimer définitivement cette demande et toutes ses réponses ?"
        );

          if (!confirmed) return;

          button.disabled = true;

          try {
            await api(`/support/${encodeURIComponent(button.dataset.ticketId)}`, {
              method: "DELETE"
          });

            showToast("Demande supprimée.");
            renderSupport();
            refreshOverview();
          } catch (error) {
            showToast(error.message, "error");
            button.disabled = false;
          }
      });
    });

    icons();
  } catch (error) {
    content.innerHTML = errorState(error.message);
  }
}

function clearFounderFeedbackAttachmentUrls() {
  founderFeedbackAttachmentUrls.forEach((url) => URL.revokeObjectURL(url));
  founderFeedbackAttachmentUrls.clear();
}

function founderFeedbackAttachmentSize(size) {
  const bytes = Math.max(0, Number(size) || 0);
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function renderFounderFeedbackAttachments(item, feedbackId) {
  const attachments = asArray(item.attachments).filter((attachment) => attachment?.id);
  if (!attachments.length) return "";

  return `
    <section class="feedback-attachments-block">
      <div class="feedback-attachments-head">
        <strong>Captures jointes</strong>
        <span>${attachments.length}</span>
      </div>
      <div class="feedback-attachments-grid">
        ${attachments.map((attachment) => `
          <button
            type="button"
            class="feedback-attachment-card"
            data-feedback-attachment-open
            data-feedback-id="${escapeHTML(feedbackId)}"
            data-feedback-attachment-id="${escapeHTML(attachment.id)}"
            title="Ouvrir ${escapeHTML(attachment.name || "la capture")}"
          >
            <span
              class="feedback-attachment-image"
              data-feedback-attachment-preview
              data-feedback-id="${escapeHTML(feedbackId)}"
              data-feedback-attachment-id="${escapeHTML(attachment.id)}"
            >
              <i data-lucide="image"></i>
            </span>
            <span class="feedback-attachment-meta">
              <strong>${escapeHTML(attachment.name || "Capture")}</strong>
              <small>${escapeHTML(founderFeedbackAttachmentSize(attachment.size))}</small>
            </span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

async function hydrateFounderFeedbackAttachments() {
  const previews = Array.from(document.querySelectorAll("[data-feedback-attachment-preview]"));

  await Promise.allSettled(previews.map(async (preview) => {
    const feedbackId = preview.dataset.feedbackId || "";
    const attachmentId = preview.dataset.feedbackAttachmentId || "";
    if (!feedbackId || !attachmentId) return;

    try {
      const blob = await apiBlob(
        `/feedback/${encodeURIComponent(feedbackId)}/attachments/${encodeURIComponent(attachmentId)}`
      );
      const url = URL.createObjectURL(blob);
      founderFeedbackAttachmentUrls.add(url);
      preview.innerHTML = `<img src="${url}" alt="Capture jointe">`;

      const card = preview.closest("[data-feedback-attachment-open]");
      if (card) card.dataset.feedbackAttachmentUrl = url;
    } catch (error) {
      preview.innerHTML = `<span class="feedback-attachment-error">Indisponible</span>`;
      preview.closest("[data-feedback-attachment-open]")?.setAttribute("disabled", "disabled");
    }
  }));

  document.querySelectorAll("[data-feedback-attachment-open]").forEach((button) => {
    if (button.dataset.feedbackAttachmentBound === "true") return;
    button.dataset.feedbackAttachmentBound = "true";
    button.addEventListener("click", () => {
      const url = button.dataset.feedbackAttachmentUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
  });

  icons();
}

async function renderFeedback() {
  clearFounderFeedbackAttachmentUrls();
  content.innerHTML = `<section class="loading-card">Chargement des feedbacks…</section>`;

  try {
    const data = asObject(await api("/feedback"));
    const feedbacks = asArray(data.feedback || data.items);

    content.innerHTML = `
      <section class="panel full-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Voix des utilisateurs</p>
            <h3>Feedback Sonara</h3>
          </div>
          <span class="count-chip">${feedbacks.length} retour(s)</span>
        </div>

        <div class="filter-bar">
          <button class="filter active" data-feedback-filter="all">Tous</button>
          <button class="filter" data-feedback-filter="new">Nouveaux</button>
          <button class="filter" data-feedback-filter="idea">Idées</button>
          <button class="filter" data-feedback-filter="bug">Problèmes</button>
        </div>

        <div id="feedbackFounderList" class="main-list">
          ${renderFounderFeedbackList(feedbacks)}
        </div>
      </section>
    `;

    const renderFiltered = (filter) => {
      const items = feedbacks.filter((item) => {
          if (filter === "all") return true;
          if (filter === "new") return item.status === "new";
          return item.type === filter;
      });

      clearFounderFeedbackAttachmentUrls();
      document.getElementById("feedbackFounderList").innerHTML =
      renderFounderFeedbackList(items);

      bindFounderFeedbackActions();
      void hydrateFounderFeedbackAttachments();
      icons();
    };

    document.querySelectorAll("[data-feedback-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelectorAll("[data-feedback-filter]").forEach((item) => {
            item.classList.remove("active");
        });

          button.classList.add("active");
          renderFiltered(button.dataset.feedbackFilter);
      });
    });

    bindFounderFeedbackActions();
    void hydrateFounderFeedbackAttachments();
    icons();
  } catch (error) {
    content.innerHTML = errorState(error.message);
  }
}

function renderFounderFeedbackList(items) {
  if (!items.length) {
    return emptyState("Aucun feedback", "Les commentaires des utilisateurs apparaîtront ici.");
  }

  return items.map((item) => {
      const id = item.id || item.reference || "";
      const stars = Number(item.rating) > 0
      ? `${"★".repeat(Number(item.rating))}${"☆".repeat(5 - Number(item.rating))}`
      : "Sans note";

      return `
      <article class="ticket-card" data-feedback-card="${escapeHTML(id)}">
        <div class="ticket-content">
          <span class="status ${escapeHTML(item.status || "new")}">
            ${escapeHTML(item.status || "new")}
          </span>

          <p class="eyebrow">${escapeHTML(item.type || "general")} · ${escapeHTML(stars)}</p>
          <h4>${escapeHTML(item.title || "Feedback sans titre")}</h4>
          <p>${escapeHTML(item.message || "")}</p>

          ${renderFounderFeedbackAttachments(item, id)}

          <small>
            ${escapeHTML(item.pseudo || item.email || "Utilisateur")}
            · ${formatDate(item.createdAt)}
          </small>

          <div class="ticket-replies">
            ${asArray(item.replies).map((reply) => `
      <div class="ticket-reply">
      <strong>Réponse Sonara</strong>
      <p>${escapeHTML(reply.message || "")}</p>
      <small>${formatDate(reply.createdAt)}</small>
      </div>
      `).join("")}
          </div>

          <form class="feedback-reply-form" data-feedback-id="${escapeHTML(id)}">
            <textarea
              class="ticket-reply-input"
              placeholder="Répondre à l’utilisateur…"
              maxlength="2000"
              required
            ></textarea>
            <button type="submit" class="primary-button">
              Envoyer la réponse
            </button>
          </form>
        </div>

        <div class="ticket-actions">
          <select class="feedback-status" data-feedback-id="${escapeHTML(id)}">
            <option value="new" ${(item.status || "new") === "new" ? "selected" : ""}>Nouveau</option>
            <option value="reviewed" ${item.status === "reviewed" ? "selected" : ""}>Lu</option>
            <option value="replied" ${item.status === "replied" ? "selected" : ""}>Répondu</option>
            <option value="planned" ${item.status === "planned" ? "selected" : ""}>À prévoir</option>
            <option value="done" ${item.status === "done" ? "selected" : ""}>Traité</option>
          </select>

          <button
            type="button"
            class="reject-button feedback-delete"
            data-feedback-id="${escapeHTML(id)}"
          >
            <i data-lucide="trash-2"></i>
            Supprimer
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function bindFounderFeedbackActions() {
  document.querySelectorAll(".feedback-status").forEach((select) => {
      select.addEventListener("change", async () => {
        try {
          await api(`/feedback/${encodeURIComponent(select.dataset.feedbackId)}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: select.value })
        });

          showToast("Statut du feedback mis à jour.");
        } catch (error) {
          showToast(error.message, "error");
        }
    });
  });

  document.querySelectorAll(".feedback-reply-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const input = form.querySelector(".ticket-reply-input");
        const button = form.querySelector("button");
        const message = input.value.trim();

        if (!message) {
          showToast("Écris une réponse avant l’envoi.", "error");
          return;
        }

        button.disabled = true;
        button.textContent = "Envoi…";

        try {
          const result = await api(
          `/feedback/${encodeURIComponent(form.dataset.feedbackId)}/replies`,
          {
            method: "POST",
            body: JSON.stringify({ message })
          }
        );

          showToast(
          result.emailSent
          ? "Réponse envoyée et e-mail transmis."
          : "Réponse enregistrée. L’e-mail n’a pas pu être envoyé."
        );

          renderFeedback();
          refreshOverview();
        } catch (error) {
          showToast(error.message, "error");
          button.disabled = false;
          button.textContent = "Envoyer la réponse";
        }
    });
  });

  document.querySelectorAll(".feedback-delete").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.disabled) return;

        const feedbackId = button.dataset.feedbackId;
        const card = button.closest("[data-feedback-card]");

        button.disabled = true;
        button.setAttribute("aria-busy", "true");

        const originalHTML = button.innerHTML;
        button.innerHTML = `
        <i data-lucide="loader-circle"></i>
        Suppression…
      `;
        icons();

        try {
          await api(`/feedback/${encodeURIComponent(feedbackId)}`, {
            method: "DELETE"
        });

          if (card) {
            card.style.transition = "opacity 180ms ease, transform 180ms ease";
            card.style.opacity = "0";
            card.style.transform = "translateY(-6px)";

            window.setTimeout(() => {
              card.remove();

              const list = document.getElementById("feedbackFounderList");
              if (list && !list.querySelector("[data-feedback-card]")) {
                list.innerHTML = emptyState(
                "Aucun feedback",
                "Les commentaires des utilisateurs apparaîtront ici."
              );
                icons();
              }
            }, 180);
          }

          showToast("Feedback supprimé.");
        } catch (error) {
          showToast(error.message, "error");
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.innerHTML = originalHTML;
          icons();
        }
    });
  });
}

function founderAccountsSnapshot() {
  if (!state.moderationAccountsSnapshot) return null;
  if (normalizeEnvironment(state.moderationAccountsSnapshotEnvironment) !== normalizeEnvironment(state.environment)) return null;
  return state.moderationAccountsSnapshot;
}

function rememberFounderAccountsSnapshot(response = {}) {
  const data = asObject(response);
  const responseEnvironment = normalizeEnvironment(data.connectedEnvironment || data.environment || state.environment);
  if (responseEnvironment !== normalizeEnvironment(state.environment)) return;
  state.moderationAccountsSnapshot = data;
  state.moderationAccountsSnapshotEnvironment = responseEnvironment;
}

function warmFounderAccountsInBackground() {
  if (state.moderationAccountsWarmPromise) return state.moderationAccountsWarmPromise;
  const environmentAtStart = normalizeEnvironment(state.environment);

  state.moderationAccountsWarmPromise = api(`/accounts?warm=1&refresh=${Date.now()}`)
    .then(async (response) => {
      const responseEnvironment = normalizeEnvironment(response?.connectedEnvironment || environmentAtStart);
      if (responseEnvironment !== environmentAtStart) return;
      rememberFounderAccountsSnapshot(response);
      if (state.view !== "moderation" || normalizeEnvironment(state.environment) !== environmentAtStart) return;
      const mode = state.moderationMode;
      const search = mode === "accounts" ? state.moderationSearch : state.moderationRegistrationSearch;
      await renderModeration(mode, search);
    })
    .catch((error) => {
      if (state.view === "moderation" && normalizeEnvironment(state.environment) === environmentAtStart) {
        showToast(`Comptes Sonara : ${error.message || "connexion encore indisponible"}`, "error");
      }
    })
    .finally(() => {
      state.moderationAccountsWarmPromise = null;
    });

  return state.moderationAccountsWarmPromise;
}

async function renderModeration(initialMode = state.moderationMode || "accounts", initialSearch = state.moderationSearch || "") {
  if (state.view !== "moderation") return;
  const loadId = ++state.moderationLoadId;
  const openingMode = new Set(["accounts", "registrations", "appeals", "incidents", "artists", "packs"]).has(initialMode)
    ? initialMode
    : "accounts";
  content.innerHTML = `
    <section class="moderation-tabs">
      <button class="mode-tab ${openingMode === "accounts" ? "active" : ""}" type="button" disabled>Contrôle des comptes</button>
      <button class="mode-tab ${openingMode === "registrations" ? "active" : ""}" type="button" disabled>Nouvelles inscriptions</button>
      <button class="mode-tab ${openingMode === "appeals" ? "active" : ""}" type="button" disabled>Contestations</button>
      <button class="mode-tab ${openingMode === "incidents" ? "active" : ""}" type="button" disabled>Incidents de licence</button>
      <button class="mode-tab ${openingMode === "artists" ? "active" : ""}" type="button" disabled>Artistes</button>
      <button class="mode-tab ${openingMode === "packs" ? "active" : ""}" type="button" disabled>Packs</button>
    </section>
    <section class="loading-card">Chargement des données de modération…</section>`;

  try {
    const [artistsResponse, packsResponse, accountsResult, appealsResponse, incidentsResponse, organicVisibility] = await Promise.all([
      api("/moderation/artists"),
      api("/moderation/packs"),
      api("/accounts?fast=1")
        .then((data) => ({ ok: data?.pending !== true, pending: data?.pending === true, data }))
        .catch((error) => ({ ok: false, pending: false, error })),
      api("/appeals"),
      api("/license-incidents"),
      api("/organic-visibility").then(asObject).catch(() => ({}))
  ]);

    const cachedAccountsResponse = founderAccountsSnapshot();
    const accountsPending = accountsResult.ok !== true && !cachedAccountsResponse;
    const accountsResponse = accountsResult.ok === true
      ? asObject(accountsResult.data)
      : asObject(cachedAccountsResponse);

    if (accountsResult.ok === true) {
      rememberFounderAccountsSnapshot(accountsResponse);
    } else {
      warmFounderAccountsInBackground();
    }

    if (state.view !== "moderation" || loadId !== state.moderationLoadId) return;

    const artists = asArray(
      asObject(artistsResponse).items ||
      asObject(artistsResponse).artists ||
      asObject(artistsResponse).users
    );

    const packs = asArray(
      asObject(packsResponse).items ||
      asObject(packsResponse).packs
    );
    state.moderationPacks = packs;

    const accounts = asArray(
      asObject(accountsResponse).items ||
      asObject(accountsResponse).accounts
    );
    state.moderationAccountsFingerprint = founderAccountsFingerprint(accounts);
    state.moderationAccountsLastRefreshAt =
      asObject(accountsResponse).founderRefreshAt || new Date().toISOString();
    state.moderationAccountsReconciliation = asObject(accountsResponse).reconciliation || null;
    const accountGroups = groupFounderAccounts(accounts);
    state.organicVisibility = asObject(organicVisibility);

    const appealsData = asObject(appealsResponse);
    rememberEnvironment(appealsData);
    const appeals = asArray(appealsData.items || appealsData.appeals)
    .filter((item) => item && item.appealSubmitted !== false && item.active !== false && String(item.status || "pending").toLowerCase() === "pending")
    .map((item) => ({ ...item, environment: item.environment || appealsData.connectedEnvironment || state.environment }));

    const incidentsData = asObject(incidentsResponse);
    rememberEnvironment(incidentsData);
    const incidentOrder = { PENDING: 0, UNDER_REVIEW: 1, CONFIRMED: 2, REJECTED: 3, RESOLVED: 4 };
    const incidents = asArray(incidentsData.items || incidentsData.incidents)
      .map((item) => ({ ...item, environment: item.environment || incidentsData.connectedEnvironment || state.environment }))
      .sort((a, b) => {
        const statusA = String(a.status || "PENDING").toUpperCase();
        const statusB = String(b.status || "PENDING").toUpperCase();
        const byStatus = (incidentOrder[statusA] ?? 99) - (incidentOrder[statusB] ?? 99);
        return byStatus || (new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      });
    const pendingIncidentCount = incidents.filter((item) => String(item.status || "PENDING").toUpperCase() === "PENDING").length;
    updateLicenseIncidentBadge(pendingIncidentCount);

    const modes = new Set(["accounts", "registrations", "appeals", "incidents", "artists", "packs"]);
    const selectedMode = modes.has(initialMode) ? initialMode : "accounts";
    state.moderationMode = selectedMode;

    content.innerHTML = `
      <section class="moderation-tabs">
        <button class="mode-tab ${selectedMode === "accounts" ? "active" : ""}" data-mode="accounts">
          Contrôle des comptes <b>${accountsPending ? "…" : accounts.length}</b>
        </button>
        <button class="mode-tab ${selectedMode === "registrations" ? "active" : ""}" data-mode="registrations">
          Nouvelles inscriptions <b>${accountsPending ? "…" : accountGroups.length}</b>
        </button>
        <button class="mode-tab ${selectedMode === "appeals" ? "active" : ""}" data-mode="appeals">
          Contestations <b>${appeals.length}</b>
        </button>
        <button class="mode-tab ${selectedMode === "incidents" ? "active" : ""}" data-mode="incidents">
          Incidents de licence <b>${pendingIncidentCount}</b>
        </button>
        <button class="mode-tab ${selectedMode === "artists" ? "active" : ""}" data-mode="artists">
          Artistes <b>${artists.length}</b>
        </button>
        <button class="mode-tab ${selectedMode === "packs" ? "active" : ""}" data-mode="packs">
          Packs <b>${packs.length}</b>
        </button>
      </section>
      <section id="moderationList" class="cards-list"></section>
    `;

    const lists = { artists, packs, accounts: accountGroups, registrations: accountGroups, appeals, incidents };

    const draw = (mode, searchValue = "") => {
      const list = lists[mode] || [];
      state.moderationMode = mode;
      if (mode === "accounts") state.moderationSearch = searchValue;
      if (mode === "registrations") state.moderationRegistrationSearch = searchValue;
      if (mode !== "appeals") document.body.classList.remove("appeal-selection-mode");

      if (["accounts", "registrations"].includes(mode) && accountsPending) {
        document.getElementById("moderationList").innerHTML = `
          <section class="loading-card">
            Connexion aux comptes Sonara ${environmentLabel(state.environment)}…
            <small>La page Modération reste disponible pendant le réveil du backend. Les comptes apparaîtront automatiquement dès que Sonara répond.</small>
          </section>`;
      } else if (mode === "accounts") {
        document.getElementById("moderationList").innerHTML = `
          <section class="moderation-section-intro">
            <div>
              <p class="eyebrow">Modération générale</p>
              <h3>Comptes généraux Sonara</h3>
              <p>Une seule ligne par utilisateur général. Clique sur un profil pour afficher ses comptes liés, ses informations et les contrôleurs.</p>
              <p class="founder-account-count-detail"><strong>${accounts.length}</strong> account${accounts.length > 1 ? "s" : ""} · <strong>${accountGroups.length}</strong> ID${accountGroups.length > 1 ? "s" : ""} général${accountGroups.length > 1 ? "aux" : ""}</p>
              <p class="founder-account-count-detail"><strong>${accounts.filter(a => a.artistLegalIdentity?.status === "declared_unverified").length}</strong> immatriculations déclarées · <strong>${accounts.filter(a => a.artistLegalIdentity?.status === "self_declared_unverified").length}</strong> déclarations individuelles · <strong>${accounts.filter(a => a.stripeAccountId).length}</strong> comptes Stripe reliés · Aucune donnée bancaire complète stockée ici.</p>
            </div>
          </section>
          ${founderAccountsRefreshControls()}
          <section class="account-control-toolbar">
            <input id="accountControlSearch" type="search" placeholder="Rechercher par pseudo, e-mail, ID général ou accountId" value="${escapeHTML(searchValue)}">
            <select id="accountControlFilter">
              <option value="all">Tous les profils</option>
              <option value="active">Actifs</option>
              <option value="suspended">Suspendus</option>
              <option value="banned">Bannis</option>
              <option value="creator_removed">Accès Creator retiré</option>
            </select>
          </section>
          <section id="accountControlList" class="account-control-list"></section>
        `;
        bindAccountControlFiltering(list);
        bindFounderAccountsRefresh("accounts");
      } else if (mode === "registrations") {
        const summary = registrationSummary(list);
        document.getElementById("moderationList").innerHTML = `
          <section class="moderation-section-intro founder-registration-intro">
            <div>
              <p class="eyebrow">Entrées Sonara ${environmentBadge(state.environment)}</p>
              <h3>Nouvelles inscriptions</h3>
              <p>Tous les utilisateurs réellement présents dans cet environnement apparaissent ici, même quand leur source d’acquisition est inconnue. La provenance marketing est ajoutée uniquement quand le tracking peut l’établir.</p>
            </div>
            <div>
              ${founderAccountsRefreshControls()}
              <div class="founder-registration-summary">
              <span><small>Aujourd’hui</small><strong>${summary.today}</strong></span>
              <span><small>7 jours</small><strong>${summary.sevenDays}</strong></span>
              <span><small>Total inscrits</small><strong>${summary.total}</strong></span>
              <span><small>Revenus</small><strong>${summary.returned}</strong></span>
              <span><small>Jamais revenus</small><strong>${summary.neverReturned}</strong></span>
              <span><small>Taux de retour</small><strong>${summary.returnRate.toFixed(1)} %</strong></span>
              ${summary.unknown ? `<span><small>Historique inconnu</small><strong>${summary.unknown}</strong></span>` : ""}
              </div>
            </div>
          </section>
          <section class="founder-registration-toolbar">
            <input id="registrationSearch" type="search" placeholder="Rechercher pseudo, e-mail, ID ou source" value="${escapeHTML(searchValue)}">
            <select id="registrationSourceFilter">
              <option value="all">Toutes les sources</option>
              <option value="google">Google</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
              <option value="direct">Direct</option>
              <option value="other">Other</option>
              <option value="unknown">Historique inconnu</option>
            </select>
            <select id="registrationRoleFilter">
              <option value="all">Tous les rôles</option>
              <option value="user">Utilisateur</option>
              <option value="artist">Artiste</option>
              <option value="both">Les deux</option>
            </select>
            <span id="registrationVisibleCount" class="count-chip">${list.length} inscription${list.length > 1 ? "s" : ""}</span>
          </section>
          <section id="registrationList" class="founder-registration-list"></section>
        `;
        bindRegistrationFiltering(list, organicVisibility);
        bindFounderAccountsRefresh("registrations");
      } else if (mode === "appeals") {
        document.getElementById("moderationList").innerHTML = `
          <section class="moderation-section-intro appeal-panel-head">
            <div>
              <p class="eyebrow">Contestations</p>
              <h3>Messages réellement envoyés</h3>
              <p>Un refus seul n’apparaît jamais ici. Cette section contient uniquement les utilisateurs qui ont écrit puis envoyé une contestation.</p>
            </div>
            <button id="toggleAppealSelection" class="secondary-button" type="button">Mode sélection</button>
          </section>
          <section class="appeal-tools">
            <span class="count-chip">${list.length} en attente</span>
            <button id="selectAllAppeals" class="text-button" type="button">Tout sélectionner</button>
          </section>
          <section id="appealSelectionBar" class="appeal-selection-bar">
            <strong id="appealSelectionCount">0 sélectionnée</strong>
            <button id="deleteSelectedAppeals" class="reject-button" type="button"><i data-lucide="trash-2"></i>Supprimer</button>
          </section>
          <section class="appeals-list">
            ${list.length
              ? list.map(moderationAppealCard).join("")
              : emptyState("Aucune contestation", "Aucun utilisateur n’a envoyé de message de contestation.")}
          </section>
        `;
        bindModerationAppeals(draw, lists);
      } else if (mode === "incidents") {
        const underReviewCount = list.filter((item) => String(item.status || "").toUpperCase() === "UNDER_REVIEW").length;
        document.getElementById("moderationList").innerHTML = `
          <section class="moderation-section-intro">
            <div>
              <p class="eyebrow">Protection des licences</p>
              <h3>Incidents de licence à examiner</h3>
              <p>Chaque signalement reste une alerte jusqu’à validation humaine. Confirmer ou rejeter l’incident avant toute sanction.</p>
            </div>
          </section>
          <section class="appeal-tools">
            <span class="count-chip">${pendingIncidentCount} PENDING</span>
            <span class="count-chip">${underReviewCount} en examen</span>
            <span class="count-chip">${list.length} incident(s) total</span>
          </section>
          <section class="cards-list">
            ${list.length
              ? list.map((item) => licenseIncidentModerationCard(item, accounts)).join("")
              : emptyState("Aucun incident de licence", "Aucun signalement de droits n’a encore été créé.")}
          </section>
        `;
        bindLicenseIncidentActions();
      } else {
        document.getElementById("moderationList").innerHTML = list.length
        ? list.map((item) => moderationCard(item, mode)).join("")
        : emptyState(
          `Aucun ${mode === "artists" ? "artiste" : "pack"} en attente`,
          "La file est vide."
        );
        bindModeration(mode);
      }

      icons();
    };

    document.querySelectorAll(".mode-tab").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelectorAll(".mode-tab").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          state.moderationMode = button.dataset.mode;
          draw(
            button.dataset.mode,
            button.dataset.mode === "accounts"
              ? state.moderationSearch
              : (button.dataset.mode === "registrations" ? state.moderationRegistrationSearch : "")
          );
          startFounderAccountsLiveRefresh();
      });
    });

    draw(selectedMode, initialSearch);
    startFounderAccountsLiveRefresh();
  } catch (error) {
    if (state.view !== "moderation" || loadId !== state.moderationLoadId) return;
    content.innerHTML = errorState(error.message);
  }
}


function licenseIncidentStatusLabel(status = "PENDING") {
  return {
    PENDING: "À examiner",
    UNDER_REVIEW: "En examen",
    CONFIRMED: "Confirmé",
    REJECTED: "Rejeté",
    RESOLVED: "Résolu"
  }[String(status || "PENDING").toUpperCase()] || String(status || "PENDING");
}

function findFounderAccountById(accounts = [], id = "") {
  const target = String(id || "").trim();
  if (!target) return null;
  return asArray(accounts).find((account) =>
    [account.accountId, account.id, account.userId, account.rootUserId]
      .filter(Boolean)
      .some((value) => String(value) === target)
  ) || null;
}

function licenseIncidentEvidenceBlock(incident = {}) {
  const evidence = asArray(incident.evidence).map((item) => String(item || "").trim()).filter(Boolean);
  if (!evidence.length) return `<span class="muted small">Aucune pièce complémentaire jointe.</span>`;
  return evidence.map((item) => {
    const safe = escapeHTML(item);
    return /^https?:\/\//i.test(item)
      ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`
      : `<span>${safe}</span>`;
  }).join("<br>");
}

function licenseIncidentModerationCard(incident = {}, accounts = []) {
  const incidentId = incident.incidentId || incident.id || "";
  const status = String(incident.status || "PENDING").toUpperCase();
  const reported = findFounderAccountById(accounts, incident.reportedAccountId || incident.reportedUserId);
  const artist = findFounderAccountById(accounts, incident.artistId);
  const reportedLabel = reported?.pseudo || reported?.artistname || reported?.mail || incident.reportedAccountId || "Compte non identifié";
  const artistLabel = artist?.pseudo || artist?.artistname || artist?.mail || incident.artistId || "Artiste non identifié";
  const targetAccountId = incident.reportedAccountId || reported?.accountId || reported?.id || "";
  const canReview = ["PENDING", "UNDER_REVIEW"].includes(status);
  const isConfirmed = status === "CONFIRMED";

  return `<article class="moderation-card license-incident-card" data-license-incident="${escapeHTML(incidentId)}">
    <div class="moderation-cover"><i data-lucide="shield-alert"></i></div>
    <div class="moderation-info">
      <p class="eyebrow">${escapeHTML(incident.incidentType || "UNAUTHORIZED_MUSIC_REPUBLICATION")} ${environmentBadge(incident.environment)}</p>
      <h3>${escapeHTML(licenseIncidentStatusLabel(status))} · ${escapeHTML(incident.externalPlatform || "Plateforme non renseignée")}</h3>
      <p><strong>Utilisateur signalé :</strong> ${escapeHTML(reportedLabel)}${targetAccountId ? ` · <code>${escapeHTML(targetAccountId)}</code>` : ""}</p>
      <p><strong>Artiste :</strong> ${escapeHTML(artistLabel)}</p>
      <p><strong>Œuvre :</strong> ${escapeHTML(incident.packTitle || incident.packId || "Pack inconnu")}${incident.trackId ? ` · ${escapeHTML(incident.trackTitle || incident.trackId)}` : ""}</p>
      <p><strong>Traçabilité :</strong> downloadId ${escapeHTML(incident.downloadId || "—")}${incident.licenseReceiptId ? ` · receipt ${escapeHTML(incident.licenseReceiptId)}` : ""}${incident.licenseVersion ? ` · ${escapeHTML(incident.licenseVersion)}` : ""}</p>
      <p><strong>Motif :</strong> ${escapeHTML(incident.reason || "Aucun motif renseigné")}</p>
      <p><strong>Contenu externe :</strong> ${incident.externalUrl ? `<a href="${escapeHTML(incident.externalUrl)}" target="_blank" rel="noopener noreferrer">ouvrir le lien</a>` : "URL absente"}</p>
      <details class="moderation-history">
        <summary>Preuves et détails</summary>
        <div class="history-row"><strong>Signalement</strong><span>${licenseIncidentEvidenceBlock(incident)}</span><time>${formatDate(incident.createdAt)}</time></div>
        ${incident.originalFileHash ? `<div class="history-row"><strong>Hash original</strong><span>${escapeHTML(compactEvidenceHash(incident.originalFileHash))}</span><time>${escapeHTML(incident.licenseVersion || "—")}</time></div>` : ""}
        ${incident.reviewNotes ? `<div class="history-row"><strong>Note de revue</strong><span>${escapeHTML(incident.reviewNotes)}</span><time>${formatDate(incident.reviewedAt)}</time></div>` : ""}
      </details>
      ${isConfirmed && targetAccountId ? `
        <div class="license-sanction-form" data-target-account="${escapeHTML(targetAccountId)}">
          <select class="license-sanction-level">
            <option value="WARNING">Avertissement</option>
            <option value="DOWNLOAD_RESTRICTED">Téléchargements restreints</option>
            <option value="TEMPORARY_SUSPENSION">Suspension temporaire</option>
            <option value="PERMANENT_BAN">Bannissement permanent</option>
          </select>
          <input class="license-sanction-reason" placeholder="Motif précis de la sanction">
          <button type="button" class="primary-button license-sanction-apply">Appliquer après confirmation</button>
        </div>
      ` : ""}
    </div>
    <div class="moderation-actions license-incident-actions">
      ${canReview ? `
        <button type="button" class="secondary-button license-incident-review" data-status="UNDER_REVIEW">Examiner</button>
        <button type="button" class="accept-button license-incident-review" data-status="CONFIRMED"><i data-lucide="check"></i>Confirmer</button>
        <button type="button" class="reject-button license-incident-review" data-status="REJECTED"><i data-lucide="x"></i>Rejeter</button>
      ` : ""}
      ${isConfirmed ? `<button type="button" class="secondary-button license-incident-review" data-status="RESOLVED">Résoudre</button>` : ""}
      ${targetAccountId ? `<button type="button" class="secondary-button open-license-incident-account" data-account-search="${escapeHTML(targetAccountId)}"><i data-lucide="user-search"></i>Voir le compte</button>` : ""}
    </div>
  </article>`;
}

const FOUNDER_LICENSE_PERMISSION_LABELS = {
  personalProjects: "Projets personnels",
  commercialProjects: "Projets commerciaux",
  monetization: "Monétisation",
  socialMedia: "Réseaux sociaux",
  videoFilm: "Vidéos et films",
  advertising: "Publicités",
  gamesApps: "Jeux et applications",
  podcasts: "Podcasts",
  liveStreaming: "Live et streaming",
  clientWork: "Travail client",
  soundEditing: "Modification DAW",
  unlimitedProjects: "Projets illimités"
};

const FOUNDER_LICENSE_RESTRICTION_LABELS = {
  standaloneResale: "Revente isolée",
  redistribution: "Redistribution",
  musicPlatformUpload: "Upload musical autonome",
  contentIdRegistration: "Content ID",
  sublicensing: "Sous-licence",
  misleadingOwnership: "Fausse propriété"
};

function founderLicenseList(labels, states, customItems) {
  return [
    ...Object.entries(labels)
      .filter(([key]) => Boolean(states?.[key]))
      .map(([, label]) => label),
    ...asArray(customItems).map((item) => String(item || "").trim()).filter(Boolean)
  ];
}

function founderPackLicenseBlock(item = {}) {
  const license = asObject(item.licenseSummary || item.license);
  const permissions = founderLicenseList(
    FOUNDER_LICENSE_PERMISSION_LABELS,
    asObject(license.permissions),
    license.customPermissions
  );
  const restrictions = founderLicenseList(
    FOUNDER_LICENSE_RESTRICTION_LABELS,
    asObject(license.restrictions),
    license.customRestrictions
  );
  const version = Number(license.version || 1);
  const name = license.name || "Licence standard Sonara";

  return `
    <details class="moderation-license">
      <summary>
        <span><i data-lucide="shield-check"></i>Licence v${version}</span>
        <strong>${escapeHTML(name)}</strong>
        <small>Vérifier les droits avant d’accepter le pack</small>
      </summary>
      <div class="moderation-license-grid">
        <section>
          <h4><i data-lucide="circle-check-big"></i>Autorisations</h4>
          <ul>${permissions.length
            ? permissions.map((value) => `<li>${escapeHTML(value)}</li>`).join("")
            : "<li>Aucune autorisation renseignée</li>"}</ul>
        </section>
        <section class="moderation-license-restrictions">
          <h4><i data-lucide="circle-slash-2"></i>Interdictions</h4>
          <ul>${restrictions.length
            ? restrictions.map((value) => `<li>${escapeHTML(value)}</li>`).join("")
            : "<li>Aucune interdiction renseignée</li>"}</ul>
        </section>
      </div>
      ${license.creditRequired
        ? `<p class="moderation-license-credit"><i data-lucide="at-sign"></i>Crédit artiste obligatoire</p>`
        : ""}
      ${license.customTerms
        ? `<div class="moderation-license-terms"><strong>Conditions complémentaires</strong><p>${escapeHTML(license.customTerms)}</p></div>`
        : ""}
    </details>
  `;
}

function founderHumanCreationBlock(item = {}) {
  const creation = asObject(item.creationProcess);
  const signals = asObject(item.technicalModerationSignals);
  const evidence = asArray(item.creationEvidence);
  const rights = asObject(item.rightsDeclaration);
  const hasDeclaration = Object.keys(creation).length > 0;
  const rightsConfirmed = item.rightsDeclarationAccepted === true;
  const humanConfirmed = creation.humanCreationConfirmed === true;
  const aiUsed = creation.aiAssistanceUsed === true;
  const midiUsed = creation.midiPresent === true;
  const instruments = asArray(creation.instruments).map((value) => String(value || "").trim()).filter(Boolean);
  const plugins = asArray(creation.plugins).map((value) => String(value || "").trim()).filter(Boolean);

  const rightsBlock = `
    <section class="founder-rights-check ${rightsConfirmed ? "is-confirmed" : "is-missing"}">
      <div class="founder-rights-check-icon"><i data-lucide="${rightsConfirmed ? "badge-check" : "triangle-alert"}"></i></div>
      <div>
        <small>Déclaration de droits obligatoire</small>
        <strong>${rightsConfirmed ? "Droits confirmés par l’artiste" : "Déclaration de droits absente"}</strong>
        <p>Publication et licence du contenu sur Sonara Pack.</p>
        ${rights.acceptedAt ? `<span>Acceptée le ${escapeHTML(formatDate(rights.acceptedAt))}</span>` : ""}
      </div>
    </section>`;

  if (!hasDeclaration) {
    return `
      <section class="founder-verification-dossier">
        <div class="founder-verification-dossier-head">
          <div><p class="eyebrow">Dossier du pack</p><h4>Informations de création & contrôle audio</h4></div>
          <span class="founder-human-status warning">Contrôle manuel requis</span>
        </div>
        ${rightsBlock}
        <section class="founder-human-check founder-human-check-legacy">
          <div class="founder-human-check-head">
            <div><p class="eyebrow">Contrôle anti-IA</p><h4>Création humaine non renseignée</h4></div>
            <span class="founder-human-status warning">À vérifier manuellement</span>
          </div>
          <p>Cette soumission ne contient pas encore la déclaration de création humaine. L’écoute des pistes reste obligatoire avant décision.</p>
        </section>
      </section>`;
  }

  const evidenceHtml = evidence.length
    ? evidence.map((entry) => {
        const name = entry?.originalName || entry?.kind || "Justificatif";
        const kind = entry?.kind || "preuve";
        return `<span class="founder-human-evidence"><i data-lucide="paperclip"></i>${escapeHTML(name)} <small>${escapeHTML(kind)}</small></span>`;
      }).join("")
    : `<span class="founder-human-empty">Aucun justificatif joint</span>`;

  return `
    <section class="founder-verification-dossier">
      <div class="founder-verification-dossier-head">
        <div><p class="eyebrow">Dossier du pack</p><h4>Informations de création & contrôle audio</h4></div>
        <span class="founder-human-status ${humanConfirmed && rightsConfirmed ? "ok" : "danger"}">${humanConfirmed && rightsConfirmed ? "Déclarations confirmées" : "Déclaration incomplète"}</span>
      </div>
      ${rightsBlock}
      <section class="founder-human-check">
        <div class="founder-human-check-head">
          <div><p class="eyebrow">Contrôle anti-IA</p><h4>Création humaine & vérification</h4></div>
          <span class="founder-human-status ${humanConfirmed ? "ok" : "danger"}">${humanConfirmed ? "Création humaine déclarée" : "Déclaration absente"}</span>
        </div>
        <div class="founder-human-grid">
          <div><small>DAW utilisé</small><strong>${escapeHTML(creation.daw || "Non indiqué")}</strong></div>
          <div><small>MIDI utilisé dans la création</small><strong>${midiUsed ? "Oui" : "Non"}</strong></div>
          <div><small>Aide IA technique</small><strong>${aiUsed ? "Oui" : "Non"}</strong></div>
          <div><small>Type d’aide IA</small><strong>${escapeHTML(aiUsed ? (creation.aiAssistanceType || "Non précisé") : "Aucune")}</strong></div>
          <div><small>Justificatif MIDI</small><strong>${signals.midiProvided ? "Fourni" : "Non fourni"}</strong></div>
          <div><small>Stems / projet</small><strong>${signals.stemsProvided || signals.projectProvided ? [signals.stemsProvided ? "Stems" : "", signals.projectProvided ? "Projet" : ""].filter(Boolean).join(" + ") : "Non fournis"}</strong></div>
        </div>
        ${instruments.length ? `<div class="founder-human-tags"><small>Instruments utilisés</small><div>${instruments.map((value) => `<span>${escapeHTML(value)}</span>`).join("")}</div></div>` : `<div class="founder-human-note"><small>Instruments utilisés</small><p>Non indiqués</p></div>`}
        ${plugins.length ? `<div class="founder-human-tags"><small>VST / plugins principaux</small><div>${plugins.map((value) => `<span>${escapeHTML(value)}</span>`).join("")}</div></div>` : `<div class="founder-human-note"><small>VST / plugins principaux</small><p>Non indiqués</p></div>`}
        ${aiUsed && creation.aiAssistanceDetails ? `<div class="founder-human-note"><small>Précision sur l’aide IA</small><p>${escapeHTML(creation.aiAssistanceDetails)}</p></div>` : ""}
        ${creation.processComment ? `<div class="founder-human-note"><small>Commentaire sur le processus de création</small><p>${escapeHTML(creation.processComment)}</p></div>` : `<div class="founder-human-note"><small>Commentaire sur le processus de création</small><p>Aucun commentaire fourni</p></div>`}
        <div class="founder-human-evidence-list"><small>Justificatifs privés reçus</small><div>${evidenceHtml}</div></div>
        <p class="founder-human-warning"><i data-lucide="ear"></i>Ces informations accompagnent le contrôle. La décision reste faite dans Founder après écoute des pistes ci-dessous.</p>
      </section>
    </section>`;
}

function moderationCard(item, mode) {
  const isPack = mode === "packs";
  const id = isPack
  ? (item.id || item.packId)
  : (item.accountId || item.id);
  const coverUrl = isPack ? moderationCoverUrl(item) : "";

  return `<article class="moderation-card ${isPack ? "moderation-pack-card" : ""}" ${isPack ? `data-pack-id="${escapeHTML(id)}" tabindex="0" role="button" aria-expanded="false"` : ""}>
    <div class="moderation-cover">
      ${coverUrl
        ? `<img src="${escapeHTML(coverUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.nextElementSibling.style.display='';this.remove()">`
        : ""}
      <i data-lucide="${mode === "artists" ? "user-round" : "package"}" ${coverUrl ? "style=\"display:none\"" : ""}></i>
    </div>
    <div class="moderation-info">
      <p class="eyebrow">${mode === "artists" ? "Profil artiste" : "Pack"} ${environmentBadge(item.environment)}</p>
      <h3>${escapeHTML(item.pseudo || item.artistname || item.title || item.name || "Sans nom")}</h3>
      ${mode === "artists" ? `<p>${escapeHTML(item.mail || "Aucun e-mail")}</p>` : ""}
      <small>ID : ${escapeHTML(id)}</small>
      ${isPack ? `<small class="moderation-pack-audio-hint"><i data-lucide="headphones"></i>Cliquer sur le pack pour contrôler l’audio</small>` : ""}
      ${isPack ? founderPackLicenseBlock(item) : ""}
    </div>
    <div class="moderation-actions">
      <button class="accept-button" data-action="approved" data-id="${escapeHTML(id)}">
        <i data-lucide="check"></i>Accepter
      </button>
      <button class="reject-button" data-action="rejected" data-id="${escapeHTML(id)}">
        <i data-lucide="x"></i>Refuser
      </button>
    </div>
    ${isPack ? `<section class="moderation-pack-audio" data-pack-audio-panel hidden></section>` : ""}
  </article>`;
}

function clearModerationAudioUrls() {
  state.moderationAudioUrls.forEach((url) => {
    try { URL.revokeObjectURL(url); } catch {}
  });
  state.moderationAudioUrls = [];
}


function moderationPreviewClock(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function moderationAssetFallbackName(value, fallback) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return clean || fallback;
}

function moderationDownloadFilename(disposition, fallback) {
  const value = String(disposition || "");
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* fallback dessous */ }
  }
  const quoted = value.match(/filename="([^"]+)"/i)?.[1];
  const plain = value.match(/filename=([^;]+)/i)?.[1];
  return String(quoted || plain || fallback || "sonara-asset").trim();
}

async function downloadModerationAsset(pathname, fallbackName) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (response.status === 401) { logout(false); throw new Error("Session expirée"); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Téléchargement impossible (${response.status})`);
  }

  const blob = await response.blob();
  const fileName = moderationDownloadFilename(response.headers.get("content-disposition"), fallbackName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


const FOUNDER_PACK_PROMO_WIDTH = 1080;
const FOUNDER_PACK_PROMO_HEIGHT = 1920;
async function founderPromoFetchBlob(pathname) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (response.status === 401) { logout(false); throw new Error("Session expirée"); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Image Sonara indisponible (${response.status}).`);
  }
  return response.blob();
}

const FOUNDER_PACK_PROMO_MODEL = "/assets/mockup-v2/livre_neutre.glb";

function founderPromoLoadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de charger la cover du pack."));
    };
    image.src = url;
  });
}

function founderPromoDrawImageCover(context, image, x, y, width, height) {
  const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
  const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = (sourceWidth - cropWidth) / 2;
  const sourceY = (sourceHeight - cropHeight) / 2;
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

function founderPromoMat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function founderPromoMat4Translation(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function founderPromoMat4RotationY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function founderPromoMat4Perspective(fovRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovRadians / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0
  ]);
}

function founderPromoVec3Normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function founderPromoVec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function founderPromoVec3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function founderPromoMat4LookAt(eye, target, up = [0, 1, 0]) {
  const zAxis = founderPromoVec3Normalize([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2]
  ]);
  const xAxis = founderPromoVec3Normalize(founderPromoVec3Cross(up, zAxis));
  const yAxis = founderPromoVec3Cross(zAxis, xAxis);
  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -founderPromoVec3Dot(xAxis, eye),
    -founderPromoVec3Dot(yAxis, eye),
    -founderPromoVec3Dot(zAxis, eye),
    1
  ]);
}

function founderPromoCreateShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader WebGL invalide.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function founderPromoCreateProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = founderPromoCreateShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = founderPromoCreateShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Programme WebGL invalide.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function founderPromoParseGlb(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error("Le modèle Blender du livre est invalide.");
  }

  let offset = 12;
  let gltf = null;
  let binary = null;
  while (offset + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > view.byteLength) break;
    if (chunkType === 0x4e4f534a) {
      const jsonText = new TextDecoder().decode(arrayBuffer.slice(chunkStart, chunkEnd)).replace(/\u0000+$/g, "").trim();
      gltf = JSON.parse(jsonText);
    } else if (chunkType === 0x004e4942) {
      binary = arrayBuffer.slice(chunkStart, chunkEnd);
    }
    offset = chunkEnd;
  }
  if (!gltf || !binary) throw new Error("Le modèle Blender du livre est incomplet.");
  return { gltf, binary };
}

function founderPromoAccessor(gltf, binary, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  const bufferView = gltf.bufferViews?.[accessor?.bufferView];
  if (!accessor || !bufferView || accessor.sparse) throw new Error("Données 3D non supportées dans le livre Blender.");

  const componentMap = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
  };
  const componentCountMap = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const TypedArray = componentMap[accessor.componentType];
  const componentCount = componentCountMap[accessor.type];
  if (!TypedArray || !componentCount) throw new Error("Format 3D non supporté dans le livre Blender.");

  const componentBytes = TypedArray.BYTES_PER_ELEMENT;
  const packedStride = componentCount * componentBytes;
  const stride = bufferView.byteStride || packedStride;
  const byteOffset = Number(bufferView.byteOffset || 0) + Number(accessor.byteOffset || 0);

  if (stride === packedStride && byteOffset % componentBytes === 0) {
    return new TypedArray(binary, byteOffset, accessor.count * componentCount);
  }

  const output = new TypedArray(accessor.count * componentCount);
  const source = new DataView(binary);
  const readers = {
    5120: (at) => source.getInt8(at),
    5121: (at) => source.getUint8(at),
    5122: (at) => source.getInt16(at, true),
    5123: (at) => source.getUint16(at, true),
    5125: (at) => source.getUint32(at, true),
    5126: (at) => source.getFloat32(at, true)
  };
  const read = readers[accessor.componentType];
  for (let element = 0; element < accessor.count; element += 1) {
    for (let component = 0; component < componentCount; component += 1) {
      output[element * componentCount + component] = read(byteOffset + element * stride + component * componentBytes);
    }
  }
  return output;
}

function founderPromoBookColor(meshName) {
  const name = String(meshName || "").toLowerCase();
  if (name.includes("cube.027")) return [0.73, 0.72, 0.68];
  if (name.includes("cube.024") || name.includes("cube.025")) return [0.045, 0.052, 0.062];
  if (name.includes("cube.026")) return [0.032, 0.038, 0.046];
  if (name.includes("cube.")) {
    const number = Number(name.split("cube.")[1] || 0);
    const shade = number % 2 === 0 ? 0.64 : 0.57;
    return [shade, shade * 0.985, shade * 0.95];
  }
  return [0.22, 0.23, 0.24];
}

function founderPromoClampCoverText(value, maxLength = 78) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function founderPromoWrapCoverTitle(context, value, maxWidth, maxLines = 2) {
  const title = founderPromoClampCoverText(value, 78);
  if (!title) return [];
  const words = title.split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines && line) {
    const consumed = lines.join(" ").split(" ").filter(Boolean).length;
    const remaining = words.slice(consumed).join(" ");
    lines.push(remaining || line);
  }

  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (context.measureText(last).width > maxWidth) {
      let fitted = last;
      while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) {
        fitted = fitted.slice(0, -1).trimEnd();
      }
      lines[maxLines - 1] = `${fitted}…`;
    }
  }
  return lines;
}

function founderPromoDrawCoverMetadata(context, { title = "Pack Sonara", artist = "Artiste Sonara" } = {}) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const safeArtist = founderPromoClampCoverText(artist, 46);

  const topShade = context.createLinearGradient(0, 0, 0, height * 0.50);
  topShade.addColorStop(0, "rgba(2,4,10,0.72)");
  topShade.addColorStop(0.34, "rgba(2,4,10,0.30)");
  topShade.addColorStop(1, "rgba(2,4,10,0)");
  context.fillStyle = topShade;
  context.fillRect(0, 0, width, height * 0.56);

  const bottomShade = context.createLinearGradient(0, height * 0.72, 0, height);
  bottomShade.addColorStop(0, "rgba(2,4,10,0)");
  bottomShade.addColorStop(0.58, "rgba(2,4,10,0.46)");
  bottomShade.addColorStop(1, "rgba(2,4,10,0.82)");
  context.fillStyle = bottomShade;
  context.fillRect(0, height * 0.72, width, height * 0.28);

  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0,0,0,0.82)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 6;

  // Titre plus haut et moins massif : serif élégant pour un rendu de cover musicale.
  const titleMaxWidth = width * 0.78;
  let titleFontSize = 72;
  let titleLines = [];
  do {
    context.font = `700 ${titleFontSize}px Georgia, "Times New Roman", serif`;
    titleLines = founderPromoWrapCoverTitle(context, title, titleMaxWidth, 2);
    const fits = titleLines.every((line) => context.measureText(line).width <= titleMaxWidth);
    if (fits) break;
    titleFontSize -= 3;
  } while (titleFontSize > 48);

  const lineHeight = titleFontSize * 1.02;
  const titleCenterY = titleLines.length > 1 ? 214 : 228;
  const titleStartY = titleCenterY - ((titleLines.length - 1) * lineHeight) / 2;

  context.fillStyle = "#ffffff";
  titleLines.forEach((line, index) => {
    context.fillText(line, width / 2, titleStartY + index * lineHeight);
  });

  // Accroche discrète sous le titre : toujours visuellement secondaire.
  const subtitle = "Disponible maintenant sous licence pour tes créations";
  const subtitleY = titleStartY + Math.max(1, titleLines.length) * lineHeight + 34;
  context.shadowBlur = 8;
  context.font = "600 22px Arial, Helvetica, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.76)";
  context.fillText(subtitle, width / 2, subtitleY);

  context.shadowBlur = 10;
  context.font = "700 24px Arial, Helvetica, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.94)";
  context.fillText(`Credit : ${safeArtist || "Artiste Sonara"}`, width / 2, height - 84);
  context.restore();
}
function founderPromoCreateCoverTextureCanvas(coverImage, metadata = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1448;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas cover indisponible.");
  context.fillStyle = "#05070b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  founderPromoDrawImageCover(context, coverImage, 0, 0, canvas.width, canvas.height);
  founderPromoDrawCoverMetadata(context, metadata);
  return canvas;
}

async function founderPromoRenderBook3d(coverImage, metadata = {}) {
  const response = await fetch(FOUNDER_PACK_PROMO_MODEL, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Livre Blender introuvable (${response.status}).`);
  const { gltf, binary } = founderPromoParseGlb(await response.arrayBuffer());

  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1240;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true
  });
  if (!gl) throw new Error("WebGL indisponible : impossible de rendre le livre Blender.");

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  const solidProgram = founderPromoCreateProgram(gl, `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uMvp;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vNormal = mat3(uModel) * aNormal;
      gl_Position = uMvp * vec4(aPosition, 1.0);
    }
  `, `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vWorld;
    uniform vec3 uColor;
    uniform vec3 uEye;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(uEye - vWorld);
      vec3 keyDir = normalize(vec3(-0.62, 0.86, 1.20));
      vec3 fillDir = normalize(vec3(0.90, 0.30, 0.48));
      float key = max(dot(n, keyDir), 0.0);
      float fill = max(dot(n, fillDir), 0.0);
      vec3 halfVector = normalize(keyDir + viewDir);
      float specular = pow(max(dot(n, halfVector), 0.0), 44.0) * 0.28;
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * 0.10;
      float lighting = 0.30 + key * 0.64 + fill * 0.18;
      vec3 color = uColor * lighting + vec3(specular + rim);
      gl_FragColor = vec4(color, 1.0);
    }
  `);

  const textureProgram = founderPromoCreateProgram(gl, `
    attribute vec3 aPosition;
    attribute vec2 aUv;
    uniform mat4 uMvp;
    varying vec2 vUv;
    void main() {
      vUv = aUv;
      gl_Position = uMvp * vec4(aPosition, 1.0);
    }
  `, `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main() {
      vec4 texel = texture2D(uTexture, vUv);
      float edge = smoothstep(0.0, 0.035, vUv.x) * smoothstep(0.0, 0.035, 1.0 - vUv.x)
                 * smoothstep(0.0, 0.028, vUv.y) * smoothstep(0.0, 0.028, 1.0 - vUv.y);
      vec3 highlight = vec3(0.035) * (1.0 - vUv.x) * 0.8;
      gl_FragColor = vec4(texel.rgb * (0.93 + edge * 0.07) + highlight, 1.0);
    }
  `);

  const model = founderPromoMat4Multiply(
    founderPromoMat4RotationY(-0.035),
    founderPromoMat4Translation(-0.0005, -0.1525, 0)
  );
  const eye = [-0.205, 0.030, 0.535];
  const view = founderPromoMat4LookAt(eye, [0, 0.002, 0]);
  const projection = founderPromoMat4Perspective(36 * Math.PI / 180, canvas.width / canvas.height, 0.05, 5);
  const viewProjection = founderPromoMat4Multiply(projection, view);
  const mvp = founderPromoMat4Multiply(viewProjection, model);

  gl.useProgram(solidProgram);
  const solidPositionLocation = gl.getAttribLocation(solidProgram, "aPosition");
  const solidNormalLocation = gl.getAttribLocation(solidProgram, "aNormal");
  gl.uniformMatrix4fv(gl.getUniformLocation(solidProgram, "uModel"), false, model);
  gl.uniformMatrix4fv(gl.getUniformLocation(solidProgram, "uMvp"), false, mvp);
  gl.uniform3f(gl.getUniformLocation(solidProgram, "uEye"), eye[0], eye[1], eye[2]);

  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.mode != null && primitive.mode !== 4) continue;
      const positionIndex = primitive.attributes?.POSITION;
      const normalIndex = primitive.attributes?.NORMAL;
      if (positionIndex == null || normalIndex == null || primitive.indices == null) continue;

      const positions = founderPromoAccessor(gltf, binary, positionIndex);
      const normals = founderPromoAccessor(gltf, binary, normalIndex);
      const indices = founderPromoAccessor(gltf, binary, primitive.indices);

      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(solidPositionLocation);
      gl.vertexAttribPointer(solidPositionLocation, 3, gl.FLOAT, false, 0, 0);

      const normalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(solidNormalLocation);
      gl.vertexAttribPointer(solidNormalLocation, 3, gl.FLOAT, false, 0, 0);

      const indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

      const color = founderPromoBookColor(mesh.name);
      gl.uniform3f(gl.getUniformLocation(solidProgram, "uColor"), color[0], color[1], color[2]);
      const indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : (indices instanceof Uint8Array ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT);
      if (indexType === gl.UNSIGNED_INT && !gl.getExtension("OES_element_index_uint")) {
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(normalBuffer);
        gl.deleteBuffer(indexBuffer);
        throw new Error("Ce navigateur ne peut pas rendre le modèle Blender du livre.");
      }
      gl.drawElements(gl.TRIANGLES, indices.length, indexType, 0);

      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(normalBuffer);
      gl.deleteBuffer(indexBuffer);
    }
  }

  const coverTextureCanvas = founderPromoCreateCoverTextureCanvas(coverImage, metadata);
  const coverTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, coverTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, coverTextureCanvas);

  const coverVertices = new Float32Array([
    -0.1035, 0.0040, 0.0357,
     0.1045, 0.0040, 0.0357,
     0.1045, 0.3010, 0.0357,
    -0.1035, 0.3010, 0.0357
  ]);
  const coverUvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1
  ]);
  const coverIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  gl.useProgram(textureProgram);
  gl.uniformMatrix4fv(gl.getUniformLocation(textureProgram, "uMvp"), false, mvp);
  gl.uniform1i(gl.getUniformLocation(textureProgram, "uTexture"), 0);

  const coverPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, coverPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, coverVertices, gl.STATIC_DRAW);
  const coverPositionLocation = gl.getAttribLocation(textureProgram, "aPosition");
  gl.enableVertexAttribArray(coverPositionLocation);
  gl.vertexAttribPointer(coverPositionLocation, 3, gl.FLOAT, false, 0, 0);

  const coverUvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, coverUvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, coverUvs, gl.STATIC_DRAW);
  const coverUvLocation = gl.getAttribLocation(textureProgram, "aUv");
  gl.enableVertexAttribArray(coverUvLocation);
  gl.vertexAttribPointer(coverUvLocation, 2, gl.FLOAT, false, 0, 0);

  const coverIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, coverIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, coverIndices, gl.STATIC_DRAW);
  gl.drawElements(gl.TRIANGLES, coverIndices.length, gl.UNSIGNED_SHORT, 0);

  gl.deleteBuffer(coverPositionBuffer);
  gl.deleteBuffer(coverUvBuffer);
  gl.deleteBuffer(coverIndexBuffer);
  gl.deleteTexture(coverTexture);
  gl.deleteProgram(solidProgram);
  gl.deleteProgram(textureProgram);

  return canvas;
}

function founderPromoDrawVignette(context, width, height) {
  const radial = context.createRadialGradient(width * 0.5, height * 0.46, width * 0.10, width * 0.5, height * 0.48, width * 0.78);
  radial.addColorStop(0, "rgba(0,0,0,0)");
  radial.addColorStop(0.58, "rgba(0,0,0,0.08)");
  radial.addColorStop(1, "rgba(0,0,0,0.74)");
  context.fillStyle = radial;
  context.fillRect(0, 0, width, height);

  const vertical = context.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, "rgba(2,4,10,0.30)");
  vertical.addColorStop(0.35, "rgba(2,4,10,0.02)");
  vertical.addColorStop(0.78, "rgba(1,2,7,0.08)");
  vertical.addColorStop(1, "rgba(1,2,7,0.58)");
  context.fillStyle = vertical;
  context.fillRect(0, 0, width, height);
}

async function founderPackPromoPngBlob({ coverBlob, title, artist }) {
  const coverImage = await founderPromoLoadImageFromBlob(coverBlob);
  const bookCanvas = await founderPromoRenderBook3d(coverImage, { title, artist });

  const canvas = document.createElement("canvas");
  canvas.width = FOUNDER_PACK_PROMO_WIDTH;
  canvas.height = FOUNDER_PACK_PROMO_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas indisponible dans Founder.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.fillStyle = "#05070d";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.filter = "blur(34px) saturate(1.10) brightness(0.62)";
  founderPromoDrawImageCover(context, coverImage, -78, -82, canvas.width + 156, canvas.height + 164);
  context.restore();
  founderPromoDrawVignette(context, canvas.width, canvas.height);

  context.save();
  context.filter = "blur(28px)";
  context.globalAlpha = 0.58;
  context.fillStyle = "#000000";
  context.beginPath();
  context.ellipse(545, 1552, 285, 52, -0.035, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.drawImage(bookCanvas, 78, 258, 924, 1273);

  const brandGradient = context.createLinearGradient(0, 1680, 0, 1845);
  brandGradient.addColorStop(0, "rgba(4,6,12,0)");
  brandGradient.addColorStop(1, "rgba(4,6,12,0.38)");
  context.fillStyle = brandGradient;
  context.fillRect(0, 1640, canvas.width, 280);

  context.save();
  context.textAlign = "center";
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.font = "700 24px Arial, Helvetica, sans-serif";
  context.letterSpacing = "6px";
  context.fillText("SONARA PACK", canvas.width / 2, 1782);
  context.restore();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("PNG promo impossible à générer.")),
      "image/png"
    );
  });
}

function founderDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function founderFetchLocalAudioBuffer(packId, trackId) {
  const response = await fetch(`${API_BASE}/moderation/packs/${encodeURIComponent(packId)}/audio/${encodeURIComponent(trackId)}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (response.status === 401) {
    logout(false);
    throw new Error("Session expirée");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Audio source indisponible (${response.status}).`);
  }
  return response.arrayBuffer();
}

function founderWriteAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function founderAudioBufferToWavBlob(audioBuffer, startSeconds = 0, durationSeconds = 30) {
  const sampleRate = audioBuffer.sampleRate;
  const channelCount = Math.max(1, Math.min(2, audioBuffer.numberOfChannels || 1));
  const startFrame = Math.max(0, Math.min(audioBuffer.length, Math.floor(Math.max(0, startSeconds) * sampleRate)));
  const requestedFrames = Math.max(1, Math.floor(Math.max(1, durationSeconds) * sampleRate));
  const frameCount = Math.max(0, Math.min(requestedFrames, audioBuffer.length - startFrame));
  if (!frameCount) throw new Error("La sélection audio est vide.");

  const bytesPerSample = 2;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);
  founderWriteAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  founderWriteAscii(view, 8, "WAVE");
  founderWriteAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  founderWriteAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, channel) => audioBuffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][startFrame + frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([wav], { type: "audio/wav" });
}

async function downloadFounderTrackPreviewLocal({ packId, trackId, previewStart = 0, previewDuration = 30, filename = "sonara-extrait-30s.wav" }) {
  if (!packId || !trackId) throw new Error("Pack ou piste introuvable.");
  const source = await founderFetchLocalAudioBuffer(packId, trackId);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Décodage audio local indisponible dans ce navigateur.");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(source.slice(0));
    const clip = founderAudioBufferToWavBlob(decoded, previewStart, previewDuration);
    founderDownloadBlob(clip, filename);
  } finally {
    try { await context.close(); } catch {}
  }
}

async function downloadFounderPackPromo({ packId, title, artist }) {
  if (!packId) throw new Error("Pack introuvable pour le visuel promo.");
  const coverBlob = await founderPromoFetchBlob(`/moderation/packs/${encodeURIComponent(packId)}/cover`);
  const promoBlob = await founderPackPromoPngBlob({ coverBlob, title, artist });
  const safeName = moderationAssetFallbackName(title, "sonara-pack");
  founderDownloadBlob(promoBlob, `${safeName}-sonara-promo.png`);
}

function founderModerationCommunicationBlock(pack = {}, tracks = []) {
  const coverUrl = moderationCoverUrl(pack);
  const title = pack.title || pack.name || "Pack Sonara";
  const artist = pack.artistname || pack.artist || pack.pseudo || "Artiste Sonara";
  const categories = asArray(pack.categories).filter(Boolean);
  const category = pack.category || categories[0] || "Non indiquée";

  return `
    <section class="founder-moderation-social-kit">
      <div class="founder-moderation-social-kit-head">
        <div>
          <p class="eyebrow">Communication Sonara Pack</p>
          <h4>Éléments prêts pour tes réseaux</h4>
        </div>
        <span class="founder-social-founder-only"><i data-lucide="lock-keyhole"></i>Founder uniquement</span>
      </div>
      <div class="founder-moderation-social-kit-body">
        <div class="founder-social-cover-preview">
          ${coverUrl ? `<img src="${escapeHTML(coverUrl)}" alt="" loading="lazy">` : `<i data-lucide="image"></i>`}
        </div>
        <div class="founder-social-kit-info">
          <strong>${escapeHTML(title)}</strong>
          <span>${escapeHTML(artist)} · ${escapeHTML(category)}</span>
          <p>La cover est récupérable ici. Pour l’audio, chaque piste ci-dessous possède son vrai extrait de 30 s basé sur la sélection automatique Sonara.</p>
          <div class="founder-social-kit-actions">
            <button type="button" class="founder-social-download-button" data-moderation-download="cover">
              <i data-lucide="download"></i>Télécharger la cover
            </button>
            <button type="button" class="founder-social-download-button" data-moderation-download="promo">
              <i data-lucide="image"></i>Visuel promo PNG
            </button>
          </div>
          <small>${tracks.length ? `${tracks.length} piste${tracks.length > 1 ? "s" : ""} disponible${tracks.length > 1 ? "s" : ""} pour préparer une publication.` : "Aucune piste audio disponible."}</small>
        </div>
      </div>
    </section>`;
}

function bindModerationAssetDownloads(panel, pack, tracks) {
  if (!panel || panel.dataset.downloadBindings === "true") return;
  panel.dataset.downloadBindings = "true";
  const packId = String(pack?.id || pack?.packId || "");

  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-moderation-download]");
    if (!button || !panel.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;

    const kind = String(button.dataset.moderationDownload || "");
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i>Préparation…`;
    icons();

    try {
      if (kind === "cover") {
        const rawTitle = String(pack?.title || pack?.name || "Pack Sonara");
        const rawArtist = String(pack?.artistname || pack?.artist || pack?.pseudo || "Artiste Sonara");
        const title = moderationAssetFallbackName(rawTitle, "sonara-pack");
        await downloadModerationAsset(
          `/moderation/packs/${encodeURIComponent(packId)}/cover`,
          `${title}-cover.jpg`
        );
        await downloadFounderPackPromo({ packId, title: rawTitle, artist: rawArtist });
        showToast("Cover + visuel promo téléchargés.");
      } else if (kind === "promo") {
        await downloadFounderPackPromo({
          packId,
          title: String(pack?.title || pack?.name || "Pack Sonara"),
          artist: String(pack?.artistname || pack?.artist || pack?.pseudo || "Artiste Sonara")
        });
        showToast("Visuel promo PNG généré.");
      } else if (kind === "preview") {
        const trackId = String(button.dataset.trackId || "");
        const track = tracks.find((item) => String(item?.id || item?.trackId || "") === trackId);
        if (!trackId || !track) throw new Error("Piste introuvable.");
        const packName = moderationAssetFallbackName(pack?.title || pack?.name, "sonara-pack");
        const trackName = moderationAssetFallbackName(track?.title || track?.name, "extrait");
        await downloadFounderTrackPreviewLocal({
          packId,
          trackId,
          previewStart: Math.max(0, asNumber(button.dataset.previewStart, track.previewStart || 0)),
          previewDuration: Math.min(30, Math.max(1, asNumber(button.dataset.previewDuration, track.previewDuration || 30))),
          filename: `${packName}-${trackName}-30s.wav`
        });
        showToast("Extrait audio 30 s généré localement.");
      }
    } catch (error) {
      showToast(error.message || "Téléchargement impossible.", "error");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      icons();
    }
  });
}

async function moderationTrackBlobUrl(packId, trackId) {
  const response = await fetch(`${API_BASE}/moderation/packs/${encodeURIComponent(packId)}/audio/${encodeURIComponent(trackId)}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (response.status === 401) { logout(false); throw new Error("Session expirée"); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Audio indisponible (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  state.moderationAudioUrls.push(url);
  return url;
}

async function toggleModerationPackAudio(card) {
  const panel = card.querySelector("[data-pack-audio-panel]");
  if (!panel) return;

  const isOpen = !panel.hidden;
  if (isOpen) {
    panel.hidden = true;
    card.setAttribute("aria-expanded", "false");
    panel.querySelectorAll("audio").forEach((audio) => { try { audio.pause(); } catch {} });
    return;
  }

  document.querySelectorAll(".moderation-pack-card[aria-expanded='true']").forEach((otherCard) => {
    if (otherCard === card) return;
    otherCard.setAttribute("aria-expanded", "false");
    const otherPanel = otherCard.querySelector("[data-pack-audio-panel]");
    if (otherPanel) otherPanel.hidden = true;
    otherCard.querySelectorAll("audio").forEach((audio) => { try { audio.pause(); } catch {} });
  });

  panel.hidden = false;
  card.setAttribute("aria-expanded", "true");
  if (panel.dataset.loaded === "true") return;

  const packId = card.dataset.packId || "";
  const pack = state.moderationPacks.find((item) => String(item.id || item.packId) === String(packId));
  const tracks = asArray(pack?.tracks).filter((track) => track && (track.id || track.trackId));

  panel.innerHTML = `
    ${founderHumanCreationBlock(pack)}
    ${founderModerationCommunicationBlock(pack, tracks)}
    <section class="founder-audio-verification">
      <div class="moderation-audio-head">
        <div><p class="eyebrow">Écoutes audio</p><h4>${tracks.length ? `${tracks.length} piste${tracks.length > 1 ? "s" : ""} à vérifier` : "Aucune piste audio disponible"}</h4></div>
        <small>Lecture réservée à la modération Founder</small>
      </div>
      ${tracks.length ? `
        <div class="moderation-audio-list">
          ${tracks.map((track, index) => `
            <article class="moderation-audio-track" data-track-audio-row="${escapeHTML(track.id || track.trackId)}">
              <div class="moderation-audio-track-title"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHTML(track.title || track.name || `Piste ${index + 1}`)}</strong></div>
              <div class="moderation-audio-loading"><i data-lucide="loader-circle"></i>Chargement de l’audio…</div>
            </article>`).join("")}
        </div>` : `<div class="moderation-audio-empty"><i data-lucide="audio-lines"></i><span>Aucune piste audio à contrôler dans ce pack.</span></div>`}
    </section>`;
  bindModerationAssetDownloads(panel, pack, tracks);
  icons();

  if (!tracks.length) {
    panel.dataset.loaded = "true";
    return;
  }

  await Promise.all(tracks.map(async (track) => {
    const trackId = String(track.id || track.trackId);
    const row = panel.querySelector(`[data-track-audio-row="${CSS.escape(trackId)}"]`);
    if (!row) return;
    try {
      const url = await moderationTrackBlobUrl(packId, trackId);
      const previewStart = Math.max(0, Number(track.previewStart || 0));
      const previewDuration = Math.min(30, Math.max(1, Number(track.previewDuration || 30)));
      row.innerHTML = `
        <div class="moderation-audio-track-title"><span>${String(tracks.indexOf(track) + 1).padStart(2, "0")}</span><strong>${escapeHTML(track.title || track.name || "Piste")}</strong></div>
        <div class="moderation-audio-track-tools">
          <audio controls preload="metadata" src="${url}"></audio>
          <div class="moderation-highlight-picker" data-highlight-picker data-track-id="${escapeHTML(trackId)}" data-preview-start="${previewStart}" data-preview-duration="${previewDuration}">
            <div class="moderation-highlight-picker-head">
              <strong>Moment fort</strong>
              <small data-highlight-label>${moderationPreviewClock(previewStart)} → ${moderationPreviewClock(previewStart + previewDuration)}</small>
            </div>
            <div class="moderation-highlight-picker-controls">
              <input type="range" min="0" step="0.1" value="${previewStart}" data-highlight-range aria-label="Début du moment fort">
              <label>Début <input type="number" min="0" step="0.1" value="${previewStart}" data-highlight-number> s</label>
              <button type="button" class="secondary-button compact" data-highlight-listen><i data-lucide="play"></i>Écouter ici</button>
            </div>
            <small class="moderation-highlight-help">Choisis le début du passage. À l’acceptation, ce moment devient la preview Sonara de 30 s.</small>
          </div>
          <div class="moderation-preview-export">
            <small>Extrait actuel · <span data-preview-export-label>${moderationPreviewClock(previewStart)} → ${moderationPreviewClock(previewStart + previewDuration)}</span></small>
            <button type="button" class="founder-social-download-button compact" data-moderation-download="preview" data-track-id="${escapeHTML(trackId)}" data-preview-start="${previewStart}" data-preview-duration="${previewDuration}">
              <i data-lucide="download"></i>Télécharger l’extrait 30 s
            </button>
          </div>
        </div>`;
    } catch (error) {
      row.innerHTML = `
        <div class="moderation-audio-track-title"><span>!</span><strong>${escapeHTML(track.title || track.name || "Piste")}</strong></div>
        <small class="moderation-audio-error">${escapeHTML(error.message)}</small>`;
    }
  }));

  panel.querySelectorAll("[data-highlight-picker]").forEach((picker) => {
    const row = picker.closest(".moderation-audio-track");
    const audio = row?.querySelector("audio");
    const range = picker.querySelector("[data-highlight-range]");
    const number = picker.querySelector("[data-highlight-number]");
    const listen = picker.querySelector("[data-highlight-listen]");
    const label = picker.querySelector("[data-highlight-label]");
    const exportLabel = row?.querySelector("[data-preview-export-label]");
    const exportButton = row?.querySelector("[data-moderation-download='preview']");
    const duration = Math.min(30, Math.max(1, asNumber(picker.dataset.previewDuration, 30)));

    const syncMax = () => {
      if (!audio || !Number.isFinite(audio.duration)) return;
      const maxStart = Math.max(0, audio.duration - Math.min(duration, audio.duration));
      range.max = String(maxStart);
      number.max = String(maxStart);
    };
    const applyStart = (raw, manual = true) => {
      syncMax();
      const max = Number.isFinite(Number(number.max)) ? Number(number.max) : Number.POSITIVE_INFINITY;
      const start = Math.max(0, Math.min(max, asNumber(raw, 0)));
      const rounded = Math.round(start * 10) / 10;
      picker.dataset.previewStart = String(rounded);
      if (manual) picker.dataset.previewManual = "true";
      range.value = String(rounded);
      number.value = String(rounded);
      const text = `${moderationPreviewClock(rounded)} → ${moderationPreviewClock(rounded + duration)}`;
      if (label) label.textContent = text;
      if (exportLabel) exportLabel.textContent = text;
      if (exportButton) exportButton.dataset.previewStart = String(rounded);
    };

    audio?.addEventListener("loadedmetadata", () => { syncMax(); applyStart(picker.dataset.previewStart, false); }, { once: true });
    range?.addEventListener("input", () => applyStart(range.value));
    number?.addEventListener("change", () => applyStart(number.value));
    listen?.addEventListener("click", () => {
      if (!audio) return;
      applyStart(picker.dataset.previewStart, false);
      audio.currentTime = Math.max(0, asNumber(picker.dataset.previewStart, 0));
      audio.play().catch(() => {});
    });
  });

  icons();
  panel.dataset.loaded = "true";
}

function bindModerationPackAudio() {
  document.querySelectorAll(".moderation-pack-card").forEach((card) => {
    const activate = (event) => {
      if (event.target.closest("button, a, details, summary, input, select, textarea, audio")) return;
      toggleModerationPackAudio(card);
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleModerationPackAudio(card);
    });
  });
}

function bindModeration(mode) {
  if (mode === "packs") bindModerationPackAudio();
  document.querySelectorAll(".moderation-actions button").forEach((button) =>
    button.addEventListener("click", async () => {
      let reason = "";
      if (button.dataset.action === "rejected") {
        reason = window.prompt("Motif précis du refus — ce message sera affiché à l’utilisateur :", "")?.trim() || "";
        if (!reason) {
          showToast("Le motif du refus est obligatoire.", "error");
          return;
        }
      }

      button.disabled = true;

      try {
        const previews = mode === "packs" && button.dataset.action === "approved"
          ? [...document.querySelectorAll(`.moderation-pack-card[data-pack-id="${CSS.escape(String(button.dataset.id || ""))}"] [data-highlight-picker][data-preview-manual="true"]`)].map((picker) => ({
              trackId: String(picker.dataset.trackId || ""),
              previewStart: Math.max(0, asNumber(picker.dataset.previewStart, 0)),
              previewDuration: Math.min(30, Math.max(1, asNumber(picker.dataset.previewDuration, 30)))
            })).filter((item) => item.trackId)
          : [];
        await api(
        `/moderation/${mode}/${encodeURIComponent(button.dataset.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: button.dataset.action, reason, previews })
        }
      );

        showToast(button.dataset.action === "approved" ? "Demande acceptée." : "Demande refusée. Aucune contestation n’a été créée automatiquement.");
        await renderModeration(mode);
        refreshOverview();
      } catch (error) {
        showToast(error.message, "error");
        button.disabled = false;
      }
  })
  );
}

function accountControlState(account = {}) {
  const status = String(account.status || "approved").toLowerCase();
  const artistStatus = String(account.artistStatus || "").toLowerCase();

  if (status === "banned" || artistStatus === "banned") return "banned";
  if (status === "suspended" || artistStatus === "suspended") return "suspended";
  if (
    account.role === "user" &&
    ["rejected", "banned", "suspended"].includes(artistStatus)
  ) {
    return "creator_removed";
  }

  return "active";
}

function canRestoreCreator(account = {}) {
  const originalRole = String(account.originalRole || "").toLowerCase();
  const currentRole = String(account.role || "").toLowerCase();
  return ["artist", "both"].includes(originalRole) ||
  ["artist", "both"].includes(currentRole) ||
  Boolean(account.artistStatus);
}

function founderAccountsFingerprint(accounts = []) {
  return asArray(accounts)
    .map((account) => [
      String(account.userId || account.rootUserId || account.rootId || ""),
      String(account.accountId || account.id || ""),
      String(account.updatedAt || account.createdAt || ""),
      String(account.lastSeenAt || ""),
      String(account.sessionCount || ""),
      String(account.activeDays || ""),
      String(account.returnSessionCount || ""),
      String(account.status || ""),
      String(account.role || ""),
      String(account.artistLegalIdentity?.country || ""),
      String(account.artistLegalIdentity?.activityType || ""),
      String(account.artistLegalIdentity?.identifierType || ""),
      String(account.artistLegalIdentity?.registrationNumber || account.artistLegalIdentity?.siret || ""),
      String(account.stripeStatus || ""),
      String(account.stripeAccountId || ""),
      asArray(account.founderObservedBackends).map(String).sort().join(",")
    ].join("|"))
    .sort()
    .join("\n");
}

function founderAccountsRefreshLabel() {
  if (!state.moderationAccountsLastRefreshAt) return "Liste Sonara actuelle";
  const date = new Date(state.moderationAccountsLastRefreshAt);
  if (Number.isNaN(date.getTime())) return "Liste Sonara actuelle";
  return `Actualisé à ${new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(date)}`;
}

function founderAccountsReconciliationLabel() {
  const reconciliation = state.moderationAccountsReconciliation;
  if (!reconciliation || state.environment !== "main") return "";
  const renderCount = Number(reconciliation.seenBy?.render || 0);
  const backupCount = Number(reconciliation.seenBy?.backup || 0);
  const merged = Number(reconciliation.mergedAccounts || 0);
  const single = Number(reconciliation.onlyOneBackend || 0);
  return `MAIN réconcilié · Render ${renderCount} · Backup ${backupCount} · Fusion ${merged}${single ? ` · ${single} visible(s) sur un seul backend` : ""}`;
}

function founderAccountsRefreshControls() {
  const reconciliationLabel = founderAccountsReconciliationLabel();
  return `
    <div class="founder-account-refresh-controls">
      <span>${escapeHTML(founderAccountsRefreshLabel())}${reconciliationLabel ? `<small>${escapeHTML(reconciliationLabel)}</small>` : ""}</span>
      <button id="refreshFounderAccounts" class="secondary-button" type="button">
        <i data-lucide="refresh-cw"></i>
        Actualiser les comptes
      </button>
    </div>`;
}

function bindFounderAccountsRefresh(mode) {
  const button = document.getElementById("refreshFounderAccounts");
  if (!button) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await renderModeration(
        mode,
        mode === "accounts" ? state.moderationSearch : state.moderationRegistrationSearch
      );
      showToast("Liste des comptes Sonara réactualisée.");
    } catch (error) {
      showToast(error.message || "Actualisation impossible.", "error");
    }
  });
}

function stopFounderAccountsLiveRefresh() {
  if (!state.moderationAccountsRefreshTimer) return;
  window.clearInterval(state.moderationAccountsRefreshTimer);
  state.moderationAccountsRefreshTimer = null;
}

function startFounderAccountsLiveRefresh() {
  stopFounderAccountsLiveRefresh();
  if (state.view !== "moderation" || !["accounts", "registrations"].includes(state.moderationMode)) return;

  state.moderationAccountsRefreshTimer = window.setInterval(async () => {
    if (
      state.view !== "moderation" ||
      !["accounts", "registrations"].includes(state.moderationMode) ||
      document.hidden
    ) return;

    const viewAtStart = state.view;
    const modeAtStart = state.moderationMode;
    try {
      const response = asObject(await api(`/accounts?fast=1&refresh=${Date.now()}`));
      if (
        state.view !== viewAtStart ||
        state.view !== "moderation" ||
        state.moderationMode !== modeAtStart ||
        document.hidden
      ) return;

      const accounts = asArray(response.items || response.accounts);
      const nextFingerprint = founderAccountsFingerprint(accounts);
      state.moderationAccountsLastRefreshAt = response.founderRefreshAt || new Date().toISOString();
      if (nextFingerprint && nextFingerprint !== state.moderationAccountsFingerprint) {
        state.moderationAccountsFingerprint = nextFingerprint;
        const searchValue = modeAtStart === "accounts" ? state.moderationSearch : state.moderationRegistrationSearch;
        await renderModeration(modeAtStart, searchValue);
        if (state.view === "moderation") showToast("Nouveau compte Sonara détecté.");
      }
    } catch (_) {
      // Lecture silencieuse uniquement : ne bloque jamais Founder.
    }
  }, 20000);
}

function groupFounderAccounts(accounts = []) {
  const groups = new Map();

  asArray(accounts).forEach((account, index) => {
    const rootUserId = String(
      account.userId ||
      account.rootUserId ||
      account.rootId ||
      `compte_sans_id_general_${account.accountId || account.id || index}`
    );

    if (!groups.has(rootUserId)) {
      groups.set(rootUserId, {
        rootUserId,
        accounts: []
      });
    }

    groups.get(rootUserId).accounts.push(account);
  });

  return [...groups.values()]
    .map((group) => {
      group.accounts.sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
      );

      group.primaryAccount =
        group.accounts.find((account) => account.pseudo || account.artistname) ||
        group.accounts.find((account) => account.mail) ||
        group.accounts[0] || {};

      return group;
    })
    .sort((a, b) =>
      new Date(
        b.primaryAccount.updatedAt ||
        b.primaryAccount.createdAt ||
        0
      ) -
      new Date(
        a.primaryAccount.updatedAt ||
        a.primaryAccount.createdAt ||
        0
      )
    );
}

function rootAccountControlState(group = {}) {
  const states = asArray(group.accounts).map(accountControlState);
  if (states.includes("banned")) return "banned";
  if (states.includes("suspended")) return "suspended";
  if (states.includes("creator_removed")) return "creator_removed";
  return "active";
}

function accountStateLabel(stateName) {
  return {
    active: "Actif",
    suspended: "Suspendu",
    banned: "Banni",
    creator_removed: "Creator retiré"
  }[stateName] || "Actif";
}

function safeAccountDate(value) {
  return value ? formatDate(value) : "Non renseignée";
}

function founderReturnDayKey(value) {
  const date = value instanceof Date ? value : new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function founderReturnMetrics(accountsInput = []) {
  const accounts = asArray(accountsInput).filter(Boolean);
  const createdDates = accounts
    .map((account) => new Date(account.createdAt || account.registeredAt || ""))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  const createdAt = createdDates.length ? createdDates[0].toISOString() : "";
  const createdDay = founderReturnDayKey(createdAt);

  const activityDays = [...new Set(accounts.flatMap((account) =>
    asArray(account.platformActivityDays).map((day) => String(day || "").slice(0, 10)).filter(Boolean)
  ))].sort();

  const lastSeenDates = accounts
    .map((account) => new Date(account.lastSeenAt || ""))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);

  const sessionCount = Math.max(0, ...accounts.map((account) => Number(account.sessionCount || 0)).filter(Number.isFinite));
  const returnSessionCount = Math.max(0, ...accounts.map((account) => Number(account.returnSessionCount || 0)).filter(Number.isFinite));
  const storedActiveDays = Math.max(0, ...accounts.map((account) => Number(account.activeDays || 0)).filter(Number.isFinite));
  const activeDays = Math.max(activityDays.length, storedActiveDays);
  const returnActiveDays = activityDays.length
    ? activityDays.filter((day) => !createdDay || day > createdDay).length
    : 0;
  const sessionTrackingKnown = accounts.some((account) =>
    Boolean(account.sessionTrackingStartedAt) || Number(account.sessionCount || 0) > 0
  );
  const trackingKnown = sessionTrackingKnown || accounts.some((account) =>
    asArray(account.platformActivityDays).length > 0
  );
  const returned = returnActiveDays > 0 || returnSessionCount > 0;
  const active = returnActiveDays >= 3;
  // Sans le nouveau suivi de sessions, une absence de retour n'est pas une preuve :
  // les comptes historiques restent donc "Historique inconnu" tant qu'on n'a pas
  // observé une vraie session avec la nouvelle logique.
  const status = active ? "active" : returned ? "returned" : sessionTrackingKnown ? "new" : "unknown";

  return {
    createdAt,
    lastSeenAt: lastSeenDates.length ? lastSeenDates[0].toISOString() : "",
    sessionCount,
    returnSessionCount,
    activeDays,
    returnActiveDays,
    trackingKnown,
    sessionTrackingKnown,
    returned,
    status
  };
}

function founderReturnStatusLabel(status) {
  return {
    new: "Nouveau",
    returned: "Revenu",
    active: "Actif",
    unknown: "Historique inconnu"
  }[String(status || "unknown")] || "Historique inconnu";
}

function founderAccountReturnMetrics(account = {}) {
  return founderReturnMetrics([account]);
}

function founderGroupReturnMetrics(group = {}) {
  return founderReturnMetrics(asArray(group.accounts));
}

function accountStripeBlock(accounts = []) {
  const stripeAccounts = asArray(accounts).filter((account) =>
    account.stripeAccountId || account.stripeStatus
  );

  if (!stripeAccounts.length) return "";

  return `<section class="root-stripe-section">
    <div class="root-section-title">
      <div>
        <p class="eyebrow">Séparé des comptes Sonara</p>
        <h4>Compte Stripe</h4>
      </div>
      <i data-lucide="badge-euro"></i>
    </div>
    <div class="root-stripe-list">
      ${stripeAccounts.map((account) => `
        <article class="root-stripe-row">
          <div>
            <strong>${escapeHTML(account.pseudo || account.artistname || account.mail || "Compte artiste")}</strong>
            <small>accountId ${escapeHTML(account.accountId || account.id || "")}</small>
          </div>
          <div>
            <span>${escapeHTML(account.stripeStatus || "Statut inconnu")}</span>
            <small>${escapeHTML(account.stripeAccountId || "Identifiant Stripe non communiqué")}</small>
          </div>
        </article>
      `).join("")}
    </div>
  </section>`;
}

function compactEvidenceHash(value) {
  const text = String(value || "").trim();
  return text ? `${text.slice(0, 18)}${text.length > 18 ? "…" : ""}` : "Non disponible";
}

function licenseTraceabilityBlock(account = {}) {
  const evidence = asObject(account.licenseEvidence);
  const artistEvidence = asObject(account.artistLicenseEvidence);
  const downloads = asArray(evidence.downloads);
  const acceptances = asArray(evidence.acceptances);
  const legacyDownloads = asArray(evidence.legacyDownloads);
  const incidents = asArray(evidence.incidents);
  const sanctions = asArray(evidence.sanctions);
  const publications = asArray(artistEvidence.publications);
  const rightsDeclarations = asArray(artistEvidence.rightsDeclarations);
  const accountId = String(account.accountId || account.id || "");

  return `<details class="moderation-history license-traceability">
    <summary>Licences & traçabilité · ${downloads.length} téléchargement(s)</summary>
    <div class="history-row">
      <strong>Licence courante</strong>
      <span>${escapeHTML(evidence.currentLicenseVersion || "Non renseignée")}</span>
      <time>Serveur Sonara</time>
    </div>

    ${downloads.length ? downloads.slice(0, 20).map((receipt) => `
      <div class="history-row">
        <strong>${escapeHTML(receipt.trackTitleSnapshot || receipt.packTitleSnapshot || receipt.packId || "Téléchargement")}</strong>
        <span>
          downloadId ${escapeHTML(receipt.downloadId || "—")} · receipt ${escapeHTML(receipt.licenseReceiptId || "—")}<br>
          Licence ${escapeHTML(receipt.licenseVersion || (receipt.legacyLicenseRecord ? "LEGACY — preuve incomplète" : "—"))} · hash ${escapeHTML(compactEvidenceHash(receipt.licenseHash))}<br>
          Original ${escapeHTML(compactEvidenceHash(receipt.originalFileHash || receipt.originalFileHashes?.[0]?.originalFileHash))}
        </span>
        <time>${formatDate(receipt.deliveredAt || receipt.preparedAt || receipt.createdAt)}</time>
      </div>
    `).join("") : `<p class="muted small">Aucune licenseReceipt enregistrée pour ce compte.</p>`}

    ${acceptances.length ? `<details class="moderation-history">
      <summary>Acceptations de licence (${acceptances.length})</summary>
      ${acceptances.slice(0, 20).map((item) => `
        <div class="history-row">
          <strong>${escapeHTML(item.packId || "Pack")}${item.trackId ? ` · ${escapeHTML(item.trackId)}` : ""}</strong>
          <span>${escapeHTML(item.licenseVersion || "—")} · ${escapeHTML(compactEvidenceHash(item.licenseHash))}</span>
          <time>${formatDate(item.acceptedAt || item.createdAt)}</time>
        </div>
      `).join("")}
    </details>` : ""}

    ${legacyDownloads.length ? `<details class="moderation-history">
      <summary>Legacy sans preuve complète (${legacyDownloads.length})</summary>
      ${legacyDownloads.slice(0, 20).map((item) => `
        <div class="history-row">
          <strong>${escapeHTML(item.packId || "Pack")}${item.trackId ? ` · ${escapeHTML(item.trackId)}` : ""}</strong>
          <span>${escapeHTML(item.migrationNote || "Aucune acceptation historique inventée.")}</span>
          <time>${formatDate(item.observedAt || item.createdAt)}</time>
        </div>
      `).join("")}
    </details>` : ""}

    ${publications.length || rightsDeclarations.length ? `<details class="moderation-history">
      <summary>Preuves artiste · publications ${publications.length} · déclarations ${rightsDeclarations.length}</summary>
      ${publications.slice(0, 20).map((item) => `
        <div class="history-row">
          <strong>${escapeHTML(item.packTitleSnapshot || item.packId || "Pack publié")}</strong>
          <span>${asArray(item.files).map((file) => `${escapeHTML(file.titleSnapshot || file.trackId || "Track")}: ${escapeHTML(compactEvidenceHash(file.originalFileHash))}`).join("<br>") || "Hash historique non disponible"}</span>
          <time>${formatDate(item.publishedAt || item.createdAt)}</time>
        </div>
      `).join("")}
      ${rightsDeclarations.slice(0, 20).map((item) => `
        <div class="history-row">
          <strong>Déclaration ${escapeHTML(item.declarationVersion || "—")}</strong>
          <span>${escapeHTML(item.legalTextStatus || "—")} · ${escapeHTML(item.rightsDeclarationId || "—")}</span>
          <time>${formatDate(item.acceptedAt || item.createdAt)}</time>
        </div>
      `).join("")}
    </details>` : ""}

    ${incidents.length ? `<details class="moderation-history" open>
      <summary>Incidents de droits (${incidents.length})</summary>
      ${incidents.slice(0, 20).map((incident) => {
        const isTarget = String(incident.reportedAccountId || "") === accountId;
        return `<div class="history-row license-incident-row" data-license-incident="${escapeHTML(incident.incidentId || incident.id || "")}">
          <strong>${escapeHTML(incident.incidentType || "UNAUTHORIZED_MUSIC_REPUBLICATION")} · ${escapeHTML(incident.status || "PENDING")}</strong>
          <span>
            ${escapeHTML(incident.externalPlatform || "Plateforme non renseignée")} · ${incident.externalUrl ? `<a href="${escapeHTML(incident.externalUrl)}" target="_blank" rel="noopener noreferrer">ouvrir le lien</a>` : "URL absente"}<br>
            Pack ${escapeHTML(incident.packId || "—")}${incident.trackId ? ` · Track ${escapeHTML(incident.trackId)}` : ""}${incident.downloadId ? `<br>downloadId ${escapeHTML(incident.downloadId)}` : ""}
            <div>
              ${["PENDING", "UNDER_REVIEW"].includes(String(incident.status || "")) ? `
                <button type="button" class="secondary-button license-incident-review" data-status="UNDER_REVIEW">Mettre en examen</button>
                <button type="button" class="primary-button license-incident-review" data-status="CONFIRMED">Confirmer</button>
                <button type="button" class="secondary-button license-incident-review" data-status="REJECTED">Rejeter</button>
              ` : ""}
              ${String(incident.status || "") === "CONFIRMED" ? `<button type="button" class="secondary-button license-incident-review" data-status="RESOLVED">Marquer résolu</button>` : ""}
            </div>
            ${String(incident.status || "") === "CONFIRMED" && isTarget ? `
              <div class="license-sanction-form" data-target-account="${escapeHTML(accountId)}">
                <select class="license-sanction-level">
                  <option value="WARNING">Avertissement</option>
                  <option value="DOWNLOAD_RESTRICTED">Téléchargements restreints</option>
                  <option value="TEMPORARY_SUSPENSION">Suspension temporaire</option>
                  <option value="PERMANENT_BAN">Bannissement permanent</option>
                </select>
                <input class="license-sanction-reason" placeholder="Motif de la sanction">
                <button type="button" class="primary-button license-sanction-apply">Appliquer après confirmation</button>
              </div>
            ` : ""}
          </span>
          <time>${formatDate(incident.reviewedAt || incident.createdAt)}</time>
        </div>`;
      }).join("")}
    </details>` : ""}

    ${sanctions.length ? `<details class="moderation-history">
      <summary>Sanctions de licence (${sanctions.length})</summary>
      ${sanctions.slice(0, 20).map((item) => `
        <div class="history-row">
          <strong>${escapeHTML(item.level || "Sanction")}</strong>
          <span>${escapeHTML(item.reason || "Sans motif")} · incident ${escapeHTML(item.incidentId || "—")}</span>
          <time>${formatDate(item.appliedAt || item.createdAt)}</time>
        </div>
      `).join("")}
    </details>` : ""}
  </details>`;
}

function accountControlCard(account = {}) {
  const id = account.accountId || account.id || "";
  const stateName = accountControlState(account);
  const history = asArray(account.moderationHistory).slice(0, 3);
  const returnMetrics = founderAccountReturnMetrics(account);

  return `<article class="account-control-card" data-account-state="${stateName}">
    <div class="account-control-head">
      <span class="row-icon"><i data-lucide="user-cog"></i></span>
      <div>
        <p class="eyebrow">${escapeHTML(account.role || "user")} ${environmentBadge(account.environment)}</p>
        <h3>${escapeHTML(account.pseudo || account.artistname || account.mail || "Compte Sonara")}</h3>
        <small>${escapeHTML(account.mail || "E-mail non renseigné")} · accountId ${escapeHTML(id)}</small>
      </div>
      <span class="account-state ${stateName}">${accountStateLabel(stateName)}</span>
    </div>

    <div class="account-personal-grid">
      <div><span>Pseudo</span><strong>${escapeHTML(account.pseudo || account.artistname || "Non renseigné")}</strong></div>
      <div><span>E-mail</span><strong>${escapeHTML(account.mail || "Non renseigné")}</strong></div>
      <div><span>accountId</span><strong>${escapeHTML(id || "Non renseigné")}</strong></div>
      <div><span>Rôle</span><strong>${escapeHTML(account.role || "user")}</strong></div>
      <div><span>Statut du compte</span><strong>${escapeHTML(account.status || "approved")}</strong></div>
      <div><span>Statut Creator</span><strong>${escapeHTML(account.artistStatus || "Non concerné")}</strong></div>
      ${["artist", "both"].includes(String(account.originalRole || account.role || "").toLowerCase()) || account.artistStatus ? `
        <div><span>Pays d’activité</span><strong>${escapeHTML(account.artistLegalIdentity?.countryName || account.artistLegalIdentity?.country || "Non renseigné")}</strong></div>
        <div><span>Situation</span><strong>${escapeHTML(account.artistLegalIdentity?.activityType === "registered" ? "Entreprise / activité immatriculée" : account.artistLegalIdentity?.activityType === "individual_no_number" ? "Activité individuelle déclarée sans numéro" : "Non renseignée")}</strong></div>
        <div><span>Type d'identifiant</span><strong>${escapeHTML(account.artistLegalIdentity?.identifierLabel || account.artistLegalIdentity?.identifierType || "Aucun")}</strong></div>
        <div><span>Identifiant déclaré</span><strong>${escapeHTML(account.artistLegalIdentity?.registrationNumber || account.artistLegalIdentity?.siret || "Non renseigné")}</strong></div>
        <div><span>Nom légal déclaré</span><strong>${escapeHTML(account.artistLegalIdentity?.legalName || "Non renseigné")}</strong></div>
        <div><span>Vérification officielle</span><strong>${escapeHTML(account.artistLegalIdentity?.status === "declared_unverified" ? "Registre national à vérifier" : account.artistLegalIdentity?.status === "self_declared_unverified" ? "Règles locales à examiner" : "Non renseignée")}</strong></div>
        <div><span>Banque / Stripe Connect</span><strong>${escapeHTML(!account.stripeAccountId ? "Non connecté" : account.stripeStatus === "verified" ? "Stripe vérifié · versements annoncés prêts" : "Stripe connecté · vérification en cours")}</strong></div>
        <div><span>Identifiant Stripe</span><strong>${escapeHTML(account.stripeAccountId || "Aucun")}</strong></div>
      ` : ""}
      <div><span>Contenu masqué</span><strong>${Number(account.hiddenPackCount || 0)} pack(s)</strong></div>
      <div><span>Création</span><strong>${safeAccountDate(account.createdAt)}</strong></div>
      <div><span>Dernière visite</span><strong>${returnMetrics.lastSeenAt ? safeAccountDate(returnMetrics.lastSeenAt) : "Non observée"}</strong></div>
      <div><span>Sessions</span><strong>${returnMetrics.sessionCount > 0 ? returnMetrics.sessionCount : "—"}</strong></div>
      <div><span>Jours actifs</span><strong>${returnMetrics.trackingKnown ? returnMetrics.activeDays : "—"}</strong></div>
      <div><span>Statut retour</span><strong>${escapeHTML(founderReturnStatusLabel(returnMetrics.status))}</strong></div>
      <div><span>Dernière modification</span><strong>${safeAccountDate(account.updatedAt)}</strong></div>
      ${asArray(account.founderObservedBackends).length ? `<div><span>Backend Main observé</span><strong>${escapeHTML(asArray(account.founderObservedBackends).map((name) => name === "render" ? "Render" : name === "backup" ? "Backup" : String(name)).join(" + "))}</strong></div>` : ""}
    </div>

    <div class="account-control-form"
      data-control-account="${escapeHTML(id)}"
      data-control-user="${escapeHTML(account.userId || account.rootUserId || "")}"
      data-control-mail="${escapeHTML(account.mail || "")}"
      data-control-pseudo="${escapeHTML(account.pseudo || account.artistname || "")}">
      <label>
        Décision
        <select class="account-control-action">
          <option value="">Choisir une action</option>
          <option value="suspend">Suspendre temporairement</option>
          <option value="ban">Bannir</option>
          ${["artist", "both"].includes(String(account.originalRole || account.role || "").toLowerCase()) || account.artistStatus
            ? `<option value="remove_creator">Retirer l’accès Creator</option>`
            : ""}
          <option value="reactivate">Réactiver le compte + restaurer le contenu</option>
          ${canRestoreCreator(account)
            ? `<option value="restore_creator">Restaurer l’accès Creator</option>`
            : ""}
        </select>
      </label>

      <label class="account-duration-field">
        Durée
        <select class="account-control-duration">
          <option value="1">1 jour</option>
          <option value="3">3 jours</option>
          <option value="7" selected>7 jours</option>
          <option value="14">14 jours</option>
          <option value="30">30 jours</option>
        </select>
      </label>

      <label class="account-control-reason">
        Motif interne
        <input
          class="account-control-reason-input"
          placeholder="Ex. abus, sécurité, erreur corrigée…"
        >
      </label>

      <button class="primary-button apply-account-control" disabled>
        Appliquer la décision
      </button>
    </div>

    ${licenseTraceabilityBlock(account)}

    <details class="moderation-history">
      <summary>Historique récent</summary>
      ${history.length
        ? history.map((entry) => `
  <div class="history-row">
  <strong>${escapeHTML(entry.action || "action")}</strong>
  <span>${escapeHTML(entry.reason || "Sans motif")}</span>
  <time>${formatDate(entry.createdAt)}</time>
  </div>
  `).join("")
        : `<p class="muted small">Aucune décision enregistrée.</p>`}
    </details>
  </article>`;
}

function rootAccountControlCard(group = {}) {
  const accounts = asArray(group.accounts);
  const primary = group.primaryAccount || accounts[0] || {};
  const rootUserId = String(group.rootUserId || primary.userId || primary.rootUserId || "");
  const stateName = rootAccountControlState(group);
  const emails = [...new Set(accounts.map((account) => account.mail).filter(Boolean))];
  const pseudos = [...new Set(accounts.map((account) => account.pseudo || account.artistname).filter(Boolean))];

  return `<details class="root-account-card" data-account-state="${stateName}" data-root-user="${escapeHTML(rootUserId)}">
    <summary class="root-account-summary">
      <span class="root-account-avatar"><i data-lucide="user-round"></i></span>
      <div class="root-account-identity">
        <h3>${escapeHTML(primary.pseudo || primary.artistname || primary.mail || "Profil Sonara")}</h3>
        <small>${escapeHTML(primary.mail || "E-mail non renseigné")}</small>
      </div>
      <div class="root-account-id">
        <span>ID général</span>
        <strong>${escapeHTML(rootUserId || "Non renseigné")}</strong>
      </div>
      <span class="root-account-count">${accounts.length} compte${accounts.length > 1 ? "s" : ""}</span>
      <span class="account-state ${stateName}">${accountStateLabel(stateName)}</span>
      <i class="root-account-chevron" data-lucide="chevron-down"></i>
    </summary>

    <div class="root-account-details">
      <section class="root-profile-overview">
        <div>
          <span>ID général</span>
          <strong>${escapeHTML(rootUserId || "Non renseigné")}</strong>
        </div>
        <div>
          <span>Pseudo(s)</span>
          <strong>${escapeHTML(pseudos.join(", ") || "Non renseigné")}</strong>
        </div>
        <div>
          <span>E-mail(s)</span>
          <strong>${escapeHTML(emails.join(", ") || "Non renseigné")}</strong>
        </div>
        <div>
          <span>Comptes liés</span>
          <strong>${accounts.length}</strong>
        </div>
      </section>

      <section class="root-linked-accounts">
        <div class="root-section-title">
          <div>
            <p class="eyebrow">Comptes liés à cet ID général</p>
            <h4>Comptes Sonara</h4>
          </div>
          <span class="count-chip">${accounts.length}</span>
        </div>
        <div class="root-linked-list">
          ${accounts.map(accountControlCard).join("")}
        </div>
      </section>

      ${accountStripeBlock(accounts)}
    </div>
  </details>`;
}

function bindAccountControlFiltering(groups) {
  const search = document.getElementById("accountControlSearch");
  const filter = document.getElementById("accountControlFilter");
  const list = document.getElementById("accountControlList");

  const draw = () => {
    const query = String(search.value || "").trim().toLowerCase();
    const selectedFilter = filter.value;

    const filtered = groups.filter((group) => {
      const accounts = asArray(group.accounts);
      const haystack = [
        group.rootUserId,
        ...accounts.flatMap((account) => [
          account.pseudo,
          account.artistname,
          account.mail,
          account.accountId,
          account.id,
          account.userId,
          account.rootUserId
        ])
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesQuery = !query || haystack.includes(query);
      const matchesFilter =
        selectedFilter === "all" ||
        accounts.some((account) => accountControlState(account) === selectedFilter);

      return matchesQuery && matchesFilter;
    });

    list.innerHTML = filtered.length
      ? filtered.map(rootAccountControlCard).join("")
      : emptyState("Aucun profil trouvé", "Modifie la recherche ou le filtre.");

    bindAccountControlActions();
    bindLicenseIncidentActions();
    icons();
  };

  search.addEventListener("input", draw);
  filter.addEventListener("change", draw);
  draw();
}

function bindLicenseIncidentActions() {
  document.querySelectorAll(".license-incident-review").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-license-incident]");
      const incidentId = row?.dataset.licenseIncident;
      const status = button.dataset.status;
      if (!incidentId || !status) return;
      const notes = window.prompt("Note interne de revue (facultatif)", "") || "";
      if (!window.confirm(`Confirmer le statut ${status} pour cet incident ?`)) return;
      button.disabled = true;
      try {
        await api(`/license-incidents/${encodeURIComponent(incidentId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status, reviewNotes: notes, staffId: "founder" })
        });
        showToast(`Incident ${status.toLowerCase()}.`);
        await renderModeration(state.moderationMode || "incidents");
        refreshOverview();
      } catch (error) {
        showToast(error.message, "error");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll(".license-sanction-apply").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-license-incident]");
      const form = button.closest(".license-sanction-form");
      const incidentId = row?.dataset.licenseIncident;
      const accountId = form?.dataset.targetAccount;
      const level = form?.querySelector(".license-sanction-level")?.value;
      const reason = form?.querySelector(".license-sanction-reason")?.value?.trim();
      if (!incidentId || !accountId || !level) return;
      if (!reason) {
        showToast("Un motif précis est obligatoire pour la sanction.", "error");
        return;
      }
      if (!window.confirm(`${level} sur le compte ${accountId} ? La décision sera enregistrée dans la preuve de licence.`)) return;
      button.disabled = true;
      try {
        await api(`/license-incidents/${encodeURIComponent(incidentId)}/sanctions`, {
          method: "POST",
          body: JSON.stringify({ accountId, level, reason, durationDays: 7, staffId: "founder" })
        });
        showToast("Sanction de licence appliquée.");
        await renderModeration(state.moderationMode || "incidents");
        refreshOverview();
      } catch (error) {
        showToast(error.message, "error");
        button.disabled = false;
      }
    });
  });


  document.querySelectorAll(".open-license-incident-account").forEach((button) => {
    button.addEventListener("click", async () => {
      const searchValue = button.dataset.accountSearch || "";
      state.moderationMode = "accounts";
      state.moderationSearch = searchValue;
      await renderModeration("accounts", searchValue);
    });
  });
}

function bindAccountControlActions() {
  document.querySelectorAll(".account-control-form").forEach((form) => {
      const action = form.querySelector(".account-control-action");
      const durationField = form.querySelector(".account-duration-field");
      const duration = form.querySelector(".account-control-duration");
      const reason = form.querySelector(".account-control-reason-input");
      const apply = form.querySelector(".apply-account-control");

      const refresh = () => {
        durationField.classList.toggle("is-hidden", action.value !== "suspend");
        apply.disabled = !action.value;
      };

      action.addEventListener("change", refresh);
      refresh();

      apply.addEventListener("click", async () => {
        const targetLabel = form.dataset.controlPseudo || form.dataset.controlMail || form.dataset.controlAccount;
        const selectedLabel = action.options[action.selectedIndex]?.textContent || action.value;
        const confirmed = window.confirm(
        `${selectedLabel} : ${targetLabel}\n\nConfirmer cette décision sur ce compte précis ?`
      );

        if (!confirmed) return;

        if (["ban", "suspend", "remove_creator"].includes(action.value) && !reason.value.trim()) {
          showToast("Un motif précis est obligatoire pour cette sanction.", "error");
          reason.focus();
          return;
        }

        apply.disabled = true;
        apply.textContent = "Application…";

        try {
          await api(
          `/accounts/${encodeURIComponent(form.dataset.controlAccount)}/control`,
          {
            method: "PATCH",
            body: JSON.stringify({
              action: action.value,
              durationDays: Number(duration.value),
              reason: reason.value,
              expectedUserId: form.dataset.controlUser,
              expectedMail: form.dataset.controlMail,
              expectedPseudo: form.dataset.controlPseudo
          })
          }
        );

          const messages = {
            ban: "Compte banni.",
            suspend: "Compte suspendu.",
            remove_creator: "Accès Creator retiré.",
            reactivate: "Compte réactivé et contenu restauré.",
            restore_creator: "Accès Creator restauré sans redirection forcée."
          };

          showToast(messages[action.value] || "Décision appliquée.");
          renderModeration();
          refreshOverview();
        } catch (error) {
          showToast(error.message, "error");
          apply.disabled = false;
          apply.textContent = "Appliquer la décision";
        }
    });
  });
}

function appealDecisionTypeLabel(type) {
  return {
    artist_rejection: "Refus de demande artiste",
    pack_rejection: "Refus de pack",
    suspension: "Suspension",
    ban: "Bannissement",
    creator_access_removed: "Retrait d’accès Creator",
    other: "Autre décision"
  }[String(type || "other")] || "Autre décision";
}

function selectedAppealIds() {
  return [...document.querySelectorAll(".appeal-card.is-selected")]
  .map((card) => card.dataset.appealId)
  .filter(Boolean);
}

function updateAppealSelectionUI() {
  const cards = [...document.querySelectorAll(".appeal-card")];
  const selected = selectedAppealIds();
  const bar = document.getElementById("appealSelectionBar");
  const count = document.getElementById("appealSelectionCount");
  const all = document.getElementById("selectAllAppeals");

  bar?.classList.toggle("is-visible", selected.length > 0);
  if (count) count.textContent = `${selected.length} sélectionnée${selected.length > 1 ? "s" : ""}`;
  if (all) {
    const everything = cards.length > 0 && cards.every((card) => card.classList.contains("is-selected"));
    all.textContent = everything ? "Tout désélectionner" : "Tout sélectionner";
  }
}

function moderationAppealCard(appeal = {}) {
  const id = appeal.appealId || appeal.id || "";
  const defaultAction = {
    artist_rejection: "restore_artist",
    pack_rejection: "restore_pack",
    suspension: "lift_suspension",
    ban: "reactivate",
    creator_access_removed: "restore_creator"
  }[String(appeal.decisionType || "")] || "maintain_decision";
  return `<article class="appeal-card" data-appeal-id="${escapeHTML(id)}" data-decision-type="${escapeHTML(appeal.decisionType || "other")}">
    <button class="appeal-select" type="button" aria-label="Sélectionner cette contestation"><span></span></button>
    <div class="appeal-card-content">
      <div class="appeal-card-head">
        <span class="row-icon"><i data-lucide="message-square-warning"></i></span>
        <div>
          <p class="eyebrow">Contestation ${environmentBadge(appeal.environment)}</p>
          <h3>${escapeHTML(appeal.pseudo || appeal.email || appeal.mail || "Compte Sonara")}</h3>
          <small>${escapeHTML(appeal.email || appeal.mail || "")} · accountId ${escapeHTML(appeal.accountId || "")}</small>
        </div>
        <span class="appeal-status pending">pending</span>
      </div>

      <div class="appeal-facts">
        <div><span>Rôle</span><strong>${escapeHTML(appeal.role || "user")}</strong></div>
        <div><span>Type</span><strong>${escapeHTML(appealDecisionTypeLabel(appeal.decisionType))}</strong></div>
        <div><span>Décision initiale</span><strong>${escapeHTML(appeal.initialDecision || "rejected")}</strong></div>
        <div><span>Ressource</span><strong>${escapeHTML(appeal.resourceId || "Compte")}</strong></div>
        <div><span>Date</span><strong>${formatDate(appeal.submittedAt || appeal.createdAt)}</strong></div>
        <div><span>Statut</span><strong>${escapeHTML(appeal.status || "pending")}</strong></div>
        ${String(appeal.decisionType || "") === "ban"
          ? `<div><span>Contenu masqué</span><strong>${Number(appeal.hiddenContentCount || 0)} pack(s)</strong></div>`
          : ""}
      </div>

      <section class="appeal-text-block">
        <span>Motif initial</span>
        <p>${escapeHTML(appeal.initialReason || "Aucun motif enregistré.")}</p>
      </section>
      <section class="appeal-text-block user-message">
        <span>Message de l’utilisateur</span>
        <p>${escapeHTML(appeal.message || "Aucun message")}</p>
      </section>

      <div class="appeal-decision-form">
        <label>Décision finale
          <select class="appeal-final-decision">
            <option value="accepted">Accepter la contestation</option>
            <option value="rejected">Refuser la contestation</option>
          </select>
        </label>
        <label>Action réellement appliquée
          <select class="appeal-action-select">
            <option value="restore_artist" ${defaultAction === "restore_artist" ? "selected" : ""}>Rétablir la demande artiste</option>
            <option value="restore_pack" ${defaultAction === "restore_pack" ? "selected" : ""}>Restaurer le pack</option>
            <option value="restore_creator">Restaurer l’accès Creator</option>
            <option value="reactivate" ${defaultAction === "reactivate" ? "selected" : ""}>Réactiver le compte et restaurer tout le contenu</option>
            <option value="lift_suspension" ${defaultAction === "lift_suspension" ? "selected" : ""}>Lever la suspension</option>
            <option value="allow_resubmission">Autoriser une nouvelle soumission</option>
            <option value="maintain_decision" ${defaultAction === "maintain_decision" ? "selected" : ""}>Maintenir la décision initiale</option>
            <option value="maintain_refusal">Maintenir le refus</option>
            <option value="maintain_suspension">Maintenir la suspension</option>
            <option value="maintain_ban">Maintenir le bannissement</option>
            <option value="custom">Décision personnalisée</option>
          </select>
        </label>
        <label class="appeal-custom-label">Décision personnalisée
          <textarea class="appeal-custom-decision" placeholder="Décris précisément la décision personnalisée à conserver dans l’historique."></textarea>
        </label>
        <label class="appeal-response-label">Message envoyé à l’utilisateur
          <textarea class="appeal-response" placeholder="Explique la décision. Ce message est obligatoire et sera réellement transmis à l’utilisateur."></textarea>
        </label>
        <div class="appeal-form-actions">
          <button class="secondary-button open-appeal-account" data-account-search="${escapeHTML(appeal.email || appeal.mail || appeal.accountId || "")}"><i data-lucide="user-search"></i>Voir le compte</button>
          <button class="primary-button send-appeal-decision"><i data-lucide="send"></i>Envoyer la décision</button>
        </div>
      </div>
    </div>
  </article>`;
}

function bindModerationAppeals(draw, lists) {
  document.body.classList.remove("appeal-selection-mode");

  document.getElementById("toggleAppealSelection")?.addEventListener("click", () => {
      document.body.classList.toggle("appeal-selection-mode");
      document.querySelectorAll(".appeal-card").forEach((card) => card.classList.remove("is-selected"));
      updateAppealSelectionUI();
  });

  document.getElementById("selectAllAppeals")?.addEventListener("click", () => {
      document.body.classList.add("appeal-selection-mode");
      const cards = [...document.querySelectorAll(".appeal-card")];
      const select = !cards.every((card) => card.classList.contains("is-selected"));
      cards.forEach((card) => card.classList.toggle("is-selected", select));
      updateAppealSelectionUI();
  });

  document.getElementById("deleteSelectedAppeals")?.addEventListener("click", async () => {
      const ids = selectedAppealIds();
      if (!ids.length) return;
      if (!window.confirm(`Supprimer définitivement ${ids.length} contestation${ids.length > 1 ? "s" : ""} ? Cette action sert uniquement en cas de bug ou de doublon.`)) return;

      try {
        await api("/appeals/bulk", {
          method: "DELETE",
          body: JSON.stringify({ ids })
      });
        showToast(`${ids.length} contestation${ids.length > 1 ? "s" : ""} supprimée${ids.length > 1 ? "s" : ""}.`);
        document.body.classList.remove("appeal-selection-mode");
        await renderModeration("appeals");
      } catch (error) {
        showToast(error.message, "error");
      }
  });

  document.querySelectorAll(".appeal-card").forEach((card) => {
      const id = card.dataset.appealId;
      const selectButton = card.querySelector(".appeal-select");
      const action = card.querySelector(".appeal-action-select");
      const custom = card.querySelector(".appeal-custom-decision");
      const response = card.querySelector(".appeal-response");
      const decision = card.querySelector(".appeal-final-decision");

      const syncCustom = () => {
        card.querySelector(".appeal-custom-label")?.classList.toggle("is-visible", action.value === "custom");
      };

      action.addEventListener("change", syncCustom);
      decision.addEventListener("change", () => {
        if (decision.value === "rejected") {
          const type = card.dataset.decisionType;
          action.value = type === "suspension"
          ? "maintain_suspension"
          : type === "ban"
          ? "maintain_ban"
          : ["artist_rejection", "pack_rejection", "creator_access_removed"].includes(type)
          ? "maintain_refusal"
          : "maintain_decision";
        }
        syncCustom();
    });
      syncCustom();

      selectButton?.addEventListener("click", () => {
        document.body.classList.add("appeal-selection-mode");
        card.classList.toggle("is-selected");
        updateAppealSelectionUI();
    });

      card.querySelector(".send-appeal-decision")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const message = response.value.trim();
        const customDecision = custom.value.trim();

        if (!message) {
          showToast("Le message envoyé à l’utilisateur est obligatoire.", "error");
          response.focus();
          return;
        }
        if (action.value === "custom" && !customDecision) {
          showToast("Écris la décision personnalisée avant l’envoi.", "error");
          custom.focus();
          return;
        }

        const isPermanentBanDeletion =
          decision.value === "rejected" &&
          card.dataset.decisionType === "ban";
        const confirmText = decision.value === "accepted"
        ? "Accepter cette contestation, restaurer le compte et son contenu, puis envoyer le message ?"
        : isPermanentBanDeletion
        ? "Refuser cette contestation ? Le compte artiste, tous ses packs, ses fichiers R2 et ses données de modération seront supprimés définitivement."
        : "Refuser cette contestation, maintenir la décision et envoyer le message ?";
        if (!window.confirm(confirmText)) return;

        button.disabled = true;
        button.innerHTML = "Envoi…";

        try {
          await api(`/appeals/${encodeURIComponent(id)}/decision`, {
            method: "PATCH",
            body: JSON.stringify({
              decision: decision.value,
              action: action.value,
              customDecision,
              message,
              staffId: "founder",
              staffRole: "founder"
          })
        });
          showToast(
            isPermanentBanDeletion
              ? "Contestation rejetée : le compte artiste et toutes ses données ont été supprimés définitivement."
              : "Décision appliquée. La contestation a quitté la liste active."
          );
          document.body.classList.remove("appeal-selection-mode");
          await renderModeration("appeals");
          refreshOverview();
        } catch (error) {
          showToast(error.message, "error");
          button.disabled = false;
          button.innerHTML = '<i data-lucide="send"></i>Envoyer la décision';
          icons();
        }
    });

      card.querySelector(".open-appeal-account")?.addEventListener("click", (event) => {
        const searchValue = event.currentTarget.dataset.accountSearch || "";
        document.body.classList.remove("appeal-selection-mode");
        document.querySelectorAll(".mode-tab").forEach((item) => {
          item.classList.toggle("active", item.dataset.mode === "accounts");
      });
        draw("accounts", searchValue);
    });
  });

  updateAppealSelectionUI();
}

async function renderStaff() {
  content.innerHTML = `<section class="loading-card">Chargement du staff…</section>`;
  try { const data = asObject(await api("/staff")); const staff = asArray(data.staff || data.items); content.innerHTML = `<section class="two-columns"><article class="panel"><p class="eyebrow">Équipe privée</p><h3>Accès staff</h3><div class="main-list">${staff.length ? staff.map(s => `<div class="staff-row"><span class="founder-avatar">${escapeHTML((s.name || "S").slice(0,2).toUpperCase())}</span><div><strong>${escapeHTML(s.name)}</strong><small>${escapeHTML(s.role)} · ${s.status}</small></div></div>`).join("") : emptyState("Aucun membre", "Tu es le seul dans Founder.")}</div></article><article class="panel"><p class="eyebrow">Recrutement</p><h3>Ajouter un membre</h3><form id="staffForm" class="stack-form"><input id="staffName" placeholder="Nom du membre"><input id="staffEmail" type="email" placeholder="Adresse e-mail"><select id="staffRole"><option value="moderator">Modérateur</option><option value="support">Support</option><option value="admin">Administrateur</option></select><button class="primary-button" type="submit">Créer l’invitation</button><p class="muted small">La V1 enregistre l’accès en attente. L’envoi d’e-mail reste désactivé.</p></form></article></section>`; document.getElementById("staffForm").addEventListener("submit", async e => { e.preventDefault(); await api("/staff", { method: "POST", body: JSON.stringify({ name: document.getElementById("staffName").value, email: document.getElementById("staffEmail").value, role: document.getElementById("staffRole").value }) }); showToast("Membre ajouté en attente."); renderStaff(); }); icons(); }
  catch (error) { content.innerHTML = errorState(error.message); }
}



const ADMINISTRATION_MODULE_CONFIG = {
  finances: {
    icon: "chart-no-axes-combined",
    title: "Finances & statistiques",
    description:
      "Revenus, dépenses, investissements, plus-values et résultat net.",
    amountLabel:
      "Résultat net",
    actionLabel:
      "mouvements financiers"
  },

  urssaf: {
    icon: "landmark",
    title: "Obligations",
    description:
      "Simulation en LOCAL/TEST, calcul réel en MAIN après vérification de l’entreprise.",
    amountLabel:
      "À protéger",
    actionLabel:
      "éléments à surveiller"
  },

  invoices: {
    icon: "receipt-text",
    title: "Facturation",
    description:
      "Factures clients et fournisseurs, montants en attente et échéances.",
    amountLabel:
      "En attente",
    actionLabel:
      "factures ouvertes"
  },

  investments: {
    icon: "chart-no-axes-combined",
    title: "Investissements",
    description:
      "Budgets, achats structurants et investissements prévus ou engagés.",
    amountLabel:
      "Budget engagé",
    actionLabel:
      "investissements actifs"
  },

  negotiations: {
    icon: "handshake",
    title: "Négociations",
    description:
      "Contrats, partenaires, propositions et valeur des discussions en cours.",
    amountLabel:
      "Valeur du pipeline",
    actionLabel:
      "négociations ouvertes"
  },

  expenses: {
    icon: "credit-card",
    title: "Charges & abonnements",
    description:
      "Argent prélevé, outils, abonnements et charges récurrentes.",
    amountLabel:
      "Coût mensuel",
    actionLabel:
      "charges actives"
  }
};

const ADMINISTRATION_MODULE_FIELDS = {
  invoices: {
    eyebrow: "Facturation",
    title:
      "Suivre chaque facture et chaque paiement.",
    formTitle:
      "Ajouter une facture",
    amountLabel:
      "Montant de la facture",
    counterpartyLabel:
      "Client ou fournisseur",
    directionOptions: [
      ["incoming", "Facture client — argent à recevoir"],
      ["outgoing", "Facture fournisseur — argent à payer"]
    ],
    statuses: [
      ["draft", "Brouillon"],
      ["sent", "Envoyée"],
      ["pending", "En attente"],
      ["paid", "Payée"],
      ["cancelled", "Annulée"]
    ]
  },

  investments: {
    eyebrow: "Investissements",
    title:
      "Mesurer ce qui est investi, récupéré, gagné ou perdu.",
    formTitle:
      "Ajouter un investissement",
    amountLabel:
      "Montant investi",
    counterpartyLabel:
      "Fournisseur ou projet",
    directionOptions: [
      ["outgoing", "Argent investi"],
      ["neutral", "Investissement seulement prévu"]
    ],
    statuses: [
      ["planned", "Prévu"],
      ["approved", "Validé"],
      ["committed", "Engagé"],
      ["completed", "Réalisé"],
      ["cancelled", "Annulé"]
    ]
  },

  negotiations: {
    eyebrow: "Négociations",
    title:
      "Centraliser les accords avant qu’ils se perdent.",
    formTitle:
      "Ajouter une négociation",
    amountLabel:
      "Valeur estimée",
    counterpartyLabel:
      "Entreprise ou personne",
    directionOptions: [
      ["incoming", "Revenu potentiel"],
      ["outgoing", "Coût potentiel"],
      ["neutral", "Sans montant direct"]
    ],
    statuses: [
      ["prospecting", "Prospection"],
      ["discussion", "Discussion"],
      ["proposal", "Proposition"],
      ["agreement", "Accord"],
      ["paused", "En pause"],
      ["lost", "Perdue"]
    ]
  },

  expenses: {
    eyebrow: "Abonnements",
    title:
      "Chaque abonnement devient une carte avec son vrai rythme de prélèvement.",
    formTitle:
      "Ajouter un abonnement",
    amountLabel:
      "Montant",
    counterpartyLabel:
      "Service ou fournisseur",
    directionOptions: [
      ["outgoing", "À payer"]
    ],
    statuses: [
      ["planned", "Prévue"],
      ["active", "Active"],
      ["paid", "Payée"],
      ["cancelled", "Arrêtée"]
    ]
  }
};

function administrationModuleCard(
  module,
  summary = {}
) {
  const config =
    ADMINISTRATION_MODULE_CONFIG[module];

  return `
    <button
      class="administration-dashboard-card"
      type="button"
      data-administration-module="${module}"
    >
      <div class="administration-dashboard-card-head">
        <span class="administration-dashboard-icon">
          <i data-lucide="${config.icon}"></i>
        </span>

        <span class="administration-dashboard-arrow">
          <i data-lucide="arrow-up-right"></i>
        </span>
      </div>

      <div>
        <p class="eyebrow">${escapeHTML(config.title)}</p>
        <h3>${escapeHTML(config.description)}</h3>
      </div>

      <div class="administration-dashboard-card-metrics">
        <div>
          <span>${escapeHTML(config.amountLabel)}</span>
          <strong>
            ${formatAdministrationMoney(
              summary.amount || 0
            )}
          </strong>
        </div>

        <div>
          <span>À traiter</span>
          <strong>${asNumber(summary.count)}</strong>
          <small>
            ${escapeHTML(config.actionLabel)}
          </small>
        </div>
      </div>

      ${
        asNumber(summary.overdue) > 0
          ? `
            <span class="administration-dashboard-alert">
              ${asNumber(summary.overdue)}
              en retard
            </span>
          `
          : `
            <span class="administration-dashboard-ok">
              À jour
            </span>
          `
      }
    </button>
  `;
}

function administrationRecordStatusLabel(
  status
) {
  return {
    draft: "Brouillon",
    sent: "Envoyée",
    pending: "En attente",
    paid: "Payée",
    overdue: "En retard",
    cancelled: "Annulée",
    planned: "Prévu",
    approved: "Validé",
    committed: "Engagé",
    completed: "Réalisé",
    prospecting: "Prospection",
    discussion: "Discussion",
    proposal: "Proposition",
    agreement: "Accord",
    lost: "Perdue",
    paused: "En pause",
    active: "Active",
    resolved: "Résolu"
  }[status] || status || "Inconnu";
}

function administrationFrequencyLabel(
  frequency
) {
  return {
    one_time: "Ponctuel",
    weekly: "Hebdomadaire",
    monthly: "Mensuel",
    quarterly: "Trimestriel",
    annual: "Annuel"
  }[frequency] || "Ponctuel";
}

function administrationRecordRow(
  record,
  module
) {
  const fields =
    ADMINISTRATION_MODULE_FIELDS[module];

  const status =
    record.effectiveStatus ||
    record.status;

  return `
    <form
      class="administration-record-row ${status === "overdue" ? "is-overdue" : ""}"
      data-administration-record-id="${escapeHTML(record.id)}"
    >
      <div class="administration-record-main">
        <div class="administration-record-tags">
          <span class="administration-status status-${escapeHTML(status)}">
            ${escapeHTML(administrationRecordStatusLabel(status))}
          </span>

          <span class="administration-record-frequency">
            ${escapeHTML(administrationFrequencyLabel(record.frequency))}
          </span>
        </div>

        <strong>${escapeHTML(record.title)}</strong>

        <small>
          ${escapeHTML(record.counterparty || "Aucun interlocuteur")}
          ${record.reference ? ` · ${escapeHTML(record.reference)}` : ""}
        </small>

        ${
          record.notes
            ? `<p>${escapeHTML(record.notes)}</p>`
            : ""
        }
      </div>

      <div class="administration-record-amount">
        <strong>
          ${formatAdministrationMoney(record.amount)}
        </strong>

        <small>
          ${
            record.dueDate
              ? `Échéance ${formatAdministrationDate(record.dueDate)}`
              : "Aucune échéance"
          }
        </small>
      </div>

      <select
        name="status"
        aria-label="État"
      >
        ${
          fields.statuses
            .map(
              ([value, label]) => `
                <option
                  value="${value}"
                  ${selectedAttribute(record.status, value)}
                >
                  ${label}
                </option>
              `
            )
            .join("")
        }
      </select>

      <button
        class="secondary-button"
        type="submit"
      >
        Mettre à jour
      </button>

      <button
        class="administration-delete-record"
        type="button"
        aria-label="Supprimer"
        title="Supprimer"
      >
        <i data-lucide="trash-2"></i>
      </button>
    </form>
  `;
}


function administrationTrendMarkup(input = {}) {
  const trend = asObject(input);
  const metrics = asObject(trend.metrics);
  const metricOrder = ["users", "artists", "returns", "artistReturns", "revenue"];
  const availableMetrics = metricOrder
    .map((key) => [key, asObject(metrics[key])])
    .filter(([, metric]) => metric.label);

  const formatMetricValue = (metric, value) =>
    metric.format === "money"
      ? formatFinanceCents(value || 0)
      : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(asNumber(value));

  const directionIcon = {
    up: "trending-up",
    down: "trending-down",
    stable: "minus"
  };
  const directionLabel = {
    up: "En hausse",
    down: "En ralentissement",
    stable: "Stable"
  };
  const formatDay = (value) => {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? ""
      : new Intl.DateTimeFormat("fr-FR", {
          day: "2-digit",
          month: "short"
        }).format(date);
  };

  const metricView = (key, metric, isActive) => {
    const points = asArray(metric.points);
    const direction = ["up", "down", "stable"].includes(metric.direction)
      ? metric.direction
      : "stable";
    const current = asNumber(metric.current);
    const previous = asNumber(metric.previous);
    const changePercent = Number(metric.changePercent);
    const hasPercent = Number.isFinite(changePercent);
    const badgeText = hasPercent
      ? `${changePercent > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", {
          maximumFractionDigits: 1
        }).format(changePercent)} %`
      : current > 0 && previous === 0
        ? "Nouveau départ"
        : directionLabel[direction];

    const width = 330;
    const height = 112;
    const paddingX = 7;
    const paddingY = 10;
    const values = points.length ? points.map((point) => Math.max(0, asNumber(point.value))) : [0];
    const maximum = Math.max(1, ...values);
    const xFor = (index) => points.length <= 1
      ? width / 2
      : paddingX + (index / (points.length - 1)) * (width - paddingX * 2);
    const yFor = (value) => paddingY + ((maximum - Math.max(0, value)) / maximum) * (height - paddingY * 2);
    const linePath = points.length
      ? points.map((point, index) => {
          const command = index === 0 ? "M" : "L";
          return `${command}${xFor(index).toFixed(2)},${yFor(asNumber(point.value)).toFixed(2)}`;
        }).join(" ")
      : `M${paddingX},${height - paddingY} L${width - paddingX},${height - paddingY}`;
    const baselineY = (height - paddingY).toFixed(2);
    const firstX = points.length ? xFor(0).toFixed(2) : paddingX;
    const lastX = points.length ? xFor(points.length - 1).toFixed(2) : width - paddingX;
    const areaPath = `${linePath} L${lastX},${baselineY} L${firstX},${baselineY} Z`;
    const firstDate = points[0]?.date || "";
    const lastDate = points.at(-1)?.date || "";

    return `
      <div
        class="administration-trend-metric-view trend-${direction}${isActive ? " is-active" : ""}"
        data-sonara-trend-view="${escapeHTML(key)}"
        ${isActive ? "" : "hidden"}
      >
        <div class="administration-trend-value">
          <div>
            <span>${escapeHTML(metric.label)}</span>
            <strong>${escapeHTML(formatMetricValue(metric, current))}</strong>
            <small>
              contre ${escapeHTML(formatMetricValue(metric, previous))}
              les 7 jours précédents
            </small>
          </div>

          <span class="administration-trend-badge">
            <i data-lucide="${directionIcon[direction]}"></i>
            ${escapeHTML(badgeText)}
          </span>
        </div>

        <div class="administration-trend-chart" aria-label="${escapeHTML(metric.label)} sur les sept derniers jours">
          <svg viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="none">
            <defs>
              <linearGradient id="administrationTrendFill-${escapeHTML(key)}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="currentColor" stop-opacity="0.3"></stop>
                <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
              </linearGradient>
            </defs>
            <line class="administration-trend-zero" x1="${paddingX}" y1="${baselineY}" x2="${width - paddingX}" y2="${baselineY}"></line>
            <path class="administration-trend-area" style="fill:url(#administrationTrendFill-${escapeHTML(key)})" d="${areaPath}"></path>
            <path class="administration-trend-line" d="${linePath}"></path>
            ${points.map((point, index) => `
              <circle
                class="administration-trend-point"
                cx="${xFor(index).toFixed(2)}"
                cy="${yFor(asNumber(point.value)).toFixed(2)}"
                r="2.7"
              >
                <title>${escapeHTML(formatDay(point.date))} · ${escapeHTML(formatMetricValue(metric, point.value))}</title>
              </circle>
            `).join("")}
          </svg>

          <div class="administration-trend-axis">
            <span>${escapeHTML(formatDay(firstDate))}</span>
            <span>${escapeHTML(formatDay(lastDate))}</span>
          </div>
        </div>
      </div>
    `;
  };

  return `
    <div class="administration-dashboard-overview administration-trend-card">
      <div class="administration-trend-heading">
        <div>
          <span>Sonara Pack</span>
          <small>Croissance réelle du produit · aucune dépense ni URSSAF</small>
        </div>
      </div>

      <div class="administration-trend-tabs" role="tablist" aria-label="Statistique Sonara Pack">
        ${availableMetrics.map(([key, metric], index) => `
          <button
            type="button"
            class="administration-trend-tab${index === 0 ? " is-active" : ""}"
            data-sonara-trend-metric="${escapeHTML(key)}"
            role="tab"
            aria-selected="${index === 0 ? "true" : "false"}"
          >
            ${escapeHTML(metric.label)}
          </button>
        `).join("")}
      </div>

      ${availableMetrics.length
        ? availableMetrics.map(([key, metric], index) => metricView(key, metric, index === 0)).join("")
        : `<p class="muted">Les premières données de croissance apparaîtront dès qu’un utilisateur revient ou qu’une nouvelle activité Sonara est enregistrée.</p>`}

      <p class="administration-trend-rule">
        Compté ici : nouveaux utilisateurs, nouveaux artistes, utilisateurs et artistes revenus, commissions gagnées.
        Ignoré : dépenses, frais, remboursements, URSSAF et pertes.
      </p>
    </div>
  `;
}

function bindAdministrationTrendMetricTabs() {
  const tabs = document.querySelectorAll("[data-sonara-trend-metric]");
  const views = document.querySelectorAll("[data-sonara-trend-view]");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selected = tab.dataset.sonaraTrendMetric;

      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });

      views.forEach((view) => {
        const active = view.dataset.sonaraTrendView === selected;
        view.hidden = !active;
        view.classList.toggle("is-active", active);
      });

      icons();
    });
  });
}

async function renderAdministration() {
  content.innerHTML = `
    <section class="loading-card">
      Chargement du dashboard Administration…
    </section>
  `;

  try {
    const response =
      asObject(
        await api(
          "/administration"
        )
      );

    const administration =
      asObject(
        response.administration
      );

    const summary =
      asObject(
        administration.summary
      );

    const modules =
      asObject(
        summary.modules
      );

    updateAdministrationBadge(
      summary
    );

    content.innerHTML = `
      <section class="hero-panel administration-dashboard-hero">
        <div>
          <p class="eyebrow">Centre administratif</p>

          <h2>
            Tout ce qui engage, rapporte ou prélève de l’argent.
          </h2>

          <p>
            Obligations, factures, investissements, négociations,
            charges et abonnements sont regroupés ici.
            Chaque bloc possède son propre suivi et ses propres calculs.
          </p>
        </div>

        <div class="administration-dashboard-overview">
          <span>Sorties à prévoir</span>

          <strong>
            ${formatAdministrationMoney(
              summary.totalOutflowToPlan || 0
            )}
          </strong>

          <small>
            ${asNumber(summary.totalActionRequired)}
            éléments à traiter ·
            ${asNumber(summary.totalOverdue)}
            en retard
          </small>
        </div>
      </section>

      <section class="administration-dashboard-grid">
        ${administrationModuleCard(
          "finances",
          asObject(modules.finances)
        )}

        ${administrationModuleCard(
          "urssaf",
          asObject(modules.urssaf)
        )}

        ${administrationModuleCard(
          "invoices",
          asObject(modules.invoices)
        )}

        ${administrationModuleCard(
          "investments",
          asObject(modules.investments)
        )}

        ${administrationModuleCard(
          "negotiations",
          asObject(modules.negotiations)
        )}

        ${administrationModuleCard(
          "expenses",
          asObject(modules.expenses)
        )}
      </section>

      <section class="administration-dashboard-footer panel">
        <div>
          <p class="eyebrow">Architecture</p>
          <h3>Administration reste extensible.</h3>
          <p class="muted">
            D’autres catégories pourront être ajoutées sans modifier
            Urssaf ni les modules déjà remplis.
          </p>
        </div>

        <div class="administration-dashboard-footer-stats">
          <span>
            <strong>${asNumber(summary.totalActionRequired)}</strong>
            actions
          </span>

          <span>
            <strong>${asNumber(summary.totalOverdue)}</strong>
            retards
          </span>
        </div>
      </section>
    `;

    document
      .querySelectorAll(
        "[data-administration-module]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () => {
              const module =
                button.dataset
                  .administrationModule;

              if (module === "urssaf") {
                renderAdministrationUrssaf();
                return;
              }

              if (module === "finances") {
                renderAdministrationFinances();
                return;
              }

              if (module === "expenses") {
                renderAdministrationSubscriptions();
                return;
              }

              renderAdministrationModule(
                module
              );
            }
          );
        }
      );

    icons();
  } catch (error) {
    content.innerHTML =
      errorState(
        error.message
      );
  }
}


function financeToneClass(value) {
  const number = asNumber(value);

  if (number > 0) {
    return "is-positive";
  }

  if (number < 0) {
    return "is-negative";
  }

  return "";
}

function financeRateCard(label, value) {
  return `
    <article class="finance-rate-card ${financeToneClass(value)}">
      <span>${escapeHTML(label)}</span>
      <strong>${formatAdministrationMoney(value || 0)}</strong>
    </article>
  `;
}

function formatFinanceCents(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits
  }).format(asNumber(value) / 100);
}

function financeEnvironmentLabel(value) {
  return {
    local: "Local",
    test: "Serveur Test",
    test_legacy: "Test Legacy",
    main: "Main"
  }[String(value || "").toLowerCase()] || value || "Tous";
}

function financeCategoryLabel(value) {
  return {
    SONARA_COMMISSION: "Commission Sonara",
    SONARA_REFUND: "Remboursement",
    STRIPE_FEE: "Frais Stripe",
    STRIPE_FEE_REFUND: "Frais Stripe restitués",
    EXPENSE: "Dépense",
    CHARGE: "Charge",
    MANUAL_INCOME: "Revenu manuel",
    REFUND_RECEIVED: "Remboursement reçu",
    INVESTMENT_GAIN: "Gain d’investissement",
    INVESTMENT_LOSS: "Perte d’investissement",
    INVESTMENT_CAPITAL_OUT: "Capital investi",
    INVESTMENT_CAPITAL_RETURN: "Capital récupéré",
    OTHER_IN: "Autre entrée",
    OTHER_OUT: "Autre sortie",
    REVERSAL: "Contre-écriture"
  }[String(value || "").toUpperCase()] || value || "Autre";
}

function financeInputDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function financeMovementTitle(movement) {
  const pack = String(movement.packTitleSnapshot || "").trim();
  const track = String(movement.trackTitleSnapshot || "").trim();
  if (track && pack) return `${track} · ${pack}`;
  if (pack) return pack;
  return movement.description || financeCategoryLabel(movement.category);
}

function financeChartDateParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
}

function financeChartDayKey(date) {
  const parts = financeChartDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function financeChartMonthKey(date) {
  const parts = financeChartDateParts(date);
  return `${parts.year}-${parts.month}`;
}

function financeChartRangeConfig(value) {
  return {
    "7d": { label: "7 jours", unit: "day", count: 7 },
    "30d": { label: "30 jours", unit: "day", count: 30 },
    "12m": { label: "12 mois", unit: "month", count: 12 }
  }[value] || { label: "30 jours", unit: "day", count: 30 };
}

function financeChartBuckets(range = "30d") {
  const config = financeChartRangeConfig(range);
  const now = new Date();
  const buckets = [];

  for (let offset = config.count - 1; offset >= 0; offset -= 1) {
    if (config.unit === "month") {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 15, 12));
      const key = financeChartMonthKey(date);
      const [year, month] = key.split("-").map(Number);
      buckets.push({
        key,
        label: new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "Europe/Paris" })
          .format(new Date(Date.UTC(year, month - 1, 15, 12)))
          .replace(".", ""),
        inCents: 0,
        outCents: 0,
        netCents: 0,
        cumulativeNetCents: 0
      });
      continue;
    }

    const date = new Date(now.getTime() - offset * 86400000);
    const key = financeChartDayKey(date);
    const [year, month, day] = key.split("-").map(Number);
    buckets.push({
      key,
      label: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })
        .format(new Date(Date.UTC(year, month - 1, day, 12))),
      inCents: 0,
      outCents: 0,
      netCents: 0,
      cumulativeNetCents: 0
    });
  }

  return { config, buckets };
}

function financeEvolutionChartMarkup(movements, range = "30d") {
  const { config, buckets } = financeChartBuckets(range);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  asArray(movements).forEach((movement) => {
    if (String(movement.status || "").toLowerCase() !== "confirmed") return;
    const date = new Date(movement.occurredAt || movement.createdAt || 0);
    if (Number.isNaN(date.getTime())) return;
    const key = config.unit === "month" ? financeChartMonthKey(date) : financeChartDayKey(date);
    const bucket = byKey.get(key);
    if (!bucket) return;

    const amountCents = Math.max(0, Math.round(asNumber(movement.amountCents)));
    if (String(movement.direction || "IN").toUpperCase() === "OUT") {
      bucket.outCents += amountCents;
      bucket.netCents -= amountCents;
    } else {
      bucket.inCents += amountCents;
      bucket.netCents += amountCents;
    }
  });

  let cumulativeNetCents = 0;
  buckets.forEach((bucket) => {
    cumulativeNetCents += bucket.netCents;
    bucket.cumulativeNetCents = cumulativeNetCents;
  });

  const totalInCents = buckets.reduce((total, bucket) => total + bucket.inCents, 0);
  const totalOutCents = buckets.reduce((total, bucket) => total + bucket.outCents, 0);
  const totalNetCents = totalInCents - totalOutCents;
  const movementCount = asArray(movements).filter((movement) => {
    if (String(movement.status || "").toLowerCase() !== "confirmed") return false;
    const date = new Date(movement.occurredAt || movement.createdAt || 0);
    if (Number.isNaN(date.getTime())) return false;
    const key = config.unit === "month" ? financeChartMonthKey(date) : financeChartDayKey(date);
    return byKey.has(key);
  }).length;

  if (!movementCount) {
    return `
      <div class="finance-chart-summary">
        <article><span>Entrées · ${escapeHTML(config.label)}</span><strong>${formatFinanceCents(0)}</strong></article>
        <article><span>Sorties · ${escapeHTML(config.label)}</span><strong>${formatFinanceCents(0)}</strong></article>
        <article><span>Résultat net · ${escapeHTML(config.label)}</span><strong>${formatFinanceCents(0)}</strong></article>
      </div>
      <div class="finance-chart-empty">
        <i data-lucide="line-chart"></i>
        <strong>Aucun mouvement confirmé sur cette période</strong>
        <span>La courbe apparaîtra automatiquement dès qu’une entrée ou une sortie sera enregistrée.</span>
      </div>
    `;
  }

  const width = 920;
  const height = 320;
  const left = 78;
  const right = 24;
  const top = 24;
  const bottom = 54;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = [0, ...buckets.map((bucket) => bucket.cumulativeNetCents)];
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  if (minValue === maxValue) {
    minValue -= 100;
    maxValue += 100;
  }
  const padding = Math.max(100, Math.round((maxValue - minValue) * 0.1));
  minValue -= padding;
  maxValue += padding;
  const rangeValue = maxValue - minValue || 1;
  const xAt = (index) => left + (buckets.length === 1 ? plotWidth / 2 : (index * plotWidth) / (buckets.length - 1));
  const yAt = (value) => top + ((maxValue - value) / rangeValue) * plotHeight;
  const points = buckets.map((bucket, index) => ({
    ...bucket,
    x: xAt(index),
    y: yAt(bucket.cumulativeNetCents)
  }));
  const linePath = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const zeroY = Math.min(top + plotHeight, Math.max(top, yAt(0)));
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${zeroY.toFixed(2)} L${points[0].x.toFixed(2)},${zeroY.toFixed(2)} Z`;
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = top + ratio * plotHeight;
    const value = maxValue - ratio * rangeValue;
    return `
      <line class="finance-chart-grid-line" x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}"></line>
      <text class="finance-chart-y-label" x="${left - 12}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeHTML(formatFinanceCents(value, 0))}</text>
    `;
  }).join("");
  const labelEvery = config.unit === "month" ? 1 : range === "7d" ? 1 : 5;
  const xLabels = points.map((point, index) => {
    if (index % labelEvery !== 0 && index !== points.length - 1) return "";
    return `<text class="finance-chart-x-label" x="${point.x.toFixed(2)}" y="${height - 18}" text-anchor="middle">${escapeHTML(point.label)}</text>`;
  }).join("");
  const pointMarkup = points.map((point, index) => {
    const showPoint = range === "7d" || config.unit === "month" || index % 5 === 0 || index === points.length - 1;
    if (!showPoint) return "";
    return `
      <circle class="finance-chart-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5">
        <title>${escapeHTML(point.label)} · net cumulé ${escapeHTML(formatFinanceCents(point.cumulativeNetCents))} · entrées ${escapeHTML(formatFinanceCents(point.inCents))} · sorties ${escapeHTML(formatFinanceCents(point.outCents))}</title>
      </circle>
    `;
  }).join("");

  return `
    <div class="finance-chart-summary">
      <article class="is-positive"><span>Entrées · ${escapeHTML(config.label)}</span><strong>+${formatFinanceCents(totalInCents)}</strong></article>
      <article class="is-negative"><span>Sorties · ${escapeHTML(config.label)}</span><strong>−${formatFinanceCents(totalOutCents)}</strong></article>
      <article class="${financeToneClass(totalNetCents / 100)}"><span>Résultat net · ${escapeHTML(config.label)}</span><strong>${formatFinanceCents(totalNetCents)}</strong></article>
    </div>
    <div class="finance-chart-shell ${financeToneClass(totalNetCents / 100)}">
      <svg class="finance-evolution-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution cumulée du résultat net sur ${escapeHTML(config.label)}">
        <defs>
          <linearGradient id="financeEvolutionAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-opacity="0.3"></stop>
            <stop offset="100%" stop-opacity="0.01"></stop>
          </linearGradient>
        </defs>
        ${gridLines}
        <line class="finance-chart-zero-line" x1="${left}" y1="${zeroY.toFixed(2)}" x2="${width - right}" y2="${zeroY.toFixed(2)}"></line>
        <path class="finance-chart-area" d="${areaPath}"></path>
        <path class="finance-chart-line" d="${linePath}"></path>
        ${pointMarkup}
        ${xLabels}
      </svg>
    </div>
    <p class="muted small finance-chart-note">Courbe cumulative calculée uniquement avec les mouvements confirmés. Les écritures en attente, échouées ou annulées sont ignorées.</p>
  `;
}

async function renderAdministrationFinances() {
  content.innerHTML = `<section class="loading-card">Construction du registre financier…</section>`;
  state.financeFilters = asObject(state.financeFilters);

  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(state.financeFilters)) {
      if (!value) continue;
      if (key === "start") {
        query.set(key, new Date(`${value}T00:00:00`).toISOString());
      } else if (key === "end") {
        query.set(key, new Date(`${value}T23:59:59.999`).toISOString());
      } else {
        query.set(key, value);
      }
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const chartQuery = new URLSearchParams();
    for (const key of ["environment", "source", "category"]) {
      const value = state.financeFilters[key];
      if (value) chartQuery.set(key, value);
    }
    chartQuery.set("status", "confirmed");
    chartQuery.set("limit", "10000");
    const [summaryResponse, movementsResponse, chartMovementsResponse] = await Promise.all([
      api(`/finance/summary${suffix}`),
      api(`/finance/movements${suffix}${suffix ? "&" : "?"}limit=500`),
      api(`/finance/movements?${chartQuery.toString()}`)
    ]);
    const summary = asObject(summaryResponse.summary);
    const connection = asObject(summaryResponse.connection);
    const movements = asArray(movementsResponse.items);
    const chartMovements = asArray(chartMovementsResponse.items);
    state.financeChartRange = ["7d", "30d", "12m"].includes(state.financeChartRange) ? state.financeChartRange : "30d";
    const rates = asObject(summary.rates);
    const availableEnvironments = asArray(summary.availableEnvironments);
    const byEnvironment = asObject(summary.byEnvironment);
    const selectedEnvironment = state.financeFilters.environment || "";
    const connectionStatus = String(connection.status || "not_synced");
    const connectionLabel = connection.enabled === false
      ? connectionStatus === "locked_administration"
        ? "MAIN verrouillé par l’administration — aucun argent réel compté"
        : "Main désactivé — aucun argent réel compté"
      : connectionStatus === "connected"
        ? "Connexion automatique active"
        : connectionStatus === "partial"
          ? "Connexion partielle — historique conservé, reprise automatique"
          : connectionStatus === "unavailable"
            ? "Bridge temporairement indisponible — registre local conservé"
            : "Connexion automatique en préparation";

    const environmentOptions = [
      `<option value="">Tous les environnements autorisés</option>`,
      ...availableEnvironments.map((env) => `
        <option value="${escapeHTML(env)}" ${selectedAttribute(selectedEnvironment, env)}>
          ${escapeHTML(financeEnvironmentLabel(env))}
        </option>
      `)
    ].join("");

    const runtimeEnvironment = String(summary.runtimeEnvironment || state.environment || "local").toLowerCase();
    const environmentBreakdown = runtimeEnvironment === "test"
      ? `
        <section class="finance-environment-breakdown">
          <article>
            <span>TEST</span>
            <strong>${formatFinanceCents(asObject(byEnvironment.test).netCents || 0)}</strong>
            <small>Serveur Test uniquement</small>
          </article>
          ${availableEnvironments.includes("test_legacy") ? `
            <article>
              <span>Historique Test</span>
              <strong>${formatFinanceCents(asObject(byEnvironment.test_legacy).netCents || 0)}</strong>
              <small>Anciennes écritures TEST sans mélange avec LOCAL</small>
            </article>
          ` : ""}
        </section>
      `
      : `
        <section class="finance-environment-breakdown">
          <article>
            <span>${escapeHTML(financeEnvironmentLabel(runtimeEnvironment).toUpperCase())}</span>
            <strong>${formatFinanceCents(asObject(byEnvironment[runtimeEnvironment]).netCents || 0)}</strong>
            <small>${runtimeEnvironment === "main"
              ? (connection.enabled === false ? "Données MAIN réelles non alimentées" : "Mouvements MAIN uniquement")
              : "Mouvements LOCAL uniquement"}</small>
          </article>
        </section>
      `;

    const movementRows = movements.length
      ? movements.map((movement) => {
          const direction = String(movement.direction || "IN").toUpperCase();
          const confirmed = String(movement.status || "").toLowerCase() === "confirmed";
          const deletedPack = movement.metadata?.packDeleted === true;
          const editableHere = movement.source === "FOUNDER_MANUAL" && movement.environment === summary.runtimeEnvironment;
          const canReverse = editableHere && confirmed && movement.category !== "REVERSAL";
          const canResolvePending = editableHere && !confirmed && String(movement.status || "").toLowerCase() === "pending";
          return `
            <article class="finance-ledger-row ${direction === "IN" ? "is-positive" : "is-negative"} ${confirmed ? "" : "is-pending"}">
              <div class="finance-ledger-sign">
                <i data-lucide="${direction === "IN" ? "arrow-down-left" : "arrow-up-right"}"></i>
              </div>
              <div class="finance-ledger-copy">
                <strong>${escapeHTML(financeMovementTitle(movement))}${deletedPack ? " — pack supprimé" : ""}</strong>
                <span>
                  ${escapeHTML(financeCategoryLabel(movement.category))}
                  · ${escapeHTML(financeEnvironmentLabel(movement.environment))}
                  · ${escapeHTML(String(movement.status || "pending"))}
                </span>
                <small>
                  ${escapeHTML(formatDate(movement.occurredAt || movement.createdAt))}
                  ${movement.artistNameSnapshot ? ` · ${escapeHTML(movement.artistNameSnapshot)}` : ""}
                  ${movement.stripePaymentIntentId ? ` · ${escapeHTML(movement.stripePaymentIntentId)}` : ""}
                </small>
              </div>
              <strong class="finance-ledger-amount">
                ${direction === "IN" ? "+" : "−"}${formatFinanceCents(movement.amountCents || 0)}
              </strong>
              <div class="finance-ledger-actions">
                ${canResolvePending ? `
                  <button type="button" data-finance-status="confirmed" data-finance-id="${escapeHTML(movement.id)}" title="Confirmer">
                    <i data-lucide="check"></i>
                  </button>
                  <button type="button" data-finance-status="cancelled" data-finance-id="${escapeHTML(movement.id)}" title="Annuler">
                    <i data-lucide="x"></i>
                  </button>
                ` : ""}
                ${canReverse ? `
                  <button type="button" class="finance-ledger-reverse" data-reverse-finance="${escapeHTML(movement.id)}" title="Créer une contre-écriture">
                    <i data-lucide="rotate-ccw"></i>
                  </button>
                ` : ""}
              </div>
            </article>
          `;
        }).join("")
      : emptyState("Aucun mouvement", "Le registre se remplira automatiquement dès qu’une entrée ou une sortie existe.");

    content.innerHTML = `
      <button class="administration-back-button" type="button" data-administration-back>
        <i data-lucide="arrow-left"></i>
        Administration
      </button>

      <section class="hero-panel finance-hero finance-hero-ledger">
        <div>
          <p class="eyebrow">Finances & statistiques</p>
          <h2>Argent</h2>
          <p>
            Chaque commission, remboursement, frais, dépense, charge, gain ou perte
            existe comme un mouvement indépendant. Aucun total n’est modifié à la main.
          </p>
        </div>
        <div class="finance-main-result ${financeToneClass((summary.netCents || 0) / 100)}">
          <span>Résultat net global</span>
          <strong>${formatFinanceCents(summary.netCents || 0)}</strong>
          <small>${summary.confirmedMovementCount || 0} mouvements confirmés · fuseau ${escapeHTML(summary.timeZone || "Europe/Paris")}</small>
        </div>
      </section>

      <section class="panel finance-evolution-panel">
        <div class="panel-head finance-chart-toolbar">
          <div>
            <p class="eyebrow">Évolution financière</p>
            <h3>La courbe réelle du résultat net</h3>
            <p class="muted">Entrées moins sorties, recalculées depuis les dates de chaque mouvement.</p>
          </div>
          <div class="finance-chart-ranges" role="group" aria-label="Période de la courbe">
            <button type="button" data-finance-chart-range="7d" class="${state.financeChartRange === "7d" ? "is-active" : ""}">7 jours</button>
            <button type="button" data-finance-chart-range="30d" class="${state.financeChartRange === "30d" ? "is-active" : ""}">30 jours</button>
            <button type="button" data-finance-chart-range="12m" class="${state.financeChartRange === "12m" ? "is-active" : ""}">12 mois</button>
          </div>
        </div>
        <div id="financeEvolutionChart">${financeEvolutionChartMarkup(chartMovements, state.financeChartRange)}</div>
      </section>

      <section class="finance-filter-panel panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Filtres du registre</p>
            <h3>Choisir exactement ce qui doit être calculé</h3>
          </div>
          <button type="button" class="secondary-button" id="financeRefreshButton">
            <i data-lucide="refresh-cw"></i> Actualiser
          </button>
        </div>
        <div class="finance-filter-grid">
          <label>Environnement<select id="financeEnvironmentFilter">${environmentOptions}</select></label>
          <label>Source<select id="financeSourceFilter">
            <option value="">Toutes</option>
            <option value="SONARA_PACK" ${selectedAttribute(state.financeFilters.source, "SONARA_PACK")}>Sonara Pack</option>
            <option value="FOUNDER_MANUAL" ${selectedAttribute(state.financeFilters.source, "FOUNDER_MANUAL")}>Manuel Founder</option>
            <option value="FOUNDER_ADMINISTRATION" ${selectedAttribute(state.financeFilters.source, "FOUNDER_ADMINISTRATION")}>Administration Founder</option>
            <option value="FOUNDER_LEGACY_RECORD" ${selectedAttribute(state.financeFilters.source, "FOUNDER_LEGACY_RECORD")}>Ancien registre Founder</option>
          </select></label>
          <label>Catégorie<select id="financeCategoryFilter">
            <option value="">Toutes</option>
            ${["SONARA_COMMISSION","SONARA_REFUND","STRIPE_FEE","STRIPE_FEE_REFUND","MANUAL_INCOME","REFUND_RECEIVED","EXPENSE","CHARGE","INVESTMENT_CAPITAL_OUT","INVESTMENT_CAPITAL_RETURN","INVESTMENT_GAIN","INVESTMENT_LOSS","OTHER_IN","OTHER_OUT","REVERSAL"].map((category) => `
              <option value="${category}" ${selectedAttribute(state.financeFilters.category, category)}>${financeCategoryLabel(category)}</option>
            `).join("")}
          </select></label>
          <label>Statut<select id="financeStatusFilter">
            <option value="">Tous</option>
            <option value="confirmed" ${selectedAttribute(state.financeFilters.status, "confirmed")}>Confirmé</option>
            <option value="pending" ${selectedAttribute(state.financeFilters.status, "pending")}>En attente</option>
            <option value="failed" ${selectedAttribute(state.financeFilters.status, "failed")}>Échoué</option>
            <option value="cancelled" ${selectedAttribute(state.financeFilters.status, "cancelled")}>Annulé</option>
          </select></label>
          <label>Depuis<input id="financeStartFilter" type="date" value="${escapeHTML(state.financeFilters.start || "")}"></label>
          <label>Jusqu’au<input id="financeEndFilter" type="date" value="${escapeHTML(state.financeFilters.end || "")}"></label>
        </div>
      </section>

      <section class="finance-balance-grid finance-ledger-totals">
        <article class="finance-balance-card is-positive">
          <span>Total des entrées</span>
          <strong>+${formatFinanceCents(summary.totalInCents || 0)}</strong>
          <small>Uniquement les entrées confirmées qui affectent le résultat</small>
        </article>
        <article class="finance-balance-card is-negative">
          <span>Total des sorties</span>
          <strong>−${formatFinanceCents(summary.totalOutCents || 0)}</strong>
          <small>Les sorties en attente ne réduisent pas encore le net</small>
        </article>
        <article class="finance-balance-card ${financeToneClass((summary.netCents || 0) / 100)}">
          <span>Résultat net</span>
          <strong>${formatFinanceCents(summary.netCents || 0)}</strong>
          <small>Entrées confirmées − sorties confirmées</small>
        </article>
      </section>

      <section class="finance-cash-grid">
        <article class="panel finance-cash-card">
          <p class="eyebrow">Trésorerie constatée</p>
          <h3>${formatFinanceCents(summary.cashDeltaCents || 0)}</h3>
          <p>Entré ${formatFinanceCents(summary.cashInCents || 0)} · sorti ${formatFinanceCents(summary.cashOutCents || 0)}</p>
          <small>Chaque somme réellement investie ou récupérée est intégrée au résultat net.</small>
        </article>
        <article class="panel finance-cash-card">
          <p class="eyebrow">Investissements</p>
          <h3>${formatFinanceCents(summary.activeInvestmentCapitalCents || 0)} engagé</h3>
          <p>Investi ${formatFinanceCents(summary.investedCapitalCents || 0)} · récupéré ${formatFinanceCents(summary.returnedCapitalCents || 0)}</p>
          <small>Impact net actuel : ${formatFinanceCents(summary.investmentResultCents || 0)}</small>
        </article>
        <article class="panel finance-cash-card">
          <p class="eyebrow">En attente</p>
          <h3>${formatFinanceCents((summary.pendingInCents || 0) - (summary.pendingOutCents || 0))}</h3>
          <p>Entrées ${formatFinanceCents(summary.pendingInCents || 0)} · sorties ${formatFinanceCents(summary.pendingOutCents || 0)}</p>
          <small>Ces montants ne modifient pas encore le résultat confirmé.</small>
        </article>
      </section>

      <section class="panel finance-sonara-panel finance-sonara-ledger">
        <div>
          <p class="eyebrow">Connexion Sonara Pack</p>
          <h3>Commission réelle de la plateforme uniquement</h3>
          <p class="muted">
            La part artiste n’entre jamais dans Founder. Le Bridge importe les mouvements
            idempotents et peut rattraper l’historique après une indisponibilité.
          </p>
        </div>
        <div class="finance-sonara-value">
          <span>Commissions brutes Sonara</span>
          <strong>${formatFinanceCents(summary.sonaraRevenueCents || 0)}</strong>
          <small>
            − ${formatFinanceCents(summary.refundsCents || 0)} remboursés
            · − ${formatFinanceCents(summary.stripeFeesCents || 0)} de frais Stripe
          </small>
        </div>
        <div class="finance-auto-status is-${escapeHTML(connectionStatus)}">
          <i data-lucide="${connectionStatus === "connected" ? "radio" : connectionStatus === "partial" ? "cloud-cog" : connection.enabled === false ? "lock" : "cloud-off"}"></i>
          <div>
            <strong>${escapeHTML(connectionLabel)}</strong>
            <span>${connection.lastSyncAt ? `Dernier passage ${escapeHTML(formatDate(connection.lastSyncAt))}` : "Premier passage en cours"}</span>
          </div>
        </div>
      </section>
      ${connection.error ? `<div class="finance-sync-warning"><i data-lucide="info"></i>${escapeHTML(connection.error)}</div>` : ""}
      ${environmentBreakdown}

      <section class="panel finance-rates-panel finance-day-rhythm">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Rythme du jour</p>
            <h3>Le net depuis minuit, au temps réellement écoulé</h3>
          </div>
          <strong class="finance-day-total">${formatFinanceCents(summary.todayNetCents || 0)}</strong>
        </div>
        <div class="finance-rates-grid">
          ${financeRateCard("Net aujourd’hui", (summary.todayNetCents || 0) / 100)}
          ${financeRateCard("Moyenne / heure", (rates.hourCents || 0) / 100)}
          ${financeRateCard("Moyenne / minute", (rates.minuteCents || 0) / 100)}
          <article class="finance-rate-card ${financeToneClass(rates.secondCents || 0)}">
            <span>Moyenne / seconde</span>
            <strong>${formatFinanceCents(rates.secondCents || 0, 6)}</strong>
          </article>
        </div>
        <p class="muted small">À minuit, cette vue repart visuellement à zéro. Aucun mouvement n’est supprimé.</p>
      </section>

      <section class="finance-period-grid">
        <article class="finance-balance-card ${financeToneClass((summary.weekNetCents || 0) / 100)}">
          <span>Cette semaine</span><strong>${formatFinanceCents(summary.weekNetCents || 0)}</strong><small>Lundi 00:00 → maintenant</small>
        </article>
        <article class="finance-balance-card ${financeToneClass((summary.monthNetCents || 0) / 100)}">
          <span>Ce mois</span><strong>${formatFinanceCents(summary.monthNetCents || 0)}</strong><small>Premier jour 00:00 → maintenant</small>
        </article>
        <article class="finance-balance-card ${financeToneClass((summary.yearNetCents || 0) / 100)}">
          <span>Cette année</span><strong>${formatFinanceCents(summary.yearNetCents || 0)}</strong><small>1er janvier 00:00 → maintenant</small>
        </article>
      </section>



      <section class="finance-detail-grid">
        <article class="panel">
          <p class="eyebrow">Entrées</p><h3>Ce qui augmente réellement le résultat</h3>
          <div class="finance-breakdown">
            <span><small>Revenus Sonara Pack</small><strong>${formatFinanceCents(summary.sonaraRevenueCents || 0)}</strong></span>
            <span><small>Revenus manuels</small><strong>${formatFinanceCents(asObject(summary.categories).MANUAL_INCOME || 0)}</strong></span>
            <span><small>Remboursements reçus</small><strong>${formatFinanceCents(asObject(summary.categories).REFUND_RECEIVED || 0)}</strong></span>
            <span><small>Gains d’investissement</small><strong>${formatFinanceCents(summary.investmentGainsCents || 0)}</strong></span>
            <span><small>Autres entrées</small><strong>${formatFinanceCents(asObject(summary.categories).OTHER_IN || 0)}</strong></span>
          </div>
        </article>
        <article class="panel">
          <p class="eyebrow">Sorties</p><h3>Ce qui réduit réellement le résultat</h3>
          <div class="finance-breakdown">
            <span><small>Remboursements</small><strong>${formatFinanceCents(summary.refundsCents || 0)}</strong></span>
            <span><small>Frais Stripe</small><strong>${formatFinanceCents(summary.stripeFeesCents || 0)}</strong></span>
            <span><small>Dépenses</small><strong>${formatFinanceCents(summary.expensesCents || 0)}</strong></span>
            <span><small>Charges</small><strong>${formatFinanceCents(summary.chargesCents || 0)}</strong></span>
            <span><small>Pertes d’investissement</small><strong>${formatFinanceCents(summary.investmentLossesCents || 0)}</strong></span>
          </div>
        </article>
      </section>

      <section class="panel finance-analyzer-panel">
        <div class="panel-head">
          <div><p class="eyebrow">Analyseur historique</p><h3>Analyser une période</h3></div>
        </div>
        <form id="financeAnalyzerForm" class="finance-analyzer-form">
          <label>Type de période<select name="type" id="financeAnalysisType">
            <option value="day">Jour précis</option>
            <option value="week">Semaine précise</option>
            <option value="month">Mois précis</option>
            <option value="year">Année précise</option>
            <option value="custom">Période personnalisée</option>
          </select></label>
          <label>Date de référence<input type="date" name="anchor" value="${financeInputDate()}"></label>
          <label class="finance-custom-date">Début<input type="date" name="start"></label>
          <label class="finance-custom-date">Fin<input type="date" name="end"></label>
          <label>Lecture<select name="direction">
            <option value="">Net</option><option value="IN">Entrées</option><option value="OUT">Sorties</option>
          </select></label>
          <button class="primary-button" type="submit">Analyser</button>
        </form>
        <div id="financeAnalysisResult" class="finance-analysis-result">
          <p class="muted">Choisis une période : les anciennes journées, semaines, mois et années restent consultables.</p>
        </div>
      </section>

      <section class="panel finance-manual-panel">
        <div class="panel-head"><div><p class="eyebrow">Mouvement manuel</p><h3>Ajouter une entrée ou une sortie réelle</h3></div></div>
        <form id="financeMovementForm" class="administration-form-grid">
          <label>Titre<input name="title" maxlength="220" required placeholder="Hébergement, domaine, autre revenu…"></label>
          <label>Direction<select name="direction"><option value="IN">Entrée</option><option value="OUT">Sortie</option></select></label>
          <label>Catégorie<select name="category">
            <option value="MANUAL_INCOME">Revenu ajouté manuellement</option>
            <option value="REFUND_RECEIVED">Remboursement reçu / retour d’argent</option>
            <option value="INVESTMENT_CAPITAL_OUT">Capital investi</option>
            <option value="INVESTMENT_CAPITAL_RETURN">Retour d’investissement réellement reçu</option>
            <option value="INVESTMENT_GAIN">Gain d’investissement isolé confirmé</option>
            <option value="EXPENSE">Dépense</option>
            <option value="CHARGE">Charge</option>
            <option value="INVESTMENT_LOSS">Perte d’investissement confirmée</option>
            <option value="OTHER_IN">Autre entrée</option>
            <option value="OTHER_OUT">Autre sortie</option>
          </select></label>
          <label>Montant (€)<input name="amount" type="number" min="0.01" step="0.01" required></label>
          <label>Date réelle<input name="transactionDate" type="date" value="${financeInputDate()}" required></label>
          <label>Statut<select name="status"><option value="confirmed">Confirmé</option><option value="pending">En attente</option></select></label>
          <label>Personne ou service<input name="counterparty" maxlength="220"></label>
          <label class="administration-wide-field">Description<textarea name="notes" maxlength="2500"></textarea></label>
          <button class="primary-button" type="submit">Enregistrer le mouvement</button>
        </form>
      </section>

      <section class="panel finance-ledger-panel">
        <div class="panel-head">
          <div><p class="eyebrow">Registre central</p><h3>Tous les mouvements individuels</h3></div>
          <span class="count-chip">${movements.length}</span>
        </div>
        <div class="finance-ledger-list">${movementRows}</div>
      </section>
    `;

    document.querySelector("[data-administration-back]")?.addEventListener("click", renderAdministration);
    document.getElementById("financeRefreshButton")?.addEventListener("click", async () => {
      try {
        await api("/finance/summary?refresh=true");
        await renderAdministrationFinances();
        showToast("Registre financier actualisé.");
      } catch (error) {
        showToast(error.message, "error");
      }
    });

    const updateFilter = (key, value) => {
      state.financeFilters = { ...state.financeFilters, [key]: value };
      if (!value) delete state.financeFilters[key];
      renderAdministrationFinances();
    };
    document.getElementById("financeEnvironmentFilter")?.addEventListener("change", (event) => updateFilter("environment", event.target.value));
    document.getElementById("financeSourceFilter")?.addEventListener("change", (event) => updateFilter("source", event.target.value));
    document.getElementById("financeCategoryFilter")?.addEventListener("change", (event) => updateFilter("category", event.target.value));
    document.getElementById("financeStatusFilter")?.addEventListener("change", (event) => updateFilter("status", event.target.value));
    document.getElementById("financeStartFilter")?.addEventListener("change", (event) => updateFilter("start", event.target.value || ""));
    document.getElementById("financeEndFilter")?.addEventListener("change", (event) => updateFilter("end", event.target.value || ""));

    document.querySelectorAll("[data-finance-chart-range]").forEach((button) => {
      button.addEventListener("click", () => {
        state.financeChartRange = button.dataset.financeChartRange || "30d";
        document.querySelectorAll("[data-finance-chart-range]").forEach((rangeButton) => {
          rangeButton.classList.toggle("is-active", rangeButton.dataset.financeChartRange === state.financeChartRange);
        });
        const chartNode = document.getElementById("financeEvolutionChart");
        if (chartNode) chartNode.innerHTML = financeEvolutionChartMarkup(chartMovements, state.financeChartRange);
        icons();
      });
    });

    const financeMovementForm = document.getElementById("financeMovementForm");
    const financeCategorySelect = financeMovementForm?.querySelector('[name="category"]');
    const financeDirectionSelect = financeMovementForm?.querySelector('[name="direction"]');
    financeCategorySelect?.addEventListener("change", () => {
      const category = financeCategorySelect.value;
      if (["EXPENSE", "CHARGE", "INVESTMENT_LOSS", "INVESTMENT_CAPITAL_OUT", "OTHER_OUT"].includes(category)) financeDirectionSelect.value = "OUT";
      if (["MANUAL_INCOME", "REFUND_RECEIVED", "OTHER_IN", "INVESTMENT_GAIN", "INVESTMENT_CAPITAL_RETURN"].includes(category)) financeDirectionSelect.value = "IN";
    });

    financeMovementForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(form));
        await api("/finance/movements/manual", { method: "POST", body: JSON.stringify(payload) });
        showToast(payload.status === "pending" ? "Mouvement en attente enregistré." : "Mouvement confirmé enregistré.");
        await renderAdministrationFinances();
        refreshOverview();
      } catch (error) {
        showToast(error.message, "error");
        button.disabled = false;
      }
    });

    document.querySelectorAll("[data-finance-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api(`/finance/movements/${encodeURIComponent(button.dataset.financeId)}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: button.dataset.financeStatus })
          });
          showToast(button.dataset.financeStatus === "confirmed" ? "Mouvement confirmé." : "Mouvement annulé.");
          await renderAdministrationFinances();
        } catch (error) {
          showToast(error.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-reverse-finance]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm("Créer une contre-écriture ? Le mouvement original restera dans l’historique.")) return;
        try {
          await api(`/finance/movements/${encodeURIComponent(button.dataset.reverseFinance)}`, {
            method: "DELETE",
            body: JSON.stringify({ reason: "Annulation depuis Founder" })
          });
          showToast("Contre-écriture créée. L’historique original est conservé.");
          await renderAdministrationFinances();
        } catch (error) {
          showToast(error.message, "error");
        }
      });
    });

    const analyzerForm = document.getElementById("financeAnalyzerForm");
    const analysisType = document.getElementById("financeAnalysisType");
    const toggleCustomDates = () => {
      document.querySelectorAll(".finance-custom-date").forEach((field) => {
        field.classList.toggle("is-hidden", analysisType?.value !== "custom");
      });
    };
    analysisType?.addEventListener("change", toggleCustomDates);
    toggleCustomDates();
    analyzerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const resultNode = document.getElementById("financeAnalysisResult");
      resultNode.innerHTML = "<p class=\"muted\">Analyse en cours…</p>";
      try {
        const params = new URLSearchParams(Object.fromEntries(new FormData(analyzerForm)));
        for (const [key, value] of Object.entries(state.financeFilters)) {
          if (value && !["start", "end", "direction"].includes(key)) params.set(key, value);
        }
        const response = await api(`/finance/analyze?${params.toString()}`);
        const analysis = asObject(response.analysis);
        const averages = asObject(analysis.averages);
        resultNode.innerHTML = `
          <div class="finance-analysis-grid">
            <article><span>Entrées</span><strong>+${formatFinanceCents(analysis.totalInCents || 0)}</strong></article>
            <article><span>Sorties</span><strong>−${formatFinanceCents(analysis.totalOutCents || 0)}</strong></article>
            <article><span>Net</span><strong>${formatFinanceCents(analysis.netCents || 0)}</strong></article>
            <article><span>Mouvements</span><strong>${analysis.movementCount || 0}</strong></article>
            <article><span>Ventes Sonara</span><strong>${analysis.saleCount || 0}</strong></article>
            <article><span>Remboursements</span><strong>${analysis.refundCount || 0}</strong></article>
            <article><span>Frais Stripe</span><strong>${formatFinanceCents(analysis.feeCents || 0)}</strong></article>
            <article><span>Dépenses + charges</span><strong>${formatFinanceCents(analysis.expenseCents || 0)}</strong></article>
            <article><span>Capital engagé</span><strong>${formatFinanceCents(analysis.activeInvestmentCapitalCents || 0)}</strong></article>
            <article><span>Moyenne / jour</span><strong>${formatFinanceCents(averages.dayCents || 0, 4)}</strong></article>
            <article><span>Moyenne / heure</span><strong>${formatFinanceCents(averages.hourCents || 0, 4)}</strong></article>
            <article><span>Moyenne / minute</span><strong>${formatFinanceCents(averages.minuteCents || 0, 6)}</strong></article>
            <article><span>Moyenne / seconde</span><strong>${formatFinanceCents(averages.secondCents || 0, 6)}</strong></article>
          </div>
          <p class="muted small">
            Période ${escapeHTML(formatDate(analysis.selection?.start))} → ${escapeHTML(formatDate(analysis.selection?.effectiveEnd))}
            · ${analysis.selection?.completed ? "terminée" : "encore en cours, temps écoulé uniquement"}
          </p>
        `;
      } catch (error) {
        resultNode.innerHTML = errorState(error.message);
      }
    });

    icons();
  } catch (error) {
    content.innerHTML = errorState(error.message);
  }
}

function subscriptionFrequencyLabel(value) {
  return {
    daily: "chaque jour",
    weekly: "chaque semaine",
    biweekly: "toutes les 2 semaines",
    monthly: "chaque mois",
    bimonthly: "tous les 2 mois",
    quarterly: "chaque trimestre",
    semiannual: "tous les 6 mois",
    annual: "chaque année",
    one_time: "ponctuel"
  }[value] || value;
}

function subscriptionPaidByLabel(value) {
  return {
    founder: "Payé par toi",
    company: "Payé par l’entreprise",
    mother: "Pris en charge par ta mère",
    other: "Pris en charge par un tiers"
  }[value] || value;
}

function subscriptionMonthlyAmount(record) {
  const amount = asNumber(record.amount);
  return {
    daily: amount * 365 / 12,
    weekly: amount * 52 / 12,
    biweekly: amount * 26 / 12,
    monthly: amount,
    bimonthly: amount / 2,
    quarterly: amount / 3,
    semiannual: amount / 6,
    annual: amount / 12,
    one_time: 0
  }[record.frequency] || 0;
}

async function renderAdministrationSubscriptions() {
  content.innerHTML = `<section class="loading-card">Chargement des abonnements…</section>`;

  try {
    const response = asObject(await api("/administration"));
    const administration = asObject(response.administration);
    const records = asArray(administration.records)
      .filter((record) => record.module === "expenses");
    const active = records.filter((record) => record.status === "active");
    const founderMonthly = active
      .filter((record) => ["founder", "company"].includes(record.paidBy || "founder"))
      .reduce((total, record) => total + subscriptionMonthlyAmount(record), 0);
    const sponsoredMonthly = active
      .filter((record) => ["mother", "other"].includes(record.paidBy))
      .reduce((total, record) => total + subscriptionMonthlyAmount(record), 0);

    content.innerHTML = `
      <button class="administration-back-button" type="button" data-administration-back>
        <i data-lucide="arrow-left"></i> Administration
      </button>

      <section class="hero-panel subscription-hero">
        <div>
          <p class="eyebrow">Abonnements</p>
          <h2>Une carte par service, avec le vrai rythme de paiement.</h2>
          <p>Founder convertit automatiquement chaque abonnement en coût mensuel.</p>
        </div>

        <div class="subscription-hero-totals">
          <span>À ta charge / mois</span>
          <strong>${formatAdministrationMoney(founderMonthly)}</strong>
          <small>Pris en charge par un tiers : ${formatAdministrationMoney(sponsoredMonthly)}</small>
        </div>
      </section>

      <form id="subscriptionForm" class="panel administration-record-form">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Nouvel abonnement</p>
            <h3>Ajouter une application ou un service</h3>
          </div>
          <span class="administration-section-number">+</span>
        </div>

        <input type="hidden" name="module" value="expenses">
        <input type="hidden" name="direction" value="outgoing">
        <input type="hidden" name="source" value="expense">
        <input type="hidden" name="status" value="active">

        <div class="administration-form-grid">
          <label>
            Application / abonnement
            <input name="title" required maxlength="220" placeholder="Netflix, ChatGPT Plus, Cloud…">
          </label>

          <label>
            Fournisseur
            <input name="counterparty" maxlength="220" placeholder="OpenAI, Netflix, Apple…">
          </label>

          <label>
            Prix prélevé
            <input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00">
          </label>

          <label>
            Fréquence
            <select name="frequency">
              <option value="weekly">Chaque semaine</option>
              <option value="biweekly">Toutes les 2 semaines</option>
              <option value="monthly" selected>Chaque mois</option>
              <option value="bimonthly">Tous les 2 mois</option>
              <option value="quarterly">Chaque trimestre</option>
              <option value="semiannual">Tous les 6 mois</option>
              <option value="annual">Chaque année</option>
            </select>
          </label>

          <label>
            Qui le paie ?
            <select name="paidBy">
              <option value="founder">Moi</option>
              <option value="company">Mon entreprise</option>
              <option value="mother">Ma mère</option>
              <option value="other">Un autre tiers</option>
            </select>
          </label>

          <label>
            Catégorie
            <select name="category">
              <option value="ai">Intelligence artificielle</option>
              <option value="streaming">Streaming</option>
              <option value="cloud">Cloud / stockage</option>
              <option value="hosting">Hébergement / infrastructure</option>
              <option value="software">Logiciel</option>
              <option value="music">Musique</option>
              <option value="other">Autre</option>
            </select>
          </label>

          <label>
            Prochain prélèvement
            <input name="dueDate" type="date">
          </label>

          <label class="administration-wide-field">
            Notes
            <textarea name="notes" maxlength="2500" placeholder="Compte utilisé, raison, conditions…"></textarea>
          </label>
        </div>

        <button class="primary-button" type="submit">Ajouter l’abonnement</button>
      </form>

      <section class="subscription-card-grid">
        ${records.length ? records.map((record) => `
          <article class="subscription-card ${record.status === "active" ? "is-active" : "is-paused"}">
            <div class="subscription-card-head">
              <span class="subscription-app-icon"><i data-lucide="app-window"></i></span>
              <span class="status-chip">${record.status === "active" ? "Actif" : "Arrêté"}</span>
            </div>

            <div>
              <p class="eyebrow">${escapeHTML(record.category || "abonnement")}</p>
              <h3>${escapeHTML(record.title)}</h3>
              <p class="muted">${escapeHTML(record.counterparty || "Fournisseur non renseigné")}</p>
            </div>

            <div class="subscription-price">
              <strong>${formatAdministrationMoney(record.amount || 0)}</strong>
              <span>${escapeHTML(subscriptionFrequencyLabel(record.frequency))}</span>
            </div>

            <div class="subscription-monthly">
              <span>Équivalent mensuel</span>
              <strong>${formatAdministrationMoney(subscriptionMonthlyAmount(record))}</strong>
            </div>

            <div class="subscription-payer ${record.paidBy === "mother" ? "is-sponsored" : ""}">
              <i data-lucide="user-round-check"></i>
              ${escapeHTML(subscriptionPaidByLabel(record.paidBy || "founder"))}
            </div>

            <div class="subscription-actions">
              <button type="button" class="secondary-button" data-toggle-subscription="${escapeHTML(record.id)}" data-next-status="${record.status === "active" ? "cancelled" : "active"}">
                ${record.status === "active" ? "Arrêter" : "Réactiver"}
              </button>
              <button type="button" class="administration-delete-file" data-delete-subscription="${escapeHTML(record.id)}" aria-label="Supprimer">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </article>
        `).join("") : emptyState("Aucun abonnement", "Ajoute Netflix, ChatGPT, Cloud ou tout autre prélèvement.")}
      </section>
    `;

    document.querySelector("[data-administration-back]")
      ?.addEventListener("click", renderAdministration);

    document.getElementById("subscriptionForm")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;

        try {
          await api("/administration/records", {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
          });
          showToast("Abonnement ajouté et mensualisé.");
          await renderAdministrationSubscriptions();
          refreshOverview();
        } catch (error) {
          showToast(error.message, "error");
        }
      });

    document.querySelectorAll("[data-toggle-subscription]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api(`/administration/records/${encodeURIComponent(button.dataset.toggleSubscription)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: button.dataset.nextStatus })
          });
          await renderAdministrationSubscriptions();
          refreshOverview();
        } catch (error) {
          showToast(error.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-delete-subscription]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm("Supprimer cet abonnement ?")) return;
        try {
          await api(`/administration/records/${encodeURIComponent(button.dataset.deleteSubscription)}`, { method: "DELETE" });
          await renderAdministrationSubscriptions();
          refreshOverview();
        } catch (error) {
          showToast(error.message, "error");
        }
      });
    });

    icons();
  } catch (error) {
    content.innerHTML = errorState(error.message);
  }
}

async function renderAdministrationModule(
  module
) {
  const config =
    ADMINISTRATION_MODULE_CONFIG[module];

  const fields =
    ADMINISTRATION_MODULE_FIELDS[module];

  if (!config || !fields) {
    renderAdministration();
    return;
  }

  content.innerHTML = `
    <section class="loading-card">
      Chargement de ${escapeHTML(config.title)}…
    </section>
  `;

  try {
    const response =
      asObject(
        await api(
          "/administration"
        )
      );

    const administration =
      asObject(
        response.administration
      );

    const summary =
      asObject(
        administration.summary
      );

    const moduleSummary =
      asObject(
        asObject(summary.modules)[module]
      );

    const records =
      asArray(
        administration.records
      ).filter(
        (record) =>
          record.module === module
      );

    content.innerHTML = `
      <button
        class="administration-back-button"
        type="button"
        data-administration-back
      >
        <i data-lucide="arrow-left"></i>
        Administration
      </button>

      <section class="hero-panel administration-module-hero">
        <div>
          <p class="eyebrow">${escapeHTML(fields.eyebrow)}</p>
          <h2>${escapeHTML(fields.title)}</h2>
          <p>
            Toutes les données sont privées et enregistrées
            directement dans Founder.
          </p>
        </div>

        <div class="administration-module-summary">
          <span>${escapeHTML(config.amountLabel)}</span>

          <strong>
            ${formatAdministrationMoney(
              moduleSummary.amount || 0
            )}
          </strong>

          <small>
            ${asNumber(moduleSummary.count)}
            éléments actifs
          </small>
        </div>
      </section>

      <section class="administration-metrics">
        <article>
          <span>Montant</span>
          <strong>
            ${formatAdministrationMoney(
              moduleSummary.amount || 0
            )}
          </strong>
          <small>${escapeHTML(config.amountLabel)}</small>
        </article>

        <article>
          <span>À traiter</span>
          <strong>${asNumber(moduleSummary.count)}</strong>
          <small>${escapeHTML(config.actionLabel)}</small>
        </article>

        <article class="${asNumber(moduleSummary.overdue) > 0 ? "is-alert" : ""}">
          <span>En retard</span>
          <strong>${asNumber(moduleSummary.overdue)}</strong>
          <small>échéances dépassées</small>
        </article>

        <article>
          <span>Total enregistré</span>
          <strong>${asNumber(moduleSummary.total)}</strong>
          <small>éléments dans Founder</small>
        </article>
      </section>

      <form
        id="administrationRecordForm"
        class="panel administration-record-form"
      >
        <div class="panel-head">
          <div>
            <p class="eyebrow">${escapeHTML(fields.eyebrow)}</p>
            <h3>${escapeHTML(fields.formTitle)}</h3>
          </div>

          <span class="administration-section-number">
            +
          </span>
        </div>

        <input
          type="hidden"
          name="module"
          value="${module}"
        >

        <div class="administration-form-grid">
          <label class="administration-wide-field">
            Titre
            <input
              name="title"
              required
              placeholder="${escapeHTML(fields.formTitle)}"
            >
          </label>

          <label>
            ${escapeHTML(fields.counterpartyLabel)}
            <input
              name="counterparty"
              placeholder="${escapeHTML(fields.counterpartyLabel)}"
            >
          </label>

          <label>
            ${escapeHTML(fields.amountLabel)}
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              value="0"
            >
          </label>

          ${
            module === "investments"
              ? `
                <label>
                  Retour récupéré
                  <input
                    name="returnAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value="0"
                    placeholder="0,00"
                  >
                </label>
              `
              : ""
          }

          <label>
            Date réelle du mouvement
            <input
              name="transactionDate"
              type="date"
              value="${new Date().toISOString().slice(0, 10)}"
            >
          </label>

          <label>
            Sens financier
            <select name="direction">
              ${
                fields.directionOptions
                  .map(
                    ([value, label]) => `
                      <option value="${value}">
                        ${label}
                      </option>
                    `
                  )
                  .join("")
              }
            </select>
          </label>

          <label>
            État
            <select name="status">
              ${
                fields.statuses
                  .map(
                    ([value, label]) => `
                      <option value="${value}">
                        ${label}
                      </option>
                    `
                  )
                  .join("")
              }
            </select>
          </label>

          <label>
            Échéance
            <input
              name="dueDate"
              type="date"
            >
          </label>

          <label>
            Fréquence
            <select name="frequency">
              <option value="one_time">Ponctuel</option>
              <option value="daily">Quotidien</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="biweekly">Toutes les 2 semaines</option>
              <option value="monthly">Mensuel</option>
              <option value="bimonthly">Tous les 2 mois</option>
              <option value="quarterly">Trimestriel</option>
              <option value="semiannual">Tous les 6 mois</option>
              <option value="annual">Annuel</option>
            </select>
          </label>

          <label>
            Référence
            <input
              name="reference"
              placeholder="Contrat, facture ou référence"
            >
          </label>

          <label class="administration-wide-field">
            Notes
            <textarea
              name="notes"
              placeholder="Contexte, prochaine action, conditions…"
            ></textarea>
          </label>
        </div>

        <button
          class="primary-button"
          type="submit"
        >
          Enregistrer
        </button>
      </form>

      <section class="panel administration-records-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">${escapeHTML(fields.eyebrow)}</p>
            <h3>Éléments enregistrés</h3>
          </div>

          <span class="count-chip">
            ${records.length}
          </span>
        </div>

        <div class="administration-records-list">
          ${
            records.length
              ? records
                  .map(
                    (record) =>
                      administrationRecordRow(
                        record,
                        module
                      )
                  )
                  .join("")
              : emptyState(
                  "Aucun élément",
                  "Ajoute le premier élément avec le formulaire ci-dessus."
                )
          }
        </div>
      </section>
    `;

    document
      .querySelector(
        "[data-administration-back]"
      )
      ?.addEventListener(
        "click",
        renderAdministration
      );

    document
      .getElementById(
        "administrationRecordForm"
      )
      ?.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          const form =
            event.currentTarget;

          const button =
            form.querySelector(
              '[type="submit"]'
            );

          button.disabled = true;

          try {
            await api(
              "/administration/records",
              {
                method: "POST",
                body: JSON.stringify(
                  Object.fromEntries(
                    new FormData(form)
                  )
                )
              }
            );

            showToast(
              "Élément administratif enregistré."
            );

            await refreshAdministrationSection(
              () =>
                renderAdministrationModule(
                  module
                )
            );

            refreshOverview();
          } catch (error) {
            showToast(
              error.message,
              "error"
            );

            button.disabled = false;
          }
        }
      );

    document
      .querySelectorAll(
        "[data-administration-record-id]"
      )
      .forEach(
        (form) => {
          const recordId =
            form.dataset
              .administrationRecordId;

          form.addEventListener(
            "submit",
            async (event) => {
              event.preventDefault();

              try {
                await api(
                  `/administration/records/${encodeURIComponent(recordId)}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify(
                      Object.fromEntries(
                        new FormData(form)
                      )
                    )
                  }
                );

                showToast(
                  "État mis à jour."
                );

                await refreshAdministrationSection(
              () =>
                renderAdministrationModule(
                  module
                )
            );

                refreshOverview();
              } catch (error) {
                showToast(
                  error.message,
                  "error"
                );
              }
            }
          );

          form
            .querySelector(
              ".administration-delete-record"
            )
            ?.addEventListener(
              "click",
              async () => {
                const confirmed =
                  window.confirm(
                    "Supprimer cet élément administratif ?"
                  );

                if (!confirmed) {
                  return;
                }

                try {
                  await api(
                    `/administration/records/${encodeURIComponent(recordId)}`,
                    {
                      method: "DELETE"
                    }
                  );

                  showToast(
                    "Élément supprimé."
                  );

                  await refreshAdministrationSection(
              () =>
                renderAdministrationModule(
                  module
                )
            );

                  refreshOverview();
                } catch (error) {
                  showToast(
                    error.message,
                    "error"
                  );
                }
              }
            );
        }
      );

    icons();
  } catch (error) {
    content.innerHTML =
      errorState(
        error.message
      );
  }
}

function urssafWorkflowStatusLabel(
  status
) {
  return {
    locked: "Verrouillé",
    action_required: "À faire",
    ready: "Prêt",
    waiting_external: "En attente",
    completed: "Terminé"
  }[status] || status;
}

function applyUrssafProgressiveWorkflow(
  workflow
) {
  const steps = asArray(workflow.steps);
  const isSasuWorkflow = workflow.path === "sasu";
  const isSelectionWorkflow = workflow.path === "selection";
  const progressiveReveal = workflow.progressiveReveal === true;
  const revealedSteps = progressiveReveal
    ? steps.filter((step) => step.revealed !== false)
    : steps;
  const onboardingComplete = workflow.onboardingComplete === true;
  const requestedStage = state.urssafOpenStage;
  const editingCompletedOnboarding =
    onboardingComplete &&
    requestedStage &&
    steps.some((step) => step.id === requestedStage);

  const currentStage = workflow.currentStage || "identity";
  const visibleStage = editingCompletedOnboarding
    ? requestedStage
    : requestedStage &&
      steps.some(
        (step) =>
          step.id === requestedStage &&
          step.status !== "locked"
      )
      ? requestedStage
      : currentStage;

  state.urssafOpenStage = editingCompletedOnboarding
    ? visibleStage
    : onboardingComplete
      ? null
      : visibleStage;

  const identity = document.getElementById("administrationProfileForm");
  const business = document.getElementById("administrationBusinessForm");
  const registration = document.getElementById("administrationRegistrationForm");
  const documents = document.querySelector(".administration-documents-panel");
  const sasuAuthorization = document.getElementById("sasuAuthorizationForm");
  const sasuAuthorizationDocuments = document.querySelector(".sasu-authorization-documents");
  const sasuAuthorizationPrintNote = document.querySelector(".sasu-authorization-print-note");
  const sasuCapital = document.getElementById("sasuCapitalForm");
  const sasuPresidency = document.getElementById("sasuPresidencyForm");
  const sasuStatutes = document.getElementById("sasuStatutesForm");
  const sasuFinalization = document.getElementById("sasuFinalizationForm");
  const sasuSummary = document.querySelector(".sasu-summary-panel");
  const obligations = document.querySelector(".administration-obligations-panel");
  const financialControl = document.querySelector(".administration-financial-control");
  const introduction = document.querySelector(".administration-notice");

  const targets = {
    identity: [identity],
    business: [business],
    authorization: [sasuAuthorization, sasuAuthorizationDocuments, sasuAuthorizationPrintNote],
    capital: [sasuCapital],
    presidency: [sasuPresidency],
    statutes: [sasuStatutes],
    documents: [documents],
    finalization: [sasuFinalization],
    summary: [sasuSummary],
    preparation: [registration],
    deposit: [registration],
    tracking: [registration],
    decision: [registration],
    registration: [registration],
    declaration_detection: [registration],
    dashboard: [financialControl, obligations]
  };

  const uniqueElements = new Set(
    Object.values(targets)
      .flat()
      .filter(Boolean)
  );

  uniqueElements.forEach((element) => {
    element.hidden = true;
    element.classList.add("urssaf-progressive-section");
    element.classList.remove("is-current");
  });

  if (introduction) {
    introduction.hidden = onboardingComplete && !editingCompletedOnboarding;
  }

  if (onboardingComplete && !editingCompletedOnboarding) {
    asArray(targets.dashboard)
      .filter(Boolean)
      .forEach((element) => {
        element.hidden = false;
        element.classList.add("is-current");
      });

    if (financialControl) {
      financialControl.insertAdjacentHTML(
        "beforebegin",
        `
          <section class="urssaf-next-action panel">
            <div class="urssaf-next-action-icon">
              <i data-lucide="badge-check"></i>
            </div>
            <div>
              <p class="eyebrow">Immatriculation réelle détectée</p>
              <h3>Founder passe maintenant au pilotage permanent.</h3>
              <p>
                Le parcours administratif est terminé. La dashboard s’active maintenant selon
                l’environnement : simulation sur LOCAL / TEST, réel sur MAIN.
              </p>
              <p>
                <strong>Pour l’argent réel : passe sur MAIN.</strong>
                LOCAL et TEST restent uniquement des environnements de préparation et de simulation.
              </p>
              <button class="secondary-button" type="button" data-urssaf-edit-registration>
                <i data-lucide="file-pen-line"></i>
                Modifier le dossier d’inscription
              </button>
            </div>
          </section>
        `
      );
    }

    document
      .querySelector("[data-urssaf-edit-registration]")
      ?.addEventListener("click", () => {
        state.urssafOpenStage = "identity";
        renderAdministrationUrssaf();
      });

    return;
  }

  if (introduction) {
    introduction.insertAdjacentHTML(
      "beforebegin",
      `
        <section class="urssaf-next-action panel">
          <div class="urssaf-next-action-icon">
            <i data-lucide="sparkles"></i>
          </div>

          <div>
            <p class="eyebrow">Prochaine action</p>
            <h3>${escapeHTML(workflow.nextAction || "")}</h3>

            <p>
              Environnement :
              <strong>${escapeHTML(workflow.currentStageEnvironmentLabel || "LOCAL / TEST")}</strong>
              · tu es actuellement sur
              <strong>${escapeHTML(environmentLabel(workflow.runtimeEnvironment || state.environment))}</strong>
            </p>

            <p>${escapeHTML(workflow.currentStageEnvironmentInstruction || "")}</p>

            ${asArray(workflow.missing).length
              ? `
                <p>
                  Informations manquantes :
                  <strong>${asArray(workflow.missing).map(escapeHTML).join(", ")}</strong>
                </p>
              `
              : `
                <p>Aucune information supplémentaire n’est requise pour cette étape.</p>
              `}
          </div>
        </section>

        <section class="urssaf-progress-panel panel ${isSasuWorkflow ? "is-sasu" : progressiveReveal ? "is-progressive" : ""}">
          <div class="panel-head">
            <div>
              <p class="eyebrow">${
                isSasuWorkflow
                  ? `Préparation SASU · ${escapeHTML(workflow.totalSteps || steps.length)} étapes`
                  : isSelectionWorkflow
                    ? "Démarrage · Identité + Entreprise"
                    : "Parcours d’inscription · 9 étapes"
              }</p>
              <h3>${
                isSasuWorkflow
                  ? "Le parcours se révèle au fur et à mesure"
                  : isSelectionWorkflow
                    ? "Les deux premières étapes sont obligatoires"
                    : "Une seule étape à la fois"
              }</h3>
            </div>
            ${onboardingComplete
              ? `
                <button class="secondary-button" type="button" data-urssaf-dashboard>
                  Retour au Dashboard
                </button>
              `
              : ""}
          </div>

          <div class="urssaf-stepper">
            ${revealedSteps
              .map(
                (step, index) => `
                  <button
                    type="button"
                    class="urssaf-step ${step.status} ${visibleStage === step.id ? "is-open" : ""}"
                    data-urssaf-stage="${escapeHTML(step.id)}"
                    ${step.status === "locked" ? "disabled" : ""}
                    title="${escapeHTML(step.lockedReason || "")}"
                  >
                    <span class="urssaf-step-index">
                      ${step.status === "completed"
                        ? '<i data-lucide="check"></i>'
                        : index + 1}
                    </span>

                    <span>
                      <strong>${escapeHTML(step.label)}</strong>
                      <small>
                        ${escapeHTML(urssafWorkflowStatusLabel(step.status))}
                        · ${escapeHTML(step.environmentLabel || "LOCAL / TEST")}
                      </small>
                    </span>

                    ${step.status === "locked"
                      ? '<i data-lucide="lock"></i>'
                      : '<i data-lucide="chevron-right"></i>'}
                  </button>
                `
              )
              .join("")}
          </div>
        </section>
      `
    );
  }

  asArray(targets[visibleStage])
    .filter(Boolean)
    .forEach((element) => {
      element.hidden = false;
      element.classList.add("is-current");
    });

  if (
    ["tracking", "decision"].includes(visibleStage) &&
    workflow.waitingExternal &&
    registration
  ) {
    registration.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="urssaf-waiting-banner">
          <i data-lucide="hourglass"></i>
          <div>
            <strong>Réponse officielle en attente</strong>
            <p>
              Founder ne fabrique aucune validation. Mets simplement le statut à jour
              quand le Guichet unique évolue ; les étapes suivantes se recalculent immédiatement.
            </p>
          </div>
        </div>
      `
    );
  }

  if (visibleStage === "declaration_detection" && registration) {
    registration.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="urssaf-waiting-banner">
          <i data-lucide="scan-search"></i>
          <div>
            <strong>Détection de l’immatriculation</strong>
            <p>
              ${normalizeEnvironment(state.environment) === "main"
                ? "Sur MAIN, le statut Immatriculé + la date de décision + un SIREN/SIRET cohérents activent automatiquement l’état juridique réel partagé."
                : `${environmentLabel(state.environment)} simule cette étape uniquement. Elle ne peut jamais activer le réel : la confirmation doit être enregistrée depuis Founder MAIN.`}
            </p>
          </div>
        </div>
      `
    );
  }

  document.querySelectorAll("[data-urssaf-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.urssafOpenStage = button.dataset.urssafStage;
      renderAdministrationUrssaf();
    });
  });

  document
    .querySelector("[data-urssaf-dashboard]")
    ?.addEventListener("click", () => {
      state.urssafOpenStage = null;
      renderAdministrationUrssaf();
    });
}

function administrationFileSize(size) {
  const bytes = Number(size) || 0;

  if (bytes < 1024) {
    return `${bytes} o`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function administrationDocumentIsReady(document) {
  if (!document || typeof document !== "object") return false;
  if (["submitted", "accepted"].includes(document.status)) return true;
  return document.status === "ready" && Boolean(document.file?.name) && asNumber(document.file?.size) > 0;
}

function administrationDocumentById(documents, id) {
  return asArray(documents).find((document) => document.id === id) || null;
}

function administrationFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function printUrssafSummary(administration) {
  const profile = asObject(administration.profile);
  const business = asObject(administration.business);
  const registration = asObject(administration.registration);
  const sasu = asObject(administration.sasu);
  const sasuAuthorization = asObject(sasu.authorization);
  const sasuCapital = asObject(sasu.capital);
  const sasuPresidency = asObject(sasu.presidency);
  const sasuStatutes = asObject(sasu.statutes);
  const sasuFinalization = asObject(sasu.finalization);
  const documents = asArray(administration.documents);
  const workflow = asObject(asObject(administration.summary).workflow);
  const isSasu = business.legalForm === "sasu" || workflow.path === "sasu";

  const popup = window.open("", "_blank");

  if (!popup) {
    showToast("Fenêtre d’impression bloquée par le navigateur.", "error");
    return;
  }

  const row = (label, value) => `
    <tr>
      <th>${escapeHTML(label)}</th>
      <td>${escapeHTML(value || "Non renseigné")}</td>
    </tr>
  `;

  const printableDocuments = isSasu
    ? documents.filter(
        (document) =>
          asArray(document.legalForms).includes("sasu") &&
          document.id !== "sasu_parent_authorization"
      )
    : documents.filter((document) => !asArray(document.legalForms).length);

  const specificSections = isSasu
    ? `
        <h2>Capital</h2>
        <table>
          ${row("Capital social", sasuCapital.capitalAmount ? `${sasuCapital.capitalAmount} €` : "")}
          ${row("Apport en numéraire", sasuCapital.cashContribution ? `${sasuCapital.cashContribution} €` : "")}
          ${row("Apport en nature", sasuCapital.inKindContribution ? `${sasuCapital.inKindContribution} €` : "")}
          ${row("Actions", sasuCapital.sharesCount)}
          ${row("Valeur nominale", sasuCapital.nominalValue ? `${sasuCapital.nominalValue} €` : "")}
          ${row("Numéraire libéré", sasuCapital.cashReleasedPercent ? `${sasuCapital.cashReleasedPercent} %` : "")}
        </table>

        <h2>Présidence</h2>
        <table>
          ${row("Nomination", sasuPresidency.appointmentMethod === "separate_act" ? "Acte séparé" : "Dans les statuts")}
          ${row("Date de nomination", sasuPresidency.appointmentDate)}
          ${row("Durée du mandat", sasuPresidency.termType === "fixed" ? "Durée déterminée" : "Sans durée déterminée")}
          ${row("Fin du mandat", sasuPresidency.termEndDate)}
          ${row("Rémunération", sasuPresidency.remunerationStatus)}
          ${row("Pouvoirs / limites", sasuPresidency.powersNotes)}
        </table>

        <h2>Statuts</h2>
        <table>
          ${row("Durée de la société", sasuStatutes.durationYears ? `${sasuStatutes.durationYears} ans` : "")}
          ${row("Clôture de l’exercice", sasuStatutes.fiscalYearEnd)}
          ${row("Date de signature", sasuStatutes.signedDate)}
          ${row("Statuts signés", sasuStatutes.signed ? "Oui" : "Non")}
          ${row("Actes avant immatriculation", sasuStatutes.actsBeforeRegistration)}
          ${row("Notes", sasuStatutes.notes)}
        </table>

        <h2>Finalisation</h2>
        <table>
          ${row("Bénéficiaire effectif préparé", sasuFinalization.beneficialOwnerPrepared ? "Oui" : "Non")}
          ${row("Annonce légale vérifiée", sasuFinalization.legalNoticePrepared ? "Oui" : "Non")}
          ${row("Dossier relu", sasuFinalization.readyForGuichet ? "Oui" : "Non")}
          ${row("Notes", sasuFinalization.reviewNotes)}
        </table>
      `
    : `
        <h2>Formalité</h2>
        <table>
          ${row("Statut", registration.status)}
          ${row("Référence", registration.guichetReference)}
          ${row("Date de dépôt", registration.submittedAt)}
          ${row("SIREN", registration.siren)}
          ${row("SIRET", registration.siret)}
          ${row("Code NAF/APE", registration.nafCode)}
          ${row("Compte Urssaf", registration.urssafAccountNumber)}
        </table>
      `;

  const finalAuthorizationPrintSection =
    isSasu &&
    workflow.isMinor &&
    sasuAuthorization.legalStatus === "non_emancipated"
      ? `
        <section class="authorization-print-page">
          <h2>Autorisation du représentant légal</h2>
          <p>
            Document préparé par Founder pour être complété et signé à la main après impression.
          </p>
          <table>
            ${row("Situation", "Mineur non émancipé")}
            ${row("Représentant légal 1", sasuAuthorization.representative1Name)}
            ${row("Représentant légal 2", sasuAuthorization.representative2Name)}
            ${row("Type d’autorisation", sasuAuthorization.authorizationType === "notarial" ? "Acte notarié" : "Écrit sous signature privée")}
            ${row("Actes d’administration autorisés", sasuAuthorization.authorizedActs)}
          </table>
          <div class="handwritten-authorization">
            <p><strong>À compléter à la main par le ou les représentants légaux :</strong></p>
            <p>Lieu de signature : ________________________________________________</p>
            <p>Date de l’autorisation : ______ / ______ / __________</p>
            <p>Signature du ou des représentants légaux :</p>
            <div class="signature-space"></div>
          </div>
        </section>
      `
      : "";

  popup.document.write(`
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>Dossier administratif Sonara Pack</title>
        <style>
          body{font-family:Arial,sans-serif;margin:36px;color:#111}
          h1,h2{margin-bottom:8px}
          table{width:100%;border-collapse:collapse;margin:14px 0 28px}
          th,td{padding:9px 10px;border:1px solid #bbb;text-align:left;vertical-align:top}
          th{width:35%;background:#f2f2f2}
          .warning{padding:12px;border:1px solid #d5a300;background:#fff8d8}
          .handwritten-authorization{margin:18px 0 30px;padding:16px;border:1px solid #bbb;break-inside:avoid}
          .handwritten-authorization p{margin:10px 0}
          .signature-space{height:110px;border-bottom:1px solid #777;margin-top:12px}
          @media print{
            button{display:none}
            .authorization-print-page{break-before:page}
          }
        </style>
      </head>
      <body>
        <h1>Dossier administratif — Sonara Pack${isSasu ? " · SASU" : ""}</h1>
        <p class="warning">
          Récapitulatif privé de préparation. Founder n’effectue aucune déclaration et
          ce document ne remplace aucun justificatif officiel.
        </p>

        <h2>Parcours</h2>
        <table>
          ${row("Étape actuelle", workflow.currentStage)}
          ${row("Prochaine action", workflow.nextAction)}
        </table>

        <h2>Identité</h2>
        <table>
          ${row("Rôle", profile.declarantRole)}
          ${row("Prénom", profile.firstname)}
          ${row("Nom", profile.lastname)}
          ${row("Date de naissance", profile.birthDate)}
          ${row("Lieu de naissance", `${profile.birthCity || ""} ${profile.birthCountry || ""}`.trim())}
          ${row("Nationalité", profile.nationality)}
          ${row("E-mail", profile.email)}
          ${row("Téléphone", profile.phone)}
          ${row("Adresse", `${profile.addressLine1 || ""} ${profile.addressLine2 || ""}`.trim())}
          ${row("Ville", `${profile.postalCode || ""} ${profile.city || ""}`.trim())}
          ${row("Pays", profile.country)}
        </table>

        <h2>Entreprise</h2>
        <table>
          ${row("Nom commercial", business.businessName)}
          ${row("Nom légal", business.legalName)}
          ${row("Forme", business.legalForm)}
          ${row("Activité", business.activityDescription)}
          ${row("Date de début", business.startDate)}
          ${row("Siège", business.headquartersAddress)}
          ${row("Site", business.website)}
        </table>

        ${specificSections}

        <h2>Pièces</h2>
        <table>
          ${printableDocuments.map((document) => row(
            document.label,
            `${administrationStatusLabel(document.status)}${document.file ? ` — ${document.file.name}` : ""}`
          )).join("")}
        </table>

        ${finalAuthorizationPrintSection}

        <button onclick="window.print()">Imprimer / enregistrer en PDF</button>
      </body>
    </html>
  `);

  popup.document.close();
}

function administrationDocumentRow(document) {
  return `
    <form
      class="administration-document-row"
      data-document-id="${escapeHTML(document.id)}"
    >
      <div class="administration-document-title">
        <strong>${escapeHTML(document.label)}</strong>

        <span class="administration-required ${document.required ? "is-required" : ""}">
          ${document.required ? "Requis" : "Selon le dossier"}
        </span>

        <span class="administration-file-meta">
          ${
            document.file
              ? `${escapeHTML(document.file.name)} · ${administrationFileSize(document.file.size)}`
              : "Aucun fichier enregistré"
          }
        </span>
      </div>

      <select name="status" aria-label="État de la pièce">
        <option value="missing" ${selectedAttribute(document.status, "missing")}>Manquant</option>
        <option value="ready" ${selectedAttribute(document.status, "ready")}>Prêt</option>
        <option value="submitted" ${selectedAttribute(document.status, "submitted")}>Déposé</option>
        <option value="accepted" ${selectedAttribute(document.status, "accepted")}>Accepté</option>
        <option value="rejected" ${selectedAttribute(document.status, "rejected")}>À corriger</option>
      </select>

      <input
        name="notes"
        maxlength="1000"
        value="${escapeHTML(document.notes || "")}"
        placeholder="Note ou référence"
      >

      <label class="administration-file-picker">
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          data-administration-file
        >
        <span>
          <i data-lucide="upload"></i>
          ${document.file ? "Remplacer" : "Ajouter le fichier"}
        </span>
      </label>

      ${
        document.file
          ? `
            <button class="secondary-button" type="button" data-open-administration-file>
              Voir
            </button>

            <button
              class="administration-delete-file"
              type="button"
              data-delete-administration-file
              aria-label="Supprimer le fichier"
            >
              <i data-lucide="trash-2"></i>
            </button>
          `
          : ""
      }

      <button class="secondary-button" type="submit">
        Enregistrer l’état
      </button>
    </form>
  `;
}

function administrationObligationRow(
  obligation
) {
  const displayStatus =
    obligation.effectiveStatus ||
    obligation.status;

  return `
    <form
      class="administration-obligation-row ${displayStatus === "overdue" ? "is-overdue" : ""}"
      data-obligation-id="${escapeHTML(obligation.id)}"
    >
      <div class="administration-obligation-main">
        <div class="administration-obligation-head">
          <span class="administration-type">
            ${escapeHTML(administrationTypeLabel(obligation.type))}
          </span>

          <span class="administration-status status-${escapeHTML(displayStatus)}">
            ${escapeHTML(administrationStatusLabel(displayStatus))}
          </span>
        </div>

        <strong>${escapeHTML(obligation.title)}</strong>

        <small>
          ${escapeHTML(
            obligation.dueDate
              ? `Échéance : ${formatAdministrationDate(obligation.dueDate)}`
              : "Aucune échéance renseignée"
          )}
          ${obligation.reference ? ` · Réf. ${escapeHTML(obligation.reference)}` : ""}
        </small>

        ${obligation.notes ? `<p>${escapeHTML(obligation.notes)}</p>` : ""}
      </div>

      <div class="administration-obligation-amount">
        <strong>${formatAdministrationMoney(obligation.amount)}</strong>
        <small>${escapeHTML(obligation.source === "urssaf_api" ? "Urssaf API" : obligation.source === "import" ? "Import" : "Saisie manuelle")}</small>
      </div>

      <select
        name="status"
        aria-label="État de la demande"
      >
        <option
          value="todo"
          ${selectedAttribute(obligation.status, "todo")}
        >
          À traiter
        </option>

        <option
          value="scheduled"
          ${selectedAttribute(obligation.status, "scheduled")}
        >
          Planifié
        </option>

        <option
          value="paid"
          ${selectedAttribute(obligation.status, "paid")}
        >
          Payé
        </option>

        <option
          value="resolved"
          ${selectedAttribute(obligation.status, "resolved")}
        >
          Résolu
        </option>

        <option
          value="cancelled"
          ${selectedAttribute(obligation.status, "cancelled")}
        >
          Annulé
        </option>
      </select>

      <button
        class="secondary-button administration-save-obligation"
        type="submit"
      >
        Mettre à jour
      </button>

      <button
        class="administration-delete-obligation"
        type="button"
        aria-label="Supprimer la demande"
        title="Supprimer"
      >
        <i data-lucide="trash-2"></i>
      </button>
    </form>
  `;
}

async function renderAdministrationUrssaf() {
  content.innerHTML = `
    <section class="loading-card">
      Chargement de la dashboard…
    </section>
  `;

  try {
    const response = asObject(await api("/administration"));
    rememberEnvironment(response);

    const administration = asObject(response.administration);
    const business = asObject(administration.business);
    const profile = asObject(administration.profile);
    const legalState = asObject(administration.legalState);
    const financialSummary = asObject(administration.financialControlSummary);
    const calculation = asObject(financialSummary.calculation);
    const period = asObject(financialSummary.period);
    const forecast = asArray(financialSummary.forecast);
    const warnings = asArray(financialSummary.warnings);
    const summary = asObject(administration.summary);

    const environment = normalizeEnvironment(state.environment);
    const isMain = environment === "main";
    const isSimulation = !isMain;
    const mainVerified = legalState.active === true;
    const dashboardVisible = isSimulation || mainVerified;
    const legalForm = String(
      mainVerified ? legalState.legalForm : business.legalForm || ""
    );
    const legalFormLabel = {
      micro_entreprise: "Micro-entreprise",
      ei: "Entreprise individuelle",
      eurl: "EURL",
      sasu: "SASU",
      other: "Autre"
    }[legalForm] || "Non définie";

    const birthDate = String(profile.birthDate || "");
    const age = birthDate
      ? Math.max(0, Math.floor((Date.now() - new Date(`${birthDate}T12:00:00`).getTime()) / 31557600000))
      : null;
    const minorNotice = legalForm === "sasu" && age !== null && age < 18;

    const moneyFromCents = (value) => formatAdministrationMoney(asNumber(value) / 100);
    const forecastCard = (item) => `
      <article class="financial-forecast-card is-${escapeHTML(item.status || "estimated")}">
        <div class="financial-forecast-card-head">
          <strong>${escapeHTML(item.label || "Obligation")}</strong>
          <span>${escapeHTML(financialForecastStatusLabel(item.status))}</span>
        </div>
        <b>${moneyFromCents(item.amountCents)}</b>
        <small>${escapeHTML(item.detail || "")}</small>
        ${item.dueDate ? `<em>Échéance estimée : ${formatAdministrationDate(item.dueDate)}</em>` : ""}
      </article>
    `;

    updateAdministrationBadge(summary);

    content.innerHTML = `
      <button
        class="administration-back-button"
        type="button"
        data-administration-back
      >
        <i data-lucide="arrow-left"></i>
        Administration
      </button>

      <section class="hero-panel administration-hero founder-obligations-hero">
        <div>
          <p class="eyebrow">Administration · Obligations</p>
          <h2>${isMain ? "Dashboard réelle" : `Dashboard de simulation ${environmentLabel(environment)}`}</h2>
          <p>
            ${isMain
              ? "Founder vérifie l'existence réelle de l'entreprise puis calcule des provisions à partir des finances MAIN."
              : `Aucune déclaration réelle ici. Founder utilise uniquement les données ${environmentLabel(environment)} pour simuler les montants.`}
          </p>
        </div>
        <span class="financial-control-mode ${isMain ? (mainVerified ? "is-real" : "is-locked") : "is-simulation"}">
          ${isMain ? (mainVerified ? "MAIN · RÉEL" : "MAIN · À VÉRIFIER") : `${environmentLabel(environment)} · SIMULATION`}
        </span>
      </section>

      ${isMain && !mainVerified ? `
        <section class="panel founder-registration-check">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Vérification de l'entreprise</p>
              <h3>Est-ce que l'entreprise existe réellement ?</h3>
              <p class="muted">
                Entre le SIREN ou le SIRET obtenu après ta vraie formalité. Founder MAIN interroge
                l'API publique française et ne débloque la dashboard réelle que si l'entreprise est retrouvée.
              </p>
            </div>
            <i data-lucide="badge-check"></i>
          </div>

          <div class="founder-declaration-entry">
            <div class="founder-declaration-entry-copy">
              <span class="founder-declaration-step">1</span>
              <div>
                <strong>Créer officiellement l’entreprise</strong>
                <p>
                  La déclaration réelle se fait uniquement sur le Guichet unique officiel.
                  Founder ne transmet aucune formalité à ta place.
                </p>
              </div>
            </div>
            <a
              class="founder-government-link"
              href="https://formalites.entreprises.gouv.fr/declarer.php"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i data-lucide="landmark"></i>
              <span>Se déclarer sur le Guichet unique</span>
              <i data-lucide="external-link"></i>
            </a>
          </div>

          <div class="founder-registration-verification-title">
            <span class="founder-declaration-step">2</span>
            <div>
              <strong>Activer Founder MAIN après immatriculation</strong>
              <p>Une fois ton SIREN ou SIRET reçu, Founder peut vérifier l’entreprise et débloquer la dashboard réelle.</p>
            </div>
          </div>

          <form class="founder-registration-check-form" id="founderLegalVerificationForm">
            <label>
              SIREN ou SIRET
              <input
                name="identifier"
                inputmode="numeric"
                autocomplete="off"
                placeholder="9 chiffres ou 14 chiffres"
                maxlength="14"
                required
              />
            </label>
            <button class="primary-button" type="submit">
              <i data-lucide="search-check"></i>
              Vérifier ma déclaration
            </button>
          </form>

          <div class="financial-dashboard-lock-rule">
            <span><i data-lucide="shield-check"></i> Aucun bouton Founder ne crée l'entreprise.</span>
            <span><i data-lucide="database"></i> La vérification se fait à partir d'un identifiant officiel déjà attribué.</span>
            <span><i data-lucide="git-branch"></i> LOCAL et TEST restent des simulations indépendantes.</span>
          </div>
        </section>
      ` : ""}

      ${dashboardVisible ? `
        <section class="financial-simulation-banner ${isMain ? "is-real-dashboard" : ""}">
          <i data-lucide="${isMain ? "shield-check" : "flask-conical"}"></i>
          <div>
            <strong>${isMain ? `${escapeHTML(legalState.companyName || business.legalName || business.businessName || "Entreprise")} · ${escapeHTML(legalFormLabel)}` : `${escapeHTML(legalFormLabel)} · simulation ${environmentLabel(environment)}`}</strong>
            <p>
              ${isMain
                ? `SIREN ${escapeHTML(legalState.siren || "—")} · données financières MAIN uniquement.`
                : `Les montants ci-dessous ne sont pas des dettes réelles et ne quittent jamais ${environmentLabel(environment)}.`}
            </p>
          </div>
        </section>

        ${minorNotice ? `
          <section class="panel founder-minor-tax-note">
            <div>
              <p class="eyebrow">SASU · dirigeant mineur</p>
              <h3>Le fait d'être mineur ne crée pas un pourcentage spécial.</h3>
              <p>
                Founder sépare les impôts de la société de tes cotisations personnelles :
                l'IS dépend du résultat de la SASU ; les cotisations de président dépendent d'une
                éventuelle rémunération, pas de ton âge ni du chiffre d'affaires brut.
              </p>
            </div>
          </section>
        ` : ""}

        <section class="administration-metrics founder-obligation-metrics">
          <article>
            <span>Revenus Sonara</span>
            <strong>${moneyFromCents(calculation.commissionAfterRefundsCents)}</strong>
            <small>Part réellement attribuée à Sonara après remboursements</small>
          </article>
          <article>
            <span>Résultat provisoire</span>
            <strong>${moneyFromCents(calculation.economicNetCents)}</strong>
            <small>${period.start && period.end ? `${formatAdministrationDate(period.start)} → ${formatAdministrationDate(period.end)}` : "Période courante"}</small>
          </article>
          <article class="is-alert">
            <span>À mettre de côté</span>
            <strong>${moneyFromCents(calculation.protectedReserveCents)}</strong>
            <small>Provision estimée, pas montant officiel</small>
          </article>
          <article>
            <span>Disponible après réserve</span>
            <strong>${moneyFromCents(calculation.availableAfterReserveCents)}</strong>
            <small>Estimation Founder</small>
          </article>
        </section>

        <section class="panel founder-obligations-breakdown">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Calcul intelligent</p>
              <h3>Ce que Founder estime devoir protéger</h3>
              <p class="muted">
                Le moteur lit Finances & statistiques de cet environnement et recalcule automatiquement.
              </p>
            </div>
            <button class="secondary-button" type="button" data-obligations-refresh>
              <i data-lucide="refresh-cw"></i>
              Recalculer
            </button>
          </div>

          <div class="financial-forecast-grid">
            ${forecast.length
              ? forecast.map(forecastCard).join("")
              : `<article class="financial-forecast-card"><strong>Aucune estimation disponible</strong><small>La forme juridique ou les règles nécessaires ne sont pas encore définies.</small></article>`}
          </div>

          ${warnings.length ? `
            <div class="financial-dashboard-lock-rule founder-calculation-warnings">
              ${warnings.map((warning) => `<span><i data-lucide="info"></i>${escapeHTML(warning)}</span>`).join("")}
            </div>
          ` : ""}
        </section>
      ` : `
        <section class="panel financial-dashboard-locked">
          <div class="financial-dashboard-lock-icon">
            <i data-lucide="lock-keyhole"></i>
          </div>
          <div class="financial-dashboard-lock-copy">
            <p class="eyebrow">Dashboard MAIN</p>
            <h3>En attente d'une entreprise vérifiée.</h3>
            <p>
              Rien n'est calculé comme réel tant que Founder n'a pas retrouvé ton SIREN/SIRET dans le registre public.
            </p>
          </div>
        </section>
      `}
    `;

    document
      .querySelector("[data-administration-back]")
      ?.addEventListener("click", renderAdministration);

    document
      .querySelector("[data-obligations-refresh]")
      ?.addEventListener("click", async () => {
        await refreshAdministrationSection(renderAdministrationUrssaf);
        showToast(isMain ? "Dashboard MAIN recalculée." : "Simulation recalculée.");
      });

    const verificationForm = document.getElementById("founderLegalVerificationForm");
    verificationForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(verificationForm instanceof HTMLFormElement)) return;

      const identifier = String(
        new FormData(verificationForm).get("identifier") || ""
      ).replace(/\D/g, "");
      const button = verificationForm.querySelector("button[type='submit']");

      try {
        if (button) button.disabled = true;
        const result = asObject(await api("/legal-state/verify", {
          method: "POST",
          body: JSON.stringify({ identifier })
        }));
        state.legalStateActive = true;
        showToast(result.message || "Entreprise vérifiée.");
        await renderAdministrationUrssaf();
      } catch (error) {
        showToast(error.message || "Vérification impossible.", "error");
      } finally {
        if (button) button.disabled = false;
      }
    });

    icons();
  } catch (error) {
    content.innerHTML = `
      <section class="error-card">
        <strong>Dashboard indisponible</strong>
        <p>${escapeHTML(error.message || "Erreur inconnue")}</p>
        <button class="secondary-button" type="button" data-obligations-retry>Réessayer</button>
      </section>
    `;
    document
      .querySelector("[data-obligations-retry]")
      ?.addEventListener("click", renderAdministrationUrssaf);
  }
}

function seoRadarStatusLabel(code = "") {
  return {
    INDEXED: "Indexed",
    WAITING_FOR_CRAWL: "Discovered",
    CRAWLED_NOT_INDEXED: "Crawled, not indexed",
    TECHNICAL_ERROR: "Technical problem",
    PENDING_CHECK: "Pending check"
  }[String(code || "").toUpperCase()] || "Pending check";
}

function seoRadarStatusClass(code = "") {
  return {
    INDEXED: "is-green",
    WAITING_FOR_CRAWL: "is-blue",
    CRAWLED_NOT_INDEXED: "is-orange",
    TECHNICAL_ERROR: "is-red"
  }[String(code || "").toUpperCase()] || "is-gray";
}

function seoRadarValue(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text ? escapeHTML(text) : fallback;
}

function seoRadarBool(value, yes = "Allowed", no = "Blocked") {
  if (value === true) return `<span class="seo-radar-inline-ok">${escapeHTML(yes)}</span>`;
  if (value === false) return `<span class="seo-radar-inline-error">${escapeHTML(no)}</span>`;
  return "—";
}

function seoRadarPageMarkup(page = {}) {
  const index = asObject(page.googleInspection);
  const local = asObject(page.localAudit);
  const status = asObject(page.status);
  const reasons = Array.isArray(status.reasons) ? status.reasons : [];
  const localIssues = Array.isArray(local.issues) ? local.issues : [];
  const similarity = Array.isArray(local.similaritySignals) ? local.similaritySignals : [];
  const googleSitemaps = Array.isArray(index.sitemap) ? index.sitemap : [];
  const referring = Array.isArray(index.referringUrls) ? index.referringUrls : [];
  const declaredCanonical = index.userCanonical || local.canonical || page.expectedCanonical || "";
  const googleCanonical = index.googleCanonical || "";
  const reasonText = [...new Set([...reasons, ...localIssues, ...similarity])].filter(Boolean);
  const code = status.code || "PENDING_CHECK";

  return `
    <article class="seo-radar-page">
      <div class="seo-radar-page-head">
        <div>
          <p class="eyebrow">${escapeHTML(page.kind || "page")} ${page.artist ? `· ${escapeHTML(page.artist)}` : ""}</p>
          <h3>${escapeHTML(page.title || page.sourceId || "Page publique")}</h3>
          <a href="${escapeHTML(page.url || "#")}" target="_blank" rel="noopener">${escapeHTML(page.url || "")}</a>
        </div>
        <span class="seo-radar-status ${seoRadarStatusClass(code)}">${escapeHTML(status.label || seoRadarStatusLabel(code))}</span>
      </div>
      <div class="seo-radar-detail-grid">
        <div><span>Coverage state</span><strong>${seoRadarValue(index.coverageState)}</strong></div>
        <div><span>Last crawl</span><strong>${index.lastCrawlTime ? formatDate(index.lastCrawlTime) : "Jamais / inconnu"}</strong></div>
        <div><span>robots.txt Google</span><strong>${seoRadarValue(index.robotsTxtState, local.robotsAllowed === false ? "BLOCKED" : local.robotsAllowed === true ? "ALLOWED" : "—")}</strong></div>
        <div><span>Indexing Google</span><strong>${seoRadarValue(index.indexingState)}</strong></div>
        <div><span>Fetch Google</span><strong>${seoRadarValue(index.pageFetchState)}</strong></div>
        <div><span>HTTP Sonara</span><strong>${local.httpStatus || "—"}</strong></div>
        <div><span>Sonara canonical</span><strong title="${escapeHTML(declaredCanonical)}">${seoRadarValue(declaredCanonical)}</strong></div>
        <div><span>Google canonical</span><strong title="${escapeHTML(googleCanonical)}">${seoRadarValue(googleCanonical)}</strong></div>
        <div><span>Sitemap Google</span><strong>${googleSitemaps.length ? `${googleSitemaps.length} détecté(s)` : local.sitemapDetected ? "Sonara: présent" : "Non détecté"}</strong></div>
        <div><span>Liens entrants Sonara</span><strong>${local.incomingLinkDetected === true ? "Détectés" : local.incomingLinkDetected === false ? "Manquants" : "—"}</strong></div>
        <div><span>Image SEO</span><strong>${local.imageSeoReady === true ? "Ready ✅" : local.imageSeoReady === false ? escapeHTML(local.imageSeoReason || "À corriger") : "—"}</strong></div>
        <div><span>Audit Sonara</span><strong>${local.ready === true ? "Ready ✅" : local.ready === false ? "À corriger" : "En attente"}</strong></div>
      </div>
      ${reasonText.length ? `<div class="seo-radar-reasons"><strong>Diagnostic</strong><span>${reasonText.map(escapeHTML).join(" · ")}</span></div>` : ""}
      ${referring.length ? `<details class="seo-radar-details"><summary>Referring URLs Google (${referring.length})</summary>${referring.slice(0, 8).map((url) => `<code>${escapeHTML(url)}</code>`).join("")}</details>` : ""}
      <button class="secondary-button seo-radar-refresh-one" type="button" data-seo-refresh-url="${escapeHTML(page.url || "")}"><i data-lucide="refresh-cw"></i><span>Actualiser cette URL</span></button>
    </article>`;
}

async function renderSeoRadar() {
  content.innerHTML = `<section class="loading-card">Chargement du SEO Radar…</section>`;
  try {
    const [radar, organic, statistics] = await Promise.all([
      api("/seo-radar").then(asObject),
      api("/organic-visibility").then(asObject).catch(() => ({})),
      api("/sonara-pack/statistics").then(asObject).catch(() => ({}))
    ]);
    rememberEnvironment({ connectedEnvironment: radar.connectedEnvironment || radar.environment });
    const summary = asObject(radar.summary);
    const google = asObject(radar.google);
    const performance = asObject(google.performance);
    const googlePerformanceAvailable = performance.available === true;
    const googleMetric = (value) => googlePerformanceAvailable
      ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(asNumber(value))
      : "—";
    const attribution = asObject(organic.attribution);
    const statsDownloads = asObject(statistics.downloads);
    const growth = asObject(statistics.growth);
    const currentGrowth = asObject(growth.current);
    const siteAudit = asObject(radar.siteAudit);
    const pages = Array.isArray(radar.pages) ? radar.pages : [];
    const total = asNumber(summary.total);

    content.innerHTML = `
      <section class="hero-panel seo-radar-hero">
        <div>
          <p class="eyebrow">SEO / Google Index ${environmentBadge(radar.connectedEnvironment || radar.environment)}</p>
          <h2>Radar d’indexation Sonara Pack.</h2>
          <p>Google Search Console + audit technique Sonara. L’API lit l’état Google ; elle ne force pas l’indexation.</p>
        </div>
        <button class="primary-button" type="button" data-seo-refresh-all><i data-lucide="refresh-cw"></i><span>Actualiser Google</span></button>
      </section>

      ${google.enabled === false ? `<section class="seo-radar-warning"><strong>${radar.environment === "main" ? "OAuth Search Console à connecter" : "Inspection Google désactivée hors Main"}</strong><span>${radar.environment === "main" ? "Configurer les variables Render Google Search Console. L’audit Sonara reste actif." : "Local/Test ne contactent jamais Search Console réel."}</span></section>` : ""}

      <section class="seo-radar-summary">
        <article><span>Indexed</span><strong>${asNumber(summary.indexed)} / ${total}</strong></article>
        <article><span>Waiting crawl</span><strong>${asNumber(summary.waitingCrawl)}</strong></article>
        <article><span>Crawled not indexed</span><strong>${asNumber(summary.crawledNotIndexed)}</strong></article>
        <article><span>Technical errors</span><strong>${asNumber(summary.technicalErrors)}</strong></article>
        <article><span>Images SEO ready</span><strong>${asNumber(summary.imagesSeoReady)}</strong></article>
      </section>

      <section class="panel seo-radar-funnel">
        <div class="panel-heading"><div><p class="eyebrow">Acquisition · sources réelles</p><h3>De l’impression au retour.</h3></div></div>
        <div class="seo-radar-funnel-grid">
          <div><span>Impressions Google · ${asNumber(performance.periodDays || 28)} j</span><strong>${googleMetric(performance.impressions)}</strong></div>
          <div><span>Clicks Google · ${asNumber(performance.periodDays || 28)} j</span><strong>${googleMetric(performance.clicks)}</strong></div>
          <div><span>Visiteurs externes · cumul</span><strong>${asNumber(attribution.visitors)}</strong></div>
          <div><span>Signups attribués · cumul</span><strong>${asNumber(attribution.attributedSignups)}</strong></div>
          <div><span>Contenus obtenus · cumul</span><strong>${asNumber(statsDownloads.total)}</strong></div>
          <div><span>Returning users · 7 j</span><strong>${asNumber(currentGrowth.returningUsers)}</strong></div>
        </div>
        <p class="muted">${googlePerformanceAvailable
          ? `Search Console réel · dernière lecture ${escapeHTML(formatDate(performance.fetchedAt))}.`
          : `Google impressions/clics non disponibles actuellement : ${escapeHTML(performance.reason || google.reason || "Search Console non connectée")}.`} Les autres niveaux n’utilisent pas tous la même période : aucun taux de conversion global n’est déduit de ce bloc.</p>
      </section>

      <section class="panel seo-radar-site-audit">
        <div><p class="eyebrow">Contrôle Sonara</p><h3>Sitemap + robots</h3></div>
        <div class="seo-radar-site-audit-grid">
          <span>robots.txt ${siteAudit.robotsHttpStatus === 200 ? "✅" : "⚠️"}</span>
          <span>Sitemap index → catalogue ${siteAudit.sitemapIndexHasCatalog ? "✅" : "⚠️"}</span>
          <span>Sitemap index → static ${siteAudit.sitemapIndexHasStatic ? "✅" : "⚠️"}</span>
          <span>URLs privées dans sitemap: ${Array.isArray(siteAudit.privateUrls) ? siteAudit.privateUrls.length : 0}</span>
          <span>URLs Local/Test dans sitemap Main: ${Array.isArray(siteAudit.foreignEnvironmentUrls) ? siteAudit.foreignEnvironmentUrls.length : 0}</span>
        </div>
      </section>

      <section class="seo-radar-list-head"><div><p class="eyebrow">Pages publiques</p><h3>${pages.length} URL(s) suivie(s)</h3></div></section>
      <section class="seo-radar-list">${pages.length ? pages.map(seoRadarPageMarkup).join("") : emptyState("Aucune page SEO", "Le catalogue public n’a encore fourni aucune URL au radar.")}</section>
    `;

    const refresh = async (urls = []) => {
      const buttons = document.querySelectorAll("[data-seo-refresh-all], [data-seo-refresh-url]");
      buttons.forEach((button) => { button.disabled = true; });
      try {
        await api("/seo-radar/refresh", { method: "POST", body: JSON.stringify({ urls }) });
        showToast("SEO Radar actualisé.");
        await renderSeoRadar();
      } catch (error) {
        showToast(error.message || "Actualisation SEO impossible.", "error");
        buttons.forEach((button) => { button.disabled = false; });
      }
    };
    document.querySelector("[data-seo-refresh-all]")?.addEventListener("click", () => refresh([]));
    document.querySelectorAll("[data-seo-refresh-url]").forEach((button) => button.addEventListener("click", () => refresh([button.dataset.seoRefreshUrl])));
    icons();
  } catch (error) {
    content.innerHTML = errorState(error.message || "SEO Radar indisponible.");
  }
}

async function renderPlanning() {
  try { const data = asObject(await api("/planning")); const day = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"][new Date().getDay()]; content.innerHTML = `<section class="hero-panel planning-hero"><div><p class="eyebrow">Aujourd’hui</p><h2>${day}</h2><div class="schedule-pills">${schedule[new Date().getDay()].map(x => `<span>${x}</span>`).join("")}</div></div><div class="level-card"><span>État</span><strong id="statePreview">${escapeHTML(data.founderState || "Focus")}</strong></div></section><form id="planningForm" class="planning-grid"><article class="panel"><label>État fondateur</label><select id="founderState"><option>Focus</option><option>Pression</option><option>Récupération</option><option>Lancement</option></select></article><article class="panel wide-panel"><label>Mission du jour</label><textarea id="mission" placeholder="La mission qui fait avancer Sonara">${escapeHTML(data.mission || "")}</textarea></article><article class="panel wide-panel"><label>Prochaine action concrète</label><input id="nextAction" value="${escapeHTML(data.nextAction || "")}" placeholder="Une action simple et précise"></article><article class="panel wide-panel"><label>Notes fondateur</label><textarea id="notes" placeholder="Décisions, blocages, idées…">${escapeHTML(data.notes || "")}</textarea></article><button class="primary-button save-plan" type="submit">Sauvegarder la salle de contrôle</button></form>`; document.getElementById("founderState").value = data.founderState || "Focus"; document.getElementById("planningForm").addEventListener("submit", async e => { e.preventDefault(); await api("/planning", { method: "PUT", body: JSON.stringify({ founderState: document.getElementById("founderState").value, mission: document.getElementById("mission").value, nextAction: document.getElementById("nextAction").value, notes: document.getElementById("notes").value }) }); showToast("Salle de contrôle sauvegardée."); }); icons(); }
  catch (error) { content.innerHTML = errorState(error.message); }
}

const views = {
  dashboard: [
    "Vue d’ensemble",
    "Sonara Pack",
    renderDashboard
  ],
  statistics: [
    "Statistiques",
    "Sonara Pack",
    renderSonaraPackStatistics
  ],
  seo: [
    "SEO / Google Index",
    "Sonara Pack",
    renderSeoRadar
  ],
  packs: [
    "Packs",
    "Effet réseau Sonara",
    renderPackCatalog
  ],
  notifications: [
    "Notifications",
    "Centre d’alerte",
    renderNotifications
  ],
  support: [
    "Support",
    "Utilisateurs",
    renderSupport
  ],
  feedback: [
    "Feedback",
    "Voix des utilisateurs",
    renderFeedback
  ],
  moderation: [
    "Modération",
    "Sécurité Sonara",
    renderModeration
  ],
  staff: [
    "Staff",
    "Accès privés",
    renderStaff
  ],
  administration: [
    "Administration",
    "URSSAF et formalités",
    renderAdministration
  ],
  planning: [
    "Planning",
    "Sonara Pack",
    renderPlanning
  ]
};
const SONARA_PACK_VIEWS = new Set([
  "dashboard",
  "statistics",
  "seo",
  "packs",
  "notifications",
  "support",
  "feedback",
  "moderation",
  "staff",
  "planning"
]);

function renderView(view) {
  if (view !== "packs") stopFounderPackPreview();
  if (view !== "moderation") {
    state.moderationLoadId += 1;
    stopFounderAccountsLiveRefresh();
  }
  state.view = view;
  const selected = views[view] || views.dashboard;
  const productGroup = document.querySelector('[data-nav-product="sonara-pack"]');

  pageTitle.textContent = selected[0];
  pageEyebrow.textContent = selected[1];
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  if (productGroup) {
    productGroup.classList.toggle("is-current", SONARA_PACK_VIEWS.has(view));
    if (SONARA_PACK_VIEWS.has(view)) {
      productGroup.classList.add("is-open");
      document.getElementById("sonaraPackNavToggle")?.setAttribute("aria-expanded", "true");
    } else {
      productGroup.classList.remove("is-open");
      document.getElementById("sonaraPackNavToggle")?.setAttribute("aria-expanded", "false");
    }
  }

  selected[2]();
  icons();
}

async function resetFounderView() {
  const resetButton = document.getElementById("resetFounderButton");
  const resetIcon = resetButton?.querySelector("svg, i");
  const selected = views[state.view] || views.dashboard;

  if (resetButton?.disabled) return;

  if (resetButton) {
    resetButton.disabled = true;
    resetButton.setAttribute("aria-busy", "true");
    resetButton.style.opacity = "0.55";
  }

  if (resetIcon) {
    resetIcon.style.transition = "transform 500ms ease";
    resetIcon.style.transform = "rotate(360deg)";
  }

  try {
    await Promise.all([
      refreshOverview(),
      Promise.resolve(selected[2]())
  ]);

    icons();
    showToast("Founder actualisé.");
  } catch (error) {
    showToast(error.message || "Actualisation impossible.", "error");
  } finally {
    if (resetButton) {
      resetButton.disabled = false;
      resetButton.removeAttribute("aria-busy");
      resetButton.style.opacity = "";
    }

    const currentIcon = resetButton?.querySelector("svg, i");
    if (currentIcon) {
      currentIcon.style.transition = "none";
      currentIcon.style.transform = "rotate(0deg)";
    }
  }
}

function installFeedbackNavigation() {
  if (document.querySelector('[data-view="feedback"]')) return;

  const supportButton = document.querySelector('[data-view="support"]');
  if (!supportButton?.parentElement) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = supportButton.className || "nav-button";
  button.dataset.view = "feedback";
  button.innerHTML = `
    <i data-lucide="message-square-more"></i>
    <span>Feedback</span>
  `;

  button.addEventListener("click", () => renderView("feedback"));
  supportButton.insertAdjacentElement("afterend", button);

  icons();
}

function installFounderResetButton() {
  if (document.getElementById("resetFounderButton")) return;

  const notificationBell = document.getElementById("notificationBell");
  if (!notificationBell?.parentElement) return;

  const button = document.createElement("button");
  button.id = "resetFounderButton";
  button.type = "button";
  button.className = notificationBell.className;
  button.setAttribute("aria-label", "Actualiser Founder");
  button.setAttribute("title", "Actualiser Founder sans recharger la page");
  button.innerHTML = `<i data-lucide="refresh-cw"></i>`;

  button.addEventListener("click", resetFounderView);
  notificationBell.parentElement.insertBefore(button, notificationBell);
  icons();
}

function installProductNavigation() {
  const group = document.querySelector('[data-nav-product="sonara-pack"]');
  const toggle = document.getElementById("sonaraPackNavToggle");
  if (!group || !toggle) return;

  toggle.addEventListener("click", () => {
    const open = !group.classList.contains("is-open");
    group.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function bindJumps() { document.querySelectorAll("[data-jump]").forEach(btn => btn.addEventListener("click", () => renderView(btn.dataset.jump))); }

installFeedbackNavigation();
installFounderResetButton();
installProductNavigation();

document.querySelectorAll(".nav-button").forEach(btn => btn.addEventListener("click", () => renderView(btn.dataset.view)));
document.getElementById("notificationBell").addEventListener("click", () => renderView("notifications"));
document.getElementById("logoutButton").addEventListener("click", () => logout());
const passwordInput = document.getElementById("founderPassword"); const loginButton = document.getElementById("loginButton");
passwordInput.addEventListener("input", () => { loginButton.disabled = passwordInput.value.length < 4; document.getElementById("loginError").textContent = ""; });
document.getElementById("togglePassword").addEventListener("click", e => { passwordInput.type = passwordInput.type === "password" ? "text" : "password"; e.currentTarget.innerHTML = `<i data-lucide="${passwordInput.type === "password" ? "eye" : "eye-off"}"></i>`; icons(); });
document.getElementById("loginForm").addEventListener("submit", async e => { e.preventDefault(); loginButton.disabled = true; try { const response = await fetch(`${API_BASE}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: passwordInput.value }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || "Accès refusé"); state.token = data.token; localStorage.setItem("founderSession", data.token); passwordInput.value = ""; showApp(); } catch (error) { document.getElementById("loginError").textContent = error.message; loginButton.disabled = false; } });
(async function bootstrap() { icons(); if (!state.token) return; try { await api("/session"); showApp(); } catch (_) { logout(false); } })();


