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
  const APP_URL = new URL("../../", SCRIPT_URL);
  const STORAGE_KEY = "sonaraLanguage";

  /*
    Cache persistant des dictionnaires.

    Une langue téléchargée une première fois reste disponible
    entre les pages et les rechargements du navigateur.
  */
  const DICTIONARY_CACHE_NAME =
    "sonara-i18n-dictionaries-v4";

  const DICTIONARY_CONTENT_VERSION =
    "2026-08-12-pre-v1-announcements-v1";

  const NETWORK_RETRY_DELAY_MS =
    450;

  const dictionaryMemoryCache =
    new Map();

  const dictionaryLoadPromises =
    new Map();

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
  // Les noms de packs, de tracks et les contenus saisis par les utilisateurs
  // restent des données métier : la traduction globale ne doit jamais les réécrire.
  const protectedContentSelector = [
    "[data-i18n-ignore]",
    "[translate='no']",
    ".card .title",
    ".pack-info > .title",
    ".library-preview-pack-info > strong",
    ".pack-card > h3",
    ".my-pack-title-row > h2",
    "[data-user-content]"
  ].join(", ");

  let exactIndex = new Map();
  let caseInsensitiveIndex = new Map();
  let fragmentRules = [];
  let patternRules = [];
  let currentLanguage = "fr";
  let translatingDepth = 0;
  let languageRequestId = 0;
  let observer = null;
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

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

    patternRules = Object.entries(dictionary)
      .filter(([source, translated]) =>
        !source.startsWith("__") &&
        typeof translated === "string" &&
        /\{\d+\}/.test(source)
      )
      .sort((a, b) => b[0].length - a[0].length)
      .map(([source, translated]) => {
        const normalizedSource = canonicalize(source);
        const indexes = [];
        let expressionSource = "";
        let cursor = 0;
        const placeholderExpression = /\{(\d+)\}/g;
        let match;

        while ((match = placeholderExpression.exec(normalizedSource))) {
          expressionSource += escapeRegExp(normalizedSource.slice(cursor, match.index));
          expressionSource += "(.+?)";
          indexes.push(Number(match[1]));
          cursor = match.index + match[0].length;
        }

        expressionSource += escapeRegExp(normalizedSource.slice(cursor));

        return {
          translated,
          indexes,
          expression: new RegExp(`^${expressionSource}$`, "iu")
        };
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

    for (const rule of patternRules) {
      const match = normalized.match(rule.expression);
      if (!match) continue;

      const values = {};
      rule.indexes.forEach((index, position) => {
        values[index] = match[position + 1];
      });

      return rule.translated.replace(/\{(\d+)\}/g, (_placeholder, index) =>
        values[Number(index)] ?? _placeholder
      );
    }

    return translateByFragments(normalized);
  }

  function shouldIgnoreElement(element) {
    if (!(element instanceof Element)) return true;
    if (element.id === "sonara-language-switcher" || element.closest("#sonara-language-switcher")) return true;
    if (element.closest(protectedContentSelector)) return true;
    if (element.isContentEditable || ignoredTags.has(element.tagName)) return true;

    const literal = canonicalize(element.textContent);
    if (/^sonara pack(?:\s+(?:pré-)?v[\d.]+)?$/i.test(literal)) return true;

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

  function getDictionaryUrl(language) {
    const url = new URL(
      `lang/${language}.json`,
      APP_URL
    );
    url.searchParams.set("v", DICTIONARY_CONTENT_VERSION);
    return url;
  }

  function validateDictionary(
    dictionary,
    url
  ) {
    if (
      !dictionary ||
      typeof dictionary !== "object" ||
      Array.isArray(dictionary)
    ) {
      throw new Error(
        `Dictionnaire invalide : ${url.pathname}`
      );
    }

    return dictionary;
  }

  async function parseDictionaryResponse(
    response,
    url
  ) {
    if (!response?.ok) {
      throw new Error(
        `Langue indisponible (${response?.status || 0}) : ${url.pathname}`
      );
    }

    const dictionary =
      await response.json();

    return validateDictionary(
      dictionary,
      url
    );
  }

  async function openDictionaryCache() {
    if (!("caches" in window)) {
      return null;
    }

    try {
      return await window.caches.open(
        DICTIONARY_CACHE_NAME
      );
    } catch (error) {
      console.warn(
        "Cache de traduction indisponible :",
        error
      );

      return null;
    }
  }

  async function readCachedDictionary(
    language
  ) {
    if (
      dictionaryMemoryCache.has(
        language
      )
    ) {
      return dictionaryMemoryCache.get(
        language
      );
    }

    const cache =
      await openDictionaryCache();

    if (!cache) {
      return null;
    }

    const url =
      getDictionaryUrl(language);

    const cachedResponse =
      await cache.match(url.href);

    if (!cachedResponse) {
      return null;
    }

    try {
      const dictionary =
        await parseDictionaryResponse(
          cachedResponse,
          url
        );

      dictionaryMemoryCache.set(
        language,
        dictionary
      );

      return dictionary;
    } catch (error) {
      /*
        Un cache illisible ne doit pas bloquer la traduction.
        Il est supprimé, puis le fichier officiel pourra être
        téléchargé une seule fois.
      */
      await cache.delete(
        url.href
      ).catch(() => {});

      console.warn(
        "Cache de traduction invalide :",
        error
      );

      return null;
    }
  }

  function isNetworkError(error) {
    return (
      navigator.onLine === false ||
      error instanceof TypeError
    );
  }

  function wait(delay) {
    return new Promise(
      (resolve) =>
        window.setTimeout(
          resolve,
          delay
        )
    );
  }

  async function fetchDictionaryResponse(
    url,
    {
      forceNetwork = false,
      retryOnNetworkError = true
    } = {}
  ) {
    const requestOptions = {
      /*
        force-cache :
        le navigateur peut utiliser son cache HTTP si CacheStorage
        est indisponible.

        reload :
        réservé au mode de secours explicite.
      */
      cache:
        forceNetwork
          ? "reload"
          : "force-cache"
    };

    try {
      return await fetch(
        url,
        requestOptions
      );
    } catch (error) {
      /*
        Un seul nouvel essai est autorisé, uniquement lorsque
        l'échec vient réellement du réseau.
      */
      if (
        !retryOnNetworkError ||
        !isNetworkError(error)
      ) {
        throw error;
      }

      await wait(
        NETWORK_RETRY_DELAY_MS
      );

      return fetch(
        url,
        requestOptions
      );
    }
  }

  async function downloadDictionary(
    language,
    {
      forceNetwork = false
    } = {}
  ) {
    const url =
      getDictionaryUrl(language);

    const response =
      await fetchDictionaryResponse(
        url,
        {
          forceNetwork,
          retryOnNetworkError: true
        }
      );

    const responseForCache =
      response.clone();

    const dictionary =
      await parseDictionaryResponse(
        response,
        url
      );

    dictionaryMemoryCache.set(
      language,
      dictionary
    );

    const cache =
      await openDictionaryCache();

    if (cache) {
      await cache.put(
        url.href,
        responseForCache
      ).catch((error) => {
        /*
          La traduction continue de fonctionner même si le
          navigateur refuse l'écriture du cache.
        */
        console.warn(
          "Enregistrement du cache de traduction impossible :",
          error
        );
      });
    }

    return dictionary;
  }

  async function loadDictionary(
    language,
    {
      forceNetwork = false
    } = {}
  ) {
    const normalizedLanguage =
      normalizeLanguage(language);

    /*
      Mode normal :
      1. mémoire de la page ;
      2. cache persistant du navigateur ;
      3. téléchargement uniquement si la langue n'existe pas encore.
    */
    if (!forceNetwork) {
      const cachedDictionary =
        await readCachedDictionary(
          normalizedLanguage
        );

      if (cachedDictionary) {
        return cachedDictionary;
      }

      /*
        Empêche deux appels simultanés de télécharger deux fois
        le même fichier de langue.
      */
      const pendingLoad =
        dictionaryLoadPromises.get(
          normalizedLanguage
        );

      if (pendingLoad) {
        return pendingLoad;
      }

      const loadPromise =
        downloadDictionary(
          normalizedLanguage
        ).finally(() => {
          dictionaryLoadPromises.delete(
            normalizedLanguage
          );
        });

      dictionaryLoadPromises.set(
        normalizedLanguage,
        loadPromise
      );

      return loadPromise;
    }

    /*
      Mode de secours conservé :
      téléchargement forcé uniquement lorsqu'il est demandé
      explicitement après un problème.
    */
    try {
      return await downloadDictionary(
        normalizedLanguage,
        {
          forceNetwork: true
        }
      );
    } catch (error) {
      /*
        Si le réseau échoue pendant le secours, l'ancienne copie
        reste utilisable au lieu de casser l'interface.
      */
      const cachedDictionary =
        await readCachedDictionary(
          normalizedLanguage
        );

      if (cachedDictionary) {
        console.warn(
          "Réseau indisponible : ancienne traduction conservée.",
          error
        );

        return cachedDictionary;
      }

      throw error;
    }
  }

  async function reloadDictionary(
    language = currentLanguage
  ) {
    const normalizedLanguage =
      normalizeLanguage(language);

    const dictionary =
      await loadDictionary(
        normalizedLanguage,
        {
          forceNetwork: true
        }
      );

    if (
      normalizedLanguage ===
      currentLanguage
    ) {
      buildIndexes(
        dictionary
      );

      translateTree(
        document.body
      );
    }

    return {
      ok: true,
      language: normalizedLanguage
    };
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

    installSelector();
    const select = document.querySelector("#sonara-language-select");
    if (select) select.value = currentLanguage;

    translateTree(document.body);
    window.dispatchEvent(new CustomEvent("sonara:languagechange", {
      detail: { language: currentLanguage }
    }));
  }

  function getLanguageMount() {
    return (
      document.querySelector("[data-sonara-language-slot]") ||
      document.body
    );
  }

  function placeLanguageSelector(container) {
    const mount = getLanguageMount();

    if (!mount || !container) return;

    if (container.parentElement !== mount) {
      mount.appendChild(container);
    }

    container.classList.toggle(
      "sonara-language-floating",
      mount === document.body
    );
  }

  function installSelector() {
    if (!document.body) return;

    let container = document.querySelector(
      "#sonara-language-switcher"
    );

    if (!container) {
      container = document.createElement("aside");
      container.id = "sonara-language-switcher";
      container.setAttribute("aria-label", "Langue");
      container.setAttribute("data-i18n-ignore", "true");
      container.innerHTML = `
        <label for="sonara-language-select">🌐</label>
        <select id="sonara-language-select" aria-label="Choisir la langue">
          ${SUPPORTED.map(([code, label]) => `<option value="${code}">${label}</option>`).join("")}
        </select>
      `;

      const select = container.querySelector("select");
      select.value = currentLanguage;
      select.addEventListener(
        "change",
        () => setLanguage(select.value)
      );
    }

    placeLanguageSelector(container);
  }

  function startObserver() {
    observer = new MutationObserver((mutations) => {
      if (translatingDepth > 0) return;

      // Certaines pages reconstruisent leur contenu avec body.innerHTML.
      // Le sélecteur doit alors être recréé automatiquement, sans recharger.
      installSelector();

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
    try {
      currentLanguage = detectLanguage();
      installSelector();
      await setLanguage(currentLanguage);
      startObserver();
      resolveReady?.({ ok: true, language: currentLanguage });
    } catch (error) {
      console.warn("Initialisation de la traduction Sonara impossible :", error);
      installSelector();
      startObserver();
      resolveReady?.({ ok: false, language: currentLanguage, error });
    }
  }

  window.SonaraI18n = Object.freeze({
    ready: readyPromise,
    getLanguage: () => currentLanguage,
    setLanguage,
    refresh: () => {
      installSelector();
      translateTree(document.body);
    },
    t: (value) => translateValue(value),

    /*
      Secours manuel conservé.
      Aucun téléchargement forcé n'est lancé automatiquement.
    */
    reloadDictionary
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
