const myPackPage = document.querySelector(".create-pack");
const MY_PACK_MIN_LOADING_TIME = 6000;
const MY_PACK_IMAGE_LOADING_TIMEOUT = 12000;

function ensureMyPackLucide() {
  if (window.lucide) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-my-pack-lucide]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/lucide@latest";
    script.dataset.myPackLucide = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function waitForApiUrl(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (typeof API_URL !== "undefined" && API_URL) {
        resolve(API_URL);
        return;
      }

      if (Date.now() - startedAt >= timeout) {
        reject(new Error("Configuration API indisponible."));
        return;
      }

      window.setTimeout(check, 40);
    };

    check();
  });
}

async function readMyPackJson(response) {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse serveur invalide (${response.status}).`);
  }
}

function getMyPackProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
  } catch {
    return null;
  }
}

function getMyPackAccountId() {
  const profile = getMyPackProfile();
  return profile?.accountId || profile?.id || profile?.userId || null;
}

function myPackMediaUrl(value) {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(String(value))) return String(value);
  const clean = String(value).replace(/^\/+/, "");
  return `${API_URL}/uploads/${clean}`;
}

function formatMyPackMoney(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function escapeMyPackHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function myPackAudioVersion(track) {
  const value = Number.parseInt(track?.audioVersion, 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function myPackWasPublished(pack) {
  return Boolean(
    pack?.wasPublished ||
    pack?.publishedAt ||
    String(pack?.status || "").toLowerCase() === "approved"
  );
}

function myPackStatusLabel(status) {
  const labels = {
    draft: "Brouillon",
    pending: "En attente",
    approved: "Publié",
    rejected: "Refusé",
    suspended: "Suspendu",
    archived: "Archivé"
  };

  const normalized = String(status || "draft").toLowerCase();
  return labels[normalized] || status || "Brouillon";
}

function myPackPublicUrl(packId) {
  return (
    `${window.location.origin}/app/pages/catalog/share.html` +
    `?id=${encodeURIComponent(packId)}`
  );
}

function myPackManagementUrl(packId) {
  return `manage-pack.html?id=${encodeURIComponent(packId)}`;
}

function showMyPackMessage(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `my-pack-toast my-pack-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 350);
  }, 3200);
}

async function fetchMyPacksOverview() {
  const accountId = getMyPackAccountId();
  if (!accountId) {
    throw new Error("Compte artiste introuvable.");
  }

  const apiUrl = await waitForApiUrl();
  const response = await fetch(
    `${apiUrl}/api/creator/packs/${encodeURIComponent(accountId)}`
  );
  const data = await readMyPackJson(response);

  if (!response.ok) {
    throw new Error(data.message || "Impossible de récupérer vos packs.");
  }

  return data;
}

function copyMyPackTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  return copied;
}

