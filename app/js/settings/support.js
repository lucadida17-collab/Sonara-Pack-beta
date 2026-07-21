const appLayout = document.querySelector(".app-layout");

const supportState = {
  tickets: [],
  loading: false
};

function getSupportProfile() {
  try {
    return JSON.parse(localStorage.getItem("sonaraProfile")) || {};
  } catch (error) {
    console.error("Impossible de récupérer le profil :", error);
    return {};
  }
}

function getSupportAccountId(profile) {
  return String(profile.accountId || profile.id || "");
}

function getSupportRootUserId(profile) {
  return String(profile.userId || profile.rootUserId || "");
}

function escapeSupportHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


async function readSupportJson(response) {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`Réponse vide du serveur (${response.status}).`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      `Réponse serveur invalide (${response.status})${preview ? ` : ${preview}` : ""}`
    );
  }
}


function supportSenderLabel(sender) {
  return sender === "founder" ? "Équipe Sonara" : "Vous";
}

function supportStatusLabel(status) {
  const labels = {
    open: "Ouvert",
    in_progress: "En cours",
    resolved: "Résolu",
    closed: "Fermé"
  };

  return labels[status] || "Ouvert";
}

function renderSupportHome() {
  appLayout.innerHTML = `
    <section class="support-page">
      <header class="support-header">
        <button type="button" class="support-icon-button support-back-button" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="support-title">Support</h1>

        <div class="support-header-space"></div>
      </header>

      <main class="support-content support-home-content">
        <section class="support-menu-group">
          <button type="button" class="support-menu-row support-create-button">
            <span class="support-menu-row-left">
              <i data-lucide="message-square-plus"></i>
              <span>Envoyer une demande</span>
            </span>
            <i data-lucide="chevron-right" class="support-chevron"></i>
          </button>

          <button type="button" class="support-menu-row support-tickets-button">
            <span class="support-menu-row-left">
              <i data-lucide="inbox"></i>
              <span>Mes demandes</span>
            </span>
            <i data-lucide="chevron-right" class="support-chevron"></i>
          </button>

          <button type="button" class="support-menu-row support-help-button">
            <span class="support-menu-row-left">
              <i data-lucide="circle-help"></i>
              <span>Aide rapide</span>
            </span>
            <i data-lucide="chevron-right" class="support-chevron"></i>
          </button>
        </section>

        <p class="support-home-note">
          Une question sur votre compte, un paiement, un téléchargement ou un pack ? Envoyez-nous une demande.
        </p>
      </main>
    </section>
  `;

  lucide.createIcons();

  document.querySelector(".support-back-button").addEventListener("click", () => {
    window.location.href = "../settings.html";
  });

  document.querySelector(".support-create-button").addEventListener("click", () => {
    renderSupportForm();
  });

  document.querySelector(".support-tickets-button").addEventListener("click", () => {
    renderSupportTickets();
  });

  document.querySelector(".support-help-button").addEventListener("click", () => {
    renderSupportHelp();
  });
}


function renderSupportHelp() {
  const helpItems = [
    {
      icon: "log-in",
      title: "Je n’arrive pas à me connecter",
      answer: "Vérifiez votre adresse e-mail et votre mot de passe. Si le problème continue, envoyez une demande dans la catégorie Compte.",
      category: "account"
    },
    {
      icon: "download",
      title: "Mon téléchargement ne fonctionne pas",
      answer: "Vérifiez votre connexion et relancez le téléchargement depuis votre bibliothèque. Si le fichier reste indisponible, contactez le support.",
      category: "download"
    },
    {
      icon: "credit-card",
      title: "Mon paiement a échoué",
      answer: "Vérifiez les informations de votre carte et réessayez. Aucun débit ne doit apparaître si le paiement a échoué.",
      category: "payment"
    },
    {
      icon: "clock-3",
      title: "Mon pack est en attente",
      answer: "Les packs et profils artistes doivent être vérifiés avant publication. Vous pourrez suivre leur statut depuis votre espace.",
      category: "pack"
    },
    {
      icon: "rotate-ccw",
      title: "Je souhaite un remboursement",
      answer: "Consultez d’abord les conditions de remboursement, puis envoyez une demande avec la référence du paiement.",
      category: "payment"
    }
  ];

  appLayout.innerHTML = `
    <section class="support-page">
      <header class="support-header">
        <button type="button" class="support-icon-button support-help-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="support-title">Aide rapide</h1>

        <div class="support-header-space"></div>
      </header>

      <main class="support-content support-help-content">
        <section class="support-help-list">
          ${helpItems.map((item, index) => `
            <article class="support-help-item">
              <button type="button" class="support-help-question" data-help-index="${index}">
                <span class="support-menu-row-left">
                  <i data-lucide="${item.icon}"></i>
                  <span>${escapeSupportHtml(item.title)}</span>
                </span>
                <i data-lucide="chevron-down" class="support-help-chevron"></i>
              </button>

              <div class="support-help-answer" data-help-answer="${index}" hidden>
                <p>${escapeSupportHtml(item.answer)}</p>
                <button type="button" class="support-help-contact" data-category="${item.category}">
                  Envoyer une demande
                </button>
              </div>
            </article>
          `).join("")}
        </section>
      </main>
    </section>
  `;

  lucide.createIcons();

  document.querySelector(".support-help-back").addEventListener("click", renderSupportHome);

  document.querySelectorAll(".support-help-question").forEach((button) => {
    button.addEventListener("click", () => {
      const index = button.dataset.helpIndex;
      const answer = document.querySelector(`[data-help-answer="${index}"]`);
      const isOpen = !answer.hidden;

      document.querySelectorAll(".support-help-answer").forEach((item) => {
        item.hidden = true;
      });

      document.querySelectorAll(".support-help-question").forEach((item) => {
        item.classList.remove("active");
      });

      answer.hidden = isOpen;
      button.classList.toggle("active", !isOpen);
    });
  });

  document.querySelectorAll(".support-help-contact").forEach((button) => {
    button.addEventListener("click", () => {
      renderSupportForm(button.dataset.category || "");
    });
  });
}

