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

  async function markRead(item, accountId, stage) {
    try {
      await fetch(`${API_URL}/api/appeals/${encodeURIComponent(item.appealId || item.id)}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, stage })
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

      const closePopup = async () => {
        close.disabled = true;
        if (isFinal) {
          await markRead(item, accountId, "final");
        }
        overlay.remove();
        resolve({ closed: true, contested: false });
      };
      close.addEventListener("click", closePopup);

      card.append(close, kicker, title, explanation, grid, reason);

      if (!isFinal && item.appealSubmitted !== true) {
        const note = document.createElement("p");
        note.className = "sonara-decision-note";
        note.textContent = "Vous pouvez fermer cette information ou envoyer une contestation au staff.";

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
            error.textContent = requestError.message;
            send.disabled = false;
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
      return await showPopup(items[0], profile);
    } catch (error) {
      console.warn("Décisions de modération indisponibles :", error);
      return null;
    }
  }

  return { showNext };
})();

window.SonaraModeration = SonaraModeration;

async function verifySonaraSession() {
  const storedProfile = localStorage.getItem("sonaraProfile");

  if (!storedProfile) {
    redirectToInscription();
    return false;
  }

  let profile;

  try {
    profile = JSON.parse(storedProfile);
  } catch (error) {
    redirectToInscription();
    return false;
  }

  const profileId = profile?.accountId || profile?.id;

  if (!profileId) {
    redirectToInscription();
    return false;
  }

  try {
    const response = await fetch(
      `${API_URL}/api/profile/${encodeURIComponent(profileId)}`
    );

    if (
      response.status === 404 ||
      response.status === 401 ||
      response.status === 403
    ) {
      console.warn(
        "Profil distant temporairement non vérifiable : session locale conservée."
      );
      return true;
    }

    if (!response.ok) {
      throw new Error(`Erreur de vérification : ${response.status}`);
    }

    const freshProfile = await response.json();
    const freshRole = String(freshProfile.role || "").toLowerCase();
    const freshStatus = String(freshProfile.status || "").toLowerCase();

    const artistAccessRemoved =
      freshRole === "both" &&
      (
        freshStatus === "banned" ||
        freshStatus === "rejected" ||
        freshProfile.artistStatus === "banned" ||
        freshProfile.artistStatus === "rejected" ||
        freshProfile.artistStatus === "suspended"
      );

    if (artistAccessRemoved) {
      freshProfile.role = "user";
      freshProfile.status = "approved";
      freshProfile.artistStatus = freshProfile.artistStatus || freshStatus;
    }

    localStorage.setItem("sonaraProfile", JSON.stringify(freshProfile));

    await SonaraModeration.showNext(freshProfile);

    if (
      !artistAccessRemoved &&
      ["banned", "rejected", "suspended"].includes(freshStatus)
    ) {
      redirectToInscription();
      return false;
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

      fetch(`${API_URL}/api/profile/${encodeURIComponent(freshProfile.accountId)}/moderation-notice/read`, {
        method: "PATCH"
      }).catch((error) => console.warn("Notice de modération non confirmée :", error));

      freshProfile.moderationNotice = {
        ...moderationNotice,
        read: true,
        readAt: new Date().toISOString()
      };
      localStorage.setItem("sonaraProfile", JSON.stringify(freshProfile));
    }

    return true;
  } catch (error) {
    console.error("Impossible de vérifier la session :", error);

    /*
      Une panne réseau ou Render endormi ne doit jamais
      déconnecter automatiquement le compte déjà enregistré.
    */
    return Boolean(profile);
  }
}

function redirectToInscription() {
  /*
    Cette redirection ne supprime jamais le compte.
    La suppression est réservée au bouton Se déconnecter
    dans les paramètres du compte.
  */
  window.location.replace("/app/pages/inscription.html");
}
