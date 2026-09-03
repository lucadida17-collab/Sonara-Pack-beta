const fs = require("fs");
const path = require("path");

const ORGANIC_SOURCES = Object.freeze([
  "Google",
  "TikTok",
  "Instagram",
  "YouTube",
  "Direct",
  "Other"
]);

function text(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeEnvironment(value) {
  const environment = text(value, 20).toLowerCase();
  return ["local", "test", "main"].includes(environment) ? environment : "local";
}

function normalizeSource(value) {
  const source = text(value, 80).toLowerCase();
  if (!source) return "Direct";
  if (source.includes("google")) return "Google";
  if (source.includes("tiktok")) return "TikTok";
  if (source.includes("instagram") || source === "ig") return "Instagram";
  if (source.includes("youtube") || source === "yt") return "YouTube";
  if (["direct", "none"].includes(source)) return "Direct";
  return "Other";
}

function safeDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function categoryValues(pack = {}) {
  const values = [];
  if (Array.isArray(pack.categorie)) values.push(...pack.categorie);
  else if (pack.categorie) values.push(pack.categorie);
  if (Array.isArray(pack.categories)) values.push(...pack.categories);
  else if (pack.categories) values.push(pack.categories);
  if (pack.category) values.push(pack.category);
  return [...new Set(values.map((value) => text(value, 120)).filter(Boolean))];
}

function artistName(pack = {}) {
  return text(
    pack.artistProfile?.name ||
    pack.artistProfile?.pseudo ||
    pack.artist ||
    pack.pseudo ||
    "Artiste Sonara",
    180
  );
}

function artistAvatar(pack = {}) {
  return text(
    pack.artistProfile?.avatar ||
    pack.artistProfile?.imageArtist ||
    pack.artistProfile?.imageProfile ||
    pack.imageArtist ||
    pack.imageProfile ||
    "",
    1000
  );
}

function publicTrack(track = {}, pack = {}) {
  return {
    id: text(track.id, 180),
    title: text(track.title || "Track Sonara", 240),
    artist: text(track.artist || artistName(pack), 180),
    coverPack: text(track.coverPack || pack.coverPack, 1000),
    audioName: text(track.audioName || track.audio, 1000),
    previewStart: Math.max(0, Number(track.previewStart || 0) || 0),
    previewDuration: Math.min(30, Math.max(1, Number(track.previewDuration || 30) || 30)),
    duration: Math.max(0, Number(track.duration || 0) || 0),
    price: text(track.price || track.trackPrice || track.unitPrice, 80)
  };
}

function publicPack(pack = {}) {
  const tracks = Array.isArray(pack.tracks) ? pack.tracks.map((track) => publicTrack(track, pack)) : [];
  const categories = categoryValues(pack);
  const license = pack.license && typeof pack.license === "object"
    ? {
        id: text(pack.license.id, 220),
        version: Number(pack.license.version || 1) || 1,
        name: text(pack.license.name || "Licence standard Sonara", 180),
        creditRequired: pack.license.creditRequired === true,
        territory: text(pack.license.territory || "worldwide", 80),
        duration: text(pack.license.duration || "perpetual", 80)
      }
    : null;

  return {
    id: text(pack.id, 180),
    title: text(pack.title || pack.name || "Pack Sonara", 240),
    artist: artistName(pack),
    artistAvatar: artistAvatar(pack),
    coverPack: text(pack.coverPack, 1000),
    categories,
    category: categories[0] || "",
    contentType: text(pack.contentType || "audio", 40).toLowerCase() || "audio",
    publishedAt: text(pack.publishedAt || pack.moderatedAt || pack.createdAt, 80),
    price: text(pack.price || pack.packPrice || pack.totalPrice, 80),
    license,
    trackCount: tracks.length,
    tracks
  };
}

function trackSeoEligible(pack = {}, track = {}) {
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
  if (tracks.length === 1) return true;

  const explicitIds = Array.isArray(pack.seoTrackIds)
    ? pack.seoTrackIds.map((value) => String(value))
    : [];

  return (
    track.publicPage === true ||
    track.seoPublic === true ||
    track.featured === true ||
    track.isFeatured === true ||
    track.topTrack === true ||
    explicitIds.includes(String(track.id || ""))
  );
}

function encodePath(value) {
  return encodeURIComponent(String(value || ""));
}

function publicPackUrl(origin, packId) {
  return `${String(origin || "").replace(/\/+$/, "")}/catalog/packs/${encodePath(packId)}`;
}

function publicTrackUrl(origin, packId, trackId) {
  return `${String(origin || "").replace(/\/+$/, "")}/catalog/tracks/${encodePath(packId)}/${encodePath(trackId)}`;
}

function publicPackPreviewUrl(environment, origin, packId) {
  const cleanOrigin = String(origin || "").replace(/\/+$/, "");
  if (normalizeEnvironment(environment) !== "local") return publicPackUrl(cleanOrigin, packId);
  return `${cleanOrigin}/app/pages/catalog/public-pack.html?id=${encodeURIComponent(String(packId || ""))}`;
}

function publicTrackPreviewUrl(environment, origin, packId, trackId) {
  const cleanOrigin = String(origin || "").replace(/\/+$/, "");
  if (normalizeEnvironment(environment) !== "local") return publicTrackUrl(cleanOrigin, packId, trackId);
  return `${cleanOrigin}/app/pages/catalog/public-track.html?packId=${encodeURIComponent(String(packId || ""))}&trackId=${encodeURIComponent(String(trackId || ""))}`;
}

function trackedPublicUrl(url, source, campaign) {
  try {
    const target = new URL(String(url || ""));
    target.searchParams.set("utm_source", source);
    target.searchParams.set("utm_medium", "social");
    target.searchParams.set("utm_campaign", campaign);
    return target.toString();
  } catch {
    const separator = String(url || "").includes("?") ? "&" : "?";
    return `${url}${separator}utm_source=${encodeURIComponent(source)}&utm_medium=social&utm_campaign=${encodeURIComponent(campaign)}`;
  }
}

function requestOrigin(req) {
  const proto = text(req.headers?.["x-forwarded-proto"] || req.protocol || "https", 20).split(",")[0];
  const host = text(req.headers?.["x-forwarded-host"] || req.headers?.host, 300).split(",")[0];
  return host ? `${proto}://${host}` : "";
}

function mediaUrl(req, value) {
  const raw = text(value, 1500).replace(/\\/g, "/");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(?:blob:|data:)/i.test(raw)) return "";
  if (raw.startsWith("/app/") || raw.startsWith("app/") || raw.startsWith("/assets/") || raw.startsWith("assets/")) {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }

  const origin = requestOrigin(req);
  if (!origin) return raw;
  if (raw.startsWith("/uploads/") || raw.startsWith("/downloads/")) return `${origin}${raw}`;
  if (raw.startsWith("uploads/") || raw.startsWith("downloads/")) return `${origin}/${raw}`;
  return `${origin}/uploads/${raw.replace(/^\/+/, "")}`;
}

