(() => {
  "use strict";

  const PILLAR_SLUGS = new Set([
    "how-it-works",
    "for-creators",
    "for-artists",
    "licensing",
    "pre-v1"
  ]);

  const LANGUAGES = [
    ["fr", "Français", "Langue"],
    ["en", "English", "Language"],
    ["sq", "Shqip", "Gjuha"],
    ["ar", "العربية", "اللغة"],
    ["tr", "Türkçe", "Dil"],
    ["id", "Bahasa Indonesia", "Bahasa"],
    ["es", "Español", "Idioma"],
    ["de", "Deutsch", "Sprache"],
    ["it", "Italiano", "Lingua"],
    ["pt", "Português", "Idioma"],
    ["nl", "Nederlands", "Taal"],
    ["pl", "Polski", "Język"],
    ["ro", "Română", "Limbă"],
    ["ru", "Русский", "Язык"],
    ["zh", "中文", "语言"],
    ["sw", "Kiswahili", "Lugha"]
  ];

  const LANGUAGE_MAP = new Map(
    LANGUAGES.map(([code, name, label]) => [code, { name, label }])
  );

  function normalizeLanguage(value = "") {
    const primary = String(value).toLowerCase().replace("_", "-").split("-")[0];
    return LANGUAGE_MAP.has(primary) ? primary : "fr";
  }

  function pageContext() {
    const parts = window.location.pathname
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean);

    const slug = parts[parts.length - 1] || "";
    if (!PILLAR_SLUGS.has(slug)) return null;

    const routeLanguage = parts.length > 1 && LANGUAGE_MAP.has(parts[0])
      ? parts[0]
      : "fr";

    return { slug, routeLanguage };
  }

  function languageUrl(language, slug) {
    const path = language === "fr" ? `/${slug}` : `/${language}/${slug}`;
    return `${path}${window.location.search}${window.location.hash}`;
  }

  function persistLanguage(language) {
    try {
      localStorage.setItem("sonaraLanguage", language);
      localStorage.setItem("sonaraLanguageChoice", "1");
      localStorage.setItem("sonaraLanguageChoiceV2", "1");
      localStorage.setItem("sonaraLanguageChoiceV1", "1");
    } catch {
      // La navigation linguistique reste fonctionnelle même si le stockage est bloqué.
    }
  }

  function createSwitcher(context) {
    const host = document.querySelector(".pillar-header-inner");
    if (!host || host.querySelector("[data-pillar-language-switcher]")) return null;

    const wrapper = document.createElement("div");
    wrapper.className = "pillar-language-switcher";
    wrapper.dataset.pillarLanguageSwitcher = "";

    const button = document.createElement("button");
    button.className = "pillar-language-button";
    button.type = "button";
    button.setAttribute("aria-haspopup", "true");
    button.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.className = "pillar-language-label";

    const current = document.createElement("span");
    current.className = "pillar-language-current";

    const chevron = document.createElement("span");
    chevron.className = "pillar-language-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";

    button.append(label, current, chevron);

    const menu = document.createElement("div");
    menu.className = "pillar-language-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");

    LANGUAGES.forEach(([code, name]) => {
      const link = document.createElement("a");
      link.className = "pillar-language-option";
      link.href = languageUrl(code, context.slug);
      link.dataset.language = code;
      link.lang = code;
      link.setAttribute("role", "menuitem");
      link.textContent = name;
      link.addEventListener("click", () => persistLanguage(code));
      menu.appendChild(link);
    });

    function closeMenu({ returnFocus = false } = {}) {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      wrapper.classList.remove("is-open");
      if (returnFocus) button.focus();
    }

    function openMenu() {
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      wrapper.classList.add("is-open");
      menu.querySelector('[aria-current="true"]')?.focus();
    }

    button.addEventListener("click", () => {
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!wrapper.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) closeMenu({ returnFocus: true });
    });

    wrapper.append(button, menu);
    host.appendChild(wrapper);

    return { wrapper, button, label, current, menu };
  }

  function updateSwitcher(view, language) {
    if (!view) return;
    const normalized = normalizeLanguage(language);
    const meta = LANGUAGE_MAP.get(normalized) || LANGUAGE_MAP.get("fr");

    view.label.textContent = meta.label;
    view.current.textContent = meta.name;
    view.button.setAttribute("aria-label", `${meta.label} : ${meta.name}`);

    view.menu.querySelectorAll("[data-language]").forEach((link) => {
      const active = link.dataset.language === normalized;
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function init() {
    const context = pageContext();
    if (!context) return;

    const view = createSwitcher(context);
    if (!view) return;

    updateSwitcher(view, document.documentElement.lang || context.routeLanguage);

    window.SonaraI18n?.ready?.then?.(() => {
      updateSwitcher(view, window.SonaraI18n?.getLanguage?.() || document.documentElement.lang || context.routeLanguage);
    }).catch?.(() => {});

    window.addEventListener("sonara:languagechange", (event) => {
      updateSwitcher(view, event.detail?.language || document.documentElement.lang || context.routeLanguage);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