async function shareMyPacks(packs) {
  const shareable = packs.filter((pack) => pack.status === "approved");

  if (!shareable.length) {
    showMyPackMessage("Seuls les packs publiés peuvent être partagés.", "error");
    return;
  }

  const text = shareable
    .map((pack) => `${pack.title || pack.name}: ${myPackPublicUrl(pack.id)}`)
    .join("\n");

  if (typeof navigator.share === "function") {
    try {
      if (shareable.length === 1) {
        await navigator.share({
          title: shareable[0].title || "Pack Sonara",
          text: "Découvrez ce pack sur Sonara Pack.",
          url: myPackPublicUrl(shareable[0].id)
        });
      } else {
        await navigator.share({
          title: "Packs Sonara",
          text
        });
      }
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else if (!copyMyPackTextFallback(text)) {
      throw new Error("Copie indisponible");
    }

    showMyPackMessage(
      `Lien${shareable.length > 1 ? "s" : ""} copié${shareable.length > 1 ? "s" : ""}.`
    );
  } catch (error) {
    showMyPackMessage(
      "Le partage automatique est indisponible sur ce navigateur.",
      "error"
    );
  }
}

function openMyPackEditor(pack, onSaved) {
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
  const trackEditors = tracks.map((track, index) => `
    <fieldset class="my-pack-track-editor">
      <legend>Son ${index + 1}</legend>
      <div class="my-pack-track-heading">
        <strong>${escapeMyPackHtml(track.title || `Son ${index + 1}`)}</strong>
        <span>Version audio ${myPackAudioVersion(track)}</span>
      </div>
      <label>
        Titre du son
        <input
          name="trackTitle_${index}"
          maxlength="70"
          value="${escapeMyPackHtml(track.title || "")}"
          required
        >
      </label>
      <label>
        Changer la version du son
        <input
          name="trackAudio_${index}"
          type="file"
          accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac"
        >
        <small>Laissez vide pour conserver la version audio actuelle.</small>
      </label>
    </fieldset>
  `).join("");

  const modal = document.createElement("section");
  modal.className = "my-pack-modal";
  modal.innerHTML = `
    <form class="my-pack-modal-card">
      <button class="my-pack-modal-close" type="button" aria-label="Fermer">
        <i data-lucide="x"></i>
      </button>
      <p class="my-pack-label">MES PACKS</p>
      <h2>Modifier le pack</h2>
      <label>
        Titre
        <input name="title" maxlength="70" value="${escapeMyPackHtml(pack.title || pack.name || "")}" required>
      </label>
      <label>
        Prix
        <input name="price" inputmode="decimal" value="${escapeMyPackHtml(pack.price || pack.packPrice || "")}">
      </label>
      ${trackEditors
        ? `<div class="my-pack-track-list">${trackEditors}</div>`
        : ""}
      <button class="my-pack-primary" type="submit">Enregistrer</button>
    </form>`;

  document.body.appendChild(modal);
  if (window.lucide) lucide.createIcons();
  requestAnimationFrame(() => modal.classList.add("show"));

  const close = () => {
    modal.classList.remove("show");
    window.setTimeout(() => modal.remove(), 250);
  };

  modal.querySelector(".my-pack-modal-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const initialSubmitLabel = submitButton.textContent;

    try {
      const form = new FormData(event.currentTarget);
      const payload = new FormData();
      const trackChanges = tracks.map((track, index) => ({
        id: track.id,
        title: String(form.get(`trackTitle_${index}`) || "").trim()
      }));

      payload.append("accountId", getMyPackAccountId() || "");
      payload.append("title", String(form.get("title") || "").trim());
      payload.append("price", String(form.get("price") || "").trim());
      payload.append("tracksData", JSON.stringify(trackChanges));

      tracks.forEach((_, index) => {
        const audio = form.get(`trackAudio_${index}`);
        if (audio instanceof File && audio.size > 0) {
          payload.append(`trackAudio_${index}`, audio, audio.name);
        }
      });

      submitButton.disabled = true;
      submitButton.textContent = "Enregistrement…";

      const apiUrl = await waitForApiUrl();
      const response = await fetch(
        `${apiUrl}/api/creator/packs/${encodeURIComponent(pack.id)}`,
        {
          method: "PATCH",
          body: payload
        }
      );
      const data = await readMyPackJson(response);

      if (!response.ok) {
        throw new Error(data.message || "Modification impossible.");
      }

      close();
      showMyPackMessage(
        data.moderationRequired
          ? "Pack mis à jour et renvoyé en modération."
          : data.audioVersionsUpdated
            ? `${data.audioVersionsUpdated} version(s) audio mise(s) à jour.`
            : "Pack mis à jour."
      );
      onSaved?.();
    } catch (error) {
      showMyPackMessage(error.message, "error");
    } finally {
      if (submitButton.isConnected) {
        submitButton.disabled = false;
        submitButton.textContent = initialSubmitLabel;
      }
    }
  });
}