function packCommunicationKit(req, pack, publicOrigin, environment = "main") {
  const normalized = publicPack(pack);
  const previewTrack = normalized.tracks.find((track) => track.audioName) || null;
  const publicUrl = publicPackPreviewUrl(environment, publicOrigin, normalized.id);
  const canonicalUrl = publicPackUrl(publicOrigin, normalized.id);
  const campaign = `pack_${normalized.id}`;
  const trackedLink = (source) => trackedPublicUrl(publicUrl, source, campaign);

  return {
    packId: normalized.id,
    title: normalized.title,
    artist: normalized.artist,
    category: normalized.category,
    categories: normalized.categories,
    coverUrl: mediaUrl(req, normalized.coverPack),
    publicUrl,
    canonicalUrl,
    trackedLinks: {
      tiktok: trackedLink("TikTok"),
      instagram: trackedLink("Instagram"),
      youtube: trackedLink("YouTube")
    },
    previewAudioUrl: previewTrack ? mediaUrl(req, previewTrack.audioName) : "",
    previewStart: previewTrack?.previewStart || 0,
    previewDuration: previewTrack?.previewDuration || 30,
    publishedAt: normalized.publishedAt,
    trackCount: normalized.trackCount
  };
}

function ensureLocalStore(filePath) {
  if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ version: 2, visitors: [] }, null, 2), "utf8");
  }
}

function createLocalStore(filePath) {
  ensureLocalStore(filePath);

  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
      return {
        version: 2,
        visitors: Array.isArray(parsed.visitors) ? parsed.visitors : []
      };
    } catch (error) {
      console.error("Organic visibility LOCAL illisible :", error.message || error);
      return { version: 2, visitors: [] };
    }
  }

  function write(data) {
    data.version = 2;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  function appendJourney(record, touch) {
    const journey = Array.isArray(record.journey) ? record.journey : [];
    const step = { ...touch };
    const previous = journey[journey.length - 1];
    const previousAt = safeDate(previous?.capturedAt)?.getTime() || 0;
    const currentAt = safeDate(step.capturedAt)?.getTime() || Date.now();
    const duplicate = previous &&
      String(previous.landingPath || "") === String(step.landingPath || "") &&
      String(previous.campaign || "") === String(step.campaign || "") &&
      String(previous.journeyStep || "") === String(step.journeyStep || "") &&
      currentAt - previousAt < 3000;

    if (!duplicate) journey.push(step);
    record.journey = journey.slice(-120);
  }

  return {
    async upsertVisit(visitorId, touch) {
      const data = read();
      const now = new Date().toISOString();
      let record = data.visitors.find((item) => String(item.visitorId) === visitorId);
      if (!record) {
        record = {
          visitorId,
          firstTouch: touch,
          lastTouch: touch,
          firstSeenAt: now,
          lastSeenAt: now,
          visitCount: touch.journeyKind === "event" ? 0 : 1,
          accountId: "",
          accountCreatedAt: "",
          linkedAt: "",
          signupAttributed: false,
          journey: []
        };
        appendJourney(record, touch);
        data.visitors.push(record);
      } else {
        if (!record.firstTouch) record.firstTouch = touch;
        record.lastTouch = touch;
        record.lastSeenAt = now;
        if (touch.journeyKind !== "event") {
          record.visitCount = Math.max(0, Number(record.visitCount || 0)) + 1;
        }
        appendJourney(record, touch);
      }
      write(data);
      return record;
    },

    async linkAccount(visitorId, accountInfo = {}) {
      const data = read();
      const record = data.visitors.find((item) => String(item.visitorId) === visitorId);
      if (!record) return null;
      Object.assign(record, accountInfo);
      write(data);
      return record;
    },

    async list() {
      return read().visitors;
    }
  };
}

