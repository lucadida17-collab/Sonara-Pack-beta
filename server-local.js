const express = require("express");
const cors = require("cors");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { registerSonaraSyncEngine } = require("./sync-engine");
const { installDataProtection, rejectUnsafeJsonKeys, sanitizeAccountSecrets } = require("./backend/security/data-protection");
const { registerFounderFinance } = require("./backend/features/finance/founder-finance");
const { registerPlatformGrowth, applyPlatformActivity, dayKey: platformGrowthDayKey } = require("./backend/features/growth/platform-growth");
const {
  defaultPackLicense,
  normalizePackLicense,
  buildUpdatedPackLicense,
  appendPackLicenseHistory,
  licenseMetadata,
  licenseModerationSummary
} = require("./backend/features/licenses/pack-license");
const { createLicenseProtection, hashFileSha256, FINGERPRINT_STATUS } = require("./backend/features/licenses/license-protection");
const humanCreationModeration = require("./backend/features/moderation/human-creation");
const { registerHumanCreationReviewRoutes } = require("./backend/features/moderation/human-review-routes");
const nodemailer = require("nodemailer");
const AdmZip = require("adm-zip");
require("dotenv").config({
path: path.resolve(__dirname, ".env.local")
});
const { createCommercialPolicy } = require("./backend/config/commercial-mode");
const { analyzeAudioPreview, ANALYSIS_VERSION: PREVIEW_ANALYSIS_VERSION } = require("./backend/features/audio/preview-selector");
const { appendAcquisitionHistory, buildCreatorAcquisitionAnalytics } = require("./backend/features/creator/creator-analytics");
const { registerAutoPlaylistRoutes } = require("./backend/features/playlists/auto-playlist-routes");
const {
  PRE_V1_ACTIVITY_CONFIG,
  buildPreV1ActivityReport,
  backfillLocalPublishedAt,
  backfillMongoPublishedAt
} = require("./backend/features/pre-v1/pre-v1-activity");
const { buildMissionPayload, resolveMissionMode } = require("./backend/features/missions/mission-system");
const { grantMissionRewardOnce, attachRewardState, getActiveVisibilityBoost } = require("./backend/features/missions/mission-rewards");
const { ARTIST_REWARD_IDS, maybeGrantPreV1SeniorityReward, hasArtistReward, getPublicArtistRewards } = require("./backend/features/pre-v1/artist-rewards");
const commercialPolicy = createCommercialPolicy({ environment: "local" });

const packsPath = path.join(__dirname, "data", "pendingPacks.json");

function safeDeleteFile(filePath) {
  if (!filePath) return false;

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    console.error("Suppression fichier pack impossible :", filePath, error.message);
    throw error;
  }

  return false;
}

function deleteRejectedLocalPackFiles(pack) {
  const deletedFiles = [];
  const uploadNames = [pack?.coverPack];

  for (const track of Array.isArray(pack?.tracks) ? pack.tracks : []) {
    uploadNames.push(track?.coverPack, track?.audioName);
  }

  for (const value of uploadNames) {
    if (typeof value !== "string" || !value.trim()) continue;
    const filePath = path.join(__dirname, "uploads", path.basename(value));
    if (safeDeleteFile(filePath)) deletedFiles.push(filePath);
  }

  const zipPaths = [
    path.join(__dirname, "downloads", "packs", `${pack.id}_pack.zip`),
    ...((Array.isArray(pack?.tracks) ? pack.tracks : []).map((track) =>
      path.join(__dirname, "downloads", "tracks", `${track.id}.zip`)
    ))
  ];

  for (const filePath of zipPaths) {
    if (safeDeleteFile(filePath)) deletedFiles.push(filePath);
  }

  return deletedFiles;
}

function deleteLocalPackNotifications(packId) {
  if (typeof founderNotificationsPath === "undefined") return;

  const notifications = readJsonArray(founderNotificationsPath);
  const remaining = notifications.filter((item) =>
    String(item?.entityId || item?.packId || item?.metadata?.entityId || "") !== String(packId)
  );

  writeJsonArray(founderNotificationsPath, remaining);
}

function permanentlyRejectLocalPack(packId) {
  const packs = readJsonArray(packsPath);
  const pack = packs.find((item) => String(item?.id || "") === String(packId));

  if (!pack) return null;

  const deletedFiles = deleteRejectedLocalPackFiles(pack);
  writeJsonArray(
    packsPath,
    packs.filter((item) => String(item?.id || "") !== String(packId))
  );
  deleteLocalPackNotifications(packId);

  return { pack, deletedFiles };
}

const Stripe = require("stripe");
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
if (commercialPolicy.stripeEnabled && !/^sk_test_/i.test(stripeSecretKey)) {
  throw new Error("Sonara LOCAL commercial exige une clé Stripe TEST (sk_test_...).");
}
const stripe = Stripe(stripeSecretKey || "sk_test_pre_v1_disabled");
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const frontUrl = String(process.env.FRONT_URL || "http://localhost:5500")
  .trim()
  .replace(/\/+$/, "");

if (!stripeWebhookSecret) {
  console.warn("Stripe webhook désactivé : STRIPE_WEBHOOK_SECRET absente.");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 15000
})


const app = express();
installDataProtection(app, { environment: "local" });

const founderFinance = registerFounderFinance({
  app,
  stripe,
  environment: "local",
  db: null,
  dataDir: path.join(__dirname, "data"),
  enabled: commercialPolicy.paymentsActive
});




const PORT = process.env.PORT || 3001;

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function resolveFrontUrl(req) {
  const candidates = [req?.headers?.origin, req?.headers?.referer];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = new URL(String(candidate));
      const origin = parsed.origin.replace(/\/+$/, "");
      const isConfiguredOrigin = origin === frontUrl;
      const isAllowedOrigin = allowedOrigins.includes(origin);
      const isLocalFront =
        ["localhost", "127.0.0.1"].includes(parsed.hostname) ||
        parsed.hostname.startsWith("192.168.") ||
        parsed.hostname.startsWith("10.");

      if (
        isConfiguredOrigin ||
        isAllowedOrigin ||
        ((frontUrl.includes("localhost") || frontUrl.includes("127.0.0.1")) &&
          isLocalFront &&
          parsed.port === "5500")
      ) {
        return origin;
      }
    } catch {
      // Origine invalide : on conserve l'URL configurée pour l'environnement.
    }
  }

  return frontUrl;
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origine non autorisée par Sonara."));
  },
  credentials: true
}));
app.get("/api/commercial-mode", (_req, res) => {
  res.status(200).json(commercialPolicy.publicState());
});

app.use("/api/stripe", commercialPolicy.blockStripeApi);

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripeWebhookSecret) {
      return res.status(503).json({
        success: false,
        message: "STRIPE_WEBHOOK_SECRET absente."
      });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        stripeWebhookSecret
      );
    } catch (error) {
      console.error("Signature webhook Stripe invalide :", error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        await founderFinance.assertCheckoutEnvironment(event.data.object);
        await fulfillPaidStripeCheckout(event.data.object);
      }

      const financeResult = await founderFinance.handleStripeEvent(event);
      return res.json({ received: true, finance: financeResult });
    } catch (error) {
      console.error("Traitement webhook Stripe impossible :", error);
      return res.status(500).json({
        success: false,
        message: "Le paiement a été reçu mais son accès n’a pas pu être enregistré."
      });
    }
  }
);

app.use(express.json({ limit: "2mb" }));
app.use(rejectUnsafeJsonKeys);
registerSonaraSyncEngine(app);
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "sonara-api",
    environment: "local",
    timestamp: new Date().toISOString()
  });
});

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + file.originalname;

    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const PACK_MAX_TRACKS = 20;
const PACK_MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const PACK_MAX_AUDIO_SIZE = 250 * 1024 * 1024;
const PACK_MAX_RESOURCES = 20;
const PACK_MAX_RESOURCE_SIZE = 250 * 1024 * 1024;
const PACK_MAX_EVIDENCE_FILES = 8;
const PACK_MAX_EVIDENCE_SIZE = 100 * 1024 * 1024;
const PACK_MAX_FILES = 1 + Math.max(PACK_MAX_TRACKS * 2, PACK_MAX_RESOURCES) + PACK_MAX_EVIDENCE_FILES;

const PACK_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const PACK_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "application/octet-stream"
]);

function isPackImageField(fieldname) {
  return fieldname === "coverPack" || /^trackCover_\d+$/.test(fieldname) || /^resourceCover_\d+$/.test(fieldname);
}

function isPackAudioField(fieldname) {
  return /^trackAudio_\d+$/.test(fieldname);
}

function isPackResourceField(fieldname) {
  return /^resourceFile_\d+$/.test(fieldname);
}

function isPackEvidenceField(fieldname) {
  return /^creationEvidence_\d+$/.test(fieldname);
}

function isAllowedCreationEvidence(file) {
  const extension = path.extname(file?.originalname || "").toLowerCase();
  const blocked = new Set([".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".js", ".mjs", ".cjs", ".php", ".py", ".sh", ".ps1"]);
  return Boolean(extension) && !blocked.has(extension) && Number(file?.size || 0) <= PACK_MAX_EVIDENCE_SIZE;
}

function packFileFilter(req, file, cb) {
  if (isPackImageField(file.fieldname)) {
    if (!PACK_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
    return cb(null, true);
  }

  if (isPackAudioField(file.fieldname)) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const validExtension = [".mp3", ".wav", ".flac"].includes(extension);

    if (!PACK_AUDIO_TYPES.has(file.mimetype) && !validExtension) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
    return cb(null, true);
  }

  if (isPackResourceField(file.fieldname)) {
    return cb(null, true);
  }

  if (isPackEvidenceField(file.fieldname) && isAllowedCreationEvidence(file)) {
    return cb(null, true);
  }

  return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
}

const packUpload = multer({
  storage,
  limits: {
    files: PACK_MAX_FILES,
    fileSize: PACK_MAX_AUDIO_SIZE,
    fields: 4,
    fieldSize: 2 * 1024 * 1024
  },
  fileFilter: packFileFilter
});

function handlePackUpload(req, res, next) {
  packUpload.any()(req, res, (error) => {
    if (!error) return next();

    const messages = {
      LIMIT_FILE_SIZE: "Un fichier dépasse la taille autorisée.",
      LIMIT_FILE_COUNT: "Le pack contient trop de fichiers.",
      LIMIT_UNEXPECTED_FILE: "Un fichier, un format ou un champ envoyé n’est pas autorisé.",
      LIMIT_FIELD_VALUE: "Les informations du pack sont trop volumineuses."
    };

    return res.status(400).json({
      success: false,
      code: error.code || "UPLOAD_ERROR",
      message: messages[error.code] || "Le serveur a refusé un fichier du pack."
    });
  });
}

const packRevisionUpload = multer({
  storage,
  limits: {
    files: PACK_MAX_TRACKS,
    fileSize: PACK_MAX_AUDIO_SIZE,
    fields: 4,
    fieldSize: 2 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    if (!isPackAudioField(file.fieldname)) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }

    return packFileFilter(req, file, cb);
  }
});

function handlePackRevisionUpload(req, res, next) {
  packRevisionUpload.any()(req, res, (error) => {
    if (!error) return next();

    const messages = {
      LIMIT_FILE_SIZE: "Une nouvelle version audio dépasse 250 Mo.",
      LIMIT_FILE_COUNT: "Trop de versions audio ont été envoyées.",
      LIMIT_UNEXPECTED_FILE: "Un fichier, un format ou un champ audio n’est pas autorisé.",
      LIMIT_FIELD_VALUE: "Les informations de modification sont trop volumineuses."
    };

    return res.status(400).json({
      success: false,
      code: error.code || "UPLOAD_ERROR",
      message: messages[error.code] || "Le serveur a refusé la nouvelle version audio."
    });
  });
}


function readMidiVariableLength(buffer, offset) {
  let value = 0;
  let cursor = offset;
  let count = 0;
  while (cursor < buffer.length && count < 4) {
    const byte = buffer[cursor++];
    value = (value << 7) | (byte & 0x7f);
    count += 1;
    if ((byte & 0x80) === 0) break;
  }
  return { value, offset: cursor };
}

function buildMidiPreviewFromFile(filePath, options = {}) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 14 || buffer.toString("ascii", 0, 4) !== "MThd") return null;
    const headerLength = buffer.readUInt32BE(4);
    const trackCount = buffer.readUInt16BE(10);
    const divisionRaw = buffer.readUInt16BE(12);
    const ticksPerQuarter = (divisionRaw & 0x8000) === 0 ? Math.max(1, divisionRaw) : 480;
    const full = options.full === true;
    const previewTickLimit = full ? Number.POSITIVE_INFINITY : ticksPerQuarter * 32;
    const maxPreviewNotes = full ? 12000 : 96;
    const notes = [];
    let cursor = 8 + headerLength;
    let totalTicks = 0;
    let truncated = false;

    for (let trackIndex = 0; trackIndex < trackCount && cursor + 8 <= buffer.length; trackIndex += 1) {
      if (buffer.toString("ascii", cursor, cursor + 4) !== "MTrk") break;
      const trackLength = buffer.readUInt32BE(cursor + 4);
      cursor += 8;
      const trackEnd = Math.min(buffer.length, cursor + trackLength);
      let tick = 0;
      let runningStatus = 0;
      const activeNotes = new Map();

      while (cursor < trackEnd) {
        const delta = readMidiVariableLength(buffer, cursor);
        tick += delta.value;
        cursor = delta.offset;
        totalTicks = Math.max(totalTicks, tick);
        if (cursor >= trackEnd) break;

        let status = buffer[cursor];
        if (status >= 0x80) {
          cursor += 1;
          if (status < 0xf0) runningStatus = status;
        } else if (runningStatus) {
          status = runningStatus;
        } else {
          break;
        }

        if (status === 0xff) {
          if (cursor >= trackEnd) break;
          cursor += 1;
          const length = readMidiVariableLength(buffer, cursor);
          cursor = Math.min(trackEnd, length.offset + length.value);
          continue;
        }
        if (status === 0xf0 || status === 0xf7) {
          const length = readMidiVariableLength(buffer, cursor);
          cursor = Math.min(trackEnd, length.offset + length.value);
          continue;
        }
        if (status >= 0xf0) continue;

        const command = status & 0xf0;
        const channel = status & 0x0f;
        const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
        if (cursor + dataLength > trackEnd) break;
        const data1 = buffer[cursor++];
        const data2 = dataLength === 2 ? buffer[cursor++] : 0;

        if (command === 0x90 && data2 > 0) {
          const key = `${channel}:${data1}`;
          const active = activeNotes.get(key) || [];
          active.push({ start: tick, velocity: data2, note: data1 });
          activeNotes.set(key, active);
        } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
          const key = `${channel}:${data1}`;
          const active = activeNotes.get(key) || [];
          const started = active.shift();
          if (started && started.start <= previewTickLimit) {
            if (notes.length < maxPreviewNotes) {
              notes.push({
                note: started.note,
                start: started.start,
                duration: Math.max(1, tick - started.start),
                velocity: started.velocity
              });
            } else {
              truncated = true;
            }
          }
          if (active.length) activeNotes.set(key, active);
          else activeNotes.delete(key);
        }
      }

      for (const active of activeNotes.values()) {
        for (const started of active) {
          if (started.start > previewTickLimit) continue;
          if (notes.length < maxPreviewNotes) {
            notes.push({
              note: started.note,
              start: started.start,
              duration: Math.max(1, tick - started.start),
              velocity: started.velocity
            });
          } else {
            truncated = true;
          }
        }
      }
      cursor = trackEnd;
    }

    const previewTotal = full
      ? Math.max(totalTicks, ticksPerQuarter * 4)
      : Math.max(ticksPerQuarter * 4, Math.min(previewTickLimit, totalTicks || ticksPerQuarter * 4));

    if (!notes.length) {
      return {
        kind: "midi",
        previewVersion: 2,
        fullPreview: full,
        ticksPerQuarter,
        totalTicks: previewTotal,
        notes: [],
        truncated
      };
    }

    const lowestNote = Math.min(...notes.map((note) => note.note));
    const highestNote = Math.max(...notes.map((note) => note.note));
    const notesTotal = Math.max(...notes.map((note) => note.start + note.duration));
    return {
      kind: "midi",
      previewVersion: 2,
      fullPreview: full,
      ticksPerQuarter,
      totalTicks: full ? Math.max(previewTotal, notesTotal) : Math.max(ticksPerQuarter * 4, Math.min(previewTickLimit, notesTotal)),
      lowestNote,
      highestNote,
      notes,
      truncated
    };
  } catch (error) {
    console.warn("Aperçu MIDI indisponible :", error.message);
    return null;
  }
}

function buildDawResourcePreview(resource = {}, pack = {}) {
  return {
    kind: "daw",
    dawName: String(resource.dawName || pack.dawName || ""),
    dawVersion: String(resource.dawVersion || pack.dawVersion || ""),
    dawPlugins: String(resource.dawPlugins || pack.dawPlugins || ""),
    extension: String(resource.extension || path.extname(resource.originalName || "") || "").toLowerCase(),
    originalName: String(resource.originalName || ""),
    size: Number(resource.size || 0)
  };
}

function removeFileIfExists(filePath) {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Nettoyage fichier impossible :", filePath, error);
  }
}