function updateMyPackLoading(progress, message) {
  const loader = document.querySelector(".my-pack-page-loader");
  const fill = loader?.querySelector(".my-pack-loader-progress-fill");
  const label = loader?.querySelector(".my-pack-loader-message");
  const value = Math.min(100, Math.max(0, Number(progress) || 0));

  if (fill) fill.style.width = `${value}%`;
  if (label && message) label.textContent = message;
  loader?.setAttribute("aria-valuenow", String(value));
}

function waitForMyPackMinimum(startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, MY_PACK_MIN_LOADING_TIME - elapsed);
  return new Promise((resolve) => window.setTimeout(resolve, remaining));
}

function waitForMyPackImage(image) {
  if (image.complete) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => resolve();
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
  });
}

async function waitForMyPackImages(container) {
  const images = [...container.querySelectorAll(".my-pack-cover img")];
  if (!images.length) return;

  await Promise.race([
    Promise.all(images.map(waitForMyPackImage)),
    new Promise((resolve) =>
      window.setTimeout(resolve, MY_PACK_IMAGE_LOADING_TIMEOUT)
    )
  ]);
}

async function finishMyPackLoading(startedAt, message = "Vos packs sont prêts") {
  updateMyPackLoading(92, "Finalisation de l’affichage…");
  await waitForMyPackMinimum(startedAt);
  updateMyPackLoading(100, message);

  await new Promise((resolve) => window.setTimeout(resolve, 280));

  const loader = document.querySelector(".my-pack-page-loader");
  const content = document.querySelector(".my-pack-loaded-content");

  loader?.classList.add("is-hidden");
  content?.classList.add("is-ready");
  myPackPage?.setAttribute("aria-busy", "false");

  window.setTimeout(() => loader?.remove(), 500);
}

function renderMyPacksStructure() {
  myPackPage.setAttribute("aria-busy", "true");
  myPackPage.innerHTML = `
    <section
      class="my-pack-page-loader"
      role="progressbar"
      aria-label="Chargement de vos packs"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="5"
    >
      <div class="my-pack-loader-scene" aria-hidden="true">
        <span class="my-pack-loader-orbit my-pack-loader-orbit-one"></span>
        <span class="my-pack-loader-orbit my-pack-loader-orbit-two"></span>
        <span class="my-pack-loader-core">
          <span></span><span></span><span></span>
        </span>
      </div>
      <p class="my-pack-loader-label">SONARA CREATOR</p>
      <h1>Chargement de vos packs</h1>
      <p class="my-pack-loader-message">Connexion au serveur Sonara…</p>
      <div class="my-pack-loader-progress" aria-hidden="true">
        <span class="my-pack-loader-progress-fill"></span>
      </div>
    </section>

    <div class="my-pack-loaded-content">
    <section class="my-pack-header">
      <p class="my-pack-label">SONARA CREATOR</p>
      <h1>Mes packs</h1>
      <p class="my-pack-subtitle">Gérez vos créations, leurs statuts, leurs ventes et leurs revenus.</p>
    </section>

    <button class="my-pack-back" type="button">Retourner au dashboard</button>

    <section class="my-pack-stats" aria-live="polite"></section>

    <section class="my-pack-toolbar">
      <button type="button" class="my-pack-selection-toggle" aria-expanded="false">
        <i data-lucide="list-checks"></i>
        Sélectionner
      </button>
      <div class="my-pack-selection-menu" hidden>
        <button type="button" class="my-pack-select-all">
          <i data-lucide="check-check"></i>Tout sélectionner
        </button>
        <button type="button" data-action="share"><i data-lucide="share-2"></i>Partager</button>
        <button type="button" data-action="edit"><i data-lucide="pencil"></i>Modifier</button>
        <button type="button" data-action="draft"><i data-lucide="file-pen-line"></i>Mettre en brouillon</button>
        <button type="button" data-action="publish"><i data-lucide="upload-cloud"></i>Publier</button>
        <button type="button" data-action="republish"><i data-lucide="refresh-cw"></i>Republier</button>
        <button type="button" data-action="delete" class="danger"><i data-lucide="trash-2"></i>Supprimer</button>
      </div>
    </section>

    <section class="my-pack-list">
      <p class="my-pack-loading">Chargement de vos packs…</p>
    </section>
    </div>`;

  if (window.lucide) lucide.createIcons();
}

