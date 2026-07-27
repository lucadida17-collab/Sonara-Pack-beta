(() => {
  "use strict";

  const SCRIPT_URL = new URL(document.currentScript.src, window.location.href);
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
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  let dictionary = {};
  let currentLanguage = "fr";
  let translating = false;

  function normalizeLanguage(value = "") {
    const normalized = String(value).toLowerCase().replace("_", "-");
    const primary = normalized.split("-")[0];
    return codes.has(primary) ? primary : "fr";
  }

  function detectLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && codes.has(saved)) return saved;
    return normalizeLanguage(navigator.language || "fr");
  }

  function translateValue(value) {
    const compact = String(value || "").replace(/\s+/g, " ").trim();
    return dictionary[compact] || compact;
  }

  function translateTextNode(node) {
    if (!node || !node.parentElement) return;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(node.parentElement.tagName)) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const trimmed = String(source || "").trim();
    if (!trimmed) return;
    const translated = translateValue(trimmed);
    const leading = source.match(/^\s*/)?.[0] || "";
    const trailing = source.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${translated}${trailing}`;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    const names = ["placeholder", "title", "aria-label", "alt"];
    if (!originalAttributes.has(element)) originalAttributes.set(element, {});
    const originals = originalAttributes.get(element);
    names.forEach((name) => {
      if (!element.hasAttribute(name)) return;
      if (!(name in originals)) originals[name] = element.getAttribute(name);
      element.setAttribute(name, translateValue(originals[name]));
    });
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    });
  }

  function translateTree(root = document.body) {
    if (!root) return;
    translating = true;
    if (root instanceof Element) translateElement(root);
    root.querySelectorAll?.("*").forEach(translateElement);
    const titleSource = document.documentElement.dataset.sonaraOriginalTitle || document.title;
    document.documentElement.dataset.sonaraOriginalTitle = titleSource;
    document.title = translateValue(titleSource);
    translating = false;
  }

  async function loadDictionary(language) {
    const response = await fetch(new URL(`lang/${language}.json`, APP_URL), { cache: "no-store" });
    if (!response.ok) throw new Error(`Langue indisponible (${response.status})`);
    return response.json();
  }

  async function setLanguage(language) {
    currentLanguage = normalizeLanguage(language);
    localStorage.setItem(STORAGE_KEY, currentLanguage);
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
    try {
      dictionary = await loadDictionary(currentLanguage);
    } catch (error) {
      console.warn("Traduction Sonara indisponible :", error);
      currentLanguage = "fr";
      dictionary = await loadDictionary("fr").catch(() => ({}));
    }
    const select = document.querySelector("#sonara-language-select");
    if (select) select.value = currentLanguage;
    translateTree(document.body);
  }

  function installSelector() {
    if (document.querySelector("#sonara-language-switcher")) return;
    const container = document.createElement("aside");
    container.id = "sonara-language-switcher";
    container.setAttribute("aria-label", "Langue");
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

  const observer = new MutationObserver((mutations) => {
    if (translating) return;
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
        if (node instanceof Element && node.id !== "sonara-language-switcher") translateTree(node);
      });
    }
  });

  async function init() {
    installSelector();
    await setLanguage(detectLanguage());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