function createMongoStore(collection) {
  return {
    async upsertVisit(visitorId, touch) {
      const now = new Date().toISOString();
      await collection.updateOne(
        { visitorId },
        {
          $setOnInsert: {
            visitorId,
            firstTouch: touch,
            firstSeenAt: now,
            visitCount: 0,
            accountId: "",
            accountCreatedAt: "",
            linkedAt: "",
            signupAttributed: false
          },
          $set: {
            lastTouch: touch,
            lastSeenAt: now
          },
          $inc: { visitCount: touch.journeyKind === "event" ? 0 : 1 },
          $push: { journey: { $each: [touch], $slice: -120 } }
        },
        { upsert: true }
      );
      return collection.findOne({ visitorId }, { projection: { _id: 0 } });
    },

    async linkAccount(visitorId, accountInfo = {}) {
      const result = await collection.findOneAndUpdate(
        { visitorId },
        { $set: accountInfo },
        { returnDocument: "after", projection: { _id: 0 } }
      );
      return result || null;
    },

    async list() {
      return collection.find({}, { projection: { _id: 0 } }).sort({ firstSeenAt: -1 }).limit(50000).toArray();
    }
  };
}

function createStore({ environment, db, dataDir }) {
  if (db && typeof db.collection === "function") {
    return createMongoStore(db.collection(`organic_visibility_${normalizeEnvironment(environment)}`));
  }
  return createLocalStore(path.join(dataDir || process.cwd(), `organic-visibility-${environment}.json`));
}

function normalizeTouch(body = {}) {
  return {
    source: normalizeSource(body.source),
    sourceDetail: text(body.sourceDetail, 120),
    medium: text(body.medium, 120),
    campaign: text(body.campaign, 160),
    referrerHost: text(body.referrerHost, 220).toLowerCase(),
    browser: text(body.browser, 60),
    inApp: text(body.inApp, 60),
    platform: text(body.platform, 60),
    device: text(body.device, 30),
    navigationType: ["entry", "internal", "unknown"].includes(text(body.navigationType, 30).toLowerCase())
      ? text(body.navigationType, 30).toLowerCase()
      : "unknown",
    landingPath: text(body.landingPath, 500),
    packId: text(body.packId, 180),
    trackId: text(body.trackId, 180),
    journeyKind: ["page", "event"].includes(text(body.journeyKind, 20).toLowerCase())
      ? text(body.journeyKind, 20).toLowerCase()
      : "page",
    journeyStep: text(body.journeyStep, 100),
    journeyDetail: text(body.journeyDetail, 240),
    capturedAt: new Date().toISOString()
  };
}

function signupAttribution(firstSeenAt, accountCreatedAt, linkedAt) {
  const firstSeen = safeDate(firstSeenAt);
  const created = safeDate(accountCreatedAt);
  const linked = safeDate(linkedAt);
  if (!firstSeen || !created || !linked) return false;

  const earlyToleranceMs = 10 * 60 * 1000;
  const maximumSignupWindowMs = 7 * 24 * 60 * 60 * 1000;
  return (
    created.getTime() >= firstSeen.getTime() - earlyToleranceMs &&
    created.getTime() <= firstSeen.getTime() + maximumSignupWindowMs &&
    created.getTime() <= linked.getTime() + earlyToleranceMs
  );
}

function accountSnapshot(found, requestedId) {
  const account = found?.account || null;
  if (!account) return null;
  return {
    accountId: text(account.accountId || account.id || requestedId, 180),
    pseudo: text(account.pseudo || account.name || account.artistName, 180),
    role: text(account.role || account.originalRole, 80),
    createdAt: text(account.createdAt || account.registeredAt, 80)
  };
}