function validatePendingPackRequest(req) {
  if (!req.body?.packData) {
    return { valid: false, status: 400, message: "Les informations du pack sont absentes." };
  }

  let pack;
  try {
    pack = JSON.parse(req.body.packData);
  } catch {
    return { valid: false, status: 400, message: "Les informations du pack sont invalides." };
  }

  if (!pack || typeof pack !== "object") {
    return { valid: false, status: 400, message: "Le pack envoyé est invalide." };
  }

  delete pack.description;

  const title = String(pack.title || "").trim();
  const artistId = String(pack.artistId || "").trim();
  const normalizedContentType = String(pack.contentType || "audio").trim().toLowerCase();
  const normalizedAudience = String(pack.primaryAudience || "both").trim().toLowerCase();
  const allowedContentTypes = new Set(["audio", "midi", "daw"]);
  const allowedAudiences = new Set(["creators", "artists", "both"]);
  const allowedDaws = new Set(["fl-studio", "ableton-live", "logic-pro", "reaper", "cubase", "pro-tools", "studio-one", "other"]);
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
  const resources = Array.isArray(pack.resources) ? pack.resources : [];
  const packIsFree =
    pack.isFree === true ||
    String(pack.price || "").trim().toLowerCase() === "gratuit";
  const packPrice = packIsFree
    ? 0
    : Number(String(pack.price || "").replace("€", "").replace(",", "."));

  if (!title || title.length > 70) {
    return { valid: false, status: 400, message: "Le titre du pack est obligatoire et limité à 70 caractères." };
  }
  if (!artistId) {
    return { valid: false, status: 400, message: "L’artiste du pack est introuvable." };
  }
  if (!allowedContentTypes.has(normalizedContentType)) {
    return { valid: false, status: 400, message: "Le type de contenu du pack est invalide." };
  }
  if (!allowedAudiences.has(normalizedAudience)) {
    return { valid: false, status: 400, message: "La cible principale du pack est invalide." };
  }
  pack.contentType = normalizedContentType;
  pack.primaryAudience = normalizedAudience;

  if (normalizedContentType === "audio") {
    if (tracks.length < 1 || tracks.length > PACK_MAX_TRACKS) {
      return { valid: false, status: 400, message: `Un pack audio doit contenir entre 1 et ${PACK_MAX_TRACKS} tracks.` };
    }
    pack.resources = [];
  } else {
    pack.primaryAudience = "artists";
    if (resources.length < 1 || resources.length > PACK_MAX_RESOURCES) {
      return { valid: false, status: 400, message: `Un pack de ressources doit contenir entre 1 et ${PACK_MAX_RESOURCES} fichiers.` };
    }
    pack.tracks = [];
    if (normalizedContentType === "daw") {
      const dawName = String(pack.dawName || "").trim().toLowerCase();
      if (!allowedDaws.has(dawName)) {
        return { valid: false, status: 400, message: "Le logiciel DAW correspondant doit être indiqué." };
      }
      pack.dawName = dawName;
      pack.dawVersion = String(pack.dawVersion || "").trim().slice(0, 40);
      pack.dawPlugins = String(pack.dawPlugins || "").trim().slice(0, 220);
    } else {
      pack.dawName = "";
      pack.dawVersion = "";
      pack.dawPlugins = "";
    }
  }

  if (!packIsFree && (!Number.isFinite(packPrice) || packPrice <= 0)) {
    return { valid: false, status: 400, message: "Le prix du pack est invalide." };
  }
  pack.isFree = packIsFree;
  pack.price = packIsFree ? "Gratuit" : `${packPrice.toFixed(2)}€`;

  if (!pack.license || typeof pack.license !== "object") {
    return { valid: false, status: 400, message: "La licence d’utilisation du pack est obligatoire." };
  }
  if (pack.rightsDeclarationAccepted !== true) {
    return { valid: false, status: 400, code: "RIGHTS_DECLARATION_REQUIRED", message: "La déclaration de droits est obligatoire avant publication." };
  }
  const creationValidation = humanCreationModeration.validateCreationProcess(pack.creationProcess || {});
  if (!creationValidation.valid) {
    return { valid: false, status: 400, code: creationValidation.code, message: creationValidation.message };
  }
  pack.creationProcess = creationValidation.value;
  pack.creationEvidenceKinds = Array.isArray(pack.creationEvidenceKinds)
    ? pack.creationEvidenceKinds.map((value) => String(value || "other").trim().slice(0, 40)).slice(0, PACK_MAX_EVIDENCE_FILES)
    : [];
  pack.license = normalizePackLicense(pack.license);

  const files = Array.isArray(req.files) ? req.files : [];
  const fileByField = new Map(files.map((file) => [file.fieldname, file]));
  const coverPackFile = fileByField.get("coverPack");
  if (!coverPackFile) return { valid: false, status: 400, message: "La cover du pack est obligatoire." };
  if (coverPackFile.size > PACK_MAX_IMAGE_SIZE) return { valid: false, status: 400, message: "La cover du pack dépasse 8 Mo." };

  if (normalizedContentType === "audio") {
    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      const trackTitle = String(track?.title || "").trim();
      const trackIsFree = track?.isFree === true || String(track?.price || "").trim().toLowerCase() === "gratuit";
      const price = trackIsFree ? 0 : Number(String(track?.price || "").replace("€", "").replace(",", "."));
      const customCover = fileByField.get(`trackCover_${index}`);
      const usesPackCover = track?.coverMode !== "custom" || !customCover;
      const cover = usesPackCover ? coverPackFile : customCover;
      const audio = fileByField.get(`trackAudio_${index}`);

      if (!trackTitle || trackTitle.length > 70) return { valid: false, status: 400, message: `Le titre de la track ${index + 1} est invalide.` };
      if ((!trackIsFree && (!Number.isFinite(price) || price <= 0)) || (trackIsFree && price !== 0)) {
        return { valid: false, status: 400, message: `Le prix de la track ${index + 1} est invalide.` };
      }
      track.isFree = trackIsFree;
      track.price = trackIsFree ? "Gratuit" : `${price.toFixed(2)}€`;
      track.coverMode = usesPackCover ? "pack" : "custom";
      if (!cover) return { valid: false, status: 400, message: `La cover de la track ${index + 1} est obligatoire.` };
      if (!usesPackCover && cover.size > PACK_MAX_IMAGE_SIZE) return { valid: false, status: 400, message: `La cover de la track ${index + 1} dépasse 8 Mo.` };
      if (!audio) return { valid: false, status: 400, message: `Le fichier audio de la track ${index + 1} est obligatoire.` };
      if (audio.size > PACK_MAX_AUDIO_SIZE) return { valid: false, status: 400, message: `Le fichier audio de la track ${index + 1} dépasse 250 Mo.` };
    }
  } else {
    const blockedDawExtensions = new Set([".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".js", ".mjs", ".cjs", ".html", ".htm", ".php", ".py", ".sh", ".ps1"]);
    for (let index = 0; index < resources.length; index += 1) {
      const resource = resources[index] || {};
      const resourceFile = fileByField.get(`resourceFile_${index}`);
      const customCover = fileByField.get(`resourceCover_${index}`);
      const usesPackCover = resource?.coverMode !== "custom" || !customCover;
      const cover = usesPackCover ? coverPackFile : customCover;
      const resourceTitle = String(resource.title || "").trim();
      const resourceIsFree = resource?.isFree === true || String(resource?.price || "").trim().toLowerCase() === "gratuit";
      const resourcePrice = resourceIsFree ? 0 : Number(String(resource?.price || "").replace("€", "").replace(",", "."));
      if (!resourceTitle || resourceTitle.length > 70) return { valid: false, status: 400, message: `Le titre de la ressource ${index + 1} est invalide.` };
      if (!resourceIsFree && (!Number.isFinite(resourcePrice) || resourcePrice <= 0)) return { valid: false, status: 400, message: `Le prix de la ressource ${index + 1} est invalide.` };
      if (!cover) return { valid: false, status: 400, message: `La cover de la ressource ${index + 1} est obligatoire.` };
      if (!usesPackCover && cover.size > PACK_MAX_IMAGE_SIZE) return { valid: false, status: 400, message: `La cover de la ressource ${index + 1} dépasse 8 Mo.` };
      if (!resourceFile) return { valid: false, status: 400, message: `Le fichier de la ressource ${index + 1} est obligatoire.` };
      if (resourceFile.size > PACK_MAX_RESOURCE_SIZE) return { valid: false, status: 400, message: `La ressource ${index + 1} dépasse 250 Mo.` };
      const extension = path.extname(resourceFile.originalname || "").toLowerCase();
      if (normalizedContentType === "midi" && ![".mid", ".midi"].includes(extension)) return { valid: false, status: 400, message: `La ressource ${index + 1} doit être un fichier MIDI .mid ou .midi.` };
      if (normalizedContentType === "daw" && (!extension || blockedDawExtensions.has(extension))) return { valid: false, status: 400, message: `Le fichier du projet DAW ${index + 1} n’est pas autorisé.` };
      resource.resourceType = normalizedContentType;
      resource.isFree = resourceIsFree;
      resource.price = resourceIsFree ? "Gratuit" : `${resourcePrice.toFixed(2)}€`;
      resource.coverMode = usesPackCover ? "pack" : "custom";
      resource.originalName = resourceFile.originalname;
      resource.extension = extension;
      resource.size = resourceFile.size;
      if (normalizedContentType === "daw") { resource.dawName = pack.dawName; resource.dawVersion = pack.dawVersion || ""; resource.dawPlugins = pack.dawPlugins || ""; }
    }
  }

  const expectedFields = new Set(["coverPack"]);
  if (normalizedContentType === "audio") {
    tracks.forEach((track, index) => {
      if (track?.coverMode === "custom") expectedFields.add(`trackCover_${index}`);
      expectedFields.add(`trackAudio_${index}`);
    });
  } else {
    resources.forEach((resource, index) => {
      if (resource?.coverMode === "custom") expectedFields.add(`resourceCover_${index}`);
      expectedFields.add(`resourceFile_${index}`);
    });
  }
  const evidenceFiles = files
    .filter((file) => isPackEvidenceField(file.fieldname))
    .sort((a, b) => Number(a.fieldname.split("_").pop()) - Number(b.fieldname.split("_").pop()));
  if (evidenceFiles.length > PACK_MAX_EVIDENCE_FILES) {
    return { valid: false, status: 400, message: `Maximum ${PACK_MAX_EVIDENCE_FILES} justificatifs privés.` };
  }
  for (const evidenceFile of evidenceFiles) {
    if (!isAllowedCreationEvidence(evidenceFile)) {
      return { valid: false, status: 400, message: "Un justificatif de création n’est pas autorisé ou dépasse 100 Mo." };
    }
    expectedFields.add(evidenceFile.fieldname);
  }
  const unexpectedFile = files.find((file) => !expectedFields.has(file.fieldname));
  if (unexpectedFile) return { valid: false, status: 400, message: "Le pack contient un fichier inattendu." };
  if (files.length !== expectedFields.size) return { valid: false, status: 400, message: "Le nombre de fichiers reçus ne correspond pas au pack." };

  return { valid: true, pack, fileByField };
}
function createZipFromPaths(zipPath, filePaths) {
  const zip = new AdmZip();

  for (const filePath of filePaths) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Fichier ZIP introuvable : ${filePath || "chemin vide"}`);
    }

    zip.addLocalFile(filePath);
  }

  zip.writeZip(zipPath);

  if (fs.statSync(zipPath).size <= 0) {
    throw new Error("Le ZIP généré est vide.");
  }
}


const downloadsPath = path.join(__dirname, "downloads");
const packsZipPath = path.join(downloadsPath, "packs");
const tracksZipPath = path.join(downloadsPath, "tracks");

[downloadsPath, packsZipPath, tracksZipPath].forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

app.use("/downloads", (_req, res) => {
  res.status(403).json({
    success: false,
    code: "PROTECTED_DOWNLOAD_REQUIRED",
    message: "Ce téléchargement doit passer par l’autorisation Sonara."
  });
});

const usersPath = path.join(__dirname, "data", "users.json");
const licenseProtection = createLicenseProtection({
  environment: "local",
  dataDir: path.join(__dirname, "data")
});
licenseProtection.init()
  .then(async () => {
    const legacyResult = await licenseProtection.migrateLegacyDownloads({
      rootUsers: readJsonArray(usersPath),
      packs: readJsonArray(packsPath)
    });
    console.log(`Traçabilité licences LOCAL prête — ${legacyResult.observed} téléchargement(s) legacy observé(s).`);
  })
  .catch((error) => {
    console.error("Initialisation protection licences LOCAL impossible :", error);
  });

registerHumanCreationReviewRoutes({
  app,
  packsPath,
  environment: "local",
  localEvidenceDir: path.join(__dirname, "data", "moderation-evidence")
});

registerAutoPlaylistRoutes(app, {
  getApprovedAudioPacks: async () => readJsonArray(packsPath).filter((pack) =>
    String(pack?.status || "").toLowerCase() === "approved" &&
    !isPackHiddenByModeration(pack) &&
    ["", "audio"].includes(String(pack?.contentType || "audio").toLowerCase())
  ),
  findAccount: findRootAndAccountById,
  saveAccount: saveAccountState,
  commercialPolicy,
  licenseProtection,
  appendAcquisitionHistory
});


const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function normalizePseudo(pseudo) {
  return String(pseudo || "").trim().toLowerCase();
}

function validateNewAccountFields(profile) {
  const fieldErrors = {};
  const password = String(profile.password || "");

  if (password.length < PASSWORD_MIN_LENGTH) {
    fieldErrors.password =
      `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    fieldErrors.password =
      `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
  }

  return fieldErrors;
}


const verificationCodes = new Map();
const verifiedTokens = new Map();
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TOKEN_TTL_MS = 15 * 60 * 1000;

function normalizeLoginPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0033") && digits.length === 13) return `0${digits.slice(4)}`;
  if (digits.startsWith("33") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function normalizeMail(mail) {
  return String(mail || "").trim().toLowerCase();
}

function cleanupVerificationStores() {
  const now = Date.now();
  for (const [key, value] of verificationCodes) {
    if (value.expiresAt <= now) verificationCodes.delete(key);
  }
  for (const [key, value] of verifiedTokens) {
    if (value.expiresAt <= now) verifiedTokens.delete(key);
  }
}

function createVerificationKey(mail, purpose, userId = "") {
  return `${purpose}:${String(userId || "")}:${normalizeMail(mail)}`;
}

function createVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function createVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function passwordAlreadyUsedInUsers(users, password) {
  return users.some((rootUser) =>
    rootUser.accounts?.some((account) => account.password === password)
  );
}

function collectLocalDuplicateErrors(users, { mail, pseudo, password, phone }) {
  const fieldErrors = {};
  const normalizedMail = normalizeMail(mail);
  const normalizedPseudo = normalizePseudo(pseudo);

  if (normalizedMail && users.some((rootUser) =>
    rootUser.accounts?.some((account) => normalizeMail(account.mail) === normalizedMail)
  )) {
    fieldErrors.mail = "Cette adresse e-mail est déjà utilisée.";
  }

  if (normalizedPseudo && users.some((rootUser) =>
    rootUser.accounts?.some((account) => normalizePseudo(account.pseudo) === normalizedPseudo)
  )) {
    fieldErrors.pseudo = "Ce pseudo est déjà utilisé.";
  }

  if (password && passwordAlreadyUsedInUsers(users, password)) {
    fieldErrors.password = "Ce mot de passe est déjà utilisé. Choisissez-en un autre.";
  }

  const normalizedPhone = normalizeLoginPhone(phone);
  if (normalizedPhone && users.some((rootUser) =>
    rootUser.accounts?.some((account) =>
      normalizeLoginPhone(account.phone) === normalizedPhone
    )
  )) {
    fieldErrors.phone = "Ce numéro de téléphone est déjà utilisé.";
  }

  return fieldErrors;
}

function consumeVerifiedToken({ token, mail, purpose, userId = "" }) {
  cleanupVerificationStores();
  const stored = verifiedTokens.get(String(token || ""));
  const expectedKey = createVerificationKey(mail, purpose, userId);

  if (!stored || stored.key !== expectedKey || stored.expiresAt <= Date.now()) {
    return false;
  }

  verifiedTokens.delete(String(token));
  return true;
}

app.post("/api/account-security/check", (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const fieldErrors = {
      ...validateNewAccountFields(req.body || {}),
      ...collectLocalDuplicateErrors(users, req.body || {})
    };

    return res.json({
      success: true,
      available: Object.keys(fieldErrors).length === 0,
      fieldErrors
    });
  } catch (error) {
    console.error("Erreur vérification doublons :", error);
    return res.status(500).json({ success: false, message: "Vérification impossible." });
  }
});

app.post("/api/account-security/send-code", async (req, res) => {
  try {
    cleanupVerificationStores();
    const { mail, pseudo, password, phone, purpose = "register", userId = "" } = req.body || {};
    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const fieldErrors = {
      ...validateNewAccountFields({ password }),
      ...collectLocalDuplicateErrors(users, { mail, pseudo, password, phone })
    };

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(409).json({ success: false, message: "Certaines informations sont déjà utilisées.", fieldErrors });
    }

    const normalizedMail = normalizeMail(mail);
    if (!normalizedMail) {
      return res.status(400).json({ success: false, fieldErrors: { mail: "Adresse e-mail obligatoire." } });
    }

    const code = createVerificationCode();
    const key = createVerificationKey(normalizedMail, purpose, userId);
    verificationCodes.set(key, { code, expiresAt: Date.now() + VERIFICATION_CODE_TTL_MS, attempts: 0 });

    await transporter.sendMail({
      from: "Sonara Pack <luca.dida17@gmail.com>",
      to: normalizedMail,
      subject: "Votre code de vérification Sonara Pack",
      html: `<div style="font-family:Arial,sans-serif;background:#080b12;color:white;padding:30px;border-radius:16px"><h1 style="color:#7ddcff">Vérification de votre adresse e-mail</h1><p>Votre code Sonara Pack est :</p><p style="font-size:34px;font-weight:700;letter-spacing:8px">${code}</p><p>Ce code expire dans 10 minutes.</p></div>`
    });

    return res.json({ success: true, message: "Code envoyé." });
  } catch (error) {
    console.error("Erreur envoi code :", error);
    return res.status(500).json({ success: false, message: "Impossible d'envoyer le code." });
  }
});

app.post("/api/account-security/verify-code", (req, res) => {
  cleanupVerificationStores();
  const { mail, code, purpose = "register", userId = "" } = req.body || {};
  const key = createVerificationKey(mail, purpose, userId);
  const stored = verificationCodes.get(key);

  if (!stored || stored.expiresAt <= Date.now()) {
    verificationCodes.delete(key);
    return res.status(400).json({ success: false, message: "Code expiré ou introuvable." });
  }

  stored.attempts += 1;
  if (stored.attempts > 5) {
    verificationCodes.delete(key);
    return res.status(429).json({ success: false, message: "Trop de tentatives. Demandez un nouveau code." });
  }

  if (String(code || "").trim() !== stored.code) {
    return res.status(400).json({ success: false, message: "Code incorrect." });
  }

  verificationCodes.delete(key);
  const token = createVerificationToken();
  verifiedTokens.set(token, { key, expiresAt: Date.now() + VERIFIED_TOKEN_TTL_MS });
  return res.json({ success: true, verificationToken: token });
});


app.post("/api/register", upload.any(), async (req, res) => {
 

  try {
    const profile = req.body.profile
      ? JSON.parse(req.body.profile)
      : req.body;

    const imageProfileFile = req.files?.find(
      (file) => file.fieldname === "imageProfile"
    );

    console.log(
      "IMAGE PROFILE :",
      imageProfileFile
    );

    console.log(
      "REQ FILES :",
      req.files
    );

    profile.imageProfile =
      imageProfileFile
        ? imageProfileFile.filename
        : "";

    if (
      !profile.firstname ||
      !profile.lastname ||
      !profile.mail ||
      !profile.password ||
      !profile.pseudo ||
      !profile.role
    ) {
      return res.status(400).json({
        success: false,
        message: "Informations manquantes."
      });
    }

    if (!["user", "artist", "both"].includes(profile.role)) {
      return res.status(400).json({
        success: false,
        message: "Rôle invalide."
      });
    }

    if (profile.role === "user") {
      profile.status = "approved";
    }

    if (
      profile.role === "artist" ||
      profile.role === "both"
    ) {
      profile.status = "pending";
    }

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    if (!consumeVerifiedToken({
      token: req.body.verificationToken,
      mail: profile.mail,
      purpose: "register"
    })) {
      return res.status(403).json({ success: false, message: "Vérification e-mail requise ou expirée." });
    }

    const normalizedMail = profile.mail
      ?.trim()
      .toLowerCase();

    const normalizedPseudo = normalizePseudo(profile.pseudo);
    const fieldErrors = validateNewAccountFields(profile);

    const mailAlreadyUsed = users.some((rootUser) =>
      rootUser.accounts?.some(
        (account) =>
          account.mail
            ?.trim()
            .toLowerCase() === normalizedMail
      )
    );

    const pseudoAlreadyUsed = users.some((rootUser) =>
      rootUser.accounts?.some(
        (account) =>
          normalizePseudo(account.pseudo) === normalizedPseudo
      )
    );

    if (mailAlreadyUsed) {
      fieldErrors.mail =
        "Vous avez déjà un compte avec cette adresse e-mail.";
    }

    if (pseudoAlreadyUsed) {
      fieldErrors.pseudo =
        "Ce pseudo est déjà utilisé. Choisissez-en un autre.";
    }

    if (passwordAlreadyUsedInUsers(users, profile.password)) {
      fieldErrors.password =
        "Ce mot de passe est déjà utilisé. Choisissez-en un autre.";
    }

    const normalizedPhone = normalizeLoginPhone(profile.phone);

    if ((profile.role === "artist" || profile.role === "both") && !normalizedPhone) {
      fieldErrors.phone = "Le numéro de téléphone est obligatoire.";
    }

    if (normalizedPhone && users.some((rootUser) =>
      rootUser.accounts?.some((account) =>
        normalizeLoginPhone(account.phone) === normalizedPhone
      )
    )) {
      fieldErrors.phone = "Ce numéro de téléphone est déjà utilisé.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(409).json({
        success: false,
        message: "Certaines informations doivent être modifiées.",
        fieldErrors
      });
    }

    const now = new Date().toISOString();

    const userId = String(Date.now());

    const accountId = `acc_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const account = {
      id: accountId,
      accountId,

      firstname:
        profile.firstname?.trim() || "",

      lastname:
        profile.lastname?.trim() || "",

      date:
        profile.date || "",

      mail:
        normalizedMail || "",

      password:
        profile.password || "",

      phone:
        profile.phone?.trim() || "",

      pseudo:
        profile.pseudo?.trim() || "",

      role:
        profile.role,

      status:
        profile.status,

      imageProfile:
        profile.imageProfile || "",

      downloadedPacks:
        profile.downloadedPacks || [],

      downloadedTracks:
        profile.downloadedTracks || [],

      createdAt:
        now,

      updatedAt:
        now
    };

    const rootUser = {
      id: userId,

      accounts: [
        account
      ],

      createdAt:
        now,

      updatedAt:
        now
    };

    users.push(rootUser);

    fs.writeFileSync(
      usersPath,
      JSON.stringify(users, null, 2),
      "utf8"
    );

  if (profile.status === "pending") {
    createLocalFounderNotification({
      type: "artist",
      title: "Nouvel artiste à modérer",
      message: `${profile.pseudo || profile.mail || "Nouvel artiste"} attend une validation.`,
      entityId: account.id || account.accountId,
      priority: "normal"
    });

    false && transporter.sendMail({
      from: "Sonara Pack <luca.dida17@gmail.com>",
      to: "luca.dida17@gmail.com",
      subject: "Nouvelle demande artiste à modérer - Sonara Pack",
      html: `
        <div style="font-family: Arial, sans-serif; background:#080b12; color:white; padding:30px; border-radius:16px;">
          <h1 style="color:#7ddcff;">Nouvelle demande artiste</h1>

          <p>Un nouveau profil vient d’être créé sur <strong>Sonara Pack</strong> et attend une validation admin.</p>

          <div style="background:#111827; padding:20px; border-radius:14px; margin-top:20px;">
            <p><strong>Nom :</strong> ${profile.firstname} ${profile.lastname}</p>
            <p><strong>Email :</strong> ${profile.mail}</p>
            <p><strong>Téléphone :</strong> ${profile.phone || "Non renseigné"}</p>
            <p><strong>Rôle :</strong> ${profile.role}</p>
            <p><strong>Nom d’artiste :</strong> ${profile.pseudo || "Non renseigné"}</p>
            <p><strong>SIRET :</strong> ${profile.siretinput || "Non renseigné"}</p>
            <p><strong>Image artiste :</strong> ${profile.imageProfile || "Aucune image"}</p>
            <p><strong>Status :</strong> ${profile.status}</p>
            <p><strong>Date :</strong> ${profile.createdAt}</p>
          </div>

          <div style="margin-top:30px;">
            <a href="http://localhost:5501/admin.html"
              style="display:inline-block; padding:14px 22px; background:#7ddcff; color:#000; text-decoration:none; border-radius:999px; font-weight:bold;">
              Ouvrir Admin sur PC
            </a>

            <a href="http://192.168.1.18:5501/admin.html"
              style="display:inline-block; padding:14px 22px; background:#ffffff; color:#000; text-decoration:none; border-radius:999px; font-weight:bold; margin-left:10px;">
              Ouvrir Admin sur téléphone
            </a>
          </div>
        </div>
      `
    });
  }

  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

  
    const returnedAccount = sanitizeAccount(account, userId);

    return res.status(201).json({
      success: true,

      message:
        "Compte créé avec succès.",

      profile:
        returnedAccount,

      account:
        returnedAccount,

      redirectTo:
        account.role === "artist" ||
        account.role === "both"
          ? "/app/pages/creator/dashboard.html"
          : "/home.html"
    });

  } catch (error) {
    console.error(
      "Erreur POST /api/register :",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Impossible de créer le compte."
    });
  }
});

/* =========================
   AJOUTER UN COMPTE
========================= */

