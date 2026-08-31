(() => {
  "use strict";

  if (window.__SONARA_ORGANIC_ATTRIBUTION_ACTIVE__ === true) return;
  window.__SONARA_ORGANIC_ATTRIBUTION_ACTIVE__ = true;

  const STORAGE_KEY = "sonaraOrganicAttributionV1";
  const LINKED_KEY = "sonaraOrganicAttributionLinkedV1";
  const STEP_ONCE_PREFIX = "sonaraOrganicJourneyStepV1:";
  const MAX_LINK_WATCH_MS = 10 * 60 * 1000;
  const LINK_WATCH_INTERVAL_MS = 2000;

  function apiBase() {
    try {
      if (typeof API_URL !== "undefined" && API_URL) return String(API_URL).replace(/\/+$/, "");
    } catch {
      // Le fallback public ci-dessous couvre les pages SSR sans config.js.
    }
    return String(window.SONARA_PUBLIC_API_URL || "").replace(/\/+$/, "");
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Le tracking reste non bloquant si le stockage navigateur est indisponible.
    }
  }

  function parseStoredAttribution() {
    try {
      const value = JSON.parse(safeStorageGet(STORAGE_KEY) || "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function visitorId() {
    const stored = parseStoredAttribution();
    if (stored?.visitorId) return String(stored.visitorId);

    const random = globalThis.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return `organic-${random}`;
  }

  function sourceFromValue(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "Direct";
    if (normalized.includes("google")) return "Google";
    if (normalized.includes("tiktok")) return "TikTok";
    if (normalized.includes("instagram") || normalized === "ig") return "Instagram";
    if (normalized.includes("youtube") || normalized === "yt") return "YouTube";
    if (["direct", "none", "unknown"].includes(normalized)) return "Direct";
    return "Other";
  }


  function clientContext() {
    const ua = String(navigator.userAgent || "");
    const lower = ua.toLowerCase();

    let browser = "Other";
    if (/\bopr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
    else if (/edg\//i.test(ua)) browser = "Edge";
    else if (/firefox\//i.test(ua) || /fxios\//i.test(ua)) browser = "Firefox";
    else if (/chrome\//i.test(ua) || /crios\//i.test(ua)) browser = "Chrome";
    else if (/safari\//i.test(ua)) browser = "Safari";

    let inApp = "";
    if (/tiktok|musical_ly|bytedance|trill/i.test(ua)) inApp = "TikTok";
    else if (/instagram/i.test(ua)) inApp = "Instagram";
    else if (/\bfbav\b|\bfban\b|facebook/i.test(ua)) inApp = "Facebook";
    else if (/\bgsa\//i.test(ua)) inApp = "Google";
    else if (/youtube/i.test(ua)) inApp = "YouTube";

    let platform = "Other";
    if (/iphone|ipad|ipod/i.test(ua)) platform = "iOS";
    else if (/android/i.test(ua)) platform = "Android";
    else if (/windows/i.test(ua)) platform = "Windows";
    else if (/macintosh|mac os x/i.test(ua)) platform = "macOS";
    else if (/linux/i.test(ua)) platform = "Linux";

    let device = "desktop";
    if (/ipad|tablet/i.test(lower)) device = "tablet";
    else if (/mobile|iphone|ipod|android/i.test(lower)) device = "mobile";

    return { browser, inApp, platform, device };
  }

  function referrerHost() {
    try {
      return document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  }

  function currentTouch() {
    const params = new URLSearchParams(window.location.search);
    const utmSource = String(params.get("utm_source") || "").trim();
    const host = referrerHost();
    const sameOriginReferrer = (() => {
      try {
        return Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
      } catch {
        return false;
      }
    })();

    const context = clientContext();
    const inAppSource = ["TikTok", "Instagram", "Google", "YouTube"].includes(context.inApp)
      ? context.inApp
      : "";
    const source = utmSource
      ? sourceFromValue(utmSource)
      : sameOriginReferrer
        ? "Direct"
        : host
          ? sourceFromValue(host)
          : inAppSource || "Direct";

    return {
      source,
      sourceDetail: sameOriginReferrer ? "internal" : (utmSource || host || context.inApp || "direct"),
      browser: context.browser,
      inApp: context.inApp,
      platform: context.platform,
      device: context.device,
      navigationType: sameOriginReferrer ? "internal" : "entry",
      medium: String(params.get("utm_medium") || "").slice(0, 120),
      campaign: String(params.get("utm_campaign") || "").slice(0, 160),
      referrerHost: host,
      landingPath: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      ...catalogContext()
    };
  }

  function journeyDetailText(detail = {}) {
    if (typeof detail === "string") return detail.slice(0, 240);
    if (!detail || typeof detail !== "object") return "";
    return Object.entries(detail)
      .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" · ")
      .slice(0, 240);
  }

  async function trackStep(step, detail = {}, options = {}) {
    const journeyStep = String(step || "").trim().slice(0, 100);
    if (!journeyStep) return null;

    const attribution = ensureAttribution();
    const onceKey = options.onceKey ? `${STEP_ONCE_PREFIX}${attribution.visitorId}:${options.onceKey}` : "";
    if (onceKey && safeStorageGet(onceKey) === "true") return null;

    const result = await postJson("/api/growth/organic/visit", {
      visitorId: attribution.visitorId,
      ...currentTouch(),
      journeyKind: "event",
      journeyStep,
      journeyDetail: journeyDetailText(detail)
    });

    if (result?.success === true && onceKey) safeStorageSet(onceKey, "true");
    return result;
  }

  function trackStepOnce(step, detail = {}, onceKey = step) {
    return trackStep(step, detail, { onceKey });
  }

  function catalogContext() {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const packMatch = pathname.match(/^\/catalog\/packs\/([^/]+)\/?$/i);
    const trackMatch = pathname.match(/^\/catalog\/tracks\/([^/]+)\/([^/]+)\/?$/i);

    if (trackMatch) {
      return {
        packId: decodeURIComponent(trackMatch[1]),
        trackId: decodeURIComponent(trackMatch[2])
      };
    }

    if (packMatch) {
      return {
        packId: decodeURIComponent(packMatch[1]),
        trackId: ""
      };
    }

    return {
      packId: String(params.get("packId") || params.get("id") || "").slice(0, 180),
      trackId: String(params.get("trackId") || "").slice(0, 180)
    };
  }

  function ensureAttribution() {
    const stored = parseStoredAttribution();
    const touch = currentTouch();
    const value = stored || {
      version: 1,
      visitorId: visitorId(),
      firstTouch: touch,
      createdAt: new Date().toISOString()
    };

    value.lastTouch = touch;
    value.updatedAt = new Date().toISOString();
    safeStorageSet(STORAGE_KEY, JSON.stringify(value));
    return value;
  }

  async function postJson(pathname, body) {
    const base = apiBase();
    if (!base) return null;

    try {
      const response = await fetch(`${base}${pathname}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body)
      });
      return response.ok ? response.json().catch(() => ({})) : null;
    } catch {
      return null;
    }
  }

  function currentAccountId() {
    try {
      const profile = JSON.parse(safeStorageGet("sonaraProfile") || "null");
      return String(profile?.accountId || profile?.id || "").trim();
    } catch {
      return "";
    }
  }

  function alreadyLinked(accountId) {
    try {
      const linked = JSON.parse(safeStorageGet(LINKED_KEY) || "{}");
      return linked?.accountId === accountId && linked?.visitorId === parseStoredAttribution()?.visitorId;
    } catch {
      return false;
    }
  }

  async function linkAccountIfAvailable(attribution) {
    const accountId = currentAccountId();
    if (!accountId) return false;
    if (alreadyLinked(accountId)) {
      trackStepOnce("access_granted", { accountId }, `access_granted:${accountId}`);
      return true;
    }

    const result = await postJson("/api/growth/organic/link-account", {
      visitorId: attribution.visitorId,
      accountId
    });

    if (result?.success === true) {
      safeStorageSet(LINKED_KEY, JSON.stringify({
        visitorId: attribution.visitorId,
        accountId,
        linkedAt: new Date().toISOString(),
        signupAttributed: result.signupAttributed === true
      }));
      trackStepOnce("access_granted", { accountId }, `access_granted:${accountId}`);
      return true;
    }

    return false;
  }

  function bindOnboardingJourney() {
    const pathname = window.location.pathname;
    const isEntry = pathname === "/" || /\/index\.html$/i.test(pathname);

    if (isEntry) {
      const languageChoice = document.getElementById("sonaraLanguageChoice");
      if (languageChoice && document.documentElement.dataset.sonaraLanguageChosen !== "true") {
        trackStepOnce("language_choice", {}, "language_choice");
      }

      window.addEventListener("sonara:languagechange", (event) => {
        trackStepOnce(
          "language_selected",
          { language: event?.detail?.language || document.documentElement.lang || "" },
          "language_selected"
        );
      });

      let cinematicStarted = document.body?.classList.contains("sonara-cinematic-running") === true;
      if (cinematicStarted) trackStepOnce("cinematic_started", {}, "cinematic_started");

      const observer = new MutationObserver(() => {
        const running = document.body?.classList.contains("sonara-cinematic-running") === true;
        if (running && !cinematicStarted) {
          cinematicStarted = true;
          trackStepOnce("cinematic_started", {}, "cinematic_started");
          return;
        }
        if (!running && cinematicStarted) {
          cinematicStarted = false;
          trackStepOnce("cinematic_completed", {}, "cinematic_completed");
        }
      });
      if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    if (/\/app\/pages\/auth\/inscription\.html$/i.test(pathname)) {
      trackStepOnce("registration_started", {}, "registration_started");
    }

    if (/\/app\/pages\/auth\/pending\.html$/i.test(pathname)) {
      trackStepOnce("account_pending", {}, "account_pending");
    }
  }

  async function start() {
    const attribution = ensureAttribution();
    const touch = currentTouch();

    await postJson("/api/growth/organic/visit", {
      visitorId: attribution.visitorId,
      ...touch,
      journeyKind: "page"
    });

    bindOnboardingJourney();

    if (await linkAccountIfAvailable(attribution)) return;

    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAt >= MAX_LINK_WATCH_MS) {
        window.clearInterval(timer);
        return;
      }

      if (await linkAccountIfAvailable(attribution)) {
        window.clearInterval(timer);
      }
    }, LINK_WATCH_INTERVAL_MS);
  }

  window.SonaraOrganicAttribution = Object.freeze({
    trackStep,
    trackStepOnce
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