function summarizeAttribution(records = []) {
  const sourceMap = new Map(ORGANIC_SOURCES.map((source) => [source, {
    source,
    visitors: 0,
    visits: 0,
    signups: 0,
    conversionRate: 0
  }]));

  const accountSources = new Map();
  const linkedAccounts = new Map();

  for (const record of records) {
    const source = normalizeSource(record?.firstTouch?.source);
    const row = sourceMap.get(source) || sourceMap.get("Other");
    row.visitors += 1;
    row.visits += Math.max(1, Number(record.visitCount || 1));

    if (record.accountId) {
      const accountId = String(record.accountId);
      const firstSeenTime = safeDate(record.firstSeenAt)?.getTime() || Number.MAX_SAFE_INTEGER;
      const lastSeenTime = safeDate(record.lastSeenAt)?.getTime() || 0;
      let linked = linkedAccounts.get(accountId);
      if (!linked) {
        linked = {
          accountId,
          pseudo: text(record.accountPseudo, 180),
          role: text(record.accountRole, 80),
          accountCreatedAt: text(record.accountCreatedAt, 80),
          firstObservedAt: text(record.firstSeenAt, 80),
          firstObservedTime: firstSeenTime,
          lastObservedAt: text(record.lastSeenAt, 80),
          lastObservedTime: lastSeenTime,
          firstObservedSource: source,
          firstObservedBrowser: text(record.firstTouch?.browser, 60),
          firstObservedInApp: text(record.firstTouch?.inApp, 60),
          firstObservedPlatform: text(record.firstTouch?.platform, 60),
          firstObservedDevice: text(record.firstTouch?.device, 30),
          lastObservedBrowser: text(record.lastTouch?.browser, 60),
          lastObservedInApp: text(record.lastTouch?.inApp, 60),
          lastObservedPlatform: text(record.lastTouch?.platform, 60),
          lastObservedDevice: text(record.lastTouch?.device, 30),
          signupAttributed: false,
          attributedSource: "",
          steps: []
        };
        linkedAccounts.set(accountId, linked);
      }

      if (firstSeenTime < linked.firstObservedTime) {
        linked.firstObservedTime = firstSeenTime;
        linked.firstObservedAt = text(record.firstSeenAt, 80);
        linked.firstObservedSource = source;
      }
      if (lastSeenTime >= linked.lastObservedTime) {
        linked.lastObservedTime = lastSeenTime;
        linked.lastObservedAt = text(record.lastSeenAt, 80);
        linked.lastObservedBrowser = text(record.lastTouch?.browser, 60);
        linked.lastObservedInApp = text(record.lastTouch?.inApp, 60);
        linked.lastObservedPlatform = text(record.lastTouch?.platform, 60);
        linked.lastObservedDevice = text(record.lastTouch?.device, 30);
      }
      if (!linked.pseudo && record.accountPseudo) linked.pseudo = text(record.accountPseudo, 180);
      if (!linked.role && record.accountRole) linked.role = text(record.accountRole, 80);
      if (!linked.accountCreatedAt && record.accountCreatedAt) linked.accountCreatedAt = text(record.accountCreatedAt, 80);

      const journey = Array.isArray(record.journey) && record.journey.length
        ? record.journey
        : [record.firstTouch, record.lastTouch].filter(Boolean);
      for (const step of journey) {
        linked.steps.push({
          source: normalizeSource(step?.source),
          sourceDetail: text(step?.sourceDetail, 120),
          navigationType: text(step?.navigationType || "unknown", 30),
          landingPath: text(step?.landingPath, 500),
          referrerHost: text(step?.referrerHost, 220),
          browser: text(step?.browser, 60),
          inApp: text(step?.inApp, 60),
          platform: text(step?.platform, 60),
          device: text(step?.device, 30),
          campaign: text(step?.campaign, 160),
          packId: text(step?.packId, 180),
          trackId: text(step?.trackId, 180),
          journeyKind: text(step?.journeyKind || "page", 20),
          journeyStep: text(step?.journeyStep, 100),
          journeyDetail: text(step?.journeyDetail, 240),
          capturedAt: text(step?.capturedAt, 80)
        });
      }
    }

    if (record.signupAttributed === true && record.accountId) {
      const accountId = String(record.accountId);
      const current = accountSources.get(accountId);
      const candidateTime = safeDate(record.linkedAt)?.getTime() || Number.MAX_SAFE_INTEGER;
      if (!current || candidateTime < current.time) {
        accountSources.set(accountId, { source, time: candidateTime, record });
      }
    }
  }

  for (const [accountId, { source }] of accountSources.entries()) {
    const row = sourceMap.get(source) || sourceMap.get("Other");
    row.signups += 1;
    const linked = linkedAccounts.get(accountId);
    if (linked) {
      linked.signupAttributed = true;
      linked.attributedSource = source;
    }
  }

  const bySource = ORGANIC_SOURCES.map((source) => {
    const row = sourceMap.get(source);
    row.conversionRate = row.visitors > 0 ? Number(((row.signups / row.visitors) * 100).toFixed(2)) : 0;
    return row;
  });

  const accountAttributions = [...linkedAccounts.values()]
    .sort((a, b) => {
      const createdA = safeDate(a.accountCreatedAt)?.getTime() || 0;
      const createdB = safeDate(b.accountCreatedAt)?.getTime() || 0;
      return createdB - createdA || b.lastObservedTime - a.lastObservedTime;
    })
    .map((entry) => ({
      accountId: entry.accountId,
      pseudo: entry.pseudo,
      role: entry.role,
      accountCreatedAt: entry.accountCreatedAt,
      signupAttributed: entry.signupAttributed === true,
      source: entry.signupAttributed ? entry.attributedSource : "",
      firstObservedSource: entry.firstObservedSource || "",
      firstObservedAt: entry.firstObservedAt,
      lastObservedAt: entry.lastObservedAt,
      browser: entry.firstObservedBrowser || entry.lastObservedBrowser || "",
      inApp: entry.firstObservedInApp || entry.lastObservedInApp || "",
      platform: entry.firstObservedPlatform || entry.lastObservedPlatform || "",
      device: entry.firstObservedDevice || entry.lastObservedDevice || "",
      attributionStatus: entry.signupAttributed ? "signup_attributed" : "historical_unknown"
    }));

  const recentSignups = [...accountSources.values()]
    .sort((a, b) => b.time - a.time)
    .slice(0, 30)
    .map(({ source, record }) => ({
      accountId: text(record.accountId, 180),
      pseudo: text(record.accountPseudo, 180),
      role: text(record.accountRole, 80),
      accountCreatedAt: text(record.accountCreatedAt, 80),
      linkedAt: text(record.linkedAt, 80),
      source,
      landingPath: text(record.firstTouch?.landingPath, 500),
      packId: text(record.firstTouch?.packId, 180),
      trackId: text(record.firstTouch?.trackId, 180),
      campaign: text(record.firstTouch?.campaign, 160),
      browser: text(record.firstTouch?.browser || record.lastTouch?.browser, 60),
      inApp: text(record.firstTouch?.inApp || record.lastTouch?.inApp, 60),
      platform: text(record.firstTouch?.platform || record.lastTouch?.platform, 60),
      device: text(record.firstTouch?.device || record.lastTouch?.device, 30)
    }));

  const journeys = [...linkedAccounts.values()]
    .sort((a, b) => b.lastObservedTime - a.lastObservedTime)
    .slice(0, 50)
    .map((entry) => {
      const steps = entry.steps
        .filter((step) => step.landingPath || step.referrerHost || step.campaign)
        .sort((a, b) => (safeDate(a.capturedAt)?.getTime() || 0) - (safeDate(b.capturedAt)?.getTime() || 0));
      const deduped = [];
      for (const step of steps) {
        const previous = deduped[deduped.length - 1];
        if (
          previous &&
          previous.landingPath === step.landingPath &&
          previous.campaign === step.campaign &&
          previous.journeyStep === step.journeyStep &&
          Math.abs((safeDate(step.capturedAt)?.getTime() || 0) - (safeDate(previous.capturedAt)?.getTime() || 0)) < 3000
        ) continue;
        deduped.push(step);
      }
      return {
        accountId: entry.accountId,
        pseudo: entry.pseudo,
        role: entry.role,
        accountCreatedAt: entry.accountCreatedAt,
        firstObservedAt: entry.firstObservedAt,
        lastObservedAt: entry.lastObservedAt,
        signupAttributed: entry.signupAttributed,
        source: entry.signupAttributed ? entry.attributedSource : "",
        firstObservedSource: entry.firstObservedSource,
        browser: entry.firstObservedBrowser || entry.lastObservedBrowser || "",
        inApp: entry.firstObservedInApp || entry.lastObservedInApp || "",
        platform: entry.firstObservedPlatform || entry.lastObservedPlatform || "",
        device: entry.firstObservedDevice || entry.lastObservedDevice || "",
        attributionStatus: entry.signupAttributed ? "signup_attributed" : "historical_unknown",
        journey: deduped.slice(-60)
      };
    });

  return {
    visitors: records.length,
    visits: records.reduce((total, record) => total + Math.max(1, Number(record.visitCount || 1)), 0),
    attributedSignups: accountSources.size,
    linkedAccounts: linkedAccounts.size,
    bySource,
    accountAttributions,
    recentSignups,
    journeys
  };
}