app.post("/api/accounts", upload.any(), async (req, res) => {
  try {
    const profile = req.body.profile
      ? JSON.parse(req.body.profile)
      : req.body;

    const userId = String(req.body.userId || "");

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Racine utilisateur introuvable."
      });
    }

    if (
      !profile.firstname ||
      !profile.lastname ||
      !profile.mail ||
      !profile.password ||
      !profile.pseudo ||
      !profile.role
    ) {
      return res.status(400).json({
        success: false,
        message: "Informations manquantes."
      });
    }

    if (
      !["user", "artist", "both"].includes(profile.role)
    ) {
      return res.status(400).json({
        success: false,
        message: "Rôle invalide."
      });
    }

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    if (!consumeVerifiedToken({
      token: req.body.verificationToken,
      mail: profile.mail,
      purpose: "add-account",
      userId
    })) {
      return res.status(403).json({ success: false, message: "Vérification e-mail requise ou expirée." });
    }

    const rootUser = users.find(
      (currentRootUser) =>
        String(currentRootUser.id) === userId
    );

    if (!rootUser) {
      return res.status(404).json({
        success: false,
        message: "Racine utilisateur introuvable."
      });
    }

    const normalizedMail = profile.mail
      ?.trim()
      .toLowerCase();

    const normalizedPseudo = normalizePseudo(profile.pseudo);
    const fieldErrors = validateNewAccountFields(profile);

    const mailAlreadyUsed = users.some((currentRootUser) =>
      currentRootUser.accounts?.some(
        (account) =>
          account.mail
            ?.trim()
            .toLowerCase() === normalizedMail
      )
    );

    const pseudoAlreadyUsed = users.some((currentRootUser) =>
      currentRootUser.accounts?.some(
        (account) =>
          normalizePseudo(account.pseudo) === normalizedPseudo
      )
    );

    if (mailAlreadyUsed) {
      fieldErrors.mail =
        "Vous avez déjà un compte avec cette adresse e-mail.";
    }

    if (pseudoAlreadyUsed) {
      fieldErrors.pseudo =
        "Ce pseudo est déjà utilisé. Choisissez-en un autre.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(409).json({
        success: false,
        message: "Certaines informations doivent être modifiées.",
        fieldErrors
      });
    }

    const imageProfileFile = req.files?.find(
      (file) => file.fieldname === "imageProfile"
    );

    const now = new Date().toISOString();

    const accountId = `acc_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const status =
      profile.role === "user"
        ? "approved"
        : "pending";

    const account = {
      id: accountId,
      accountId,

      firstname:
        profile.firstname?.trim() || "",

      lastname:
        profile.lastname?.trim() || "",

      date:
        profile.date || "",

      mail:
        normalizedMail || "",

      password:
        profile.password || "",

      phone:
        profile.phone?.trim() || "",

      pseudo:
        profile.pseudo?.trim() || "",

      role:
        profile.role,

      status,

      imageProfile:
        imageProfileFile
          ? imageProfileFile.filename
          : "",

      downloadedPacks: [],
      downloadedTracks: [],

      createdAt: now,
      updatedAt: now
    };

    if (!Array.isArray(rootUser.accounts)) {
      rootUser.accounts = [];
    }

    rootUser.accounts.push(account);
    rootUser.updatedAt = now;

    fs.writeFileSync(
      usersPath,
      JSON.stringify(users, null, 2),
      "utf8"
    );

    if (status === "pending") {
      createLocalFounderNotification({
        type: "artist",
        title: "Nouvel artiste à modérer",
        message: `${account.pseudo || account.mail || "Nouvel artiste"} attend une validation.`,
        entityId: account.id || account.accountId,
        priority: "normal"
      });

      false && transporter.sendMail({
        from: "Sonara Pack <luca.dida17@gmail.com>",
        to: "luca.dida17@gmail.com",
        subject:
          "Nouvelle demande artiste à modérer - Sonara Pack",
        html: `
          <div style="font-family: Arial, sans-serif; background:#080b12; color:white; padding:30px; border-radius:16px;">
            <h1 style="color:#7ddcff;">Nouvelle demande artiste</h1>

            <p>Un nouveau compte artiste a été ajouté sur <strong>Sonara Pack</strong> et attend une validation admin.</p>

            <div style="background:#111827; padding:20px; border-radius:14px; margin-top:20px;">
              <p><strong>Nom :</strong> ${account.firstname} ${account.lastname}</p>
              <p><strong>Email :</strong> ${account.mail}</p>
              <p><strong>Téléphone :</strong> ${account.phone || "Non renseigné"}</p>
              <p><strong>Rôle :</strong> ${account.role}</p>
              <p><strong>Nom d’artiste :</strong> ${account.pseudo || "Non renseigné"}</p>
              <p><strong>Image artiste :</strong> ${account.imageProfile || "Aucune image"}</p>
              <p><strong>Status :</strong> ${account.status}</p>
              <p><strong>Date :</strong> ${account.createdAt}</p>
            </div>
          </div>
        `
      });
    }

    const returnedAccount = sanitizeAccount(account, rootUser.id);

    return res.status(201).json({
      success: true,
      message: "Compte ajouté avec succès.",
      profile: returnedAccount,
      account: returnedAccount
    });

  } catch (error) {
    console.error(
      "Erreur POST /api/accounts :",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Impossible d'ajouter le compte."
    });
  }
});

app.get("/api/profile/:id", (req, res) => {
  try {
    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    const requestedId = String(req.params.id);

    let rootUser = null;
    let account = null;

    for (const currentRootUser of users) {
      const foundAccount =
        currentRootUser.accounts?.find(
          (currentAccount) =>
            String(currentAccount.id) === requestedId ||
            String(currentAccount.accountId) === requestedId
        );

      if (foundAccount) {
        rootUser = currentRootUser;
        account = foundAccount;

        break;
      }
    }

    if (!account) {
      const legacyRootUser = users.find(
        (currentRootUser) => String(currentRootUser.id) === requestedId
      );
      const legacyAccounts = Array.isArray(legacyRootUser?.accounts)
        ? legacyRootUser.accounts
        : [];

      // Anciennes sessions : l'id racine pouvait être conservé à la place de
      // l'accountId. On restaure uniquement lorsqu'un seul compte est possible.
      if (legacyRootUser && legacyAccounts.length === 1) {
        rootUser = legacyRootUser;
        account = legacyAccounts[0];
      }
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "Profil introuvable"
      });
    }

    const legacyArtistBlocked =
      String(account.role || "").toLowerCase() === "both" &&
      ["rejected", "banned"].includes(
        String(account.status || "").toLowerCase()
      );

    if (legacyArtistBlocked) {
      account.artistStatus = account.artistStatus || account.status;
      account.artistModeratedAt =
        account.artistModeratedAt ||
        account.moderatedAt ||
        new Date().toISOString();
      account.role = "user";
      account.status = "approved";
      account.updatedAt = new Date().toISOString();

      fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2)
      );
    }

    const returnedProfile = sanitizeAccount(account, rootUser.id);

    return res.status(200).json(
      returnedProfile
    );

  } catch (error) {
    console.error(
      "Erreur GET /api/profile/:id :",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Impossible de récupérer le profil"
    });
  }
});




app.get("/api/profile/:id/announcements", (req, res) => {
  try {
    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );
    const requestedId = String(req.params.id || "");
    const account = users
      .flatMap((rootUser) => rootUser.accounts || [])
      .find((currentAccount) =>
        String(currentAccount.id) === requestedId ||
        String(currentAccount.accountId) === requestedId
      );

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Compte introuvable."
      });
    }

    return res.status(200).json({
      success: true,
      announcements: {
        lastSeenHomeAnnouncement:
          account.lastSeenHomeAnnouncement || null,
        lastSeenCreatorAnnouncement:
          account.lastSeenCreatorAnnouncement || null
      }
    });
  } catch (error) {
    console.error("Lecture des annonces impossible :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de lire les annonces du compte."
    });
  }
});

app.patch("/api/profile/:id/announcements", (req, res) => {
  try {
    const seenFields = {
      user: "lastSeenHomeAnnouncement",
      artist: "lastSeenCreatorAnnouncement"
    };
    const requestedId = String(req.params.id || "");
    const audience = String(req.body?.audience || "").trim();
    const version = String(req.body?.version || "").trim();
    const seenField = seenFields[audience];

    if (!seenField || !/^PRE_V1_\d+$/.test(version)) {
      return res.status(400).json({
        success: false,
        message: "Annonce Pre-V1 invalide."
      });
    }

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );
    let rootUser = null;
    let account = null;

    for (const currentRootUser of users) {
      const foundAccount = (currentRootUser.accounts || []).find(
        (currentAccount) =>
          String(currentAccount.id) === requestedId ||
          String(currentAccount.accountId) === requestedId
      );

      if (foundAccount) {
        rootUser = currentRootUser;
        account = foundAccount;
        break;
      }
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Compte introuvable."
      });
    }

    account[seenField] = version;
    account.updatedAt = new Date().toISOString();
    rootUser.updatedAt = account.updatedAt;

    fs.writeFileSync(
      usersPath,
      JSON.stringify(users, null, 2),
      "utf8"
    );

    return res.status(200).json({
      success: true,
      announcements: {
        lastSeenHomeAnnouncement:
          account.lastSeenHomeAnnouncement || null,
        lastSeenCreatorAnnouncement:
          account.lastSeenCreatorAnnouncement || null
      }
    });
  } catch (error) {
    console.error("Enregistrement de l'annonce impossible :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d'enregistrer l'annonce du compte."
    });
  }
});


/* =========================
   VÉRIFICATION CONNEXION EN DIRECT
========================= */

app.post("/api/login/live-check", (req, res) => {
  try {
    const { mail, password, phone } = req.body || {};
    const normalizedMail = normalizeMail(mail);
    const normalizedPhone = normalizeLoginPhone(phone);
    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));

    let matchedAccount = null;
    for (const rootUser of users) {
      matchedAccount = rootUser.accounts?.find(
        (account) => normalizeMail(account.mail) === normalizedMail
      );
      if (matchedAccount) break;
    }

    return res.json({
      success: true,
      checks: {
        mail: Boolean(matchedAccount),
        phone: Boolean(
          matchedAccount &&
          normalizedPhone &&
          normalizeLoginPhone(matchedAccount.phone) === normalizedPhone
        ),
        password: Boolean(
          matchedAccount &&
          typeof password === "string" &&
          password.length >= 8 &&
          matchedAccount.password === password
        )
      }
    });
  } catch (error) {
    console.error("Erreur POST /api/login/live-check :", error);
    return res.status(500).json({
      success: false,
      checks: { mail: false, phone: false, password: false }
    });
  }
});

/* =========================
   CODE DE VÉRIFICATION CONNEXION
========================= */

app.post("/api/login/send-code", async (req, res) => {
  try {
    cleanupVerificationStores();

    const { mail, password, phone } = req.body || {};
    const normalizedMail = normalizeMail(mail);
    const normalizedPhone = normalizeLoginPhone(phone);

    if (!normalizedMail || !password || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: "L'adresse e-mail, le mot de passe et le téléphone sont obligatoires."
      });
    }

    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const accountExists = users.some((rootUser) =>
      rootUser.accounts?.some((account) =>
        normalizeMail(account.mail) === normalizedMail &&
        account.password === password &&
        normalizeLoginPhone(account.phone) === normalizedPhone
      )
    );

    if (!accountExists) {
      return res.status(403).json({
        success: false,
        error: "Les informations de connexion sont incorrectes."
      });
    }

    const code = createVerificationCode();
    const key = createVerificationKey(normalizedMail, "login");

    verificationCodes.set(key, {
      code,
      expiresAt: Date.now() + VERIFICATION_CODE_TTL_MS,
      attempts: 0
    });

    await transporter.sendMail({
      from: "Sonara Pack <luca.dida17@gmail.com>",
      to: normalizedMail,
      subject: "Code de connexion Sonara Pack",
      html: `<div style="font-family:Arial,sans-serif;background:#080b12;color:white;padding:30px;border-radius:16px"><h1 style="color:#7ddcff">Connexion à votre compte</h1><p>Votre code Sonara Pack est :</p><p style="font-size:34px;font-weight:700;letter-spacing:8px">${code}</p><p>Ce code expire dans 10 minutes.</p></div>`
    });

    return res.json({ success: true, message: "Code envoyé." });
  } catch (error) {
    console.error("Erreur envoi code connexion :", error);
    return res.status(500).json({
      success: false,
      error: "Impossible d'envoyer le code."
    });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const { mail, password, phone, verificationToken } = req.body || {};
    const normalizedMail = normalizeMail(mail);
    const normalizedPhone = normalizeLoginPhone(phone);

    if (!normalizedMail || !password || !normalizedPhone || !verificationToken) {
      return res.status(400).json({
        success: false,
        error: "Informations de connexion incomplètes."
      });
    }

    if (!consumeVerifiedToken({
      token: verificationToken,
      mail: normalizedMail,
      purpose: "login"
    })) {
      return res.status(403).json({
        success: false,
        error: "Vérification e-mail obligatoire ou expirée."
      });
    }

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    let rootUser = null;
    let account = null;

    for (const currentRootUser of users) {
      const foundAccount = currentRootUser.accounts?.find(
        (currentAccount) =>
          normalizeMail(currentAccount.mail) === normalizedMail &&
          currentAccount.password === password &&
          String(currentAccount.phone || "").trim() === normalizedPhone
      );

      if (foundAccount) {
        rootUser = currentRootUser;
        account = foundAccount;
        break;
      }
    }

    if (!account) {
      return res.status(401).json({
        success: false,
        error: "Les informations de connexion sont incorrectes."
      });
    }

    const legacyArtistBlocked =
      String(account.role || "").toLowerCase() === "both" &&
      ["rejected", "banned"].includes(
        String(account.status || "").toLowerCase()
      );

    if (legacyArtistBlocked) {
      account.artistStatus = account.artistStatus || account.status;
      account.artistModeratedAt =
        account.artistModeratedAt ||
        account.moderatedAt ||
        new Date().toISOString();
      account.role = "user";
      account.status = "approved";
      account.updatedAt = new Date().toISOString();

      fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2)
      );
    }

    let redirectTo = "/home.html";

    if (
      account.role === "artist" ||
      account.role === "both"
    ) {
      redirectTo = "/app/pages/creator/dashboard.html";
    }

    const returnedAccount = sanitizeAccount(account, rootUser.id);

    return res.status(200).json({
      success: true,
      account: returnedAccount,
      redirectTo
    });
  } catch (error) {
    console.error(
      "Erreur POST /api/login :",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Connexion impossible."
    });
  }
});


/* =========================
   LISTE ET CHANGEMENT DE COMPTE
========================= */

app.post("/api/accounts/list", (req, res) => {
  try {
    const { userId, currentAccountId } = req.body || {};
    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const rootUser = users.find((item) => String(item.id) === String(userId));
    const currentAccount = rootUser?.accounts?.find((item) => String(item.accountId) === String(currentAccountId));

    if (!rootUser || !currentAccount) {
      return res.status(403).json({ success: false, error: "Session non autorisée." });
    }

    const accounts = rootUser.accounts.map((item) => {
      return sanitizeAccount(item, rootUser.id);
    });

    return res.json({ success: true, accounts });
  } catch (error) {
    console.error("Erreur POST /api/accounts/list :", error);
    return res.status(500).json({ success: false, error: "Chargement des comptes impossible." });
  }
});

app.post("/api/accounts/switch", (req, res) => {
  try {
    const { userId, currentAccountId, targetAccountId } = req.body || {};
    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const rootUser = users.find((item) => String(item.id) === String(userId));
    const currentAccount = rootUser?.accounts?.find((item) => String(item.accountId) === String(currentAccountId));
    const targetAccount = rootUser?.accounts?.find((item) => String(item.accountId) === String(targetAccountId));

    if (!rootUser || !currentAccount || !targetAccount) {
      return res.status(403).json({ success: false, error: "Ce compte n'appartient pas à votre profil principal." });
    }

    const profile = sanitizeAccount(targetAccount, rootUser.id);

    let redirectTo = "/home.html";
    if (targetAccount.status === "pending") redirectTo = "/app/pages/auth/pending.html";
    else if (targetAccount.role === "artist" || targetAccount.role === "both") redirectTo = "/app/pages/creator/dashboard.html";

    return res.json({ success: true, profile, account: profile, redirectTo });
  } catch (error) {
    console.error("Erreur POST /api/accounts/switch :", error);
    return res.status(500).json({ success: false, error: "Changement de compte impossible." });
  }
});

app.post("/api/accounts/login/send-code", async (req, res) => {
  try {
    cleanupVerificationStores();

    const { mail, password, phone } = req.body || {};
    const normalizedMail = normalizeMail(mail);

    if (!normalizedMail || !password || !String(phone || "").trim()) {
      return res.status(400).json({
        success: false,
        error: "L'adresse e-mail, le mot de passe et le téléphone sont obligatoires."
      });
    }

    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    let targetAccount = null;

    for (const rootUser of users) {
      targetAccount = rootUser.accounts?.find((item) =>
        normalizeMail(item.mail) === normalizedMail &&
        item.password === password &&
        normalizeLoginPhone(item.phone) === normalizeLoginPhone(phone)
      );

      if (targetAccount) break;
    }

    if (!targetAccount) {
      return res.status(403).json({
        success: false,
        error: "Les informations de connexion sont incorrectes."
      });
    }

    const code = createVerificationCode();
    const key = createVerificationKey(normalizedMail, "login-existing");

    verificationCodes.set(key, {
      code,
      expiresAt: Date.now() + VERIFICATION_CODE_TTL_MS,
      attempts: 0
    });

    await transporter.sendMail({
      from: "Sonara Pack <luca.dida17@gmail.com>",
      to: normalizedMail,
      subject: "Code de connexion Sonara Pack",
      html: `<div style="font-family:Arial,sans-serif;background:#080b12;color:white;padding:30px;border-radius:16px"><h1 style="color:#7ddcff">Connexion à votre compte</h1><p>Votre code Sonara Pack est :</p><p style="font-size:34px;font-weight:700;letter-spacing:8px">${code}</p><p>Ce code expire dans 10 minutes.</p></div>`
    });

    return res.json({ success: true, message: "Code envoyé." });
  } catch (error) {
    console.error("Erreur envoi code connexion compte :", error);
    return res.status(500).json({ success: false, error: "Impossible d'envoyer le code." });
  }
});

/* =========================
   CONNEXION À UN COMPTE EXISTANT
========================= */

app.post("/api/accounts/login", (req, res) => {
  try {
    const { mail, password, phone, verificationToken } = req.body || {};
    const normalizedMail = normalizeMail(mail);

    if (!normalizedMail || !password || !String(phone || "").trim()) {
      return res.status(400).json({
        success: false,
        error: "Informations de connexion incomplètes."
      });
    }

    if (!consumeVerifiedToken({
      token: verificationToken,
      mail: normalizedMail,
      purpose: "login-existing"
    })) {
      return res.status(403).json({
        success: false,
        error: "Vérification e-mail obligatoire ou expirée."
      });
    }

    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    let rootUser = null;
    let account = null;

    for (const currentRootUser of users) {
      const foundAccount = currentRootUser.accounts?.find((item) =>
        normalizeMail(item.mail) === normalizedMail &&
        item.password === password &&
        normalizeLoginPhone(item.phone) === normalizeLoginPhone(phone)
      );

      if (foundAccount) {
        rootUser = currentRootUser;
        account = foundAccount;
        break;
      }
    }

    if (!rootUser || !account) {
      return res.status(403).json({
        success: false,
        error: "Les informations de connexion sont incorrectes."
      });
    }

    const returnedAccount = sanitizeAccount(account, rootUser.id);

    let redirectTo = "/home.html";
    if (account.status === "pending") redirectTo = "/app/pages/auth/pending.html";
    else if (account.role === "artist" || account.role === "both") {
      redirectTo = "/app/pages/creator/dashboard.html";
    }

    return res.status(200).json({
      success: true,
      profile: returnedAccount,
      account: returnedAccount,
      redirectTo
    });
  } catch (error) {
    console.error("Erreur POST /api/accounts/login :", error);
    return res.status(500).json({ success: false, error: "Connexion au compte impossible." });
  }
});

 app.post("/api/stripe/connect-account", async (req, res) => {
  try {
    const { artistId, email } = req.body;

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    let rootUser = null;
    let accountProfile = null;

    for (const currentRootUser of users) {
      const foundAccount = currentRootUser.accounts?.find(
        (currentAccount) =>
          String(currentAccount.id) === String(artistId) ||
          String(currentAccount.accountId) === String(artistId)
      );

      if (foundAccount) {
        rootUser = currentRootUser;
        accountProfile = foundAccount;

        break;
      }
    }

    if (!accountProfile) {
      return res.status(404).json({
        error: "Utilisateur introuvable."
      });
    }

    if (
      accountProfile.role !== "artist" &&
      accountProfile.role !== "both"
    ) {
      return res.status(403).json({
        error:
          "Seuls les artistes peuvent créer un compte Stripe."
      });
    }

    if (accountProfile.stripeAccountId) {
      const existingStripeAccount =
        await stripe.accounts.retrieve(
          accountProfile.stripeAccountId
        );

      const existingStatus =
        existingStripeAccount.charges_enabled &&
        existingStripeAccount.payouts_enabled
          ? "verified"
          : "onboarding_started";

      accountProfile.stripeStatus = existingStatus;
      accountProfile.updatedAt = new Date().toISOString();
      rootUser.updatedAt = new Date().toISOString();

      fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2)
      );

      if (existingStatus === "verified") {
        const loginLink =
          await stripe.accounts.createLoginLink(
            accountProfile.stripeAccountId
          );

        return res.status(200).json({
          success: true,
          reused: true,
          accountId: accountProfile.stripeAccountId,
          stripeStatus: existingStatus,
          url: loginLink.url
        });
      }

      const existingAccountLink =
        await stripe.accountLinks.create({
          account: accountProfile.stripeAccountId,
          refresh_url:
            `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html`,
          return_url:
            `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html?stripe=success`,
          type: "account_onboarding"
        });

      return res.status(200).json({
        success: true,
        reused: true,
        accountId: accountProfile.stripeAccountId,
        stripeStatus: existingStatus,
        url: existingAccountLink.url
      });
    }

    const stripeAccount = await stripe.accounts.create({
      type: "express",
      country: "FR",
      email: email || accountProfile.mail,

      capabilities: {
        card_payments: {
          requested: true
        },

        transfers: {
          requested: true
        }
      }
    });

    accountProfile.stripeAccountId =
      stripeAccount.id;

    accountProfile.stripeStatus =
      "onboarding_started";

    accountProfile.updatedAt =
      new Date().toISOString();

    rootUser.updatedAt =
      new Date().toISOString();

    fs.writeFileSync(
      usersPath,
      JSON.stringify(users, null, 2)
    );

    const accountLink =
      await stripe.accountLinks.create({
        account: stripeAccount.id,

        refresh_url:
          `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html`,

        return_url:
          `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html?stripe=success`,

        type: "account_onboarding"
      });

    return res.status(200).json({
      success: true,
      accountId: stripeAccount.id,
      stripeStatus: accountProfile.stripeStatus,
      url: accountLink.url
    });

  } catch (error) {
    console.error(
      "STRIPE CONNECT ERROR :",
      error
    );

    return res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/stripe/continue-onboarding", async (req, res) => {
  try {
    const { artistId } = req.body;

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    let rootUser = null;
    let artist = null;

    for (const currentRootUser of users) {
      const foundAccount =
        currentRootUser.accounts?.find(
          (currentAccount) =>
            String(currentAccount.id) === String(artistId) ||
            String(currentAccount.accountId) === String(artistId)
        );

      if (foundAccount) {
        rootUser = currentRootUser;
        artist = foundAccount;
        break;
      }
    }

    if (!artist || !artist.stripeAccountId) {
      return res.status(404).json({
        error: "Compte Stripe introuvable."
      });
    }

    const accountLink =
      await stripe.accountLinks.create({
        account: artist.stripeAccountId,

        refresh_url:
          `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html`,

        return_url:
          `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html?stripe=success`,

        type: "account_onboarding"
      });

    rootUser.updatedAt =
      new Date().toISOString();

    return res.status(200).json({
      success: true,
      url: accountLink.url
    });

  } catch (error) {
    console.error(
      "STRIPE CONTINUE ONBOARDING ERROR :",
      error
    );

    return res.status(500).json({
      error: error.message
    });
  }
});


app.post("/api/stripe/login-link", async (req, res) => {
  try {
    const { artistId } = req.body || {};

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    let artist = null;

    for (const rootUser of users) {
      artist = rootUser.accounts?.find(
        (account) =>
          String(account.id) === String(artistId) ||
          String(account.accountId) === String(artistId)
      );

      if (artist) break;
    }

    if (!artist?.stripeAccountId) {
      return res.status(404).json({
        success: false,
        error: "Compte Stripe introuvable."
      });
    }

    const loginLink =
      await stripe.accounts.createLoginLink(
        artist.stripeAccountId
      );

    return res.status(200).json({
      success: true,
      url: loginLink.url
    });
  } catch (error) {
    console.error("STRIPE LOGIN LINK ERROR :", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/stripe/account-status", async (req, res) => {
  try {
    const { artistId } = req.body;

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    let rootUser = null;
    let artist = null;

    for (const currentRootUser of users) {
      const foundAccount =
        currentRootUser.accounts?.find(
          (currentAccount) =>
            String(currentAccount.id) === String(artistId) ||
            String(currentAccount.accountId) === String(artistId)
        );

      if (foundAccount) {
        rootUser = currentRootUser;
        artist = foundAccount;
        break;
      }
    }

    if (!artist || !artist.stripeAccountId) {
      return res.status(404).json({
        error: "Compte Stripe introuvable."
      });
    }

    const stripeAccount =
      await stripe.accounts.retrieve(
        artist.stripeAccountId
      );

    artist.stripeStatus =
      stripeAccount.charges_enabled &&
      stripeAccount.payouts_enabled
        ? "verified"
        : "onboarding_started";

    artist.updatedAt =
      new Date().toISOString();

    rootUser.updatedAt =
      new Date().toISOString();

    fs.writeFileSync(
      usersPath,
      JSON.stringify(users, null, 2)
    );

    return res.status(200).json({
      success: true,
      stripeStatus: artist.stripeStatus,
      stripeAccountId: artist.stripeAccountId,
      chargesEnabled: stripeAccount.charges_enabled,
      payoutsEnabled: stripeAccount.payouts_enabled,
      detailsSubmitted: stripeAccount.details_submitted,
      requirementsCurrentlyDue:
        stripeAccount.requirements?.currently_due || []
    });

  } catch (error) {
    console.error(
      "STRIPE ACCOUNT STATUS ERROR :",
      error
    );

    return res.status(500).json({
      error: error.message
    });
  }
});


app.post("/api/add-downloaded-pack", (_req, res) => {
  return res.status(410).json({
    success: false,
    code: "LEGACY_DOWNLOAD_ROUTE_DISABLED",
    message: "Cette ancienne route de téléchargement est désactivée. Utilisez le parcours avec acceptation de licence."
  });
});

app.post("/api/add-downloaded-track", (_req, res) => {
  return res.status(410).json({
    success: false,
    code: "LEGACY_DOWNLOAD_ROUTE_DISABLED",
    message: "Cette ancienne route de téléchargement est désactivée. Utilisez le parcours avec acceptation de licence."
  });
});

app.get("/api/pending-users", requireFounderKey, (req, res) => {
  try {
    const rootUsers = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    const pendingAccounts = [];

    for (const rootUser of rootUsers) {
      if (!Array.isArray(rootUser.accounts)) {
        continue;
      }

      for (const account of rootUser.accounts) {
        if (account.status !== "pending") {
          continue;
        }

        pendingAccounts.push(sanitizeAccount(account, rootUser.id));
      }
    }

    return res.status(200).json(
      pendingAccounts
    );

  } catch (error) {
    console.error(
      "Erreur GET /api/pending-users :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les comptes en attente."
    });
  }
});


app.get("/api/users/:id", (req, res) => {
  try {
    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    const requestedId = String(req.params.id);

    let rootUser = null;
    let account = null;

    for (const currentRootUser of users) {
      const foundAccount =
        currentRootUser.accounts?.find(
          (currentAccount) =>
            String(currentAccount.id) === requestedId ||
            String(currentAccount.accountId) === requestedId
        );

      if (foundAccount) {
        rootUser = currentRootUser;
        account = foundAccount;
        break;
      }
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    const returnedAccount = sanitizeAccount(account, rootUser.id);

    return res.status(200).json({
      success: true,
      account: returnedAccount
    });

  } catch (error) {
    console.error(
      "Erreur GET /api/users/:id :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer l'utilisateur."
    });
  }
});

app.patch("/api/users/:id/status", requireFounderKey, (req, res) => {
  try {
    const requestedId = String(req.params.id);

    const { status } = req.body;

    const users = JSON.parse(
      fs.readFileSync(usersPath, "utf8")
    );

    let rootUser = null;
    let account = null;

    for (const currentRootUser of users) {
      const foundAccount =
        currentRootUser.accounts?.find(
          (currentAccount) =>
            String(currentAccount.id) === requestedId ||
            String(currentAccount.accountId) === requestedId
        );

      if (foundAccount) {
        rootUser = currentRootUser;
        account = foundAccount;
        break;
      }
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    const moderatedAt = new Date().toISOString();

    if (status === "rejected" && !account.originalRole) {
      account.originalRole = String(account.role || "user").toLowerCase();
    }

    if (
      status === "rejected" &&
      String(account.role || "").toLowerCase() === "both"
    ) {
      account.artistStatus = "rejected";
      account.artistModeratedAt = moderatedAt;
      account.role = "user";
      account.status = "approved";
    } else {
      account.status = status;
    }

    account.moderatedAt = moderatedAt;
    account.updatedAt = moderatedAt;

    rootUser.updatedAt =
      new Date().toISOString();

    fs.writeFileSync(
      usersPath,
      JSON.stringify(users, null, 2),
      "utf8"
    );

    if (status === "rejected") {
      createModerationDecisionNotice({
        accountId: account.accountId || account.id,
        decisionType: "artist_rejection",
        reason: req.body?.reason,
        initialDecision: "rejected",
        environment: "local"
      });
    }

    const returnedAccount = sanitizeAccount(account, rootUser.id);

    return res.status(200).json({
      success: true,
      message: `Utilisateur ${status}`,
      account: returnedAccount
    });

  } catch (error) {
    console.error(
      "Erreur PATCH /api/users/:id/status :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de modifier le statut."
    });
  }
});

app.patch(
  "/api/profile",
  upload.single("imageProfile"),
  async (req, res) => {
    try {
      const id = String(req.body.id || "");

      const pseudo =
        req.body.pseudo?.trim();

      const biography =
        String(req.body.biography || "").trim();

      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant utilisateur introuvable."
        });
      }

      if (!pseudo) {
        return res.status(400).json({
          success: false,
          message:
            "Le pseudo ne peut pas être vide."
        });
      }

      if (pseudo.length > 30) {
        return res.status(400).json({
          success: false,
          message:
            "Le pseudo ne peut pas dépasser 30 caractères."
        });
      }

      if (biography.length > 500) {
        return res.status(400).json({
          success: false,
          message:
            "La biographie ne peut pas dépasser 500 caractères."
        });
      }

      const users = JSON.parse(
        fs.readFileSync(usersPath, "utf8")
      );

      let rootUser = null;
      let account = null;

      for (const currentRootUser of users) {
        const foundAccount =
          currentRootUser.accounts?.find(
            (currentAccount) =>
              String(currentAccount.id) === id ||
              String(currentAccount.accountId) === id
          );

        if (foundAccount) {
          rootUser = currentRootUser;
          account = foundAccount;
          break;
        }
      }

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      account.pseudo = pseudo;
      account.biography = biography;

      account.updatedAt =
        new Date().toISOString();

      rootUser.updatedAt =
        new Date().toISOString();

      if (req.file) {
        account.imageProfile =
          req.file.filename;
      }

      fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2),
        "utf8"
      );

      const updatedProfile = {
        ...account,
        userId: rootUser.id
      };

      delete updatedProfile.password;

      return res.status(200).json({
        success: true,
        message:
          "Profil mis à jour avec succès.",
        profile: updatedProfile
      });

    } catch (error) {
      console.error(
        "Erreur PATCH /api/profile :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de modifier le profil."
      });
    }
  }
);


/* =========================
   FOUNDER — ACCOUNT SYNC QUEUE
========================= */

const SONARA_FOUNDER_SYNC_ENVIRONMENT = "local";

function createFounderAccountSyncSnapshot(
  account = {},
  rootUser = {}
) {
  return {
    id: String(
      account.id ||
      account.accountId ||
      ""
    ),
    accountId: String(
      account.accountId ||
      account.id ||
      ""
    ),
    userId: String(
      rootUser.id ||
      rootUser.userId ||
      account.userId ||
      ""
    ),
    firstname: String(account.firstname || ""),
    lastname: String(account.lastname || ""),
    date: String(account.date || ""),
    phone: String(account.phone || ""),
    mail: String(
      account.mail ||
      account.email ||
      ""
    ),
    pseudo: String(account.pseudo || ""),
    artistname: String(account.artistname || ""),
    role: String(account.role || ""),
    status: String(account.status || ""),
    artistStatus:
      account.artistStatus || null,
    imageArtist:
      account.imageArtist || null,
    updatedAt:
      account.updatedAt ||
      new Date().toISOString()
  };
}

function getChangedFounderAccountFields(
  previousValues = {},
  nextValues = {}
) {
  return Object.keys(nextValues).filter(
    (field) =>
      String(previousValues[field] ?? "") !==
      String(nextValues[field] ?? "")
  );
}

function queueFounderAccountSync({
  rootUser,
  account,
  changeType,
  changedFields = [],
  previousValues = {}
}) {
  const normalizedFields = [
    ...new Set(
      changedFields
        .map((field) => String(field || "").trim())
        .filter(Boolean)
    )
  ];

  if (!normalizedFields.length) {
    return null;
  }

  const now = new Date().toISOString();
  const previousSync =
    account.founderSync &&
    account.founderSync.pending === true
      ? account.founderSync
      : null;

  const previousChangeTypes =
    Array.isArray(previousSync?.changeTypes)
      ? previousSync.changeTypes
      : [];

  const previousChangedFields =
    Array.isArray(previousSync?.changedFields)
      ? previousSync.changedFields
      : [];

  const preservedPreviousValues = {
    ...previousValues,
    ...(previousSync?.previousValues || {})
  };

  account.updatedAt = now;
  rootUser.updatedAt = now;

  account.founderSync = {
    pending: true,
    eventId:
      `account_change_${Date.now()}_${crypto
        .randomBytes(4)
        .toString("hex")}`,
    revision:
      Number(previousSync?.revision || 0) + 1,
    environment:
      SONARA_FOUNDER_SYNC_ENVIRONMENT,
    source: "sonara-pack",
    changeTypes: [
      ...new Set([
        ...previousChangeTypes,
        String(changeType || "account")
      ])
    ],
    changedFields: [
      ...new Set([
        ...previousChangedFields,
        ...normalizedFields
      ])
    ],
    previousValues:
      preservedPreviousValues,
    account:
      createFounderAccountSyncSnapshot(
        account,
        rootUser
      ),
    queuedAt:
      previousSync?.queuedAt || now,
    updatedAt: now,
    containsPassword: false
  };

  return account.founderSync;
}

function createFounderSyncResponse(sync) {
  return sync
    ? {
        queued: true,
        eventId: sync.eventId,
        revision: sync.revision
      }
    : {
        queued: false,
        reason: "no_change"
      };
}

app.patch(
  "/api/account/password",
  async (req, res) => {
    try {
      const id = String(req.body.id || "");

      const currentPassword =
        req.body.currentPassword;

      const newPassword =
        req.body.newPassword;

      if (
        !id ||
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          success: false,
          message: "Informations manquantes."
        });
      }

      const users = JSON.parse(
        fs.readFileSync(usersPath, "utf8")
      );

      let rootUser = null;
      let account = null;

      for (const currentRootUser of users) {
        const foundAccount =
          currentRootUser.accounts?.find(
            (currentAccount) =>
              String(currentAccount.id) === id ||
              String(currentAccount.accountId) === id
          );

        if (foundAccount) {
          rootUser = currentRootUser;
          account = foundAccount;
          break;
        }
      }

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      if (
        account.password !== currentPassword
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Mot de passe actuel incorrect."
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message:
            "Le nouveau mot de passe doit contenir au moins 8 caractères."
        });
      }

      account.password = newPassword;

      const founderSync =
        queueFounderAccountSync({
          rootUser,
          account,
          changeType: "password",
          changedFields: ["password"]
        });

      fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2),
        "utf8"
      );

      return res.status(200).json({
        success: true,
        message: "Mot de passe modifié.",
        founderSync:
          createFounderSyncResponse(
            founderSync
          )
      });

    } catch (error) {
      console.error(
        "Erreur PATCH /api/account/password :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de modifier le mot de passe."
      });
    }
  }
);

app.patch(
  "/api/account/informations",
  (req, res) => {
    try {
      const id = String(req.body.id || "");

      const firstname =
        req.body.firstname?.trim();

      const lastname =
        req.body.lastname?.trim();

      const date =
        req.body.date || "";

      const phone =
        req.body.phone?.trim() || "";

      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant utilisateur introuvable."
        });
      }

      if (!firstname || !lastname) {
        return res.status(400).json({
          success: false,
          message:
            "Le prénom et le nom sont obligatoires."
        });
      }

      const users = JSON.parse(
        fs.readFileSync(usersPath, "utf8")
      );

      let rootUser = null;
      let account = null;

      for (const currentRootUser of users) {
        const foundAccount =
          currentRootUser.accounts?.find(
            (currentAccount) =>
              String(currentAccount.id) === id ||
              String(currentAccount.accountId) === id
          );

        if (foundAccount) {
          rootUser = currentRootUser;
          account = foundAccount;
          break;
        }
      }

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      const previousValues = {
        firstname: account.firstname || "",
        lastname: account.lastname || "",
        date: account.date || "",
        phone: account.phone || ""
      };

      const nextValues = {
        firstname,
        lastname,
        date,
        phone
      };

      const changedFields =
        getChangedFounderAccountFields(
          previousValues,
          nextValues
        );

      account.firstname = firstname;
      account.lastname = lastname;
      account.date = date;
      account.phone = phone;

      const founderSync =
        queueFounderAccountSync({
          rootUser,
          account,
          changeType: "informations",
          changedFields,
          previousValues
        });

      fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2),
        "utf8"
      );

      const updatedAccount = {
        ...account,
        userId: rootUser.id
      };

      delete updatedAccount.password;

      delete updatedAccount.founderSync;

      return res.status(200).json({
        success: true,
        message:
          "Informations du compte modifiées.",
        account: updatedAccount,
        founderSync:
          createFounderSyncResponse(
            founderSync
          )
      });

    } catch (error) {
      console.error(
        "Erreur PATCH /api/account/informations :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de modifier les informations du compte."
      });
    }
  }
);

app.patch(
  "/api/account/email",
  (req, res) => {
    try {
      const id = String(req.body.id || "");

      const newMail =
        req.body.newMail
          ?.trim()
          .toLowerCase();

      const currentPassword =
        req.body.currentPassword;

      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            "Identifiant utilisateur introuvable."
        });
      }

      if (!newMail || !currentPassword) {
        return res.status(400).json({
          success: false,
          message:
            "Veuillez remplir tous les champs."
        });
      }

      const users = JSON.parse(
        fs.readFileSync(usersPath, "utf8")
      );

      let rootUser = null;
      let account = null;

      for (const currentRootUser of users) {
        const foundAccount =
          currentRootUser.accounts?.find(
            (currentAccount) =>
              String(currentAccount.id) === id ||
              String(currentAccount.accountId) === id
          );

        if (foundAccount) {
          rootUser = currentRootUser;
          account = foundAccount;
          break;
        }
      }

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      if (
        account.password !== currentPassword
      ) {
        return res.status(401).json({
          success: false,
          message: "Mot de passe incorrect."
        });
      }

      const mailAlreadyUsed = users.some(
        (currentRootUser) =>
          currentRootUser.accounts?.some(
            (currentAccount) =>
              String(currentAccount.accountId) !==
                String(account.accountId) &&
              currentAccount.mail
                ?.trim()
                .toLowerCase() === newMail
          )
      );

      if (mailAlreadyUsed) {
        return res.status(409).json({
          success: false,
          message:
            "Cette adresse e-mail est déjà utilisée."
        });
      }

      const previousValues = {
        mail: account.mail || ""
      };

      const changedFields =
        getChangedFounderAccountFields(
          previousValues,
          { mail: newMail }
        );

      account.mail = newMail;

      const founderSync =
        queueFounderAccountSync({
          rootUser: rootUser,
          account,
          changeType: "email",
          changedFields,
          previousValues
        });

      fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2),
        "utf8"
      );

      const updatedAccount = {
        ...account,
        userId: rootUser.id
      };

      delete updatedAccount.password;

      delete updatedAccount.founderSync;

      return res.status(200).json({
        success: true,
        message: "Adresse e-mail modifiée.",
        account: updatedAccount,
        founderSync:
          createFounderSyncResponse(
            founderSync
          )
      });

    } catch (error) {
      console.error(
        "Erreur PATCH /api/account/email :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de modifier l'adresse e-mail."
      });
    }
  }
);



/* =========================
   CREATOR — MES PACKS
========================= */

function creatorPackPrice(value) {
  const parsed = Number(String(value ?? 0).replace("€", "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function creatorPackBelongsTo(pack, accountId) {
  return [pack?.artistId, pack?.accountId, pack?.artistAccountId]
    .filter(Boolean)
    .some((value) => String(value) === String(accountId));
}

function isPackHiddenByModeration(pack) {
  return Boolean(
    pack?.moderationHidden === true ||
    String(pack?.status || "").toLowerCase() === "moderation_hidden"
  );
}

function isCreatorAccountActive(account) {
  const role = String(account?.role || "").toLowerCase();
  const status = String(account?.status || "").toLowerCase();
  const artistStatus = String(account?.artistStatus || "").toLowerCase();

  return (
    ["artist", "both"].includes(role) &&
    status === "approved" &&
    !["banned", "suspended", "rejected"].includes(artistStatus)
  );
}

function creatorPackWasPublished(pack) {
  return Boolean(
    pack?.wasPublished ||
    pack?.publishedAt ||
    String(pack?.status || "").toLowerCase() === "approved"
  );
}

async function fetchCreatorStripeSales(artistIds) {
  if (!commercialPolicy.stripeEnabled) return [];
  const acceptedArtistIds = new Set(
    (Array.isArray(artistIds) ? artistIds : [artistIds])
      .filter(Boolean)
      .map((value) => String(value))
  );
  const sales = [];
  let startingAfter;

  do {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ["data.payment_intent"]
    });

    for (const session of page.data) {
      const metadata = session.metadata || {};
      if (
        session.mode !== "payment" ||
        session.payment_status !== "paid" ||
        !acceptedArtistIds.has(String(metadata.artistId || ""))
      ) {
        continue;
      }

      let paymentIntent = session.payment_intent;
      if (typeof paymentIntent === "string") {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent);
      }

      const amountTotal = Number(
        session.amount_total ?? paymentIntent?.amount_received ?? 0
      );
      const applicationFee = Number(
        paymentIntent?.application_fee_amount ?? 0
      );
      const artistRevenue = Math.max(0, amountTotal - applicationFee);
      const buyerId = String(
        metadata.userId ||
        session.customer_details?.email ||
        session.customer_email ||
        session.customer ||
        session.id
      );

      sales.push({
        sessionId: session.id,
        packId: String(metadata.packId || ""),
        trackId: String(metadata.trackId || ""),
        buyerId,
        amountTotal,
        applicationFee,
        artistRevenue,
        paidAt: session.created ? new Date(session.created * 1000).toISOString() : null
      });
    }

    startingAfter = page.has_more && page.data.length
      ? page.data[page.data.length - 1].id
      : null;
  } while (startingAfter);

  return sales;
}


async function buildCreatorPackOverviewLocal(accountId, artistIds = [accountId]) {
  const packs = readJsonArray(packsPath);
  const creatorPacks = packs.filter((pack) =>
    creatorPackBelongsTo(pack, accountId) &&
    !isPackHiddenByModeration(pack) &&
    commercialPolicy.canAccessContentType(pack?.contentType)
  );
  const acquisitionAnalytics = buildCreatorAcquisitionAnalytics(
    readJsonArray(usersPath),
    creatorPacks
  );
  let stripeSales = [];
  let stripeStatsAvailable = true;

  try {
    stripeSales = await fetchCreatorStripeSales(artistIds);
  } catch (error) {
    stripeStatsAvailable = false;
    console.error("Erreur statistiques Stripe Creator :", error);
  }

  const enriched = creatorPacks.map((pack) => {
    const packSales = stripeSales.filter(
      (sale) => String(sale.packId) === String(pack.id)
    );
    const buyers = new Set(packSales.map((sale) => sale.buyerId));
    const revenueCents = packSales.reduce(
      (sum, sale) => sum + sale.artistRevenue,
      0
    );
    const downloads = acquisitionAnalytics.byPack[String(pack.id)] || {
      downloadCount: 0,
      packDownloadCount: 0,
      trackDownloadCount: 0,
      uniqueDownloaders: 0
    };

    return {
      ...pack,
      license: normalizePackLicense(pack.license),
      licenseSummary: licenseModerationSummary(pack),
      trackCount: Array.isArray(pack.tracks) ? pack.tracks.length : 0,
      resourceCount: Array.isArray(pack.resources) ? pack.resources.length : 0,
      ...downloads,
      salesCount: packSales.length,
      buyerCount: buyers.size,
      revenue: Number((revenueCents / 100).toFixed(2))
    };
  });

  return {
    packs: enriched.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
    ),
    stats: {
      packCount: enriched.length,
      publishedCount: enriched.filter((pack) => pack.status === "approved").length,
      ...acquisitionAnalytics.totals,
      salesCount: stripeSales.length,
      buyerCount: new Set(stripeSales.map((sale) => sale.buyerId)).size,
      revenue: Number(
        (stripeSales.reduce((sum, sale) => sum + sale.artistRevenue, 0) / 100).toFixed(2)
      ),
      stripeStatsAvailable
    },
    recentAcquisitions: acquisitionAnalytics.recentAcquisitions,
    commercialState: commercialPolicy.publicState()
  };
}

app.get("/api/creator/packs/:accountId", async (req, res) => {
  try {
    const accountId = String(req.params.accountId || "").trim();
    const users = readJsonArray(usersPath);
    let rootUser = null;
    let account = null;
    for (const currentRootUser of users) {
      const found = (currentRootUser.accounts || []).find(
        (item) => String(item.accountId || item.id) === accountId
      );
      if (found) {
        rootUser = currentRootUser;
        account = found;
        break;
      }
    }
    if (!account || !isCreatorAccountActive(account)) return res.status(403).json({ success: false, message: "Compte artiste indisponible ou sanctionné." });
    const artistIds = [account.accountId, account.id, rootUser?.id].filter(Boolean);
    return res.json({ success: true, ...(await buildCreatorPackOverviewLocal(accountId, artistIds)) });
  } catch (error) {
    console.error("Erreur GET /api/creator/packs/:accountId :", error);
    return res.status(500).json({ success: false, message: "Impossible de récupérer les packs de l’artiste." });
  }
});


app.patch("/api/creator/packs/:id/license", async (req, res) => {
  try {
    const packId = String(req.params.id || "").trim();
    const accountId = String(req.body?.accountId || "").trim();
    const submittedLicense = req.body?.license;

    if (!packId || !accountId || !submittedLicense || typeof submittedLicense !== "object") {
      return res.status(400).json({
        success: false,
        message: "Pack, compte artiste ou licence manquant."
      });
    }

    const packs = readJsonArray(packsPath);
    const index = packs.findIndex((pack) => String(pack.id) === packId);

    if (index < 0) {
      return res.status(404).json({ success: false, message: "Pack introuvable." });
    }

    const pack = packs[index];
    if (isPackHiddenByModeration(pack)) {
      return res.status(403).json({
        success: false,
        message: "Ce pack est masqué par une décision de modération."
      });
    }

    if (!creatorPackBelongsTo(pack, accountId)) {
      return res.status(403).json({
        success: false,
        message: "Ce pack ne vous appartient pas."
      });
    }

    if (!commercialPolicy.canAccessContentType(pack?.contentType)) {
      return res.status(403).json({
        success: false,
        code: "V1_FEATURE_LOCKED",
        message: "Cette ressource sera disponible lors du lancement de la V1."
      });
    }

    const now = new Date().toISOString();
    const hadStoredLicense = Boolean(pack.license && typeof pack.license === "object");
    const update = buildUpdatedPackLicense(pack.license, submittedLicense, {
      hasCurrent: hadStoredLicense,
      packId,
      accountId,
      now
    });

    if (!update.changed) {
      return res.json({
        success: true,
        changed: false,
        moderationRequired: false,
        message: "La licence est déjà à jour.",
        pack: {
          ...pack,
          license: normalizePackLicense(pack.license)
        }
      });
    }

    if (hadStoredLicense) {
      await licenseProtection.archiveLicense({ ...pack, license: pack.license }, now);
      pack.licenseHistory = appendPackLicenseHistory(
        pack.licenseHistory,
        pack.license,
        { archivedAt: now, reason: "creator_license_update" }
      );
    } else if (!Array.isArray(pack.licenseHistory)) {
      pack.licenseHistory = [];
    }

    pack.license = update.license;
    pack.licenseUpdatedAt = now;
    pack.updatedAt = now;

    // Un pack déjà publié reste publié : seule sa licence courante change.
    // Un pack encore en modération reste dans sa modération initiale.
    writeJsonArray(packsPath, packs);
    const newLicenseSnapshot = await licenseProtection.archiveLicense(pack, now);
    await licenseProtection.audit("LICENSE_VERSION_UPDATED", {
      artistId: accountId,
      packId,
      licenseSnapshotId: newLicenseSnapshot.id,
      licenseVersion: newLicenseSnapshot.licenseVersion,
      licenseHash: newLicenseSnapshot.licenseHash,
      createdAt: now
    });

    return res.json({
      success: true,
      changed: true,
      moderationRequired: false,
      message: "Licence enregistrée et mise à jour côté acheteur.",
      pack: {
        ...pack,
        license: normalizePackLicense(pack.license),
        licenseSummary: licenseModerationSummary(pack)
      }
    });
  } catch (error) {
    console.error("Erreur PATCH /api/creator/packs/:id/license :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d’enregistrer la licence du pack."
    });
  }
});

app.patch("/api/creator/packs/:id", handlePackRevisionUpload, async (req, res) => {
  const uploadedFiles = Array.isArray(req.files)
    ? req.files.map((file) => file.path)
    : [];
  const stagedZipPaths = [];
  const replacedZipTargets = [];
  let revisionPersisted = false;

  try {
    const packId = String(req.params.id || "");
    const accountId = String(req.body?.accountId || "");
    const packs = readJsonArray(packsPath);
    const index = packs.findIndex((pack) => String(pack.id) === packId);

    if (index < 0) {
      return res.status(404).json({ success: false, message: "Pack introuvable." });
    }

    if (isPackHiddenByModeration(packs[index])) {
      return res.status(403).json({ success: false, message: "Ce pack est masqué par une décision de modération." });
    }

    if (!creatorPackBelongsTo(packs[index], accountId)) {
      return res.status(403).json({ success: false, message: "Ce pack ne vous appartient pas." });
    }

    const pack = packs[index];

    if (!commercialPolicy.canAccessContentType(pack?.contentType)) {
      return res.status(403).json({
        success: false,
        code: "V1_FEATURE_LOCKED",
        message: "Cette ressource sera disponible lors du lancement de la V1."
      });
    }
    const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
    const now = new Date().toISOString();
    let contentChanged = false;
    let audioVersionsUpdated = 0;
    let requestedTracks = null;

    if (req.body?.tracksData !== undefined) {
      try {
        requestedTracks = JSON.parse(String(req.body.tracksData || "[]"));
      } catch {
        return res.status(400).json({ success: false, message: "Les informations des sons sont invalides." });
      }

      if (!Array.isArray(requestedTracks) || requestedTracks.length !== tracks.length) {
        return res.status(400).json({ success: false, message: "La liste des sons ne correspond pas au pack." });
      }
    }

    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title || title.length > 70) {
        return res.status(400).json({ success: false, message: "Le titre du pack est invalide." });
      }
      if (title !== String(pack.title || "")) contentChanged = true;
      pack.title = title;
    }

    if (req.body?.price !== undefined) {
      const price = creatorPackPrice(req.body.price);
      if (price < 1 || price > 100000) {
        return res.status(400).json({ success: false, message: "Prix invalide." });
      }
      pack.price = `${price.toFixed(2)}€`;
    }

    if (requestedTracks) {
      requestedTracks.forEach((requestedTrack, trackIndex) => {
        const track = tracks[trackIndex];
        const requestedId = String(requestedTrack?.id || "");
        const currentId = String(track?.id || "");
        const title = String(requestedTrack?.title || "").trim();

        if (requestedId !== currentId || !title || title.length > 70) {
          throw Object.assign(new Error(`Les informations du son ${trackIndex + 1} sont invalides.`), {
            statusCode: 400
          });
        }

        if (title !== String(track.title || "")) contentChanged = true;
        track.title = title;
      });
    }

    const fileByField = new Map();
    for (const file of Array.isArray(req.files) ? req.files : []) {
      if (fileByField.has(file.fieldname)) {
        return res.status(400).json({ success: false, message: "Une version audio a été envoyée plusieurs fois." });
      }
      fileByField.set(file.fieldname, file);
    }

    const replacedAudioNames = [];
    for (const [fieldname, file] of fileByField.entries()) {
      const match = /^trackAudio_(\d+)$/.exec(fieldname);
      const trackIndex = match ? Number(match[1]) : -1;

      if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= tracks.length) {
        return res.status(400).json({ success: false, message: "La version audio ne correspond à aucun son du pack." });
      }

      const track = tracks[trackIndex];
      const [preview, originalFileHash] = await Promise.all([
        analyzeAudioPreview(file.path),
        hashFileSha256(file.path)
      ]);
      replacedAudioNames.push(track.audioName);
      track.audioName = file.filename;
      track.audioVersion = Math.max(1, Number.parseInt(track.audioVersion, 10) || 1) + 1;
      track.audioUpdatedAt = now;
      track.originalFileHash = originalFileHash;
      track.originalFileHashAlgorithm = "SHA-256";
      track.originalFileHashComputedAt = now;
      track.fingerprintStatus = FINGERPRINT_STATUS;
      Object.assign(track, preview);
      audioVersionsUpdated += 1;
      contentChanged = true;
    }

    if (audioVersionsUpdated > 0) {
      const revisionId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const audioPaths = tracks.map((track) =>
        path.join(__dirname, "uploads", path.basename(String(track.audioName || "")))
      );
      const stagedPackZip = path.join(packsZipPath, `${pack.id}-${revisionId}.tmp`);
      const finalPackZip = path.join(packsZipPath, `${pack.id}_pack.zip`);

      createZipFromPaths(stagedPackZip, audioPaths);
      stagedZipPaths.push(stagedPackZip);

      const stagedTrackZips = [];
      tracks.forEach((track, trackIndex) => {
        const stagedTrackZip = path.join(tracksZipPath, `${track.id}-${revisionId}.tmp`);
        createZipFromPaths(stagedTrackZip, [audioPaths[trackIndex]]);
        stagedZipPaths.push(stagedTrackZip);
        stagedTrackZips.push({
          staged: stagedTrackZip,
          final: path.join(tracksZipPath, `${track.id}.zip`)
        });
        track.downloadZip = `/downloads/tracks/${track.id}.zip`;
      });

      const zipTargets = [
        { staged: stagedPackZip, final: finalPackZip },
        ...stagedTrackZips
      ];

      zipTargets.forEach((item) => {
        let backup = null;
        if (fs.existsSync(item.final)) {
          backup = `${item.final}.${revisionId}.backup`;
          fs.copyFileSync(item.final, backup);
          stagedZipPaths.push(backup);
        }
        fs.copyFileSync(item.staged, item.final);
        replacedZipTargets.push({ final: item.final, backup });
      });
      pack.downloadZip = `/downloads/packs/${pack.id}_pack.zip`;
    }

    delete pack.description;
    const previousStatus = String(pack.status || "draft").toLowerCase();
    const moderationRequired =
      contentChanged && ["approved", "pending"].includes(previousStatus);

    if (moderationRequired) {
      if (previousStatus === "approved") {
        pack.wasPublished = true;
        pack.publishedAt = pack.publishedAt || pack.moderatedAt || now;
      }
      pack.status = "pending";
      pack.submissionType = creatorPackWasPublished(pack) ? "republish" : "publish";
      pack.submittedAt = now;
      delete pack.rejectionReason;
      delete pack.rejectedAt;
      delete pack.moderatedAt;
      delete pack.moderatedBy;
    }

    pack.updatedAt = now;
    writeJsonArray(packsPath, packs);
    revisionPersisted = true;

    replacedAudioNames.forEach((audioName) => {
      if (!audioName) return;
      removeFileIfExists(path.join(__dirname, "uploads", path.basename(String(audioName))));
    });

    if (moderationRequired) {
      try {
        deleteLocalPackNotifications(pack.id);
        createLocalFounderNotification({
          type: "pack",
          title: "Pack modifié à revérifier",
          message: `${pack.title || "Un pack"} a été modifié et attend une validation.`,
          entityId: pack.id,
          entityType: "pack",
          environment: "local",
          priority: "normal"
        });
      } catch (notificationError) {
        console.error("Notification Founder de révision non créée :", notificationError);
      }
    }

    return res.json({
      success: true,
      pack,
      audioVersionsUpdated,
      moderationRequired
    });
  } catch (error) {
    console.error("Erreur PATCH /api/creator/packs/:id :", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Impossible de modifier ce pack."
    });
  } finally {
    if (!revisionPersisted) {
      [...replacedZipTargets].reverse().forEach((item) => {
        try {
          if (item.backup && fs.existsSync(item.backup)) {
            fs.copyFileSync(item.backup, item.final);
          } else {
            removeFileIfExists(item.final);
          }
        } catch (rollbackError) {
          console.error("Restauration ZIP après échec impossible :", rollbackError);
        }
      });
    }
    stagedZipPaths.forEach(removeFileIfExists);
    if (!revisionPersisted) uploadedFiles.forEach(removeFileIfExists);
  }
});

app.post("/api/creator/packs/bulk", (req, res) => {
  try {
    const accountId = String(req.body?.accountId || "");
    const action = String(req.body?.action || "");
    const packIds = [...new Set((Array.isArray(req.body?.packIds) ? req.body.packIds : []).map(String))];
    const allowedActions = ["delete", "draft", "publish", "republish"];

    if (!accountId || !packIds.length || !allowedActions.includes(action)) {
      return res.status(400).json({ success: false, message: "Action ou sélection invalide." });
    }

    const packs = readJsonArray(packsPath);
    const targets = packs.filter((pack) => packIds.includes(String(pack.id)));

    if (targets.some(isPackHiddenByModeration)) {
      return res.status(403).json({ success: false, message: "Un ou plusieurs packs sont masqués par la modération." });
    }

    if (
      targets.length !== packIds.length ||
      targets.some((pack) => !creatorPackBelongsTo(pack, accountId))
    ) {
      return res.status(403).json({ success: false, message: "Un ou plusieurs packs ne vous appartiennent pas." });
    }

    if (action !== "delete" && targets.some((pack) => !commercialPolicy.canAccessContentType(pack?.contentType))) {
      return res.status(403).json({
        success: false,
        code: "V1_FEATURE_LOCKED",
        message: "Les contenus MIDI et DAW restent verrouillés jusqu’au lancement de la V1."
      });
    }

    const now = new Date().toISOString();

    if (action === "draft") {
      targets.forEach((pack) => {
        if (String(pack.status || "").toLowerCase() === "approved") {
          pack.wasPublished = true;
          pack.publishedAt = pack.publishedAt || pack.moderatedAt || now;
        }
        pack.status = "draft";
        pack.draftAt = now;
        pack.updatedAt = now;
        deleteLocalPackNotifications(pack.id);
      });
      writeJsonArray(packsPath, packs);
      return res.json({ success: true, message: `${packIds.length} pack(s) placé(s) en brouillon.` });
    }

    if (action === "publish" || action === "republish") {
      const invalidStatus = targets.some((pack) =>
        !["draft", "rejected"].includes(String(pack.status || "draft").toLowerCase())
      );
      const invalidHistory = targets.some((pack) =>
        action === "publish" ? creatorPackWasPublished(pack) : !creatorPackWasPublished(pack)
      );

      if (invalidStatus || invalidHistory) {
        return res.status(409).json({
          success: false,
          message: action === "publish"
            ? "Seuls les brouillons jamais publiés peuvent être publiés."
            : "Seuls les anciens packs publiés peuvent être republiés."
        });
      }

      targets.forEach((pack) => {
        pack.status = "pending";
        pack.submissionType = action;
        pack.submittedAt = now;
        if (action === "republish") pack.republishedAt = now;
        pack.updatedAt = now;
        delete pack.rejectionReason;
        delete pack.rejectedAt;
        delete pack.moderatedAt;
        delete pack.moderatedBy;
        deleteLocalPackNotifications(pack.id);
      });

      writeJsonArray(packsPath, packs);

      targets.forEach((pack) => {
        try {
          createLocalFounderNotification({
            type: "pack",
            title: action === "publish" ? "Nouveau pack à publier" : "Pack republié à modérer",
            message: `${pack.title || "Un pack"} attend une validation avant publication.`,
            entityId: pack.id,
            entityType: "pack",
            environment: "local",
            priority: "normal"
          });
        } catch (notificationError) {
          console.error("Notification Founder de publication non créée :", notificationError);
        }
      });

      return res.json({
        success: true,
        message: action === "publish"
          ? `${packIds.length} pack(s) envoyé(s) en modération pour publication.`
          : `${packIds.length} pack(s) envoyé(s) en modération pour republication.`
      });
    }

    targets.forEach((pack) => deleteRejectedLocalPackFiles(pack));
    targets.forEach((pack) => deleteLocalPackNotifications(pack.id));
    writeJsonArray(packsPath, packs.filter((pack) => !packIds.includes(String(pack.id))));
    return res.json({ success: true, message: `${packIds.length} pack(s) supprimé(s).` });
  } catch (error) {
    console.error("Erreur POST /api/creator/packs/bulk :", error);
    return res.status(500).json({ success: false, message: "Impossible d’appliquer cette action." });
  }
});


function buildLocalPublicCatalogueContext() {
  const users = readJsonArray(usersPath);
  const artistsById = new Map();
  const artistsByName = new Map();
  const downloadCounts = new Map();

  users.forEach((rootUser) => {
    (Array.isArray(rootUser?.accounts) ? rootUser.accounts : [])
      .forEach((account) => {
        const downloadedPacks = Array.isArray(account?.downloadedPacks)
          ? account.downloadedPacks
          : [];

        downloadedPacks.forEach((packId) => {
          const key = String(packId || "").trim();
          if (!key) return;
          downloadCounts.set(key, (downloadCounts.get(key) || 0) + 1);
        });

        if (!isCreatorAccountActive(account)) return;

        const accountId = String(account.accountId || account.id || "").trim();
        if (!accountId) return;

        const publicProfile = {
          accountId,
          userId: String(rootUser?.id || "").trim(),
          name: String(
            account.pseudo ||
            account.artistname ||
            account.username ||
            account.firstname ||
            "Artiste Sonara"
          ).trim(),
          imageArtist: account.imageArtist || null,
          imageProfile: account.imageProfile || null,
          avatar: account.imageArtist || account.imageProfile || null,
          biography: String(account.biography || "").trim(),
          artistRewards: getPublicArtistRewards(account),
          missionVisibilityBoost: (() => {
            const boost = getActiveVisibilityBoost(account);
            return boost ? { bonus: Number(boost.visibilityBonus || 0), expiresAt: boost.expiresAt } : null;
          })()
        };

        [account.accountId, account.id]
          .filter(Boolean)
          .forEach((value) => {
            artistsById.set(String(value), publicProfile);
          });

        if (publicProfile.name) {
          artistsByName.set(publicProfile.name.toLowerCase(), publicProfile);
        }
      });
  });

  return { artistsById, artistsByName, downloadCounts };
}

function enrichLocalPublicCataloguePack(pack, context) {
  const identifiers = [
    pack?.accountId,
    pack?.artistAccountId,
    pack?.artistId
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  let artistProfile = null;

  for (const identifier of identifiers) {
    artistProfile = context.artistsById.get(identifier) || null;
    if (artistProfile) break;
  }

  if (!artistProfile) {
    const legacyName = String(pack?.artist || pack?.pseudo || "")
      .trim()
      .toLowerCase();

    if (legacyName) {
      artistProfile = context.artistsByName.get(legacyName) || null;
    }
  }

  const publicResources = (Array.isArray(pack?.resources) ? pack.resources : []).map((resource) => {
    const { fileKey, downloadZip, originalFileHash, originalFileHashAlgorithm, originalFileHashComputedAt, ...publicResource } = resource || {};
    const contentType = String(pack?.contentType || "audio").toLowerCase();
    if (contentType === "midi" && fileKey && Number(publicResource.preview?.previewVersion || 0) < 2) {
      const rebuiltPreview = buildMidiPreviewFromFile(
        path.join(__dirname, "uploads", path.basename(String(fileKey)))
      );
      if (rebuiltPreview) {
        publicResource.preview = rebuiltPreview;
        if (resource && typeof resource === "object") resource.preview = rebuiltPreview;
      }
    } else if (!publicResource.preview && contentType === "daw") {
      publicResource.preview = buildDawResourcePreview(resource, pack);
    }
    return publicResource;
  });

  return {
    ...humanCreationModeration.publicPackWithoutPrivateEvidence(pack),
    resources: publicResources,
    artistProfile,
    metrics: {
      ...(pack?.metrics && typeof pack.metrics === "object" ? pack.metrics : {}),
      downloadCount: context.downloadCounts.get(String(pack?.id || "")) || 0
    },
    license: normalizePackLicense(pack.license)
  };
}

app.get("/api/packs/pending", (req, res) => {
  const packs = readJsonArray(packsPath)
    .filter((pack) => !isPackHiddenByModeration(pack))
    .map((pack) => ({ ...humanCreationModeration.publicPackWithoutPrivateEvidence(pack), license: normalizePackLicense(pack.license) }));
  res.json(packs);
});

app.get("/api/packs", (req, res) => {
  const packs = readJsonArray(packsPath);
  const catalogueContext = buildLocalPublicCatalogueContext();
  const approvedPacks = packs
    .filter((pack) =>
      String(pack?.status || "").toLowerCase() === "approved" &&
      !isPackHiddenByModeration(pack)
    )
    .filter((pack) =>
      commercialPolicy.paymentsActive ||
      String(pack?.contentType || "audio").toLowerCase() === "audio"
    )
    .map((pack) =>
      enrichLocalPublicCataloguePack(pack, catalogueContext)
    );

  res.json(approvedPacks);
});


app.get("/api/packs/:id/resources/:resourceId/midi-preview", (req, res) => {
  if (!commercialPolicy.paymentsActive) {
    return res.status(403).json({
      success: false,
      code: "V1_FEATURE_LOCKED",
      message: "Cette fonctionnalité sera disponible lors du lancement de la V1."
    });
  }

  try {
    const packId = String(req.params.id || "").trim();
    const resourceId = String(req.params.resourceId || "").trim();
    const pack = readJsonArray(packsPath).find((item) =>
      String(item?.id || "") === packId &&
      String(item?.status || "").toLowerCase() === "approved" &&
      !isPackHiddenByModeration(item)
    );
    if (!pack || String(pack.contentType || "").toLowerCase() !== "midi") {
      return res.status(404).json({ success: false, message: "Pack MIDI introuvable." });
    }
    const resource = (Array.isArray(pack.resources) ? pack.resources : []).find((item) => String(item?.id || "") === resourceId);
    if (!resource?.fileKey) {
      return res.status(404).json({ success: false, message: "Fichier MIDI introuvable." });
    }
    const filePath = path.join(__dirname, "uploads", path.basename(String(resource.fileKey)));
    const preview = buildMidiPreviewFromFile(filePath, { full: true });
    if (!preview) return res.status(404).json({ success: false, message: "Aperçu MIDI indisponible." });
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.json({ success: true, packId, resourceId, preview });
  } catch (error) {
    console.error("Aperçu MIDI complet Local :", error);
    return res.status(500).json({ success: false, message: "Aperçu MIDI indisponible." });
  }
});

app.post("/api/packs/:id/preview-analysis", async (req, res) => {
  try {
    const packId = String(req.params.id || "").trim();
    const packs = readJsonArray(packsPath);
    const packIndex = packs.findIndex((pack) =>
      String(pack?.id || "") === packId &&
      String(pack?.status || "").toLowerCase() === "approved" &&
      !isPackHiddenByModeration(pack)
    );

    if (packIndex < 0) {
      return res.status(404).json({ success: false, message: "Pack introuvable." });
    }

    const pack = packs[packIndex];
    if (String(pack.contentType || "audio").toLowerCase() !== "audio") {
      return res.json({ success: true, packId, tracks: [], skipped: true, reason: "NON_AUDIO_RESOURCE" });
    }

    const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
    let changed = false;

    for (const track of tracks) {
      const previewReady =
        Number.isFinite(Number(track.previewStart)) &&
        Number(track.previewAnalysisVersion || 0) >= PREVIEW_ANALYSIS_VERSION;

      if (previewReady) continue;

      const audioName = path.basename(String(track.audioName || track.audio || ""));
      const audioPath = audioName ? path.join(__dirname, "uploads", audioName) : "";
      const preview = await analyzeAudioPreview(audioPath);
      Object.assign(track, preview);
      changed = true;
    }

    if (changed) {
      pack.previewAnalysisUpdatedAt = new Date().toISOString();
      writeJsonArray(packsPath, packs);
    }

    return res.json({
      success: true,
      packId,
      tracks: tracks.map((track) => ({
        id: track.id,
        previewStart: Number(track.previewStart || 0),
        previewDuration: Number(track.previewDuration || 30),
        previewAnalysisVersion: Number(track.previewAnalysisVersion || 0)
      }))
    });
  } catch (error) {
    console.error("Erreur analyse preview pack :", error);
    return res.status(500).json({ success: false, message: "Analyse des extraits indisponible." });
  }
});

function createZip(zipPath, files) {

  const zip = new AdmZip();

  files.forEach(fileName => {

    if (!fileName) return;

    const filePath = path.join(
      __dirname,
      "uploads",
      fileName
    );

    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath);
    }

  });

  zip.writeZip(zipPath);

}


app.post(
  "/api/packs/pending",
  handlePackUpload,
  async (req, res) => {
    const uploadedFiles = Array.isArray(req.files)
      ? req.files.map((file) => file.path)
      : [];
    const createdZipPaths = [];
    let packPersisted = false;

    try {
      const validation = validatePendingPackRequest(req);

      if (!validation.valid) {
        return res.status(validation.status).json({
          success: false,
          message: validation.message
        });
      }

      const receivedPack = validation.pack;
      const fileByField = validation.fileByField;

      if (
        !commercialPolicy.paymentsActive &&
        ["midi", "daw"].includes(String(receivedPack.contentType || "audio").toLowerCase())
      ) {
        return res.status(403).json({
          success: false,
          code: "V1_FEATURE_LOCKED",
          message: "Les packs MIDI et projets DAW seront disponibles lors du lancement de la V1."
        });
      }

      const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
      let packArtist = null;
      let packArtistRootUser = null;

      for (const currentRootUser of users) {
        packArtist = currentRootUser.accounts?.find((account) =>
          String(account.accountId) === String(receivedPack.artistId) ||
          String(account.id) === String(receivedPack.artistId)
        );
        if (packArtist) {
          packArtistRootUser = currentRootUser;
          break;
        }
      }

      if (!packArtist || !isCreatorAccountActive(packArtist)) {
        return res.status(403).json({
          success: false,
          code: "ARTIST_ACCOUNT_BLOCKED",
          message: "Votre accès artiste est indisponible ou sanctionné."
        });
      }

      if (commercialPolicy.bankRequiredForPackCreation) {
        if (!packArtist?.stripeAccountId) {
          return res.status(403).json({
            success: false,
            code: "STRIPE_ACCOUNT_REQUIRED",
            message: "Vous devez ajouter et vérifier un compte bancaire avant de créer un pack."
          });
        }

        const stripeArtistAccount = await stripe.accounts.retrieve(packArtist.stripeAccountId);
        const stripeVerified =
          stripeArtistAccount.charges_enabled &&
          stripeArtistAccount.payouts_enabled;

        packArtist.stripeStatus = stripeVerified ? "verified" : "onboarding_started";
        fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

        if (!stripeVerified) {
          return res.status(403).json({
            success: false,
            code: "STRIPE_ACCOUNT_NOT_VERIFIED",
            message: "Votre compte bancaire Stripe doit être entièrement vérifié avant de créer un pack."
          });
        }
      }

      receivedPack.paymentReady = false;

      const packs = readJsonArray(packsPath);

      if (packs.some((pack) => String(pack.id) === String(receivedPack.id))) {
        return res.status(409).json({
          success: false,
          message: "Ce pack existe déjà. Recharge la page avant de recommencer."
        });
      }

      const coverPackFile = fileByField.get("coverPack");
      receivedPack.coverPack = coverPackFile.filename;

      const creationEvidence = [];
      const evidenceFiles = (Array.isArray(req.files) ? req.files : [])
        .filter((file) => isPackEvidenceField(file.fieldname))
        .sort((a, b) => Number(a.fieldname.split("_").pop()) - Number(b.fieldname.split("_").pop()));
      for (const file of evidenceFiles) {
        const evidenceIndex = Number(file.fieldname.split("_").pop()) || 0;
        const extension = path.extname(file.originalname || "").toLowerCase();
        let midiAnalysis = null;
        if ([".mid", ".midi"].includes(extension)) {
          const preview = buildMidiPreviewFromFile(file.path, { full: true });
          if (preview) {
            const notes = Array.isArray(preview.notes) ? preview.notes : [];
            midiAnalysis = {
              noteCount: notes.length,
              velocityVariety: [...new Set(notes.map((note) => Number(note.velocity)).filter(Number.isFinite))].length,
              lowestNote: preview.lowestNote ?? null,
              highestNote: preview.highestNote ?? null,
              ticksPerQuarter: preview.ticksPerQuarter || null,
              totalTicks: preview.totalTicks || null,
              notes: notes.slice(0, 512)
            };
          }
        }
        const privateEvidenceDir = path.join(__dirname, "data", "moderation-evidence");
        fs.mkdirSync(privateEvidenceDir, { recursive: true });
        const privateEvidencePath = path.join(privateEvidenceDir, path.basename(file.filename));
        fs.renameSync(file.path, privateEvidencePath);
        const storageKey = path.basename(file.filename);
        creationEvidence.push(humanCreationModeration.normalizeEvidenceMeta({
          kind: receivedPack.creationEvidenceKinds?.[evidenceIndex] || ([".mid", ".midi"].includes(extension) ? "midi" : "other"),
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storageKey,
          midiAnalysis
        }));
      }
      const preparedTracks = [];
      const preparedResources = [];

      if (receivedPack.contentType === "audio") {
        for (let index = 0; index < receivedPack.tracks.length; index += 1) {
          const track = receivedPack.tracks[index];
          const usesPackCover = track?.coverMode !== "custom";
          const trackCoverFile = fileByField.get(`trackCover_${index}`);
          const trackAudioFile = fileByField.get(`trackAudio_${index}`);
          const [preview, originalFileHash] = await Promise.all([
            analyzeAudioPreview(trackAudioFile.path),
            hashFileSha256(trackAudioFile.path)
          ]);

          preparedTracks.push({
            ...track,
            coverPack: usesPackCover ? receivedPack.coverPack : trackCoverFile.filename,
            audioName: trackAudioFile.filename,
            audioVersion: 1,
            originalFileHash,
            originalFileHashAlgorithm: "SHA-256",
            originalFileHashComputedAt: new Date().toISOString(),
            fingerprintStatus: FINGERPRINT_STATUS,
            ...preview
          });
        }
      } else {
        for (let index = 0; index < receivedPack.resources.length; index += 1) {
          const resource = receivedPack.resources[index];
          const resourceFile = fileByField.get(`resourceFile_${index}`);
          const resourceCoverFile = fileByField.get(`resourceCover_${index}`);
          const usesPackCover = resource?.coverMode !== "custom" || !resourceCoverFile;
          const originalFileHash = await hashFileSha256(resourceFile.path);
          preparedResources.push({
            ...resource,
            coverMode: usesPackCover ? "pack" : "custom",
            coverPack: usesPackCover ? receivedPack.coverPack : resourceCoverFile.filename,
            fileKey: resourceFile.filename,
            originalName: resourceFile.originalname,
            preview: receivedPack.contentType === "midi"
              ? buildMidiPreviewFromFile(resourceFile.path)
              : buildDawResourcePreview(resource, receivedPack),
            originalFileHash,
            originalFileHashAlgorithm: "SHA-256",
            originalFileHashComputedAt: new Date().toISOString(),
            _resourceLocalPath: resourceFile.path
          });
        }
      }

      receivedPack.tracks = preparedTracks;
      receivedPack.resources = preparedResources;

      const newPack = {
        ...receivedPack,
        license: buildUpdatedPackLicense(
          null,
          receivedPack.license || defaultPackLicense(),
          {
            hasCurrent: false,
            packId: receivedPack.id,
            accountId: receivedPack.artistId,
            now: new Date().toISOString()
          }
        ).license,
        licenseHistory: Array.isArray(receivedPack.licenseHistory) ? receivedPack.licenseHistory : [],
        creationEvidence,
        humanModeration: { state: "pending", internalNote: "", history: [], requests: [] },
        technicalModerationSignals: humanCreationModeration.buildTechnicalSignals({ ...receivedPack, tracks: preparedTracks, creationEvidence }),
        status: "pending",
        submissionType: "publish",
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      const packZipName = `${newPack.id}_pack.zip`;
      const packZipFullPath = path.join(packsZipPath, packZipName);
      createdZipPaths.push(packZipFullPath);
      const packContentPaths = newPack.contentType === "audio"
        ? newPack.tracks.map((track) => path.join(__dirname, "uploads", track.audioName))
        : newPack.resources.map((resource) => resource._resourceLocalPath);

      createZipFromPaths(packZipFullPath, packContentPaths);
      newPack.downloadZip = `/downloads/packs/${packZipName}`;

      if (newPack.contentType === "audio") {
        newPack.tracks.forEach((track, index) => {
          const trackZipName = `${track.id}.zip`;
          const trackZipFullPath = path.join(tracksZipPath, trackZipName);
          createdZipPaths.push(trackZipFullPath);
          createZipFromPaths(trackZipFullPath, [packContentPaths[index]]);
          track.downloadZip = `/downloads/tracks/${trackZipName}`;
        });
      } else {
        newPack.resources.forEach((resource) => delete resource._resourceLocalPath);
      }

      packs.push(newPack);
      writeJsonArray(packsPath, packs);
      packPersisted = true;

      const storedPack = readJsonArray(packsPath).find(
        (pack) => String(pack.id) === String(newPack.id)
      );

      if (!storedPack) {
        throw new Error("Le pack n’a pas été retrouvé après son enregistrement.");
      }

      const rightsDeclaration = await licenseProtection.recordRightsDeclaration({
        rootUserId: packArtistRootUser?.id || receivedPack.userId || receivedPack.rootUserId || null,
        artistId: packArtist.accountId || packArtist.id || receivedPack.artistId,
        pack: storedPack,
        acceptedAt: storedPack.submittedAt || storedPack.createdAt || new Date().toISOString()
      });
      storedPack.rightsDeclaration = {
        rightsDeclarationId: rightsDeclaration.rightsDeclarationId,
        declarationVersion: rightsDeclaration.declarationVersion,
        legalTextStatus: rightsDeclaration.legalTextStatus,
        acceptedAt: rightsDeclaration.acceptedAt
      };
      const storedPackIndex = packs.findIndex((item) => String(item.id) === String(storedPack.id));
      if (storedPackIndex >= 0) {
        packs[storedPackIndex] = storedPack;
        writeJsonArray(packsPath, packs);
      }
      await licenseProtection.audit("PACK_SUBMITTED", {
        userId: packArtistRootUser?.id || receivedPack.userId || receivedPack.rootUserId || null,
        artistId: packArtist.accountId || packArtist.id || receivedPack.artistId,
        packId: storedPack.id,
        rightsDeclarationId: rightsDeclaration.rightsDeclarationId,
        createdAt: storedPack.submittedAt || new Date().toISOString()
      });

      let notificationCreated = true;

      try {
        createLocalFounderNotification({
          type: "pack",
          title: "Nouveau pack à modérer",
          message: `${storedPack.title} attend une validation.`,
          entityId: storedPack.id,
          entityType: "pack",
          environment: "local",
          priority: "normal"
        });
      } catch (notificationError) {
        notificationCreated = false;
        console.error("Notification Founder du pack non créée :", notificationError);
      }

      return res.status(201).json({
        success: true,
        persisted: true,
        notificationCreated,
        message: "Pack envoyé en modération.",
        pack: humanCreationModeration.publicPackWithoutPrivateEvidence(storedPack)
      });
    } catch (error) {
      console.error("ERREUR /api/packs/pending :", error);

      return res.status(500).json({
        success: false,
        message: "Le pack n’a pas pu être préparé correctement."
      });
    } finally {
      if (!packPersisted) {
        uploadedFiles.forEach(removeFileIfExists);
        createdZipPaths.forEach(removeFileIfExists);
      }
    }
  }
);


app.post("/api/free-download-access", async (req, res) => {
  try {
    const { userId, packId, trackId, resourceId, licenseVersion, licenseId } = req.body || {};

    if (!userId || !packId) {
      return res.status(400).json({
        success: false,
        message: "Utilisateur ou pack manquant."
      });
    }

    const packs = JSON.parse(fs.readFileSync(packsPath, "utf8"));
    const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const pack = packs.find(
      (item) =>
        String(item.id) === String(packId) &&
        String(item.status || "").toLowerCase() === "approved"
    );

    if (!pack) {
      return res.status(404).json({
        success: false,
        message: "Pack introuvable."
      });
    }

    if (
      !commercialPolicy.paymentsActive &&
      ["midi", "daw"].includes(String(pack.contentType || "audio").toLowerCase())
    ) {
      return res.status(403).json({
        success: false,
        code: "V1_FEATURE_LOCKED",
        message: "Cette ressource sera disponible lors du lancement de la V1."
      });
    }

    const currentLicenseMetadata = licenseMetadata(pack);
    const acceptedLicenseVersion = String(licenseVersion || "").trim();
    const acceptedLicenseId = String(licenseId || "").trim();

    if (!acceptedLicenseVersion || !acceptedLicenseId) {
      return res.status(400).json({
        success: false,
        code: "LICENSE_ACCEPTANCE_REQUIRED",
        message: "La licence doit être lue et acceptée avant le téléchargement."
      });
    }

    if (
      acceptedLicenseVersion !== currentLicenseMetadata.licenseVersion ||
      acceptedLicenseId !== currentLicenseMetadata.licenseId
    ) {
      return res.status(409).json({
        success: false,
        code: "PACK_LICENSE_CHANGED",
        message: "La licence du pack a changé. Relisez et acceptez la nouvelle version."
      });
    }

    const item = trackId
      ? pack.tracks?.find((track) => String(track.id) === String(trackId))
      : resourceId
        ? pack.resources?.find((resource) => String(resource.id) === String(resourceId))
        : pack;

    const isFree =
      item?.isFree === true ||
      String(item?.price || "").trim().toLowerCase() === "gratuit";

    if (!item || !commercialPolicy.freeAcquisitionEnabled) {
      return res.status(409).json({
        success: false,
        message: "Ce contenu n’est pas gratuit."
      });
    }

    let rootUser = null;
    let account = null;

    for (const candidate of users) {
      const found = candidate.accounts?.find(
        (current) =>
          String(current.id) === String(userId) ||
          String(current.accountId) === String(userId)
      );

      if (found) {
        rootUser = candidate;
        account = found;
        break;
      }
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Compte utilisateur introuvable."
      });
    }

    if (!(["user", "artist", "both"].includes(String(account.role || "").toLowerCase()))) {
      return res.status(403).json({
        success: false,
        message: "Ce compte ne peut pas effectuer de téléchargement."
      });
    }

    const accountStatus = String(account.status || "approved").toLowerCase();
    const artistStatus = String(account.artistStatus || "").toLowerCase();
    if (["banned", "suspended"].includes(accountStatus) || ["banned", "suspended"].includes(artistStatus)) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DOWNLOAD_BLOCKED",
        message: "Ce compte ne peut pas télécharger actuellement."
      });
    }
    if (account.licenseDownloadRestriction?.active === true) {
      return res.status(403).json({
        success: false,
        code: "LICENSE_DOWNLOAD_RESTRICTED",
        message: "Les téléchargements de ce compte sont restreints par la modération."
      });
    }

    const licenseAcceptance = await licenseProtection.recordAcceptance({
      rootUserId: String(rootUser.id),
      accountId: String(account.accountId || account.id || userId),
      pack,
      trackId: trackId || null,
      resourceId: resourceId || null,
      source: "pre_v1_free"
    });

    let acquisitionAdded = false;

    if (trackId) {
      account.downloadedTracks = Array.isArray(account.downloadedTracks)
        ? account.downloadedTracks
        : [];

      if (!account.downloadedTracks.some((id) => String(id) === String(trackId))) {
        account.downloadedTracks.push(trackId);
        acquisitionAdded = true;
      }
    } else if (resourceId) {
      account.downloadedResources = Array.isArray(account.downloadedResources)
        ? account.downloadedResources
        : [];

      if (!account.downloadedResources.some((id) => String(id) === String(resourceId))) {
        account.downloadedResources.push(resourceId);
        acquisitionAdded = true;
      }
    } else {
      account.downloadedPacks = Array.isArray(account.downloadedPacks)
        ? account.downloadedPacks
        : [];

      if (!account.downloadedPacks.some((id) => String(id) === String(packId))) {
        account.downloadedPacks.push(packId);
        acquisitionAdded = true;
      }
    }

    if (acquisitionAdded) {
      appendAcquisitionHistory(account, {
        packId,
        trackId: trackId || null,
        resourceId: resourceId || null,
        source: "pre_v1_free"
      });
    }

    account.updatedAt = new Date().toISOString();
    rootUser.updatedAt = new Date().toISOString();
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf8");

    const acceptanceQuery = `&acceptanceId=${encodeURIComponent(licenseAcceptance.acceptanceId)}`;
    const pathPart = trackId
      ? `app/pages/catalog/download.html?id=${encodeURIComponent(packId)}&trackId=${encodeURIComponent(trackId)}&free=true${acceptanceQuery}`
      : resourceId
        ? `app/pages/catalog/download.html?id=${encodeURIComponent(packId)}&resourceId=${encodeURIComponent(resourceId)}&free=true${acceptanceQuery}`
        : `app/pages/catalog/download.html?id=${encodeURIComponent(packId)}&free=true${acceptanceQuery}`;

    return res.json({
      success: true,
      free: true,
      redirectUrl: `${resolveFrontUrl(req)}/${pathPart}`
    });
  } catch (error) {
    console.error("Erreur accès gratuit :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d’autoriser le téléchargement gratuit."
    });
  }
});


app.post("/api/downloads/prepare", async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    const packId = String(req.body?.packId || "").trim();
    const trackId = String(req.body?.trackId || "").trim();
    const resourceId = String(req.body?.resourceId || "").trim();
    const acceptanceId = String(req.body?.acceptanceId || "").trim();

    if (!userId || !packId) {
      return res.status(400).json({ success: false, message: "Compte ou pack manquant." });
    }

    const result = await findRootAndAccountById(userId);
    if (!result?.account) {
      return res.status(404).json({ success: false, message: "Compte utilisateur introuvable." });
    }

    const account = result.account;
    const accountStatus = String(account.status || "approved").toLowerCase();
    const artistStatus = String(account.artistStatus || "").toLowerCase();
    if (["banned", "suspended"].includes(accountStatus) || ["banned", "suspended"].includes(artistStatus)) {
      return res.status(403).json({ success: false, code: "ACCOUNT_DOWNLOAD_BLOCKED", message: "Ce compte ne peut pas télécharger actuellement." });
    }
    if (account.licenseDownloadRestriction?.active === true) {
      return res.status(403).json({ success: false, code: "LICENSE_DOWNLOAD_RESTRICTED", message: "Les téléchargements de ce compte sont restreints par la modération." });
    }

    const pack = readJsonArray(packsPath).find((item) =>
      String(item?.id || "") === packId && String(item?.status || "").toLowerCase() === "approved"
    );
    if (!pack) return res.status(404).json({ success: false, message: "Pack introuvable." });

    const ownsPack = Array.isArray(account.downloadedPacks) && account.downloadedPacks.some((id) => String(id) === packId);
    const ownsTrack = trackId && Array.isArray(account.downloadedTracks) && account.downloadedTracks.some((id) => String(id) === trackId);
    const ownsResource = resourceId && Array.isArray(account.downloadedResources) && account.downloadedResources.some((id) => String(id) === resourceId);
    if (!(ownsPack || ownsTrack || ownsResource)) {
      return res.status(403).json({ success: false, code: "DOWNLOAD_NOT_OWNED", message: "Ce contenu n’est pas présent dans votre bibliothèque." });
    }

    if (trackId && !(pack.tracks || []).some((track) => String(track?.id || "") === trackId)) {
      return res.status(404).json({ success: false, message: "Track introuvable." });
    }
    if (resourceId && !(pack.resources || []).some((resource) => String(resource?.id || "") === resourceId)) {
      return res.status(404).json({ success: false, message: "Ressource introuvable." });
    }

    const prepared = await licenseProtection.prepareDownload({
      rootUserId: String(result.rootUser?.id || ""),
      accountId: String(account.accountId || account.id || userId),
      pack,
      trackId: trackId || null,
      resourceId: resourceId || null,
      acceptanceId: acceptanceId || null,
      source: acceptanceId ? "initial_download" : "library_redownload"
    });

    return res.json({
      success: true,
      downloadId: prepared.receipt.downloadId,
      licenseReceiptId: prepared.receipt.licenseReceiptId,
      legacyLicenseRecord: prepared.receipt.legacyLicenseRecord === true,
      fileUrl: `/api/downloads/file/${encodeURIComponent(prepared.token)}`
    });
  } catch (error) {
    console.error("Erreur préparation téléchargement protégé :", error);
    if (["LICENSE_ACCEPTANCE_INVALID", "LICENSE_ACCEPTANCE_MISMATCH"].includes(error.code)) {
      return res.status(409).json({ success: false, code: error.code, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Impossible de préparer ce téléchargement." });
  }
});

app.get("/api/downloads/file/:token", async (req, res) => {
  try {
    const inspected = await licenseProtection.inspectDownloadToken(req.params.token);
    if (!inspected.ok) {
      const gone = ["DOWNLOAD_TOKEN_EXPIRED", "DOWNLOAD_TOKEN_USED"].includes(inspected.code);
      return res.status(gone ? 410 : 403).json({
        success: false,
        code: inspected.code,
        message: inspected.code === "DOWNLOAD_TOKEN_EXPIRED"
          ? "Ce lien de téléchargement a expiré."
          : inspected.code === "DOWNLOAD_TOKEN_USED"
            ? "Ce lien de téléchargement a déjà été utilisé."
            : "Lien de téléchargement invalide."
      });
    }

    const receipt = inspected.receipt;
    const pack = readJsonArray(packsPath).find((item) => String(item?.id || "") === String(receipt.packId || ""));
    if (!pack) return res.status(404).json({ success: false, message: "Pack introuvable." });
    if (
      !commercialPolicy.paymentsActive &&
      ["midi", "daw"].includes(String(pack.contentType || "audio").toLowerCase())
    ) {
      return res.status(403).json({
        success: false,
        code: "V1_FEATURE_LOCKED",
        message: "Cette ressource sera disponible lors du lancement de la V1."
      });
    }

    const item = receipt.trackId
      ? (pack.tracks || []).find((track) => String(track?.id || "") === String(receipt.trackId))
      : receipt.resourceId
        ? (pack.resources || []).find((resource) => String(resource?.id || "") === String(receipt.resourceId))
        : pack;
    if (!item) return res.status(404).json({ success: false, message: "Fichier introuvable." });

    let fullPath;
    let downloadName;
    if (receipt.resourceId) {
      const resourceFileName = path.basename(String(item.fileKey || ""));
      fullPath = path.resolve(uploadsPath, resourceFileName);
      const safeRoot = `${path.resolve(uploadsPath)}${path.sep}`;
      if (!resourceFileName || !fullPath.startsWith(safeRoot) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: "Fichier ressource introuvable." });
      }
      downloadName = path.basename(String(item.originalName || item.fileKey || "sonara-resource"));
    } else {
      if (!item?.downloadZip) return res.status(404).json({ success: false, message: "Fichier ZIP introuvable." });
      const relativeZip = String(item.downloadZip).replace(/^\/?downloads\//, "");
      fullPath = path.resolve(downloadsPath, relativeZip);
      const safeRoot = `${path.resolve(downloadsPath)}${path.sep}`;
      if (!fullPath.startsWith(safeRoot) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: "Fichier ZIP introuvable." });
      }
      const safeName = String(item.title || pack.title || "sonara-pack").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 100) || "sonara-pack";
      downloadName = `${safeName}.zip`;
    }

    const consumed = await licenseProtection.consumeDownloadToken(req.params.token);
    if (!consumed.ok) return res.status(410).json({ success: false, code: consumed.code, message: "Ce lien de téléchargement n’est plus valide." });
    return res.download(fullPath, downloadName);
  } catch (error) {
    console.error("Erreur téléchargement protégé LOCAL :", error);
    return res.status(500).json({ success: false, message: "Téléchargement indisponible." });
  }
});

async function fulfillPaidStripeCheckout(session) {
  if (!session || session.payment_status !== "paid") {
    throw new Error("La session Stripe n’est pas payée.");
  }

  const metadata = session.metadata || {};
  const userId = String(metadata.userId || "").trim();
  const packId = String(metadata.packId || "").trim();
  const trackId = String(metadata.trackId || "").trim();
  const resourceId = String(metadata.resourceId || "").trim();
  const purchaseType = String(metadata.purchaseType || (trackId ? "track" : resourceId ? "resource" : "pack"));

  if (!userId || !packId) {
    throw new Error("Métadonnées Stripe incomplètes.");
  }

  const result = await findRootAndAccountById(userId);
  const account = result?.account;

  if (!account) {
    throw new Error("Compte acheteur introuvable.");
  }

  let acquisitionAdded = false;

  if (purchaseType === "track") {
    if (!trackId) throw new Error("Track Stripe manquante.");
    account.downloadedTracks = Array.isArray(account.downloadedTracks)
      ? account.downloadedTracks
      : [];

    if (!account.downloadedTracks.some((id) => String(id) === trackId)) {
      account.downloadedTracks.push(trackId);
      acquisitionAdded = true;
    }
  } else if (purchaseType === "resource") {
    if (!resourceId) throw new Error("Ressource Stripe manquante.");
    account.downloadedResources = Array.isArray(account.downloadedResources)
      ? account.downloadedResources
      : [];

    if (!account.downloadedResources.some((id) => String(id) === resourceId)) {
      account.downloadedResources.push(resourceId);
      acquisitionAdded = true;
    }
  } else {
    account.downloadedPacks = Array.isArray(account.downloadedPacks)
      ? account.downloadedPacks
      : [];

    if (!account.downloadedPacks.some((id) => String(id) === packId)) {
      account.downloadedPacks.push(packId);
      acquisitionAdded = true;
    }
  }

  if (acquisitionAdded) {
    appendAcquisitionHistory(account, {
      packId,
      trackId: trackId || null,
      resourceId: resourceId || null,
      source: "stripe_paid"
    });
  }

  account.lastStripePurchase = {
    sessionId: String(session.id || ""),
    paymentIntentId: String(session.payment_intent || ""),
    packId,
    trackId: trackId || null,
    resourceId: resourceId || null,
    purchaseType,
    amountTotal: Number(session.amount_total || 0),
    currency: String(session.currency || "eur"),
    paidAt: new Date().toISOString()
  };

  await saveAccountState(result.rootUser, account);

  return { account, packId, trackId: trackId || null, resourceId: resourceId || null, purchaseType };
}

app.post("/api/stripe/confirm-checkout-session", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const userId = String(req.body?.userId || "").trim();

    if (!sessionId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Session Stripe ou utilisateur manquant."
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"]
    });

    if (String(session.metadata?.userId || "") !== userId) {
      return res.status(403).json({
        success: false,
        message: "Cette session Stripe ne correspond pas à ce compte."
      });
    }

    await founderFinance.assertCheckoutEnvironment(session);
    const fulfilled = await fulfillPaidStripeCheckout(session);

    await founderFinance.recordCheckout(
      session,
      {
        eventId: `confirm:${session.id}`,
        source: "checkout_confirmation"
      }
    );

    return res.json({
      success: true,
      paymentStatus: session.payment_status,
      purchaseType: fulfilled.purchaseType,
      packId: fulfilled.packId,
      trackId: fulfilled.trackId,
      resourceId: fulfilled.resourceId
    });
  } catch (error) {
    console.error("Confirmation Stripe impossible :", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Impossible de confirmer le paiement Stripe."
    });
  }
});

app.post("/api/stripe/create-checkout-session", async (req, res) => {
  console.log("====================================");
  console.log("🟢 [1] ROUTE CHECKOUT APPELÉE");
  console.log("Body reçu :", req.body);

  try {
    const { packId, trackId, resourceId, userId, licenseVersion, licenseId } = req.body;

    console.log("🟢 [2] Données reçues");
    console.log("packId :", packId);
    console.log("trackId :", trackId);
    console.log("resourceId :", resourceId);
    console.log("userId :", userId);

    if (!packId) {
      console.log("🔴 [STOP] packId manquant");
      return res.status(400).json({ error: "packId manquant." });
    }

    if (!userId) {
      return res.status(400).json({ error: "Utilisateur manquant." });
    }

    // Recharge fraîche des fichiers à chaque requête
    console.log("🟢 [3] Lecture des fichiers JSON");

    const packs = readJsonArray(packsPath);
    const users = readJsonArray(usersPath);

    console.log("Nombre de packs :", packs.length);
    console.log("Nombre de users :", users.length);

    // Recherche du pack
    console.log("🟢 [4] Recherche du pack");

    const pack = packs.find(p => String(p.id) === String(packId));

    console.log("Pack trouvé :", pack ? "OUI" : "NON");

    if (!pack) {
      console.log("🔴 [STOP] Pack introuvable");
      return res.status(404).json({ error: "Pack introuvable." });
    }

    if (String(pack.status || "").toLowerCase() !== "approved") {
      return res.status(409).json({
        error: "Ce pack n’est pas disponible à l’achat."
      });
    }

    const currentLicenseMetadata = licenseMetadata(pack);
    const acceptedLicenseVersion = String(licenseVersion || "").trim();
    const acceptedLicenseId = String(licenseId || "").trim();

    if (!acceptedLicenseVersion || !acceptedLicenseId) {
      return res.status(409).json({
        error: "La licence doit être acceptée avant de poursuivre.",
        code: "LICENSE_ACCEPTANCE_REQUIRED",
        currentLicenseVersion: currentLicenseMetadata.licenseVersion
      });
    }

    if (
      acceptedLicenseVersion !== currentLicenseMetadata.licenseVersion ||
      acceptedLicenseId !== currentLicenseMetadata.licenseId
    ) {
      return res.status(409).json({
        error: "La licence du pack a changé. Revenez sur le pack pour lire et accepter la nouvelle version.",
        code: "PACK_LICENSE_CHANGED",
        currentLicenseVersion: currentLicenseMetadata.licenseVersion
      });
    }

    const buyerResult = await findRootAndAccountById(userId);
    const buyer = buyerResult?.account;

    if (!buyer) {
      return res.status(404).json({ error: "Compte acheteur introuvable." });
    }

    if (!(["user", "artist", "both"].includes(String(buyer.role || "").toLowerCase()))) {
      return res.status(403).json({
        error: "Ce compte ne peut pas effectuer d’achat."
      });
    }

    const alreadyOwned = trackId
      ? (
          Array.isArray(buyer.downloadedPacks) && buyer.downloadedPacks.some((id) => String(id) === String(packId))
        ) || (
          Array.isArray(buyer.downloadedTracks) && buyer.downloadedTracks.some((id) => String(id) === String(trackId))
        )
      : resourceId
        ? (
            Array.isArray(buyer.downloadedPacks) && buyer.downloadedPacks.some((id) => String(id) === String(packId))
          ) || (
            Array.isArray(buyer.downloadedResources) && buyer.downloadedResources.some((id) => String(id) === String(resourceId))
          )
        : Array.isArray(buyer.downloadedPacks) && buyer.downloadedPacks.some((id) => String(id) === String(packId));

    if (alreadyOwned) {
      const ownedContentType = String(pack.contentType || "audio").trim().toLowerCase();
      const ownedInArtistPurchases = ["midi", "daw"].includes(ownedContentType);

      return res.status(409).json({
        success: false,
        code: "ALREADY_OWNED",
        destination: ownedInArtistPurchases ? "purchases" : "library",
        redirectUrl: ownedInArtistPurchases
          ? `/app/pages/creator/dashboard.html?mode=shop&library=1&shopType=${encodeURIComponent(ownedContentType)}`
          : "/app/pages/catalog/library.html",
        error: ownedInArtistPurchases
          ? "Vous avez déjà acheté ce contenu. Retrouvez-le dans Mes achats."
          : "Vous avez déjà obtenu ce contenu. Retrouvez-le dans votre Bibliothèque."
      });
    }

    if (pack.paymentReady !== true) {
      return res.status(409).json({
        success: false,
        code: "PACK_PAYMENT_NOT_READY",
        error: "Ce pack n’est pas encore disponible à la vente."
      });
    }

    console.log("Pack ID :", pack.id);
    console.log("Pack artistId :", pack.artistId);
    console.log("Pack artist :", pack.artist);
    console.log("Pack pseudo:", pack.pseudo);

    // Recherche de l'artiste
    console.log("🟢 [5] Recherche de l'artiste");

    let artist = null;
    const artistIdentifiers = [
      pack.accountId,
      pack.artistAccountId,
      pack.artistId
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    for (const rootUser of users) {
      const foundArtist = rootUser.accounts?.find(
        (account) =>
          (
            account.role === "artist" ||
            account.role === "both"
          ) &&
          (
            artistIdentifiers.some((identifier) =>
              String(account.id) === identifier ||
              String(account.accountId) === identifier
            ) ||
            String(account.pseudo) === String(pack.artist) ||
            String(account.pseudo) === String(pack.pseudo)
          )
      );

      if (foundArtist) {
        artist = foundArtist;
        break;
      }
    }

    console.log("Artiste trouvé :", artist ? "OUI" : "NON");

    if (!artist) {
      console.log("🔴 [STOP] Artiste introuvable");
      return res.status(404).json({ error: "Artiste introuvable." });
    }

    console.log("Artist ID :", artist.id);
    console.log("Artist name :", artist.pseudo);
    console.log("Artist stripeAccountId :", artist.stripeAccountId);
    console.log("Artist stripeStatus :", artist.stripeStatus);

    if (!artist.stripeAccountId) {
      return res.status(400).json({
        error: "Artiste Stripe non connecté.",
        artistId: artist.id || artist.accountId,
        pseudo: artist.pseudo,
        stripeAccountId: null
      });
    }

    let stripeArtistAccount;

    try {
      stripeArtistAccount = await stripe.accounts.retrieve(artist.stripeAccountId);
    } catch (stripeAccountError) {
      console.error("Compte Stripe artiste introuvable :", stripeAccountError.message);
      return res.status(409).json({
        error: "Le compte Stripe de l’artiste est introuvable ou inaccessible."
      });
    }

    const stripeVerified = Boolean(
      stripeArtistAccount.charges_enabled &&
      stripeArtistAccount.payouts_enabled
    );

    const currentStripeStatus = stripeVerified
      ? "verified"
      : "onboarding_started";

    if (artist.stripeStatus !== currentStripeStatus) {
      artist.stripeStatus = currentStripeStatus;
      writeJsonArray(usersPath, users);
    }

    if (!stripeVerified) {
      return res.status(409).json({
        error: "Le compte Stripe de l’artiste n’est pas encore vérifié."
      });
    }

    let item;
    let finalPurchaseType;
    let successUrl;

    // Achat track seule
    if (trackId) {
      console.log("🟢 [7] Mode achat TRACK");
      console.log("trackId reçu :", trackId);

      const track = pack.tracks?.find(t => String(t.id) === String(trackId));

      console.log("Track trouvée :", track ? "OUI" : "NON");

      if (!track) {
        console.log("🔴 [STOP] Track introuvable");
        return res.status(404).json({ error: "Track introuvable." });
      }

      console.log("Track ID :", track.id);
      console.log("Track title :", track.title);
      console.log("Track price :", track.price);

      item = track;
      finalPurchaseType = "track";

      successUrl = `${resolveFrontUrl(req)}/${track.downloadPage}&success=true&session_id={CHECKOUT_SESSION_ID}`;
    } 
    
    // Achat ressource MIDI / DAW seule
    else if (resourceId) {
      console.log("🟢 [7] Mode achat RESSOURCE");
      const resource = pack.resources?.find((entry) => String(entry.id) === String(resourceId));
      if (!resource) return res.status(404).json({ error: "Ressource introuvable." });
      item = resource;
      finalPurchaseType = "resource";
      successUrl = `${resolveFrontUrl(req)}/${resource.downloadPage}&success=true&session_id={CHECKOUT_SESSION_ID}`;
    }

    // Achat pack complet
    else {
      console.log("🟢 [7] Mode achat PACK COMPLET");

      item = pack;
      finalPurchaseType = "pack";

      successUrl = `${resolveFrontUrl(req)}/${pack.downloadPage}&success=true&session_id={CHECKOUT_SESSION_ID}`;
    }

    console.log("🟢 [8] Item choisi");
    console.log("Purchase type :", finalPurchaseType);
    console.log("Item :", item);
    console.log("Success URL :", successUrl);

    // Prix
    console.log("🟢 [9] Préparation du prix");

    const itemIsFree =
      commercialPolicy.freeAcquisitionEnabled &&
      (
        item.isFree === true ||
        String(item.price || "").trim().toLowerCase() === "gratuit"
      );

    if (itemIsFree) {
      return res.status(409).json({
        success: false,
        error: "Ce contenu est gratuit et ne doit pas passer par Stripe."
      });
    }

    const rawPrice = item.price || item.packPrice || item.totalPrice;

    console.log("Prix brut :", rawPrice);

    if (!rawPrice) {
      console.log("🔴 [STOP] Prix manquant");
      return res.status(400).json({
        error: "Prix manquant sur l'item.",
        item,
      });
    }

    const priceNumber = Number(
      String(rawPrice)
        .replace("€", "")
        .replace(",", ".")
        .trim()
    );

    console.log("Prix converti :", priceNumber);

    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      console.log("🔴 [STOP] Prix invalide");
      return res.status(400).json({
        error: "Prix invalide.",
        rawPrice,
      });
    }

    const amount = Math.round(priceNumber * 100);

    console.log("Montant Stripe en centimes :", amount);

    const licenseAcceptance = await licenseProtection.recordAcceptance({
      rootUserId: String(buyerResult?.rootUser?.id || buyerResult?.rootUser?._id || ""),
      accountId: String(buyer.accountId || buyer.id || userId),
      pack,
      trackId: trackId || null,
      resourceId: resourceId || null,
      source: "stripe_checkout"
    });

    console.log("🟢 [10] Création session Stripe");

    const commissionCents = Math.round(amount * 0.20);
    const sonaraOrderId = `order_${crypto.randomUUID()}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",

        payment_method_types: ["card"],

        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name:
                  ["track", "resource"].includes(finalPurchaseType)
                    ? `${item.title || item.originalName} - ${pack.title || pack.name}`
                    : pack.title || pack.name || "Pack Sonara"
              },
              unit_amount: amount
            },
            quantity: 1
          }
        ],

        client_reference_id: String(userId),

        metadata: {
          packId: String(pack.id),
          trackId: trackId ? String(trackId) : "",
          resourceId: resourceId ? String(resourceId) : "",
          userId: String(userId),
          artistId: String(artist.accountId || artist.id),
          purchaseType: finalPurchaseType,
          licenseAcceptanceId: String(licenseAcceptance.acceptanceId),
          sonaraCommissionRate: "0.20",
          sonaraCommissionCents: String(commissionCents),
          sonaraEnvironment: "LOCAL",
          sonaraSource: "SONARA_PACK",
          orderId: sonaraOrderId,
          packTitleSnapshot: String(pack.title || pack.name || "Pack Sonara").slice(0, 450),
          trackTitleSnapshot: finalPurchaseType === "track" ? String(item.title || "Track").slice(0, 450) : "",
          resourceTitleSnapshot: finalPurchaseType === "resource" ? String(item.title || item.originalName || "Ressource").slice(0, 450) : "",
          artistNameSnapshot: String(artist.username || artist.pseudo || artist.name || artist.firstname || "Artiste").slice(0, 450),
          ...licenseMetadata(pack)
        },

        payment_intent_data: {
          application_fee_amount: commissionCents,
          transfer_data: {
            destination: artist.stripeAccountId
          },
          metadata: {
            packId: String(pack.id),
            trackId: trackId ? String(trackId) : "",
            resourceId: resourceId ? String(resourceId) : "",
            userId: String(userId),
            artistId: String(artist.accountId || artist.id),
            purchaseType: finalPurchaseType,
            licenseAcceptanceId: String(licenseAcceptance.acceptanceId),
            sonaraCommissionRate: "0.20",
            sonaraCommissionCents: String(commissionCents),
            sonaraEnvironment: "LOCAL",
            sonaraSource: "SONARA_PACK",
            orderId: sonaraOrderId,
            packTitleSnapshot: String(pack.title || pack.name || "Pack Sonara").slice(0, 450),
            trackTitleSnapshot: finalPurchaseType === "track" ? String(item.title || "Track").slice(0, 450) : "",
            resourceTitleSnapshot: finalPurchaseType === "resource" ? String(item.title || item.originalName || "Ressource").slice(0, 450) : "",
            artistNameSnapshot: String(artist.username || artist.pseudo || artist.name || artist.firstname || "Artiste").slice(0, 450),
            ...licenseMetadata(pack)
          }
        },

        success_url: successUrl,
        cancel_url: (() => {
          const contentType = String(pack.contentType || "audio").toLowerCase();
          if (contentType === "midi" || contentType === "daw") {
            return `${resolveFrontUrl(req)}/app/pages/creator/shop/${contentType}.html?id=${encodeURIComponent(pack.id)}&cancel=true`;
          }
          return `${resolveFrontUrl(req)}/app/pages/catalog/pack.html?id=${encodeURIComponent(pack.id)}&cancel=true`;
        })(),
      }
    );

    console.log("🟢 [11] Session Stripe créée !");
    console.log("Session ID :", session.id);
    console.log("Session URL :", session.url);

    console.log("🟢 [12] Réponse envoyée au front");
    console.log("====================================");

    return res.json({
      url: session.url,
      sessionId: session.id,
    });

  } catch (err) {
    console.log("🔴 [ERREUR CATCH CHECKOUT]");
    console.error(err);
    console.log("Message :", err.message);
    console.log("Type :", err.type);
    console.log("Code :", err.code);
    console.log("Raw :", err.raw);
    console.log("====================================");

    return res.status(500).json({
      error: "Erreur création session Stripe.",
      message: err.message,
      type: err.type || null,
      code: err.code || null,
    });
  }
});