async function initializeMyPacks() {
  const loadingStartedAt = Date.now();
  await ensureMyPackLucide().catch(() => {});

  const profile = getMyPackProfile();

  if (!profile) {
    window.location.href = "/app/pages/auth/inscription.html";
    return;
  }

  renderMyPacksStructure();
  updateMyPackLoading(12, "Compte Creator identifié…");

  document.querySelector(".my-pack-back").addEventListener("click", () => {
    window.location.href = "/app/pages/creator/dashboard.html";
  });

  let selectionMode = false;
  let currentPacks = [];
  const selected = new Set();

  const list = document.querySelector(".my-pack-list");
  const statsZone = document.querySelector(".my-pack-stats");
  const toggle = document.querySelector(".my-pack-selection-toggle");
  const selectAll = document.querySelector(".my-pack-select-all");
  const selectionMenu = document.querySelector(".my-pack-selection-menu");

  const updateSelectionUi = () => {
    document.querySelectorAll(".my-pack-card").forEach((card) => {
      const id = card.dataset.packId;
      const checkbox = card.querySelector(".my-pack-check");
      card.classList.toggle("is-selected", selected.has(id));
      if (checkbox) checkbox.checked = selected.has(id);
    });

    const count = selected.size;
    const selectedPacks = currentPacks.filter((pack) => selected.has(String(pack.id)));
    const allEditableDrafts =
      selectedPacks.length > 0 &&
      selectedPacks.every((pack) =>
        ["draft", "rejected"].includes(String(pack.status || "draft").toLowerCase())
      );
    const canPublish =
      allEditableDrafts &&
      selectedPacks.every((pack) => !myPackWasPublished(pack));
    const canRepublish =
      allEditableDrafts &&
      selectedPacks.every((pack) => myPackWasPublished(pack));
    const canMoveToDraft =
      selectedPacks.length > 0 &&
      selectedPacks.some((pack) => String(pack.status || "draft").toLowerCase() !== "draft");

    selectionMenu.querySelector('[data-action="share"]').disabled =
      !selectedPacks.some((pack) => String(pack.status || "").toLowerCase() === "approved");
    selectionMenu.querySelector('[data-action="edit"]').disabled = count !== 1;
    selectionMenu.querySelector('[data-action="draft"]').disabled = !canMoveToDraft;
    selectionMenu.querySelector('[data-action="publish"]').disabled = !canPublish;
    selectionMenu.querySelector('[data-action="republish"]').disabled = !canRepublish;
    selectionMenu.querySelector('[data-action="delete"]').disabled = count === 0;

    toggle.innerHTML = selectionMode
      ? `<i data-lucide="x"></i>Quitter (${count})`
      : `<i data-lucide="list-checks"></i>Sélectionner`;

    if (window.lucide) lucide.createIcons();
  };

  const applyBulkAction = async (action, packIds) => {
    const apiUrl = await waitForApiUrl();
    const response = await fetch(`${apiUrl}/api/creator/packs/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: getMyPackAccountId(),
        action,
        packIds
      })
    });
    const data = await readMyPackJson(response);

    if (!response.ok) {
      throw new Error(data.message || "Action impossible.");
    }

    showMyPackMessage(data.message || "Action terminée.");
  };

  const load = async () => {
    updateMyPackLoading(28, "Chargement des packs depuis le serveur…");
    const data = await fetchMyPacksOverview();
    updateMyPackLoading(58, "Packs reçus, préparation de l’affichage…");
    currentPacks = data.packs || [];
    selected.clear();

    const commercialActive = data.commercialState?.paymentsActive === true;

    statsZone.innerHTML = `
      <article><span>Packs créés</span><strong>${data.stats?.packCount || 0}</strong></article>
      <article><span>Téléchargements</span><strong>${data.stats?.downloadCount || 0}</strong><small>Packs + tracks acquis</small></article>
      <article><span>Utilisateurs</span><strong>${data.stats?.uniqueAudienceCount || 0}</strong><small>Audience unique générée</small></article>
      <article><span>Ventes</span><strong>${commercialActive ? (data.stats?.salesCount || 0) : "V1"}</strong><small>${commercialActive ? "Paiements confirmés" : "Commercial Mode inactif"}</small></article>
      <article><span>Revenus Stripe</span><strong>${commercialActive ? (data.stats?.stripeStatsAvailable === false ? "—" : formatMyPackMoney(data.stats?.revenue || 0)) : "V1"}</strong><small>${commercialActive ? (data.stats?.stripeStatsAvailable === false ? "Synchronisation Stripe indisponible" : "Calculés depuis les paiements Stripe confirmés") : "Prêt pour le lancement commercial"}</small></article>`;

    if (!currentPacks.length) {
      list.innerHTML = `
        <div class="my-pack-empty">
          <i data-lucide="package-open"></i>
          <h2>Aucun pack pour le moment</h2>
          <p>Votre premier pack apparaîtra ici dès sa sauvegarde ou son envoi.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      updateMyPackLoading(84, "Aucun pack à afficher…");
      return;
    }

    list.innerHTML = currentPacks.map((pack) => {
      const status = String(pack.status || "draft").toLowerCase();
      const title = pack.title || pack.name || "Pack sans titre";
      const safeTitle = escapeMyPackHtml(title);
      const safePackId = escapeMyPackHtml(pack.id);

      return `
        <article
          class="my-pack-card"
          data-pack-id="${safePackId}"
          role="button"
          tabindex="0"
          aria-label="Gérer le pack ${safeTitle}"
        >
          <label class="my-pack-select" ${selectionMode ? "" : "hidden"}>
            <input class="my-pack-check" type="checkbox" aria-label="Sélectionner ${safeTitle}">
          </label>

          <div class="my-pack-cover">
            ${pack.coverPack
              ? `<img src="${escapeMyPackHtml(myPackMediaUrl(pack.coverPack))}" alt="">`
              : `<i data-lucide="image"></i>`}
          </div>

          <div class="my-pack-info">
            <div class="my-pack-title-row">
              <h2>${safeTitle}</h2>
              <span class="my-pack-status status-${escapeMyPackHtml(status)}">${escapeMyPackHtml(myPackStatusLabel(status))}</span>
            </div>
            <div class="my-pack-meta">
              <span><i data-lucide="music-2"></i>${pack.trackCount || pack.tracks?.length || 0} tracks</span>
              <span><i data-lucide="download"></i>${pack.downloadCount || 0} téléchargements</span>
              <span><i data-lucide="users"></i>${pack.uniqueDownloaders || 0} utilisateurs</span>
              <span><i data-lucide="shopping-bag"></i>${commercialActive ? (pack.salesCount || 0) : "V1"} ventes</span>
              <span><i data-lucide="euro"></i>${commercialActive ? formatMyPackMoney(pack.revenue || 0) : "V1"}</span>
            </div>
            ${pack.rejectionReason
              ? `<p class="my-pack-rejection"><strong>Motif :</strong> ${escapeMyPackHtml(pack.rejectionReason)}</p>`
              : ""}
            <div class="my-pack-card-footer">
              <span class="my-pack-license-status">
                <i data-lucide="shield-check"></i>
                Licence
              </span>
              <button class="my-pack-manage-button" type="button" data-manage-pack>
                Gérer le pack
                <i data-lucide="arrow-up-right"></i>
              </button>
            </div>
          </div>

        </article>`;
    }).join("");

    if (window.lucide) lucide.createIcons();

    updateMyPackLoading(76, "Chargement des covers…");
    await waitForMyPackImages(list);
    updateMyPackLoading(88, "Covers chargées…");

    list.querySelectorAll(".my-pack-card").forEach((card) => {
      const pack = currentPacks.find((item) => String(item.id) === card.dataset.packId);
      const checkbox = card.querySelector(".my-pack-check");

      checkbox.addEventListener("change", (event) => {
        if (event.target.checked) selected.add(card.dataset.packId);
        else selected.delete(card.dataset.packId);
        updateSelectionUi();
      });

      card.addEventListener("click", (event) => {
        if (selectionMode) {
          if (event.target.closest("button, input, label")) return;
          if (selected.has(card.dataset.packId)) selected.delete(card.dataset.packId);
          else selected.add(card.dataset.packId);
          updateSelectionUi();
          return;
        }

        if (event.target.closest("input, label")) return;
        window.location.href = myPackManagementUrl(card.dataset.packId);
      });

      card.addEventListener("keydown", (event) => {
        if (selectionMode || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        window.location.href = myPackManagementUrl(card.dataset.packId);
      });

    });

    updateSelectionUi();
  };

  toggle.addEventListener("click", () => {
    selectionMode = !selectionMode;
    selected.clear();
    toggle.setAttribute("aria-expanded", String(selectionMode));

    if (selectionMode) {
      selectionMenu.hidden = false;
      requestAnimationFrame(() => selectionMenu.classList.add("is-open"));
    } else {
      selectionMenu.classList.remove("is-open");
      window.setTimeout(() => {
        if (!selectionMode) selectionMenu.hidden = true;
      }, 220);
    }

    document.querySelectorAll(".my-pack-select").forEach((item) => {
      item.hidden = !selectionMode;
    });
    updateSelectionUi();
  });

  selectAll.addEventListener("click", () => {
    if (selected.size === currentPacks.length) selected.clear();
    else currentPacks.forEach((pack) => selected.add(String(pack.id)));
    updateSelectionUi();
  });

  selectionMenu.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const packs = currentPacks.filter((pack) => selected.has(String(pack.id)));
    if (!packs.length) {
      showMyPackMessage("Sélectionnez au moins un pack.", "error");
      return;
    }

    const action = button.dataset.action;

    try {
      if (action === "share") {
        await shareMyPacks(packs);
        return;
      }

      if (action === "edit") {
        if (packs.length !== 1) {
          showMyPackMessage("Sélectionnez un seul pack à modifier.", "error");
          return;
        }
        openMyPackEditor(packs[0], load);
        return;
      }

      if (
        action === "publish" &&
        !packs.every((pack) =>
          ["draft", "rejected"].includes(String(pack.status || "draft").toLowerCase()) &&
          !myPackWasPublished(pack)
        )
      ) {
        showMyPackMessage("Cette sélection ne contient pas uniquement des brouillons jamais publiés.", "error");
        return;
      }

      if (
        action === "republish" &&
        !packs.every((pack) =>
          ["draft", "rejected"].includes(String(pack.status || "draft").toLowerCase()) &&
          myPackWasPublished(pack)
        )
      ) {
        showMyPackMessage("Cette sélection ne contient pas uniquement des packs à republier.", "error");
        return;
      }

      if (
        action === "delete" &&
        !window.confirm(`Supprimer définitivement ${packs.length} pack(s) ?`)
      ) {
        return;
      }

      await applyBulkAction(action, packs.map((pack) => pack.id));
      await load();
    } catch (error) {
      showMyPackMessage(error.message, "error");
    }
  });

  try {
    await load();
    await finishMyPackLoading(loadingStartedAt);
  } catch (error) {
    list.innerHTML = `
      <div class="my-pack-empty">
        <h2>Impossible de charger vos packs</h2>
        <p>${escapeMyPackHtml(error.message)}</p>
      </div>`;
    await finishMyPackLoading(
      loadingStartedAt,
      "Le chargement est terminé avec une erreur"
    );
  }
}

document.addEventListener("DOMContentLoaded", initializeMyPacks);