function optionalPackMetric(pack = {}, names = []) {
  const metrics = pack?.metrics && typeof pack.metrics === "object" ? pack.metrics : {};
  for (const name of names) {
    const candidates = [metrics[name], pack?.[name]];
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || candidate === "") continue;
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return null;
}

function founderPackNetworkStats(records = [], packId = "") {
  const normalizedPackId = String(packId || "");
  const sourceBreakdown = Object.fromEntries(ORGANIC_SOURCES.map((source) => [source, 0]));
  let arrivals = 0;
  let signups = 0;

  for (const record of Array.isArray(records) ? records : []) {
    if (String(record?.firstTouch?.packId || "") !== normalizedPackId) continue;
    arrivals += 1;
    const source = normalizeSource(record?.firstTouch?.source);
    sourceBreakdown[source] = Math.max(0, Number(sourceBreakdown[source] || 0)) + 1;
    if (record?.signupAttributed === true && record?.accountId) signups += 1;
  }

  return {
    arrivals,
    signups,
    conversionRate: arrivals > 0 ? Number(((signups / arrivals) * 100).toFixed(1)) : 0,
    sourceBreakdown
  };
}

function normalizedNetworkSignal(value, maximum) {
  const safeValue = Math.max(0, Number(value || 0));
  const safeMaximum = Math.max(0, Number(maximum || 0));
  if (safeMaximum <= 0) return null;
  return Math.max(0, Math.min(100, (Math.log1p(safeValue) / Math.log1p(safeMaximum)) * 100));
}

