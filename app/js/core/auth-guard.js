const SONARA_LANGUAGE_CHOICE_KEY = "sonaraLanguageChoice";
const SONARA_LANGUAGE_LEGACY_CHOICE_KEYS = ["sonaraLanguageChoiceV2", "sonaraLanguageChoiceV1"];

(() => {
  try {
    const hasPermanentChoice = localStorage.getItem(SONARA_LANGUAGE_CHOICE_KEY) === "1";
    const hasLegacyChoice = SONARA_LANGUAGE_LEGACY_CHOICE_KEYS.some(
      (key) => localStorage.getItem(key) === "1"
    );
    const hasLanguageChoice = hasPermanentChoice || hasLegacyChoice;

    if (hasLegacyChoice && !hasPermanentChoice) {
      localStorage.setItem(SONARA_LANGUAGE_CHOICE_KEY, "1");
    }

    // Maintient les anciens caches cohérents pendant la migration.
    if (hasLanguageChoice) {
      SONARA_LANGUAGE_LEGACY_CHOICE_KEYS.forEach(
        (key) => localStorage.setItem(key, "1")
      );
    }

    const entryPath = window.location.pathname.replace(/\/+$/, "") || "/";
    const isEntryPage = entryPath === "/" || /\/index\.html$/i.test(entryPath);

    if (!hasLanguageChoice && !isEntryPage) {
      window.location.replace("/index.html?language=choose");
    }
  } catch {
    // Si le stockage local est indisponible, le reste de l'authentification continue.
  }
})();

const SONARA_AUTH_SCRIPT = document.currentScript;