app.patch("/api/packs/:id/status", requireFounderKey, async (req, res) => {
  try {
    const packId = String(req.params.id || "");
    const status = String(req.body?.status || "");

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Statut de pack invalide"
      });
    }

    const packs = readJsonArray(packsPath);
    const pack = packs.find((item) => String(item?.id || "") === packId);

    if (!pack) {
      return res.status(404).json({
        success: false,
        message: "Pack introuvable"
      });
    }

    if (status === "rejected") {
      const moderatedAt = new Date().toISOString();
      pack.status = "rejected";
      pack.rejectionReason = String(req.body?.reason || "La demande ne respecte pas les critères de validation Sonara.").trim();
      pack.moderatedAt = moderatedAt;
      pack.updatedAt = moderatedAt;
      writeJsonArray(packsPath, packs);
      deleteLocalPackNotifications(pack.id);

      createModerationDecisionNotice({
        accountId: pack.artistId,
        decisionType: "pack_rejection",
        resourceId: pack.id,
        reason: pack.rejectionReason,
        initialDecision: "rejected",
        environment: "local"
      });

      return res.json({
        success: true,
        deleted: false,
        message: "Pack refusé et conservé pour une éventuelle contestation",
        pack
      });
    }

    const moderatedAt = new Date().toISOString();
    pack.status = status;
    pack.moderatedAt = moderatedAt;
    pack.updatedAt = moderatedAt;
    if (status === "approved") {
      pack.wasPublished = true;
      pack.publishedAt = pack.publishedAt || moderatedAt;
      delete pack.rejectionReason;
      delete pack.rejectedAt;
    }
    writeJsonArray(packsPath, packs);
    deleteLocalPackNotifications(pack.id);
    if (status === "approved") {
      await licenseProtection.recordPublication({
        artistId: pack.accountId || pack.artistAccountId || pack.artistId || null,
        pack,
        publishedAt: moderatedAt
      });
    }

    return res.json({
      success: true,
      message: `Pack ${status}`,
      pack
    });
  } catch (error) {
    console.error("Erreur modération pack locale :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de terminer la modération du pack.",
      error: error.message
    });
  }
})


