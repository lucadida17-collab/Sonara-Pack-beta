const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createSeoRadar } = require("./seo-radar");

let existingOwnerAccounts = {};
try {
  existingOwnerAccounts = require("../cinematic/cinematic-export").DEFAULT_OWNERS || {};
} catch {
  existingOwnerAccounts = {};
}

const SEO_PROMO_IMAGE_LIMIT = 8;

const SEO_PILLAR_PAGES = Object.freeze([
  { path: "/how-it-works", title: "How Sonara Pack Works" },
  { path: "/for-creators", title: "Sonara Pack for Creators" },
  { path: "/for-artists", title: "Sonara Pack for Artists" },
  { path: "/licensing", title: "Sonara Pack Music Licensing" },
  { path: "/pre-v1", title: "Sonara Pack Pre-V1" }
]);

const ORGANIC_SOURCES = Object.freeze([
  "Google",
  "TikTok",
  "Instagram",
  "YouTube",
  "Direct",
  "Other"
]);

const CATEGORY_SEO_LABELS = Object.freeze({
  "rap-hiphop": "Rap & Hip-Hop Music",
  pop: "Pop Music",
  "rnb-soul": "R&B & Soul Music",
  electronic: "Electronic Music",
  "rock-alternative": "Rock & Alternative Music",
  chanson: "Chanson Music",
  vocal: "Vocal Music",
  "beats-production": "Beats & Production",
  afro: "Afro Music",
  "reggae-dancehall": "Reggae & Dancehall Music",
  jazz: "Jazz Music",
  piano: "Piano Music",
  cinematic: "Cinematic Music",
  classical: "Classical Music",
  "drums-percussion": "Drums & Percussion",
  "violin-strings": "Violin & Strings",
  guitar: "Guitar Music",
  orchestral: "Orchestral Music",
  "ambient-textures": "Ambient & Atmospheric Music",
  "sound-design": "Sound Design",
  other: "Music"
});

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

function internalAccountIds(environment = "local") {
  const env = normalizeEnvironment(environment);
  const configured = `${process.env.SONARA_INTERNAL_ACCOUNT_IDS || ""},${process.env[`SONARA_INTERNAL_ACCOUNT_IDS_${env.toUpperCase()}`] || ""}`
    .split(/[,;\s]+/g)
    .map((value) => text(value, 180))
    .filter(Boolean);
  const existing = Array.isArray(existingOwnerAccounts?.[env])
    ? existingOwnerAccounts[env].map((owner) => text(owner?.accountId, 180)).filter(Boolean)
    : [];
  return new Set([...configured, ...existing]);
}

function excludedUserAgent(value = "") {
  const ua = String(value || "");
  if (!ua) return false;
  return /googlebot|google-inspectiontool|bingbot|duckduckbot|baiduspider|yandexbot|slurp|facebookexternalhit|twitterbot|linkedinbot|discordbot|applebot|petalbot|semrushbot|ahrefsbot|mj12bot|uptimerobot|statuscake|pingdom|healthcheck|render(?:-|\s)?health|curl\/|wget\/|postmanruntime/i.test(ua);
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

function listValues(...candidates) {
  const values = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) values.push(...candidate);
    else if (candidate !== undefined && candidate !== null && candidate !== "") values.push(candidate);
  }
  const unique = new Map();
  for (const value of values) {
    const display = text(value, 160);
    if (!display) continue;
    const key = display.toLocaleLowerCase("fr");
    if (!unique.has(key)) unique.set(key, display);
  }
  return [...unique.values()].slice(0, 24);
}

function explicitBoolean(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "boolean") return candidate;
    const normalized = text(candidate, 20).toLowerCase();
    if (["true", "yes", "1", "instrumental"].includes(normalized)) return true;
    if (["false", "no", "0", "vocal", "vocals"].includes(normalized)) return false;
  }
  return null;
}

function categorySeoLabel(value = "") {
  const raw = text(value, 120);
  const key = raw.toLowerCase();
  if (CATEGORY_SEO_LABELS[key]) return CATEGORY_SEO_LABELS[key];
  const human = raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  if (!human) return "Music";
  return /music|sound|beat|production|percussion|strings?/i.test(human) ? human : `${human} Music`;
}

function semanticData(pack = {}, track = null) {
  const source = track && typeof track === "object" ? track : {};
  const categories = categoryValues(pack);
  const genres = listValues(source.genres, source.genre, pack.genres, pack.genre);
  const moods = listValues(
    source.moods,
    source.mood,
    source.ambiances,
    source.ambiance,
    pack.moods,
    pack.mood,
    pack.ambiances,
    pack.ambiance
  );
  // Les données privées de creationProcess ne sont volontairement jamais utilisées ici.
  const instruments = listValues(
    source.publicInstruments,
    source.instruments,
    pack.publicInstruments,
    pack.instruments
  );
  const usages = listValues(
    source.useCases,
    source.usages,
    source.usage,
    pack.useCases,
    pack.usages,
    pack.usage
  );
  const tags = listValues(
    source.musicTags,
    source.tags,
    source.seoTags,
    pack.musicTags,
    pack.tags,
    pack.seoTags
  );
  const instrumental = explicitBoolean(
    source.instrumental,
    source.isInstrumental,
    pack.instrumental,
    pack.isInstrumental
  );
  const description = text(
    source.publicDescription ||
    source.seoDescription ||
    source.description ||
    pack.publicDescription ||
    pack.seoDescription ||
    pack.description,
    900
  );
  const primaryCategory = categories[0] || "";
  const primaryPhrase = genres[0]
    ? (/music/i.test(genres[0]) ? genres[0] : `${genres[0]} Music`)
    : categorySeoLabel(primaryCategory);
  const visibleTerms = listValues(
    ...genres,
    ...moods,
    ...instruments,
    ...usages,
    ...tags
  ).slice(0, 8);

  return {
    categories,
    genres,
    moods,
    instruments,
    usages,
    tags,
    instrumental,
    description,
    primaryPhrase,
    visibleTerms
  };
}

