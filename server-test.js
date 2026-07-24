const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const cors = require("cors");

const multer = require("multer");



const AdmZip = require("adm-zip");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({
  path: path.resolve(__dirname, ".env.test")
});

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
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
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






async function connectDB() {
  try {
    await client.connect();
    console.log(
      `MongoDB TEST connecté 🔥 — base : ${mongoDatabaseName}`
    );
  } catch (error) {
    console.error(error)
  }
}

connectDB()


const app = express();

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
  allowedHeaders: ["Content-Type", "Authorization", "x-founder-key"]
}));
app.use(express.json());

/* =========================
   R2 FILE PROXY
   - LOCAL keeps /uploads as local static files.
   - TEST/MAIN read the same keys from their own R2 bucket.
========================= */
function getR2UploadKey(req) {
  const wildcard = req.params?.filePath;
  const rawPath = Array.isArray(wildcard)
    ? wildcard.join("/")
    : String(wildcard || "");

  return rawPath.replace(/^\/+/, "");
}

app.get("/uploads/*filePath", async (req, res) => {
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

    console.error("Erreur GET /uploads/* depuis R2 :", error);
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

app.use("/uploads", express.static("uploads"));


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

  const title = String(pack.title || "").trim();
  const artistId = String(pack.artistId || "").trim();
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];

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

  if (!pack.rights?.accepted || !pack.rights?.acceptedAt) {
    return {
      valid: false,
      status: 400,
      message: "La confirmation des droits est obligatoire."
    };
  }

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

app.use("/downloads", express.static("downloads"));


/* =========================
   HELPERS USERS / ACCOUNTS
========================= */

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
  const artistId = String(pack.artistId || "");

  if (artistId) {
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

const verificationCodes = new Map();
const verifiedTokens = new Map();
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TOKEN_TTL_MS = 15 * 60 * 1000;

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

async function collectRemoteDuplicateErrors({ mail, pseudo, password }) {
  const fieldErrors = validateNewAccountFields({ password });
  if (mail && await isMailAlreadyUsed(mail)) fieldErrors.mail = "Cette adresse e-mail est déjà utilisée.";
  if (pseudo && await isPseudoAlreadyUsed(pseudo)) fieldErrors.pseudo = "Ce pseudo est déjà utilisé.";
  if (password && await isPasswordAlreadyUsed(password)) fieldErrors.password = "Ce mot de passe est déjà utilisé. Choisissez-en un autre.";
  return fieldErrors;
}

function consumeVerifiedToken({ token, mail, purpose, userId = "" }) {
  cleanupVerificationStores();
  const stored = verifiedTokens.get(String(token || ""));
  const expectedKey = createVerificationKey(mail, purpose, userId);
  if (!stored || stored.key !== expectedKey || stored.expiresAt <= Date.now()) return false;
  verifiedTokens.delete(String(token));
  return true;
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
    cleanupVerificationStores();
    const { mail, pseudo, password, purpose = "register", userId = "" } = req.body || {};
    const fieldErrors = await collectRemoteDuplicateErrors({ mail, pseudo, password });
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(409).json({ success: false, message: "Certaines informations sont déjà utilisées.", fieldErrors });
    }

    const normalizedMail = normalizeMail(mail);
    if (!normalizedMail) return res.status(400).json({ success: false, fieldErrors: { mail: "Adresse e-mail obligatoire." } });

    const code = createVerificationCode();
    const key = createVerificationKey(normalizedMail, purpose, userId);
    verificationCodes.set(key, { code, expiresAt: Date.now() + VERIFICATION_CODE_TTL_MS, attempts: 0 });

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
  if (String(code || "").trim() !== stored.code) return res.status(400).json({ success: false, message: "Code incorrect." });
  verificationCodes.delete(key);
  const token = createVerificationToken();
  verifiedTokens.set(token, { key, expiresAt: Date.now() + VERIFIED_TOKEN_TTL_MS });
  return res.json({ success: true, verificationToken: token });
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

    if (!consumeVerifiedToken({ token: req.body.verificationToken, mail: profile.mail, purpose: "register" })) {
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
        ? "/app/pages/creator.html"
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

    if (!consumeVerifiedToken({
      token: req.body.verificationToken,
      mail: profile.mail,
      purpose: "add-account",
      userId
    })) {
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


/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {
    const { mail, password, phone } = req.body;
    const normalizedMail = normalizeMail(mail);

    let rootUser = await usersCollection.findOne({
      accounts: {
        $elemMatch: {
          mail: normalizedMail,
          password,
          ...(phone
            ? {
                phone: String(phone).trim()
              }
            : {})
        }
      }
    });

    let account = null;

    if (rootUser) {
      account = rootUser.accounts.find(
        (currentAccount) =>
          normalizeMail(currentAccount.mail) === normalizedMail &&
          currentAccount.password === password &&
          (
            !phone ||
            String(currentAccount.phone || "").trim() ===
              String(phone).trim()
          )
      );
    }


    if (!account) {
      return res.status(401).json({
        success: false,
        error: "Email ou mot de passe incorrect."
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
      redirectTo = "/app/pages/creator.html";
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
    if (targetAccount.status === "pending") redirectTo = "/app/pages/pending.html";
    else if (targetAccount.role === "artist" || targetAccount.role === "both") redirectTo = "/app/pages/creator.html";

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
    const normalizedPhone = String(phone || "").trim();

    if (!normalizedMail || !password || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: "L'adresse e-mail, le mot de passe et le téléphone sont obligatoires."
      });
    }

    const rootUser = await usersCollection.findOne({
      accounts: {
        $elemMatch: {
          mail: normalizedMail,
          password,
          phone: normalizedPhone
        }
      }
    });

    const targetAccount = rootUser?.accounts?.find((item) =>
      normalizeMail(item.mail) === normalizedMail &&
      item.password === password &&
      String(item.phone || "").trim() === normalizedPhone
    );

    if (!rootUser || !targetAccount) {
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
    const normalizedPhone = String(phone || "").trim();

    if (!normalizedMail || !password || !normalizedPhone) {
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

    const rootUser = await usersCollection.findOne({
      accounts: {
        $elemMatch: {
          mail: normalizedMail,
          password,
          phone: normalizedPhone
        }
      }
    });

    const account = rootUser?.accounts?.find((item) =>
      normalizeMail(item.mail) === normalizedMail &&
      item.password === password &&
      String(item.phone || "").trim() === normalizedPhone
    );

    if (!rootUser || !account) {
      return res.status(403).json({
        success: false,
        error: "Les informations de connexion sont incorrectes."
      });
    }

    const returnedAccount = sanitizeAccount(account, rootUser.id);

    let redirectTo = "/home.html";
    if (account.status === "pending") redirectTo = "/app/pages/pending.html";
    else if (account.role === "artist" || account.role === "both") {
      redirectTo = "/app/pages/creator.html";
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
              `${frontUrl}/app/pages/page-management/bank.html`,
            return_url:
              `${frontUrl}/app/pages/page-management/bank.html?stripe=success`,
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
            `${frontUrl}/app/pages/page-management/bank.html`,

          return_url:
            `${frontUrl}/app/pages/page-management/bank.html?stripe=success`,

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
            `${frontUrl}/app/pages/page-management/bank.html`,

          return_url:
            `${frontUrl}/app/pages/page-management/bank.html?stripe=success`,

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

      await saveAccountState(
        result.rootUser,
        account
      );

      return res.status(200).json({
        success: true,
        message: "Mot de passe modifié."
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

      account.firstname = firstname;
      account.lastname = lastname;
      account.date = date;
      account.phone = phone;

      await saveAccountState(
        result.rootUser,
        account
      );

      const updatedAccount = sanitizeAccount(
        account,
        result.rootUser.id
      );

      return res.status(200).json({
        success: true,
        message:
          "Informations du compte modifiées.",
        account: updatedAccount
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

      account.mail = newMail;

      await saveAccountState(
        result.rootUser,
        account
      );

      const updatedAccount = sanitizeAccount(
        account,
        result.rootUser.id
      );

      return res.status(200).json({
        success: true,
        message: "Adresse e-mail modifiée.",
        account: updatedAccount
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


app.get("/api/packs/pending", async (req, res) => {
  try {
    const packs = await packsCollection.find({}).toArray();
    res.json(packs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/packs", async (req, res) => {
  try {
    const approvedPacks = await packsCollection.find({
      status: "approved"
    }).toArray();

    res.json(approvedPacks);
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
          _audioLocalPath: trackAudioFile.path
        });
      }

      const newPack = {
        ...receivedPack,
        coverPack: packCoverKey,
        tracks: preparedTracks,
        status: "pending",
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

      await packsCollection.insertOne(newPack);

      await createFounderNotification({
        type: "pack",
        title: "Nouveau pack à modérer",
        message: `${newPack.title} attend une validation.`,
        entityId: newPack.id,
        priority: "normal"
      });

      return res.status(201).json({
        success: true,
        message: "Pack envoyé en modération.",
        pack: newPack
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
    const { userId, packId, trackId } = req.body || {};

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

    const item = trackId
      ? pack.tracks?.find((track) => String(track.id) === String(trackId))
      : pack;

    const isFree =
      item?.isFree === true ||
      String(item?.price || "").trim().toLowerCase() === "gratuit";

    if (!item || !isFree) {
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
      ? `app/pages/download.html?id=${encodeURIComponent(packId)}&trackId=${encodeURIComponent(trackId)}&free=true`
      : `app/pages/download.html?id=${encodeURIComponent(packId)}&free=true`;

    return res.json({
      success: true,
      free: true,
      redirectUrl: `${frontUrl}/${pathPart}`
    });
  } catch (error) {
    console.error("Erreur accès gratuit :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible d’autoriser le téléchargement gratuit."
    });
  }
});

app.post(
  "/api/stripe/create-checkout-session",
  async (req, res) => {
    try {
      const { packId, trackId, userId } = req.body;

      if (!packId) {
        return res.status(400).json({
          error: "packId manquant."
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
          `${frontUrl}/${track.downloadPage}&success=true`;

      } else {
        item = pack;
        purchaseType = "pack";

        successUrl =
          `${frontUrl}/${pack.downloadPage}&success=true`;
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
        !priceNumber ||
        Number.isNaN(priceNumber)
      ) {
        return res.status(400).json({
          error: "Prix invalide.",
          rawPrice
        });
      }

      const amount =
        Math.round(priceNumber * 100);

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
                        : pack.title ||
                          pack.name ||
                          "Pack Sonara"
                  },

                  unit_amount: amount
                },

                quantity: 1
              }
            ],

            metadata: {
              packId: String(pack.id),

              trackId:
                trackId
                  ? String(trackId)
                  : "",

              userId:
                userId
                  ? String(userId)
                  : "",

              artistId: String(
                artist.id ||
                artist.accountId
              ),

              purchaseType
            },

            payment_intent_data: {
              application_fee_amount:
                Math.round(amount * 0.1),

              transfer_data: {
                destination:
                  artist.stripeAccountId
              }
            },

            success_url: successUrl,

            cancel_url:
              `${frontUrl}/pack.html?id=${pack.id}&cancel=true`
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

    const result = await packsCollection.findOneAndUpdate(
      { id: packId },
      {
        $set: {
          status,
          moderatedAt: new Date().toISOString()
        }
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

async function createFounderNotification({
  type,
  title,
  message,
  entityId,
  priority = "normal"
}) {
  const notification = {
    id: `notif_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    type: type || "system",
    title: title || "Nouvelle activité Sonara",
    message: message || "",
    entityId: entityId || null,
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
          { $set: { status: "approved", moderatedAt: now, restoredAt: now, rejectionReason: null } },
          { returnDocument: "after" }
        );
        const pack = result?.value || result;
        if (!pack) return res.status(404).json({ success: false, message: "Pack lié à la contestation introuvable." });
        applied.push("pack_restored");
      }
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

  const packs = items.map(({ _id, ...pack }) => pack);
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

