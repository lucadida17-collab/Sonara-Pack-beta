"use strict";

const managePackRoot = document.getElementById("managePackRoot");
const managePackParams = new URLSearchParams(window.location.search);
const managePackId = managePackParams.get("id");
const MANAGE_PACK_MIN_LOADING_TIME = 6000;
const MANAGE_PACK_REQUEST_TIMEOUT = 60000;
const managePackLoadingStartedAt = Date.now();

const MANAGE_PACK_PERMISSIONS = [
  ["personalProjects", "Projets personnels", "Utilisation dans ses propres créations personnelles."],
  ["commercialProjects", "Projets commerciaux", "Utilisation professionnelle ou commerciale."],
  ["monetization", "Monétisation", "Les projets intégrant les sons peuvent générer des revenus."],
  ["socialMedia", "Réseaux sociaux", "TikTok, Instagram, YouTube et plateformes similaires."],
  ["videoFilm", "Vidéos et films", "Films, courts métrages, documentaires et contenus vidéo."],
  ["advertising", "Publicités", "Campagnes publicitaires et contenus de marque."],
  ["gamesApps", "Jeux et applications", "Jeux vidéo, applications et expériences interactives."],
  ["podcasts", "Podcasts", "Podcasts, émissions et contenus audio parlés."],
  ["liveStreaming", "Live et streaming", "Diffusion en direct et rediffusions."],
  ["clientWork", "Travail client", "Créations réalisées pour le compte d’un client."],
  ["soundEditing", "Modification dans un DAW", "Découpe, effets, mixage et transformation créative."],
  ["unlimitedProjects", "Projets illimités", "La licence n’impose pas de limite de projets." ]
];

const MANAGE_PACK_RESTRICTIONS = [
  ["standaloneResale", "Revente isolée", "Interdiction de revendre les sons seuls ou presque inchangés."],
  ["redistribution", "Partage ou redistribution", "Interdiction de partager le pack ou ses fichiers sources."],
  ["musicPlatformUpload", "Upload musical autonome", "Interdiction de publier les sons seuls comme morceau sur une plateforme musicale."],
  ["contentIdRegistration", "Enregistrement Content ID", "Interdiction d’enregistrer les sons seuls dans un système de revendication automatique."],
  ["sublicensing", "Sous-licence", "Interdiction de revendre ou transférer la licence à une autre personne."],
  ["misleadingOwnership", "Fausse propriété", "Interdiction de prétendre être l’auteur original des sons." ]
];

const MANAGE_PACK_DEFAULT_LICENSE = {
  template: "sonara-standard",
  version: 1,
  name: "Licence standard Sonara",
  creditRequired: false,
  permissions: Object.fromEntries(MANAGE_PACK_PERMISSIONS.map(([key]) => [key, true])),
  restrictions: Object.fromEntries(MANAGE_PACK_RESTRICTIONS.map(([key]) => [key, true])),
  customPermissions: [],
  customRestrictions: [],
  customTerms: ""
};

function managePackEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function managePackProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
  } catch {
    return null;
  }
}

function managePackAccountId() {
  const profile = managePackProfile();
  return profile?.accountId || profile?.id || profile?.userId || null;
}

function managePackMediaUrl(value) {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(String(value))) return String(value);
  return `${API_URL}/uploads/${String(value).replace(/^\/+/, "")}`;
}

function managePackStatusLabel(status) {
  return {
    draft: "Brouillon",
    pending: "En attente de modération",
    approved: "Publié",
    rejected: "Refusé",
    suspended: "Suspendu",
    archived: "Archivé"
  }[String(status || "draft").toLowerCase()] || "Brouillon";
}

function managePackCloneLicense(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...MANAGE_PACK_DEFAULT_LICENSE,
    ...source,
    permissions: {
      ...MANAGE_PACK_DEFAULT_LICENSE.permissions,
      ...(source.permissions || {})
    },
    restrictions: {
      ...MANAGE_PACK_DEFAULT_LICENSE.restrictions,
      ...(source.restrictions || {})
    },
    customPermissions: Array.isArray(source.customPermissions) ? source.customPermissions : [],
    customRestrictions: Array.isArray(source.customRestrictions) ? source.customRestrictions : []
  };
}

async function managePackWaitForApi(timeout = 5000) {
  const startedAt = Date.now();
  while (typeof API_URL === "undefined" || !API_URL) {
    if (Date.now() - startedAt > timeout) throw new Error("Configuration API indisponible.");
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return API_URL;
}

async function managePackReadJson(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse serveur invalide (${response.status}).`);
  }
}

function managePackToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `manage-pack-toast manage-pack-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 260);
  }, 3300);
}

