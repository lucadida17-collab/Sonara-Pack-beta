const feedbackLayout = document.querySelector(".app-layout");

const feedbackProfile = (() => {
  try {
    return (
      JSON.parse(localStorage.getItem("sonaraProfile") || "null") ||
      JSON.parse(localStorage.getItem("artistProfile") || "null") ||
      {}
    );
  } catch {
    return {};
  }
})();

const FEEDBACK_TYPES = [
  { value: "general", label: "Avis général", icon: "message-circle" },
  { value: "idea", label: "Idée d’amélioration", icon: "lightbulb" },
  { value: "experience", label: "Expérience utilisateur", icon: "sparkles" },
  { value: "bug", label: "Problème rencontré", icon: "bug" }
];

const FEEDBACK_ATTACHMENT_MAX_FILES = 5;
const FEEDBACK_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;
const FEEDBACK_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);
let feedbackAttachmentFiles = [];
let feedbackAttachmentPreviewUrls = [];

function feedbackClearAttachmentPreviewUrls() {
  feedbackAttachmentPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  feedbackAttachmentPreviewUrls = [];
}

function feedbackResetAttachments() {
  feedbackClearAttachmentPreviewUrls();
  feedbackAttachmentFiles = [];
}


function feedbackEscape(value = "") {
  const element = document.createElement("div");
  element.textContent = String(value);
  return element.innerHTML;
}

function feedbackIcons() {
  if (window.lucide) window.lucide.createIcons();
}