const SonaraModeration = (() => {
  const decisionLabels = {
    artist_rejection: "Demande artiste refusée",
    pack_rejection: "Pack refusé",
    suspension: "Compte suspendu",
    ban: "Compte banni",
    creator_access_removed: "Accès Creator retiré",
    other: "Décision administrative"
  };

  function injectStyles() {
    if (document.getElementById("sonaraModerationStyles")) return;
    const style = document.createElement("style");
    style.id = "sonaraModerationStyles";
    style.textContent = `
      .sonara-decision-overlay{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:22px;background:rgba(1,4,10,.86);backdrop-filter:blur(12px)}
      .sonara-decision-card{position:relative;width:min(680px,100%);max-height:92vh;overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:28px;padding:30px;background:linear-gradient(160deg,#121927,#090d15);color:#fff;box-shadow:0 34px 100px rgba(0,0,0,.65);font-family:Inter,Arial,sans-serif}
      .sonara-decision-close{position:absolute;right:18px;top:18px;width:42px;height:42px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.06);color:#fff;font-size:25px;cursor:pointer}
      .sonara-decision-kicker{margin:0 52px 8px 0;color:#7ee7ff;font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
      .sonara-decision-card h2{margin:0 52px 14px 0;font-size:clamp(26px,5vw,40px);line-height:1.05}
      .sonara-decision-explanation{color:#c6d0df;line-height:1.65}
      .sonara-decision-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:22px 0}
      .sonara-decision-grid div{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.035)}
      .sonara-decision-grid span{display:block;color:#7f8ca1;font-size:12px;margin-bottom:5px}.sonara-decision-grid strong{overflow-wrap:anywhere}
      .sonara-decision-reason{padding:18px;border-radius:18px;background:rgba(255,91,113,.09);border:1px solid rgba(255,91,113,.2);white-space:pre-wrap;line-height:1.55}
      .sonara-decision-note{margin:16px 0;color:#aab6c7;font-size:14px}
      .sonara-decision-primary,.sonara-decision-send{width:100%;border:0;border-radius:16px;padding:15px 18px;background:#7ee7ff;color:#061019;font-weight:900;cursor:pointer}
      .sonara-decision-form{display:grid;gap:12px;margin-top:15px}.sonara-decision-form[hidden]{display:none}
      .sonara-decision-form textarea{width:100%;min-height:140px;resize:vertical;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:15px;background:#080c13;color:#fff;font:inherit;box-sizing:border-box}
      .sonara-decision-error{min-height:18px;margin:0;color:#ff9baa;font-weight:700;font-size:13px}
      .sonara-decision-final{padding:18px;border-radius:18px;background:rgba(126,231,255,.08);border:1px solid rgba(126,231,255,.2);white-space:pre-wrap;line-height:1.6}
      @media(max-width:620px){.sonara-decision-card{padding:24px 18px;border-radius:22px}.sonara-decision-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function getSeenDecisionKey(item, accountId, stage) {
    return `sonaraModerationSeen:${accountId}:${item.appealId || item.id}:${stage}`;
  }

  function wasSeenLocally(item, accountId, stage) {
    try {
      return localStorage.getItem(getSeenDecisionKey(item, accountId, stage)) === "1";
    } catch {
      return false;
    }
  }

  function markSeenLocally(item, accountId, stage) {
    try {
      localStorage.setItem(getSeenDecisionKey(item, accountId, stage), "1");
    } catch {
      // La suppression serveur reste prioritaire.
    }
  }

  async function forfeitBanDecision(item, accountId, { background = false } = {}) {
    const url = `${API_URL}/api/appeals/${encodeURIComponent(item.appealId || item.id)}/forfeit`;
    const payload = JSON.stringify({ accountId });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "La suppression définitive n’a pas pu être confirmée.");
    return data;
  }

  async function markRead(item, accountId, stage) {
    markSeenLocally(item, accountId, stage);

    try {
      await fetch(`${API_URL}/api/appeals/${encodeURIComponent(item.appealId || item.id)}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, stage }),
        keepalive: true
      });
    } catch (error) {
      console.warn("Décision de modération non confirmée :", error);
    }
  }

  function formatDate(value) {
    if (!value) return "Date inconnue";
    try {
      return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  function showPopup(item, profile) {
    injectStyles();
    document.querySelector(".sonara-decision-overlay")?.remove();

    return new Promise((resolve) => {
      const accountId = String(profile.accountId || profile.id || "");
      const isFinal = item.appealSubmitted === true && item.active === false && Boolean(item.finalResponse);
      const readStage = isFinal ? "final" : "initial";

      const isForfeitableBan =
        !isFinal &&
        item.appealSubmitted !== true &&
        String(item.decisionType || "").toLowerCase() === "ban";
      let appealSubmitted = false;
      let appealSubmissionInProgress = false;
      let forfeitureStarted = false;

      // Un bannissement est une opportunité unique : fermer, actualiser ou quitter
      // sans avoir envoyé la contestation déclenche la destruction définitive.
      if (isForfeitableBan) {
        markSeenLocally(item, accountId, readStage);
      } else {
        void markRead(item, accountId, readStage);
      }

      const overlay = document.createElement("section");
      overlay.className = "sonara-decision-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      const card = document.createElement("article");
      card.className = "sonara-decision-card";
      const close = document.createElement("button");
      close.className = "sonara-decision-close";
      close.type = "button";
      close.setAttribute("aria-label", "Fermer");
      close.textContent = "×";

      const kicker = document.createElement("p");
      kicker.className = "sonara-decision-kicker";
      kicker.textContent = isFinal ? "Décision sur votre contestation" : "Décision de modération";

      const title = document.createElement("h2");
      title.textContent = isFinal
        ? (item.finalDecision === "accepted" ? "Contestation acceptée" : "Contestation refusée")
        : (decisionLabels[item.decisionType] || decisionLabels.other);

      const explanation = document.createElement("p");
      explanation.className = "sonara-decision-explanation";
      explanation.textContent = isFinal
        ? "Le staff Sonara a terminé l’étude de votre contestation."
        : "Cette décision concerne votre demande ou votre accès Sonara. Un refus de demande artiste ou de pack n’est pas forcément un bannissement.";

      const grid = document.createElement("div");
      grid.className = "sonara-decision-grid";
      const details = [
        ["Type", decisionLabels[item.decisionType] || "Décision administrative"],
        ["Ressource", item.resourceId || "Compte artiste"],
        ["Date", formatDate(isFinal ? item.decidedAt : item.createdAt)],
        ["Environnement", String(item.environment || window.SONARA_ENV || "local").toUpperCase()]
      ];
      details.forEach(([label, value]) => {
        const node = document.createElement("div");
        const span = document.createElement("span");
        span.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = value;
        node.append(span, strong);
        grid.appendChild(node);
      });

      const reason = document.createElement("div");
      reason.className = isFinal ? "sonara-decision-final" : "sonara-decision-reason";
      reason.textContent = isFinal ? item.finalResponse : (item.initialReason || "Aucun motif communiqué.");

      const clearForfeitureListener = () => {
        window.removeEventListener("pagehide", forfeitOnPageExit);
      };

      const destroyLocalSession = () => {
        localStorage.removeItem("sonaraProfile");
        localStorage.removeItem("sonaraProfileCreated");
      };

      const forfeitOnPageExit = () => {
        if (
          !isForfeitableBan ||
          appealSubmitted ||
          appealSubmissionInProgress ||
          forfeitureStarted
        ) return;
        forfeitureStarted = true;
        void forfeitBanDecision(item, accountId, { background: true }).catch((error) => {
          console.warn("Suppression définitive à relancer :", error);
        });
      };

      if (isForfeitableBan) {
        window.addEventListener("pagehide", forfeitOnPageExit, { once: true });
      }

      const closePopup = async () => {
        if (appealSubmissionInProgress) {
          explanation.textContent = "Envoi de la contestation en cours…";
          return;
        }

        close.disabled = true;

        if (isForfeitableBan && !appealSubmitted) {
          forfeitureStarted = true;
          clearForfeitureListener();
          try {
            await forfeitBanDecision(item, accountId);
            destroyLocalSession();
            overlay.remove();
            window.location.replace("/app/pages/auth/inscription.html");
            resolve({ closed: true, contested: false, permanentlyDeleted: true });
          } catch (error) {
            close.disabled = false;
            explanation.textContent = error.message;
          }
          return;
        }

        clearForfeitureListener();
        overlay.remove();
        resolve({ closed: true, contested: appealSubmitted });
      };
      close.addEventListener("click", closePopup);

      card.append(close, kicker, title, explanation, grid, reason);

      if (!isFinal && item.appealSubmitted !== true) {
        const note = document.createElement("p");
        note.className = "sonara-decision-note";
        note.textContent = isForfeitableBan
          ? "Attention : fermer, actualiser ou quitter sans envoyer la contestation supprimera définitivement votre compte artiste et tout son contenu."
          : "Vous pouvez fermer cette information ou envoyer une contestation au staff.";

        const contest = document.createElement("button");
        contest.type = "button";
        contest.className = "sonara-decision-primary";
        contest.textContent = "Contester la décision";

        const form = document.createElement("form");
        form.className = "sonara-decision-form";
        form.hidden = true;
        const textarea = document.createElement("textarea");
        textarea.placeholder = "Expliquez clairement pourquoi vous contestez cette décision…";
        textarea.maxLength = 4000;
        const error = document.createElement("p");
        error.className = "sonara-decision-error";
        const send = document.createElement("button");
        send.className = "sonara-decision-send";
        send.type = "submit";
        send.textContent = "Envoyer la contestation";
        form.append(textarea, error, send);

        contest.addEventListener("click", () => {
          contest.hidden = true;
          form.hidden = false;
          textarea.focus();
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const message = textarea.value.trim();
          if (message.length < 10) {
            error.textContent = "Écrivez au moins 10 caractères pour expliquer votre contestation.";
            return;
          }
          send.disabled = true;
          close.disabled = true;
          appealSubmissionInProgress = true;
          send.textContent = "Envoi…";
          error.textContent = "";
          try {
            const response = await fetch(`${API_URL}/api/appeals`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                decisionId: item.id,
                accountId,
                message
              })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || "La contestation n’a pas pu être envoyée.");
            appealSubmitted = true;
            appealSubmissionInProgress = false;
            clearForfeitureListener();
            title.textContent = "Contestation envoyée";
            explanation.textContent = "Votre message est maintenant visible dans la section Contestations du dashboard Founder.";
            reason.textContent = message;
            note.remove();
            contest.remove();
            form.remove();
            const done = document.createElement("button");
            done.className = "sonara-decision-primary";
            done.type = "button";
            done.textContent = "Fermer";
            done.addEventListener("click", () => {
              overlay.remove();
              resolve({ closed: true, contested: true });
            });
            card.appendChild(done);
          } catch (requestError) {
            appealSubmissionInProgress = false;
            error.textContent = requestError.message;
            send.disabled = false;
            close.disabled = false;
            send.textContent = "Envoyer la contestation";
          }
        });

        card.append(note, contest, form);
      }

      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }

  async function showNext(profile) {
    const accountId = String(profile?.accountId || profile?.id || "");
    if (!accountId || typeof API_URL === "undefined") return null;

    try {
      const response = await fetch(`${API_URL}/api/appeals/decisions/${encodeURIComponent(accountId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Impossible de récupérer les décisions.");
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data.decisions) ? data.decisions : [];
      if (!items.length) return null;

      const alreadyConsumedBan = items.find((item) => {
        const isInitialBan =
          item.appealSubmitted !== true &&
          String(item.decisionType || "").toLowerCase() === "ban";
        return isInitialBan && wasSeenLocally(item, accountId, "initial");
      });

      if (alreadyConsumedBan) {
        await forfeitBanDecision(alreadyConsumedBan, accountId, { background: true });
        localStorage.removeItem("sonaraProfile");
        localStorage.removeItem("sonaraProfileCreated");
        window.location.replace("/app/pages/auth/inscription.html");
        return { permanentlyDeleted: true };
      }

      const nextItem = items.find((item) => {
        const isFinal = item.appealSubmitted === true && item.active === false && Boolean(item.finalResponse);
        const stage = isFinal ? "final" : "initial";
        return !wasSeenLocally(item, accountId, stage);
      });

      if (!nextItem) return null;
      return await showPopup(nextItem, profile);
    } catch (error) {
      console.warn("Décisions de modération indisponibles :", error);
      return null;
    }
  }

  return { showNext };
})();

window.SonaraModeration = SonaraModeration;

async function waitForSonaraApiUrl(timeoutMs = 10000) {
  const startedAt = Date.now();

  while (typeof API_URL === "undefined") {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("La configuration Sonara n'est pas disponible.");
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return API_URL;
}

async function fetchSonaraAuthWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getSonaraAuthMode() {
  return String(
    SONARA_AUTH_SCRIPT?.dataset?.sonaraAuth ||
    document.documentElement?.dataset?.sonaraAuth ||
    "required"
  ).toLowerCase();
}

function clearSonaraLocalSession() {
  if (window.SonaraSession?.clear) {
    window.SonaraSession.clear();
    return;
  }

  localStorage.removeItem("sonaraProfile");
  localStorage.removeItem("sonaraProfileCreated");
  localStorage.removeItem("sonaraSessionToken");
  localStorage.removeItem("sonaraKnownAccounts");
  sessionStorage.removeItem("sonaraSessionToken");
  sessionStorage.removeItem("sonaraKnownAccounts");
}

function getStoredSonaraProfile() {
  const rawProfile = localStorage.getItem("sonaraProfile");

  if (!rawProfile) return null;

  try {
    return JSON.parse(rawProfile);
  } catch {
    clearSonaraLocalSession();
    return null;
  }
}

function showSonaraAuthServerError() {
  if (document.getElementById("sonaraAuthServerError")) return;

  const render = () => {
    if (!document.body || document.getElementById("sonaraAuthServerError")) return;

    const overlay = document.createElement("section");
    overlay.id = "sonaraAuthServerError";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      display: "grid",
      placeItems: "center",
      padding: "24px",
      background: "rgba(2, 5, 12, .94)",
      color: "#fff",
      fontFamily: "Inter, Arial, sans-serif",
      textAlign: "center"
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "min(520px, 100%)",
      padding: "26px",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: "22px",
      background: "#0d1420",
      boxShadow: "0 30px 90px rgba(0,0,0,.55)"
    });

    const title = document.createElement("h2");
    title.textContent = "Connexion au serveur impossible";
    title.style.margin = "0 0 10px";

    const message = document.createElement("p");
    message.textContent = "Sonara ne peut pas vérifier votre compte. Aucun accès local n'est autorisé sans confirmation du serveur.";
    Object.assign(message.style, {
      margin: "0 0 18px",
      color: "#b9c4d3",
      lineHeight: "1.6"
    });

    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Réessayer";
    Object.assign(retry.style, {
      width: "100%",
      border: "0",
      borderRadius: "14px",
      padding: "14px 18px",
      background: "#7ee7ff",
      color: "#071019",
      fontWeight: "900",
      cursor: "pointer"
    });
    retry.addEventListener("click", () => window.location.reload());

    card.append(title, message, retry);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  };

  if (document.body) render();
  else window.addEventListener("DOMContentLoaded", render, { once: true });
}

function normalizeProfilePayload(payload) {
  return payload?.profile || payload;
}


function platformActivityDayKey() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function reportSonaraPlatformActivity(apiUrl, profile) {
  const accountId = String(profile?.accountId || profile?.id || "").trim();
  if (!accountId) return;

  // Ping léger : le serveur garde la vraie frontière de session à 30 min.
  // Côté navigateur on évite simplement de requêter à chaque navigation/refresh.
  const pingIntervalMs = 5 * 60 * 1000;
  const now = Date.now();
  const environmentKey = String(window.location.origin || window.location.hostname || "sonara");
  const storageKey = `sonaraPlatformActivityPing:${environmentKey}:${accountId}`;

  try {
    const previousPing = Number(localStorage.getItem(storageKey) || 0);
    if (previousPing > 0 && now - previousPing < pingIntervalMs) return;
    localStorage.setItem(storageKey, String(now));
  } catch {
    // Le serveur déduplique aussi les sessions : le tracking continue sans stockage local.
  }

  try {
    const response = await fetch(`${apiUrl}/api/platform/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
      keepalive: true
    });

    if (!response.ok) {
      try {
        if (localStorage.getItem(storageKey) === String(now)) {
          localStorage.removeItem(storageKey);
        }
      } catch {}
      return;
    }
  } catch (error) {
    try {
      if (localStorage.getItem(storageKey) === String(now)) {
        localStorage.removeItem(storageKey);
      }
    } catch {}
    console.warn("Activité Sonara non enregistrée :", error);
  }
}

function isFullAccountBlocked(profile) {
  const status = String(profile?.status || "").toLowerCase();
  return ["banned", "rejected", "suspended", "deleted", "disabled"].includes(status);
}

function isArtistAccessRemoved(profile) {
  const role = String(profile?.role || "").toLowerCase();
  const status = String(profile?.status || "").toLowerCase();
  const artistStatus = String(profile?.artistStatus || "").toLowerCase();

  return role === "user" && ["banned", "rejected", "suspended"].includes(artistStatus) ||
    role === "both" && ["banned", "rejected", "suspended"].includes(status);
}

async function verifySonaraSession(options = {}) {
  const mode = String(options.mode || getSonaraAuthMode()).toLowerCase();
  const redirectOnFailure = options.redirectOnFailure ?? (mode === "required");

  const storedProfile = getStoredSonaraProfile();
  const storedAccountId = String(
    storedProfile?.accountId || storedProfile?.id || ""
  ).trim();

  // MAIN/compte : l'identité locale doit être cohérente avant même l'appel serveur.
  // Si accountId et id existent tous les deux, ils doivent désigner exactement
  // le même compte. Un userId racine n'est jamais utilisé pour choisir un compte.
  const storedExplicitAccountId = String(storedProfile?.accountId || "").trim();
  const storedLegacyId = String(storedProfile?.id || "").trim();
  const localIdentityMismatch = Boolean(
    storedExplicitAccountId &&
    storedLegacyId &&
    storedExplicitAccountId !== storedLegacyId
  );

  if (!storedAccountId || localIdentityMismatch) {
    clearSonaraLocalSession();

    if (mode === "optional") {
      return { ok: true, mode, optional: true, profile: null };
    }

    if (redirectOnFailure) {
      redirectToInscription();
    }

    return { ok: false, mode, reason: "missing_profile", profile: null };
  }

  try {
    const apiUrl = await waitForSonaraApiUrl();
    const response = await fetchSonaraAuthWithTimeout(
      `${apiUrl}/api/profile/${encodeURIComponent(storedAccountId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" }
      },
      8000
    );

    if ([401, 403, 404].includes(response.status)) {
      clearSonaraLocalSession();

      if (redirectOnFailure) {
        redirectToInscription();
      }

      return { ok: false, mode, reason: "profile_not_found", profile: null };
    }

    if (!response.ok) {
      throw new Error(`Erreur de vérification : ${response.status}`);
    }

    const freshProfile = normalizeProfilePayload(
      await response.json().catch(() => null)
    );

    const verifiedAccountId = String(
      freshProfile?.accountId || freshProfile?.id || ""
    ).trim();

    if (!verifiedAccountId || !freshProfile?.role) {
      clearSonaraLocalSession();

      if (redirectOnFailure) {
        redirectToInscription();
      }

      return { ok: false, mode, reason: "invalid_profile", profile: null };
    }

    if (verifiedAccountId !== storedAccountId) {
      console.error("Identité Sonara refusée : accountId serveur différent de l'accountId demandé.");
      clearSonaraLocalSession();

      if (redirectOnFailure) {
        redirectToInscription();
      }

      return { ok: false, mode, reason: "identity_mismatch", profile: null };
    }

    localStorage.setItem("sonaraProfile", JSON.stringify(freshProfile));
    localStorage.setItem("sonaraProfileCreated", "true");

    void reportSonaraPlatformActivity(apiUrl, freshProfile);

    const moderationResult = await SonaraModeration.showNext(freshProfile);

    if (moderationResult?.permanentlyDeleted) {
      clearSonaraLocalSession();
      return { ok: false, mode, reason: "permanently_deleted", profile: null };
    }

    const artistAccessRemoved = isArtistAccessRemoved(freshProfile);

    if (!artistAccessRemoved && isFullAccountBlocked(freshProfile)) {
      clearSonaraLocalSession();

      if (redirectOnFailure) {
        redirectToInscription();
      }

      return { ok: false, mode, reason: "blocked", profile: null };
    }

    const moderationNotice = freshProfile.moderationNotice;
    if (
      moderationNotice?.type === "creator_access_restored" &&
      moderationNotice.read !== true &&
      ["artist", "both"].includes(String(freshProfile.role || "").toLowerCase())
    ) {
      const message = moderationNotice.message || "Ton accès Creator a été restauré.";
      const displayNotice = () => {
        const toast = document.createElement("div");
        toast.textContent = message;
        Object.assign(toast.style, {
          position: "fixed",
          left: "50%",
          bottom: "28px",
          transform: "translateX(-50%)",
          zIndex: "99999",
          maxWidth: "min(520px, 88vw)",
          padding: "14px 18px",
          borderRadius: "16px",
          background: "#111827",
          color: "#ffffff",
          boxShadow: "0 18px 50px rgba(0,0,0,.35)",
          fontWeight: "700",
          textAlign: "center"
        });
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 6500);
      };

      if (document.body) displayNotice();
      else window.addEventListener("DOMContentLoaded", displayNotice, { once: true });

      fetch(`${apiUrl}/api/profile/${encodeURIComponent(freshProfile.accountId)}/moderation-notice/read`, {
        method: "PATCH"
      }).catch((error) => console.warn("Notice de modération non confirmée :", error));

      freshProfile.moderationNotice = {
        ...moderationNotice,
        read: true,
        readAt: new Date().toISOString()
      };
      localStorage.setItem("sonaraProfile", JSON.stringify(freshProfile));
    }

    return {
      ok: true,
      mode,
      profile: freshProfile,
      artistAccessRemoved
    };
  } catch (error) {
    console.error("Impossible de vérifier la session :", error);

    return {
      ok: false,
      mode,
      reason: "server_unavailable",
      profile: null,
      error
    };
  }
}

function redirectToInscription() {
  const inscriptionPath = "/app/pages/auth/inscription.html";

  if (window.location.pathname.endsWith(inscriptionPath)) {
    return;
  }

  window.location.replace(inscriptionPath);
}

const SonaraAuth = {
  ready: null,
  verify: verifySonaraSession,
  clear: clearSonaraLocalSession,
  getStoredProfile: getStoredSonaraProfile,
  mode: getSonaraAuthMode()
};

window.SonaraAuth = SonaraAuth;

async function verifyRequiredSessionWithRetry() {
  const deadline = Date.now() + 60000;
  let attempt = 0;
  let result = null;

  do {
    attempt += 1;
    result = await verifySonaraSession({
      mode: SonaraAuth.mode,
      redirectOnFailure: SonaraAuth.mode === "required"
    });

    if (result?.reason !== "server_unavailable") {
      return result;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const retryDelay = Math.min(2500, 650 + Math.max(0, attempt - 1) * 350);
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryDelay, remaining)));
  } while (Date.now() < deadline);

  if (SonaraAuth.mode === "required") {
    showSonaraAuthServerError();
  }

  return result || {
    ok: false,
    mode: SonaraAuth.mode,
    reason: "server_unavailable",
    profile: null
  };
}

function bootstrapSonaraAuth() {
  if (SonaraAuth.ready) return SonaraAuth.ready;

  // L'écran d'entrée possède déjà son propre budget global de 60 secondes.
  // Les pages protégées directes utilisent le même principe ici.
  SonaraAuth.ready = SonaraAuth.mode === "required"
    ? verifyRequiredSessionWithRetry()
    : verifySonaraSession({ mode: SonaraAuth.mode });

  window.sonaraPageSessionReady = SonaraAuth.ready;
  return SonaraAuth.ready;
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bootstrapSonaraAuth, { once: true });
} else {
  bootstrapSonaraAuth();
}