function checkServerFiles() {
  const checks = [
    { name: "creator.js", path: "./app/js/creator/dashboard/creator.js" },
    { name: "create-pack.js", path: "./app/js/creator/packs/create-pack.js" },
    { name: "pending.js", path: "./app/js/auth/pending.js" },
    { name: "home.js", path: "./app/js/home/home.js" },
    { name: "pack.js", path: "./app/js/catalog/pack.js" },
    { name: "pendingPacks.json", path: packsPath },
    { name: "users.json", path: usersPath },
    { name: "uploads folder", path: path.join(__dirname, "uploads") }
  ];

  console.log("⏳ Vérification Sonara Server...");

  checks.forEach((item, index) => {

    const percent = Math.round(
      ((index + 1) / checks.length) * 100
    );

    const exists = fs.existsSync(item.path);

    if (exists) {
      console.log(`✅ ${percent}% ${item.name}`);
    } else {
      console.log(`❌ ${percent}% ${item.name}`);
    }

  });

  console.log("🚀 Vérification terminée");
}



/* =========================
   SUPPORT + FOUNDER INTERNE
========================= */

const supportTicketsPath = path.join(__dirname, "data", "supportTickets.json");
const founderNotificationsPath = path.join(__dirname, "data", "founderNotifications.json");
const moderationAppealsPath = path.join(__dirname, "data", "moderation-appeals.json");