function seoMetadata({ title, artist, semantic = {}, licenseName = "", kind = "track" } = {}) {
  const safeTitle = text(title || (kind === "pack" ? "Pack Sonara" : "Track Sonara"), 240);
  const safeArtist = text(artist || "Artiste Sonara", 180);
  const primaryPhrase = text(semantic.primaryPhrase || "Music", 140);
  const generatedTitle = `${safeTitle} – ${primaryPhrase} by ${safeArtist} | Sonara Pack`.slice(0, 120);

  const baseStyle = primaryPhrase.replace(/\s+music$/i, "").trim().toLowerCase();
  const mood = text(semantic.moods?.[0], 100).toLowerCase();
  const descriptor = [mood, baseStyle, semantic.instrumental === true ? "instrumental" : "music"]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" ");
  const article = /^[aeiou]/i.test(descriptor) ? "an" : "a";
  const generatedDescription = `Listen to ${safeTitle} by ${safeArtist}, ${article} ${descriptor || "music release"} available on Sonara Pack${licenseName ? ` under ${text(licenseName, 120)}` : ""} for creative projects.`;
  const description = semantic.description
    ? `${semantic.description.replace(/[.!?]\s*$/, "")}. Available on Sonara Pack${licenseName ? ` under ${text(licenseName, 120)}` : ""} for creative projects.`.replace(/\s+/g, " ").trim().slice(0, 180)
    : generatedDescription.replace(/\s+/g, " ").trim().slice(0, 180);
  const imageAlt = `${safeTitle} by ${safeArtist} – ${primaryPhrase} on Sonara Pack`.slice(0, 220);

  return {
    title: generatedTitle,
    description,
    imageAlt,
    primaryPhrase,
    visibleTerms: Array.isArray(semantic.visibleTerms) ? semantic.visibleTerms : []
  };
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
  const semantic = semanticData(pack, track);
  const artist = text(track.artist || artistName(pack), 180);
  const title = text(track.title || "Track Sonara", 240);
  const licenseName = text(pack.license?.name || "Licence standard Sonara", 180);
  return {
    id: text(track.id, 180),
    title,
    artist,
    coverPack: text(track.coverPack || pack.coverPack, 1000),
    promoImage: text(track.promoImageUrl || track.mockupUrl || pack.promoImageUrl || pack.mockupUrl, 1000),
    audioName: text(track.audioName || track.audio, 1000),
    previewStart: Math.max(0, Number(track.previewStart || 0) || 0),
    previewDuration: Math.min(30, Math.max(1, Number(track.previewDuration || 30) || 30)),
    duration: Math.max(0, Number(track.duration || 0) || 0),
    price: text(track.price || track.trackPrice || track.unitPrice, 80),
    semantic,
    seo: seoMetadata({ title, artist, semantic, licenseName, kind: "track" })
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

  const title = text(pack.title || pack.name || "Pack Sonara", 240);
  const artist = artistName(pack);
  const semantic = semanticData(pack);
  const result = {
    id: text(pack.id, 180),
    title,
    artist,
    artistAvatar: artistAvatar(pack),
    artistBiography: text(pack.artistProfile?.biography || pack.biography, 1200),
    coverPack: text(pack.coverPack, 1000),
    promoImage: text(pack.promoImageUrl || pack.mockupUrl || pack.promoMockupUrl, 1000),
    categories,
    category: categories[0] || "",
    contentType: text(pack.contentType || "audio", 40).toLowerCase() || "audio",
    primaryAudience: text(pack.primaryAudience || "both", 30).toLowerCase() || "both",
    publishedAt: text(pack.publishedAt || pack.moderatedAt || pack.createdAt, 80),
    price: text(pack.price || pack.packPrice || pack.totalPrice, 80),
    license,
    trackCount: tracks.length,
    tracks,
    semantic
  };
  result.seo = seoMetadata({ title, artist, semantic, licenseName: license?.name || "", kind: "pack" });
  return result;
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
    promoImageUrl: mediaUrl(req, normalized.promoImage),
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
    fs.writeFileSync(filePath, JSON.stringify({ version: 3, visitors: [], internalDevices: [] }, null, 2), "utf8");
  }
}

function createLocalStore(filePath) {
  ensureLocalStore(filePath);

  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
      return {
        version: 3,
        visitors: Array.isArray(parsed.visitors) ? parsed.visitors : [],
        internalDevices: Array.isArray(parsed.internalDevices) ? parsed.internalDevices : []
      };
    } catch (error) {
      console.error("Organic visibility LOCAL illisible :", error.message || error);
      return { version: 3, visitors: [], internalDevices: [] };
    }
  }

  function write(data) {
    data.version = 3;
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
          internalVisitCount: touch.journeyKind === "event" || touch.internalTraffic !== true ? 0 : 1,
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
          if (touch.internalTraffic === true) {
            record.internalVisitCount = Math.max(0, Number(record.internalVisitCount || 0)) + 1;
          }
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
    },

    async registerInternalDevice(deviceId, metadata = {}) {
      const data = read();
      const now = new Date().toISOString();
      const existing = data.internalDevices.find((item) => String(item.deviceId) === String(deviceId));
      if (existing) {
        existing.active = true;
        existing.updatedAt = now;
        existing.label = text(metadata.label || existing.label || "Founder device", 120);
      } else {
        data.internalDevices.push({
          deviceId,
          active: true,
          createdAt: now,
          updatedAt: now,
          label: text(metadata.label || "Founder device", 120)
        });
      }
      write(data);
      return true;
    },

    async revokeInternalDevice(deviceId) {
      const data = read();
      const existing = data.internalDevices.find((item) => String(item.deviceId) === String(deviceId));
      if (!existing) return false;
      existing.active = false;
      existing.updatedAt = new Date().toISOString();
      write(data);
      return true;
    },

    async isInternalDevice(deviceId) {
      if (!deviceId) return false;
      const data = read();
      return data.internalDevices.some((item) => String(item.deviceId) === String(deviceId) && item.active === true);
    }
  };
}