function managePackCheckboxGroup(items, values, type) {
  return items.map(([key, title, description]) => `
    <label class="license-choice ${values[key] ? "is-active" : ""}">
      <input type="checkbox" name="${type}_${key}" ${values[key] ? "checked" : ""}>
      <span class="license-choice-icon"><i data-lucide="${type === "permission" ? "check" : "ban"}"></i></span>
      <span>
        <strong>${managePackEscape(title)}</strong>
        <small>${managePackEscape(description)}</small>
      </span>
    </label>
  `).join("");
}

function managePackLineList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function managePackFormLicense(form) {
  const data = new FormData(form);
  return {
    template: "sonara-standard",
    name: String(data.get("licenseName") || "Licence standard Sonara").trim(),
    creditRequired: data.get("creditRequired") === "on",
    permissions: Object.fromEntries(
      MANAGE_PACK_PERMISSIONS.map(([key]) => [key, data.get(`permission_${key}`) === "on"])
    ),
    restrictions: Object.fromEntries(
      MANAGE_PACK_RESTRICTIONS.map(([key]) => [key, data.get(`restriction_${key}`) === "on"])
    ),
    customPermissions: String(data.get("customPermissions") || "")
      .split("\n").map((item) => item.trim()).filter(Boolean),
    customRestrictions: String(data.get("customRestrictions") || "")
      .split("\n").map((item) => item.trim()).filter(Boolean),
    customTerms: String(data.get("customTerms") || "").trim()
  };
}

function managePackPreviewItems(items, values, customItems) {
  return [
    ...items.filter(([key]) => values[key]).map(([, title]) => title),
    ...(Array.isArray(customItems) ? customItems : [])
  ];
}

function updateManagePackLicensePreview(form, version = 1) {
  const license = managePackFormLicense(form);
  const permissions = managePackPreviewItems(
    MANAGE_PACK_PERMISSIONS,
    license.permissions,
    license.customPermissions
  );
  const restrictions = managePackPreviewItems(
    MANAGE_PACK_RESTRICTIONS,
    license.restrictions,
    license.customRestrictions
  );

  const preview = document.querySelector(".license-live-preview");
  if (!preview) return;

  preview.innerHTML = `
    <div class="license-preview-head">
      <span><i data-lucide="shield-check"></i>Licence v${Number(version || 1)}</span>
      <strong>${managePackEscape(license.name || "Licence Sonara")}</strong>
    </div>
    <div class="license-preview-columns">
      <section>
        <h3><i data-lucide="circle-check-big"></i>Vous pouvez</h3>
        <ul>${permissions.length
          ? permissions.map((item) => `<li>${managePackEscape(item)}</li>`).join("")
          : "<li>Aucune permission sélectionnée.</li>"}</ul>
      </section>
      <section class="is-restricted">
        <h3><i data-lucide="circle-slash-2"></i>Interdit</h3>
        <ul>${restrictions.length
          ? restrictions.map((item) => `<li>${managePackEscape(item)}</li>`).join("")
          : "<li>Aucune restriction supplémentaire.</li>"}</ul>
      </section>
    </div>
    ${license.creditRequired ? `<p class="license-preview-credit"><i data-lucide="at-sign"></i>Crédit de l’artiste obligatoire.</p>` : ""}
    ${license.customTerms ? `<p class="license-preview-terms" data-user-content>${managePackEscape(license.customTerms)}</p>` : ""}
  `;
  if (window.lucide) lucide.createIcons();
}

function bindManagePackChoiceStates(form) {
  form.querySelectorAll(".license-choice input").forEach((input) => {
    input.addEventListener("change", () => {
      input.closest(".license-choice")?.classList.toggle("is-active", input.checked);
      updateManagePackLicensePreview(form, form.dataset.licenseVersion);
    });
  });

  form.querySelectorAll("input, textarea").forEach((field) => {
    field.addEventListener("input", () => {
      updateManagePackLicensePreview(form, form.dataset.licenseVersion);
    });
  });
}

