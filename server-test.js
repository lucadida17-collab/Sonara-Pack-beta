const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const cors = require("cors");

const multer = require("multer");



const AdmZip = require("adm-zip");
const path = require("path");
const crypto = require("crypto");
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
require("dotenv").config({
  path: path.resolve(__dirname, ".env.test")
});
const { createCommercialPolicy } = require("./backend/config/commercial-mode");
const {
  PRE_V1_ACTIVITY_CONFIG,
  buildPreV1ActivityReport,
  backfillLocalPublishedAt,
  backfillMongoPublishedAt
} = require("./backend/features/pre-v1/pre-v1-activity");
const { buildMissionPayload, resolveMissionMode } = require("./backend/features/missions/mission-system");
const { grantMissionRewardOnce, attachRewardState, getActiveVisibilityBoost } = require("./backend/features/missions/mission-rewards");
const { ARTIST_REWARD_IDS, maybeGrantPreV1SeniorityReward, hasArtistReward, getPublicArtistRewards } = require("./backend/features/pre-v1/artist-rewards");
const commercialPolicy = createCommercialPolicy({ environment: "test" });

/*
  Environnement TEST
  - même MONGO_URI que le serveur principal ;
  - base MongoDB séparée avec MONGO_DB_NAME ;
  - NODE_ENV forcé à test si absent.
*/
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const mongoDatabaseName =
  process.env.MONGO_DB_NAME ||
  "sonara_test";

const Stripe = require("stripe");
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
if (commercialPolicy.stripeEnabled && !/^sk_test_/i.test(stripeSecretKey)) {
  throw new Error("Sonara TEST commercial exige une clé Stripe TEST (sk_test_...).");
}
const stripe = Stripe(stripeSecretKey || "sk_test_pre_v1_disabled");
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Resend } = require("resend");
const { MongoClient } = require("mongodb");
const { profileEnd } = require("console");

const fs = require("fs");




const r2Endpoint = String(
  process.env.R2_ENDPOINT || process.env.POINT_DE_TERMINATION || ""
).trim();
const r2SecretAccessKey = String(
  process.env.R2_KEY_SECRET_ACCESS || process.env.R2_SECRET_ACCESS_KEY || ""
).trim();
const frontUrl = String(process.env.FRONT_URL || "https://sonarapack-test.netlify.app")
  .trim()
  .replace(/\/+$/, "");

if (!stripeWebhookSecret) {
  console.warn("Stripe webhook désactivé : STRIPE_WEBHOOK_SECRET absente.");
}

const r2 = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: r2SecretAccessKey
  }
});

async function uploadToR2(file, folder) {
  const key = `${folder}/${Date.now()}-${file.originalname}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: fs.createReadStream(file.path),
      ContentType: file.mimetype,
    })
  );

  return key;
}

async function uploadLocalFileToR2(filePath, key, contentType = "application/zip") {
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType
    })
  );

  return key;
}

function normalizePackR2Key(value) {
  const key = String(value || "").trim().replace(/^\/+/, "");
  if (!key || /^https?:\/\//i.test(key) || key.startsWith("uploads/") || key.includes("..")) {
    return "";
  }
  return key;
}

async function downloadPackR2File(key, filePath) {
  const normalizedKey = normalizePackR2Key(key);
  if (!normalizedKey) throw new Error("Clé audio R2 invalide.");

  const object = await r2.send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: normalizedKey
  }));

  if (!object.Body || typeof object.Body.pipe !== "function") {
    throw new Error("Flux audio R2 introuvable.");
  }

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    object.Body.on("error", reject);
    output.on("error", reject);
    output.on("finish", resolve);
    object.Body.pipe(output);
  });

  return filePath;
}

async function deletePackR2KeysBestEffort(keys) {
  for (const key of [...new Set(keys.map(normalizePackR2Key).filter(Boolean))]) {
    try {
      await r2.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key
      }));
    } catch (error) {
      console.error(`Suppression R2 impossible (${key}) :`, error.message);
    }
  }
}

function collectPackR2Keys(pack) {
  const keys = [pack?.coverPack, pack?.downloadZip];

  for (const track of Array.isArray(pack?.tracks) ? pack.tracks : []) {
    keys.push(track?.coverPack, track?.audioName, track?.downloadZip);
  }

  return [...new Set(keys
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim().replace(/^\/+/, ""))
    .filter((value) => !/^https?:\/\//i.test(value) && !value.startsWith("uploads/"))
  )];
}

async function deleteRejectedPackFromR2(pack) {
  const keys = collectPackR2Keys(pack);

  for (const key of keys) {
    await r2.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key
    }));
  }

  return keys;
}

async function permanentlyRejectMongoPack(packId) {
  const pack = await packsCollection.findOne({ id: packId });

  if (!pack) return null;

  const deletedR2Keys = await deleteRejectedPackFromR2(pack);
  await packsCollection.deleteOne({ id: packId });
  await founderNotificationsCollection.deleteMany({
    $or: [
      { entityId: packId },
      { packId },
      { "metadata.entityId": packId }
    ]
  });

  return { pack, deletedR2Keys };
}

const resend = new Resend(process.env.RESEND_API_KEY)
const client = new MongoClient(process.env.MONGO_URI);

const db = client.db(mongoDatabaseName);

const usersCollection = db.collection("users");
const packsCollection = db.collection("packs");
const verificationSecurityCollection = db.collection("verification_security");






async function connectDB() {
  try {
    await client.connect();
    await verificationSecurityCollection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "verification_security_ttl" }
    );
    console.log(
      `MongoDB TEST connecté 🔥 — base : ${mongoDatabaseName}`
    );
  } catch (error) {
    console.error(error)
  }
}

connectDB()


const app = express();

const founderFinance = registerFounderFinance({
  app,
  stripe,
  environment: "test",
  db: db,
  dataDir: path.join(__dirname, "data"),
  enabled: commercialPolicy.paymentsActive
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const PORT = process.env.PORT || 3000;

const defaultAllowedOrigins = [
  'https://sonarapack-test.netlify.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5501'
];

const configuredAllowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...configuredAllowedOrigins
]);

function resolveFrontUrl(req) {
  const candidates = [req?.headers?.origin, req?.headers?.referer];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = new URL(String(candidate));
      const origin = parsed.origin.replace(/\/+$/, "");

      if (origin === frontUrl || allowedOrigins.has(origin)) {
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
    const normalizedOrigin = String(origin || "").trim().replace(/\/+$/, "");

    if (!origin || allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Origine refusée : ${normalizedOrigin}`);
    return callback(new Error("Origine non autorisée par Sonara."));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-founder-key", "x-founder-environment"]
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

app.use(express.json());
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "sonara-api",
    environment: "test",
    timestamp: new Date().toISOString()
  });
});


/* =========================
   R2 FILE PROXY
   - LOCAL keeps /uploads as local static files.
   - TEST/MAIN read the same keys from their own R2 bucket.
========================= */
function getR2UploadKey(req) {
  const rawPath = String(req.params?.[0] || "");
  return rawPath.replace(/^\/+/, "");
}

// Route RegExp volontaire : elle évite toute ambiguïté de syntaxe wildcard
// entre Express 4 et Express 5 / path-to-regexp, tout en conservant les
// sous-dossiers R2 (profiles/, packs/covers/, tracks/audio/, etc.).
app.get(/^\/uploads\/(.+)$/, async (req, res) => {
  try {
    const key = getR2UploadKey(req);

    if (!key || key.includes("..")) {
      return res.status(400).json({
        success: false,
        message: "Chemin de fichier invalide."
      });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ...(req.headers.range ? { Range: req.headers.range } : {})
    });

    const object = await r2.send(command);

    if (object.ContentType) res.setHeader("Content-Type", object.ContentType);
    if (object.ContentLength != null) res.setHeader("Content-Length", String(object.ContentLength));
    if (object.ContentRange) res.setHeader("Content-Range", object.ContentRange);
    if (object.AcceptRanges) res.setHeader("Accept-Ranges", object.AcceptRanges);
    else res.setHeader("Accept-Ranges", "bytes");
    if (object.CacheControl) res.setHeader("Cache-Control", object.CacheControl);
    else res.setHeader("Cache-Control", "public, max-age=3600");
    if (object.ETag) res.setHeader("ETag", object.ETag);
    if (object.LastModified) res.setHeader("Last-Modified", object.LastModified.toUTCString());
    if (object.ContentDisposition) res.setHeader("Content-Disposition", object.ContentDisposition);

    if (object.ContentRange) res.status(206);

    if (!object.Body || typeof object.Body.pipe !== "function") {
      throw new Error("Flux R2 introuvable.");
    }

    object.Body.on("error", (error) => {
      console.error(`[R2 FILE] Erreur de lecture ${key}:`, error);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    });

    object.Body.pipe(res);
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;

    if (status === 404 || error?.name === "NoSuchKey") {
      return res.status(404).json({
        success: false,
        message: "Fichier introuvable."
      });
    }

    console.error("Erreur GET /uploads/... depuis R2 :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de récupérer le fichier."
    });
  }
});


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

const upload = multer({
   storage,
  limits: {
    fileSize: 250 * 1024 * 1024
  } });

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const PACK_MAX_TRACKS = 20;
const PACK_MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const PACK_MAX_AUDIO_SIZE = 250 * 1024 * 1024;
const PACK_MAX_FILES = 1 + (PACK_MAX_TRACKS * 2);

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
  return fieldname === "coverPack" || /^trackCover_\d+$/.test(fieldname);
}

function isPackAudioField(fieldname) {
  return /^trackAudio_\d+$/.test(fieldname);
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
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
  const packIsFree =
    pack.isFree === true ||
    String(pack.price || "").trim().toLowerCase() === "gratuit";
  const packPrice = packIsFree
    ? 0
    : Number(String(pack.price || "").replace("€", "").replace(",", "."));

  if (!title || title.length > 70) {
    return {
      valid: false,
      status: 400,
      message: "Le titre du pack est obligatoire et limité à 70 caractères."
    };
  }

  if (!artistId) {
    return { valid: false, status: 400, message: "L’artiste du pack est introuvable." };
  }

  if (tracks.length < 1 || tracks.length > PACK_MAX_TRACKS) {
    return {
      valid: false,
      status: 400,
      message: `Un pack doit contenir entre 1 et ${PACK_MAX_TRACKS} tracks.`
    };
  }

  if (!packIsFree && (!Number.isFinite(packPrice) || packPrice <= 0)) {
    return { valid: false, status: 400, message: "Le prix du pack est invalide." };
  }

  pack.isFree = packIsFree;
  pack.price = packIsFree ? "Gratuit" : `${packPrice.toFixed(2)}€`;

  if (!pack.license || typeof pack.license !== "object") {
    return {
      valid: false,
      status: 400,
      message: "La licence d’utilisation du pack est obligatoire."
    };
  }

  pack.license = normalizePackLicense(pack.license);

  const files = Array.isArray(req.files) ? req.files : [];
  const fileByField = new Map(files.map((file) => [file.fieldname, file]));
  const coverPackFile = fileByField.get("coverPack");

  if (!coverPackFile) {
    return { valid: false, status: 400, message: "La cover du pack est obligatoire." };
  }

  if (coverPackFile.size > PACK_MAX_IMAGE_SIZE) {
    return { valid: false, status: 400, message: "La cover du pack dépasse 8 Mo." };
  }

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const trackTitle = String(track?.title || "").trim();
    const trackIsFree =
      track?.isFree === true ||
      String(track?.price || "").trim().toLowerCase() === "gratuit";

    const price = trackIsFree
      ? 0
      : Number(String(track?.price || "").replace("€", "").replace(",", "."));
    const cover = fileByField.get(`trackCover_${index}`);
    const audio = fileByField.get(`trackAudio_${index}`);

    if (!trackTitle || trackTitle.length > 70) {
      return {
        valid: false,
        status: 400,
        message: `Le titre de la track ${index + 1} est invalide.`
      };
    }

    if (
      (!trackIsFree && (!Number.isFinite(price) || price <= 0)) ||
      (trackIsFree && price !== 0)
    ) {
      return {
        valid: false,
        status: 400,
        message: `Le prix de la track ${index + 1} est invalide.`
      };
    }

    track.isFree = trackIsFree;
    track.price = trackIsFree ? "Gratuit" : `${price.toFixed(2)}€`;

    if (!cover) {
      return {
        valid: false,
        status: 400,
        message: `La cover de la track ${index + 1} est obligatoire.`
      };
    }

    if (cover.size > PACK_MAX_IMAGE_SIZE) {
      return {
        valid: false,
        status: 400,
        message: `La cover de la track ${index + 1} dépasse 8 Mo.`
      };
    }

    if (!audio) {
      return {
        valid: false,
        status: 400,
        message: `Le fichier audio de la track ${index + 1} est obligatoire.`
      };
    }

    if (audio.size > PACK_MAX_AUDIO_SIZE) {
      return {
        valid: false,
        status: 400,
        message: `Le fichier audio de la track ${index + 1} dépasse 250 Mo.`
      };
    }
  }

  const expectedFields = new Set([
    "coverPack",
    ...tracks.flatMap((_, index) => [
      `trackCover_${index}`,
      `trackAudio_${index}`
    ])
  ]);

  const unexpectedFile = files.find((file) => !expectedFields.has(file.fieldname));

  if (unexpectedFile) {
    return { valid: false, status: 400, message: "Le pack contient un fichier inattendu." };
  }

  if (files.length !== expectedFields.size) {
    return {
      valid: false,
      status: 400,
      message: "Le nombre de fichiers reçus ne correspond pas au pack."
    };
  }

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

app.use("/downloads", express.static(downloadsPath));


/* =========================
   HELPERS USERS / ACCOUNTS
========================= */

function normalizeLoginPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0033") && digits.length === 13) return `0${digits.slice(4)}`;
  if (digits.startsWith("33") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function normalizeMail(mail) {
  return String(mail || "").trim().toLowerCase();
}

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function normalizePseudo(pseudo) {
  return String(pseudo || "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function isPseudoAlreadyUsed(pseudo) {
  const normalizedPseudo = normalizePseudo(pseudo);

  if (!normalizedPseudo) {
    return false;
  }

  return Boolean(
    await usersCollection.findOne({
      accounts: {
        $elemMatch: {
          pseudo: {
            $regex: `^${escapeRegex(String(pseudo).trim())}$`,
            $options: "i"
          }
        }
      }
    })
  );
}

function sanitizeAccount(account, rootUserId) {
  const returnedAccount = {
    ...account,
    id: account.id || account.accountId,
    accountId: account.accountId || account.id,
    userId: rootUserId
  };

  delete returnedAccount.password;
  delete returnedAccount._id;

  return returnedAccount;
}

async function findRootAndAccountById(id) {
  const requestedId = String(id || "");

  if (!requestedId) {
    return null;
  }

  const rootUser = await usersCollection.findOne({
    $or: [
      { "accounts.id": requestedId },
      { "accounts.accountId": requestedId }
    ]
  });

  if (rootUser) {
    const account = (rootUser.accounts || []).find(
      (currentAccount) =>
        String(currentAccount.id) === requestedId ||
        String(currentAccount.accountId) === requestedId
    );

    if (account) {
      return {
        rootUser,
        account,
      };
    }
  }


  return null;
}

async function saveAccountState(rootUser, account) {
  const now = new Date().toISOString();

  account.updatedAt = now;


  rootUser.updatedAt = now;

  await usersCollection.updateOne(
    { _id: rootUser._id },
    {
      $set: {
        accounts: rootUser.accounts,
        updatedAt: now
      }
    }
  );
}

async function isMailAlreadyUsed(mail, excludedAccountId = null) {
  const normalizedMail = normalizeMail(mail);

  const documents = await usersCollection.find({
    "accounts.mail": normalizedMail
  }).toArray();

  return documents.some((document) =>
    (document.accounts || []).some((account) => {
      const sameMail =
        normalizeMail(account.mail) === normalizedMail;

      const isExcluded =
        excludedAccountId &&
        (
          String(account.id) === String(excludedAccountId) ||
          String(account.accountId) === String(excludedAccountId)
        );

      return sameMail && !isExcluded;
    })
  );
}

async function findArtistAccountForPack(pack) {
  const artistIds = [
    pack?.accountId,
    pack?.artistAccountId,
    pack?.artistId
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const artistId of [...new Set(artistIds)]) {
    const byId = await findRootAndAccountById(artistId);

    if (
      byId?.account &&
      (
        byId.account.role === "artist" ||
        byId.account.role === "both"
      )
    ) {
      return byId;
    }
  }

  const artistName = String(
    pack.artist ||
    pack.pseudo ||
    ""
  ).trim();

  if (!artistName) {
    return null;
  }

  const rootUser = await usersCollection.findOne({
    accounts: {
      $elemMatch: {
        role: { $in: ["artist", "both"] },
        pseudo: artistName
      }
    }
  });

  if (rootUser) {
    const account = rootUser.accounts.find(
      (currentAccount) =>
        (
          currentAccount.role === "artist" ||
          currentAccount.role === "both"
        ) &&
        String(currentAccount.pseudo) === artistName
    );

    if (account) {
      return {
        rootUser,
        account,
      };
    }
  }


  return null;
}

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TOKEN_TTL_MS = 15 * 60 * 1000;

function createVerificationKey(mail, purpose, userId = "") {
  return `${purpose}:${String(userId || "")}:${normalizeMail(mail)}`;
}

function createVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function createVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashVerificationValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function cleanupVerificationStores() {
  await verificationSecurityCollection.deleteMany({
    expiresAt: { $lte: new Date() }
  });
}

async function storeVerificationCode(key, code) {
  const now = new Date();
  await verificationSecurityCollection.updateOne(
    { _id: `code:${key}` },
    {
      $set: {
        kind: "code",
        key,
        codeHash: hashVerificationValue(code),
        attempts: 0,
        createdAt: now,
        expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS)
      }
    },
    { upsert: true }
  );
}

async function consumeVerifiedToken({ token, mail, purpose, userId = "" }) {
  await cleanupVerificationStores();
  const expectedKey = createVerificationKey(mail, purpose, userId);
  const tokenId = `token:${hashVerificationValue(token)}`;
  const now = new Date();

  const result = await verificationSecurityCollection.deleteOne({
    _id: tokenId,
    kind: "token",
    key: expectedKey,
    expiresAt: { $gt: now }
  });

  return result.deletedCount === 1;
}

async function isPasswordAlreadyUsed(password) {
  const normalizedPassword = String(password || "");
  if (!normalizedPassword) return false;

  return Boolean(
    await usersCollection.findOne({
      $or: [
        { "accounts.password": normalizedPassword },
        { password: normalizedPassword }
      ]
    })
  );
}

async function isPhoneAlreadyUsed(phone) {
  const normalizedPhone = normalizeLoginPhone(phone);
  if (!normalizedPhone) return false;

  const roots = await usersCollection.find(
    { "accounts.phone": { $exists: true, $ne: "" } },
    { projection: { "accounts.phone": 1 } }
  ).toArray();

  return roots.some((rootUser) =>
    (rootUser.accounts || []).some((account) =>
      normalizeLoginPhone(account.phone) === normalizedPhone
    )
  );
}

async function collectRemoteDuplicateErrors({ mail, pseudo, password, phone }) {
  const fieldErrors = validateNewAccountFields({ password });
  if (mail && await isMailAlreadyUsed(mail)) fieldErrors.mail = "Cette adresse e-mail est déjà utilisée.";
  if (pseudo && await isPseudoAlreadyUsed(pseudo)) fieldErrors.pseudo = "Ce pseudo est déjà utilisé.";
  if (password && await isPasswordAlreadyUsed(password)) fieldErrors.password = "Ce mot de passe est déjà utilisé. Choisissez-en un autre.";
  if (phone && await isPhoneAlreadyUsed(phone)) fieldErrors.phone = "Ce numéro de téléphone est déjà utilisé.";
  return fieldErrors;
}

app.post("/api/account-security/check", async (req, res) => {
  try {
    const payload = req.body || {};
    const fieldErrors = await collectRemoteDuplicateErrors(payload);

    console.log("ACCOUNT SECURITY CHECK MONGODB", {
      mail: Boolean(payload.mail),
      pseudo: Boolean(payload.pseudo),
      password: Boolean(payload.password),
      available: Object.keys(fieldErrors).length === 0
    });

    return res.status(200).json({
      success: true,
      available: Object.keys(fieldErrors).length === 0,
      fieldErrors
    });
  } catch (error) {
    console.error("Erreur vérification MongoDB des doublons :", error);
    return res.status(500).json({
      success: false,
      available: false,
      fieldErrors: {},
      message: "Vérification MongoDB impossible."
    });
  }
});

app.post("/api/account-security/send-code", async (req, res) => {
  try {
    await cleanupVerificationStores();
    const { mail, pseudo, password, phone, purpose = "register", userId = "" } = req.body || {};
    const fieldErrors = await collectRemoteDuplicateErrors({ mail, pseudo, password, phone });
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(409).json({ success: false, message: "Certaines informations sont déjà utilisées.", fieldErrors });
    }

    const normalizedMail = normalizeMail(mail);
    if (!normalizedMail) return res.status(400).json({ success: false, fieldErrors: { mail: "Adresse e-mail obligatoire." } });

    const code = createVerificationCode();
    const key = createVerificationKey(normalizedMail, purpose, userId);
    await storeVerificationCode(key, code);

    await resend.emails.send({
      from: "Sonara Pack <notifications@sonarapack.com>",
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

app.post("/api/account-security/verify-code", async (req, res) => {
  try {
    await cleanupVerificationStores();

    const { mail, code, purpose = "register", userId = "" } = req.body || {};
    const key = createVerificationKey(mail, purpose, userId);
    const documentId = `code:${key}`;
    const stored = await verificationSecurityCollection.findOne({ _id: documentId });
    const now = new Date();

    if (!stored || !(stored.expiresAt instanceof Date) || stored.expiresAt <= now) {
      await verificationSecurityCollection.deleteOne({ _id: documentId });
      return res.status(400).json({ success: false, message: "Code expiré ou introuvable." });
    }

    const codeMatches = hashVerificationValue(String(code || "").trim()) === stored.codeHash;

    if (!codeMatches) {
      const attempts = Number(stored.attempts || 0) + 1;

      if (attempts >= 5) {
        await verificationSecurityCollection.deleteOne({ _id: documentId });
        return res.status(429).json({ success: false, message: "Trop de tentatives. Demandez un nouveau code." });
      }

      await verificationSecurityCollection.updateOne(
        { _id: documentId },
        { $set: { attempts } }
      );
      return res.status(400).json({ success: false, message: "Code incorrect." });
    }

    await verificationSecurityCollection.deleteOne({ _id: documentId });

    const token = createVerificationToken();
    await verificationSecurityCollection.insertOne({
      _id: `token:${hashVerificationValue(token)}`,
      kind: "token",
      key,
      createdAt: now,
      expiresAt: new Date(now.getTime() + VERIFIED_TOKEN_TTL_MS)
    });

    return res.json({ success: true, verificationToken: token });
  } catch (error) {
    console.error("Erreur vérification du code :", error);
    return res.status(500).json({ success: false, message: "Vérification du code impossible." });
  }
});


/* =========================
   REGISTER
========================= */

app.post("/api/register", upload.any(), async (req, res) => {
  try {
    const profile = req.body.profile
      ? JSON.parse(req.body.profile)
      : req.body;

    const imageProfileFile = req.files?.find(
      (file) => file.fieldname === "imageProfile"
    );

    if (!(await consumeVerifiedToken({ token: req.body.verificationToken, mail: profile.mail, purpose: "register" }))) {
      return res.status(403).json({ success: false, message: "Vérification e-mail requise ou expirée." });
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

    if (!["user", "artist", "both"].includes(profile.role)) {
      return res.status(400).json({
        success: false,
        message: "Rôle invalide."
      });
    }

    const normalizedMail = normalizeMail(profile.mail);
    const fieldErrors = validateNewAccountFields(profile);

    if (await isMailAlreadyUsed(normalizedMail)) {
      fieldErrors.mail =
        "Vous avez déjà un compte avec cette adresse e-mail.";
    }

    if (await isPseudoAlreadyUsed(profile.pseudo)) {
      fieldErrors.pseudo =
        "Ce pseudo est déjà utilisé. Choisissez-en un autre.";
    }

    if (await isPasswordAlreadyUsed(profile.password)) {
      fieldErrors.password =
        "Ce mot de passe est déjà utilisé. Choisissez-en un autre.";
    }

    const normalizedPhone = normalizeLoginPhone(profile.phone);

    if ((profile.role === "artist" || profile.role === "both") && !normalizedPhone) {
      fieldErrors.phone = "Le numéro de téléphone est obligatoire.";
    }

    if (normalizedPhone && await isPhoneAlreadyUsed(profile.phone)) {
      fieldErrors.phone = "Ce numéro de téléphone est déjà utilisé.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(409).json({
        success: false,
        message: "Certaines informations doivent être modifiées.",
        fieldErrors
      });
    }

    let imageProfile = "";

    if (imageProfileFile) {
      imageProfile = await uploadToR2(
        imageProfileFile,
        "profiles"
      );
    }

    const status =
      profile.role === "user"
        ? "approved"
        : "pending";

    const now = new Date().toISOString();
    const userId = String(Date.now());

    const accountId =
      `acc_${Date.now()}_${Math.random()
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
        normalizedMail,

      password:
        profile.password,

      phone:
        profile.phone?.trim() || "",

      pseudo:
        profile.pseudo?.trim() || "",

      role:
        profile.role,

      status,

      imageProfile,

      downloadedPacks:
        profile.downloadedPacks || [],

      downloadedTracks:
        profile.downloadedTracks || [],

      createdAt: now,
      updatedAt: now
    };

    const rootUser = {
      id: userId,
      accounts: [account],
      createdAt: now,
      updatedAt: now
    };

    await usersCollection.insertOne(rootUser);

    if (status === "pending") {
      await createFounderNotification({
        type: "artist",
        title: "Nouvel artiste à modérer",
        message: `${account.pseudo || account.mail || "Nouvel artiste"} attend une validation.`,
        entityId: account.id || account.accountId,
        priority: "normal"
      });

      const adminUrl =
        process.env.ADMIN_URL ||
        (
          frontUrl
            ? `${frontUrl}/admin.html`
            : ""
        );

      resend.emails.send({
        from: "Sonara Pack <notifications@sonarapack.com>",
        to: "luca.dida17@gmail.com",
        subject:
          "Nouvelle demande artiste à modérer - Sonara Pack",
        html: `
          <div style="font-family: Arial, sans-serif; background:#080b12; color:white; padding:30px; border-radius:16px;">
            <h1 style="color:#7ddcff;">Nouvelle demande artiste</h1>

            <p>Un nouveau profil vient d’être créé sur <strong>Sonara Pack</strong> et attend une validation admin.</p>

            <div style="background:#111827; padding:20px; border-radius:14px; margin-top:20px;">
              <p><strong>Nom :</strong> ${account.firstname} ${account.lastname}</p>
              <p><strong>Email :</strong> ${account.mail}</p>
              <p><strong>Téléphone :</strong> ${account.phone || "Non renseigné"}</p>
              <p><strong>Rôle :</strong> ${account.role}</p>
              <p><strong>Pseudo :</strong> ${account.pseudo || "Non renseigné"}</p>
              <p><strong>Image :</strong> ${account.imageProfile || "Aucune image"}</p>
              <p><strong>Status :</strong> ${account.status}</p>
              <p><strong>Date :</strong> ${account.createdAt}</p>
            </div>

            ${
              adminUrl
                ? `
                  <div style="margin-top:30px;">
                    <a href="${adminUrl}"
                       style="display:inline-block; padding:14px 22px; background:#7ddcff; color:#000; text-decoration:none; border-radius:999px; font-weight:bold;">
                      Ouvrir Admin
                    </a>
                  </div>
                `
                : ""
            }
          </div>
        `
      }).catch((error) => {
        console.error("Erreur mail register :", error);
      });
    }

    const returnedAccount =
      sanitizeAccount(account, rootUser.id);

    const redirectTo =
      account.role === "artist" ||
      account.role === "both"
        ? "/app/pages/creator/dashboard.html"
        : "/home.html";

    return res.status(201).json({
      success: true,
      message: "Compte créé avec succès.",
      profile: returnedAccount,
      account: returnedAccount,

      redirectTo,
      stripeOnboardingUrl: null
    });

  } catch (error) {
    console.error(
      "Erreur POST /api/register :",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Impossible de créer le compte."
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

    if (!(await consumeVerifiedToken({
      token: req.body.verificationToken,
      mail: profile.mail,
      purpose: "add-account",
      userId
    }))) {
      return res.status(403).json({ success: false, message: "Vérification e-mail requise ou expirée." });
    }

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

    const rootUser = await usersCollection.findOne({
      id: userId
    });

    if (!rootUser) {
      return res.status(404).json({
        success: false,
        message: "Racine utilisateur introuvable."
      });
    }

    const normalizedMail = normalizeMail(profile.mail);
    const fieldErrors = validateNewAccountFields(profile);

    if (await isMailAlreadyUsed(normalizedMail)) {
      fieldErrors.mail =
        "Vous avez déjà un compte avec cette adresse e-mail.";
    }

    if (await isPseudoAlreadyUsed(profile.pseudo)) {
      fieldErrors.pseudo =
        "Ce pseudo est déjà utilisé. Choisissez-en un autre.";
    }

    if (await isPasswordAlreadyUsed(profile.password)) {
      fieldErrors.password =
        "Ce mot de passe est déjà utilisé. Choisissez-en un autre.";
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

    let imageProfile = "";

    if (imageProfileFile) {
      imageProfile = await uploadToR2(
        imageProfileFile,
        "profiles"
      );
    }

    const now = new Date().toISOString();

    const accountId =
      `acc_${Date.now()}_${Math.random()
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
        normalizedMail,

      password:
        profile.password,

      phone:
        profile.phone?.trim() || "",

      pseudo:
        profile.pseudo?.trim() || "",

      role:
        profile.role,

      status,

      imageProfile,

      downloadedPacks: [],
      downloadedTracks: [],

      createdAt: now,
      updatedAt: now
    };

    await usersCollection.updateOne(
      { _id: rootUser._id },
      {
        $push: {
          accounts: account
        },
        $set: {
          updatedAt: now
        }
      }
    );

    if (status === "pending") {
      await createFounderNotification({
        type: "artist",
        title: "Nouvel artiste à modérer",
        message: `${account.pseudo || account.mail || "Nouvel artiste"} attend une validation.`,
        entityId: account.id || account.accountId,
        priority: "normal"
      });

      const adminUrl =
        process.env.ADMIN_URL ||
        (
          frontUrl
            ? `${frontUrl}/admin.html`
            : ""
        );

      resend.emails.send({
        from: "Sonara Pack <notifications@sonarapack.com>",
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
              <p><strong>Pseudo :</strong> ${account.pseudo || "Non renseigné"}</p>
              <p><strong>Image :</strong> ${account.imageProfile || "Aucune image"}</p>
              <p><strong>Status :</strong> ${account.status}</p>
              <p><strong>Date :</strong> ${account.createdAt}</p>
            </div>

            ${
              adminUrl
                ? `
                  <div style="margin-top:30px;">
                    <a href="${adminUrl}"
                       style="display:inline-block; padding:14px 22px; background:#7ddcff; color:#000; text-decoration:none; border-radius:999px; font-weight:bold;">
                      Ouvrir Admin
                    </a>
                  </div>
                `
                : ""
            }
          </div>
        `
      }).catch((error) => {
        console.error("Erreur mail ajout compte :", error);
      });
    }

    const returnedAccount =
      sanitizeAccount(account, rootUser.id);

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


/* =========================
   PROFILE GET
========================= */

app.get("/api/profile/:id", async (req, res) => {
  try {
    const result =
      await findRootAndAccountById(req.params.id);

    if (!result?.account) {
      return res.status(404).json({
        success: false,
        error: "Profil introuvable"
      });
    }

    const legacyArtistBlocked =
      String(result.account.role || "").toLowerCase() === "both" &&
      ["rejected", "banned"].includes(
        String(result.account.status || "").toLowerCase()
      );

    if (legacyArtistBlocked) {
      result.account.artistStatus =
        result.account.artistStatus ||
        result.account.status;
      result.account.artistModeratedAt =
        result.account.artistModeratedAt ||
        result.account.moderatedAt ||
        new Date().toISOString();
      result.account.role = "user";
      result.account.status = "approved";
      result.account.updatedAt = new Date().toISOString();

      await saveAccountState(
        result.rootUser,
        result.account
      );
    }

    return res.status(200).json(
      sanitizeAccount(
        result.account,
        result.rootUser.id
      )
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



app.get("/api/profile/:id/announcements", async (req, res) => {
  try {
    const result =
      await findRootAndAccountById(req.params.id);

    if (!result?.account) {
      return res.status(404).json({
        success: false,
        message: "Compte introuvable."
      });
    }

    return res.status(200).json({
      success: true,
      announcements: {
        lastSeenHomeAnnouncement:
          result.account.lastSeenHomeAnnouncement || null,
        lastSeenCreatorAnnouncement:
          result.account.lastSeenCreatorAnnouncement || null
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

app.patch("/api/profile/:id/announcements", async (req, res) => {
  try {
    const seenFields = {
      user: "lastSeenHomeAnnouncement",
      artist: "lastSeenCreatorAnnouncement"
    };
    const audience = String(req.body?.audience || "").trim();
    const version = String(req.body?.version || "").trim();
    const seenField = seenFields[audience];

    if (!seenField || !/^PRE_V1_\d+$/.test(version)) {
      return res.status(400).json({
        success: false,
        message: "Annonce Pre-V1 invalide."
      });
    }

    const result =
      await findRootAndAccountById(req.params.id);

    if (!result?.account) {
      return res.status(404).json({
        success: false,
        message: "Compte introuvable."
      });
    }

    result.account[seenField] = version;
    await saveAccountState(result.rootUser, result.account);

    return res.status(200).json({
      success: true,
      announcements: {
        lastSeenHomeAnnouncement:
          result.account.lastSeenHomeAnnouncement || null,
        lastSeenCreatorAnnouncement:
          result.account.lastSeenCreatorAnnouncement || null
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
   LOGIN
========================= */



/* =========================
   VÉRIFICATION CONNEXION EN DIRECT
========================= */

app.post("/api/login/live-check", async (req, res) => {
  try {
    const { mail, password, phone } = req.body || {};
    const normalizedMail = normalizeMail(mail);
    const normalizedPhone = normalizeLoginPhone(phone);

    const rootUser = normalizedMail
      ? await usersCollection.findOne({ "accounts.mail": normalizedMail })
      : null;
    const matchedAccount = rootUser?.accounts?.find(
      (account) => normalizeMail(account.mail) === normalizedMail
    ) || null;

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
    await cleanupVerificationStores();

    const { mail, password, phone } = req.body || {};
    const normalizedMail = normalizeMail(mail);
    const normalizedPhone = normalizeLoginPhone(phone);

    if (!normalizedMail || !password || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: "L'adresse e-mail, le mot de passe et le téléphone sont obligatoires."
      });
    }

    const rootUser = await usersCollection.findOne({
      "accounts.mail": normalizedMail
    });

    const accountExists = rootUser?.accounts?.some((account) =>
      normalizeMail(account.mail) === normalizedMail &&
      account.password === password &&
      normalizeLoginPhone(account.phone) === normalizedPhone
    );

    if (!accountExists) {
      return res.status(403).json({
        success: false,
        error: "Les informations de connexion sont incorrectes."
      });
    }

    const code = createVerificationCode();
    const key = createVerificationKey(normalizedMail, "login");

    await storeVerificationCode(key, code);

    await resend.emails.send({
      from: "Sonara Pack <notifications@sonarapack.com>",
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

app.post("/api/login", async (req, res) => {
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

    if (!(await consumeVerifiedToken({
      token: verificationToken,
      mail: normalizedMail,
      purpose: "login"
    }))) {
      return res.status(403).json({
        success: false,
        error: "Vérification e-mail obligatoire ou expirée."
      });
    }

    let rootUser = await usersCollection.findOne({
      accounts: {
        $elemMatch: {
          mail: normalizedMail,
          password,
          phone: normalizedPhone
        }
      }
    });

    let account = null;

    if (rootUser) {
      account = rootUser.accounts.find(
        (currentAccount) =>
          normalizeMail(currentAccount.mail) === normalizedMail &&
          currentAccount.password === password &&
          String(currentAccount.phone || "").trim() === normalizedPhone
      );
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
      account.artistStatus =
        account.artistStatus ||
        account.status;
      account.artistModeratedAt =
        account.artistModeratedAt ||
        account.moderatedAt ||
        new Date().toISOString();
      account.role = "user";
      account.status = "approved";
      account.updatedAt = new Date().toISOString();

      await saveAccountState(rootUser, account);
    }

    let redirectTo = "/home.html";

    if (
      account.role === "artist" ||
      account.role === "both"
    ) {
      redirectTo = "/app/pages/creator/dashboard.html";
    }

    const returnedAccount = sanitizeAccount(
      account,
      rootUser.id
    );

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

app.post("/api/accounts/list", async (req, res) => {
  try {
    const { userId, currentAccountId } = req.body || {};
    const rootUser = await usersCollection.findOne({ id: String(userId), "accounts.accountId": String(currentAccountId) });

    if (!rootUser) {
      return res.status(403).json({ success: false, error: "Session non autorisée." });
    }

    const accounts = rootUser.accounts.map((item) => sanitizeAccount(item, rootUser.id));
    return res.json({ success: true, accounts });
  } catch (error) {
    console.error("Erreur POST /api/accounts/list :", error);
    return res.status(500).json({ success: false, error: "Chargement des comptes impossible." });
  }
});

app.post("/api/accounts/switch", async (req, res) => {
  try {
    const { userId, currentAccountId, targetAccountId } = req.body || {};
    const rootUser = await usersCollection.findOne({
      id: String(userId),
      accounts: { $all: [
        { $elemMatch: { accountId: String(currentAccountId) } },
        { $elemMatch: { accountId: String(targetAccountId) } }
      ] }
    });

    const targetAccount = rootUser?.accounts?.find((item) => String(item.accountId) === String(targetAccountId));
    if (!rootUser || !targetAccount) {
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
    await cleanupVerificationStores();

    const { mail, password, phone } = req.body || {};
    const normalizedMail = normalizeMail(mail);
    const normalizedPhone = normalizeLoginPhone(phone);

    if (!normalizedMail || !password || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: "L'adresse e-mail, le mot de passe et le téléphone sont obligatoires."
      });
    }

    const rootUser = await usersCollection.findOne({
      "accounts.mail": normalizedMail
    });

    const targetAccount = rootUser?.accounts?.find((item) =>
      normalizeMail(item.mail) === normalizedMail &&
      item.password === password &&
      normalizeLoginPhone(item.phone) === normalizedPhone
    );

    if (!rootUser || !targetAccount) {
      return res.status(403).json({
        success: false,
        error: "Les informations de connexion sont incorrectes."
      });
    }

    const code = createVerificationCode();
    const key = createVerificationKey(normalizedMail, "login-existing");

    await storeVerificationCode(key, code);

    await resend.emails.send({
      from: "Sonara Pack <admin@sonarapack.com>",
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

app.post("/api/accounts/login", async (req, res) => {
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

    if (!(await consumeVerifiedToken({
      token: verificationToken,
      mail: normalizedMail,
      purpose: "login-existing"
    }))) {
      return res.status(403).json({
        success: false,
        error: "Vérification e-mail obligatoire ou expirée."
      });
    }

    const rootUser = await usersCollection.findOne({
      "accounts.mail": normalizedMail
    });

    const account = rootUser?.accounts?.find((item) =>
      normalizeMail(item.mail) === normalizedMail &&
      item.password === password &&
      normalizeLoginPhone(item.phone) === normalizedPhone
    );

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

/* =========================
   STRIPE CONNECT
========================= */

app.post(
  "/api/stripe/connect-account",
  async (req, res) => {
    try {
      const { artistId, email } = req.body;

      const result =
        await findRootAndAccountById(artistId);

      if (!result?.account) {
        return res.status(404).json({
          error: "Utilisateur introuvable."
        });
      }

      const artist = result.account;

      if (
        artist.role !== "artist" &&
        artist.role !== "both"
      ) {
        return res.status(403).json({
          error:
            "Seuls les artistes peuvent créer un compte Stripe."
        });
      }

      if (artist.stripeAccountId) {
        const existingStripeAccount =
          await stripe.accounts.retrieve(
            artist.stripeAccountId
          );

        const existingStatus =
          existingStripeAccount.charges_enabled &&
          existingStripeAccount.payouts_enabled
            ? "verified"
            : "onboarding_started";

        artist.stripeStatus = existingStatus;

        await saveAccountState(
          result.rootUser,
          artist
        );

        if (existingStatus === "verified") {
          const loginLink =
            await stripe.accounts.createLoginLink(
              artist.stripeAccountId
            );

          return res.status(200).json({
            success: true,
            reused: true,
            accountId: artist.stripeAccountId,
            stripeStatus: existingStatus,
            url: loginLink.url
          });
        }

        const existingAccountLink =
          await stripe.accountLinks.create({
            account: artist.stripeAccountId,
            refresh_url:
              `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html`,
            return_url:
              `${resolveFrontUrl(req)}/app/pages/creator/management/bank.html?stripe=success`,
            type: "account_onboarding"
          });

        return res.status(200).json({
          success: true,
          reused: true,
          accountId: artist.stripeAccountId,
          stripeStatus: existingStatus,
          url: existingAccountLink.url
        });
      }

      const stripeAccount =
        await stripe.accounts.create({
          type: "express",
          country: "FR",
          email: email || artist.mail,

          capabilities: {
            card_payments: {
              requested: true
            },

            transfers: {
              requested: true
            }
          }
        });

      artist.stripeAccountId =
        stripeAccount.id;

      artist.stripeStatus =
        "onboarding_started";

      await saveAccountState(
        result.rootUser,
        artist
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
        stripeStatus: artist.stripeStatus,
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
  }
);

app.post(
  "/api/stripe/continue-onboarding",
  async (req, res) => {
    try {
      const { artistId } = req.body;

      const result =
        await findRootAndAccountById(artistId);

      const artist = result?.account;

      if (!artist?.stripeAccountId) {
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
  }
);


app.post(
  "/api/stripe/login-link",
  async (req, res) => {
    try {
      const { artistId } = req.body || {};

      const result =
        await findRootAndAccountById(artistId);

      const artist = result?.account;

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
      console.error(
        "STRIPE LOGIN LINK ERROR :",
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

app.post(
  "/api/stripe/account-status",
  async (req, res) => {
    try {
      const { artistId } = req.body;

      const result =
        await findRootAndAccountById(artistId);

      const artist = result?.account;

      if (!artist?.stripeAccountId) {
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

      await saveAccountState(
        result.rootUser,
        artist
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
  }
);


/* =========================
   DOWNLOADS ACCOUNT
========================= */

app.post(
  "/api/add-downloaded-pack",
  async (req, res) => {
    try {
      const { userId, packId } = req.body;

      const result =
        await findRootAndAccountById(userId);

      const account = result?.account;

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Compte introuvable."
        });
      }

      if (
        account.role !== "user" &&
        account.role !== "both"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Ce compte ne peut pas enregistrer de téléchargements."
        });
      }

      const pack = await packsCollection.findOne({
        id: String(packId),
        status: "approved"
      });
      const packIsFree =
        pack?.isFree === true ||
        String(pack?.price || "").trim().toLowerCase() === "gratuit";

      if (!pack) {
        return res.status(404).json({
          success: false,
          message: "Pack introuvable."
        });
      }

      if (!packIsFree && !commercialPolicy.freeAcquisitionEnabled) {
        return res.status(409).json({
          success: false,
          message: "Un achat Stripe vérifié est requis pour ce pack."
        });
      }

      if (!Array.isArray(account.downloadedPacks)) {
        account.downloadedPacks = [];
      }

      if (
        !account.downloadedPacks.includes(packId)
      ) {
        account.downloadedPacks.push(packId);
      }

      await saveAccountState(
        result.rootUser,
        account
      );

      return res.status(200).json({
        success: true,
        downloadedPacks: account.downloadedPacks
      });

    } catch (error) {
      console.error(
        "Erreur POST /api/add-downloaded-pack :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible d'enregistrer le téléchargement."
      });
    }
  }
);

app.post(
  "/api/add-downloaded-track",
  async (req, res) => {
    try {
      const { userId, trackId } = req.body;

      const result =
        await findRootAndAccountById(userId);

      const account = result?.account;

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Compte introuvable."
        });
      }

      if (
        account.role !== "user" &&
        account.role !== "both"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Ce compte ne peut pas enregistrer de téléchargements."
        });
      }

      const sourcePack = await packsCollection.findOne({
        status: "approved",
        "tracks.id": String(trackId)
      });
      const sourceTrack = sourcePack?.tracks?.find(
        (track) => String(track.id) === String(trackId)
      );
      const trackIsFree =
        sourceTrack?.isFree === true ||
        String(sourceTrack?.price || "").trim().toLowerCase() === "gratuit";

      if (!sourceTrack) {
        return res.status(404).json({
          success: false,
          message: "Track introuvable."
        });
      }

      if (!trackIsFree && !commercialPolicy.freeAcquisitionEnabled) {
        return res.status(409).json({
          success: false,
          message: "Un achat Stripe vérifié est requis pour cette track."
        });
      }

      if (!Array.isArray(account.downloadedTracks)) {
        account.downloadedTracks = [];
      }

      if (
        !account.downloadedTracks.includes(trackId)
      ) {
        account.downloadedTracks.push(trackId);
      }

      await saveAccountState(
        result.rootUser,
        account
      );

      return res.status(200).json({
        success: true,
        downloadedTracks: account.downloadedTracks
      });

    } catch (error) {
      console.error(
        "Erreur POST /api/add-downloaded-track :",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Impossible d'enregistrer le téléchargement."
      });
    }
  }
);


/* =========================
   ADMIN USERS
========================= */

app.get("/api/pending-users", async (req, res) => {
  try {
    const documents =
      await usersCollection.find({}).toArray();

    const pendingUsers = [];

    for (const document of documents) {
      if (Array.isArray(document.accounts)) {
        for (const account of document.accounts) {
          if (account.status === "pending") {
            pendingUsers.push(
              sanitizeAccount(
                account,
                document.id
              )
            );
          }
        }

      }
    }

    return res.status(200).json(
      pendingUsers
    );

  } catch (error) {
    console.error(
      "Erreur GET /api/pending-users :",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Impossible de récupérer les utilisateurs en attente."
    });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const result =
      await findRootAndAccountById(req.params.id);

    if (!result?.account) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    const returnedAccount = sanitizeAccount(
      result.account,
      result.rootUser.id
    );

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

app.patch(
  "/api/users/:id/status",
  async (req, res) => {
    try {
      const { status } = req.body;

      const result =
        await findRootAndAccountById(req.params.id);

      if (!result?.account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable"
        });
      }

      const moderatedAt = new Date().toISOString();

      if (status === "rejected" && !result.account.originalRole) {
        result.account.originalRole = String(result.account.role || "user").toLowerCase();
      }

      if (
        status === "rejected" &&
        String(result.account.role || "").toLowerCase() === "both"
      ) {
        result.account.artistStatus = "rejected";
        result.account.artistModeratedAt = moderatedAt;
        result.account.role = "user";
        result.account.status = "approved";
      } else {
        result.account.status = status;
      }

      result.account.moderatedAt = moderatedAt;

      await saveAccountState(
        result.rootUser,
        result.account
      );

      if (status === "rejected") {
        await createModerationDecisionNotice({
          accountId: result.account.accountId || result.account.id,
          decisionType: "artist_rejection",
          reason: req.body?.reason,
          initialDecision: "rejected"
        });
      }

      const returnedAccount = sanitizeAccount(
        result.account,
        result.rootUser.id
      );

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
  }
);


/* =========================
   PROFILE PATCH
========================= */

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

      const result =
        await findRootAndAccountById(id);

      if (!result?.account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      const account = result.account;

      account.pseudo = pseudo;

      if (req.file) {
        account.imageProfile =
          await uploadToR2(
            req.file,
            "profiles"
          );
      }

      await saveAccountState(
        result.rootUser,
        account
      );

      return res.status(200).json({
        success: true,
        message:
          "Profil mis à jour avec succès.",
        profile: sanitizeAccount(
          account,
          result.rootUser.id
        )
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
   ACCOUNT SETTINGS
========================= */


/* =========================
   FOUNDER — ACCOUNT SYNC QUEUE
========================= */

const SONARA_FOUNDER_SYNC_ENVIRONMENT = "test";

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

      const result =
        await findRootAndAccountById(id);

      if (!result?.account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      const account = result.account;

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
          rootUser: result.rootUser,
          account,
          changeType: "password",
          changedFields: ["password"]
        });

      await saveAccountState(
        result.rootUser,
        account
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
  async (req, res) => {
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

      const result =
        await findRootAndAccountById(id);

      if (!result?.account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      const account = result.account;

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
          rootUser: result.rootUser,
          account,
          changeType: "informations",
          changedFields,
          previousValues
        });

      await saveAccountState(
        result.rootUser,
        account
      );

      const updatedAccount = sanitizeAccount(
        account,
        result.rootUser.id
      );

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
  async (req, res) => {
    try {
      const id = String(req.body.id || "");

      const newMail =
        normalizeMail(req.body.newMail);

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

      const result =
        await findRootAndAccountById(id);

      if (!result?.account) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable."
        });
      }

      const account = result.account;

      if (
        account.password !== currentPassword
      ) {
        return res.status(401).json({
          success: false,
          message: "Mot de passe incorrect."
        });
      }

      const currentAccountId =
        account.accountId ||
        account.id;

      if (
        await isMailAlreadyUsed(
          newMail,
          currentAccountId
        )
      ) {
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
          rootUser: result.rootUser,
          account,
          changeType: "email",
          changedFields,
          previousValues
        });

      await saveAccountState(
        result.rootUser,
        account
      );

      const updatedAccount = sanitizeAccount(
        account,
        result.rootUser.id
      );

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


async function buildCreatorPackOverview(accountId, artistIds = [accountId]) {
  const packs = await packsCollection.find({}).toArray();
  const creatorPacks = packs.filter((pack) =>
    creatorPackBelongsTo(pack, accountId) && !isPackHiddenByModeration(pack)
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
    const { _id, ...publicPack } = pack;

    return {
      ...publicPack,
      license: normalizePackLicense(pack.license),
      licenseSummary: licenseModerationSummary(pack),
      trackCount: Array.isArray(pack.tracks) ? pack.tracks.length : 0,
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
      salesCount: stripeSales.length,
      buyerCount: new Set(stripeSales.map((sale) => sale.buyerId)).size,
      revenue: Number(
        (stripeSales.reduce((sum, sale) => sum + sale.artistRevenue, 0) / 100).toFixed(2)
      ),
      stripeStatsAvailable
    }
  };
}

app.get("/api/creator/packs/:accountId", async (req, res) => {
  try {
    const accountId = String(req.params.accountId || "").trim();
    if (!accountId) return res.status(400).json({ success: false, message: "Compte artiste manquant." });
    const result = await findRootAndAccountById(accountId);
    if (!result?.account || !isCreatorAccountActive(result.account)) {
      return res.status(403).json({ success: false, message: "Compte artiste indisponible ou sanctionné." });
    }
    const artistIds = [
      result.account.accountId,
      result.account.id,
      result.rootUser?.id,
      accountId
    ].filter(Boolean);
    return res.json({ success: true, ...(await buildCreatorPackOverview(accountId, artistIds)) });
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

    const pack = await packsCollection.findOne({ id: packId });
    if (!pack) {
      return res.status(404).json({ success: false, message: "Pack introuvable." });
    }

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

    const now = new Date().toISOString();
    const hadStoredLicense = Boolean(pack.license && typeof pack.license === "object");
    const update = buildUpdatedPackLicense(pack.license, submittedLicense, {
      hasCurrent: hadStoredLicense,
      packId,
      accountId,
      now
    });

    if (!update.changed) {
      const { _id, ...publicPack } = pack;
      return res.json({
        success: true,
        changed: false,
        moderationRequired: false,
        message: "La licence est déjà à jour.",
        pack: {
          ...publicPack,
          license: normalizePackLicense(pack.license)
        }
      });
    }

    const updates = {
      license: update.license,
      licenseUpdatedAt: now,
      updatedAt: now
    };

    if (hadStoredLicense) {
      updates.licenseHistory = appendPackLicenseHistory(
        pack.licenseHistory,
        pack.license,
        { archivedAt: now, reason: "creator_license_update" }
      );
    } else if (!Array.isArray(pack.licenseHistory)) {
      updates.licenseHistory = [];
    }

    // Aucun changement de statut : une licence modifiée depuis My Packs
    // est immédiatement active pour les futurs acheteurs.
    const result = await packsCollection.findOneAndUpdate(
      { id: packId },
      { $set: updates },
      { returnDocument: "after" }
    );
    const updated = result?.value || result;
    if (!updated) throw new Error("Le pack n’a pas été retrouvé après la mise à jour de sa licence.");

    const { _id, ...publicPack } = updated;
    return res.json({
      success: true,
      changed: true,
      moderationRequired: false,
      message: "Licence enregistrée et mise à jour côté acheteur.",
      pack: {
        ...publicPack,
        license: normalizePackLicense(publicPack.license),
        licenseSummary: licenseModerationSummary(publicPack)
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
  const uploadedTemporaryFiles = Array.isArray(req.files)
    ? req.files.map((file) => file.path)
    : [];
  const downloadedTemporaryFiles = [];
  const temporaryZips = [];
  const newR2Keys = [];
  let revisionCommitted = false;

  try {
    const packId = String(req.params.id || "");
    const accountId = String(req.body?.accountId || "");
    const pack = await packsCollection.findOne({ id: packId });

    if (!pack) {
      return res.status(404).json({ success: false, message: "Pack introuvable." });
    }

    if (isPackHiddenByModeration(pack)) {
      return res.status(403).json({ success: false, message: "Ce pack est masqué par une décision de modération." });
    }

    if (!creatorPackBelongsTo(pack, accountId)) {
      return res.status(403).json({ success: false, message: "Ce pack ne vous appartient pas." });
    }

    const tracks = (Array.isArray(pack.tracks) ? pack.tracks : []).map((track) => ({ ...track }));
    const updates = {};
    const now = new Date().toISOString();
    let requestedTracks = null;
    let contentChanged = false;
    let audioVersionsUpdated = 0;

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
      updates.title = title;
    }

    if (req.body?.price !== undefined) {
      const price = creatorPackPrice(req.body.price);
      if (price < 1 || price > 100000) {
        return res.status(400).json({ success: false, message: "Prix invalide." });
      }
      updates.price = `${price.toFixed(2)}€`;
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

    const replacements = [];
    for (const [fieldname, file] of fileByField.entries()) {
      const match = /^trackAudio_(\d+)$/.exec(fieldname);
      const trackIndex = match ? Number(match[1]) : -1;

      if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= tracks.length) {
        return res.status(400).json({ success: false, message: "La version audio ne correspond à aucun son du pack." });
      }

      const track = tracks[trackIndex];
      const previousAudioName = track.audioName;
      const previousDownloadZip = track.downloadZip;
      const audioKey = await uploadToR2(file, "tracks/audio");
      newR2Keys.push(audioKey);
      track.audioName = audioKey;
      track.audioVersion = Math.max(1, Number.parseInt(track.audioVersion, 10) || 1) + 1;
      track.audioUpdatedAt = now;
      replacements.push({
        index: trackIndex,
        file,
        previousAudioName,
        previousDownloadZip
      });
      audioVersionsUpdated += 1;
      contentChanged = true;
    }

    const oldR2Keys = [];
    if (audioVersionsUpdated > 0) {
      const revisionId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const localAudioPaths = [];

      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        const replacement = replacements.find((item) => item.index === trackIndex);
        if (replacement) {
          localAudioPaths.push(replacement.file.path);
          continue;
        }

        const extension = path.extname(String(tracks[trackIndex].audioName || "")) || ".audio";
        const temporaryAudioPath = path.join(
          __dirname,
          "uploads",
          `${pack.id}-${trackIndex}-${revisionId}${extension}`
        );
        await downloadPackR2File(tracks[trackIndex].audioName, temporaryAudioPath);
        downloadedTemporaryFiles.push(temporaryAudioPath);
        localAudioPaths.push(temporaryAudioPath);
      }

      const packZipPath = path.join(packsZipPath, `${pack.id}-${revisionId}.zip`);
      createZipFromPaths(packZipPath, localAudioPaths);
      temporaryZips.push(packZipPath);
      const packZipKey = `zips/packs/${pack.id}-${revisionId}.zip`;
      await uploadLocalFileToR2(packZipPath, packZipKey);
      newR2Keys.push(packZipKey);
      updates.downloadZip = packZipKey;
      oldR2Keys.push(pack.downloadZip);

      for (const replacement of replacements) {
        const track = tracks[replacement.index];
        const trackId = track.id || `${pack.id}-${replacement.index}`;
        const trackZipPath = path.join(tracksZipPath, `${trackId}-${revisionId}.zip`);
        createZipFromPaths(trackZipPath, [replacement.file.path]);
        temporaryZips.push(trackZipPath);
        const trackZipKey = `zips/tracks/${trackId}-${revisionId}.zip`;
        await uploadLocalFileToR2(trackZipPath, trackZipKey);
        newR2Keys.push(trackZipKey);
        track.downloadZip = trackZipKey;
        oldR2Keys.push(replacement.previousAudioName, replacement.previousDownloadZip);
      }
    }

    updates.tracks = tracks;
    updates.updatedAt = now;
    const previousStatus = String(pack.status || "draft").toLowerCase();
    const moderationRequired =
      contentChanged && ["approved", "pending"].includes(previousStatus);

    if (moderationRequired) {
      if (previousStatus === "approved") {
        updates.wasPublished = true;
        updates.publishedAt = pack.publishedAt || pack.moderatedAt || now;
      }
      updates.status = "pending";
      updates.submissionType = creatorPackWasPublished({ ...pack, ...updates })
        ? "republish"
        : "publish";
      updates.submittedAt = now;
    }

    const unset = { description: "" };
    if (moderationRequired) {
      unset.rejectionReason = "";
      unset.rejectedAt = "";
      unset.moderatedAt = "";
      unset.moderatedBy = "";
    }

    const result = await packsCollection.findOneAndUpdate(
      { id: packId },
      { $set: updates, $unset: unset },
      { returnDocument: "after" }
    );
    const updated = result?.value || result;
    if (!updated) throw new Error("Le pack n’a pas été retrouvé après sa modification.");
    revisionCommitted = true;

    await deletePackR2KeysBestEffort(oldR2Keys);

    const { _id, ...publicPack } = updated;
    if (moderationRequired) {
      try {
        await founderNotificationsCollection.deleteMany({
          $or: [
            { entityId: packId },
            { packId },
            { "metadata.entityId": packId }
          ]
        });
        await createFounderNotification({
          type: "pack",
          title: "Pack modifié à revérifier",
          message: `${publicPack.title || "Un pack"} a été modifié et attend une validation.`,
          entityId: publicPack.id,
          entityType: "pack",
          environment: "test",
          priority: "normal"
        });
      } catch (notificationError) {
        console.error("Notification Founder de révision non créée :", notificationError);
      }
    }

    return res.json({
      success: true,
      pack: publicPack,
      audioVersionsUpdated,
      moderationRequired
    });
  } catch (error) {
    if (!revisionCommitted) await deletePackR2KeysBestEffort(newR2Keys);
    console.error("Erreur PATCH /api/creator/packs/:id :", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Impossible de modifier ce pack."
    });
  } finally {
    uploadedTemporaryFiles.forEach(removeFileIfExists);
    downloadedTemporaryFiles.forEach(removeFileIfExists);
    temporaryZips.forEach(removeFileIfExists);
  }
});

app.post("/api/creator/packs/bulk", async (req, res) => {
  try {
    const accountId = String(req.body?.accountId || "");
    const action = String(req.body?.action || "");
    const packIds = [...new Set((Array.isArray(req.body?.packIds) ? req.body.packIds : []).map(String))];
    const allowedActions = ["delete", "draft", "publish", "republish"];

    if (!accountId || !packIds.length || !allowedActions.includes(action)) {
      return res.status(400).json({ success: false, message: "Action ou sélection invalide." });
    }

    const packs = await packsCollection.find({ id: { $in: packIds } }).toArray();
    const owned = packs.filter((pack) => creatorPackBelongsTo(pack, accountId));
    if (owned.some(isPackHiddenByModeration)) {
      return res.status(403).json({ success: false, message: "Un ou plusieurs packs sont masqués par la modération." });
    }
    if (owned.length !== packIds.length) {
      return res.status(403).json({ success: false, message: "Un ou plusieurs packs ne vous appartiennent pas." });
    }

    const now = new Date().toISOString();

    if (action === "draft") {
      for (const pack of owned) {
        const updates = {
          status: "draft",
          draftAt: now,
          updatedAt: now
        };
        if (String(pack.status || "").toLowerCase() === "approved") {
          updates.wasPublished = true;
          updates.publishedAt = pack.publishedAt || pack.moderatedAt || now;
        }
        await packsCollection.updateOne({ id: pack.id }, { $set: updates });
      }

      await founderNotificationsCollection.deleteMany({
        $or: [
          { entityId: { $in: packIds } },
          { packId: { $in: packIds } },
          { "metadata.entityId": { $in: packIds } }
        ]
      });
      return res.json({ success: true, message: `${packIds.length} pack(s) placé(s) en brouillon.` });
    }

    if (action === "publish" || action === "republish") {
      const invalidStatus = owned.some((pack) =>
        !["draft", "rejected"].includes(String(pack.status || "draft").toLowerCase())
      );
      const invalidHistory = owned.some((pack) =>
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

      const updates = {
        status: "pending",
        submissionType: action,
        submittedAt: now,
        updatedAt: now,
        ...(action === "republish" ? { republishedAt: now } : {})
      };

      await packsCollection.updateMany(
        { id: { $in: packIds } },
        {
          $set: updates,
          $unset: {
            rejectionReason: "",
            rejectedAt: "",
            moderatedAt: "",
            moderatedBy: ""
          }
        }
      );
      await founderNotificationsCollection.deleteMany({
        $or: [
          { entityId: { $in: packIds } },
          { packId: { $in: packIds } },
          { "metadata.entityId": { $in: packIds } }
        ]
      });

      for (const pack of owned) {
        try {
          await createFounderNotification({
            type: "pack",
            title: action === "publish" ? "Nouveau pack à publier" : "Pack republié à modérer",
            message: `${pack.title || "Un pack"} attend une validation avant publication.`,
            entityId: pack.id,
            entityType: "pack",
            environment: "test",
            priority: "normal"
          });
        } catch (notificationError) {
          console.error("Notification Founder de publication non créée :", notificationError);
        }
      }

      return res.json({
        success: true,
        message: action === "publish"
          ? `${packIds.length} pack(s) envoyé(s) en modération pour publication.`
          : `${packIds.length} pack(s) envoyé(s) en modération pour republication.`
      });
    }

    for (const pack of owned) {
      await deleteRejectedPackFromR2(pack);
    }
    await packsCollection.deleteMany({ id: { $in: packIds } });
    await founderNotificationsCollection.deleteMany({
      $or: [
        { entityId: { $in: packIds } },
        { packId: { $in: packIds } },
        { "metadata.entityId": { $in: packIds } }
      ]
    });
    return res.json({ success: true, message: `${packIds.length} pack(s) supprimé(s).` });
  } catch (error) {
    console.error("Erreur POST /api/creator/packs/bulk :", error);
    return res.status(500).json({ success: false, message: "Impossible d’appliquer cette action." });
  }
});


async function buildPublicCatalogueContext() {
  const documents = await usersCollection.find(
    {},
    {
      projection: {
        id: 1,
        accounts: 1
      }
    }
  ).toArray();

  const artistsById = new Map();
  const artistsByName = new Map();
  const downloadCounts = new Map();

  documents.forEach((rootUser) => {
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

function enrichPublicCataloguePack(pack, context) {
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

  return {
    ...pack,
    artistProfile,
    metrics: {
      ...(pack?.metrics && typeof pack.metrics === "object" ? pack.metrics : {}),
      downloadCount: context.downloadCounts.get(String(pack?.id || "")) || 0
    },
    license: normalizePackLicense(pack.license)
  };
}

app.get("/api/packs/pending", async (req, res) => {
  try {
    const packs = await packsCollection.find({
      moderationHidden: { $ne: true },
      status: { $ne: "moderation_hidden" }
    }).toArray();
    res.json(packs.map(({ _id, ...pack }) => ({
      ...pack,
      license: normalizePackLicense(pack.license)
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/packs", async (req, res) => {
  try {
    const [approvedPacks, catalogueContext] = await Promise.all([
      packsCollection.find({
        status: "approved",
        moderationHidden: { $ne: true }
      }).toArray(),
      buildPublicCatalogueContext()
    ]);

    res.json(approvedPacks.map(({ _id, ...pack }) =>
      enrichPublicCataloguePack(pack, catalogueContext)
    ));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
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
    const temporaryFiles = Array.isArray(req.files)
      ? req.files.map((file) => file.path)
      : [];

    const temporaryZips = [];

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

      const artistResult = await findRootAndAccountById(receivedPack.artistId);
      const packArtist = artistResult?.account;

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
        await saveAccountState(artistResult.rootUser, packArtist);

        if (!stripeVerified) {
          return res.status(403).json({
            success: false,
            code: "STRIPE_ACCOUNT_NOT_VERIFIED",
            message: "Votre compte bancaire Stripe doit être entièrement vérifié avant de créer un pack."
          });
        }
      }

      receivedPack.paymentReady = false;

      const existingPack = await packsCollection.findOne({
        id: receivedPack.id
      });

      if (existingPack) {
        return res.status(409).json({
          success: false,
          message: "Ce pack existe déjà. Recharge la page avant de recommencer."
        });
      }

      const coverPackFile = fileByField.get("coverPack");
      const packCoverKey = await uploadToR2(coverPackFile, "packs/covers");
      const preparedTracks = [];

      for (let index = 0; index < receivedPack.tracks.length; index += 1) {
        const track = receivedPack.tracks[index];
        const trackCoverFile = fileByField.get(`trackCover_${index}`);
        const trackAudioFile = fileByField.get(`trackAudio_${index}`);

        const [trackCoverKey, trackAudioKey] = await Promise.all([
          uploadToR2(trackCoverFile, "tracks/covers"),
          uploadToR2(trackAudioFile, "tracks/audio")
        ]);

         preparedTracks.push({
           ...track,
           coverPack: trackCoverKey,
           audioName: trackAudioKey,
           audioVersion: 1,
           _audioLocalPath: trackAudioFile.path
         });
      }

      const newPack = {
        ...receivedPack,
        coverPack: packCoverKey,
        tracks: preparedTracks,
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
        status: "pending",
        submissionType: "publish",
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      const packZipName = `${newPack.id}_pack.zip`;
      const packZipFullPath = path.join(packsZipPath, packZipName);
      temporaryZips.push(packZipFullPath);

      createZipFromPaths(
        packZipFullPath,
        newPack.tracks.map((track) => track._audioLocalPath)
      );

      newPack.downloadZip = await uploadLocalFileToR2(
        packZipFullPath,
        `zips/packs/${packZipName}`
      );

      for (const track of newPack.tracks) {
        const trackZipName = `${track.id}.zip`;
        const trackZipFullPath = path.join(tracksZipPath, trackZipName);
        temporaryZips.push(trackZipFullPath);

        createZipFromPaths(trackZipFullPath, [track._audioLocalPath]);

        track.downloadZip = await uploadLocalFileToR2(
          trackZipFullPath,
          `zips/tracks/${trackZipName}`
        );

        delete track._audioLocalPath;
      }

      const insertResult = await packsCollection.insertOne(newPack);

      if (!insertResult.acknowledged) {
        throw new Error("MongoDB n’a pas confirmé l’enregistrement du pack.");
      }

      const storedPackDocument = await packsCollection.findOne({ id: newPack.id });

      if (!storedPackDocument) {
        throw new Error("Le pack n’a pas été retrouvé après son enregistrement.");
      }

      const { _id, ...storedPack } = storedPackDocument;
      let notificationCreated = true;

      try {
        await createFounderNotification({
          type: "pack",
          title: "Nouveau pack à modérer",
          message: `${storedPack.title} attend une validation.`,
          entityId: storedPack.id,
          entityType: "pack",
          environment: "test",
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
        pack: storedPack
      });
    } catch (error) {
      console.error("ERREUR /api/packs/pending :", error);

      return res.status(500).json({
        success: false,
        message: "Le pack n’a pas pu être uploadé et préparé correctement."
      });
    } finally {
      temporaryFiles.forEach(removeFileIfExists);
      temporaryZips.forEach(removeFileIfExists);
    }
  }
);


app.post("/api/free-download-access", async (req, res) => {
  try {
    const { userId, packId, trackId, licenseVersion, licenseId } = req.body || {};

    if (!userId || !packId) {
      return res.status(400).json({
        success: false,
        message: "Utilisateur ou pack manquant."
      });
    }

    const pack = await packsCollection.findOne({
      id: String(packId),
      status: "approved"
    });

    if (!pack) {
      return res.status(404).json({
        success: false,
        message: "Pack introuvable."
      });
    }

    const currentLicenseMetadata = licenseMetadata(pack);
    const acceptedLicenseVersion = String(licenseVersion || "").trim();
    const acceptedLicenseId = String(licenseId || "").trim();

    if (
      (acceptedLicenseVersion && acceptedLicenseVersion !== currentLicenseMetadata.licenseVersion) ||
      (acceptedLicenseId && acceptedLicenseId !== currentLicenseMetadata.licenseId)
    ) {
      return res.status(409).json({
        success: false,
        code: "PACK_LICENSE_CHANGED",
        message: "La licence du pack a changé. Relisez et acceptez la nouvelle version."
      });
    }

    const item = trackId
      ? pack.tracks?.find((track) => String(track.id) === String(trackId))
      : pack;

    const isFree =
      item?.isFree === true ||
      String(item?.price || "").trim().toLowerCase() === "gratuit";

    if (!item || (!isFree && !commercialPolicy.freeAcquisitionEnabled)) {
      return res.status(409).json({
        success: false,
        message: "Ce contenu n’est pas gratuit."
      });
    }

    const result = await findRootAndAccountById(userId);

    if (!result?.account) {
      return res.status(404).json({
        success: false,
        message: "Compte utilisateur introuvable."
      });
    }

    if (result.account.role !== "user" && result.account.role !== "both") {
      return res.status(403).json({
        success: false,
        message: "Ce compte ne peut pas effectuer de téléchargement."
      });
    }

    if (trackId) {
      result.account.downloadedTracks = Array.isArray(result.account.downloadedTracks)
        ? result.account.downloadedTracks
        : [];

      if (!result.account.downloadedTracks.includes(trackId)) {
        result.account.downloadedTracks.push(trackId);
      }
    } else {
      result.account.downloadedPacks = Array.isArray(result.account.downloadedPacks)
        ? result.account.downloadedPacks
        : [];

      if (!result.account.downloadedPacks.includes(packId)) {
        result.account.downloadedPacks.push(packId);
      }
    }

    await saveAccountState(result.rootUser, result.account);

    const pathPart = trackId
      ? `app/pages/catalog/download.html?id=${encodeURIComponent(packId)}&trackId=${encodeURIComponent(trackId)}&free=true`
      : `app/pages/catalog/download.html?id=${encodeURIComponent(packId)}&free=true`;

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

async function fulfillPaidStripeCheckout(session) {
  if (!session || session.payment_status !== "paid") {
    throw new Error("La session Stripe n’est pas payée.");
  }

  const metadata = session.metadata || {};
  const userId = String(metadata.userId || "").trim();
  const packId = String(metadata.packId || "").trim();
  const trackId = String(metadata.trackId || "").trim();
  const purchaseType = String(metadata.purchaseType || (trackId ? "track" : "pack"));

  if (!userId || !packId) {
    throw new Error("Métadonnées Stripe incomplètes.");
  }

  const result = await findRootAndAccountById(userId);
  const account = result?.account;

  if (!account) {
    throw new Error("Compte acheteur introuvable.");
  }

  if (purchaseType === "track") {
    if (!trackId) throw new Error("Track Stripe manquante.");
    account.downloadedTracks = Array.isArray(account.downloadedTracks)
      ? account.downloadedTracks
      : [];

    if (!account.downloadedTracks.some((id) => String(id) === trackId)) {
      account.downloadedTracks.push(trackId);
    }
  } else {
    account.downloadedPacks = Array.isArray(account.downloadedPacks)
      ? account.downloadedPacks
      : [];

    if (!account.downloadedPacks.some((id) => String(id) === packId)) {
      account.downloadedPacks.push(packId);
    }
  }

  account.lastStripePurchase = {
    sessionId: String(session.id || ""),
    paymentIntentId: String(session.payment_intent || ""),
    packId,
    trackId: trackId || null,
    purchaseType,
    amountTotal: Number(session.amount_total || 0),
    currency: String(session.currency || "eur"),
    paidAt: new Date().toISOString()
  };

  await saveAccountState(result.rootUser, account);

  return { account, packId, trackId: trackId || null, purchaseType };
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
      trackId: fulfilled.trackId
    });
  } catch (error) {
    console.error("Confirmation Stripe impossible :", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Impossible de confirmer le paiement Stripe."
    });
  }
});

app.post(
  "/api/stripe/create-checkout-session",
  async (req, res) => {
    try {
      const { packId, trackId, userId, licenseVersion, licenseId } = req.body;

      if (!packId) {
        return res.status(400).json({
          error: "packId manquant."
        });
      }

      if (!userId) {
        return res.status(400).json({
          error: "Utilisateur manquant."
        });
      }

      const pack = await packsCollection.findOne({
        id: String(packId)
      });

      if (!pack) {
        return res.status(404).json({
          error: "Pack introuvable."
        });
      }

      if (String(pack.status || "").toLowerCase() !== "approved") {
        return res.status(409).json({
          error: "Ce pack n’est pas disponible à l’achat."
        });
      }

      const currentLicenseMetadata = licenseMetadata(pack);
      const acceptedLicenseVersion = String(licenseVersion || "").trim();
      const acceptedLicenseId = String(licenseId || "").trim();

      if (
        (acceptedLicenseVersion && acceptedLicenseVersion !== currentLicenseMetadata.licenseVersion) ||
        (acceptedLicenseId && acceptedLicenseId !== currentLicenseMetadata.licenseId)
      ) {
        return res.status(409).json({
          error: "La licence du pack a changé. Revenez sur le pack pour lire et accepter la nouvelle version.",
          code: "PACK_LICENSE_CHANGED",
          currentLicenseVersion: currentLicenseMetadata.licenseVersion
        });
      }

      const buyerResult =
        await findRootAndAccountById(userId);

      const buyer = buyerResult?.account;

      if (!buyer) {
        return res.status(404).json({
          error: "Compte acheteur introuvable."
        });
      }

      if (buyer.role !== "user" && buyer.role !== "both") {
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
        : Array.isArray(buyer.downloadedPacks) && buyer.downloadedPacks.some((id) => String(id) === String(packId));

      if (alreadyOwned) {
        return res.status(409).json({
          success: false,
          code: "ALREADY_OWNED",
          error: "Ce contenu est déjà dans votre bibliothèque."
        });
      }

      if (pack.paymentReady !== true) {
        return res.status(409).json({
          success: false,
          code: "PACK_PAYMENT_NOT_READY",
          error: "Ce pack n’est pas encore disponible à la vente."
        });
      }

      const artistResult =
        await findArtistAccountForPack(pack);

      const artist = artistResult?.account;

      if (!artist) {
        return res.status(404).json({
          error: "Artiste introuvable."
        });
      }

      if (!artist.stripeAccountId) {
        return res.status(400).json({
          error: "Artiste Stripe non connecté.",
          artistId:
            artist.id ||
            artist.accountId,
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
        await saveAccountState(artistResult.rootUser, artist);
      }

      if (!stripeVerified) {
        return res.status(409).json({
          error: "Le compte Stripe de l’artiste n’est pas encore vérifié."
        });
      }

      let item;
      let purchaseType;
      let successUrl;

      if (trackId) {
        const track = pack.tracks?.find(
          (currentTrack) =>
            String(currentTrack.id) ===
            String(trackId)
        );

        if (!track) {
          return res.status(404).json({
            error: "Track introuvable."
          });
        }

        item = track;
        purchaseType = "track";

        successUrl =
          `${resolveFrontUrl(req)}/${track.downloadPage}&success=true&session_id={CHECKOUT_SESSION_ID}`;

      } else {
        item = pack;
        purchaseType = "pack";

        successUrl =
          `${resolveFrontUrl(req)}/${pack.downloadPage}&success=true&session_id={CHECKOUT_SESSION_ID}`;
      }

      const itemIsFree =
        item.isFree === true ||
        String(item.price || "").trim().toLowerCase() === "gratuit";

      if (itemIsFree) {
        return res.status(409).json({
          success: false,
          error:
            "Ce contenu est gratuit et ne doit pas passer par Stripe."
        });
      }

      const rawPrice =
        item.price ||
        item.packPrice ||
        item.totalPrice;

      if (!rawPrice) {
        return res.status(400).json({
          error: "Prix manquant sur l'item."
        });
      }

      const priceNumber = Number(
        String(rawPrice)
          .replace("€", "")
          .replace(",", ".")
          .trim()
      );

      if (
        !Number.isFinite(priceNumber) ||
        priceNumber <= 0
      ) {
        return res.status(400).json({
          error: "Prix invalide.",
          rawPrice
        });
      }

      const amount =
        Math.round(priceNumber * 100);

      const commissionCents = Math.round(amount * 0.20);
      const sonaraOrderId = `order_${crypto.randomUUID()}`;

      const session =
        await stripe.checkout.sessions.create(
          {
            mode: "payment",

            payment_method_types: [
              "card"
            ],

            line_items: [
              {
                price_data: {
                  currency: "eur",
                  product_data: {
                    name:
                      purchaseType === "track"
                        ? `${item.title} - ${pack.title || pack.name}`
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
              userId: String(userId),
              artistId: String(artist.accountId || artist.id),
              purchaseType: purchaseType,
              sonaraCommissionRate: "0.20",
              sonaraCommissionCents: String(commissionCents),
              sonaraEnvironment: "TEST",
              sonaraSource: "SONARA_PACK",
              orderId: sonaraOrderId,
              packTitleSnapshot: String(pack.title || pack.name || "Pack Sonara").slice(0, 450),
              trackTitleSnapshot: purchaseType === "track" ? String(item.title || "Track").slice(0, 450) : "",
              artistNameSnapshot: String(artist.username || artist.pseudo || artist.name || artist.firstname || "Artiste").slice(0, 450),
              ...licenseMetadata(pack)
            },

            payment_intent_data: {
              application_fee_amount: commissionCents,
              metadata: {
                packId: String(pack.id),
                trackId: trackId ? String(trackId) : "",
                userId: String(userId),
                artistId: String(artist.accountId || artist.id),
                purchaseType: purchaseType,
                sonaraCommissionRate: "0.20",
                sonaraCommissionCents: String(commissionCents),
                sonaraEnvironment: "TEST",
                sonaraSource: "SONARA_PACK",
                orderId: sonaraOrderId,
                packTitleSnapshot: String(pack.title || pack.name || "Pack Sonara").slice(0, 450),
                trackTitleSnapshot: purchaseType === "track" ? String(item.title || "Track").slice(0, 450) : "",
                artistNameSnapshot: String(artist.username || artist.pseudo || artist.name || artist.firstname || "Artiste").slice(0, 450),
                ...licenseMetadata(pack)
              },
              transfer_data: {
                destination: artist.stripeAccountId
              }
            },

            success_url: successUrl,

            cancel_url:
              `${resolveFrontUrl(req)}/app/pages/catalog/pack.html?id=${pack.id}&cancel=true`
          }
        );

      return res.status(200).json({
        url: session.url,
        sessionId: session.id
      });

    } catch (error) {
      console.error(
        "STRIPE CHECKOUT ERROR :",
        error
      );

      return res.status(500).json({
        error:
          "Erreur création session Stripe.",
        message: error.message,
        type: error.type || null,
        code: error.code || null
      });
    }
  }
);


app.patch("/api/packs/:id/status", async (req, res) => {
  try {
    const packId = String(req.params.id || "");
    const status = String(req.body?.status || "");

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Statut de pack invalide"
      });
    }

    if (status === "rejected") {
      const moderatedAt = new Date().toISOString();
      const result = await packsCollection.findOneAndUpdate(
        { id: packId },
        { $set: {
          status: "rejected",
          rejectionReason: String(req.body?.reason || "La demande ne respecte pas les critères de validation Sonara.").trim(),
          moderatedAt,
          updatedAt: moderatedAt
        } },
        { returnDocument: "after" }
      );
      const rejectedPack = result?.value || result;
      if (!rejectedPack) return res.status(404).json({ success: false, message: "Pack introuvable" });
      await founderNotificationsCollection.deleteMany({
        $or: [
          { entityId: packId },
          { packId },
          { "metadata.entityId": packId }
        ]
      });

      await createModerationDecisionNotice({
        accountId: rejectedPack.artistId,
        decisionType: "pack_rejection",
        resourceId: rejectedPack.id,
        reason: rejectedPack.rejectionReason,
        initialDecision: "rejected"
      });

      const { _id, ...publicPack } = rejectedPack;
      return res.json({
        success: true,
        message: "Pack refusé et conservé pour une éventuelle contestation",
        deleted: false,
        pack: publicPack
      });
    }

    const moderatedAt = new Date().toISOString();
    const existingPack = status === "approved"
      ? await packsCollection.findOne({ id: packId })
      : null;
    const result = await packsCollection.findOneAndUpdate(
      { id: packId },
      {
        $set: {
          status,
          moderatedAt,
          updatedAt: moderatedAt,
          ...(status === "approved"
            ? {
                wasPublished: true,
                publishedAt: existingPack?.publishedAt || moderatedAt
              }
            : {})
        },
        ...(status === "approved"
          ? { $unset: { rejectionReason: "", rejectedAt: "" } }
          : {})
      },
      { returnDocument: "after" }
    );

    const updatedPack = result?.value || result;

    if (!updatedPack) {
      return res.status(404).json({
        success: false,
        message: "Pack introuvable"
      });
    }
    await founderNotificationsCollection.deleteMany({
      $or: [
        { entityId: packId },
        { packId },
        { "metadata.entityId": packId }
      ]
    });

    const { _id, ...publicPack } = updatedPack;
    return res.json({
      success: true,
      message: `Pack ${status}`,
      pack: publicPack
    });
  } catch (error) {
    console.error("Erreur modération pack :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de terminer la modération du pack.",
      error: error.message
    });
  }
})



/* =========================
   SUPPORT + FOUNDER INTERNE
========================= */

const supportCollection = db.collection("support_tickets");
const founderNotificationsCollection = db.collection("founder_notifications");
const moderationAppealsCollection = db.collection("moderation_appeals");

function requireFounderKey(req, res, next) {
  const expected = String(process.env.FOUNDER_ACCESS_KEY || "").trim();
  const received = String(req.get("x-founder-key") || "").trim();

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "FOUNDER_ACCESS_KEY absente sur Sonara."
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
    await backfillMongoPublishedAt(packsCollection);
    const packs = await packsCollection.find({
      status: "approved",
      moderationHidden: { $ne: true }
    }).toArray();
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
    const artistResult = await findRootAndAccountById(requestedArtistId);
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
      environment: "test",
      artistId: requestedArtistId,
      activity,
      ...payload
    });
  } catch (error) {
    console.error("Erreur missions Creator test :", error);
    return res.status(500).json({ success: false, message: "Impossible de charger les missions." });
  }
});

/* =========================
   ACTIVITÉ ARTISTE PRE-V1 — INTERNE
========================= */
app.get("/api/founder/pre-v1-artist-activity", requireFounderKey, async (req, res) => {
  try {
    const backfill = await backfillMongoPublishedAt(packsCollection);
    const packs = await packsCollection.find({
      status: "approved",
      moderationHidden: { $ne: true }
    }).toArray();

    const report = buildPreV1ActivityReport(packs);
    const requestedArtistId = String(req.query?.artistId || "").trim();

    return res.json({
      success: true,
      environment: "test",
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
    console.error("Erreur activité artiste Pre-V1 test :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de calculer l’activité artiste Pre-V1."
    });
  }
});


async function createFounderNotification({
  type,
  title,
  message,
  entityId,
  entityType = null,
  environment = "test",
  priority = "normal"
}) {
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

  await founderNotificationsCollection.insertOne(notification);
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
      message = ""
    } = req.body || {};

    if (!accountId || !String(subject).trim() || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "Compte, objet et description obligatoires."
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
      status: "open",
      replies: [],
      priority: category === "security" ? "urgent" : "normal",
      createdAt,
      updatedAt: createdAt
    };

    await supportCollection.insertOne(ticket);

    await createFounderNotification({
      type: "support",
      title: ticket.priority === "urgent" ? "Ticket support urgent" : "Nouveau ticket support",
      message: `${ticket.pseudo || ticket.email || "Utilisateur"} — ${ticket.subject}`,
      entityId: ticket.id,
      priority: ticket.priority
    });

    const { _id, ...publicTicket } = ticket;
    return res.status(201).json({ success: true, ticket: publicTicket });
  } catch (error) {
    console.error("Erreur création ticket support :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de créer la demande."
    });
  }
});

app.get("/api/support/tickets/:accountId", async (req, res) => {
  try {
    const tickets = await supportCollection
      .find({ accountId: String(req.params.accountId || "") })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      success: true,
      tickets: tickets.map(({ _id, ...ticket }) => ticket)
    });
  } catch (error) {
    console.error("Erreur lecture tickets support :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de charger les demandes."
    });
  }
});


app.post("/api/founder/support/:id/replies", requireFounderKey, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "La réponse ne peut pas être vide."
      });
    }

    const reply = {
      id: `reply_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      sender: "founder",
      message,
      createdAt: new Date().toISOString()
    };

    const result = await supportCollection.findOneAndUpdate(
      {
        $or: [
          { id: req.params.id },
          { ticketId: req.params.id }
        ]
      },
      {
        $push: { replies: reply },
        $set: {
          status: "in_progress",
          updatedAt: new Date().toISOString()
        }
      },
      {
        returnDocument: "after"
      }
    );

    const ticket = result?.value || result;

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket introuvable."
      });
    }

    const { _id, ...publicTicket } = ticket;

    return res.status(201).json({
      success: true,
      ticket: publicTicket,
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

app.delete("/api/founder/support/:id", requireFounderKey, async (req, res) => {
  try {
    const result = await supportCollection.deleteOne({
      $or: [
        { id: req.params.id },
        { ticketId: req.params.id }
      ]
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        success: false,
        message: "Ticket introuvable."
      });
    }

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

app.get("/api/founder/support", requireFounderKey, async (_req, res) => {
  const items = await supportCollection
    .find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  const tickets = items.map(({ _id, ...item }) => item);
  res.json({ success: true, items: tickets, tickets });
});

app.patch("/api/founder/support/:id/status", requireFounderKey, async (req, res) => {
  const result = await supportCollection.updateOne(
    {
      $or: [
        { id: req.params.id },
        { ticketId: req.params.id }
      ]
    },
    {
      $set: {
        status: String(req.body.status || "open"),
        updatedAt: new Date().toISOString()
      }
    }
  );

  if (!result.matchedCount) {
    return res.status(404).json({
      success: false,
      message: "Ticket introuvable."
    });
  }

  res.json({ success: true });
});

app.get("/api/founder/notifications", requireFounderKey, async (_req, res) => {
  const items = await founderNotificationsCollection
    .find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  const notifications = items.map(({ _id, ...item }) => item);
  res.json({ success: true, items: notifications, notifications });
});

app.patch("/api/founder/notifications/read-all", requireFounderKey, async (_req, res) => {
  await founderNotificationsCollection.updateMany(
    { read: false },
    {
      $set: {
        read: true,
        readAt: new Date().toISOString()
      }
    }
  );

  res.json({ success: true });
});

app.patch("/api/founder/notifications/:id/read", requireFounderKey, async (req, res) => {
  const result = await founderNotificationsCollection.updateOne(
    { id: req.params.id },
    {
      $set: {
        read: true,
        readAt: new Date().toISOString()
      }
    }
  );

  if (!result.matchedCount) {
    return res.status(404).json({
      success: false,
      message: "Notification introuvable."
    });
  }

  res.json({ success: true });
});

app.delete("/api/founder/notifications", requireFounderKey, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];

  if (!ids.length) {
    return res.status(400).json({
      success: false,
      message: "Aucune notification sélectionnée."
    });
  }

  const result = await founderNotificationsCollection.deleteMany({
    id: { $in: ids }
  });

  return res.json({
    success: true,
    deletedCount: result.deletedCount || 0
  });
});




/* =========================
   FOUNDER COHÉRENCE V5.1.6
========================= */

function sanitizeFounderAccount(account, userId) {
  if (!account || typeof account !== "object") return null;
  const safe = { ...account, userId };
  delete safe.password;
  delete safe.verificationToken;
  return safe;
}

async function getRemoteFounderAccounts() {
  const documents = await usersCollection.find({}).toArray();

  return documents.flatMap((rootUser) =>
    Array.isArray(rootUser.accounts)
      ? rootUser.accounts.map((account) =>
          sanitizeFounderAccount(account, rootUser.id || String(rootUser._id))
        )
      : []
  ).filter(Boolean);
}


async function recordMongoPlatformActivity(requestedAccountId, occurredAt) {
  const result = await findRootAndAccountById(requestedAccountId);
  if (!result?.account) return { found: false, recorded: false };

  const recorded = applyPlatformActivity(result.account, occurredAt);
  if (recorded) await saveAccountState(result.rootUser, result.account);

  return {
    found: true,
    recorded,
    day: platformGrowthDayKey(occurredAt)
  };
}

registerPlatformGrowth({
  app,
  environment: "test",
  requireFounder: requireFounderKey,
  getAccounts: getRemoteFounderAccounts,
  recordActivity: recordMongoPlatformActivity,
  financeApi: founderFinance
});

app.get("/api/founder/health", requireFounderKey, async (_req, res) => {
  try {
    await db.command({ ping: 1 });

    const [users, packs, tickets, notifications] = await Promise.all([
      usersCollection.countDocuments({}),
      packsCollection.countDocuments({}),
      supportCollection.countDocuments({}),
      founderNotificationsCollection.countDocuments({})
    ]);

    return res.json({
      success: true,
      environment: process.env.NODE_ENV || "render",
      database: "mongodb",
      storage: {
        mongodb: true,
        r2Configured: Boolean(
          r2Endpoint &&
          process.env.R2_ACCESS_KEY_ID &&
          r2SecretAccessKey &&
          process.env.R2_BUCKET_NAME
        )
      },
      counts: { users, packs, tickets, notifications },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: `MongoDB indisponible : ${error.message}`
    });
  }
});

app.get("/api/founder/overview", requireFounderKey, async (_req, res) => {
  const accounts = await getRemoteFounderAccounts();

  const [
    pendingPacks,
    approvedPacks,
    openTickets,
    unreadNotifications,
    urgent,
    recentNotifications
  ] = await Promise.all([
    packsCollection.countDocuments({ status: "pending" }),
    packsCollection.countDocuments({ status: "approved" }),
    supportCollection.countDocuments({ status: { $in: ["open", "in_progress"] } }),
    founderNotificationsCollection.countDocuments({ read: { $ne: true } }),
    founderNotificationsCollection.countDocuments({
      read: { $ne: true },
      priority: "urgent"
    }),
    founderNotificationsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray()
  ]);

  const counts = {
    unreadNotifications,
    urgent,
    openTickets,
    pendingArtists: accounts.filter((item) =>
      item.status === "pending" && ["artist", "both"].includes(item.role)
    ).length,
    pendingPacks,
    users: accounts.length,
    approvedPacks
  };

  res.json({
    success: true,
    counts,
    stats: counts,
    recentNotifications: recentNotifications.map(({ _id, ...item }) => item)
  });
});



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

async function createModerationDecisionNotice({
  accountId,
  decisionType,
  resourceId = null,
  reason,
  initialDecision = "rejected"
}) {
  const target = await findRootAndAccountById(String(accountId || ""));
  if (!target?.account) return null;

  const now = new Date().toISOString();
  const safeReason = String(reason || "La demande ne respecte pas les critères de validation Sonara.").trim();
  const record = {
    id: `decision_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    appealId: null,
    recordType: "decision_notice",
    appealSubmitted: false,
    active: false,
    accountId: String(target.account.accountId || target.account.id || ""),
    userId: String(target.rootUser.id || target.rootUser._id || ""),
    rootUserId: String(target.rootUser.id || target.rootUser._id || ""),
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
    environment: "test",
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

  await moderationAppealsCollection.insertOne(record);
  target.account.moderationNotice = {
    id: record.id,
    type: "moderation_decision",
    decisionType: record.decisionType,
    resourceId: record.resourceId,
    reason: record.initialReason,
    createdAt: now,
    read: false
  };
  await saveAccountState(target.rootUser, target.account);
  return record;
}

function publicAppealRecord(record) {
  if (!record || typeof record !== "object") return null;
  const { _id, ...copy } = record;
  return copy;
}

async function sendAppealDecisionEmail(to, decision, message) {
  const email = String(to || "").trim();
  if (!email || !process.env.RESEND_API_KEY) return false;
  try {
    await resend.emails.send({
      from: "Sonara Pack <notifications@sonarapack.com>",
      to: email,
      subject: decision === "accepted"
        ? "Votre contestation Sonara a été acceptée"
        : "Décision concernant votre contestation Sonara",
      html: `<div style="font-family:Arial,sans-serif;background:#080b12;color:#fff;padding:30px;border-radius:16px"><h1 style="color:#7ddcff">Décision Sonara</h1><p>${String(message || "").replace(/[&<>\"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[char]))}</p></div>`
    });
    return true;
  } catch (error) {
    console.error("Erreur e-mail contestation :", error.message);
    return false;
  }
}

app.get("/api/appeals/decisions/:accountId", async (req, res) => {
  const accountId = String(req.params.accountId || "").trim();
  if (!accountId) return res.status(400).json({ success: false, message: "Compte obligatoire." });

  const items = await moderationAppealsCollection.find({
    accountId,
    $or: [
      { appealSubmitted: { $ne: true }, initialNoticeRead: { $ne: true } },
      { appealSubmitted: true, active: false, finalResponse: { $exists: true, $ne: "" }, finalDecisionRead: { $ne: true } }
    ]
  }).sort({ updatedAt: -1, createdAt: -1 }).toArray();

  const decisions = items.map(publicAppealRecord);
  return res.json({ success: true, items: decisions, decisions });
});

app.post("/api/appeals", async (req, res) => {
  try {
    const accountId = String(req.body?.accountId || "").trim();
    const decisionId = String(req.body?.decisionId || "").trim();
    const message = String(req.body?.message || "").trim();

    if (!accountId || !decisionId || message.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Décision, compte et message de contestation d’au moins 10 caractères obligatoires."
      });
    }

    const existing = await moderationAppealsCollection.findOne({
      $or: [{ id: decisionId }, { appealId: decisionId }],
      accountId
    });
    if (!existing) return res.status(404).json({ success: false, message: "Décision introuvable pour ce compte." });
    if (existing.appealSubmitted === true) return res.status(409).json({ success: false, message: "Cette décision a déjà été contestée." });

    const now = new Date().toISOString();
    const appealId = `appeal_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const history = Array.isArray(existing.history) ? existing.history : [];
    history.push({ type: "appeal_submitted", message, createdAt: now, source: "user" });

    const result = await moderationAppealsCollection.findOneAndUpdate(
      { id: existing.id, accountId, appealSubmitted: { $ne: true } },
      { $set: {
        appealId,
        recordType: "appeal",
        appealSubmitted: true,
        active: true,
        message,
        status: "pending",
        submittedAt: now,
        updatedAt: now,
        initialNoticeRead: true,
        history
      } },
      { returnDocument: "after" }
    );
    const appeal = result?.value || result;
    if (!appeal) return res.status(409).json({ success: false, message: "Cette décision a déjà été contestée." });

    await createFounderNotification({
      type: "moderation_appeal",
      title: "Nouvelle contestation",
      message: `${appeal.pseudo || appeal.email || appeal.accountId} conteste une décision ${appeal.decisionType}.`,
      entityId: appeal.appealId,
      priority: "important"
    });

    return res.status(201).json({ success: true, appeal: publicAppealRecord(appeal), item: publicAppealRecord(appeal) });
  } catch (error) {
    console.error("Erreur création contestation :", error);
    return res.status(500).json({ success: false, message: "Impossible d’envoyer la contestation." });
  }
});

app.post("/api/appeals/:id/forfeit", async (req, res) => {
  try {
    const accountId = String(req.body?.accountId || "").trim();
    if (!accountId) {
      return res.status(400).json({ success: false, message: "Compte obligatoire." });
    }
    const requestedId = String(req.params.id || "");
    const item = await moderationAppealsCollection.findOne({
      $or: [{ id: requestedId }, { appealId: requestedId }],
      accountId
    });

    if (!item) return res.status(404).json({ success: false, message: "Décision introuvable." });
    if (String(item.decisionType || "").toLowerCase() !== "ban") {
      return res.status(400).json({ success: false, message: "Seul un bannissement peut être abandonné définitivement." });
    }
    if (item.appealSubmitted === true) {
      return res.status(409).json({ success: false, message: "La contestation a déjà été envoyée : les données restent en quarantaine." });
    }

    const deletion = await permanentlyDeleteBannedArtist(item.accountId, {
      reason: "Opportunité de contestation abandonnée par l’artiste"
    });

    return res.json({
      success: true,
      permanentlyDeleted: true,
      message: "Le compte artiste et tout son contenu ont été supprimés définitivement.",
      deletion
    });
  } catch (error) {
    console.error("Erreur abandon bannissement :", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Suppression définitive impossible.",
      failures: error.failures || undefined
    });
  }
});

app.patch("/api/appeals/:id/read", async (req, res) => {
  const accountId = String(req.body?.accountId || "").trim();
  const stage = String(req.body?.stage || "initial").toLowerCase();
  const now = new Date().toISOString();
  const set = stage === "final"
    ? { finalDecisionRead: true, finalDecisionReadAt: now, updatedAt: now }
    : { initialNoticeRead: true, initialNoticeReadAt: now, updatedAt: now };

  const result = await moderationAppealsCollection.updateOne(
    { $or: [{ id: String(req.params.id || "") }, { appealId: String(req.params.id || "") }], ...(accountId ? { accountId } : {}) },
    { $set: set }
  );
  if (!result.matchedCount) return res.status(404).json({ success: false, message: "Décision introuvable." });
  return res.json({ success: true });
});

app.get("/api/founder/appeals", requireFounderKey, async (_req, res) => {
  const appeals = await moderationAppealsCollection.find({
    appealSubmitted: true,
    active: true,
    status: "pending"
  }).sort({ submittedAt: -1, createdAt: -1 }).toArray();
  const items = appeals.map(publicAppealRecord);
  return res.json({ success: true, items, appeals: items });
});

app.get("/api/founder/appeals/:id", requireFounderKey, async (req, res) => {
  const item = await moderationAppealsCollection.findOne({
    $or: [{ id: String(req.params.id || "") }, { appealId: String(req.params.id || "") }],
    appealSubmitted: true
  });
  if (!item) return res.status(404).json({ success: false, message: "Contestation introuvable." });
  return res.json({ success: true, item: publicAppealRecord(item), appeal: publicAppealRecord(item) });
});

app.patch("/api/founder/appeals/:id/decision", requireFounderKey, async (req, res) => {
  try {
    const requestedId = String(req.params.id || "");
    const appeal = await moderationAppealsCollection.findOne({
      $or: [{ id: requestedId }, { appealId: requestedId }],
      appealSubmitted: true,
      active: true
    });
    if (!appeal) return res.status(404).json({ success: false, message: "Contestation active introuvable." });

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

    if (!["accepted", "rejected"].includes(decision)) return res.status(400).json({ success: false, message: "Décision finale invalide." });
    if (!allowedActions.has(action)) return res.status(400).json({ success: false, message: "Action de restauration invalide." });
    if (!finalResponse) return res.status(400).json({ success: false, message: "Le message envoyé à l’utilisateur est obligatoire." });
    if (action === "custom" && !customDecision) return res.status(400).json({ success: false, message: "La décision personnalisée doit être écrite." });

    const target = await findRootAndAccountById(appeal.accountId);
    if (!target?.account) return res.status(404).json({ success: false, message: "Compte lié à la contestation introuvable." });

    const expectedUserId = String(appeal.userId || appeal.rootUserId || "");
    const expectedEmail = String(appeal.email || appeal.mail || "").toLowerCase();
    const expectedPseudo = String(appeal.pseudo || "").toLowerCase();
    const actualUserId = String(target.rootUser.id || target.rootUser._id || "");
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
      const deletion = await permanentlyDeleteBannedArtist(appeal.accountId, {
        reason: finalResponse,
        appealId: appeal.appealId || appeal.id
      });
      const emailSent = await sendAppealDecisionEmail(
        appeal.email || appeal.mail,
        "rejected",
        finalResponse
      );

      return res.json({
        success: true,
        permanentlyDeleted: true,
        message: "Contestation rejetée : compte artiste, contenus R2 et données de modération supprimés définitivement.",
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
          const packResult = await packsCollection.findOneAndUpdate(
            { id: String(appeal.resourceId || "") },
            { $set: { canResubmit: true, resubmissionAuthorizedAt: now } },
            { returnDocument: "after" }
          );
          const pack = packResult?.value || packResult;
          if (pack) applied.push("pack_resubmission_allowed");
        } else {
          target.account.canResubmitArtist = true;
          applied.push("artist_resubmission_allowed");
        }
      }

      if (action === "restore_pack") {
        const result = await packsCollection.findOneAndUpdate(
          { id: String(appeal.resourceId || "") },
          { $set: {
            status: "approved",
            wasPublished: true,
            publishedAt: now,
            moderatedAt: now,
            restoredAt: now,
            rejectionReason: null
          } },
          { returnDocument: "after" }
        );
        const pack = result?.value || result;
        if (!pack) return res.status(404).json({ success: false, message: "Pack lié à la contestation introuvable." });
        applied.push("pack_restored");
      }
    }

    if (decision === "accepted" && String(appeal.decisionType || "").toLowerCase() === "ban") {
      if (!["reactivate", "lift_suspension"].includes(action)) {
        applyAccountControl(target.account, "reactivate", { reason: finalResponse });
        applied.push("account_reactivated");
      }

      const restoredContent = await restoreArtistContentAfterBan(
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
    await saveAccountState(target.rootUser, target.account);

    const history = Array.isArray(appeal.history) ? appeal.history : [];
    history.push({
      type: "final_decision",
      decision,
      action,
      customDecision: customDecision || null,
      message: finalResponse,
      staffId: String(req.body?.staffId || "founder"),
      staffEmail: String(req.body?.staffEmail || ""),
      staffRole: String(req.body?.staffRole || "founder"),
      rightsApplied: applied,
      createdAt: now
    });

    const update = {
      status: decision,
      active: false,
      decidedAt: now,
      updatedAt: now,
      finalDecision: decision,
      finalResponse,
      appliedAction: action,
      customDecision: customDecision || null,
      rightsApplied: applied,
      staffId: String(req.body?.staffId || "founder"),
      staffEmail: String(req.body?.staffEmail || ""),
      staffRole: String(req.body?.staffRole || "founder"),
      finalDecisionRead: false,
      history
    };

    const result = await moderationAppealsCollection.findOneAndUpdate(
      { id: appeal.id, active: true },
      { $set: update },
      { returnDocument: "after" }
    );
    const updated = result?.value || result;
    await founderNotificationsCollection.deleteMany({
      type: "moderation_appeal",
      entityId: { $in: [appeal.id, appeal.appealId].filter(Boolean) }
    });
    const emailSent = await sendAppealDecisionEmail(appeal.email || appeal.mail, decision, finalResponse);

    return res.json({
      success: true,
      message: "Décision appliquée et contestation retirée de la liste active.",
      item: publicAppealRecord(updated),
      appeal: publicAppealRecord(updated),
      emailSent
    });
  } catch (error) {
    console.error("Erreur décision contestation :", error);
    return res.status(500).json({ success: false, message: error.message || "Impossible d’appliquer la décision." });
  }
});

app.delete("/api/founder/appeals/bulk", requireFounderKey, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ success: false, message: "Aucune contestation sélectionnée." });
  const result = await moderationAppealsCollection.deleteMany({
    $or: [{ id: { $in: ids } }, { appealId: { $in: ids } }]
  });
  await founderNotificationsCollection.deleteMany({ type: "moderation_appeal", entityId: { $in: ids } });
  return res.json({ success: true, deletedCount: result.deletedCount });
});


app.delete("/api/founder/appeals/:id", requireFounderKey, async (req, res) => {
  const requestedId = String(req.params.id || "");
  const result = await moderationAppealsCollection.deleteOne({
    $or: [{ id: requestedId }, { appealId: requestedId }]
  });
  if (!result.deletedCount) return res.status(404).json({ success: false, message: "Contestation introuvable." });
  await founderNotificationsCollection.deleteMany({ type: "moderation_appeal", entityId: requestedId });
  return res.json({ success: true, deleted: true, id: requestedId });
});

app.get("/api/founder/moderation/artists", requireFounderKey, async (_req, res) => {
  const accounts = await getRemoteFounderAccounts();
  const items = accounts.filter((account) =>
    account.status === "pending" && ["artist", "both"].includes(account.role)
  );

  res.json({ success: true, items, artists: items });
});

app.get("/api/founder/moderation/packs", requireFounderKey, async (_req, res) => {
  const items = await packsCollection
    .find({ status: "pending" })
    .sort({ createdAt: -1 })
    .toArray();

  const packs = items.map(({ _id, ...pack }) => ({
    ...pack,
    license: normalizePackLicense(pack.license),
    licenseSummary: licenseModerationSummary(pack)
  }));
  res.json({ success: true, items: packs, packs });
});

app.patch("/api/founder/moderation/:type/:id/status", requireFounderKey, async (req, res) => {
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
    const result = await findRootAndAccountById(requestedId);

    if (!result?.account) {
      return res.status(404).json({
        success: false,
        message: "Artiste introuvable."
      });
    }

    const moderatedAt = new Date().toISOString();

    if (status === "rejected" && !result.account.originalRole) {
      result.account.originalRole = String(result.account.role || "user").toLowerCase();
    }

    if (
      status === "rejected" &&
      String(result.account.role || "").toLowerCase() === "both"
    ) {
      result.account.artistStatus = "rejected";
      result.account.artistModeratedAt = moderatedAt;
      result.account.role = "user";
      result.account.status = "approved";
    } else {
      result.account.status = status;
    }

    result.account.moderatedAt = moderatedAt;
    await saveAccountState(result.rootUser, result.account);

    if (status === "rejected") {
      await createModerationDecisionNotice({
        accountId: result.account.accountId || result.account.id,
        decisionType: "artist_rejection",
        reason: req.body?.reason,
        initialDecision: "rejected"
      });
    }

    const account = sanitizeFounderAccount(
      result.account,
      result.rootUser.id || String(result.rootUser._id)
    );

    return res.json({ success: true, item: account, account });
  }

  if (["pack", "packs"].includes(type)) {
    if (status === "rejected") {
      const moderatedAt = new Date().toISOString();
      const result = await packsCollection.findOneAndUpdate(
        { id: requestedId },
        { $set: {
          status: "rejected",
          rejectionReason: String(req.body?.reason || "La demande ne respecte pas les critères de validation Sonara.").trim(),
          moderatedAt,
          updatedAt: moderatedAt
        } },
        { returnDocument: "after" }
      );
      const rejectedPack = result?.value || result;
      if (!rejectedPack) return res.status(404).json({ success: false, message: "Pack introuvable." });

      await createModerationDecisionNotice({
        accountId: rejectedPack.artistId,
        decisionType: "pack_rejection",
        resourceId: rejectedPack.id,
        reason: rejectedPack.rejectionReason,
        initialDecision: "rejected"
      });

      const { _id, ...publicPack } = rejectedPack;
      return res.json({ success: true, deleted: false, item: publicPack, pack: publicPack });
    }

    const result = await packsCollection.findOneAndUpdate(
      { id: requestedId },
      {
        $set: {
          status,
          moderatedAt: new Date().toISOString()
        }
      },
      { returnDocument: "after" }
    );

    const pack = result?.value || result;

    if (!pack) {
      return res.status(404).json({
        success: false,
        message: "Pack introuvable."
      });
    }

    const { _id, ...publicPack } = pack;
    return res.json({ success: true, item: publicPack, pack: publicPack });
  }

  return res.status(400).json({
    success: false,
    message: "Type de modération invalide."
  });
});



function normalizeModerationOwnerIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function moderationOwnerFilter(ownerIds) {
  const values = normalizeModerationOwnerIds(ownerIds);
  return {
    $or: [
      { accountId: { $in: values } },
      { artistAccountId: { $in: values } },
      { artistId: { $in: values } }
    ]
  };
}

async function hideArtistContentForBan(ownerIds, primaryAccountId, reason = "") {
  const values = normalizeModerationOwnerIds(ownerIds);
  const ownerId = String(primaryAccountId || values[0] || "").trim();
  if (!ownerId || values.length === 0) return { count: 0, packIds: [] };

  const now = new Date().toISOString();
  const packs = await packsCollection.find(moderationOwnerFilter(values)).toArray();
  const packIds = [];

  for (const pack of packs) {
    if (
      isPackHiddenByModeration(pack) &&
      String(pack.moderationHiddenByAccountId || "") === ownerId
    ) {
      packIds.push(String(pack.id || ""));
      continue;
    }

    await packsCollection.updateOne(
      { _id: pack._id },
      {
        $set: {
          status: "moderation_hidden",
          moderationHidden: true,
          moderationHiddenAt: now,
          moderationHiddenByAccountId: ownerId,
          moderationHiddenReason: String(reason || "Bannissement artiste"),
          moderationPreviousStatus: String(pack.status || "draft"),
          updatedAt: now
        }
      }
    );
    packIds.push(String(pack.id || ""));
  }

  return { count: packIds.length, packIds: packIds.filter(Boolean), hiddenAt: now };
}

async function restoreArtistContentAfterBan(accountId) {
  const ownerId = String(accountId || "").trim();
  if (!ownerId) return { count: 0, packIds: [] };

  const now = new Date().toISOString();
  const packs = await packsCollection.find({
    moderationHidden: true,
    moderationHiddenByAccountId: ownerId
  }).toArray();
  const packIds = [];

  for (const pack of packs) {
    await packsCollection.updateOne(
      { _id: pack._id },
      {
        $set: {
          status: String(pack.moderationPreviousStatus || "draft"),
          moderationRestoredAt: now,
          updatedAt: now
        },
        $unset: {
          moderationHidden: "",
          moderationHiddenAt: "",
          moderationHiddenByAccountId: "",
          moderationHiddenReason: "",
          moderationPreviousStatus: ""
        }
      }
    );
    packIds.push(String(pack.id || ""));
  }

  return { count: packIds.length, packIds: packIds.filter(Boolean), restoredAt: now };
}


function collectArtistAccountR2Keys(account) {
  return [...new Set([
    account?.imageProfile,
    account?.imageArtist,
    account?.artistImage,
    account?.profileImage,
    account?.avatar
  ].map(normalizePackR2Key).filter(Boolean))];
}

async function deleteR2KeysStrict(keys) {
  const uniqueKeys = [...new Set((Array.isArray(keys) ? keys : [keys]).map(normalizePackR2Key).filter(Boolean))];
  const deletedKeys = [];
  const failures = [];

  for (const key of uniqueKeys) {
    try {
      await r2.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key
      }));
      deletedKeys.push(key);
    } catch (error) {
      failures.push({ key, message: error.message });
    }
  }

  if (failures.length) {
    const error = new Error(`Suppression R2 incomplète (${failures.length} fichier(s)). Relance la suppression.`);
    error.failures = failures;
    throw error;
  }

  return deletedKeys;
}

async function removeDeletedContentReferences(packIds, trackIds) {
  const packIdSet = new Set((packIds || []).map(String));
  const trackIdSet = new Set((trackIds || []).map(String));
  if (!packIdSet.size && !trackIdSet.size) return 0;

  const roots = await usersCollection.find({}).toArray();
  let changedRoots = 0;

  for (const root of roots) {
    let changed = false;
    for (const account of Array.isArray(root.accounts) ? root.accounts : []) {
      if (Array.isArray(account.downloadedPacks)) {
        const next = account.downloadedPacks.filter((id) => !packIdSet.has(String(id)));
        if (next.length !== account.downloadedPacks.length) {
          account.downloadedPacks = next;
          changed = true;
        }
      }
      if (Array.isArray(account.downloadedTracks)) {
        const next = account.downloadedTracks.filter((id) => !trackIdSet.has(String(id)));
        if (next.length !== account.downloadedTracks.length) {
          account.downloadedTracks = next;
          changed = true;
        }
      }
    }

    if (changed) {
      await usersCollection.updateOne(
        { _id: root._id },
        { $set: { accounts: root.accounts, updatedAt: new Date().toISOString() } }
      );
      changedRoots += 1;
    }
  }

  return changedRoots;
}

async function permanentlyDeleteBannedArtist(accountId, options = {}) {
  const requestedAccountId = String(accountId || "").trim();
  if (!requestedAccountId) throw new Error("Compte artiste obligatoire pour la suppression définitive.");

  const target = await findRootAndAccountById(requestedAccountId);
  if (!target?.account || !target?.rootUser) {
    return {
      alreadyDeleted: true,
      accountId: requestedAccountId,
      deletedPackCount: 0,
      deletedR2KeyCount: 0
    };
  }

  const account = target.account;
  const status = String(account.status || "").toLowerCase();
  const artistStatus = String(account.artistStatus || "").toLowerCase();
  if (status !== "banned" && artistStatus !== "banned") {
    throw new Error("La suppression définitive est réservée à un compte artiste banni.");
  }

  const ownerIds = normalizeModerationOwnerIds([
    requestedAccountId,
    account.accountId,
    account.id
  ]);
  const packs = await packsCollection.find(moderationOwnerFilter(ownerIds)).toArray();
  const packIds = packs.map((pack) => String(pack.id || "")).filter(Boolean);
  const trackIds = packs.flatMap((pack) =>
    (Array.isArray(pack.tracks) ? pack.tracks : [])
      .map((track) => String(track?.id || ""))
      .filter(Boolean)
  );
  const r2Keys = [
    ...packs.flatMap(collectPackR2Keys),
    ...collectArtistAccountR2Keys(account)
  ];

  const deletedR2Keys = await deleteR2KeysStrict(r2Keys);
  if (packIds.length) {
    await packsCollection.deleteMany({ id: { $in: packIds } });
  }
  await removeDeletedContentReferences(packIds, trackIds);

  const appealRecords = await moderationAppealsCollection.find({ accountId: requestedAccountId }).toArray();
  const appealIds = appealRecords.flatMap((item) => [item.id, item.appealId]).filter(Boolean).map(String);
  await moderationAppealsCollection.deleteMany({ accountId: requestedAccountId });

  const rootUserId = String(target.rootUser.id || target.rootUser._id || "");
  const email = String(account.mail || account.email || "").trim().toLowerCase();
  const remainingAccounts = (Array.isArray(target.rootUser.accounts) ? target.rootUser.accounts : []).filter(
    (currentAccount) => !ownerIds.includes(String(currentAccount.accountId || currentAccount.id || ""))
  );
  const deleteWholeRootUser = remainingAccounts.length === 0;

  // Ne touche jamais aux autres accounts du même ID général.
  const personalFilters = [{ accountId: requestedAccountId }];
  if (email) personalFilters.push({ email }, { mail: email });
  if (deleteWholeRootUser && rootUserId) {
    personalFilters.push({ rootUserId }, { userId: rootUserId });
  }

  const supportRecords = await supportCollection.find({ $or: personalFilters }).toArray();
  const feedbackRecords = await feedbackCollection.find({ $or: personalFilters }).toArray();
  const relatedRecordIds = [...supportRecords, ...feedbackRecords]
    .flatMap((item) => [item.id, item.ticketId, item.reference])
    .filter(Boolean)
    .map(String);

  await supportCollection.deleteMany({ $or: personalFilters });
  await feedbackCollection.deleteMany({ $or: personalFilters });

  const entityIds = [...new Set([
    requestedAccountId,
    ...(deleteWholeRootUser && rootUserId ? [rootUserId] : []),
    ...packIds,
    ...trackIds,
    ...appealIds,
    ...relatedRecordIds
  ].filter(Boolean))];

  const notificationFilters = [
    { entityId: { $in: entityIds } },
    { packId: { $in: packIds } },
    { "metadata.entityId": { $in: entityIds } },
    { "metadata.accountId": requestedAccountId },
    ...(deleteWholeRootUser && rootUserId ? [{ "metadata.userId": rootUserId }] : [])
  ];
  await founderNotificationsCollection.deleteMany({ $or: notificationFilters });

  if (remainingAccounts.length) {
    await usersCollection.updateOne(
      { _id: target.rootUser._id },
      { $set: { accounts: remainingAccounts, updatedAt: new Date().toISOString() } }
    );
  } else {
    await usersCollection.deleteOne({ _id: target.rootUser._id });
  }

  return {
    alreadyDeleted: false,
    accountId: requestedAccountId,
    rootUserDeleted: deleteWholeRootUser,
    deletedPackCount: packIds.length,
    deletedPackIds: packIds,
    deletedTrackCount: trackIds.length,
    deletedR2KeyCount: deletedR2Keys.length,
    deletedAppealCount: appealRecords.length,
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
  async (req, res) => {
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

    const documents =
      await usersCollection
        .find({
          "accounts.founderSync.pending": true
        })
        .toArray();

    const items = [];

    for (const rootUser of documents) {
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

app.get("/api/founder/accounts", requireFounderKey, async (_req, res) => {
  const accounts = await getRemoteFounderAccounts();

  accounts.sort((a, b) =>
    new Date(b.updatedAt || b.createdAt || 0) -
    new Date(a.updatedAt || a.createdAt || 0)
  );

  return res.json({ success: true, items: accounts, accounts });
});

app.patch(
  "/api/founder/accounts/:id/control",
  requireFounderKey,
  async (req, res) => {
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

      const result = await findRootAndAccountById(requestedId);

      if (!result?.account) {
        return res.status(404).json({
          success: false,
          message: "Compte introuvable."
        });
      }

      const expectedUserId = String(req.body?.expectedUserId || "").trim();
      const expectedMail = String(req.body?.expectedMail || "").trim().toLowerCase();
      const expectedPseudo = String(req.body?.expectedPseudo || "").trim().toLowerCase();
      const actualUserId = String(result.rootUser.id || result.rootUser._id || "");
      const actualMail = String(result.account.mail || "").trim().toLowerCase();
      const actualPseudo = String(result.account.pseudo || result.account.artistname || "").trim().toLowerCase();

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

      if (action === "restore_creator" && getControlAccountRole(result.account) === "user" && !result.account.artistStatus) {
        return res.status(400).json({
          success: false,
          message: "Ce compte n’a jamais eu d’accès Creator à restaurer."
        });
      }

      applyAccountControl(result.account, action, req.body || {});

      if (action === "ban") {
        const hidden = await hideArtistContentForBan(
          [result.account.accountId, result.account.id],
          result.account.accountId || result.account.id,
          req.body?.reason
        );
        markAccountContentHidden(result.account, hidden, req.body?.reason);
      } else if (["reactivate", "restore_creator"].includes(action)) {
        const restored = await restoreArtistContentAfterBan(
          result.account.accountId || result.account.id
        );
        markAccountContentRestored(result.account, restored);
      }

      await saveAccountState(result.rootUser, result.account);

      if (["ban", "suspend", "remove_creator"].includes(action)) {
        await createModerationDecisionNotice({
          accountId: result.account.accountId || result.account.id,
          decisionType: action === "ban" ? "ban" : action === "suspend" ? "suspension" : "creator_access_removed",
          reason: req.body?.reason,
          initialDecision: action
        });
      }

      const account = {
        ...sanitizeFounderAccount(
          result.account,
          result.rootUser.id || String(result.rootUser._id)
        ),
        artistStatus: result.account.artistStatus || null,
        originalRole: result.account.originalRole || null,
        suspendedUntil: result.account.suspendedUntil || null,
        moderationHistory: result.account.moderationHistory || []
      };

      return res.json({
        success: true,
        message: "Décision de modération appliquée.",
        account,
        item: account
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

app.patch("/api/profile/:id/moderation-notice/read", async (req, res) => {
  try {
    const result = await findRootAndAccountById(String(req.params.id || ""));

    if (!result?.account) {
      return res.status(404).json({
        success: false,
        message: "Compte introuvable."
      });
    }

    if (result.account.moderationNotice) {
      result.account.moderationNotice.read = true;
      result.account.moderationNotice.readAt = new Date().toISOString();
      await saveAccountState(result.rootUser, result.account);
    }

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

const feedbackCollection = db.collection("feedback");

app.post("/api/feedback", async (req, res) => {
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

    await feedbackCollection.insertOne(feedback);

    await createFounderNotification({
      type: "feedback",
      title: "Nouveau feedback",
      message: `${feedback.pseudo || feedback.email || "Utilisateur"} — ${feedback.title}`,
      entityId: feedback.id,
      priority: feedback.type === "bug" ? "urgent" : "normal"
    });

    const { _id, ...publicFeedback } = feedback;
    return res.status(201).json({
      success: true,
      feedback: publicFeedback
    });
  } catch (error) {
    console.error("Erreur création feedback :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d’envoyer le commentaire."
    });
  }
});




app.get("/api/feedback/mine", async (req, res) => {
  try {
    const accountId = String(req.query.accountId || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!accountId && !email) {
      return res.status(400).json({
        success: false,
        message: "Compte utilisateur manquant."
      });
    }

    const filters = [];
    if (accountId) filters.push({ accountId });
    if (email) filters.push({ email });

    const items = await feedbackCollection
      .find({ $or: filters })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const feedback = items.map(({ _id, ...item }) => item);

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

app.get("/api/founder/feedback", requireFounderKey, async (_req, res) => {
  const items = await feedbackCollection
    .find({})
    .sort({ createdAt: -1 })
    .limit(300)
    .toArray();

  const feedback = items.map(({ _id, ...item }) => item);

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

    const feedback = await feedbackCollection.findOne({
      $or: [
        { id: req.params.id },
        { reference: req.params.id }
      ]
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback introuvable."
      });
    }

    const reply = {
      id: `feedback_reply_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      sender: "founder",
      message,
      createdAt: new Date().toISOString()
    };

    await feedbackCollection.updateOne(
      { _id: feedback._id },
      {
        $push: { replies: reply },
        $set: {
          status: "replied",
          updatedAt: new Date().toISOString()
        }
      }
    );

    let emailSent = false;

    if (feedback.email) {
      try {
        await resend.emails.send({
          from: "Sonara Pack <notifications@sonarapack.com>",
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

app.patch("/api/founder/feedback/:id/status", requireFounderKey, async (req, res) => {
  const result = await feedbackCollection.updateOne(
    {
      $or: [
        { id: req.params.id },
        { reference: req.params.id }
      ]
    },
    {
      $set: {
        status: String(req.body?.status || "reviewed"),
        updatedAt: new Date().toISOString()
      }
    }
  );

  if (!result.matchedCount) {
    return res.status(404).json({
      success: false,
      message: "Feedback introuvable."
    });
  }

  res.json({ success: true });
});

app.delete("/api/founder/feedback/:id", requireFounderKey, async (req, res) => {
  const result = await feedbackCollection.deleteOne({
    $or: [
      { id: req.params.id },
      { reference: req.params.id }
    ]
  });

  if (!result.deletedCount) {
    return res.status(404).json({
      success: false,
      message: "Feedback introuvable."
    });
  }

  res.json({ success: true, message: "Feedback supprimé." });
});


// Les erreurs des routes financières Founder restent toujours en JSON.
// Cela évite qu'une route inconnue renvoie la page HTML 404 d'Express.
app.use("/api/founder/finance", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route financière Founder introuvable.",
    environment: "test",
    path: req.originalUrl
  });
});


app.listen(PORT, () => {

  console.log(`
━━━━━━━━━━━━━━━━━━
🔥 SONARA TEST READY
🌐 Serveur distant lancé sur le port ${PORT}
🗄️ Données utilisateurs : MongoDB
☁️ Fichiers persistants : Cloudflare R2
━━━━━━━━━━━━━━━━━━
`);

});
