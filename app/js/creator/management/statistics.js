const creatorStatisticsApp = document.querySelector(".creator-statistics-app");

function creatorStatisticsProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
  } catch {
    return null;
  }
}

function creatorStatisticsAccountId() {
  const profile = creatorStatisticsProfile();
  return profile?.accountId || profile?.id || profile?.userId || null;
}

function escapeCreatorStatisticsHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCreatorStatisticsMoney(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function creatorStatisticsMediaUrl(value) {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(String(value))) return String(value);
  const clean = String(value).replace(/^\/+/, "");
  return `${API_URL}/uploads/${clean}`;
}

function formatCreatorStatisticsDate(value) {
  if (!value) return "Date non disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date non disponible";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

async function readCreatorStatisticsJson(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse serveur invalide (${response.status}).`);
  }
}

async function waitCreatorStatisticsApi(timeout = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (typeof API_URL !== "undefined" && API_URL) return API_URL;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Configuration API indisponible.");
}

function renderCreatorStatistics(data) {
  const stats = data.stats || {};
  const packs = Array.isArray(data.packs) ? data.packs : [];
  const recent = Array.isArray(data.recentAcquisitions) ? data.recentAcquisitions : [];
  const commercialActive = data.commercialState?.paymentsActive === true;
  const modeLabel = commercialActive ? "COMMERCIAL MODE" : "PRE-V1 · GRATUIT";
  const packById = new Map(packs.map((pack) => [String(pack.id), pack]));

  const packRows = [...packs]
    .sort((a, b) => Number(b.downloadCount || 0) - Number(a.downloadCount || 0))
    .map((pack) => `
      <article class="creator-pack-stat-row">
        <div class="creator-pack-stat-main">
          <span class="creator-pack-stat-cover">
            ${pack.coverPack
              ? `<img src="${escapeCreatorStatisticsHtml(creatorStatisticsMediaUrl(pack.coverPack))}" alt="">`
              : ""}
          </span>
          <span>
            <strong>${escapeCreatorStatisticsHtml(pack.title || pack.name || "Pack sans titre")}</strong>
            <small>${escapeCreatorStatisticsHtml(String(pack.status || "draft"))}</small>
          </span>
        </div>
        <div class="creator-stat-pack-metric"><span>Téléchargements</span><strong>${Number(pack.downloadCount || 0)}</strong></div>
        <div class="creator-stat-pack-metric"><span>Utilisateurs</span><strong>${Number(pack.uniqueDownloaders || 0)}</strong></div>
        ${commercialActive ? `
        <div class="creator-stat-pack-metric"><span>Ventes</span><strong>${Number(pack.salesCount || 0)}</strong></div>
        <div class="creator-stat-pack-metric"><span>Revenus</span><strong>${formatCreatorStatisticsMoney(pack.revenue || 0)}</strong></div>` : ""}
      </article>
    `).join("");

  const recentRows = recent.map((item) => {
    const pack = packById.get(String(item.packId));
    return `
      <article class="creator-recent-item">
        <div>
          <p><strong>${escapeCreatorStatisticsHtml(item.userLabel || "Utilisateur Sonara")}</strong> · ${item.acquisitionType === "track" ? "track" : "pack"}</p>
          <small>${escapeCreatorStatisticsHtml(pack?.title || "Pack Sonara")}</small>
        </div>
        <small>${escapeCreatorStatisticsHtml(formatCreatorStatisticsDate(item.acquiredAt))}</small>
      </article>
    `;
  }).join("");

  creatorStatisticsApp.innerHTML = `
    <div class="creator-statistics-topbar">
      <button class="creator-statistics-back" type="button">
        <i data-lucide="arrow-left"></i>
        Management
      </button>
      <span class="creator-statistics-mode">${modeLabel}</span>
    </div>

    <header class="creator-statistics-header">
      <p class="creator-statistics-label">SONARA CREATOR · STATISTIQUES</p>
      <h1>Performance artiste</h1>
      <p>${commercialActive
        ? "Suivez les téléchargements, les ventes et les revenus de vos packs."
        : "Suivez les téléchargements et l’audience de vos packs pendant la Pre-V1."}</p>
    </header>

    <section class="creator-statistics-grid">
      <article class="creator-stat-card"><span>Téléchargements</span><strong>${Number(stats.downloadCount || 0)}</strong><small>Packs et tracks acquis</small></article>
      <article class="creator-stat-card"><span>Packs téléchargés</span><strong>${Number(stats.packDownloadCount || 0)}</strong><small>Acquisitions du pack complet</small></article>
      <article class="creator-stat-card"><span>Tracks téléchargées</span><strong>${Number(stats.trackDownloadCount || 0)}</strong><small>Acquisitions individuelles</small></article>
      <article class="creator-stat-card"><span>Utilisateurs acquis</span><strong>${Number(stats.uniqueAudienceCount || 0)}</strong><small>Utilisateurs uniques touchés</small></article>
      ${commercialActive ? `
      <article class="creator-stat-card"><span>Ventes</span><strong>${Number(stats.salesCount || 0)}</strong><small>Paiements confirmés</small></article>
      <article class="creator-stat-card"><span>Revenus</span><strong>${formatCreatorStatisticsMoney(stats.revenue || 0)}</strong><small>Revenus artiste Stripe</small></article>` : ""}
    </section>

    <section class="creator-statistics-panel">
      <div class="creator-statistics-panel-heading">
        <div>
          <h2>Performance par pack</h2>
          <p>Les packs les plus téléchargés remontent automatiquement.</p>
        </div>
      </div>
      <div class="creator-pack-stat-list">
        ${packRows || `<p class="creator-statistics-empty">Aucun pack disponible pour le moment.</p>`}
      </div>
    </section>

    ${commercialActive ? `
    <section class="creator-statistics-panel">
      <div class="creator-statistics-panel-heading">
        <div>
          <h2>Commercial</h2>
          <p>Suivi du moteur de vente Sonara.</p>
        </div>
      </div>
      <div class="creator-commercial-lock"><i data-lucide="badge-check"></i><span>Commercial Mode actif : les ventes et revenus Stripe sont comptabilisés.</span></div>
    </section>` : ""}

    <section class="creator-statistics-panel">
      <div class="creator-statistics-panel-heading">
        <div>
          <h2>Acquisitions récentes</h2>
          <p>L’historique détaillé est enregistré à partir de cette version.</p>
        </div>
      </div>
      <div class="creator-recent-list">
        ${recentRows || `<p class="creator-statistics-empty">Les téléchargements déjà existants sont comptés dans les totaux. Leur ancienne date n’était simplement pas enregistrée.</p>`}
      </div>
    </section>
  `;

  creatorStatisticsApp.querySelector(".creator-statistics-back")?.addEventListener("click", () => {
    window.location.href = "/app/pages/creator/dashboard.html?mode=management";
  });

  if (window.lucide) lucide.createIcons();
  window.SonaraI18n?.refresh?.();
}

async function loadCreatorStatistics() {
  const profile = creatorStatisticsProfile();
  const accountId = creatorStatisticsAccountId();

  if (!profile || !accountId || !["artist", "both"].includes(String(profile.role || "").toLowerCase())) {
    window.location.href = "/app/pages/creator/dashboard.html";
    return;
  }

  creatorStatisticsApp.innerHTML = `<section class="creator-statistics-loading"><p>Chargement des statistiques Creator…</p></section>`;

  try {
    const apiUrl = await waitCreatorStatisticsApi();
    const response = await fetch(`${apiUrl}/api/creator/packs/${encodeURIComponent(accountId)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const data = await readCreatorStatisticsJson(response);

    if (!response.ok) {
      throw new Error(data.message || "Impossible de charger les statistiques.");
    }

    renderCreatorStatistics(data);
  } catch (error) {
    creatorStatisticsApp.innerHTML = `
      <section class="creator-statistics-error">
        <div>
          <h1>Statistiques indisponibles</h1>
          <p>${escapeCreatorStatisticsHtml(error.message)}</p>
          <button type="button">Réessayer</button>
        </div>
      </section>`;
    creatorStatisticsApp.querySelector("button")?.addEventListener("click", loadCreatorStatistics);
  }
}

loadCreatorStatistics();