function ensureJsonArrayFile(filePath) {
  const folder = path.dirname(filePath);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
}

function readJsonArray(filePath) {
  ensureJsonArrayFile(filePath);
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Fichier JSON invalide : ${filePath}`, error);
    return [];
  }
}

function writeJsonArray(filePath, value) {
  ensureJsonArrayFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function findRootAndAccountById(id) {
  const requestedId = String(id || "").trim();

  if (!requestedId) return null;

  const users = readJsonArray(usersPath);

  for (const rootUser of users) {
    const account = (rootUser.accounts || []).find(
      (currentAccount) =>
        String(currentAccount.id || "") === requestedId ||
        String(currentAccount.accountId || "") === requestedId
    );

    if (account) {
      return { users, rootUser, account };
    }
  }

  return null;
}

async function saveAccountState(rootUser, account) {
  const users = readJsonArray(usersPath);
  const storedRootUser = users.find(
    (currentRootUser) => String(currentRootUser.id || "") === String(rootUser?.id || "")
  );

  if (!storedRootUser) {
    throw new Error("Racine utilisateur locale introuvable.");
  }

  const storedAccount = (storedRootUser.accounts || []).find(
    (currentAccount) =>
      String(currentAccount.accountId || currentAccount.id || "") ===
      String(account?.accountId || account?.id || "")
  );

  if (!storedAccount) {
    throw new Error("Compte local introuvable.");
  }

  const now = new Date().toISOString();
  Object.assign(storedAccount, account, { updatedAt: now });
  storedRootUser.updatedAt = now;
  writeJsonArray(usersPath, users);
}

function requireFounderKey(req, res, next) {
  const expected = String(process.env.FOUNDER_ACCESS_KEY || "").trim();
  const received = String(req.get("x-founder-key") || "").trim();

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "FOUNDER_ACCESS_KEY absente sur Sonara local."
    });
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return res.status(401).json({
      success: false,
      message: "Clé Founder invalide."
    });
  }

  next();
}

/* =========================
   MISSIONS CREATOR — SOURCE RÉELLE
========================= */
app.get("/api/creator/missions/:artistId", async (req, res) => {
  try {
    const requestedArtistId = String(req.params?.artistId || "").trim();
    if (!requestedArtistId) {
      return res.status(400).json({ success: false, message: "Artiste requis." });
    }
    const packs = readJsonArray(packsPath);
    const backfill = backfillLocalPublishedAt(packs);
    if (backfill.changed) writeJsonArray(packsPath, packs);
    const report = buildPreV1ActivityReport(packs);
    const activity = report.artists.find((artist) =>
      artist.artistId === requestedArtistId || artist.accountId === requestedArtistId
    ) || {
      artistId: requestedArtistId,
      accountId: requestedArtistId,
      preV1PublishedPacks: 0,
      activeMonths: [],
      activeMonthsCount: 0,
      requiredMonths: PRE_V1_ACTIVITY_CONFIG.requiredActiveMonths,
      lastPublishedAt: null,
      preV1BadgeEligible: false
    };

    const missionMode = resolveMissionMode();
    let payload = buildMissionPayload({ activity, mode: missionMode });
    const artistResult = findRootAndAccountById(requestedArtistId);
    if (artistResult?.account) {
      let rewardChanged = false;
      const seniorityGrant = maybeGrantPreV1SeniorityReward(artistResult.account, activity);
      rewardChanged = rewardChanged || seniorityGrant.changed;
      payload.missions.forEach((mission) => {
        const granted = grantMissionRewardOnce(artistResult.account, mission);
        rewardChanged = rewardChanged || granted.changed;
      });
      if (rewardChanged) await saveAccountState(artistResult.rootUser, artistResult.account);
      payload = { ...payload, missions: payload.missions.map((mission) => {
        const attached = attachRewardState(mission, artistResult.account);
        if (mission.id === "pre_v1_seniority" && hasArtistReward(artistResult.account, ARTIST_REWARD_IDS.PRE_V1_SENIORITY)) {
          return { ...attached, rewardGranted: true, state: "REWARDED" };
        }
        return attached;
      }) };
    }

    return res.json({
      success: true,
      environment: "local",
      artistId: requestedArtistId,
      activity,
      ...payload
    });
  } catch (error) {
    console.error("Erreur missions Creator local :", error);
    return res.status(500).json({ success: false, message: "Impossible de charger les missions." });
  }
});

/* =========================
   ACTIVITÉ ARTISTE PRE-V1 — INTERNE
========================= */
app.get("/api/founder/pre-v1-artist-activity", requireFounderKey, (req, res) => {
  try {
    const packs = readJsonArray(packsPath);
    const backfill = backfillLocalPublishedAt(packs);
    if (backfill.changed) writeJsonArray(packsPath, packs);

    const report = buildPreV1ActivityReport(packs);
    const requestedArtistId = String(req.query?.artistId || "").trim();

    return res.json({
      success: true,
      environment: "local",
      config: PRE_V1_ACTIVITY_CONFIG,
      backfilledPublishedAt: backfill.updatedCount,
      ...report,
      artists: requestedArtistId
        ? report.artists.filter((artist) =>
            artist.artistId === requestedArtistId || artist.accountId === requestedArtistId
          )
        : report.artists
    });
  } catch (error) {
    console.error("Erreur activité artiste Pre-V1 locale :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de calculer l’activité artiste Pre-V1."
    });
  }
});


function createLocalFounderNotification({ type, title, message, entityId, entityType = null, environment = "local", priority = "normal" }) {
  const notifications = readJsonArray(founderNotificationsPath);
  const notification = {
    id: `notif_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    type: type || "system",
    title: title || "Nouvelle activité Sonara",
    message: message || "",
    entityId: entityId || null,
    entityType: entityType || type || null,
    environment,
    priority,
    read: false,
    createdAt: new Date().toISOString()
  };

  notifications.unshift(notification);
  writeJsonArray(founderNotificationsPath, notifications);
  return notification;
}

app.post("/api/support/tickets", async (req, res) => {
  try {
    const {
      rootUserId = "",
      accountId = "",
      pseudo = "",
      email = "",
      role = "user",
      category = "other",
      subject = "",
      message = "",
      packId = "",
      trackId = "",
      externalPlatform = "",
      externalUrl = "",
      evidence = "",
      reportedAccountId = "",
      downloadId = ""
    } = req.body || {};

    if (!accountId || !String(subject).trim() || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "Compte, objet et description obligatoires."
      });
    }

    const tickets = readJsonArray(supportTicketsPath);
    let rightsIncident = null;
    if (String(category) === "rights_incident") {
      if (!String(packId).trim() || !String(externalPlatform).trim() || !String(externalUrl).trim()) {
        return res.status(400).json({ success: false, message: "Pack, plateforme et URL externe sont obligatoires pour un signalement de droits." });
      }
      const reporter = await findRootAndAccountById(accountId);
      if (!reporter?.account) return res.status(404).json({ success: false, message: "Compte déclarant introuvable." });
      const pack = readJsonArray(packsPath).find((item) => String(item?.id || "") === String(packId));
      if (!pack) return res.status(404).json({ success: false, message: "Pack signalé introuvable." });
      if (!creatorPackBelongsTo(pack, reporter.account.accountId || reporter.account.id || accountId)) {
        return res.status(403).json({ success: false, message: "Seul l’artiste propriétaire peut créer ce signalement depuis le support." });
      }
      if (trackId && !pack.tracks?.some((track) => String(track?.id || "") === String(trackId))) {
        return res.status(404).json({ success: false, message: "Track signalée introuvable dans ce pack." });
      }
      rightsIncident = await licenseProtection.createIncident({
        reporterUserId: reporter.rootUser?.id || null,
        reporterAccountId: reporter.account.accountId || reporter.account.id || accountId,
        reportedAccountId: reportedAccountId || null,
        artistId: pack.accountId || pack.artistAccountId || pack.artistId || reporter.account.accountId || reporter.account.id,
        packId: pack.id,
        trackId: trackId || null,
        downloadId: downloadId || null,
        externalPlatform,
        externalUrl,
        reason: message,
        evidence
      });
    }

    const createdAt = new Date().toISOString();
    const ticket = {
      id: `ticket_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      ticketId: `SP-${Date.now().toString().slice(-8)}`,
      rootUserId: String(rootUserId),
      accountId: String(accountId),
      pseudo: String(pseudo).trim(),
      email: String(email).trim().toLowerCase(),
      role: String(role),
      category: String(category),
      subject: String(subject).trim(),
      message: String(message).trim(),
      incidentId: rightsIncident?.incidentId || null,
      rightsIncident: rightsIncident ? {
        incidentId: rightsIncident.incidentId,
        packId: rightsIncident.packId,
        trackId: rightsIncident.trackId,
        externalPlatform: rightsIncident.externalPlatform,
        externalUrl: rightsIncident.externalUrl,
        status: rightsIncident.status
      } : null,
      status: "open",
      replies: [],
      priority: ["security", "rights_incident"].includes(String(category)) ? "urgent" : "normal",
      createdAt,
      updatedAt: createdAt
    };

    tickets.unshift(ticket);
    writeJsonArray(supportTicketsPath, tickets);

    createLocalFounderNotification({
      type: rightsIncident ? "license_incident" : "support",
      title: rightsIncident ? "Incident de licence à examiner" : (ticket.priority === "urgent" ? "Ticket support urgent" : "Nouveau ticket support"),
      message: rightsIncident
        ? `${ticket.pseudo || ticket.email || "Artiste"} signale ${rightsIncident.externalPlatform || "une plateforme externe"} · ${rightsIncident.packId || "pack"}`
        : `${ticket.pseudo || ticket.email || "Utilisateur"} — ${ticket.subject}`,
      entityId: rightsIncident?.incidentId || ticket.id,
      priority: ticket.priority
    });

    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    console.error("Erreur création ticket support :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de créer la demande."
    });
  }
});

app.get("/api/support/tickets/:accountId", (req, res) => {
  try {
    const accountId = String(req.params.accountId || "");
    const tickets = readJsonArray(supportTicketsPath)
      .filter((ticket) => String(ticket.accountId || "") === accountId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ success: true, tickets });
  } catch (error) {
    console.error("Erreur lecture tickets support :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de charger les demandes."
    });
  }
});


app.post("/api/founder/support/:id/replies", requireFounderKey, (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "La réponse ne peut pas être vide."
      });
    }

    const tickets = readJsonArray(supportTicketsPath);
    const ticket = tickets.find(
      (item) => item.id === req.params.id || item.ticketId === req.params.id
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket introuvable."
      });
    }

    if (!Array.isArray(ticket.replies)) ticket.replies = [];

    const reply = {
      id: `reply_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      sender: "founder",
      message,
      createdAt: new Date().toISOString()
    };

    ticket.replies.push(reply);
    ticket.status = ticket.status === "resolved" || ticket.status === "closed"
      ? ticket.status
      : "in_progress";
    ticket.updatedAt = new Date().toISOString();

    writeJsonArray(supportTicketsPath, tickets);

    return res.status(201).json({
      success: true,
      ticket,
      reply
    });
  } catch (error) {
    console.error("Erreur réponse support Founder :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d'enregistrer la réponse."
    });
  }
});

app.delete("/api/founder/support/:id", requireFounderKey, (req, res) => {
  try {
    const tickets = readJsonArray(supportTicketsPath);
    const nextTickets = tickets.filter(
      (item) => item.id !== req.params.id && item.ticketId !== req.params.id
    );

    if (nextTickets.length === tickets.length) {
      return res.status(404).json({
        success: false,
        message: "Ticket introuvable."
      });
    }

    writeJsonArray(supportTicketsPath, nextTickets);

    return res.json({
      success: true,
      message: "Ticket supprimé."
    });
  } catch (error) {
    console.error("Erreur suppression ticket Founder :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de supprimer le ticket."
    });
  }
});

app.get("/api/founder/support", requireFounderKey, (_req, res) => {
  const items = readJsonArray(supportTicketsPath)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ success: true, items, tickets: items });
});

app.patch("/api/founder/support/:id/status", requireFounderKey, (req, res) => {
  const tickets = readJsonArray(supportTicketsPath);
  const ticket = tickets.find(
    (item) => item.id === req.params.id || item.ticketId === req.params.id
  );

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket introuvable."
    });
  }

  ticket.status = String(req.body.status || "open");
  ticket.updatedAt = new Date().toISOString();
  writeJsonArray(supportTicketsPath, tickets);

  res.json({ success: true, ticket });
});

app.get("/api/founder/notifications", requireFounderKey, (_req, res) => {
  const items = readJsonArray(founderNotificationsPath)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ success: true, items, notifications: items });
});

app.patch("/api/founder/notifications/read-all", requireFounderKey, (_req, res) => {
  const notifications = readJsonArray(founderNotificationsPath).map((item) => ({
    ...item,
    read: true,
    readAt: item.readAt || new Date().toISOString()
  }));

  writeJsonArray(founderNotificationsPath, notifications);
  res.json({ success: true });
});

app.patch("/api/founder/notifications/:id/read", requireFounderKey, (req, res) => {
  const notifications = readJsonArray(founderNotificationsPath);
  const notification = notifications.find((item) => item.id === req.params.id);

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification introuvable."
    });
  }

  notification.read = true;
  notification.readAt = new Date().toISOString();
  writeJsonArray(founderNotificationsPath, notifications);

  res.json({ success: true, notification });
});

app.delete("/api/founder/notifications", requireFounderKey, (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];

  if (!ids.length) {
    return res.status(400).json({
      success: false,
      message: "Aucune notification sélectionnée."
    });
  }

  const notifications = readJsonArray(founderNotificationsPath);
  const selectedIds = new Set(ids);
  const remaining = notifications.filter((item) => !selectedIds.has(String(item.id || "")));
  const deletedCount = notifications.length - remaining.length;

  writeJsonArray(founderNotificationsPath, remaining);

  return res.json({
    success: true,
    deletedCount,
    remainingCount: remaining.length
  });
});




/* =========================
   FOUNDER COHÉRENCE V5.1.6
========================= */

function sanitizeAccount(account, rootUserId) {
  if (!account || typeof account !== "object") return null;
  const normalized = {
    ...account,
    id: account.id || account.accountId,
    accountId: account.accountId || account.id
  };
  return sanitizeAccountSecrets(normalized, rootUserId);
}

function sanitizeFounderAccount(account, userId) {
  return sanitizeAccountSecrets(account, userId);
}

function getLocalFounderState() {
  const rootUsers = readJsonArray(usersPath);
  const packs = readJsonArray(packsPath);
  const tickets = readJsonArray(supportTicketsPath);
  const notifications = readJsonArray(founderNotificationsPath);

  const accounts = rootUsers.flatMap((rootUser) =>
    Array.isArray(rootUser.accounts)
      ? rootUser.accounts.map((account) => sanitizeFounderAccount(account, rootUser.id))
      : []
  ).filter(Boolean);

  return { rootUsers, accounts, packs, tickets, notifications };
}


