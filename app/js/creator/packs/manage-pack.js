"use strict";

const managePackRoot = document.getElementById("managePackRoot");
const managePackParams = new URLSearchParams(window.location.search);
const managePackId = managePackParams.get("id");
const MANAGE_PACK_MIN_LOADING_TIME = 450;
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

async function loadManagePackModerationRequest(pack) {
  const accountId = managePackAccountId();
  if (!accountId || !pack?.id) return;
  try {
    const response = await fetch(`${API_URL}/api/packs/${encodeURIComponent(pack.id)}/moderation-request?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const openRequest = [...(data.requests || [])].reverse().find((item) => item?.status === "open");
    if (!openRequest) return;
    const hero = managePackRoot.querySelector(".manage-pack-hero");
    if (!hero) return;
    const section = document.createElement("section");
    section.className = "manage-pack-moderation-request";
    section.innerHTML = `
      <div><p class="manage-pack-eyebrow">MODÉRATION · INFORMATIONS REQUISES</p><h2>${managePackEscape(openRequest.question || "La modération demande des informations supplémentaires.")}</h2><small>Ta réponse sera conservée dans l’historique de review du pack.</small></div>
      <form><textarea name="response" maxlength="2200" required placeholder="Réponds précisément sur ton processus de création ou les justificatifs demandés."></textarea><button type="submit">Envoyer la réponse</button></form>`;
    hero.insertAdjacentElement("afterend", section);
    section.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget; const button = form.querySelector("button");
      button.disabled = true;
      try {
        const send = await fetch(`${API_URL}/api/packs/${encodeURIComponent(pack.id)}/moderation-response`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, response: form.response.value })
        });
        const result = await managePackReadJson(send);
        if (!send.ok) throw new Error(result.message || "Réponse non enregistrée.");
        section.remove(); managePackToast("Réponse envoyée à la modération.");
      } catch (error) { managePackToast(error.message, "error"); button.disabled = false; }
    });
  } catch {}
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
      <div class="manage-pack-cover sonara-pack-book-card">
        ${cover ? `<img class="sonara-pack-book-surface" src="${managePackEscape(cover)}" data-sonara-book-cover="${managePackEscape(cover)}" alt="" data-i18n-ignore>` : `<i data-lucide="package"></i>`}
      </div>
      <div>
        <p class="manage-pack-eyebrow">PARAMÈTRES DU PACK</p>
        <h1 data-user-content>${managePackEscape(title)}</h1>
        <div class="manage-pack-meta">
          <span class="manage-pack-status status-${managePackEscape(status)}">${managePackEscape(managePackStatusLabel(status))}</span>
          <span><i data-lucide="${["midi", "daw"].includes(String(pack.contentType || "audio").toLowerCase()) ? "file-cog" : "music-2"}"></i>${["midi", "daw"].includes(String(pack.contentType || "audio").toLowerCase()) ? `${Number(pack.resourceCount || pack.resources?.length || 0)} ressources` : `${Number(pack.trackCount || pack.tracks?.length || 0)} tracks`}</span>
          <span><i data-lucide="shield-check"></i>Licence v${Number(license.version || 1)}</span>
        </div>
      </div>
    </section>

    <nav class="manage-pack-options" aria-label="Paramètres du pack">
      ${String(pack.contentType || "audio").toLowerCase() === "audio" ? `<button type="button" class="manage-option" data-manage-panel="preview"><i data-lucide="music-2"></i><strong>Temps fort</strong><small>Choisir les 30 secondes et écouter les fondus</small></button>` : ""}
      <button type="button" class="manage-option" data-manage-panel="license"><i data-lucide="shield-check"></i><strong>Licence</strong><small>Configurer les droits d'utilisation</small></button>
      <button type="button" class="manage-option" data-manage-panel="edit"><i data-lucide="pencil"></i><strong>Modifier le pack</strong><small>Titre, prix et versions audio</small></button>
      ${status === "approved" ? `<button type="button" class="manage-option" data-manage-share><i data-lucide="share-2"></i><strong>Partager</strong><small>Obtenir le lien public du pack</small></button>` : ""}
      ${["draft", "rejected"].includes(status) ? `<button type="button" class="manage-option" data-manage-publish><i data-lucide="send"></i><strong>${pack.wasPublished || pack.publishedAt ? "Republier" : "Envoyer à la modération"}</strong><small>Soumettre les changements à Sonara</small></button>` : ""}
    </nav>

    <section class="manage-preview-settings" data-manage-panel-content="edit" hidden>
      <header><p class="manage-pack-eyebrow">MODIFIER LE PACK</p><h2>Modifier les informations</h2><p>Un nouveau fichier audio ou un changement de contenu renvoie le pack en modération. Le temps fort seul se règle dans l'option dédiée, sans modération.</p></header>
      <form class="manage-pack-edit-form">
        <label>Nom du pack <input type="text" name="title" maxlength="70" required value="${managePackEscape(title)}"></label>
        <label>Prix (laisser vide pour conserver) <input name="price" inputmode="decimal" placeholder="${managePackEscape(pack.price || "Gratuit")}"></label>
        ${(pack.tracks || []).map((track,index)=>`<fieldset class="manage-edit-track"><legend>Morceau ${index+1}</legend>
          <label>Titre <input name="trackTitle_${index}" maxlength="70" required value="${managePackEscape(track.title || "")}"></label>
          <label>Remplacer le fichier MP3 (facultatif) <input name="trackAudio_${index}" type="file" accept=".mp3,audio/mpeg"></label>
        </fieldset>`).join("")}
        <label class="manage-audio-rights-confirmation" hidden>
          <input type="checkbox" name="rightsDeclarationAccepted">
          <span>Je confirme disposer des droits nécessaires pour publier et licencier ce contenu sur Sonara Pack.</span>
        </label>
        <button type="submit" class="manage-edit-submit">Enregistrer les modifications</button>
      </form>
    </section>

    <section class="manage-preview-settings" data-manage-panel-content="preview" hidden>
      <header><p class="manage-pack-eyebrow">PRÉVIEW · PRE-V1</p><h2>Choisir le temps fort</h2><p>Les 30 secondes entendues par l'acheteur, avec un fondu d'ouverture et de fin de 5 secondes.</p></header>
      ${(pack.tracks || []).map(track => {
        const duration = Math.max(0, Number(track.audioDuration || track.duration) || 0);
        const length = Math.min(30, duration || 30);
        const max = Math.max(0, duration - length);
        const start = Math.min(max, Math.max(0, Number(track.previewStart) || 0));
        const manual = track.previewMode === "manual";
        return `<article class="manage-preview-track" data-track-id="${managePackEscape(track.id)}" data-duration="${duration}">
          <div class="manage-preview-head"><strong>${managePackEscape(track.title || "Morceau")}</strong><span data-preview-status>${manual ? "Choix artiste" : "Automatique"}</span></div>
          <div class="manage-preview-modes">
            <label><input type="radio" name="mode_${managePackEscape(track.id)}" value="auto" ${manual ? "" : "checked"}> Laisser Sonara choisir</label>
            <label><input type="radio" name="mode_${managePackEscape(track.id)}" value="manual" ${manual ? "checked" : ""}> Choisir moi-même</label>
          </div>
          <div class="manage-preview-manual" ${manual ? "" : "hidden"}>
            <div class="manage-preview-time"><span>Début du passage</span><strong data-preview-time>${start.toFixed(1)} s → ${(start + length).toFixed(1)} s</strong></div>
            <input type="range" data-preview-range min="0" max="${max}" step="0.1" value="${start}" aria-label="Début du passage">
            <label>Seconde de départ <input type="number" data-preview-number min="0" max="${max}" step="0.1" value="${start}"></label>
            <button type="button" class="manage-preview-listen" data-preview-listen>Écouter les 30 secondes avec fondus</button>
            <audio controls preload="none" data-preview-audio></audio>
          </div>
          <div class="manage-preview-footer"><small data-preview-help>${manual ? "Choix personnel prioritaire sur la modération." : "Le modérateur peut ajuster le temps fort automatique."}</small><button type="button" data-preview-save>Enregistrer</button></div>
        </article>`;
      }).join("")}
    </section>

    <section class="manage-pack-layout" data-manage-panel-content="license" hidden>
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
  loadManagePackModerationRequest(pack);
  if (window.lucide) lucide.createIcons();

  const form = managePackRoot.querySelector(".license-editor");
  updateManagePackLicensePreview(form, license.version);
  bindManagePackChoiceStates(form);

  const showPanel = id => {
    managePackRoot.querySelectorAll("[data-manage-panel-content]").forEach(panel => {
      panel.hidden = panel.dataset.managePanelContent !== id;
    });
    managePackRoot.querySelectorAll("[data-manage-panel]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.managePanel === id);
    });
    managePackRoot.querySelector(`[data-manage-panel-content="${id}"]`)?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  managePackRoot.querySelectorAll("[data-manage-panel]").forEach(button => button.addEventListener("click", () => showPanel(button.dataset.managePanel)));
  const editForm = managePackRoot.querySelector(".manage-pack-edit-form");
  const updateAudioRightsVisibility = () => {
    const hasNewAudio = [...editForm.querySelectorAll('input[type="file"][name^="trackAudio_"]')]
      .some(input => Array.from(input.files || []).some(file => file.size > 0));
    const confirmation = editForm.querySelector(".manage-audio-rights-confirmation");
    if (confirmation) confirmation.hidden = !hasNewAudio;
    if (!hasNewAudio && editForm.elements.rightsDeclarationAccepted) {
      editForm.elements.rightsDeclarationAccepted.checked = false;
    }
  };
  editForm?.addEventListener("change", updateAudioRightsVisibility);
  editForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const values = new FormData(form);
      const payload = new FormData();
      payload.append("accountId", managePackAccountId() || "");
      payload.append("title", String(values.get("title") || "").trim());
      const price = String(values.get("price") || "").trim();
      if (price) payload.append("price", price);
      const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
      payload.append("tracksData", JSON.stringify(tracks.map((track,index)=>({
        id: track.id,
        title: String(values.get(`trackTitle_${index}`) || "").trim()
      }))));
      const replacingAudio = tracks.some((_, index) => {
        const file = values.get(`trackAudio_${index}`);
        return file instanceof File && file.size > 0;
      });
      if (replacingAudio && values.get("rightsDeclarationAccepted") !== "on") {
        throw new Error("Confirme les droits sur les nouveaux fichiers avant l'envoi.");
      }
      if (replacingAudio) payload.append("rightsDeclarationAccepted", "true");
      for (let index=0; index<tracks.length; index++) {
        const file = values.get(`trackAudio_${index}`);
        if (!(file instanceof File) || file.size <= 0) continue;
        const policy = window.SonaraAudioUploadPolicy;
        if (!policy?.isAllowedMp3Metadata?.(file) || file.size > Number(policy.MAX_MP3_FILE_SIZE_BYTES || 0)) {
          throw new Error("MP3 invalide ou trop volumineux.");
        }
        payload.append(`trackAudio_${index}`, file, file.name);
      }
      const response = await fetch(`${API_URL}/api/creator/packs/${encodeURIComponent(pack.id)}`, {method:"PATCH",body:payload});
      const data = await managePackReadJson(response);
      if (!response.ok) throw new Error(data.message || "Modification impossible.");
      managePackToast(data.moderationRequired ? "Pack modifié et envoyé en modération." : "Pack mis à jour.");
      window.location.reload();
    } catch(error) {managePackToast(error.message,"error");}
    finally {button.disabled=false;}
  });
  managePackRoot.querySelector("[data-manage-share]")?.addEventListener("click", async () => {
    const link = `${window.location.origin}/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}`;
    try {
      if (navigator.share) await navigator.share({title:pack.title || "Sonara Pack",url:link});
      else await navigator.clipboard.writeText(link);
      managePackToast("Lien du pack partagé.");
    } catch(error) { if (error.name !== "AbortError") managePackToast("Partage indisponible.","error"); }
  });
  managePackRoot.querySelector("[data-manage-publish]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch(`${API_URL}/api/creator/packs/bulk`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:managePackAccountId(),action:(pack.wasPublished || pack.publishedAt)?"republish":"publish",packIds:[pack.id]})});
      const data = await managePackReadJson(response);
      if (!response.ok) throw new Error(data.message || "Envoi impossible.");
      managePackToast("Pack envoyé à la modération.");
      window.location.reload();
    } catch(error) {managePackToast(error.message,"error");button.disabled=false;}
  });

  managePackRoot.querySelectorAll(".manage-preview-track").forEach(card => {
    const trackId = card.dataset.trackId;
    const duration = Number(card.dataset.duration) || 30;
    const max = Math.max(0, duration - Math.min(30,duration));
    const range = card.querySelector("[data-preview-range]");
    const number = card.querySelector("[data-preview-number]");
    const timeLabel = card.querySelector("[data-preview-time]");
    const panel = card.querySelector(".manage-preview-manual");
    const player = card.querySelector("[data-preview-audio]");
    const save = card.querySelector("[data-preview-save]");
    let audioObjectUrl = null;
    const syncStart = raw => {
      const numeric = Number(raw);
      const start = Math.round(Math.max(0, Math.min(max, Number.isFinite(numeric)?numeric:0))*10)/10;
      range.value = number.value = String(start);
      timeLabel.textContent = `${start.toFixed(1)} s → ${(start+Math.min(30,duration)).toFixed(1)} s`;
      return start;
    };
    card.querySelectorAll("input[type=radio]").forEach(radio => radio.addEventListener("change", () => {
      if (radio.checked) {panel.hidden = radio.value !== "manual"; player.pause();}
    }));
    range.addEventListener("input", () => syncStart(range.value));
    number.addEventListener("change", () => syncStart(number.value));
    card.querySelector("[data-preview-listen]").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        player.pause();
        if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
        const response = await fetch(`${API_URL}/api/creator/packs/${encodeURIComponent(pack.id)}/preview-listen`,{
          method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:managePackAccountId(),trackId,previewStart:syncStart(number.value)})
        });
        if (!response.ok) { const data=await managePackReadJson(response);throw new Error(data.message||"Impossible d'écouter cet extrait."); }
        audioObjectUrl = URL.createObjectURL(await response.blob());
        player.src = audioObjectUrl;
        player.onended = () => { if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null;} };
        await player.play();
      } catch(error) {managePackToast(error.message,"error");}
      finally {button.disabled=false;}
    });
    save.addEventListener("click", async () => {
      const mode = card.querySelector("input[type=radio]:checked")?.value || "auto";
      save.disabled = true;
      try {
        const response = await fetch(`${API_URL}/api/creator/packs/${encodeURIComponent(pack.id)}/preview`,{
          method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:managePackAccountId(),trackId,previewMode:mode,previewStart:syncStart(number.value)})
        });
        const data = await managePackReadJson(response);
        if (!response.ok) throw new Error(data.message||"Enregistrement impossible.");
        card.querySelector("[data-preview-status]").textContent = mode === "manual" ? "Choix artiste" : "Automatique";
        card.querySelector("[data-preview-help]").textContent = mode === "manual" ? "Choix personnel prioritaire sur la modération." : "Le modérateur peut ajuster le temps fort automatique.";
        managePackToast("Temps fort enregistré sans nouvelle modération.");
      } catch(error) {managePackToast(error.message,"error");}
      finally {save.disabled=false;}
    });
  });

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
