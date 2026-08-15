(() => {
  "use strict";

  const list = document.getElementById("sonaraSettingsLanguageList");
  const back = document.querySelector(".language-settings-back");

  const fallbackLanguages = [
    { code: "fr", label: "Français" }, { code: "en", label: "English" },
    { code: "sq", label: "Shqip" }, { code: "ar", label: "العربية" },
    { code: "tr", label: "Türkçe" }, { code: "id", label: "Bahasa Indonesia" },
    { code: "es", label: "Español" }, { code: "de", label: "Deutsch" },
    { code: "it", label: "Italiano" }, { code: "pt", label: "Português" },
    { code: "nl", label: "Nederlands" }, { code: "pl", label: "Polski" },
    { code: "ro", label: "Română" }, { code: "ru", label: "Русский" },
    { code: "zh", label: "中文" }, { code: "sw", label: "Kiswahili" }
  ];

  function getBackTarget() {
    const params = new URLSearchParams(window.location.search);
    return params.get("from") === "creator"
      ? "/app/pages/creator/management/settings/settings-creator.html"
      : "/app/pages/account/settings.html";
  }

  function currentLanguage() {
    return window.SonaraI18n?.getLanguage?.() || localStorage.getItem("sonaraLanguage") || "fr";
  }

  function render() {
    if (!list) return;
    const languages = window.SonaraI18n?.getSupportedLanguages?.() || fallbackLanguages;
    const selected = currentLanguage();

    list.innerHTML = languages.map(({ code, label }) => `
      <button type="button" class="language-settings-option ${code === selected ? "is-active" : ""}" data-language="${code}" aria-pressed="${code === selected}">
        <strong>${label}</strong>
        <span class="language-settings-option-right">
          <span class="language-settings-option-code">${code.toUpperCase()}</span>
          <span class="language-settings-check"><i data-lucide="check"></i></span>
        </span>
      </button>
    `).join("");

    window.lucide?.createIcons();

    list.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.dataset.language === currentLanguage()) return;
        list.querySelectorAll("button").forEach((item) => { item.disabled = true; });
        try {
          await window.SonaraI18n?.setLanguage?.(button.dataset.language);
          render();
        } finally {
          list.querySelectorAll("button").forEach((item) => { item.disabled = false; });
        }
      });
    });
  }

  back?.addEventListener("click", () => { window.location.href = getBackTarget(); });

  async function init() {
    try { await window.SonaraI18n?.ready; } catch {}
    render();
    window.lucide?.createIcons();
  }

  init();
})();