function recordLocalPlatformActivity(requestedAccountId, occurredAt) {
  const rootUsers = readJsonArray(usersPath);
  let foundAccount = null;

  for (const rootUser of rootUsers) {
    foundAccount = Array.isArray(rootUser.accounts)
      ? rootUser.accounts.find((account) =>
          String(account.accountId || account.id || "") === String(requestedAccountId)
        )
      : null;
    if (foundAccount) break;
  }

  if (!foundAccount) return { found: false, recorded: false };

  const recorded = applyPlatformActivity(foundAccount, occurredAt);
  if (recorded) writeJsonArray(usersPath, rootUsers);

  return {
    found: true,
    recorded,
    day: platformGrowthDayKey(occurredAt)
  };
}

registerPlatformGrowth({
  app,
  environment: "local",
  requireFounder: requireFounderKey,
  getAccounts: async () => getLocalFounderState().accounts,
  recordActivity: async (accountId, occurredAt) =>
    recordLocalPlatformActivity(accountId, occurredAt),
  financeApi: founderFinance
});

app.get("/api/founder/health", requireFounderKey, (_req, res) => {
  try {
    const state = getLocalFounderState();

    return res.json({
      success: true,
      environment: "local",
      database: "json",
      storage: {
        users: fs.existsSync(usersPath),
        packs: fs.existsSync(packsPath),
        support: fs.existsSync(supportTicketsPath),
        notifications: fs.existsSync(founderNotificationsPath)
      },
      counts: {
        users: state.accounts.length,
        packs: state.packs.length,
        tickets: state.tickets.length,
        notifications: state.notifications.length
      },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get("/api/founder/overview", requireFounderKey, (_req, res) => {
  const { accounts, packs, tickets, notifications } = getLocalFounderState();

  const counts = {
    unreadNotifications: notifications.filter((item) => !item.read).length,
    urgent: notifications.filter((item) => item.priority === "urgent" && !item.read).length,
    openTickets: tickets.filter((item) => ["open", "in_progress"].includes(item.status)).length,
    pendingArtists: accounts.filter((item) =>
      item.status === "pending" && ["artist", "both"].includes(item.role)
    ).length,
    pendingPacks: packs.filter((item) => item.status === "pending").length,
    users: accounts.length,
    approvedPacks: packs.filter((item) => item.status === "approved").length
  };

  return res.json({
    success: true,
    counts,
    stats: counts,
    recentNotifications: notifications
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8)
  });
});



function findLocalAppealAccount(accountId) {
  const requestedId = String(accountId || "").trim();
  const rootUsers = readJsonArray(usersPath);

  for (const rootUser of rootUsers) {
    const account = Array.isArray(rootUser.accounts)
      ? rootUser.accounts.find((item) =>
          String(item.accountId || item.id || "") === requestedId
        )
      : null;

    if (account) return { rootUsers, rootUser, account };
  }

  return { rootUsers, rootUser: null, account: null };
}

function normalizeDecisionType(value) {
  const type = String(value || "other").trim().toLowerCase();
  const allowed = new Set([
    "artist_rejection",
    "pack_rejection",
    "suspension",
    "ban",
    "creator_access_removed",
    "other"
  ]);
  return allowed.has(type) ? type : "other";
}

function createModerationDecisionNotice({
  accountId,
  decisionType,
  resourceId = null,
  reason,
  initialDecision = "rejected",
  environment = "local"
}) {
  const target = findLocalAppealAccount(accountId);
  if (!target.account) return null;

  const now = new Date().toISOString();
  const safeReason = String(reason || "La demande ne respecte pas les critères de validation Sonara.").trim();
  const record = {
    id: `decision_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    appealId: null,
    recordType: "decision_notice",
    appealSubmitted: false,
    active: false,
    accountId: String(target.account.accountId || target.account.id || ""),
    userId: String(target.rootUser.id || ""),
    rootUserId: String(target.rootUser.id || ""),
    email: String(target.account.mail || target.account.email || "").trim().toLowerCase(),
    mail: String(target.account.mail || target.account.email || "").trim().toLowerCase(),
    pseudo: String(target.account.pseudo || target.account.artistname || "").trim(),
    role: String(target.account.originalRole || target.account.role || "user"),
    decisionType: normalizeDecisionType(decisionType),
    resourceId: resourceId ? String(resourceId) : null,
    initialDecision: String(initialDecision || "rejected"),
    initialReason: safeReason,
    hiddenContentCount: Number(target.account.hiddenPackCount || 0),
    hiddenPackIds: Array.isArray(target.account.hiddenPackIds) ? target.account.hiddenPackIds : [],
    message: "",
    environment,
    status: "decision_sent",
    initialNoticeRead: false,
    finalDecisionRead: true,
    createdAt: now,
    updatedAt: now,
    history: [{
      type: "initial_decision",
      decision: String(initialDecision || "rejected"),
      reason: safeReason,
      createdAt: now,
      source: "founder"
    }]
  };

  const appeals = readJsonArray(moderationAppealsPath);
  appeals.unshift(record);
  writeJsonArray(moderationAppealsPath, appeals);

  target.account.moderationNotice = {
    id: record.id,
    type: "moderation_decision",
    decisionType: record.decisionType,
    resourceId: record.resourceId,
    reason: record.initialReason,
    createdAt: now,
    read: false
  };
  target.rootUser.updatedAt = now;
  writeJsonArray(usersPath, target.rootUsers);

  return record;
}

function publicAppealRecord(record) {
  if (!record || typeof record !== "object") return null;
  const copy = { ...record };
  delete copy._id;
  return copy;
}

function getLocalAppealById(items, requestedId) {
  const id = String(requestedId || "");
  return items.find((item) =>
    String(item.id || "") === id || String(item.appealId || "") === id
  );
}

async function sendLocalAppealEmail(to, subject, message) {
  const email = String(to || "").trim();
  if (!email || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return false;

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject,
      text: String(message || "")
    });
    return true;
  } catch (error) {
    console.error("Erreur e-mail contestation locale :", error.message);
    return false;
  }
}

app.get("/api/appeals/decisions/:accountId", (req, res) => {
  const accountId = String(req.params.accountId || "").trim();
  if (!accountId) return res.status(400).json({ success: false, message: "Compte obligatoire." });

  const items = readJsonArray(moderationAppealsPath)
    .filter((item) => String(item.accountId || "") === accountId)
    .filter((item) =>
      (item.appealSubmitted !== true && item.initialNoticeRead !== true) ||
      (item.appealSubmitted === true && item.active === false && item.finalResponse && item.finalDecisionRead !== true)
    )
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .map(publicAppealRecord);

  return res.json({ success: true, items, decisions: items });
});

app.post("/api/appeals", (req, res) => {
  const accountId = String(req.body?.accountId || "").trim();
  const decisionId = String(req.body?.decisionId || "").trim();
  const message = String(req.body?.message || "").trim();

  if (!accountId || !decisionId || message.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Décision, compte et message de contestation d’au moins 10 caractères obligatoires."
    });
  }

  const appeals = readJsonArray(moderationAppealsPath);
  const appeal = getLocalAppealById(appeals, decisionId);

  if (!appeal || String(appeal.accountId || "") !== accountId) {
    return res.status(404).json({ success: false, message: "Décision introuvable pour ce compte." });
  }

  if (appeal.appealSubmitted === true) {
    return res.status(409).json({ success: false, message: "Cette décision a déjà été contestée." });
  }

  const now = new Date().toISOString();
  appeal.appealId = `appeal_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  appeal.recordType = "appeal";
  appeal.appealSubmitted = true;
  appeal.active = true;
  appeal.message = message;
  appeal.status = "pending";
  appeal.submittedAt = now;
  appeal.updatedAt = now;
  appeal.initialNoticeRead = true;
  appeal.history = Array.isArray(appeal.history) ? appeal.history : [];
  appeal.history.push({ type: "appeal_submitted", message, createdAt: now, source: "user" });

  writeJsonArray(moderationAppealsPath, appeals);
  createLocalFounderNotification({
    type: "moderation_appeal",
    title: "Nouvelle contestation",
    message: `${appeal.pseudo || appeal.email || appeal.accountId} conteste une décision ${appeal.decisionType}.`,
    entityId: appeal.appealId,
    priority: "important"
  });

  return res.status(201).json({ success: true, appeal: publicAppealRecord(appeal), item: publicAppealRecord(appeal) });
});

app.post("/api/appeals/:id/forfeit", (req, res) => {
  try {
    const accountId = String(req.body?.accountId || "").trim();
    if (!accountId) {
      return res.status(400).json({ success: false, message: "Compte obligatoire." });
    }
    const appeals = readJsonArray(moderationAppealsPath);
    const item = getLocalAppealById(appeals, req.params.id);

    if (!item || (accountId && String(item.accountId || "") !== accountId)) {
      return res.status(404).json({ success: false, message: "Décision introuvable." });
    }
    if (String(item.decisionType || "").toLowerCase() !== "ban") {
      return res.status(400).json({ success: false, message: "Seul un bannissement peut être abandonné définitivement." });
    }
    if (item.appealSubmitted === true) {
      return res.status(409).json({ success: false, message: "La contestation a déjà été envoyée : les données restent en quarantaine." });
    }

    const deletion = permanentlyDeleteLocalBannedArtist(item.accountId, {
      reason: "Opportunité de contestation abandonnée par l’artiste"
    });

    return res.json({
      success: true,
      permanentlyDeleted: true,
      message: "Le compte artiste et tout son contenu ont été supprimés définitivement.",
      deletion
    });
  } catch (error) {
    console.error("Erreur abandon bannissement local :", error);
    return res.status(500).json({ success: false, message: error.message || "Suppression définitive impossible." });
  }
});

app.patch("/api/appeals/:id/read", (req, res) => {
  const accountId = String(req.body?.accountId || "").trim();
  const stage = String(req.body?.stage || "initial").toLowerCase();
  const appeals = readJsonArray(moderationAppealsPath);
  const item = getLocalAppealById(appeals, req.params.id);

  if (!item || (accountId && String(item.accountId || "") !== accountId)) {
    return res.status(404).json({ success: false, message: "Décision introuvable." });
  }

  const now = new Date().toISOString();
  if (stage === "final") {
    item.finalDecisionRead = true;
    item.finalDecisionReadAt = now;
  } else {
    item.initialNoticeRead = true;
    item.initialNoticeReadAt = now;
  }
  item.updatedAt = now;
  writeJsonArray(moderationAppealsPath, appeals);
  return res.json({ success: true });
});

app.get("/api/founder/appeals", requireFounderKey, (_req, res) => {
  const items = readJsonArray(moderationAppealsPath)
    .filter((item) => item.appealSubmitted === true && item.active === true && item.status === "pending")
    .sort((a, b) => new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0))
    .map(publicAppealRecord);
  return res.json({ success: true, items, appeals: items });
});

app.get("/api/founder/appeals/:id", requireFounderKey, (req, res) => {
  const item = getLocalAppealById(readJsonArray(moderationAppealsPath), req.params.id);
  if (!item || item.appealSubmitted !== true) {
    return res.status(404).json({ success: false, message: "Contestation introuvable." });
  }
  return res.json({ success: true, item: publicAppealRecord(item), appeal: publicAppealRecord(item) });
});

app.patch("/api/founder/appeals/:id/decision", requireFounderKey, async (req, res) => {
  try {
    const appeals = readJsonArray(moderationAppealsPath);
    const appeal = getLocalAppealById(appeals, req.params.id);
    if (!appeal || appeal.appealSubmitted !== true || appeal.active !== true) {
      return res.status(404).json({ success: false, message: "Contestation active introuvable." });
    }

    const decision = String(req.body?.decision || "").toLowerCase();
    const action = String(req.body?.action || "maintain_decision").toLowerCase();
    const finalResponse = String(req.body?.message || "").trim();
    const customDecision = String(req.body?.customDecision || "").trim();
    const allowedActions = new Set([
      "restore_artist",
      "restore_pack",
      "allow_resubmission",
      "restore_creator",
      "reactivate",
      "lift_suspension",
      "maintain_decision",
      "maintain_refusal",
      "maintain_suspension",
      "maintain_ban",
      "custom"
    ]);

    if (!["accepted", "rejected"].includes(decision)) {
      return res.status(400).json({ success: false, message: "Décision finale invalide." });
    }
    if (!allowedActions.has(action)) {
      return res.status(400).json({ success: false, message: "Action de restauration invalide." });
    }
    if (!finalResponse) {
      return res.status(400).json({ success: false, message: "Le message envoyé à l’utilisateur est obligatoire." });
    }
    if (action === "custom" && !customDecision) {
      return res.status(400).json({ success: false, message: "La décision personnalisée doit être écrite." });
    }

    const target = findLocalAppealAccount(appeal.accountId);
    if (!target.account) {
      return res.status(404).json({ success: false, message: "Compte lié à la contestation introuvable." });
    }

    const expectedUserId = String(appeal.userId || appeal.rootUserId || "");
    const expectedEmail = String(appeal.email || appeal.mail || "").toLowerCase();
    const expectedPseudo = String(appeal.pseudo || "").toLowerCase();
    const actualUserId = String(target.rootUser.id || "");
    const actualEmail = String(target.account.mail || target.account.email || "").toLowerCase();
    const actualPseudo = String(target.account.pseudo || target.account.artistname || "").toLowerCase();

    if (
      (expectedUserId && expectedUserId !== actualUserId) ||
      (expectedEmail && expectedEmail !== actualEmail) ||
      (expectedPseudo && expectedPseudo !== actualPseudo)
    ) {
      return res.status(409).json({ success: false, message: "La cible a changé. Recharge la contestation avant de décider." });
    }

    if (decision === "rejected" && String(appeal.decisionType || "").toLowerCase() === "ban") {
      const deletion = permanentlyDeleteLocalBannedArtist(appeal.accountId, {
        reason: finalResponse,
        appealId: appeal.appealId || appeal.id
      });
      const emailSent = await sendLocalAppealEmail(
        appeal.email || appeal.mail,
        "Votre contestation Sonara a été rejetée",
        finalResponse
      );

      return res.json({
        success: true,
        permanentlyDeleted: true,
        message: "Contestation rejetée : compte artiste, contenus et données de modération supprimés définitivement.",
        deletion,
        emailSent
      });
    }

    const now = new Date().toISOString();
    const applied = [];

    if (decision === "accepted") {
      if (["restore_artist", "restore_creator"].includes(action)) {
        const originalRole = String(target.account.originalRole || target.account.role || appeal.role || "both").toLowerCase();
        target.account.role = originalRole === "artist" ? "artist" : "both";
        target.account.status = "approved";
        target.account.artistStatus = "approved";
        target.account.suspendedUntil = null;
        target.account.bannedAt = null;
        target.account.artistModeratedAt = now;
        applied.push("creator_access_restored");
      } else if (["reactivate", "lift_suspension"].includes(action)) {
        applyAccountControl(target.account, "reactivate", { reason: finalResponse });
        applied.push("account_reactivated");
      } else if (action === "allow_resubmission") {
        if (appeal.resourceId) {
          const packs = readJsonArray(packsPath);
          const pack = packs.find((item) => String(item.id || "") === String(appeal.resourceId || ""));
          if (pack) {
            pack.canResubmit = true;
            pack.resubmissionAuthorizedAt = now;
            writeJsonArray(packsPath, packs);
            applied.push("pack_resubmission_allowed");
          }
        } else {
          target.account.canResubmitArtist = true;
          applied.push("artist_resubmission_allowed");
        }
      }

      if (action === "restore_pack") {
        const packs = readJsonArray(packsPath);
        const pack = packs.find((item) => String(item.id || "") === String(appeal.resourceId || ""));
        if (!pack) return res.status(404).json({ success: false, message: "Pack lié à la contestation introuvable." });
        pack.status = "approved";
        pack.wasPublished = true;
        pack.publishedAt = pack.publishedAt || now;
        pack.moderatedAt = now;
        pack.restoredAt = now;
        pack.rejectionReason = null;
        writeJsonArray(packsPath, packs);
        applied.push("pack_restored");
      }
    }

    if (decision === "accepted" && String(appeal.decisionType || "").toLowerCase() === "ban") {
      if (!["reactivate", "lift_suspension"].includes(action)) {
        applyAccountControl(target.account, "reactivate", { reason: finalResponse });
        applied.push("account_reactivated");
      }

      const restoredContent = restoreArtistContentAfterBan(
        target.account.accountId || target.account.id
      );
      markAccountContentRestored(target.account, restoredContent);
      applied.push(`artist_content_restored:${restoredContent.count}`);
    }

    appendModerationHistory(target.account, {
      id: `appeal_history_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      action: `appeal_${action}`,
      reason: finalResponse,
      decision,
      appealId: appeal.appealId || appeal.id,
      staffId: String(req.body?.staffId || "founder"),
      staffEmail: String(req.body?.staffEmail || ""),
      staffRole: String(req.body?.staffRole || "founder"),
      rightsApplied: applied,
      createdAt: now,
      source: "appeal"
    });

    target.account.moderationNotice = {
      id: appeal.appealId || appeal.id,
      type: "appeal_decision",
      decision,
      action,
      customDecision: customDecision || null,
      message: finalResponse,
      createdAt: now,
      read: false
    };
    target.account.updatedAt = now;
    target.rootUser.updatedAt = now;
    writeJsonArray(usersPath, target.rootUsers);

    appeal.status = decision;
    appeal.active = false;
    appeal.decidedAt = now;
    appeal.updatedAt = now;
    appeal.finalDecision = decision;
    appeal.finalResponse = finalResponse;
    appeal.appliedAction = action;
    appeal.customDecision = customDecision || null;
    appeal.rightsApplied = applied;
    appeal.staffId = String(req.body?.staffId || "founder");
    appeal.staffEmail = String(req.body?.staffEmail || "");
    appeal.staffRole = String(req.body?.staffRole || "founder");
    appeal.finalDecisionRead = false;
    appeal.history = Array.isArray(appeal.history) ? appeal.history : [];
    appeal.history.push({
      type: "final_decision",
      decision,
      action,
      customDecision: customDecision || null,
      message: finalResponse,
      staffId: appeal.staffId,
      staffEmail: appeal.staffEmail,
      staffRole: appeal.staffRole,
      rightsApplied: applied,
      createdAt: now
    });

    writeJsonArray(moderationAppealsPath, appeals);
    const notifications = readJsonArray(founderNotificationsPath).filter((item) =>
      !(item.type === "moderation_appeal" && [appeal.id, appeal.appealId].includes(item.entityId))
    );
    writeJsonArray(founderNotificationsPath, notifications);

    const emailSent = await sendLocalAppealEmail(
      appeal.email || appeal.mail,
      decision === "accepted" ? "Votre contestation Sonara a été acceptée" : "Décision concernant votre contestation Sonara",
      finalResponse
    );

    return res.json({
      success: true,
      message: "Décision appliquée et contestation retirée de la liste active.",
      item: publicAppealRecord(appeal),
      appeal: publicAppealRecord(appeal),
      emailSent
    });
  } catch (error) {
    console.error("Erreur décision contestation locale :", error);
    return res.status(500).json({ success: false, message: error.message || "Impossible d’appliquer la décision." });
  }
});

app.delete("/api/founder/appeals/bulk", requireFounderKey, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ success: false, message: "Aucune contestation sélectionnée." });
  const selected = new Set(ids);
  const appeals = readJsonArray(moderationAppealsPath);
  const remaining = appeals.filter((item) =>
    !selected.has(String(item.id || "")) && !selected.has(String(item.appealId || ""))
  );
  const deletedCount = appeals.length - remaining.length;
  writeJsonArray(moderationAppealsPath, remaining);
  return res.json({ success: true, deletedCount, remainingCount: remaining.length });
});


app.delete("/api/founder/appeals/:id", requireFounderKey, (req, res) => {
  const requestedId = String(req.params.id || "");
  const appeals = readJsonArray(moderationAppealsPath);
  const remaining = appeals.filter((item) =>
    String(item.id || "") !== requestedId && String(item.appealId || "") !== requestedId
  );
  if (remaining.length === appeals.length) {
    return res.status(404).json({ success: false, message: "Contestation introuvable." });
  }
  writeJsonArray(moderationAppealsPath, remaining);
  return res.json({ success: true, deleted: true, id: requestedId });
});

app.get("/api/founder/moderation/artists", requireFounderKey, (_req, res) => {
  const { accounts } = getLocalFounderState();
  const items = accounts.filter((account) =>
    account.status === "pending" && ["artist", "both"].includes(account.role)
  );

  res.json({ success: true, items, artists: items });
});

app.get("/api/founder/moderation/packs", requireFounderKey, (_req, res) => {
  const { packs } = getLocalFounderState();
  const items = packs
    .filter((pack) => pack.status === "pending")
    .map((pack) => ({
      ...pack,
      license: normalizePackLicense(pack.license),
      licenseSummary: licenseModerationSummary(pack)
    }));

  res.json({ success: true, items, packs: items });
});

app.get("/api/founder/moderation/packs/:id/audio/:trackId", requireFounderKey, (req, res) => {
  const { packs } = getLocalFounderState();
  const pack = packs.find((item) =>
    String(item?.id || item?.packId || "") === String(req.params.id) &&
    String(item?.status || "") === "pending"
  );

  if (!pack) {
    return res.status(404).json({ success: false, message: "Pack introuvable." });
  }

  const track = (Array.isArray(pack.tracks) ? pack.tracks : []).find((item) =>
    String(item?.id || item?.trackId || "") === String(req.params.trackId)
  );

  const audioName = path.basename(String(track?.audioName || ""));
  if (!audioName) {
    return res.status(404).json({ success: false, message: "Audio introuvable." });
  }

  const uploadsRoot = path.resolve(__dirname, "uploads");
  const filePath = path.resolve(uploadsRoot, audioName);
  if (!filePath.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "Fichier audio introuvable." });
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Accept-Ranges", "bytes");
  return res.sendFile(filePath);
});

app.patch("/api/founder/moderation/:type/:id/status", requireFounderKey, (req, res) => {
  const type = String(req.params.type || "").toLowerCase();
  const requestedId = String(req.params.id || "");
  const status = String(req.body?.status || "");

  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Statut de modération invalide."
    });
  }

  if (["artist", "artists", "user", "users"].includes(type)) {
    const rootUsers = readJsonArray(usersPath);
    let updatedAccount = null;

    for (const rootUser of rootUsers) {
      const account = Array.isArray(rootUser.accounts)
        ? rootUser.accounts.find((item) =>
            String(item.id || "") === requestedId ||
            String(item.accountId || "") === requestedId
          )
        : null;

      if (!account) continue;

      const moderatedAt = new Date().toISOString();

      if (status === "rejected" && !account.originalRole) {
        account.originalRole = String(account.role || "user").toLowerCase();
      }

      if (
        status === "rejected" &&
        String(account.role || "").toLowerCase() === "both"
      ) {
        account.artistStatus = "rejected";
        account.artistModeratedAt = moderatedAt;
        account.role = "user";
        account.status = "approved";
      } else {
        account.status = status;
      }

      account.moderatedAt = moderatedAt;
      account.updatedAt = moderatedAt;
      rootUser.updatedAt = moderatedAt;
      updatedAccount = sanitizeFounderAccount(account, rootUser.id);
      break;
    }

    if (!updatedAccount) {
      return res.status(404).json({
        success: false,
        message: "Artiste introuvable."
      });
    }

    writeJsonArray(usersPath, rootUsers);
    if (status === "rejected") {
      createModerationDecisionNotice({
        accountId: updatedAccount.accountId || updatedAccount.id,
        decisionType: "artist_rejection",
        reason: req.body?.reason,
        initialDecision: "rejected",
        environment: "local"
      });
    }
    return res.json({ success: true, item: updatedAccount, account: updatedAccount });
  }

  if (["pack", "packs"].includes(type)) {
    const packs = readJsonArray(packsPath);
    const pack = packs.find((item) => String(item.id || "") === requestedId);

    if (!pack) {
      return res.status(404).json({ success: false, message: "Pack introuvable." });
    }

    if (status === "rejected") {
      const moderatedAt = new Date().toISOString();
      pack.status = "rejected";
      pack.rejectionReason = String(req.body?.reason || "La demande ne respecte pas les critères de validation Sonara.").trim();
      pack.moderatedAt = moderatedAt;
      pack.updatedAt = moderatedAt;
      writeJsonArray(packsPath, packs);

      createModerationDecisionNotice({
        accountId: pack.artistId,
        decisionType: "pack_rejection",
        resourceId: pack.id,
        reason: pack.rejectionReason,
        initialDecision: "rejected",
        environment: "local"
      });

      return res.json({ success: true, deleted: false, item: pack, pack });
    }


    pack.status = status;
    pack.moderatedAt = new Date().toISOString();
    writeJsonArray(packsPath, packs);

    return res.json({ success: true, item: pack, pack });
  }

  return res.status(400).json({
    success: false,
    message: "Type de modération invalide."
  });
});



function normalizeLocalModerationOwnerIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function localPackOwnerMatches(pack, ownerIds) {
  const values = new Set(normalizeLocalModerationOwnerIds(ownerIds));
  return [pack?.accountId, pack?.artistAccountId, pack?.artistId]
    .filter(Boolean)
    .some((value) => values.has(String(value)));
}

function hideArtistContentForBan(ownerIds, primaryAccountId, reason = "") {
  const values = normalizeLocalModerationOwnerIds(ownerIds);
  const ownerId = String(primaryAccountId || values[0] || "").trim();
  if (!ownerId || values.length === 0) return { count: 0, packIds: [] };

  const now = new Date().toISOString();
  const packs = readJsonArray(packsPath);
  const packIds = [];

  for (const pack of packs) {
    if (!localPackOwnerMatches(pack, values)) continue;

    if (
      isPackHiddenByModeration(pack) &&
      String(pack.moderationHiddenByAccountId || "") === ownerId
    ) {
      packIds.push(String(pack.id || ""));
      continue;
    }

    pack.moderationPreviousStatus = String(pack.status || "draft");
    pack.status = "moderation_hidden";
    pack.moderationHidden = true;
    pack.moderationHiddenAt = now;
    pack.moderationHiddenByAccountId = ownerId;
    pack.moderationHiddenReason = String(reason || "Bannissement artiste");
    pack.updatedAt = now;
    packIds.push(String(pack.id || ""));
  }

  writeJsonArray(packsPath, packs);
  return { count: packIds.length, packIds: packIds.filter(Boolean), hiddenAt: now };
}

function restoreArtistContentAfterBan(accountId) {
  const ownerId = String(accountId || "").trim();
  if (!ownerId) return { count: 0, packIds: [] };

  const now = new Date().toISOString();
  const packs = readJsonArray(packsPath);
  const packIds = [];

  for (const pack of packs) {
    if (
      pack.moderationHidden !== true ||
      String(pack.moderationHiddenByAccountId || "") !== ownerId
    ) continue;

    pack.status = String(pack.moderationPreviousStatus || "draft");
    pack.moderationRestoredAt = now;
    pack.updatedAt = now;
    delete pack.moderationHidden;
    delete pack.moderationHiddenAt;
    delete pack.moderationHiddenByAccountId;
    delete pack.moderationHiddenReason;
    delete pack.moderationPreviousStatus;
    packIds.push(String(pack.id || ""));
  }

  writeJsonArray(packsPath, packs);
  return { count: packIds.length, packIds: packIds.filter(Boolean), restoredAt: now };
}


function collectLocalArtistProfileFiles(account) {
  return [...new Set([
    account?.imageProfile,
    account?.imageArtist,
    account?.artistImage,
    account?.profileImage,
    account?.avatar
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => path.join(__dirname, "uploads", path.basename(value.trim())))
  )];
}

function localRecordBelongsToDeletedArtist(item, context) {
  if (!item || typeof item !== "object") return false;

  const ids = new Set([
    context.accountId,
    context.rootUserId,
    ...context.packIds,
    ...context.trackIds,
    ...context.appealIds,
    ...context.relatedRecordIds
  ].filter(Boolean).map(String));
  const emails = new Set([context.email].filter(Boolean).map((value) => String(value).toLowerCase()));

  const recordIds = [
    item.accountId,
    item.userId,
    item.rootUserId,
    item.entityId,
    item.packId,
    item.trackId,
    item.appealId,
    item.id,
    item?.metadata?.entityId,
    item?.metadata?.accountId,
    item?.metadata?.userId
  ].filter(Boolean).map(String);

  if (recordIds.some((value) => ids.has(value))) return true;

  const recordEmails = [item.email, item.mail]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return recordEmails.some((value) => emails.has(value));
}

function permanentlyDeleteLocalBannedArtist(accountId, options = {}) {
  const requestedAccountId = String(accountId || "").trim();
  if (!requestedAccountId) throw new Error("Compte artiste obligatoire pour la suppression définitive.");

  const target = findLocalAppealAccount(requestedAccountId);
  const account = target.account;
  const rootUser = target.rootUser;

  if (!account || !rootUser) {
    return {
      alreadyDeleted: true,
      accountId: requestedAccountId,
      deletedPackCount: 0,
      deletedR2KeyCount: 0
    };
  }

  const status = String(account.status || "").toLowerCase();
  const artistStatus = String(account.artistStatus || "").toLowerCase();
  if (status !== "banned" && artistStatus !== "banned") {
    throw new Error("La suppression définitive est réservée à un compte artiste banni.");
  }

  const ownerIds = normalizeLocalModerationOwnerIds([
    requestedAccountId,
    account.accountId,
    account.id
  ]);
  const packs = readJsonArray(packsPath);
  const deletedPacks = packs.filter((pack) => localPackOwnerMatches(pack, ownerIds));
  const packIds = deletedPacks.map((pack) => String(pack.id || "")).filter(Boolean);
  const trackIds = deletedPacks.flatMap((pack) =>
    (Array.isArray(pack.tracks) ? pack.tracks : [])
      .map((track) => String(track?.id || ""))
      .filter(Boolean)
  );

  const deletedFiles = [];
  for (const pack of deletedPacks) {
    deletedFiles.push(...deleteRejectedLocalPackFiles(pack));
    deleteLocalPackNotifications(pack.id);
  }
  for (const filePath of collectLocalArtistProfileFiles(account)) {
    if (safeDeleteFile(filePath)) deletedFiles.push(filePath);
  }

  writeJsonArray(
    packsPath,
    packs.filter((pack) => !localPackOwnerMatches(pack, ownerIds))
  );

  const packIdSet = new Set(packIds);
  const trackIdSet = new Set(trackIds);
  for (const currentRoot of target.rootUsers) {
    for (const currentAccount of Array.isArray(currentRoot.accounts) ? currentRoot.accounts : []) {
      if (Array.isArray(currentAccount.downloadedPacks)) {
        currentAccount.downloadedPacks = currentAccount.downloadedPacks.filter(
          (id) => !packIdSet.has(String(id))
        );
      }
      if (Array.isArray(currentAccount.downloadedTracks)) {
        currentAccount.downloadedTracks = currentAccount.downloadedTracks.filter(
          (id) => !trackIdSet.has(String(id))
        );
      }
    }
  }

  rootUser.accounts = (Array.isArray(rootUser.accounts) ? rootUser.accounts : []).filter(
    (currentAccount) => !ownerIds.includes(String(currentAccount.accountId || currentAccount.id || ""))
  );
  const deleteWholeRootUser = rootUser.accounts.length === 0;

  const remainingRootUsers = target.rootUsers.filter((currentRoot) =>
    currentRoot !== rootUser || !deleteWholeRootUser
  );
  writeJsonArray(usersPath, remainingRootUsers);

  const appeals = readJsonArray(moderationAppealsPath);
  const deletedAppeals = appeals.filter((item) => String(item.accountId || "") === requestedAccountId);
  const appealIds = deletedAppeals.flatMap((item) => [item.id, item.appealId]).filter(Boolean).map(String);
  writeJsonArray(
    moderationAppealsPath,
    appeals.filter((item) => String(item.accountId || "") !== requestedAccountId)
  );

  const baseContext = {
    accountId: requestedAccountId,
    // Le userId général n’est purgé que si cet account était le dernier.
    rootUserId: deleteWholeRootUser ? String(rootUser.id || "") : "",
    email: String(account.mail || account.email || "").trim().toLowerCase(),
    packIds,
    trackIds,
    appealIds,
    relatedRecordIds: []
  };

  const tickets = readJsonArray(supportTicketsPath);
  const deletedTickets = tickets.filter((item) => localRecordBelongsToDeletedArtist(item, baseContext));
  const feedbackItems = readJsonArray(feedbackPath);
  const deletedFeedback = feedbackItems.filter((item) => localRecordBelongsToDeletedArtist(item, baseContext));
  const context = {
    ...baseContext,
    relatedRecordIds: [...deletedTickets, ...deletedFeedback]
      .flatMap((item) => [item.id, item.ticketId, item.reference])
      .filter(Boolean)
      .map(String)
  };

  writeJsonArray(
    supportTicketsPath,
    tickets.filter((item) => !localRecordBelongsToDeletedArtist(item, context))
  );
  writeJsonArray(
    feedbackPath,
    feedbackItems.filter((item) => !localRecordBelongsToDeletedArtist(item, context))
  );
  writeJsonArray(
    founderNotificationsPath,
    readJsonArray(founderNotificationsPath).filter((item) => !localRecordBelongsToDeletedArtist(item, context))
  );

  return {
    alreadyDeleted: false,
    accountId: requestedAccountId,
    rootUserDeleted: deleteWholeRootUser,
    deletedPackCount: packIds.length,
    deletedPackIds: packIds,
    deletedTrackCount: trackIds.length,
    deletedFileCount: deletedFiles.length,
    deletedAppealCount: deletedAppeals.length,
    reason: String(options.reason || "Bannissement confirmé sans recours").trim()
  };
}

function markAccountContentHidden(account, result, reason = "") {
  account.contentHiddenByModeration = true;
  account.contentHiddenAt = result.hiddenAt || new Date().toISOString();
  account.contentHiddenReason = String(reason || "Bannissement artiste");
  account.hiddenPackCount = Number(result.count || 0);
  account.hiddenPackIds = Array.isArray(result.packIds) ? result.packIds : [];
  account.contentRestoredAt = null;
}

function markAccountContentRestored(account, result) {
  account.contentHiddenByModeration = false;
  account.contentRestoredAt = result.restoredAt || new Date().toISOString();
  account.restoredPackCount = Number(result.count || 0);
  account.hiddenPackCount = 0;
  account.hiddenPackIds = [];
}

function getControlAccountRole(account) {
  const role = String(account.originalRole || account.role || "user").toLowerCase();

  if (
    role === "user" &&
    ["rejected", "banned", "suspended", "approved"].includes(
      String(account.artistStatus || "").toLowerCase()
    )
  ) {
    return "both";
  }

  return role;
}

function appendModerationHistory(account, entry) {
  if (!Array.isArray(account.moderationHistory)) {
    account.moderationHistory = [];
  }

  account.moderationHistory.unshift(entry);
  account.moderationHistory = account.moderationHistory.slice(0, 50);
}

function applyAccountControl(account, action, options = {}) {
  const now = new Date().toISOString();
  const reason = String(options.reason || "").trim();
  const durationDays = Math.max(1, Math.min(365, Number(options.durationDays) || 7));
  const controlledRole = getControlAccountRole(account);
  const previous = {
    role: account.role,
    status: account.status,
    artistStatus: account.artistStatus || null
  };

  if (!account.originalRole) {
    account.originalRole = controlledRole;
  }

  if (action === "ban") {
    if (controlledRole === "both") {
      account.role = "user";
      account.status = "approved";
      account.artistStatus = "banned";
    } else if (controlledRole === "artist") {
      account.role = "artist";
      account.status = "banned";
      account.artistStatus = "banned";
    } else {
      account.role = "user";
      account.status = "banned";
    }

    account.bannedAt = now;
    account.suspendedUntil = null;
  } else if (action === "suspend") {
    const suspendedUntil = new Date(
      Date.now() + durationDays * 24 * 60 * 60 * 1000
    ).toISOString();

    if (controlledRole === "both") {
      account.role = "user";
      account.status = "approved";
      account.artistStatus = "suspended";
    } else if (controlledRole === "artist") {
      account.role = "artist";
      account.status = "suspended";
      account.artistStatus = "suspended";
    } else {
      account.role = "user";
      account.status = "suspended";
    }

    account.suspendedAt = now;
    account.suspendedUntil = suspendedUntil;
  } else if (action === "remove_creator") {
    if (controlledRole === "both") {
      account.role = "user";
      account.status = "approved";
      account.artistStatus = "rejected";
    } else if (controlledRole === "artist") {
      account.role = "artist";
      account.status = "rejected";
      account.artistStatus = "rejected";
    } else {
      throw new Error("Ce compte ne possède pas d’accès Creator à retirer.");
    }
    account.artistModeratedAt = now;
    account.suspendedUntil = null;
  } else if (action === "reactivate") {
    account.status = "approved";
    account.suspendedUntil = null;
    account.bannedAt = null;

    if (controlledRole === "artist") {
      account.role = "artist";
      account.artistStatus = "approved";
    } else if (controlledRole === "both") {
      account.role = "both";
      account.artistStatus = "approved";
    } else {
      account.role = "user";
    }
  } else if (action === "restore_creator") {
    account.role = controlledRole === "artist" ? "artist" : "both";
    account.status = "approved";
    account.artistStatus = "approved";
    account.suspendedUntil = null;
    account.bannedAt = null;
    account.artistModeratedAt = now;
    account.moderationNotice = {
      id: `notice_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      type: "creator_access_restored",
      message:
        "Nous avons corrigé une erreur de modération. Désolé pour ce contretemps.",
      createdAt: now,
      read: false
    };
  } else {
    throw new Error("Action de contrôle invalide.");
  }

  account.updatedAt = now;

  appendModerationHistory(account, {
    id: `moderation_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    action,
    reason,
    durationDays: action === "suspend" ? durationDays : null,
    previous,
    next: {
      role: account.role,
      status: account.status,
      artistStatus: account.artistStatus || null
    },
    createdAt: now,
    source: "founder"
  });

  return account;
}


app.get(
  "/api/founder/account-changes",
  requireFounderKey,
  (req, res) => {
    const requestedLimit = Number(
      req.query?.limit || 100
    );

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit)
          ? requestedLimit
          : 100,
        1
      ),
      500
    );

    const items = [];

    for (
      const rootUser
      of readJsonArray(usersPath)
    ) {
      for (
        const account
        of Array.isArray(rootUser.accounts)
          ? rootUser.accounts
          : []
      ) {
        const sync = account.founderSync;

        if (sync?.pending !== true) {
          continue;
        }

        const snapshot =
          sync.account ||
          createFounderAccountSyncSnapshot(
            account,
            rootUser
          );

        items.push({
          eventId: sync.eventId,
          revision: sync.revision,
          environment: sync.environment,
          source: sync.source,
          accountId: String(
            snapshot.accountId ||
            account.accountId ||
            account.id ||
            ""
          ),
          userId: String(
            snapshot.userId ||
            rootUser.id ||
            rootUser.userId ||
            ""
          ),
          changeTypes: sync.changeTypes || [],
          changedFields: sync.changedFields || [],
          previousValues: sync.previousValues || {},
          queuedAt: sync.queuedAt,
          updatedAt: sync.updatedAt,
          containsPassword: false,
          account: snapshot
        });
      }
    }

    items.sort(
      (left, right) =>
        new Date(left.queuedAt || 0) -
        new Date(right.queuedAt || 0)
    );

    return res.json({
      success: true,
      items: items.slice(0, limit),
      pending: items.length
    });
  }
);

app.patch(
  "/api/founder/account-changes/:id/ack",
  requireFounderKey,
  async (req, res) => {
    try {
      const result =
        await findRootAndAccountById(
          req.params.id
        );

      if (!result?.account) {
        return res.status(404).json({
          success: false,
          message: "Compte introuvable."
        });
      }

      const currentSync =
        result.account.founderSync;

      if (!currentSync?.pending) {
        return res.json({
          success: true,
          alreadySynced: true
        });
      }

      const expectedEventId = String(
        req.body?.eventId || ""
      ).trim();

      if (
        expectedEventId &&
        expectedEventId !==
          String(currentSync.eventId || "")
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Une modification plus récente attend encore Founder."
        });
      }

      const now = new Date().toISOString();

      result.account.founderSync = {
        ...currentSync,
        pending: false,
        syncedAt: now,
        founderRecordId:
          String(
            req.body?.founderRecordId || ""
          ).trim() || null,
        lastEventId:
          currentSync.eventId,
        updatedAt: now
      };

      await saveAccountState(
        result.rootUser,
        result.account
      );

      return res.json({
        success: true,
        accountId:
          result.account.accountId ||
          result.account.id,
        eventId: currentSync.eventId,
        revision: currentSync.revision,
        founderRecordId:
          result.account.founderSync
            .founderRecordId,
        syncedAt: now
      });
    } catch (error) {
      console.error(
        "Erreur ACK changement compte Founder :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible de confirmer la sauvegarde Founder."
      });
    }
  }
);

app.get("/api/founder/license-incidents", requireFounderKey, async (_req, res) => {
  const incidents = await licenseProtection.recordsByType("RIGHTS_INCIDENT", 300);
  const packs = readJsonArray(packsPath);
  const enriched = await Promise.all(incidents.map(async (incident) => {
    const pack = packs.find((item) => String(item?.id || "") === String(incident.packId || ""));
    const track = pack?.tracks?.find((item) => String(item?.id || "") === String(incident.trackId || ""));
    const receipt = incident.downloadId
      ? await licenseProtection.findReceiptByDownloadId(incident.downloadId)
      : null;
    return {
      ...incident,
      packTitle: pack?.title || pack?.name || receipt?.packTitleSnapshot || null,
      trackTitle: track?.title || track?.name || receipt?.trackTitleSnapshot || null,
      licenseReceiptId: receipt?.licenseReceiptId || null,
      licenseVersion: receipt?.licenseVersion || null,
      originalFileHash: receipt?.originalFileHash || receipt?.originalFileHashes?.[0]?.originalFileHash || null
    };
  }));
  return res.json({ success: true, items: enriched, incidents: enriched, connectedEnvironment: "local" });
});

app.post("/api/founder/license-incidents", requireFounderKey, async (req, res) => {
  try {
    const downloadReceipt = req.body?.downloadId
      ? await licenseProtection.findReceiptByDownloadId(req.body.downloadId)
      : null;
    const packId = String(req.body?.packId || downloadReceipt?.packId || "").trim();
    const externalPlatform = String(req.body?.externalPlatform || "").trim();
    const externalUrl = String(req.body?.externalUrl || "").trim();
    if (!packId || !externalPlatform || !externalUrl) {
      return res.status(400).json({ success: false, message: "Pack, plateforme et URL externe sont obligatoires." });
    }
    const pack = readJsonArray(packsPath).find((item) => String(item?.id || "") === packId);
    if (!pack) return res.status(404).json({ success: false, message: "Pack introuvable." });
    const incident = await licenseProtection.createIncident({
      incidentType: req.body?.incidentType || "UNAUTHORIZED_MUSIC_REPUBLICATION",
      reporterUserId: "founder",
      reporterAccountId: "founder",
      reportedUserId: req.body?.reportedUserId || downloadReceipt?.userId || null,
      reportedAccountId: req.body?.reportedAccountId || downloadReceipt?.accountId || null,
      artistId: pack.accountId || pack.artistAccountId || pack.artistId || downloadReceipt?.artistId || null,
      packId,
      trackId: req.body?.trackId || downloadReceipt?.trackId || null,
      downloadId: req.body?.downloadId || null,
      externalPlatform,
      externalUrl,
      reason: req.body?.reason || req.body?.description || "Signalement interne Founder",
      evidence: req.body?.evidence || []
    });
    return res.status(201).json({ success: true, incident });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Impossible de créer l’incident." });
  }
});

app.patch("/api/founder/license-incidents/:id", requireFounderKey, async (req, res) => {
  try {
    const incident = await licenseProtection.reviewIncident(req.params.id, {
      status: req.body?.status,
      reviewedBy: req.body?.staffId || req.body?.reviewedBy || "founder",
      reviewNotes: req.body?.reviewNotes || ""
    });
    return res.json({ success: true, incident });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

app.post("/api/founder/license-incidents/:id/sanctions", requireFounderKey, async (req, res) => {
  try {
    const incident = await licenseProtection.getIncident(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: "Incident introuvable." });
    if (incident.status !== "CONFIRMED") {
      return res.status(409).json({ success: false, message: "Une sanction exige un incident confirmé humainement." });
    }
    const accountId = String(req.body?.accountId || incident.reportedAccountId || "").trim();
    const target = findRootAndAccountById(accountId);
    if (!target?.account) return res.status(404).json({ success: false, message: "Compte concerné introuvable." });
    const level = String(req.body?.level || "").toUpperCase();
    const reason = String(req.body?.reason || incident.reason || "Violation de licence confirmée").trim();
    const now = new Date().toISOString();
    if (level === "WARNING") {
      appendModerationHistory(target.account, { id: `license_warning_${Date.now()}`, action: "license_warning", reason, incidentId: incident.incidentId, createdAt: now, source: "license_incident" });
    } else if (level === "DOWNLOAD_RESTRICTED") {
      target.account.licenseDownloadRestriction = { active: true, incidentId: incident.incidentId, reason, appliedAt: now };
      appendModerationHistory(target.account, { id: `license_download_restriction_${Date.now()}`, action: "download_restricted", reason, incidentId: incident.incidentId, createdAt: now, source: "license_incident" });
    } else if (level === "TEMPORARY_SUSPENSION") {
      applyAccountControl(target.account, "suspend", { reason, durationDays: req.body?.durationDays || 7 });
    } else if (level === "PERMANENT_BAN") {
      applyAccountControl(target.account, "ban", { reason });
      const hidden = hideArtistContentForBan([target.account.accountId, target.account.id], target.account.accountId || target.account.id, reason);
      markAccountContentHidden(target.account, hidden, reason);
    } else {
      return res.status(400).json({ success: false, message: "Niveau de sanction invalide." });
    }
    target.account.updatedAt = now;
    await saveAccountState(target.rootUser, target.account);
    const sanction = await licenseProtection.createSanction({
      incidentId: incident.incidentId,
      accountId: target.account.accountId || target.account.id,
      userId: target.rootUser.id || null,
      level,
      reason,
      appliedBy: req.body?.staffId || "founder",
      durationDays: req.body?.durationDays || null
    });
    return res.json({ success: true, sanction, account: sanitizeFounderAccount(target.account, target.rootUser.id) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Impossible d’appliquer la sanction." });
  }
});

app.get("/api/founder/accounts", requireFounderKey, async (_req, res) => {
  const rootUsers = readJsonArray(usersPath);
  const accounts = [];

  for (const rootUser of rootUsers) {
    for (const account of Array.isArray(rootUser.accounts) ? rootUser.accounts : []) {
      const accountId = account.accountId || account.id;
      const role = String(account.originalRole || account.role || "user").toLowerCase();
      accounts.push({
        ...sanitizeFounderAccount(account, rootUser.id),
        artistStatus: account.artistStatus || null,
        originalRole: account.originalRole || null,
        suspendedUntil: account.suspendedUntil || null,
        moderationHistory: Array.isArray(account.moderationHistory)
          ? account.moderationHistory.slice(0, 5)
          : [],
        licenseEvidence: await licenseProtection.accountEvidence(accountId, rootUser.id),
        artistLicenseEvidence: ["artist", "both"].includes(role)
          ? await licenseProtection.artistEvidence(accountId)
          : null
      });
    }
  }

  accounts.sort((a, b) =>
    new Date(b.updatedAt || b.createdAt || 0) -
    new Date(a.updatedAt || a.createdAt || 0)
  );

  return res.json({ success: true, items: accounts, accounts });
});

app.patch(
  "/api/founder/accounts/:id/control",
  requireFounderKey,
  (req, res) => {
    try {
      const requestedId = String(req.params.id || "");
      const action = String(req.body?.action || "").toLowerCase();

      if (!["ban", "suspend", "remove_creator", "reactivate", "restore_creator"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Action de contrôle invalide."
        });
      }

      if (["ban", "suspend", "remove_creator"].includes(action) && !String(req.body?.reason || "").trim()) {
        return res.status(400).json({
          success: false,
          message: "Un motif précis est obligatoire pour cette sanction."
        });
      }

      const rootUsers = readJsonArray(usersPath);
      let rootUser = null;
      let account = null;

      for (const currentRootUser of rootUsers) {
        const found = Array.isArray(currentRootUser.accounts)
          ? currentRootUser.accounts.find((item) =>
              String(item.id || item.accountId || "") === requestedId
            )
          : null;

        if (found) {
          rootUser = currentRootUser;
          account = found;
          break;
        }
      }

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Compte introuvable."
        });
      }

      const expectedUserId = String(req.body?.expectedUserId || "").trim();
      const expectedMail = String(req.body?.expectedMail || "").trim().toLowerCase();
      const expectedPseudo = String(req.body?.expectedPseudo || "").trim().toLowerCase();
      const actualUserId = String(rootUser.id || "");
      const actualMail = String(account.mail || "").trim().toLowerCase();
      const actualPseudo = String(account.pseudo || account.artistname || "").trim().toLowerCase();

      if (
        (expectedUserId && expectedUserId !== actualUserId) ||
        (expectedMail && expectedMail !== actualMail) ||
        (expectedPseudo && expectedPseudo !== actualPseudo)
      ) {
        return res.status(409).json({
          success: false,
          message: "La cible a changé. Recharge la liste avant de modérer ce compte."
        });
      }

      if (action === "restore_creator" && getControlAccountRole(account) === "user" && !account.artistStatus) {
        return res.status(400).json({
          success: false,
          message: "Ce compte n’a jamais eu d’accès Creator à restaurer."
        });
      }

      applyAccountControl(account, action, req.body || {});

      if (action === "ban") {
        const hidden = hideArtistContentForBan(
          [account.accountId, account.id],
          account.accountId || account.id,
          req.body?.reason
        );
        markAccountContentHidden(account, hidden, req.body?.reason);
      } else if (["reactivate", "restore_creator"].includes(action)) {
        const restored = restoreArtistContentAfterBan(account.accountId || account.id);
        markAccountContentRestored(account, restored);
      }

      rootUser.updatedAt = account.updatedAt;
      writeJsonArray(usersPath, rootUsers);

      if (["ban", "suspend", "remove_creator"].includes(action)) {
        createModerationDecisionNotice({
          accountId: account.accountId || account.id,
          decisionType: action === "ban" ? "ban" : action === "suspend" ? "suspension" : "creator_access_removed",
          reason: req.body?.reason,
          initialDecision: action,
          environment: "local"
        });
      }

      const returnedAccount = {
        ...sanitizeFounderAccount(account, rootUser.id),
        artistStatus: account.artistStatus || null,
        originalRole: account.originalRole || null,
        suspendedUntil: account.suspendedUntil || null,
        moderationHistory: account.moderationHistory || []
      };

      return res.json({
        success: true,
        message: "Décision de modération appliquée.",
        account: returnedAccount,
        item: returnedAccount
      });
    } catch (error) {
      console.error("Erreur contrôle compte Founder :", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Impossible de contrôler ce compte."
      });
    }
  }
);

app.patch("/api/profile/:id/moderation-notice/read", (req, res) => {
  try {
    const requestedId = String(req.params.id || "");
    const rootUsers = readJsonArray(usersPath);
    let account = null;

    for (const rootUser of rootUsers) {
      account = Array.isArray(rootUser.accounts)
        ? rootUser.accounts.find((item) =>
            String(item.id || item.accountId || "") === requestedId
          )
        : null;

      if (account) break;
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Compte introuvable."
      });
    }

    if (account.moderationNotice) {
      account.moderationNotice.read = true;
      account.moderationNotice.readAt = new Date().toISOString();
    }

    writeJsonArray(usersPath, rootUsers);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Impossible de confirmer la notice."
    });
  }
});


/* =========================
   FEEDBACK SONARA -> FOUNDER
========================= */

const feedbackPath = path.join(__dirname, "data", "feedback.json");

app.post("/api/feedback", (req, res) => {
  try {
    const {
      rootUserId = "",
      accountId = "",
      pseudo = "",
      email = "",
      role = "user",
      type = "general",
      rating = 0,
      title = "",
      message = "",
      page = ""
    } = req.body || {};

    const cleanTitle = String(title).trim();
    const cleanMessage = String(message).trim();

    if (cleanTitle.length < 3 || cleanMessage.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Titre et commentaire obligatoires."
      });
    }

    const items = readJsonArray(feedbackPath);
    const createdAt = new Date().toISOString();

    const feedback = {
      id: `feedback_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      reference: `FB-${Date.now().toString().slice(-8)}`,
      rootUserId: String(rootUserId),
      accountId: String(accountId),
      pseudo: String(pseudo).trim(),
      email: String(email).trim().toLowerCase(),
      role: String(role),
      type: String(type || "general"),
      rating: Math.min(5, Math.max(0, Number(rating) || 0)),
      title: cleanTitle,
      message: cleanMessage,
      page: String(page),
      status: "new",
      replies: [],
      createdAt,
      updatedAt: createdAt
    };

    items.unshift(feedback);
    writeJsonArray(feedbackPath, items);

    createLocalFounderNotification({
      type: "feedback",
      title: "Nouveau feedback",
      message: `${feedback.pseudo || feedback.email || "Utilisateur"} — ${feedback.title}`,
      entityId: feedback.id,
      priority: feedback.type === "bug" ? "urgent" : "normal"
    });

    return res.status(201).json({ success: true, feedback });
  } catch (error) {
    console.error("Erreur création feedback :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d’envoyer le commentaire."
    });
  }
});




app.get("/api/feedback/mine", (req, res) => {
  try {
    const accountId = String(req.query.accountId || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!accountId && !email) {
      return res.status(400).json({
        success: false,
        message: "Compte utilisateur manquant."
      });
    }

    const feedback = readJsonArray(feedbackPath)
      .filter((item) => {
        const matchesAccount =
          accountId && String(item.accountId || "") === accountId;
        const matchesEmail =
          email && String(item.email || "").trim().toLowerCase() === email;

        return matchesAccount || matchesEmail;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({
      success: true,
      feedback
    });
  } catch (error) {
    console.error("Erreur lecture feedback utilisateur :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de charger les commentaires."
    });
  }
});

app.get("/api/founder/feedback", requireFounderKey, (_req, res) => {
  const feedback = readJsonArray(feedbackPath)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    items: feedback,
    feedback,
    newCount: feedback.filter((item) => item.status === "new").length
  });
});


app.post("/api/founder/feedback/:id/replies", requireFounderKey, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (message.length < 2) {
      return res.status(400).json({
        success: false,
        message: "La réponse ne peut pas être vide."
      });
    }

    const items = readJsonArray(feedbackPath);
    const feedback = items.find(
      (item) => item.id === req.params.id || item.reference === req.params.id
    );

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback introuvable."
      });
    }

    if (!Array.isArray(feedback.replies)) feedback.replies = [];

    const reply = {
      id: `feedback_reply_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      sender: "founder",
      message,
      createdAt: new Date().toISOString()
    };

    feedback.replies.push(reply);
    feedback.status = "replied";
    feedback.updatedAt = new Date().toISOString();
    writeJsonArray(feedbackPath, items);

    let emailSent = false;

    if (feedback.email) {
      try {
        await transporter.sendMail({
          from: "Sonara Pack <luca.dida17@gmail.com>",
          to: feedback.email,
          subject: `Réponse à votre feedback Sonara Pack — ${feedback.title}`,
          html: `
            <div style="font-family:Arial,sans-serif;background:#0b0b0b;color:#fff;padding:32px;border-radius:18px">
              <h1 style="margin:0 0 18px">Réponse de l’équipe Sonara</h1>
              <p style="color:#aaa">Votre commentaire :</p>
              <p>${feedback.message}</p>
              <hr style="border:none;border-top:1px solid #333;margin:24px 0">
              <p style="color:#aaa">Notre réponse :</p>
              <p>${message}</p>
            </div>
          `
        });
        emailSent = true;
      } catch (emailError) {
        console.error("Erreur e-mail réponse feedback :", emailError);
      }
    }

    return res.status(201).json({
      success: true,
      feedback,
      reply,
      emailSent
    });
  } catch (error) {
    console.error("Erreur réponse feedback :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d’envoyer la réponse."
    });
  }
});

app.patch("/api/founder/feedback/:id/status", requireFounderKey, (req, res) => {
  const items = readJsonArray(feedbackPath);
  const feedback = items.find(
    (item) => item.id === req.params.id || item.reference === req.params.id
  );

  if (!feedback) {
    return res.status(404).json({
      success: false,
      message: "Feedback introuvable."
    });
  }

  feedback.status = String(req.body?.status || "reviewed");
  feedback.updatedAt = new Date().toISOString();
  writeJsonArray(feedbackPath, items);

  res.json({ success: true, feedback });
});

app.delete("/api/founder/feedback/:id", requireFounderKey, (req, res) => {
  const items = readJsonArray(feedbackPath);
  const remaining = items.filter(
    (item) => item.id !== req.params.id && item.reference !== req.params.id
  );

  if (remaining.length === items.length) {
    return res.status(404).json({
      success: false,
      message: "Feedback introuvable."
    });
  }

  writeJsonArray(feedbackPath, remaining);
  res.json({ success: true, message: "Feedback supprimé." });
});


app.listen(PORT, () => {

  checkServerFiles();

  console.log(`
━━━━━━━━━━━━━━━━━━
🔥 SONARA READY
🌐 http://localhost:${PORT}
━━━━━━━━━━━━━━━━━━
`);

});
