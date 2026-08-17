(() => {
  "use strict";

  const root = document.querySelector(".sync-saves-content");
  if (!root) return;

  const t = (value) => window.SonaraI18n?.t?.(value) || value;

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getProfile() {
    try { return JSON.parse(localStorage.getItem("sonaraProfile") || "null"); }
    catch { return null; }
  }

  function formatDate(value) {
    const date = new Date(value || Date.now());
    const language = window.SonaraI18n?.getLanguage?.() || "fr";
    const locales = { fr:"fr-FR", en:"en-GB", es:"es-ES", de:"de-DE", it:"it-IT", pt:"pt-PT", nl:"nl-NL", pl:"pl-PL", ro:"ro-RO", ru:"ru-RU", zh:"zh-CN", sw:"sw-KE", sq:"sq-AL", tr:"tr-TR", id:"id-ID", ar:"ar" };
    return new Intl.DateTimeFormat(locales[language] || "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function initializeNavigation(profile) {
    document.querySelectorAll('[data-sync-nav="home"]').forEach((button) => button.addEventListener("click", () => window.location.assign("/home.html")));
    document.querySelectorAll('[data-sync-nav="library"]').forEach((button) => button.addEventListener("click", () => window.location.assign("/app/pages/catalog/library.html")));
    document.querySelectorAll('[data-sync-nav="sync"]').forEach((button) => button.addEventListener("click", () => window.location.assign("/app/pages/catalog/montage.html")));

    const createButtons = document.querySelectorAll('[data-sync-nav="create"]');
    if (profile?.role !== "both") createButtons.forEach((button) => { button.hidden = true; });
    else createButtons.forEach((button) => button.addEventListener("click", () => window.location.assign("/app/pages/creator/dashboard.html")));
  }

  function projectCard(project) {
    const trackCount = Array.isArray(project.audioTracks) ? project.audioTracks.length : 0;
    const videoName = project.videoName || project.videoFile?.name || t("Vidéo non renseignée");
    return `
      <article class="sync-save-card" data-project-id="${escapeHtml(project.id)}">
        <div class="sync-save-icon"><i data-lucide="clapperboard"></i></div>
        <div class="sync-save-copy">
          <p class="montage-kicker">SONARA SYNC</p>
          <h2 data-user-content>${escapeHtml(project.name || "Projet Sonara Sync")}</h2>
          <p data-user-content>${escapeHtml(videoName)}</p>
          <div class="sync-save-meta">
            <span>${escapeHtml(t("{0} piste(s) audio").replace("{0}", String(trackCount)))}</span>
            <span>${escapeHtml(t("Modifié le {0}").replace("{0}", formatDate(project.updatedAt)))}</span>
          </div>
        </div>
        <div class="sync-save-actions">
          <button class="montage-btn primary" type="button" data-open-project="${escapeHtml(project.id)}"><i data-lucide="folder-open"></i>${escapeHtml(t("Ouvrir le projet"))}</button>
          <button class="montage-btn danger" type="button" data-delete-project="${escapeHtml(project.id)}"><i data-lucide="trash-2"></i>${escapeHtml(t("Supprimer"))}</button>
        </div>
      </article>
    `;
  }

  async function render() {
    let projects = [];
    try { projects = await window.SonaraSyncProjects?.list?.() || []; }
    catch (error) { console.error("Brouillons Sonara Sync indisponibles :", error); }

    root.innerHTML = `
      <section class="montage-hero sync-saves-hero">
        <p class="montage-kicker">SONARA SYNC</p>
        <h1>${escapeHtml(t("Vos brouillons Sonara Sync."))}</h1>
        <p>${escapeHtml(t("Dès qu'une vidéo est ajoutée, Sonara Sync sauvegarde automatiquement votre montage pour que vous puissiez le reprendre après un rechargement."))}</p>
        <div class="montage-actions">
          <button class="montage-btn primary" type="button" id="syncNewProject"><i data-lucide="plus"></i>${escapeHtml(t("Nouveau projet"))}</button>
          <button class="montage-btn" type="button" id="syncBackToEditor"><i data-lucide="arrow-left"></i>${escapeHtml(t("Retour à Sonara Sync"))}</button>
        </div>
      </section>

      <section class="sync-saves-list">
        ${projects.length ? projects.map(projectCard).join("") : `
          <div class="sync-saves-empty">
            <i data-lucide="folder"></i>
            <strong>${escapeHtml(t("Aucun brouillon"))}</strong>
            <p>${escapeHtml(t("Ajoutez une vidéo dans Sonara Sync : votre brouillon sera créé automatiquement."))}</p>
          </div>
        `}
      </section>
    `;

    document.querySelector("#syncNewProject")?.addEventListener("click", () => window.location.assign("/app/pages/catalog/montage.html?new=1"));
    document.querySelector("#syncBackToEditor")?.addEventListener("click", () => window.location.assign("/app/pages/catalog/montage.html"));

    document.querySelectorAll("[data-open-project]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = new URL("/app/pages/catalog/montage.html", window.location.origin);
        url.searchParams.set("project", button.dataset.openProject);
        window.location.assign(url.href);
      });
    });

    document.querySelectorAll("[data-delete-project]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm(t("Supprimer définitivement ce projet Sonara Sync ?"))) return;
        try {
          await window.SonaraSyncProjects?.remove?.(button.dataset.deleteProject);
          await render();
        } catch (error) {
          console.error("Suppression du projet impossible :", error);
          window.alert(t("Impossible de supprimer ce projet."));
        }
      });
    });

    if (window.lucide) lucide.createIcons();
    window.SonaraI18n?.refresh?.();
  }

  async function initialize() {
    const profile = getProfile();
    initializeNavigation(profile);

    try {
      const access = await window.SonaraMontageAccess?.ready;
      if (!access?.allowed) { window.location.replace("/home.html"); return; }
    } catch (error) {
      console.error("Accès Sonara Sync impossible :", error);
      window.location.replace("/home.html");
      return;
    }

    try { await window.SonaraI18n?.ready; } catch {}
    await render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