function buildFounderPackCatalog(req, packs = [], records = [], publicOrigin = "", environment = "main") {
  const rows = (Array.isArray(packs) ? packs : []).map((pack) => {
    const normalized = publicPack(pack);
    const network = founderPackNetworkStats(records, normalized.id);
    const downloads = optionalPackMetric(pack, ["downloadCount", "downloads"]) ?? 0;
    const listens = optionalPackMetric(pack, ["listenCount", "listens", "playCount", "plays"]);
    const clicks = optionalPackMetric(pack, ["clickCount", "clicks"]);
    const impressions = optionalPackMetric(pack, ["impressionCount", "impressions"]);
    const libraryAdds = optionalPackMetric(pack, ["libraryAddCount", "libraryAdds"]);

    return {
      packId: normalized.id,
      title: normalized.title,
      artist: normalized.artist,
      category: normalized.category,
      categories: normalized.categories,
      status: text(pack?.status || "approved", 40),
      coverUrl: mediaUrl(req, normalized.coverPack),
      publicUrl: publicPackPreviewUrl(environment, publicOrigin, normalized.id),
      canonicalUrl: publicPackUrl(publicOrigin, normalized.id),
      publishedAt: normalized.publishedAt,
      trackCount: normalized.trackCount,
      tracks: normalized.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        previewStart: track.previewStart,
        previewDuration: track.previewDuration,
        previewAudioUrl: mediaUrl(req, track.audioName),
        coverUrl: mediaUrl(req, track.coverPack)
      })),
      stats: {
        downloads,
        arrivals: network.arrivals,
        signups: network.signups,
        conversionRate: network.conversionRate,
        listens,
        clicks,
        impressions,
        libraryAdds,
        sourceBreakdown: network.sourceBreakdown
      },
      score: 0,
      rank: 0
    };
  });

  const maxima = {
    downloads: Math.max(0, ...rows.map((row) => Number(row.stats.downloads || 0))),
    arrivals: Math.max(0, ...rows.map((row) => Number(row.stats.arrivals || 0))),
    signups: Math.max(0, ...rows.map((row) => Number(row.stats.signups || 0))),
    listens: Math.max(0, ...rows.map((row) => Number(row.stats.listens || 0)).filter(Number.isFinite))
  };

  rows.forEach((row) => {
    const components = [
      [normalizedNetworkSignal(row.stats.downloads, maxima.downloads), 0.50],
      [normalizedNetworkSignal(row.stats.arrivals, maxima.arrivals), 0.20],
      [normalizedNetworkSignal(row.stats.signups, maxima.signups), 0.20],
      [normalizedNetworkSignal(row.stats.listens, maxima.listens), 0.10]
    ].filter(([score]) => score !== null);

    const totalWeight = components.reduce((sum, [, weight]) => sum + weight, 0);
    row.score = totalWeight > 0
      ? Number((components.reduce((sum, [score, weight]) => sum + score * weight, 0) / totalWeight).toFixed(1))
      : 0;
  });

  rows.sort((a, b) =>
    Number(b.score || 0) - Number(a.score || 0) ||
    Number(b.stats.downloads || 0) - Number(a.stats.downloads || 0) ||
    Number(b.stats.signups || 0) - Number(a.stats.signups || 0) ||
    Number(b.stats.arrivals || 0) - Number(a.stats.arrivals || 0) ||
    new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  );

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function registerOrganicVisibility({
  app,
  environment,
  commercialPolicy,
  getPublicPacks,
  findAccount,
  requireFounderKey,
  db = null,
  dataDir = null,
  publicOrigin = ""
}) {
  const runtimeEnvironment = normalizeEnvironment(environment);
  const store = createStore({ environment: runtimeEnvironment, db, dataDir });
  const normalizedPublicOrigin = String(publicOrigin || "").replace(/\/+$/, "");

  async function visiblePacks() {
    const packs = await getPublicPacks();
    return Array.isArray(packs) ? packs : [];
  }

  app.post("/api/growth/organic/visit", async (req, res) => {
    try {
      const visitorId = text(req.body?.visitorId, 180);
      if (!/^[a-zA-Z0-9:_-]{12,180}$/.test(visitorId)) {
        return res.status(400).json({ success: false, message: "Identifiant visiteur invalide." });
      }
      const record = await store.upsertVisit(visitorId, normalizeTouch(req.body));
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        visitorId: record?.visitorId || visitorId
      });
    } catch (error) {
      console.error("Organic visit impossible :", error);
      return res.status(500).json({ success: false, message: "Tracking organique indisponible." });
    }
  });

  app.post("/api/growth/organic/link-account", async (req, res) => {
    try {
      const visitorId = text(req.body?.visitorId, 180);
      const requestedAccountId = text(req.body?.accountId, 180);
      if (!visitorId || !requestedAccountId) {
        return res.status(400).json({ success: false, message: "Attribution incomplète." });
      }

      const found = await Promise.resolve(findAccount(requestedAccountId));
      const account = accountSnapshot(found, requestedAccountId);
      if (!account) {
        return res.status(404).json({ success: false, message: "Compte introuvable." });
      }

      let records = await store.list();
      let existing = records.find((record) => String(record.visitorId) === visitorId);

      // Correction chirurgicale : la source initiale est déjà figée côté navigateur.
      // Si la toute première requête /visit a été perdue (navigation très rapide,
      // cold start, réseau mobile), on recrée ici UNIQUEMENT ce firstTouch avant
      // de relier le compte. Aucune source n'est inventée côté serveur.
      if (!existing && req.body?.firstTouch && typeof req.body.firstTouch === "object") {
        existing = await store.upsertVisit(
          visitorId,
          normalizeTouch({
            ...req.body.firstTouch,
            journeyKind: "event",
            journeyStep: "registration_attribution_recovered"
          })
        );
      }

      if (!existing) {
        return res.status(404).json({ success: false, message: "Visite organique introuvable." });
      }

      const linkedAt = new Date().toISOString();
      const record = await store.linkAccount(visitorId, {
        accountId: account.accountId,
        accountPseudo: account.pseudo,
        accountRole: account.role,
        accountCreatedAt: account.createdAt,
        linkedAt,
        signupAttributed: signupAttribution(existing.firstSeenAt, account.createdAt, linkedAt)
      });

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        accountId: account.accountId,
        signupAttributed: record?.signupAttributed === true
      });
    } catch (error) {
      console.error("Organic account link impossible :", error);
      return res.status(500).json({ success: false, message: "Attribution du compte indisponible." });
    }
  });

  app.get("/api/seo/catalog", requireFounderKey, async (_req, res) => {
    try {
      const packs = await visiblePacks();
      const packEntries = [];
      const trackEntries = [];

      for (const pack of packs) {
        const normalized = publicPack(pack);
        if (!normalized.id) continue;
        packEntries.push({
          id: normalized.id,
          url: publicPackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalized.id),
          canonicalUrl: publicPackUrl(normalizedPublicOrigin, normalized.id),
          updatedAt: normalized.publishedAt
        });

        for (const track of Array.isArray(pack.tracks) ? pack.tracks : []) {
          if (!trackSeoEligible(pack, track) || !track?.id) continue;
          trackEntries.push({
            packId: normalized.id,
            trackId: text(track.id, 180),
            url: publicTrackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalized.id, track.id),
            canonicalUrl: publicTrackUrl(normalizedPublicOrigin, normalized.id, track.id),
            updatedAt: normalized.publishedAt
          });
        }
      }

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        packs: packEntries,
        tracks: trackEntries,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("SEO catalog impossible :", error);
      return res.status(500).json({ success: false, message: "Catalogue SEO indisponible." });
    }
  });

  app.get("/api/public/catalog/sitemap", async (_req, res) => {
    try {
      const packs = await visiblePacks();
      const packEntries = [];
      const trackEntries = [];

      for (const pack of packs) {
        const normalized = publicPack(pack);
        if (!normalized.id) continue;

        packEntries.push({
          url: publicPackUrl(normalizedPublicOrigin, normalized.id),
          updatedAt: normalized.publishedAt
        });

        for (const track of Array.isArray(pack.tracks) ? pack.tracks : []) {
          if (!trackSeoEligible(pack, track) || !track?.id) continue;
          trackEntries.push({
            url: publicTrackUrl(normalizedPublicOrigin, normalized.id, track.id),
            updatedAt: normalized.publishedAt
          });
        }
      }

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        packs: packEntries,
        tracks: trackEntries,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Public sitemap catalog impossible :", error);
      return res.status(500).json({ success: false, message: "Catalogue sitemap indisponible." });
    }
  });

  app.get("/api/public/catalog/pack/:id", async (req, res) => {
    try {
      const packs = await visiblePacks();
      const pack = packs.find((item) => String(item?.id || "") === String(req.params.id || ""));
      if (!pack) return res.status(404).json({ success: false, message: "Pack introuvable." });
      const normalized = publicPack(pack);
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        pack: {
          ...normalized,
          coverUrl: mediaUrl(req, normalized.coverPack),
          tracks: normalized.tracks.map((track) => ({
            ...track,
            coverUrl: mediaUrl(req, track.coverPack),
            previewAudioUrl: mediaUrl(req, track.audioName)
          })),
          publicUrl: publicPackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalized.id),
          canonicalUrl: publicPackUrl(normalizedPublicOrigin, normalized.id)
        }
      });
    } catch (error) {
      console.error("Public pack impossible :", error);
      return res.status(500).json({ success: false, message: "Pack public indisponible." });
    }
  });

  app.get("/api/public/catalog/track/:packId/:trackId", async (req, res) => {
    try {
      const packs = await visiblePacks();
      const pack = packs.find((item) => String(item?.id || "") === String(req.params.packId || ""));
      if (!pack) return res.status(404).json({ success: false, message: "Pack introuvable." });
      const track = (Array.isArray(pack.tracks) ? pack.tracks : []).find(
        (item) => String(item?.id || "") === String(req.params.trackId || "")
      );
      if (!track || !trackSeoEligible(pack, track)) {
        return res.status(404).json({ success: false, message: "Track publique introuvable." });
      }

      const normalizedPack = publicPack(pack);
      const normalizedTrack = publicTrack(track, pack);
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        pack: {
          id: normalizedPack.id,
          title: normalizedPack.title,
          artist: normalizedPack.artist,
          category: normalizedPack.category,
          categories: normalizedPack.categories,
          publicUrl: publicPackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalizedPack.id),
          canonicalUrl: publicPackUrl(normalizedPublicOrigin, normalizedPack.id)
        },
        track: {
          ...normalizedTrack,
          coverUrl: mediaUrl(req, normalizedTrack.coverPack),
          previewAudioUrl: mediaUrl(req, normalizedTrack.audioName),
          publicUrl: publicTrackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalizedPack.id, normalizedTrack.id),
          canonicalUrl: publicTrackUrl(normalizedPublicOrigin, normalizedPack.id, normalizedTrack.id)
        }
      });
    } catch (error) {
      console.error("Public track impossible :", error);
      return res.status(500).json({ success: false, message: "Track publique indisponible." });
    }
  });

  app.get("/api/founder/catalog-packs", requireFounderKey, async (req, res) => {
    try {
      const [records, packs] = await Promise.all([store.list(), visiblePacks()]);
      const items = buildFounderPackCatalog(
        req,
        packs,
        records,
        normalizedPublicOrigin,
        runtimeEnvironment
      );

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        commercialMode: commercialPolicy?.mode || (commercialPolicy?.paymentsActive ? "COMMERCIAL" : "PRE_V1"),
        total: items.length,
        items,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Founder pack catalog impossible :", error);
      return res.status(500).json({ success: false, message: "Catalogue Founder indisponible." });
    }
  });

  app.get("/api/founder/organic-visibility", requireFounderKey, async (req, res) => {
    try {
      const [records, packs] = await Promise.all([store.list(), visiblePacks()]);
      const attribution = summarizeAttribution(records);
      const communication = packs
        .slice()
        .sort((a, b) => new Date(b?.publishedAt || b?.moderatedAt || b?.createdAt || 0) - new Date(a?.publishedAt || a?.moderatedAt || a?.createdAt || 0))
        .slice(0, 50)
        .map((pack) => packCommunicationKit(req, pack, normalizedPublicOrigin, runtimeEnvironment));

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        commercialMode: commercialPolicy?.mode || (commercialPolicy?.paymentsActive ? "COMMERCIAL" : "PRE_V1"),
        attribution,
        communication,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Founder organic visibility impossible :", error);
      return res.status(500).json({ success: false, message: "Visibilité organique indisponible." });
    }
  });

  return {
    environment: runtimeEnvironment,
    sourceLabels: ORGANIC_SOURCES,
    trackSeoEligible
  };
}

module.exports = {
  ORGANIC_SOURCES,
  normalizeSource,
  trackSeoEligible,
  registerOrganicVisibility
};