function renderManagePack(pack) {
  const license = managePackCloneLicense(pack.license);
  const title = pack.title || pack.name || "Pack sans titre";
  const status = String(pack.status || "draft").toLowerCase();
  const cover = managePackMediaUrl(pack.coverPack);

  managePackRoot.innerHTML = `
    <header class="manage-pack-topbar">
      <button class="manage-pack-back" type="button">
        <i data-lucide="arrow-left"></i>
        Mes packs
      </button>
      <div class="manage-pack-top-actions">
        ${status === "approved" ? `
          <button class="manage-pack-view" type="button">
            <i data-lucide="external-link"></i>
            Voir côté acheteur
          </button>` : ""}
      </div>
    </header>

    <section class="manage-pack-hero">
      <div class="manage-pack-cover">
        ${cover ? `<img src="${managePackEscape(cover)}" alt="" data-i18n-ignore>` : `<i data-lucide="package"></i>`}
      </div>
      <div>
        <p class="manage-pack-eyebrow">GESTION DU PACK</p>
        <h1 data-user-content>${managePackEscape(title)}</h1>
        <div class="manage-pack-meta">
          <span class="manage-pack-status status-${managePackEscape(status)}">${managePackEscape(managePackStatusLabel(status))}</span>
          <span><i data-lucide="${["midi", "daw"].includes(String(pack.contentType || "audio").toLowerCase()) ? "file-cog" : "music-2"}"></i>${["midi", "daw"].includes(String(pack.contentType || "audio").toLowerCase()) ? `${Number(pack.resourceCount || pack.resources?.length || 0)} ressources` : `${Number(pack.trackCount || pack.tracks?.length || 0)} tracks`}</span>
          <span><i data-lucide="shield-check"></i>Licence v${Number(license.version || 1)}</span>
        </div>
      </div>
    </section>

    <section class="manage-pack-layout">
      <form class="license-editor" data-license-version="${Number(license.version || 1)}">
        <div class="license-section-heading">
          <div>
            <p class="manage-pack-eyebrow">LICENCE DU PACK</p>
            <h2>Définir les droits accordés</h2>
            <p>${["midi", "daw"].includes(String(pack.contentType || "audio").toLowerCase()) ? "Cette licence s’applique au pack et à toutes les ressources qu’il contient." : "Cette licence s’applique au pack complet et à toutes ses tracks vendues séparément."}</p>
          </div>
          <button class="license-reset" type="button">
            <i data-lucide="rotate-ccw"></i>
            Licence Sonara par défaut
          </button>
        </div>

        <label class="license-name-field">
          <span>Nom de la licence</span>
          <input name="licenseName" maxlength="90" value="${managePackEscape(license.name)}" required>
          <small>Nom affiché à l’acheteur avant le paiement.</small>
        </label>

        <fieldset class="license-fieldset">
          <legend>Utilisations autorisées</legend>
          <p>Active uniquement les usages que l’acheteur obtient réellement.</p>
          <div class="license-choice-grid">
            ${managePackCheckboxGroup(MANAGE_PACK_PERMISSIONS, license.permissions, "permission")}
          </div>
        </fieldset>

        <fieldset class="license-fieldset license-fieldset-danger">
          <legend>Utilisations interdites</legend>
          <p>Ces protections empêchent la redistribution ou l’appropriation des sons.</p>
          <div class="license-choice-grid">
            ${managePackCheckboxGroup(MANAGE_PACK_RESTRICTIONS, license.restrictions, "restriction")}
          </div>
        </fieldset>

        <label class="license-credit-field">
          <input type="checkbox" name="creditRequired" ${license.creditRequired ? "checked" : ""}>
          <span>
            <strong>Crédit de l’artiste obligatoire</strong>
            <small>L’acheteur devra mentionner l’artiste dans son projet publié.</small>
          </span>
        </label>

        <div class="license-custom-grid">
          <label>
            <span>Autorisations personnalisées</span>
            <textarea name="customPermissions" maxlength="2200" placeholder="Une autorisation par ligne">${managePackEscape(managePackLineList(license.customPermissions))}</textarea>
          </label>
          <label>
            <span>Interdictions personnalisées</span>
            <textarea name="customRestrictions" maxlength="2200" placeholder="Une interdiction par ligne">${managePackEscape(managePackLineList(license.customRestrictions))}</textarea>
          </label>
        </div>

        <label>
          <span>Conditions complémentaires</span>
          <textarea name="customTerms" maxlength="1600" placeholder="Précisions particulières visibles par l’acheteur" data-user-content>${managePackEscape(license.customTerms || "")}</textarea>
        </label>

        <footer class="license-save-bar">
          <div>
            <strong>Mise à jour immédiate, sans nouvelle modération.</strong>
            <small>Les anciens achats gardent leur version ; les futurs acheteurs voient la nouvelle.</small>
          </div>
          <button class="license-save" type="submit">
            <i data-lucide="save"></i>
            Enregistrer la licence
          </button>
        </footer>
      </form>

      <aside class="license-preview-panel">
        <div class="license-preview-sticky">
          <p class="manage-pack-eyebrow">APERÇU ACHETEUR</p>
          <h2>Ce qui sera affiché</h2>
          <div class="license-live-preview"></div>
        </div>
      </aside>
    </section>
  `;

  managePackRoot.setAttribute("aria-busy", "false");
  if (window.lucide) lucide.createIcons();

  const form = managePackRoot.querySelector(".license-editor");
  updateManagePackLicensePreview(form, license.version);
  bindManagePackChoiceStates(form);

  managePackRoot.querySelector(".manage-pack-back").addEventListener("click", () => {
    window.location.href = "my-pack.html";
  });

  managePackRoot.querySelector(".manage-pack-view")?.addEventListener("click", () => {
    window.open(`/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}`, "_blank", "noopener");
  });

  managePackRoot.querySelector(".license-reset").addEventListener("click", () => {
    const next = managePackCloneLicense(MANAGE_PACK_DEFAULT_LICENSE);
    form.licenseName.value = next.name;
    form.creditRequired.checked = next.creditRequired;
    MANAGE_PACK_PERMISSIONS.forEach(([key]) => {
      form[`permission_${key}`].checked = next.permissions[key];
      form[`permission_${key}`].closest(".license-choice")?.classList.toggle("is-active", next.permissions[key]);
    });
    MANAGE_PACK_RESTRICTIONS.forEach(([key]) => {
      form[`restriction_${key}`].checked = next.restrictions[key];
      form[`restriction_${key}`].closest(".license-choice")?.classList.toggle("is-active", next.restrictions[key]);
    });
    form.customPermissions.value = "";
    form.customRestrictions.value = "";
    form.customTerms.value = "";
    updateManagePackLicensePreview(form, form.dataset.licenseVersion);
    managePackToast("Licence Sonara par défaut restaurée.");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector(".license-save");
    const initial = button.innerHTML;

    try {
      button.disabled = true;
      button.innerHTML = `<i data-lucide="loader-circle"></i>Enregistrement…`;
      if (window.lucide) lucide.createIcons();

      const apiUrl = await managePackWaitForApi();
      const response = await fetch(
        `${apiUrl}/api/creator/packs/${encodeURIComponent(pack.id)}/license`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: managePackAccountId(),
            license: managePackFormLicense(form)
          })
        }
      );
      const data = await managePackReadJson(response);
      if (!response.ok) throw new Error(data.message || "Enregistrement impossible.");

      const updatedLicense = managePackCloneLicense(data.pack?.license);
      form.dataset.licenseVersion = String(updatedLicense.version || form.dataset.licenseVersion || 1);
      document.querySelectorAll(".manage-pack-meta span")[2].innerHTML = `<i data-lucide="shield-check"></i>Licence v${Number(updatedLicense.version || 1)}`;
      updateManagePackLicensePreview(form, updatedLicense.version);
      managePackToast(data.message || "Licence enregistrée.");

    } catch (error) {
      managePackToast(error.message, "error");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = initial;
        if (window.lucide) lucide.createIcons();
      }
    }
  });
}

