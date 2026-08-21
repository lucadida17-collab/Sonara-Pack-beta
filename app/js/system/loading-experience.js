(() => {
  "use strict";

  const ROTATION_MS = 4200;
  const ARTIST_TIPS = [
    "Une cover simple et lisible reste plus forte dans le catalogue mobile.",
    "Un titre court et identifiable aide les utilisateurs à retrouver ton pack.",
    "Pour un album, garde une vraie cohérence entre les tracks pour renforcer son identité.",
    "Évite les silences inutiles au début des sons : l'écoute doit commencer proprement.",
    "Des noms de tracks clairs facilitent leur utilisation dans les projets des utilisateurs.",
    "Vérifie le volume de chaque track avant publication pour garder un pack homogène.",
    "Une licence claire rassure l'utilisateur au moment d'intégrer le son dans son projet.",
    "Publier régulièrement aide ton catalogue à rester vivant et à être redécouvert.",
    "Teste toujours tes sons au casque et sur des haut-parleurs avant de les envoyer.",
    "Si plusieurs sons appartiennent au même univers, garde une identité visuelle cohérente."
  ];

  const USER_TIPS = [
    "Utilise la preview de 30 secondes pour vérifier rapidement si une track correspond à ton projet.",
    "Ajoute les packs que tu utilises à ta bibliothèque pour les retrouver plus vite.",
    "Lis la licence du pack avant de publier ton projet : elle précise ce que tu peux faire.",
    "Les catégories t’aident à chercher par ambiance et par usage, pas seulement par genre.",
    "Tu peux revenir sur un artiste depuis un pack pour découvrir le reste de son catalogue.",
    "Dans Sonara Sync, combine tes sons avec ta vidéo avant de finaliser ton montage."
  ];

  const CHEVRON_LEFT_ICON = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="m15 18-6-6 6-6"></path>
    </svg>`;
  const CHEVRON_RIGHT_ICON = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6"></path>
    </svg>`;

  function t(value) {
    return window.SonaraI18n?.t?.(value) || String(value || "");
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']")
    );
  }

  function isLoaderVisible(root) {
    if (!(root instanceof Element) || !root.isConnected || root.hidden) return false;
    if (root.getAttribute("aria-hidden") === "true") return false;
    return root.getClientRects().length > 0;
  }

  function bindTipNavigation(root, { onPrevious, onNext, previousButton, nextButton } = {}) {
    if (!(root instanceof Element)) return () => {};

    previousButton?.setAttribute("aria-keyshortcuts", "ArrowLeft Q");
    nextButton?.setAttribute("aria-keyshortcuts", "ArrowRight D");
    if (previousButton) previousButton.title = "Q / ←";
    if (nextButton) nextButton.title = "D / →";

    const onKeyDown = (event) => {
      if (!isLoaderVisible(root) || event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const key = String(event.key || "").toLowerCase();
      if (key === "arrowleft" || key === "q") {
        event.preventDefault();
        onPrevious?.();
      } else if (key === "arrowright" || key === "d") {
        event.preventDefault();
        onNext?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }

  function createAdvice(root) {
    if (!(root instanceof Element) || root.dataset.sonaraLoadingMounted === "true") return;
    root.dataset.sonaraLoadingMounted = "true";

    const audience = String(root.dataset.sonaraLoadingAudience || "none").toLowerCase();
    if (audience === "none" || root.dataset.sonaraLoadingNativeTips === "true") return;

    const tips = audience === "artist" ? ARTIST_TIPS : USER_TIPS;
    if (!tips.length) return;

    let host = root;
    const hostSelector = root.dataset.sonaraLoadingTipHost;
    if (hostSelector) host = root.querySelector(hostSelector) || root;

    if (host.querySelector(":scope > .sonara-loading-advice")) return;

    const advice = document.createElement("aside");
    advice.className = "sonara-loading-advice";
    advice.innerHTML = `
      <div class="sonara-loading-advice-head">
        <span class="sonara-loading-advice-label"></span>
        <span class="sonara-loading-advice-count" aria-hidden="true"></span>
      </div>
      <p class="sonara-loading-advice-text" aria-live="polite"></p>
      <div class="sonara-loading-advice-actions">
        <button class="sonara-loading-advice-button is-previous" type="button" aria-label=""></button>
        <button class="sonara-loading-advice-button is-next" type="button" aria-label=""></button>
      </div>
    `;
    host.appendChild(advice);

    const label = advice.querySelector(".sonara-loading-advice-label");
    const count = advice.querySelector(".sonara-loading-advice-count");
    const text = advice.querySelector(".sonara-loading-advice-text");
    const previous = advice.querySelector(".is-previous");
    const next = advice.querySelector(".is-next");
    let index = 0;
    let timer = null;

    const refreshChrome = () => {
      label.textContent = t(audience === "artist" ? "CONSEIL ARTISTE" : "CONSEIL UTILISATEUR");
      previous.setAttribute("aria-label", t("Conseil précédent"));
      next.setAttribute("aria-label", t("Conseil suivant"));
      previous.innerHTML = CHEVRON_LEFT_ICON;
      next.innerHTML = CHEVRON_RIGHT_ICON;
    };

    const render = (animate = true) => {
      if (!root.isConnected) {
        if (timer) window.clearInterval(timer);
        unbindKeyboard?.();
        return;
      }
      refreshChrome();
      count.textContent = `${index + 1} / ${tips.length}`;
      if (animate) {
        text.classList.remove("is-changing");
        void text.offsetWidth;
        text.classList.add("is-changing");
      }
      text.textContent = t(tips[index]);
    };

    const move = (direction) => {
      index = (index + direction + tips.length) % tips.length;
      render(true);
    };

    previous.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    const unbindKeyboard = bindTipNavigation(root, {
      onPrevious: () => move(-1),
      onNext: () => move(1),
      previousButton: previous,
      nextButton: next
    });

    render(false);
    timer = window.setInterval(() => move(1), ROTATION_MS);

    Promise.resolve(window.SonaraI18n?.ready).then(() => render(false)).catch(() => {});
  }

  function scan(scope = document) {
    scope.querySelectorAll?.(".sonara-loading-surface[data-sonara-loading-audience]").forEach(createAdvice);
    if (scope.matches?.(".sonara-loading-surface[data-sonara-loading-audience]")) createAdvice(scope);
  }

  function waitMinimum(startedAt, minimumMs = 6000) {
    const remaining = Math.max(0, Number(minimumMs) - (Date.now() - Number(startedAt || Date.now())));
    return new Promise((resolve) => window.setTimeout(resolve, remaining));
  }

  window.SonaraLoadingExperience = {
    scan,
    mount: createAdvice,
    waitMinimum,
    bindTipNavigation,
    icons: { left: CHEVRON_LEFT_ICON, right: CHEVRON_RIGHT_ICON }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan(document), { once: true });
  } else {
    scan(document);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
