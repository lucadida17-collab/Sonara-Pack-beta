(() => {
  "use strict";

  const NOTICE_SELECTOR = ".pre-v1-commercial-notice";
  const STORAGE_NAMESPACE = "sonaraAnnouncements";
  const ANNOUNCEMENTS = Object.freeze({
    user: Object.freeze({
      version: "PRE_V1_1",
      seenField: "lastSeenHomeAnnouncement"
    }),
    artist: Object.freeze({
      version: "PRE_V1_1",
      seenField: "lastSeenCreatorAnnouncement"
    })
  });

  function getProfile(explicitProfile) {
    if (explicitProfile && typeof explicitProfile === "object") {
      return explicitProfile;
    }

    try {
      return JSON.parse(localStorage.getItem("sonaraProfile") || "null");
    } catch {
      return null;
    }
  }

  function getEnvironment() {
    try {
      if (typeof SONARA_ENV !== "undefined" && SONARA_ENV) {
        return String(SONARA_ENV);
      }
    } catch {
      // Fallback ci-dessous.
    }

    return "unknown";
  }

  function getAccountKey(profile = {}) {
    const stableId = profile.accountId || profile.id || profile.userId;
    if (stableId) return String(stableId).trim();

    if (profile.mail) {
      return String(profile.mail).trim().toLowerCase();
    }

    return "";
  }

  function getStorageKey(profile) {
    const accountKey = getAccountKey(profile);
    if (!accountKey) return "";

    return [STORAGE_NAMESPACE, getEnvironment(), encodeURIComponent(accountKey)].join(":");
  }

  function getApiUrl() {
    try {
      if (typeof API_URL !== "undefined" && API_URL) {
        return String(API_URL).replace(/\/+$/, "");
      }
    } catch {
      // Le stockage local reste disponible si l'API n'est pas initialisée.
    }

    return "";
  }

  function readAnnouncementState(storageKey) {
    if (!storageKey) return {};

    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  }

  function hasSeenAnnouncement(storageKey, announcement) {
    return (
      readAnnouncementState(storageKey)[announcement.seenField] ===
      announcement.version
    );
  }

  function mergeAnnouncementState(storageKey, nextState = {}) {
    const state = readAnnouncementState(storageKey);

    Object.values(ANNOUNCEMENTS).forEach(({ seenField }) => {
      const value = nextState?.[seenField];
      if (typeof value === "string" && value.trim()) {
        state[seenField] = value.trim();
      }
    });

    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Le serveur peut malgré tout conserver la version vue.
    }

    return state;
  }

  function markAnnouncementAsSeen(storageKey, announcement) {
    mergeAnnouncementState(storageKey, {
      [announcement.seenField]: announcement.version
    });
  }

  function syncStoredProfile(profile, announcement) {
    if (!profile || typeof profile !== "object") return;

    profile[announcement.seenField] = announcement.version;

    try {
      const storedProfile = JSON.parse(
        localStorage.getItem("sonaraProfile") || "null"
      );

      if (
        storedProfile &&
        getAccountKey(storedProfile) === getAccountKey(profile)
      ) {
        storedProfile[announcement.seenField] = announcement.version;
        localStorage.setItem("sonaraProfile", JSON.stringify(storedProfile));
      }
    } catch {
      // Le stockage d'annonce séparé reste la référence locale.
    }
  }

  async function readAccountAnnouncementState(profile) {
    const apiUrl = getApiUrl();
    const accountId = profile?.accountId || profile?.id || profile?.userId;

    if (!apiUrl || !accountId) return {};

    try {
      const response = await fetch(
        `${apiUrl}/api/profile/${encodeURIComponent(accountId)}/announcements`,
        {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" }
        }
      );

      if (!response.ok) return {};

      const data = await response.json().catch(() => ({}));
      return data?.announcements && typeof data.announcements === "object"
        ? data.announcements
        : {};
    } catch {
      return {};
    }
  }

  async function persistAccountAnnouncement(profile, audience, announcement) {
    const apiUrl = getApiUrl();
    const accountId = profile?.accountId || profile?.id || profile?.userId;

    if (!apiUrl || !accountId) return false;

    try {
      const response = await fetch(
        `${apiUrl}/api/profile/${encodeURIComponent(accountId)}/announcements`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            audience,
            version: announcement.version
          }),
          keepalive: true
        }
      );

      if (!response.ok) return false;

      const data = await response.json().catch(() => ({}));
      if (data?.announcements) {
        mergeAnnouncementState(getStorageKey(profile), data.announcements);
      }

      return true;
    } catch {
      return false;
    }
  }

  function getCopy(audience) {
    if (audience === "artist") {
      return {
        icon: "upload-cloud",
        eyebrow: "PRE-V1",
        title: "PRE-V1 Artistes",
        lead: "La Pre-V1 est ouverte.",
        body: "Vous pouvez dès maintenant publier vos packs et construire votre présence sur Sonara Pack.",
        highlight: "Les prix que vous définissez aujourd’hui sont conservés pour la V1.",
        closing: "Continuez à publier pendant la Pre-V1 : votre activité commence déjà à construire votre présence sur la plateforme avant le lancement commercial.",
        info: "Bank et les paiements seront disponibles lors de la V1.",
        action: "Continuer"
      };
    }

    return {
      icon: "sparkles",
      eyebrow: "PRE-V1",
      title: "PRE-V1 Sonara Pack",
      lead: "Bienvenue dans la Pre-V1 de Sonara Pack.",
      body: "Découvrez dès maintenant les artistes et leurs packs gratuitement pendant cette phase de lancement.",
      highlight: "La V1 introduira ensuite le lancement commercial de la plateforme.",
      closing: "",
      info: "",
      action: "Découvrir Sonara Pack"
    };
  }

  function closeNotice(notice, previouslyFocusedElement) {
    if (!notice) return;

    notice.classList.remove("show");
    document.body.classList.remove("pre-v1-notice-open");

    window.setTimeout(() => {
      notice.remove();

      if (
        previouslyFocusedElement instanceof HTMLElement &&
        document.contains(previouslyFocusedElement)
      ) {
        previouslyFocusedElement.focus({ preventScroll: true });
      }
    }, 260);
  }

  function keepFocusInsideNotice(notice, event) {
    if (event.key !== "Tab") return;

    const focusableElements = Array.from(
      notice.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function createNotice(audience, version, onDismiss) {
    const copy = getCopy(audience);
    const notice = document.createElement("section");
    const descriptionId = `pre-v1-notice-description-${audience}`;

    notice.className = `pre-v1-commercial-notice pre-v1-commercial-notice-${audience}`;
    notice.dataset.announcementVersion = version;
    notice.setAttribute("role", "dialog");
    notice.setAttribute("aria-modal", "true");
    notice.setAttribute("aria-labelledby", `pre-v1-notice-title-${audience}`);
    notice.setAttribute("aria-describedby", descriptionId);

    notice.innerHTML = `
      <div class="pre-v1-commercial-notice-card">
        <button
          class="pre-v1-commercial-notice-close"
          type="button"
          aria-label="Fermer"
        >
          <i data-lucide="x"></i>
        </button>

        <div class="pre-v1-commercial-notice-icon" aria-hidden="true">
          <i data-lucide="${copy.icon}"></i>
        </div>

        <span class="pre-v1-commercial-notice-eyebrow">${copy.eyebrow}</span>

        <h2 id="pre-v1-notice-title-${audience}">${copy.title}</h2>

        <div id="${descriptionId}" class="pre-v1-commercial-notice-copy">
          <p class="pre-v1-commercial-notice-lead">${copy.lead}</p>
          <p>${copy.body}</p>

          <div class="pre-v1-commercial-notice-highlight">
            <i data-lucide="sparkles" aria-hidden="true"></i>
            <strong>${copy.highlight}</strong>
          </div>

          ${copy.closing ? `<p>${copy.closing}</p>` : ""}

          ${copy.info ? `
            <p class="pre-v1-commercial-notice-info">
              <i data-lucide="landmark" aria-hidden="true"></i>
              <span>${copy.info}</span>
            </p>
          ` : ""}
        </div>

        <button class="pre-v1-commercial-notice-action" type="button">
          ${copy.action}
        </button>
      </div>
    `;

    const dismiss = () => onDismiss(notice);
    const closeButton = notice.querySelector(".pre-v1-commercial-notice-close");
    const actionButton = notice.querySelector(".pre-v1-commercial-notice-action");

    closeButton?.addEventListener("click", dismiss);
    actionButton?.addEventListener("click", dismiss);

    notice.addEventListener("click", (event) => {
      if (event.target === notice) dismiss();
    });

    notice.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }

      keepFocusInsideNotice(notice, event);
    });

    return notice;
  }

  async function show({ audience = "user", profile: explicitProfile = null, delay = 650 } = {}) {
    const announcement = ANNOUNCEMENTS[audience];
    if (!announcement) return false;

    try {
      await window.SonaraCommercial?.ready?.();
    } catch {
      // SonaraCommercial conserve son fallback central PRE_V1.
    }

    if (window.SonaraCommercial?.getState?.().mode !== "PRE_V1") {
      return false;
    }

    const profile = getProfile(explicitProfile);
    if (!profile) return false;

    if (audience === "artist" && !["artist", "both"].includes(profile.role)) {
      return false;
    }

    if (audience === "user" && profile.role === "artist") {
      return false;
    }

    const storageKey = getStorageKey(profile);
    if (
      !storageKey ||
      profile[announcement.seenField] === announcement.version ||
      hasSeenAnnouncement(storageKey, announcement)
    ) {
      return false;
    }

    const accountAnnouncementState =
      await readAccountAnnouncementState(profile);

    mergeAnnouncementState(storageKey, accountAnnouncementState);

    if (
      accountAnnouncementState[announcement.seenField] === announcement.version ||
      hasSeenAnnouncement(storageKey, announcement)
    ) {
      return false;
    }

    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    if (
      document.querySelector(NOTICE_SELECTOR) ||
      window.SonaraCommercial?.getState?.().mode !== "PRE_V1" ||
      hasSeenAnnouncement(storageKey, announcement)
    ) {
      return false;
    }

    const previouslyFocusedElement = document.activeElement;
    let dismissed = false;

    const notice = createNotice(audience, announcement.version, (currentNotice) => {
      if (dismissed) return;
      dismissed = true;
      markAnnouncementAsSeen(storageKey, announcement);
      syncStoredProfile(profile, announcement);
      void persistAccountAnnouncement(profile, audience, announcement);
      closeNotice(currentNotice, previouslyFocusedElement);
    });

    document.body.appendChild(notice);
    document.body.classList.add("pre-v1-notice-open");

    if (window.lucide) {
      window.lucide.createIcons();
    }

    try {
      await window.SonaraI18n?.ready;
      window.SonaraI18n?.refresh?.();
    } catch {
      // Le français reste affiché si la traduction n'est pas disponible.
    }

    window.requestAnimationFrame(() => {
      notice.classList.add("show");
      notice
        .querySelector(".pre-v1-commercial-notice-close")
        ?.focus({ preventScroll: true });
    });

    return true;
  }

  window.SonaraPreV1Notice = Object.freeze({
    show,
    versions: Object.freeze({
      home: ANNOUNCEMENTS.user.version,
      creator: ANNOUNCEMENTS.artist.version
    })
  });
})();
