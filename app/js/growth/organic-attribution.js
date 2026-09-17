(() => {
  "use strict";

  if (window.__SONARA_ORGANIC_ATTRIBUTION_ACTIVE__ === true) return;
  window.__SONARA_ORGANIC_ATTRIBUTION_ACTIVE__ = true;

  const STORAGE_KEY = "sonaraOrganicAttributionV1";
  const LINKED_KEY = "sonaraOrganicAttributionLinkedV1";
  const SESSION_KEY = "sonaraAnalyticsSessionV1";
  const STEP_ONCE_PREFIX = "sonaraOrganicJourneyStepV1:";
  const INTERNAL_DEVICE_PREFIX = "sonaraInternalTrafficDeviceV1:";
  const INTERNAL_TOKEN_PARAM = "sonara_internal_token";
  const INTERNAL_ACTION_PARAM = "sonara_internal_traffic";
  const MAX_LINK_WATCH_MS = 10 * 60 * 1000;
  const LINK_WATCH_INTERVAL_MS = 2000;
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const TRACKING_VERSION = 3;

  let currentSession = null;

  function apiBase() {
    try {
      if (typeof API_URL !== "undefined" && API_URL) return String(API_URL).replace(/\/+$/, "");
    } catch {}
    return String(window.SONARA_PUBLIC_API_URL || "").replace(/\/+$/, "");
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }
  function safeStorageRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function randomId(prefix) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return `${prefix}-${random}`;
  }

  function internalDeviceStorageKey() {
    return `${INTERNAL_DEVICE_PREFIX}${apiBase() || window.location.origin}`;
  }
  function internalDeviceId() {
    const value = String(safeStorageGet(internalDeviceStorageKey()) || "").trim();
    return /^internal-[a-zA-Z0-9_-]{20,200}$/.test(value) ? value : "";
  }

  function cleanInternalActionParams() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(INTERNAL_TOKEN_PARAM);
      url.searchParams.delete(INTERNAL_ACTION_PARAM);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  async function applyInternalDeviceAction() {
    const params = new URLSearchParams(window.location.search);
    const token = String(params.get(INTERNAL_TOKEN_PARAM) || "").trim();
    const action = String(params.get(INTERNAL_ACTION_PARAM) || "").trim().toLowerCase();
    if (!token && action !== "clear") return false;

    if (action === "clear") {
      const existing = internalDeviceId();
      if (existing) await postJson("/api/growth/organic/internal-device/revoke", { deviceId: existing });
      safeStorageRemove(internalDeviceStorageKey());
      cleanInternalActionParams();
      return true;
    }

    const result = await postJson("/api/growth/organic/internal-device/consume", { token });
    if (result?.success === true && /^internal-[a-zA-Z0-9_-]{20,200}$/.test(String(result.deviceId || ""))) {
      safeStorageSet(internalDeviceStorageKey(), String(result.deviceId));
    }
    cleanInternalActionParams();
    return true;
  }

  function parseJsonStorage(key) {
    try {
      const value = JSON.parse(safeStorageGet(key) || "null");
      return value && typeof value === "object" ? value : null;
    } catch { return null; }
  }

  function parseStoredAttribution() { return parseJsonStorage(STORAGE_KEY); }
  function visitorId() { return parseStoredAttribution()?.visitorId || randomId("organic"); }

  function sourceFromValue(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "Unknown";
    if (normalized.includes("google images") || normalized.includes("google_images") || normalized.includes("images.google") || normalized.includes("tbm=isch") || normalized.includes("/imgres")) return "Google Images";
    if (normalized === "google" || normalized.includes("google search") || normalized.includes("google.")) return "Google Search";
    if (normalized.includes("tiktok")) return "TikTok";
    if (normalized.includes("instagram") || normalized === "ig") return "Instagram";
    if (normalized.includes("youtube") || normalized === "yt") return "YouTube";
    if (["direct", "none"].includes(normalized)) return "Direct";
    if (["unknown", "inconnu"].includes(normalized)) return "Unknown";
    return "Referral";
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

  function referrerUrl() {
    try { return document.referrer ? new URL(document.referrer) : null; } catch { return null; }
  }

  function catalogContext() {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const packMatch = pathname.match(/^\/catalog\/packs\/([^/]+)\/?$/i);
    const trackMatch = pathname.match(/^\/catalog\/tracks\/([^/]+)\/([^/]+)\/?$/i);
    if (trackMatch) return { packId: decodeURIComponent(trackMatch[1]), trackId: decodeURIComponent(trackMatch[2]) };
    if (packMatch) return { packId: decodeURIComponent(packMatch[1]), trackId: "" };
    return {
      packId: String(params.get("packId") || params.get("id") || "").slice(0, 180),
      trackId: String(params.get("trackId") || "").slice(0, 180)
    };
  }

  function currentTouch() {
    const params = new URLSearchParams(window.location.search);
    const utmSource = String(params.get("utm_source") || "").trim();
    const referrer = referrerUrl();
    const host = String(referrer?.hostname || "").toLowerCase();
    const sameOriginReferrer = Boolean(referrer && referrer.origin === window.location.origin);
    const context = clientContext();
    const googleImages = Boolean(referrer && /google\./i.test(host) && (referrer.searchParams.get("tbm") === "isch" || /\/imgres/i.test(referrer.pathname) || /images\.google/i.test(host)));
    const inAppSource = ["TikTok", "Instagram", "Google", "YouTube"].includes(context.inApp) ? context.inApp : "";
    const source = utmSource
      ? sourceFromValue(utmSource)
      : sameOriginReferrer
        ? "Direct"
        : googleImages
          ? "Google Images"
          : host
            ? sourceFromValue(host)
            : inAppSource
              ? sourceFromValue(inAppSource)
              : "Direct";

    return {
      source,
      sourceDetail: sameOriginReferrer ? "internal" : (utmSource || (googleImages ? "google-images" : host) || context.inApp || "direct"),
      browser: context.browser,
      inApp: context.inApp,
      platform: context.platform,
      device: context.device,
      navigationType: sameOriginReferrer ? "internal" : "entry",
      medium: String(params.get("utm_medium") || "").slice(0, 120),
      campaign: String(params.get("utm_campaign") || "").slice(0, 160),
      utmContent: String(params.get("utm_content") || "").slice(0, 160),
      utmTerm: String(params.get("utm_term") || "").slice(0, 160),
      referrerHost: host,
      landingPath: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      pathname: window.location.pathname.slice(0, 500),
      ...catalogContext()
    };
  }

  function ensureAttribution(touch = currentTouch()) {
    const stored = parseStoredAttribution();
    const value = stored || { version: 2, visitorId: visitorId(), firstTouch: touch, createdAt: new Date().toISOString() };
    value.lastTouch = touch;
    value.updatedAt = new Date().toISOString();
    safeStorageSet(STORAGE_KEY, JSON.stringify(value));
    return { ...value, isNewVisitor: !stored };
  }

  function ensureSession(touch = currentTouch()) {
    const now = Date.now();
    const stored = parseJsonStorage(SESSION_KEY);
    const lastActivity = new Date(stored?.lastActivityAt || 0).getTime();
    const reusable = stored?.sessionId && Number.isFinite(lastActivity) && now - lastActivity < SESSION_TIMEOUT_MS;
    const previousPath = reusable ? String(stored.lastPath || "") : "";
    const session = reusable ? { ...stored } : {
      version: 1,
      sessionId: randomId("session"),
      startedAt: new Date(now).toISOString(),
      source: touch.source,
      sourceDetail: touch.sourceDetail,
      medium: touch.medium,
      campaign: touch.campaign,
      utmContent: touch.utmContent,
      utmTerm: touch.utmTerm,
      landingPath: touch.landingPath,
      createdAt: new Date(now).toISOString()
    };
    session.lastActivityAt = new Date(now).toISOString();
    session.lastPath = window.location.pathname;
    safeStorageSet(SESSION_KEY, JSON.stringify(session));
    currentSession = { ...session, isNewSession: !reusable, previousPath };
    return currentSession;
  }

  function sessionForEvent(touch = currentTouch()) {
    if (!currentSession?.sessionId) return ensureSession(touch);
    const now = Date.now();
    const lastActivity = new Date(currentSession.lastActivityAt || 0).getTime();
    if (!Number.isFinite(lastActivity) || now - lastActivity >= SESSION_TIMEOUT_MS) {
      currentSession = null;
      return ensureSession(touch);
    }
    currentSession.lastActivityAt = new Date(now).toISOString();
    const stored = { ...currentSession };
    delete stored.isNewSession;
    delete stored.previousPath;
    stored.lastPath = window.location.pathname;
    safeStorageSet(SESSION_KEY, JSON.stringify(stored));
    return currentSession;
  }

  async function postJson(pathname, body) {
    const base = apiBase();
    if (!base) return null;
    try {
      const response = await fetch(`${base}${pathname}`, {
        method: "POST",
        cache: "no-store",
        keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });
      return response.ok ? response.json().catch(() => ({})) : null;
    } catch { return null; }
  }

  function currentAccountId() {
    try {
      const profile = JSON.parse(safeStorageGet("sonaraProfile") || "null");
      return String(profile?.accountId || profile?.id || "").trim();
    } catch { return ""; }
  }

  function journeyDetailText(detail = {}) {
    if (typeof detail === "string") return detail.slice(0, 240);
    if (!detail || typeof detail !== "object") return "";
    return Object.entries(detail).filter(([, value]) => value !== undefined && value !== null && String(value) !== "").map(([key, value]) => `${key}=${String(value)}`).join(" · ").slice(0, 240);
  }

  async function trackEvent(eventType, detail = {}, options = {}) {
    const attribution = ensureAttribution();
    const touch = currentTouch();
    const session = sessionForEvent(touch);
    const type = String(eventType || "event").trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").slice(0, 80);
    const onceKey = options.onceKey ? `${STEP_ONCE_PREFIX}${attribution.visitorId}:${session.sessionId}:${options.onceKey}` : "";
    if (onceKey && safeStorageGet(onceKey) === "true") return null;

    const result = await postJson("/api/growth/organic/visit", {
      visitorId: attribution.visitorId,
      sessionId: session.sessionId,
      sessionStartedAt: session.startedAt,
      sessionSource: session.source,
      sessionSourceDetail: session.sourceDetail,
      userId: currentAccountId(),
      ...touch,
      medium: session.medium || touch.medium || "",
      campaign: session.campaign || touch.campaign || "",
      utmContent: session.utmContent || touch.utmContent || "",
      utmTerm: session.utmTerm || touch.utmTerm || "",
      packId: String(detail?.packId || touch.packId || "").slice(0, 180),
      trackId: String(detail?.trackId || touch.trackId || "").slice(0, 180),
      artistId: String(detail?.artistId || "").slice(0, 180),
      previousPath: session.previousPath || "",
      eventType: type,
      journeyKind: type === "page_view" ? "page" : "event",
      journeyStep: type,
      journeyDetail: journeyDetailText(detail),
      target: detail?.target || detail?.label || "",
      internalDeviceId: internalDeviceId(),
      trackingVersion: TRACKING_VERSION
    });
    if (result?.success === true && onceKey) safeStorageSet(onceKey, "true");
    return result;
  }

  function trackStep(step, detail = {}, options = {}) { return trackEvent(step, detail, options); }
  function trackStepOnce(step, detail = {}, onceKey = step) { return trackEvent(step, detail, { onceKey }); }

  function alreadyLinked(accountId) {
    const linked = parseJsonStorage(LINKED_KEY);
    return linked?.accountId === accountId && linked?.visitorId === parseStoredAttribution()?.visitorId;
  }

  async function linkAccountIfAvailable(attribution) {
    const accountId = currentAccountId();
    if (!accountId) return false;
    if (alreadyLinked(accountId) && !internalDeviceId()) return true;
    const session = currentSession || ensureSession();
    const result = await postJson("/api/growth/organic/link-account", {
      visitorId: attribution.visitorId,
      accountId,
      firstTouch: attribution.firstTouch || null,
      sessionId: session.sessionId,
      sessionStartedAt: session.startedAt,
      sessionSource: session.source,
      sessionSourceDetail: session.sourceDetail,
      internalDeviceId: internalDeviceId(),
      trackingVersion: TRACKING_VERSION
    });
    if (result?.success === true) {
      safeStorageSet(LINKED_KEY, JSON.stringify({ visitorId: attribution.visitorId, accountId, linkedAt: new Date().toISOString(), signupAttributed: result.signupAttributed === true }));
      return true;
    }
    return false;
  }

  function meaningfulLabel(element) {
    return String(
      element?.dataset?.analyticsLabel ||
      element?.getAttribute?.("aria-label") ||
      element?.title ||
      element?.textContent ||
      element?.id ||
      element?.className ||
      "action"
    ).replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function bindInteractionTracking() {
    document.addEventListener("click", (event) => {
      const element = event.target?.closest?.("button, a, [role='button']");
      if (!element || element.closest?.("[data-sonara-analytics-ignore='true']")) return;
      const label = meaningfulLabel(element);
      const classes = String(element.className || "");
      const href = element.tagName === "A" ? String(element.getAttribute("href") || "") : "";
      const signature = `${label} ${classes} ${element.id || ""} ${href}`.toLowerCase();
      const context = catalogContext();
      const trackRow = element.closest?.("[data-track-id]");
      const rowTrackId = String(trackRow?.dataset?.trackId || "").slice(0, 180);
      const detail = { target: label, href, ...context, trackId: rowTrackId || context.trackId || "" };
      if (/download|télécharg|telecharg/.test(signature)) {
        void trackEvent("cta_click", { ...detail, target: `Téléchargement · ${label}` });
        return;
      }
      if (rowTrackId) {
        void trackEvent("track_view", detail, { onceKey: `track_view:${rowTrackId}` });
      }
      if (/join|signup|sign up|inscri|register|create account|créer.*compte|commencer|checkout|obtenir|discover|découvrir/.test(signature)) {
        void trackEvent("cta_click", detail);
        return;
      }
      if (href) {
        try {
          const url = new URL(href, window.location.href);
          if (url.origin === window.location.origin) {
            void trackEvent("navigation_internal", detail);
            return;
          }
        } catch {}
      }
      void trackEvent("click", detail);
    }, true);

    document.addEventListener("play", (event) => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement)) return;
      void trackEvent("audio_play", { target: meaningfulLabel(media), trackId: media.dataset?.trackId || catalogContext().trackId || "" });
    }, true);

    document.addEventListener("pause", (event) => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement) || media.ended) return;
      void trackEvent("audio_pause", { target: meaningfulLabel(media), trackId: media.dataset?.trackId || catalogContext().trackId || "" });
    }, true);
  }

  function pageContextEvent() {
    const params = new URLSearchParams(window.location.search);
    const { packId, trackId } = catalogContext();
    const path = window.location.pathname;
    if (trackId) return ["track_view", { packId, trackId }];
    if (packId && (/pack/i.test(path) || /catalog\/packs/i.test(path))) return ["pack_view", { packId }];
    const category = String(params.get("category") || params.get("categorie") || "").slice(0, 120);
    if (category || /\/catalog\/(?:categories|genres|moods|uses)\//i.test(path)) return ["category_view", { category: category || path }];
    return null;
  }

  function bindOnboardingJourney() {
    const pathname = window.location.pathname;
    const isEntry = pathname === "/" || /\/index\.html$/i.test(pathname);
    if (isEntry) {
      const languageChoice = document.getElementById("sonaraLanguageChoice");
      if (languageChoice && document.documentElement.dataset.sonaraLanguageChosen !== "true") void trackStepOnce("language_choice", {}, "language_choice");
      window.addEventListener("sonara:languagechange", (event) => void trackStepOnce("language_selected", { language: event?.detail?.language || document.documentElement.lang || "" }, "language_selected"));
      let cinematicStarted = document.body?.classList.contains("sonara-cinematic-running") === true;
      if (cinematicStarted) void trackStepOnce("cinematic_started", {}, "cinematic_started");
      const observer = new MutationObserver(() => {
        const running = document.body?.classList.contains("sonara-cinematic-running") === true;
        if (running && !cinematicStarted) { cinematicStarted = true; void trackStepOnce("cinematic_started", {}, "cinematic_started"); return; }
        if (!running && cinematicStarted) { cinematicStarted = false; void trackStepOnce("cinematic_completed", {}, "cinematic_completed"); }
      });
      if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    if (/\/app\/pages\/auth\/inscription\.html$/i.test(pathname)) void trackStepOnce("signup_started", {}, "signup_started");
    if (/\/app\/pages\/auth\/pending\.html$/i.test(pathname)) void trackStepOnce("account_pending", {}, "account_pending");
  }

  async function start() {
    if (await applyInternalDeviceAction()) return;
    const touch = currentTouch();
    const attribution = ensureAttribution(touch);
    const session = ensureSession(touch);

    await trackEvent("page_view", { target: window.location.pathname });
    if (session.isNewSession) {
      await trackEvent("landing_page", { target: touch.landingPath }, { onceKey: "landing_page" });
      if (attribution.isNewVisitor) await trackEvent("new_visitor", {}, { onceKey: "new_visitor" });
      else await trackEvent("returning_visitor", {}, { onceKey: "returning_visitor" });
      if (currentAccountId()) await trackEvent("returning_user", { accountId: currentAccountId() }, { onceKey: "returning_user" });
    }

    const contextual = pageContextEvent();
    if (contextual) await trackEvent(contextual[0], contextual[1], { onceKey: `${contextual[0]}:${contextual[1].trackId || contextual[1].packId || contextual[1].category || window.location.pathname}` });

    bindInteractionTracking();
    bindOnboardingJourney();

    if (await linkAccountIfAvailable(attribution)) return;
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAt >= MAX_LINK_WATCH_MS) { window.clearInterval(timer); return; }
      if (await linkAccountIfAvailable(attribution)) window.clearInterval(timer);
    }, LINK_WATCH_INTERVAL_MS);
  }

  async function linkCurrentAccount() { return linkAccountIfAvailable(ensureAttribution()); }

  window.SonaraOrganicAttribution = Object.freeze({
    trackEvent,
    trackStep,
    trackStepOnce,
    linkCurrentAccount,
    trackDownloadCompleted: (detail = {}) => trackEvent("download_completed", detail),
    getVisitorId: () => ensureAttribution().visitorId,
    getSessionId: () => (currentSession || ensureSession()).sessionId,
    isInternalTraffic: () => Boolean(internalDeviceId())
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