function renderSupportForm(initialCategory = "") {
  const profile = getSupportProfile();
  const displayName = profile.pseudo || profile.username || profile.firstname || "Votre compte";
  const email = profile.mail || profile.email || "Adresse e-mail non renseignée";

  appLayout.innerHTML = `
    <section class="support-page">
      <header class="support-header">
        <button type="button" class="support-icon-button support-form-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="support-title">Nouvelle demande</h1>

        <div class="support-header-space"></div>
      </header>

      <main class="support-content support-form-content">
        <section class="support-account-card">
          <div class="support-account-icon">
            <i data-lucide="user-round"></i>
          </div>
          <div>
            <strong>${escapeSupportHtml(displayName)}</strong>
            <small>${escapeSupportHtml(email)}</small>
          </div>
        </section>

        <form class="support-form" novalidate>
          <div class="support-field">
            <label for="support-category">Catégorie</label>
            <div class="support-select-wrapper">
              <select id="support-category" class="support-input support-category-input" required>
                <option value="">Choisir une catégorie</option>
                <option value="account">Compte</option>
                <option value="payment">Paiement</option>
                <option value="download">Téléchargement</option>
                <option value="pack">Pack</option>
                <option value="artist">Artiste</option>
                <option value="security">Sécurité / fraude</option>
                <option value="other">Autre</option>
              </select>
              <i data-lucide="chevron-down"></i>
            </div>
            <p class="support-field-message" data-for="category"></p>
          </div>

          <div class="support-field">
            <label for="support-subject">Objet</label>
            <input id="support-subject" class="support-input support-subject-input" type="text" maxlength="100" placeholder="Résumez votre problème" required>
            <p class="support-field-message" data-for="subject"></p>
          </div>

          <div class="support-field">
            <label for="support-message">Description</label>
            <textarea id="support-message" class="support-input support-message-input" maxlength="2000" placeholder="Expliquez précisément ce qu’il s’est passé…" required></textarea>
            <div class="support-message-meta">
              <p class="support-field-message" data-for="message"></p>
              <span class="support-character-count">0 / 2000</span>
            </div>
          </div>

          <div class="support-safety-note">
            <i data-lucide="lock-keyhole"></i>
            <p>Ne communiquez jamais votre mot de passe ni un code de vérification à six chiffres.</p>
          </div>

          <div class="support-submit-message" aria-live="polite"></div>

          <button type="submit" class="support-submit-button" disabled>
            Envoyer la demande
          </button>
        </form>
      </main>
    </section>
  `;

  lucide.createIcons();

  const form = document.querySelector(".support-form");
  const categoryInput = document.querySelector(".support-category-input");
  const subjectInput = document.querySelector(".support-subject-input");
  const messageInput = document.querySelector(".support-message-input");
  const submitButton = document.querySelector(".support-submit-button");
  const characterCount = document.querySelector(".support-character-count");
  const submitMessage = document.querySelector(".support-submit-message");

  if (initialCategory) {
    categoryInput.value = initialCategory;
  }

  function setFieldMessage(field, message = "") {
    const element = document.querySelector(`.support-field-message[data-for="${field}"]`);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("active", Boolean(message));
  }

  function validateForm(showErrors = false) {
    const categoryValid = Boolean(categoryInput.value);
    const subjectValid = subjectInput.value.trim().length >= 3;
    const messageValid = messageInput.value.trim().length >= 10;

    if (showErrors) {
      setFieldMessage("category", categoryValid ? "" : "Choisissez une catégorie.");
      setFieldMessage("subject", subjectValid ? "" : "L’objet doit contenir au moins 3 caractères.");
      setFieldMessage("message", messageValid ? "" : "La description doit contenir au moins 10 caractères.");
    }

    submitButton.disabled = !(categoryValid && subjectValid && messageValid);
    return categoryValid && subjectValid && messageValid;
  }

  [categoryInput, subjectInput, messageInput].forEach((input) => {
    input.addEventListener("input", () => {
      submitMessage.textContent = "";
      submitMessage.className = "support-submit-message";
      validateForm(false);
    });
  });

  messageInput.addEventListener("input", () => {
    characterCount.textContent = `${messageInput.value.length} / 2000`;
  });

  document.querySelector(".support-form-back").addEventListener("click", renderSupportHome);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateForm(true)) return;

    submitButton.disabled = true;
    submitButton.textContent = "Envoi…";
    submitMessage.textContent = "";
    submitMessage.className = "support-submit-message";

    const payload = {
      rootUserId: getSupportRootUserId(profile),
      accountId: getSupportAccountId(profile),
      pseudo: profile.pseudo || profile.username || "",
      email: profile.mail || profile.email || "",
      role: profile.role || "user",
      category: categoryInput.value,
      subject: subjectInput.value.trim(),
      message: messageInput.value.trim()
    };

    try {
      const response = await fetch(`${API_URL}/api/support/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await readSupportJson(response);

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Impossible d’envoyer la demande.");
      }

      submitMessage.className = "support-submit-message success";
      submitMessage.innerHTML = `Demande envoyée. Numéro du ticket : <strong>${escapeSupportHtml(data.ticket?.ticketId || data.ticket?.id || "Ticket créé")}</strong>`;

      form.reset();
      characterCount.textContent = "0 / 2000";
      submitButton.textContent = "Demande envoyée";
      submitButton.disabled = true;
    } catch (error) {
      submitMessage.className = "support-submit-message error";
      submitMessage.textContent = error.message;
      submitButton.textContent = "Envoyer la demande";
      validateForm(false);
    }
  });

  validateForm(false);
}

async function renderSupportTickets() {
  const profile = getSupportProfile();
  const accountId = getSupportAccountId(profile);

  appLayout.innerHTML = `
    <section class="support-page">
      <header class="support-header">
        <button type="button" class="support-icon-button support-tickets-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>

        <h1 class="support-title">Mes demandes</h1>

        <div class="support-header-space"></div>
      </header>

      <main class="support-content">
        <div class="support-loading">
          <span class="support-loader"></span>
          <p>Chargement de vos demandes…</p>
        </div>
      </main>
    </section>
  `;

  lucide.createIcons();
  document.querySelector(".support-tickets-back").addEventListener("click", renderSupportHome);

  const content = document.querySelector(".support-content");

  if (!accountId) {
    content.innerHTML = `
      <div class="support-empty-state">
        <i data-lucide="circle-alert"></i>
        <h2>Compte introuvable</h2>
        <p>Reconnectez-vous pour afficher vos demandes.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/support/tickets/${encodeURIComponent(accountId)}`);
    const data = await readSupportJson(response);

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Impossible de charger les demandes.");
    }

    supportState.tickets = Array.isArray(data.tickets) ? data.tickets : [];

    if (supportState.tickets.length === 0) {
      content.innerHTML = `
        <div class="support-empty-state">
          <i data-lucide="inbox"></i>
          <h2>Aucune demande</h2>
          <p>Vos futures demandes apparaîtront ici.</p>
          <button type="button" class="support-empty-button">Créer une demande</button>
        </div>
      `;
      lucide.createIcons();
      document.querySelector(".support-empty-button").addEventListener("click", () => renderSupportForm());
      return;
    }

    content.innerHTML = `
      <section class="support-ticket-list">
        ${supportState.tickets.map((ticket) => `
          <article class="support-ticket-card">
            <div class="support-ticket-topline">
              <span class="support-ticket-id">${escapeSupportHtml(ticket.ticketId || ticket.id)}</span>
              <span class="support-ticket-status status-${escapeSupportHtml(ticket.status || "open")}">
                ${supportStatusLabel(ticket.status)}
              </span>
            </div>

            <h2>${escapeSupportHtml(ticket.subject || "Demande sans objet")}</h2>

            <div class="support-conversation">
              <article class="support-message support-message-user">
                <span>Vous</span>
                <p>${escapeSupportHtml(ticket.message || "")}</p>
                <time>${new Date(ticket.createdAt).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}</time>
              </article>

              ${(Array.isArray(ticket.replies) ? ticket.replies : []).map((reply) => `
                <article class="support-message ${reply.sender === "founder" ? "support-message-founder" : "support-message-user"}">
                  <span>${supportSenderLabel(reply.sender)}</span>
                  <p>${escapeSupportHtml(reply.message || "")}</p>
                  <time>${new Date(reply.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}</time>
                </article>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </section>
    `;
  } catch (error) {
    content.innerHTML = `
      <div class="support-empty-state">
        <i data-lucide="triangle-alert"></i>
        <h2>Chargement impossible</h2>
        <p>${escapeSupportHtml(error.message)}</p>
      </div>
    `;
    lucide.createIcons();
  }
}

renderSupportHome();