async function initializeManagePack() {
  try {
    const accountId = managePackAccountId();
    if (!accountId) {
      window.location.href = "/app/pages/auth/inscription.html";
      return;
    }
    if (!managePackId) throw new Error("Pack introuvable.");

    const apiUrl = await managePackWaitForApi();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), MANAGE_PACK_REQUEST_TIMEOUT);
    let response;
    try {
      response = await fetch(
        `${apiUrl}/api/creator/packs/${encodeURIComponent(accountId)}`,
        { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal }
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
    const data = await managePackReadJson(response);
    if (!response.ok) throw new Error(data.message || "Impossible de récupérer le pack.");

    const pack = (Array.isArray(data.packs) ? data.packs : [])
      .find((item) => String(item.id) === String(managePackId));
    if (!pack) throw new Error("Ce pack n’existe pas ou ne vous appartient pas.");

    await window.SonaraLoadingExperience?.waitMinimum?.(managePackLoadingStartedAt, MANAGE_PACK_MIN_LOADING_TIME);
    renderManagePack(pack);
  } catch (error) {
    managePackRoot.innerHTML = `
      <section class="manage-pack-error">
        <i data-lucide="triangle-alert"></i>
        <h1>Impossible d’ouvrir le pack</h1>
        <p>${managePackEscape(error?.name === "AbortError" ? "Problème de chargement : le serveur met trop de temps à répondre." : error.message)}</p>
        <button type="button">Retour à Mes packs</button>
      </section>`;
    managePackRoot.setAttribute("aria-busy", "false");
    if (window.lucide) lucide.createIcons();
    managePackRoot.querySelector("button")?.addEventListener("click", () => {
      window.location.href = "my-pack.html";
    });
  }
}

initializeManagePack();