async function feedbackReadJson(response) {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`Réponse vide du serveur (${response.status}).`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse serveur invalide (${response.status}).`);
  }
}

function feedbackApiUrl() {
  if (typeof API_URL === "string" && API_URL.trim()) {
    return API_URL.replace(/\/$/, "");
  }

  return window.location.origin;
}

function renderFeedbackHome() {
  feedbackLayout.innerHTML = `
    <section class="feedback-page">
      <header class="feedback-header">
        <button type="button" class="feedback-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>
        <h1>Feedback</h1>
        <div class="feedback-header-space"></div>
      </header>

      <main class="feedback-content">
        <section class="feedback-intro">
          <span class="feedback-icon">
            <i data-lucide="message-square-more"></i>
          </span>
          <h2>Aide-nous à améliorer Sonara Pack</h2>
          <p>Partage simplement ton avis, une idée ou un problème rencontré.</p>
        </section>

        <section class="feedback-menu">
          <button type="button" class="feedback-menu-row" data-open-feedback>
            <span>
              <i data-lucide="send"></i>
              <strong>Envoyer un commentaire</strong>
            </span>
            <i data-lucide="chevron-right"></i>
          </button>

          <button type="button" class="feedback-menu-row" data-open-feedback="idea">
            <span>
              <i data-lucide="lightbulb"></i>
              <strong>Proposer une idée</strong>
            </span>
            <i data-lucide="chevron-right"></i>
          </button>

          <button type="button" class="feedback-menu-row" data-open-feedback="bug">
            <span>
              <i data-lucide="bug"></i>
              <strong>Signaler un problème</strong>
            </span>
            <i data-lucide="chevron-right"></i>
          </button>

          <button type="button" class="feedback-menu-row" data-open-responses>
            <span>
              <i data-lucide="messages-square"></i>
              <strong>Mes réponses</strong>
            </span>
            <i data-lucide="chevron-right"></i>
          </button>
        </section>
      </main>
    </section>
  `;

  feedbackIcons();

  document.querySelector(".feedback-back")?.addEventListener("click", () => {
    history.back();
  });

  document.querySelectorAll("[data-open-feedback]").forEach((button) => {
    button.addEventListener("click", () => {
      renderFeedbackForm(button.dataset.openFeedback || "general");
    });
  });

  document.querySelector("[data-open-responses]")?.addEventListener("click", () => {
    renderFeedbackResponses();
  });
}


async function renderFeedbackResponses() {
  feedbackLayout.innerHTML = `
    <section class="feedback-page">
      <header class="feedback-header">
        <button type="button" class="feedback-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>
        <h1>Mes réponses</h1>
        <div class="feedback-header-space"></div>
      </header>

      <main class="feedback-content">
        <section class="feedback-loading">
          <span class="feedback-icon">
            <i data-lucide="loader-circle"></i>
          </span>
          <p>Chargement de tes commentaires…</p>
        </section>
      </main>
    </section>
  `;

  feedbackIcons();
  document.querySelector(".feedback-back")?.addEventListener("click", renderFeedbackHome);

  const accountId =
    feedbackProfile.accountId ||
    feedbackProfile.id ||
    feedbackProfile._id ||
    "";

  const email = feedbackProfile.email || "";

  if (!accountId && !email) {
    renderFeedbackResponsesError(
      "Aucun compte connecté n’a été trouvé."
    );
    return;
  }

  try {
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (email) params.set("email", email);

    const response = await fetch(
      `${feedbackApiUrl()}/api/feedback/mine?${params.toString()}`
    );

    const data = await feedbackReadJson(response);

    if (!response.ok) {
      throw new Error(data.message || "Impossible de charger tes réponses.");
    }

    renderFeedbackResponsesList(
      Array.isArray(data.feedback) ? data.feedback : []
    );
  } catch (error) {
    renderFeedbackResponsesError(error.message);
  }
}

function feedbackStatusLabel(status) {
  const labels = {
    new: "Envoyé",
    reviewed: "Lu",
    planned: "À prévoir",
    replied: "Répondu",
    done: "Traité"
  };

  return labels[status] || "Envoyé";
}

function renderFeedbackResponsesList(items) {
  const content = document.querySelector(".feedback-content");
  if (!content) return;

  content.innerHTML = items.length
    ? `
      <section class="feedback-responses-list">
        ${items.map((item) => `
          <article class="feedback-response-card">
            <div class="feedback-response-head">
              <span class="feedback-response-status status-${feedbackEscape(item.status || "new")}">
                ${feedbackEscape(feedbackStatusLabel(item.status))}
              </span>
              <time>
                ${new Date(item.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric"
                })}
              </time>
            </div>

            <p class="feedback-response-type">
              ${feedbackEscape(item.type || "general")}
            </p>

            <h2>${feedbackEscape(item.title || "Commentaire")}</h2>
            <p class="feedback-original-message">
              ${feedbackEscape(item.message || "")}
            </p>

            <div class="feedback-conversation">
              ${(Array.isArray(item.replies) ? item.replies : []).length
                ? item.replies.map((reply) => `
                    <article class="feedback-founder-reply">
                      <strong>Réponse de Sonara</strong>
                      <p>${feedbackEscape(reply.message || "")}</p>
                      <time>
                        ${new Date(reply.createdAt).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </time>
                    </article>
                  `).join("")
                : `
                  <div class="feedback-waiting-reply">
                    <i data-lucide="clock-3"></i>
                    <p>Ton commentaire a bien été reçu. Aucune réponse pour le moment.</p>
                  </div>
                `
              }
            </div>
          </article>
        `).join("")}
      </section>
    `
    : `
      <section class="feedback-confirmation">
        <span class="feedback-confirmation-icon">
          <i data-lucide="message-circle"></i>
        </span>
        <h2>Aucun commentaire envoyé</h2>
        <p>Quand tu partageras un retour, il apparaîtra ici avec la réponse de Sonara.</p>
        <button type="button" class="feedback-submit" data-send-first-feedback>
          Envoyer un commentaire
        </button>
      </section>
    `;

  feedbackIcons();

  document.querySelector("[data-send-first-feedback]")?.addEventListener(
    "click",
    () => renderFeedbackForm("general")
  );
}

function renderFeedbackResponsesError(message) {
  const content = document.querySelector(".feedback-content");
  if (!content) return;

  content.innerHTML = `
    <section class="feedback-confirmation">
      <span class="feedback-confirmation-icon">
        <i data-lucide="triangle-alert"></i>
      </span>
      <h2>Chargement impossible</h2>
      <p>${feedbackEscape(message)}</p>
      <button type="button" class="feedback-submit" data-retry-responses>
        Réessayer
      </button>
    </section>
  `;

  feedbackIcons();

  document.querySelector("[data-retry-responses]")?.addEventListener(
    "click",
    renderFeedbackResponses
  );
}

function renderFeedbackForm(initialType = "general") {
  const safeType = FEEDBACK_TYPES.some((item) => item.value === initialType)
    ? initialType
    : "general";

  feedbackLayout.innerHTML = `
    <section class="feedback-page">
      <header class="feedback-header">
        <button type="button" class="feedback-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>
        <h1>Ton commentaire</h1>
        <div class="feedback-header-space"></div>
      </header>

      <main class="feedback-content">
        <form id="feedbackForm" class="feedback-form" novalidate>
          <div class="feedback-field">
            <label for="feedbackType">Type de retour</label>
            <select id="feedbackType" name="type">
              ${FEEDBACK_TYPES.map((item) => `
                <option value="${item.value}" ${item.value === safeType ? "selected" : ""}>
                  ${item.label}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="feedback-field">
            <label for="feedbackRating">Ton expérience</label>
            <div id="feedbackRating" class="feedback-rating" role="radiogroup">
              ${[1, 2, 3, 4, 5].map((value) => `
                <button
                  type="button"
                  class="feedback-star"
                  data-rating="${value}"
                  aria-label="${value} sur 5"
                >
                  <i data-lucide="star"></i>
                </button>
              `).join("")}
            </div>
            <input id="feedbackRatingValue" type="hidden" value="0">
          </div>

          <div class="feedback-field">
            <label for="feedbackTitle">Titre</label>
            <input
              id="feedbackTitle"
              name="title"
              type="text"
              maxlength="90"
              placeholder="Résume ton retour en une phrase"
            >
            <p class="feedback-error" data-error-for="title"></p>
          </div>

          <div class="feedback-field">
            <label for="feedbackMessage">Commentaire</label>
            <textarea
              id="feedbackMessage"
              name="message"
              maxlength="2000"
              rows="8"
              placeholder="Explique ce que tu as aimé, ce qui pourrait être amélioré ou ce qui ne fonctionne pas."
            ></textarea>
            <div class="feedback-field-bottom">
              <p class="feedback-error" data-error-for="message"></p>
              <span id="feedbackCounter">0 / 2000</span>
            </div>
          </div>

          <div id="feedbackAttachmentsField" class="feedback-field feedback-attachments-field" hidden>
            <label for="feedbackAttachments">Captures d’écran (facultatif)</label>
            <input
              id="feedbackAttachments"
              class="feedback-attachments-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
            >

            <button id="feedbackAttachmentsButton" class="feedback-attachments-button" type="button">
              <i data-lucide="image-plus"></i>
              <span>Ajouter des captures</span>
            </button>

            <p class="feedback-attachments-note">PNG, JPG ou WebP · 5 images maximum · 10 Mo par image</p>
            <p id="feedbackAttachmentsSummary" class="feedback-attachments-summary">Aucune capture sélectionnée</p>
            <div id="feedbackAttachmentsPreview" class="feedback-attachments-preview"></div>
            <p class="feedback-error" data-error-for="attachments"></p>
          </div>

          <button id="feedbackSubmit" class="feedback-submit" type="submit">
            Envoyer le commentaire
          </button>
        </form>
      </main>
    </section>
  `;

  feedbackIcons();

  const form = document.getElementById("feedbackForm");
  const message = document.getElementById("feedbackMessage");
  const ratingValue = document.getElementById("feedbackRatingValue");
  const typeInput = document.getElementById("feedbackType");
  const attachmentsField = document.getElementById("feedbackAttachmentsField");
  const attachmentsInput = document.getElementById("feedbackAttachments");
  const attachmentsButton = document.getElementById("feedbackAttachmentsButton");
  const attachmentsPreview = document.getElementById("feedbackAttachmentsPreview");
  const attachmentsSummary = document.getElementById("feedbackAttachmentsSummary");
  const attachmentsError = document.querySelector('[data-error-for="attachments"]');

  feedbackResetAttachments();

  function renderAttachmentPreviews() {
    feedbackClearAttachmentPreviewUrls();
    attachmentsPreview.innerHTML = feedbackAttachmentFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      feedbackAttachmentPreviewUrls.push(url);
      return `
        <article class="feedback-attachment-preview-card">
          <img src="${url}" alt="Capture ${index + 1}">
          <button
            type="button"
            class="feedback-attachment-remove"
            data-remove-feedback-attachment="${index}"
            aria-label="Retirer la capture"
          >
            <i data-lucide="x"></i>
          </button>
        </article>
      `;
    }).join("");

    attachmentsSummary.textContent = feedbackAttachmentFiles.length
      ? `${feedbackAttachmentFiles.length} capture(s) sélectionnée(s)`
      : "Aucune capture sélectionnée";

    document.querySelectorAll("[data-remove-feedback-attachment]").forEach((button) => {
      button.addEventListener("click", () => {
        feedbackAttachmentFiles.splice(Number(button.dataset.removeFeedbackAttachment), 1);
        attachmentsInput.value = "";
        attachmentsError.textContent = "";
        renderAttachmentPreviews();
      });
    });

    feedbackIcons();
  }

  function syncAttachmentField() {
    const bugMode = typeInput.value === "bug";
    attachmentsField.hidden = !bugMode;
    if (!bugMode && feedbackAttachmentFiles.length) {
      feedbackResetAttachments();
      attachmentsInput.value = "";
      attachmentsError.textContent = "";
      renderAttachmentPreviews();
    }
  }

  attachmentsButton.addEventListener("click", () => attachmentsInput.click());

  attachmentsInput.addEventListener("change", () => {
    attachmentsError.textContent = "";
    const selected = Array.from(attachmentsInput.files || []);
    const merged = [...feedbackAttachmentFiles];

    for (const file of selected) {
      if (!FEEDBACK_ATTACHMENT_TYPES.has(file.type)) {
        attachmentsError.textContent = "Format accepté : PNG, JPG ou WebP.";
        continue;
      }

      if (file.size > FEEDBACK_ATTACHMENT_MAX_SIZE) {
        attachmentsError.textContent = "Chaque capture doit faire 10 Mo maximum.";
        continue;
      }

      const duplicate = merged.some((item) =>
        item.name === file.name &&
        item.size === file.size &&
        item.lastModified === file.lastModified
      );

      if (!duplicate) merged.push(file);
    }

    if (merged.length > FEEDBACK_ATTACHMENT_MAX_FILES) {
      attachmentsError.textContent = "Maximum 5 captures.";
    }

    feedbackAttachmentFiles = merged.slice(0, FEEDBACK_ATTACHMENT_MAX_FILES);
    attachmentsInput.value = "";
    renderAttachmentPreviews();
  });

  typeInput.addEventListener("change", syncAttachmentField);

  document.querySelector(".feedback-back")?.addEventListener("click", () => {
    feedbackResetAttachments();
    renderFeedbackHome();
  });

  message.addEventListener("input", () => {
    document.getElementById("feedbackCounter").textContent =
      `${message.value.length} / 2000`;
  });

  document.querySelectorAll(".feedback-star").forEach((star) => {
    star.addEventListener("click", () => {
      const selectedRating = Number(star.dataset.rating);
      ratingValue.value = String(selectedRating);

      document.querySelectorAll(".feedback-star").forEach((item) => {
        item.classList.toggle(
          "active",
          Number(item.dataset.rating) <= selectedRating
        );
      });
    });
  });

  syncAttachmentField();
  renderAttachmentPreviews();
  form.addEventListener("submit", submitFeedback);
}

async function submitFeedback(event) {
  event.preventDefault();

  const title = document.getElementById("feedbackTitle").value.trim();
  const message = document.getElementById("feedbackMessage").value.trim();
  const type = document.getElementById("feedbackType").value;
  const rating = Number(document.getElementById("feedbackRatingValue").value || 0);
  const submit = document.getElementById("feedbackSubmit");

  document.querySelectorAll(".feedback-error").forEach((element) => {
    element.textContent = "";
  });

  let valid = true;

  if (title.length < 3) {
    document.querySelector('[data-error-for="title"]').textContent =
      "Ajoute un titre clair.";
    valid = false;
  }

  if (message.length < 10) {
    document.querySelector('[data-error-for="message"]').textContent =
      "Ton commentaire doit contenir au moins 10 caractères.";
    valid = false;
  }

  if (!valid) return;

  submit.disabled = true;
  submit.textContent = "Envoi…";

  const accountId =
    feedbackProfile.accountId ||
    feedbackProfile.id ||
    feedbackProfile._id ||
    "";

  const payload = {
    rootUserId: feedbackProfile.rootUserId || feedbackProfile.rootUser?.id || "",
    accountId,
    pseudo:
      feedbackProfile.pseudo ||
      feedbackProfile.name ||
      feedbackProfile.artistName ||
      "",
    email: feedbackProfile.email || "",
    role: feedbackProfile.role || "user",
    type,
    rating,
    title,
    message,
    page: window.location.pathname
  };

  try {
    let requestOptions;

    if (type === "bug" && feedbackAttachmentFiles.length) {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        formData.append(key, String(value ?? ""));
      });
      feedbackAttachmentFiles.forEach((file) => {
        formData.append("attachments", file, file.name);
      });
      requestOptions = { method: "POST", body: formData };
    } else {
      requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      };
    }

    const response = await fetch(`${feedbackApiUrl()}/api/feedback`, requestOptions);
    const data = await feedbackReadJson(response);

    if (!response.ok) {
      throw new Error(data.message || "Impossible d’envoyer le commentaire.");
    }

    feedbackResetAttachments();
    renderFeedbackConfirmation(data.feedback);
  } catch (error) {
    document.querySelector('[data-error-for="message"]').textContent =
      error.message;
    submit.disabled = false;
    submit.textContent = "Envoyer le commentaire";
  }
}

function renderFeedbackConfirmation(feedback = {}) {
  feedbackLayout.innerHTML = `
    <section class="feedback-page">
      <header class="feedback-header">
        <button type="button" class="feedback-back" aria-label="Retour">
          <i data-lucide="arrow-left"></i>
        </button>
        <h1>Feedback</h1>
        <div class="feedback-header-space"></div>
      </header>

      <main class="feedback-content">
        <section class="feedback-confirmation">
          <span class="feedback-confirmation-icon">
            <i data-lucide="check"></i>
          </span>
          <h2>Merci pour ton retour</h2>
          <p>Ton commentaire a bien été transmis à l’équipe Sonara.</p>
          ${feedback.reference ? `
            <small>Référence : ${feedbackEscape(feedback.reference)}</small>
          ` : ""}
          <button type="button" class="feedback-submit" data-feedback-home>
            Terminer
          </button>
        </section>
      </main>
    </section>
  `;

  feedbackIcons();

  document.querySelector(".feedback-back")?.addEventListener("click", renderFeedbackHome);
  document.querySelector("[data-feedback-home]")?.addEventListener("click", renderFeedbackHome);
}

if (feedbackLayout) {
  renderFeedbackHome();
}
