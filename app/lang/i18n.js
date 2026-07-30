(() => {
  "use strict";

  const scriptElement =
    document.currentScript ||
    Array.from(document.scripts).find((script) => /(?:^|\/)i18n\.js(?:\?|$)/.test(script.src));

  if (!scriptElement?.src) {
    console.warn("Traduction Sonara indisponible : chemin i18n introuvable.");
    return;
  }

  const SCRIPT_URL = new URL(scriptElement.src, window.location.href);
  const APP_URL = new URL("../", SCRIPT_URL);
  const STORAGE_KEY = "sonaraLanguage";
  const SUPPORTED = [
    ["fr", "Français"], ["en", "English"], ["sq", "Shqip"],
    ["ar", "العربية"], ["tr", "Türkçe"], ["id", "Bahasa Indonesia"],
    ["es", "Español"], ["de", "Deutsch"], ["it", "Italiano"],
    ["pt", "Português"], ["nl", "Nederlands"], ["pl", "Polski"],
    ["ro", "Română"], ["ru", "Русский"], ["zh", "中文"], ["sw", "Kiswahili"]
  ];

  const codes = new Set(SUPPORTED.map(([code]) => code));
  const textStates = new WeakMap();
  const attributeStates = new WeakMap();
  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);
  const translatedAttributes = ["placeholder", "title", "aria-label", "alt"];

  let exactIndex = new Map();
  let caseInsensitiveIndex = new Map();
  let fragmentRules = [];
  let currentLanguage = "fr";
  let translatingDepth = 0;
  let languageRequestId = 0;
  let observer = null;

  function normalizeLanguage(value = "") {
    const normalized = String(value).toLowerCase().replace("_", "-");
    const primary = normalized.split("-")[0];
    return codes.has(primary) ? primary : "fr";
  }

  function detectLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && codes.has(normalizeLanguage(saved))) return normalizeLanguage(saved);
    return normalizeLanguage(navigator.language || "fr");
  }

  function canonicalize(value = "") {
    return String(value)
      .replace(/[\u00A0\u202F]/g, " ")
      .replace(/[’‘`´]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildIndexes(dictionary = {}) {
    exactIndex = new Map();
    caseInsensitiveIndex = new Map();

    Object.entries(dictionary).forEach(([source, translated]) => {
      if (source.startsWith("__") || typeof translated !== "string") return;
      const normalizedSource = canonicalize(source);
      if (!normalizedSource) return;
      exactIndex.set(normalizedSource, translated);
      caseInsensitiveIndex.set(normalizedSource.toLocaleLowerCase("fr"), translated);
    });

    const fragments = dictionary.__fragments;
    fragmentRules = fragments && typeof fragments === "object"
      ? Object.entries(fragments)
          .filter(([source, translated]) => source && typeof translated === "string")
          .sort((a, b) => b[0].length - a[0].length)
          .map(([source, translated]) => {
            const normalizedSource = canonicalize(source);
            return {
              source: normalizedSource,
              translated,
              expression: new RegExp(
                `(^|[^\\p{L}\\p{N}])(${escapeRegExp(normalizedSource)})(?=$|[^\\p{L}\\p{N}])`,
                "giu"
              )
            };
          })
      : [];
  }

  function translateByFragments(value) {
    if (currentLanguage === "fr" || !fragmentRules.length) return value;
    if (/https?:\/\/|\b[a-z0-9_-]+\.(?:com|fr|io|html|js|css)\b/i.test(value)) return value;

    let result = value;
    let replacements = 0;

    fragmentRules.forEach((rule) => {
      result = result.replace(rule.expression, (match, prefix) => {
        replacements += 1;
        return `${prefix}${rule.translated}`;
      });
    });

    return replacements ? result : value;
  }

  function translateValue(value) {
    const normalized = canonicalize(value);
    if (!normalized) return normalized;

    const exact = exactIndex.get(normalized);
    if (typeof exact === "string") return exact;

    const insensitive = caseInsensitiveIndex.get(normalized.toLocaleLowerCase("fr"));
    if (typeof insensitive === "string") return insensitive;

    return translateByFragments(normalized);
  }

  function shouldIgnoreElement(element) {
    if (!(element instanceof Element)) return true;
    if (element.id === "sonara-language-switcher" || element.closest("#sonara-language-switcher")) return true;
    if (element.closest("[data-i18n-ignore], [translate='no']")) return true;
    if (element.isContentEditable || ignoredTags.has(element.tagName)) return true;
    return false;
  }

  function getTextState(node) {
    const currentValue = String(node.nodeValue || "");
    let state = textStates.get(node);

    if (!state) {
      state = { source: currentValue, rendered: currentValue };
      textStates.set(node, state);
      return state;
    }

    // Une modification faite par la page (loader, compteur, statut...) devient
    // la nouvelle source. Une traduction précédente ne doit jamais la remplacer.
    if (currentValue !== state.rendered) {
      state.source = currentValue;
      state.rendered = currentValue;
    }

    return state;
  }

  function translateTextNode(node) {
    if (!node?.parentElement || shouldIgnoreElement(node.parentElement)) return;

    const state = getTextState(node);
    const source = String(state.source || "");
    const trimmed = source.trim();
    if (!trimmed) return;

    const translated = translateValue(trimmed);
    const leading = source.match(/^\s*/)?.[0] || "";
    const trailing = source.match(/\s*$/)?.[0] || "";
    const rendered = `${leading}${translated}${trailing}`;

    if (node.nodeValue !== rendered) node.nodeValue = rendered;
    state.rendered = rendered;
  }

  function getAttributeState(element, name) {
    let states = attributeStates.get(element);
    if (!states) {
      states = {};
      attributeStates.set(element, states);
    }

    const currentValue = String(element.getAttribute(name) || "");
    let state = states[name];

    if (!state) {
      state = { source: currentValue, rendered: currentValue };
      states[name] = state;
      return state;
    }

    if (currentValue !== state.rendered) {
      state.source = currentValue;
      state.rendered = currentValue;
    }

    return state;
  }

  function translateElement(element) {
    if (!(element instanceof Element) || shouldIgnoreElement(element)) return;

    translatedAttributes.forEach((name) => {
      if (!element.hasAttribute(name)) return;
      const state = getAttributeState(element, name);
      const rendered = translateValue(state.source);
      if (element.getAttribute(name) !== rendered) element.setAttribute(name, rendered);
      state.rendered = rendered;
    });

    if (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)) {
      const state = getAttributeState(element, "value");
      const rendered = translateValue(state.source);
      if (element.value !== rendered) element.value = rendered;
      state.rendered = rendered;
    }

    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    });
  }

  function translateTree(root = document.body) {
    if (!root) return;
    translatingDepth += 1;

    try {
      if (root instanceof Element) translateElement(root);
      root.querySelectorAll?.("*").forEach(translateElement);

      const titleSource = document.documentElement.dataset.sonaraOriginalTitle || document.title;
      document.documentElement.dataset.sonaraOriginalTitle = titleSource;
      document.title = translateValue(titleSource);
    } finally {
      translatingDepth -= 1;
    }
  }

  async function loadDictionary(language) {
    const url = new URL(`lang/${language}.json`, APP_URL);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Langue indisponible (${response.status}) : ${url.pathname}`);
    return response.json();
  }

  async function setLanguage(language) {
    const requestId = ++languageRequestId;
    const requestedLanguage = normalizeLanguage(language);

    let dictionary;
    let appliedLanguage = requestedLanguage;

    try {
      dictionary = await loadDictionary(requestedLanguage);
    } catch (error) {
      console.warn("Traduction Sonara indisponible :", error);
      appliedLanguage = "fr";
      dictionary = await loadDictionary("fr").catch(() => ({}));
    }

    if (requestId !== languageRequestId) return;

    currentLanguage = appliedLanguage;
    buildIndexes(dictionary || {});
    localStorage.setItem(STORAGE_KEY, currentLanguage);
    document.documentElement.lang = currentLanguage;
    document.documentElement.removeAttribute("dir");

    const select = document.querySelector("#sonara-language-select");
    if (select) select.value = currentLanguage;

    translateTree(document.body);
    window.dispatchEvent(new CustomEvent("sonara:languagechange", {
      detail: { language: currentLanguage }
    }));
  }

  function installSelector() {
    if (document.querySelector("#sonara-language-switcher")) return;

    const container = document.createElement("aside");
    container.id = "sonara-language-switcher";
    container.setAttribute("aria-label", "Langue");
    container.setAttribute("data-i18n-ignore", "true");
    container.innerHTML = `
      <label for="sonara-language-select">🌐</label>
      <select id="sonara-language-select" aria-label="Choisir la langue">
        ${SUPPORTED.map(([code, label]) => `<option value="${code}">${label}</option>`).join("")}
      </select>
    `;

    document.body.appendChild(container);
    const select = container.querySelector("select");
    select.value = currentLanguage;
    select.addEventListener("change", () => setLanguage(select.value));
  }

  function startObserver() {
    observer = new MutationObserver((mutations) => {
      if (translatingDepth > 0) return;

      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
          return;
        }

        if (mutation.type === "attributes") {
          translateElement(mutation.target);
          return;
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          if (node instanceof Element && node.id !== "sonara-language-switcher") translateTree(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatedAttributes, "value"],
      subtree: true
    });
  }

  async function init() {
    currentLanguage = detectLanguage();
    installSelector();
    await setLanguage(currentLanguage);
    startObserver();
  }

  window.SonaraI18n = Object.freeze({
    getLanguage: () => currentLanguage,
    setLanguage,
    refresh: () => translateTree(document.body),
    t: (value) => translateValue(value)
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