function createMongoStore(collection, internalDevicesCollection) {
  return {
    async upsertVisit(visitorId, touch) {
      const now = new Date().toISOString();
      const isPage = touch.journeyKind !== "event";
      const isInternalPage = isPage && touch.internalTraffic === true;
      await collection.updateOne(
        { visitorId },
        {
          $setOnInsert: {
            visitorId,
            firstTouch: touch,
            firstSeenAt: now,
            accountId: "",
            accountCreatedAt: "",
            linkedAt: "",
            signupAttributed: false,
            internalVisitCount: 0
          },
          $set: {
            lastTouch: touch,
            lastSeenAt: now
          },
          $inc: {
            visitCount: isPage ? 1 : 0,
            internalVisitCount: isInternalPage ? 1 : 0
          },
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
    },

    async registerInternalDevice(deviceId, metadata = {}) {
      const now = new Date().toISOString();
      await internalDevicesCollection.updateOne(
        { deviceId },
        {
          $setOnInsert: { deviceId, createdAt: now },
          $set: {
            active: true,
            updatedAt: now,
            label: text(metadata.label || "Founder device", 120)
          }
        },
        { upsert: true }
      );
      return true;
    },

    async revokeInternalDevice(deviceId) {
      const result = await internalDevicesCollection.updateOne(
        { deviceId },
        { $set: { active: false, updatedAt: new Date().toISOString() } }
      );
      return Number(result.matchedCount || 0) > 0;
    },

    async isInternalDevice(deviceId) {
      if (!deviceId) return false;
      const found = await internalDevicesCollection.findOne(
        { deviceId, active: true },
        { projection: { _id: 0, deviceId: 1 } }
      );
      return Boolean(found);
    }
  };
}

function createStore({ environment, db, dataDir }) {
  if (db && typeof db.collection === "function") {
    const env = normalizeEnvironment(environment);
    return createMongoStore(
      db.collection(`organic_visibility_${env}`),
      db.collection(`organic_visibility_internal_devices_${env}`)
    );
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
    internalTraffic: body.internalTraffic === true,
    trackingVersion: Math.max(1, Number(body.trackingVersion || 1) || 1),
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
  const internalAccountSet = new Set();
  let externalVisitorCount = 0;
  let externalVisitCount = 0;
  let internalVisitorCount = 0;
  let internalVisitCount = 0;

  for (const record of records) {
    const source = normalizeSource(record?.firstTouch?.source);
    const totalVisits = Math.max(record?.firstTouch ? 1 : 0, Number(record?.visitCount || 0));
    const storedInternalVisits = Math.min(totalVisits, Math.max(0, Number(record?.internalVisitCount || 0)));
    const internalAccount = record?.internalAccount === true;
    const excludedVisits = internalAccount ? totalVisits : storedInternalVisits;
    const externalVisits = Math.max(0, totalVisits - excludedVisits);
    const hasExternalTraffic = externalVisits > 0;
    const hasInternalTraffic = excludedVisits > 0 || internalAccount;

    if (hasExternalTraffic) {
      externalVisitorCount += 1;
      externalVisitCount += externalVisits;
      const row = sourceMap.get(source) || sourceMap.get("Other");
      row.visitors += 1;
      row.visits += externalVisits;
    }

    if (hasInternalTraffic) {
      internalVisitorCount += 1;
      internalVisitCount += excludedVisits;
      if (record.accountId) internalAccountSet.add(String(record.accountId));
    }

    if (record.accountId && !internalAccount && hasExternalTraffic) {
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
        if (step?.internalTraffic === true) continue;
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

    if (record.signupAttributed === true && record.accountId && !internalAccount && hasExternalTraffic) {
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
    visitors: externalVisitorCount,
    visits: externalVisitCount,
    attributedSignups: accountSources.size,
    linkedAccounts: linkedAccounts.size,
    internalTraffic: {
      visitors: internalVisitorCount,
      visits: internalVisitCount,
      linkedAccounts: internalAccountSet.size
    },
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
    const totalVisits = Math.max(record?.firstTouch ? 1 : 0, Number(record?.visitCount || 0));
    const internalVisits = record?.internalAccount === true
      ? totalVisits
      : Math.min(totalVisits, Math.max(0, Number(record?.internalVisitCount || 0)));
    if (Math.max(0, totalVisits - internalVisits) <= 0) continue;
    arrivals += 1;
    const source = normalizeSource(record?.firstTouch?.source);
    sourceBreakdown[source] = Math.max(0, Number(sourceBreakdown[source] || 0)) + 1;
    if (record?.signupAttributed === true && record?.accountId && record?.internalAccount !== true) signups += 1;
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

const SEO_FACET_MIN_PACKS = Object.freeze({
  artist: 2,
  category: 3,
  genre: 3,
  mood: 3,
  usage: 3
});

function seoFacetSlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function seoFacetPath(type, slug) {
  const segments = {
    artist: "artists",
    category: "categories",
    genre: "genres",
    mood: "moods",
    usage: "uses"
  };
  const segment = segments[type];
  return segment && slug ? `/catalog/${segment}/${slug}` : "";
}

function buildSeoFacetReadiness(packs = []) {
  const normalizedPacks = (Array.isArray(packs) ? packs : [])
    .map((pack) => publicPack(pack))
    .filter((pack) => pack.id);
  const maps = {
    artist: new Map(),
    category: new Map(),
    genre: new Map(),
    mood: new Map(),
    usage: new Map()
  };

  function append(type, value, packId, slugValue = value) {
    const label = text(value, 160);
    if (!label || !packId || !maps[type]) return;
    const key = label.toLocaleLowerCase("fr");
    const current = maps[type].get(key) || { label, slugSource: text(slugValue, 160), packIds: [] };
    if (!current.packIds.includes(packId)) current.packIds.push(packId);
    maps[type].set(key, current);
  }

  for (const pack of normalizedPacks) {
    append("artist", pack.artist, pack.id);
    for (const category of pack.categories || []) append("category", categorySeoLabel(category), pack.id, category);
    for (const genre of pack.semantic?.genres || []) append("genre", genre, pack.id);
    for (const mood of pack.semantic?.moods || []) append("mood", mood, pack.id);
    for (const usage of pack.semantic?.usages || []) append("usage", usage, pack.id);
  }

  const serialize = (map, type) => [...map.values()]
    .map((entry) => {
      const slug = seoFacetSlug(entry.slugSource || entry.label);
      return {
        type,
        label: entry.label,
        slug,
        packCount: entry.packIds.length,
        packIds: entry.packIds,
        eligible: entry.packIds.length >= SEO_FACET_MIN_PACKS[type],
        plannedPath: seoFacetPath(type, slug)
      };
    })
    .filter((entry) => entry.slug)
    .sort((a, b) => b.packCount - a.packCount || a.label.localeCompare(b.label));

  const result = {
    preparedOnly: false,
    publicRoutesEnabled: true,
    sitemapEnabled: true,
    policy: {
      artistMinimumPacks: SEO_FACET_MIN_PACKS.artist,
      categoryMinimumPacks: SEO_FACET_MIN_PACKS.category,
      genreMinimumPacks: SEO_FACET_MIN_PACKS.genre,
      moodMinimumPacks: SEO_FACET_MIN_PACKS.mood,
      usageMinimumPacks: SEO_FACET_MIN_PACKS.usage,
      rule: "Une facette devient publique et indexable uniquement quand son seuil de contenus réels est atteint."
    },
    artists: serialize(maps.artist, "artist"),
    categories: serialize(maps.category, "category"),
    genres: serialize(maps.genre, "genre"),
    moods: serialize(maps.mood, "mood"),
    usages: serialize(maps.usage, "usage"),
    unavailableDimensions: []
  };

  if (!result.genres.length) result.unavailableDimensions.push({ type: "genre", reason: "Aucun genre public structuré n'existe encore dans le catalogue." });
  if (!result.moods.length) result.unavailableDimensions.push({ type: "ambiance", reason: "Aucune ambiance publique structurée n'existe encore dans le catalogue." });
  if (!result.usages.length) result.unavailableDimensions.push({ type: "usage", reason: "Aucun usage musical public structuré n'existe encore dans le catalogue." });
  return result;
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
  const internalAccounts = internalAccountIds(runtimeEnvironment);
  const internalMarkTokens = new Map();
  const internalMarkTokenTtlMs = 10 * 60 * 1000;

  async function visiblePacks() {
    const packs = await getPublicPacks();
    return Array.isArray(packs) ? packs : [];
  }

  async function seoRadarPages() {
    const packs = await visiblePacks();
    const readiness = buildSeoFacetReadiness(packs);
    const pages = [];
    const catalogUrl = `${normalizedPublicOrigin}/catalog`;
    pages.push({
      url: catalogUrl,
      kind: "catalog",
      sourceId: "catalog",
      title: "Sonara Pack Music Catalog",
      publishedAt: packs.map((pack) => safeDate(pack?.publishedAt || pack?.moderatedAt || pack?.createdAt)?.getTime() || 0).sort((a, b) => b - a)[0] ? new Date(packs.map((pack) => safeDate(pack?.publishedAt || pack?.moderatedAt || pack?.createdAt)?.getTime() || 0).sort((a, b) => b - a)[0]).toISOString() : "",
      expectedCanonical: catalogUrl,
      parentUrls: [`${normalizedPublicOrigin}/home.html`]
    });

    for (const pillar of SEO_PILLAR_PAGES) {
      const url = `${normalizedPublicOrigin}${pillar.path}`;
      pages.push({
        url,
        kind: "pillar",
        sourceId: pillar.path.slice(1),
        title: pillar.title,
        publishedAt: "",
        expectedCanonical: url,
        parentUrls: [catalogUrl]
      });
    }

    const facetUrlsByPack = new Map();
    const facetCollections = [readiness.artists, readiness.categories, readiness.genres, readiness.moods, readiness.usages];
    for (const collection of facetCollections) {
      for (const entry of Array.isArray(collection) ? collection : []) {
        if (entry?.eligible !== true || !entry.plannedPath) continue;
        const url = `${normalizedPublicOrigin}${entry.plannedPath}`;
        pages.push({
          url,
          kind: entry.type === "artist" ? "artist" : "facet",
          sourceId: `${entry.type}:${entry.slug}`,
          title: entry.label,
          publishedAt: "",
          expectedCanonical: url,
          parentUrls: [catalogUrl]
        });
        for (const packId of Array.isArray(entry.packIds) ? entry.packIds : []) {
          const links = facetUrlsByPack.get(String(packId)) || [];
          links.push(url);
          facetUrlsByPack.set(String(packId), links);
        }
      }
    }

    for (const pack of packs) {
      const normalized = publicPack(pack);
      if (!normalized.id) continue;
      const packUrl = publicPackUrl(normalizedPublicOrigin, normalized.id);
      pages.push({
        url: packUrl,
        kind: "pack",
        sourceId: normalized.id,
        title: normalized.title,
        artist: normalized.artist,
        publishedAt: normalized.publishedAt,
        expectedCanonical: packUrl,
        parentUrls: [catalogUrl, ...(facetUrlsByPack.get(normalized.id) || [])]
      });
      for (const sourceTrack of Array.isArray(pack.tracks) ? pack.tracks : []) {
        if (!sourceTrack?.id || !trackSeoEligible(pack, sourceTrack)) continue;
        const normalizedTrack = publicTrack(sourceTrack, pack);
        const trackUrl = publicTrackUrl(normalizedPublicOrigin, normalized.id, normalizedTrack.id);
        pages.push({
          url: trackUrl,
          kind: "track",
          sourceId: `${normalized.id}:${normalizedTrack.id}`,
          packId: normalized.id,
          trackId: normalizedTrack.id,
          title: normalizedTrack.title,
          artist: normalizedTrack.artist,
          publishedAt: normalized.publishedAt,
          expectedCanonical: trackUrl,
          parentUrls: [packUrl]
        });
      }
    }
    return pages.filter((page, index, all) => page.url && all.findIndex((candidate) => candidate.url === page.url) === index);
  }

  const seoRadar = createSeoRadar({
    environment: runtimeEnvironment,
    db,
    dataDir,
    publicOrigin: normalizedPublicOrigin,
    getPages: seoRadarPages
  });
  app.locals.seoRadar = seoRadar;

  function recordsWithKnownInternalAccounts(records = []) {
    return (Array.isArray(records) ? records : []).map((record) => (
      record?.accountId && internalAccounts.has(String(record.accountId))
        ? { ...record, internalAccount: true }
        : record
    ));
  }

  function cleanupInternalMarkTokens() {
    const now = Date.now();
    for (const [token, payload] of internalMarkTokens.entries()) {
      if (!payload || Number(payload.expiresAt || 0) <= now) internalMarkTokens.delete(token);
    }
  }

  function facetCollections(readiness = {}) {
    return {
      artist: readiness.artists || [],
      category: readiness.categories || [],
      genre: readiness.genres || [],
      mood: readiness.moods || [],
      usage: readiness.usages || []
    };
  }

  function seoLinksForPack(packId, readiness = {}) {
    const id = String(packId || "");
    const result = { artist: "", categories: [], genres: [], moods: [], usages: [] };
    const collections = facetCollections(readiness);
    for (const [type, entries] of Object.entries(collections)) {
      const links = entries
        .filter((entry) => entry?.eligible === true && Array.isArray(entry.packIds) && entry.packIds.includes(id))
        .map((entry) => ({
          label: entry.label,
          url: `${normalizedPublicOrigin}${entry.plannedPath}`,
          packCount: entry.packCount
        }));
      if (type === "artist") result.artist = links[0] || "";
      else if (type === "category") result.categories = links;
      else if (type === "genre") result.genres = links;
      else if (type === "mood") result.moods = links;
      else if (type === "usage") result.usages = links;
    }
    return result;
  }

  function publicPackForRequest(req, pack, readiness) {
    const normalized = publicPack(pack);
    return {
      ...normalized,
      coverUrl: mediaUrl(req, normalized.coverPack),
      promoImageUrl: mediaUrl(req, normalized.promoImage),
      tracks: normalized.tracks.map((track, index) => {
        const sourceTrack = Array.isArray(pack?.tracks) ? pack.tracks[index] || {} : {};
        const eligible = trackSeoEligible(pack, sourceTrack);
        return {
          ...track,
          coverUrl: mediaUrl(req, track.coverPack),
          promoImageUrl: mediaUrl(req, track.promoImage),
          previewAudioUrl: mediaUrl(req, track.audioName),
          publicUrl: eligible ? publicTrackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalized.id, track.id) : "",
          canonicalUrl: eligible ? publicTrackUrl(normalizedPublicOrigin, normalized.id, track.id) : ""
        };
      }),
      publicUrl: publicPackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalized.id),
      canonicalUrl: publicPackUrl(normalizedPublicOrigin, normalized.id),
      seoLinks: seoLinksForPack(normalized.id, readiness)
    };
  }

  function facetDescription(type, label, count) {
    const noun = type === "artist" ? "releases" : "music releases";
    const relation = type === "artist" ? `by ${label}` : `related to ${label}`;
    return `Explore ${count} Sonara Pack ${noun} ${relation}, with licensed music for creative projects.`;
  }

  app.post("/api/growth/organic/visit", async (req, res) => {
    try {
      if (excludedUserAgent(req.headers?.["user-agent"])) {
        return res.json({
          success: true,
          environment: runtimeEnvironment,
          excluded: true,
          exclusionReason: "crawler_or_technical"
        });
      }

      const visitorId = text(req.body?.visitorId, 180);
      if (!/^[a-zA-Z0-9:_-]{12,180}$/.test(visitorId)) {
        return res.status(400).json({ success: false, message: "Identifiant visiteur invalide." });
      }

      const requestedInternalDeviceId = text(req.body?.internalDeviceId, 220);
      const validInternalDevice = /^internal-[a-zA-Z0-9_-]{20,200}$/.test(requestedInternalDeviceId)
        ? await store.isInternalDevice(requestedInternalDeviceId)
        : false;
      const record = await store.upsertVisit(visitorId, normalizeTouch({
        ...req.body,
        internalTraffic: validInternalDevice,
        trackingVersion: 2
      }));
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        visitorId: record?.visitorId || visitorId,
        internalTraffic: validInternalDevice
      });
    } catch (error) {
      console.error("Organic visit impossible :", error);
      return res.status(500).json({ success: false, message: "Tracking organique indisponible." });
    }
  });

  app.post("/api/growth/organic/internal-device/consume", async (req, res) => {
    try {
      cleanupInternalMarkTokens();
      const token = text(req.body?.token, 220);
      const payload = internalMarkTokens.get(token);
      if (!token || !payload || Number(payload.expiresAt || 0) <= Date.now()) {
        if (token) internalMarkTokens.delete(token);
        return res.status(400).json({ success: false, message: "Lien de marquage interne invalide ou expiré." });
      }
      internalMarkTokens.delete(token);
      const deviceId = `internal-${crypto.randomBytes(24).toString("base64url")}`;
      await store.registerInternalDevice(deviceId, { label: "Founder device" });
      return res.json({ success: true, environment: runtimeEnvironment, deviceId });
    } catch (error) {
      console.error("Internal device consume impossible :", error);
      return res.status(500).json({ success: false, message: "Marquage interne indisponible." });
    }
  });

  app.post("/api/growth/organic/internal-device/revoke", async (req, res) => {
    try {
      const deviceId = text(req.body?.deviceId, 220);
      if (!/^internal-[a-zA-Z0-9_-]{20,200}$/.test(deviceId)) {
        return res.json({ success: true, environment: runtimeEnvironment, revoked: false });
      }
      const revoked = await store.revokeInternalDevice(deviceId);
      return res.json({ success: true, environment: runtimeEnvironment, revoked });
    } catch (error) {
      console.error("Internal device revoke impossible :", error);
      return res.status(500).json({ success: false, message: "Révocation du marquage interne indisponible." });
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

      const requestedInternalDeviceId = text(req.body?.internalDeviceId, 220);
      const internalDevice = /^internal-[a-zA-Z0-9_-]{20,200}$/.test(requestedInternalDeviceId)
        ? await store.isInternalDevice(requestedInternalDeviceId)
        : false;

      let records = await store.list();
      let existing = records.find((record) => String(record.visitorId) === visitorId);

      if (!existing && req.body?.firstTouch && typeof req.body.firstTouch === "object") {
        existing = await store.upsertVisit(
          visitorId,
          normalizeTouch({
            ...req.body.firstTouch,
            internalTraffic: internalDevice,
            trackingVersion: 2,
            journeyKind: "event",
            journeyStep: "registration_attribution_recovered"
          })
        );
      }

      if (!existing) {
        return res.status(404).json({ success: false, message: "Visite organique introuvable." });
      }

      const internalAccount = internalAccounts.has(account.accountId) || internalDevice || existing.internalAccount === true;
      const linkedAt = new Date().toISOString();
      const record = await store.linkAccount(visitorId, {
        accountId: account.accountId,
        accountPseudo: account.pseudo,
        accountRole: account.role,
        accountCreatedAt: account.createdAt,
        linkedAt,
        internalAccount,
        signupAttributed: internalAccount ? false : signupAttribution(existing.firstSeenAt, account.createdAt, linkedAt)
      });

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        accountId: account.accountId,
        signupAttributed: record?.signupAttributed === true,
        internalTraffic: internalAccount
      });
    } catch (error) {
      console.error("Organic account link impossible :", error);
      return res.status(500).json({ success: false, message: "Attribution du compte indisponible." });
    }
  });

  app.get("/api/seo/catalog", requireFounderKey, async (req, res) => {
    try {
      const packs = await visiblePacks();
      const readiness = buildSeoFacetReadiness(packs);
      const packEntries = [];
      const trackEntries = [];

      for (const pack of packs) {
        const normalized = publicPack(pack);
        if (!normalized.id) continue;
        packEntries.push({
          id: normalized.id,
          url: publicPackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalized.id),
          canonicalUrl: publicPackUrl(normalizedPublicOrigin, normalized.id),
          updatedAt: pack?.updatedAt || pack?.moderatedAt || normalized.publishedAt,
          imageUrl: mediaUrl(req, normalized.coverPack),
          imageTitle: normalized.seo?.imageAlt || normalized.title
        });

        for (const sourceTrack of Array.isArray(pack.tracks) ? pack.tracks : []) {
          if (!trackSeoEligible(pack, sourceTrack) || !sourceTrack?.id) continue;
          const track = publicTrack(sourceTrack, pack);
          trackEntries.push({
            packId: normalized.id,
            trackId: track.id,
            url: publicTrackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalized.id, track.id),
            canonicalUrl: publicTrackUrl(normalizedPublicOrigin, normalized.id, track.id),
            updatedAt: pack?.updatedAt || pack?.moderatedAt || normalized.publishedAt,
            imageUrl: mediaUrl(req, track.coverPack),
            imageTitle: track.seo?.imageAlt || track.title
          });
        }
      }

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        index: [{
          url: `${normalizedPublicOrigin}/catalog`,
          updatedAt: packEntries.map((item) => safeDate(item.updatedAt)?.getTime() || 0).sort((a, b) => b - a)[0] ? new Date(packEntries.map((item) => safeDate(item.updatedAt)?.getTime() || 0).sort((a, b) => b - a)[0]).toISOString() : ""
        }],
        packs: packEntries,
        tracks: trackEntries,
        facets: readiness,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("SEO catalog impossible :", error);
      return res.status(500).json({ success: false, message: "Catalogue SEO indisponible." });
    }
  });

  app.get("/api/public/catalog/index", async (req, res) => {
    try {
      const packs = await visiblePacks();
      const readiness = buildSeoFacetReadiness(packs);
      const ordered = packs
        .slice()
        .sort((a, b) => (safeDate(b?.publishedAt || b?.moderatedAt || b?.createdAt)?.getTime() || 0) - (safeDate(a?.publishedAt || a?.moderatedAt || a?.createdAt)?.getTime() || 0));
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        catalog: {
          label: "Sonara Pack Music Catalog",
          description: "Explore public Sonara Pack music releases, artists and licensed tracks for creative projects.",
          canonicalUrl: `${normalizedPublicOrigin}/catalog`
        },
        packs: ordered.map((pack) => publicPackForRequest(req, pack, readiness))
      });
    } catch (error) {
      console.error("Public catalog index impossible :", error);
      return res.status(500).json({ success: false, message: "Catalogue public indisponible." });
    }
  });

  app.get("/api/public/catalog/sitemap", async (req, res) => {
    try {
      const packs = await visiblePacks();
      const readiness = buildSeoFacetReadiness(packs);
      const normalizedById = new Map();
      const packEntries = [];
      const trackEntries = [];
      const promoPackIds = new Set(
        packs
          .map((pack) => publicPack(pack))
          .filter((pack) => pack.id && pack.promoImage)
          .sort((a, b) => (safeDate(b.publishedAt)?.getTime() || 0) - (safeDate(a.publishedAt)?.getTime() || 0))
          .slice(0, SEO_PROMO_IMAGE_LIMIT)
          .map((pack) => pack.id)
      );

      for (const pack of packs) {
        const normalized = publicPack(pack);
        if (!normalized.id) continue;
        normalizedById.set(normalized.id, normalized);
        const packCoverUrl = mediaUrl(req, normalized.coverPack);
        const packPromoUrl = promoPackIds.has(normalized.id) ? mediaUrl(req, normalized.promoImage) : "";
        packEntries.push({
          url: publicPackUrl(normalizedPublicOrigin, normalized.id),
          updatedAt: pack?.updatedAt || pack?.moderatedAt || normalized.publishedAt,
          imageUrl: packCoverUrl,
          imageTitle: normalized.seo?.imageAlt || normalized.title,
          imageCaption: normalized.seo?.description || "",
          images: [
            packCoverUrl ? {
              url: packCoverUrl,
              title: normalized.seo?.imageAlt || normalized.title,
              caption: normalized.seo?.description || ""
            } : null,
            packPromoUrl && packPromoUrl !== packCoverUrl ? {
              url: packPromoUrl,
              title: `${normalized.title} by ${normalized.artist} – Sonara Pack promotional visual`,
              caption: normalized.seo?.description || ""
            } : null
          ].filter(Boolean)
        });

        for (const sourceTrack of Array.isArray(pack.tracks) ? pack.tracks : []) {
          if (!trackSeoEligible(pack, sourceTrack) || !sourceTrack?.id) continue;
          const track = publicTrack(sourceTrack, pack);
          const trackCoverUrl = mediaUrl(req, track.coverPack);
          trackEntries.push({
            url: publicTrackUrl(normalizedPublicOrigin, normalized.id, track.id),
            updatedAt: pack?.updatedAt || pack?.moderatedAt || normalized.publishedAt,
            imageUrl: trackCoverUrl,
            imageTitle: track.seo?.imageAlt || track.title,
            imageCaption: track.seo?.description || "",
            images: [
              trackCoverUrl ? {
                url: trackCoverUrl,
                title: track.seo?.imageAlt || track.title,
                caption: track.seo?.description || ""
              } : null
            ].filter(Boolean)
          });
        }
      }

      function sitemapFacetEntries(entries = []) {
        return entries.filter((entry) => entry.eligible === true).map((entry) => {
          const firstPack = normalizedById.get(entry.packIds?.[0]);
          return {
            type: entry.type,
            label: entry.label,
            url: `${normalizedPublicOrigin}${entry.plannedPath}`,
            updatedAt: firstPack?.publishedAt || "",
            imageUrl: firstPack ? mediaUrl(req, firstPack.coverPack) : "",
            imageTitle: firstPack?.seo?.imageAlt || entry.label,
            imageCaption: facetDescription(entry.type, entry.label, entry.packCount)
          };
        });
      }

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        index: [{
          url: `${normalizedPublicOrigin}/catalog`,
          updatedAt: packEntries.map((item) => safeDate(item.updatedAt)?.getTime() || 0).sort((a, b) => b - a)[0] ? new Date(packEntries.map((item) => safeDate(item.updatedAt)?.getTime() || 0).sort((a, b) => b - a)[0]).toISOString() : ""
        }],
        packs: packEntries,
        tracks: trackEntries,
        facets: [
          ...sitemapFacetEntries(readiness.categories),
          ...sitemapFacetEntries(readiness.genres),
          ...sitemapFacetEntries(readiness.moods),
          ...sitemapFacetEntries(readiness.usages)
        ],
        artists: sitemapFacetEntries(readiness.artists),
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
      const readiness = buildSeoFacetReadiness(packs);
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        pack: publicPackForRequest(req, pack, readiness)
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

      const readiness = buildSeoFacetReadiness(packs);
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
          semantic: normalizedPack.semantic,
          seo: normalizedPack.seo,
          publicUrl: publicPackPreviewUrl(runtimeEnvironment, normalizedPublicOrigin, normalizedPack.id),
          canonicalUrl: publicPackUrl(normalizedPublicOrigin, normalizedPack.id),
          seoLinks: seoLinksForPack(normalizedPack.id, readiness)
        },
        track: {
          ...normalizedTrack,
          coverUrl: mediaUrl(req, normalizedTrack.coverPack),
          promoImageUrl: mediaUrl(req, normalizedTrack.promoImage),
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

  app.get("/api/public/catalog/facet/:type/:slug", async (req, res) => {
    try {
      const type = text(req.params.type, 30).toLowerCase();
      if (!["category", "genre", "mood", "usage"].includes(type)) {
        return res.status(404).json({ success: false, message: "Page catalogue introuvable." });
      }
      const packs = await visiblePacks();
      const readiness = buildSeoFacetReadiness(packs);
      const collection = facetCollections(readiness)[type] || [];
      const facet = collection.find((entry) => entry.eligible === true && entry.slug === text(req.params.slug, 120));
      if (!facet) return res.status(404).json({ success: false, message: "Page catalogue introuvable." });
      const matching = packs.filter((pack) => facet.packIds.includes(String(pack?.id || "")));
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        facet: {
          type,
          label: facet.label,
          slug: facet.slug,
          packCount: facet.packCount,
          description: facetDescription(type, facet.label, facet.packCount),
          canonicalUrl: `${normalizedPublicOrigin}${facet.plannedPath}`
        },
        packs: matching.map((pack) => publicPackForRequest(req, pack, readiness))
      });
    } catch (error) {
      console.error("Public facet impossible :", error);
      return res.status(500).json({ success: false, message: "Page catalogue indisponible." });
    }
  });

  app.get("/api/public/catalog/artist/:slug", async (req, res) => {
    try {
      const packs = await visiblePacks();
      const readiness = buildSeoFacetReadiness(packs);
      const artist = (readiness.artists || []).find(
        (entry) => entry.eligible === true && entry.slug === text(req.params.slug, 120)
      );
      if (!artist) return res.status(404).json({ success: false, message: "Artiste public introuvable." });
      const matching = packs.filter((pack) => artist.packIds.includes(String(pack?.id || "")));
      const first = publicPack(matching[0] || {});
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        artist: {
          label: artist.label,
          slug: artist.slug,
          packCount: artist.packCount,
          description: first.artistBiography || facetDescription("artist", artist.label, artist.packCount),
          avatarUrl: mediaUrl(req, first.artistAvatar),
          canonicalUrl: `${normalizedPublicOrigin}${artist.plannedPath}`
        },
        packs: matching.map((pack) => publicPackForRequest(req, pack, readiness))
      });
    } catch (error) {
      console.error("Public artist impossible :", error);
      return res.status(500).json({ success: false, message: "Page artiste indisponible." });
    }
  });

  app.get("/api/founder/catalog-packs", requireFounderKey, async (req, res) => {
    try {
      const [rawRecords, packs] = await Promise.all([store.list(), visiblePacks()]);
      const records = recordsWithKnownInternalAccounts(rawRecords);
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

  app.post("/api/founder/organic-visibility/internal-device-link", requireFounderKey, async (req, res) => {
    try {
      cleanupInternalMarkTokens();
      const action = text(req.body?.action || "mark", 20).toLowerCase();
      const origin = normalizedPublicOrigin || requestOrigin(req);
      if (!origin) return res.status(500).json({ success: false, message: "Origine publique Sonara indisponible." });
      if (action === "clear") {
        const clear = new URL(origin);
        clear.searchParams.set("sonara_internal_traffic", "clear");
        return res.json({ success: true, environment: runtimeEnvironment, action: "clear", url: clear.toString() });
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + internalMarkTokenTtlMs;
      internalMarkTokens.set(token, { expiresAt });
      const mark = new URL(origin);
      mark.searchParams.set("sonara_internal_token", token);
      return res.json({
        success: true,
        environment: runtimeEnvironment,
        action: "mark",
        url: mark.toString(),
        expiresAt: new Date(expiresAt).toISOString()
      });
    } catch (error) {
      console.error("Founder internal device link impossible :", error);
      return res.status(500).json({ success: false, message: "Lien appareil Founder indisponible." });
    }
  });

  app.get("/api/founder/seo-radar", requireFounderKey, async (_req, res) => {
    try {
      return res.json(await seoRadar.snapshot({ kickBackground: true }));
    } catch (error) {
      console.error("Founder SEO Radar impossible :", error);
      return res.status(500).json({ success: false, message: "SEO Radar indisponible.", error: error.message });
    }
  });

  app.post("/api/founder/seo-radar/refresh", requireFounderKey, async (req, res) => {
    try {
      const requested = Array.isArray(req.body?.urls) ? req.body.urls.map((url) => String(url || "").trim()).filter(Boolean).slice(0, 30) : [];
      const result = await seoRadar.refresh({ forceGoogle: true, urls: requested, manual: true });
      const snapshot = await seoRadar.snapshot({ kickBackground: false });
      return res.json({ ...snapshot, refresh: result });
    } catch (error) {
      console.error("Actualisation SEO Radar impossible :", error);
      return res.status(500).json({ success: false, message: "Actualisation Google impossible.", error: error.message });
    }
  });

  app.get("/api/founder/organic-visibility", requireFounderKey, async (req, res) => {
    try {
      const [rawRecords, packs] = await Promise.all([store.list(), visiblePacks()]);
      const records = recordsWithKnownInternalAccounts(rawRecords);
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
    trackSeoEligible,
    seoRadar
  };
}

module.exports = {
  ORGANIC_SOURCES,
  normalizeSource,
  trackSeoEligible,
  buildSeoFacetReadiness,
  registerOrganicVisibility,
  semanticData,
  seoMetadata,
  summarizeAttribution,
  excludedUserAgent
};
