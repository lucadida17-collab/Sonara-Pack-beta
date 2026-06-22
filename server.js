const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const AdmZip = require("adm-zip");
require("dotenv").config();

const nodemailer = require("nodemailer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Resend } = require("resend");
const { MongoClient } = require("mongodb");
const path = require("path");
const fs = require("fs");

const isLocal = process.env.NODE_ENV !== "production";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PACKS_FILE = path.join(DATA_DIR, "pendingPacks.json");

const UPLOADS_DIR = path.join(__dirname, "uploads");
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
const PACKS_ZIP_DIR = path.join(DOWNLOADS_DIR, "packs");
const TRACKS_ZIP_DIR = path.join(DOWNLOADS_DIR, "tracks");

[DATA_DIR, UPLOADS_DIR, DOWNLOADS_DIR, PACKS_ZIP_DIR, TRACKS_ZIP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(PACKS_FILE)) fs.writeFileSync(PACKS_FILE, "[]");

app.use("/uploads", express.static(UPLOADS_DIR));
app.use("/downloads", express.static(DOWNLOADS_DIR));

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/* ===================== PROD SERVICES ===================== */

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const resend = new Resend(process.env.RESEND_API_KEY);
const client = new MongoClient(process.env.MONGO_URI);
const db = client.db("sonara-pack-db");
const usersCollection = db.collection("users");
const packsCollection = db.collection("packs");

async function connectDB() {
  if (isLocal) {
    console.log("LOCAL MODE: Mongo ignoré");
    return;
  }

  await client.connect();
  console.log("MongoDB connecté 🔥");
}

connectDB();

/* ===================== MAIL ===================== */

const localMailer = nodemailer.createTransport({
  host: process.env.LOCAL_MAIL_HOST,
  port: Number(process.env.LOCAL_MAIL_PORT || 587),
  secure: false,
  auth: {
    user: process.env.LOCAL_MAIL_USER,
    pass: process.env.LOCAL_MAIL_PASS
  }
});

async function sendAdminArtistMail(profile) {
  const html = `
    <div style="font-family: Arial, sans-serif; background:#080b12; color:white; padding:30px; border-radius:16px;">
      <h1 style="color:#7ddcff;">Nouvelle demande artiste</h1>
      <p>Un nouveau profil vient d’être créé sur <strong>Sonara Pack</strong>.</p>

      <div style="background:#111827; padding:20px; border-radius:14px; margin-top:20px;">
        <p><strong>Nom :</strong> ${profile.firstname} ${profile.lastname}</p>
        <p><strong>Email :</strong> ${profile.mail}</p>
        <p><strong>Téléphone :</strong> ${profile.phone || "Non renseigné"}</p>
        <p><strong>Rôle :</strong> ${profile.role}</p>
        <p><strong>Nom d’artiste :</strong> ${profile.artistname || "Non renseigné"}</p>
        <p><strong>SIRET :</strong> ${profile.siretinput || "Non renseigné"}</p>
        <p><strong>Image artiste :</strong> ${profile.imageArtist || "Aucune image"}</p>
        <p><strong>Status :</strong> ${profile.status}</p>
        <p><strong>Date :</strong> ${profile.createdAt}</p>
      </div>
    </div>
  `;

  if (isLocal) {
    await localMailer.sendMail({
      from: process.env.LOCAL_MAIL_FROM || "Sonara Local <local@sonarapack.com>",
      to: process.env.LOCAL_MAIL_TO || "luca.dida17@gmail.com",
      subject: "LOCAL - Nouvelle demande artiste à modérer",
      html
    });

    console.log("MAIL LOCAL ARTIST ENVOYÉ");
    return;
  }

  await resend.emails.send({
    from: "Sonara Pack <admin@sonarapack.com>",
    to: "luca.dida17@gmail.com",
    subject: "Nouvelle demande artiste à modérer - Sonara Pack",
    html
  });

  console.log("MAIL PROD ARTIST ENVOYÉ");
}

/* ===================== UPLOAD ===================== */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

async function uploadToR2(file, folder) {
  const key = `${folder}/${Date.now()}-${file.originalname}`;

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: fs.createReadStream(file.path),
    ContentType: file.mimetype
  }));

  return key;
}

async function handleFile(file, folder) {
  if (!file) return null;

  if (isLocal) {
    return file.filename;
  }

  return await uploadToR2(file, folder);
}

/* ===================== USERS STORAGE ===================== */

async function saveUser(user) {
  if (isLocal) {
    const users = readJSON(USERS_FILE);
    users.push(user);
    writeJSON(USERS_FILE, users);
    console.log("LOCAL USER SAVED");
    return;
  }

  await usersCollection.insertOne(user);
}

async function getUserById(id) {
  if (isLocal) {
    const users = readJSON(USERS_FILE);
    return users.find(user => user.id === id);
  }

  return await usersCollection.findOne({ id });
}

async function updateUserStatus(id, status) {
  if (isLocal) {
    const users = readJSON(USERS_FILE);
    const index = users.findIndex(user => user.id === id);

    if (index === -1) return null;

    users[index].status = status;
    users[index].moderatedAt = new Date().toISOString();

    writeJSON(USERS_FILE, users);
    return users[index];
  }

  const user = await usersCollection.findOne({ id });
  if (!user) return null;

  await usersCollection.updateOne(
    { id },
    {
      $set: {
        status,
        moderatedAt: new Date().toISOString()
      }
    }
  );

  return await usersCollection.findOne({ id });
}

async function getPendingUsers() {
  if (isLocal) {
    const users = readJSON(USERS_FILE);
    return users.filter(user => user.status === "pending");
  }

  return await usersCollection.find({ status: "pending" }).toArray();
}

/* ===================== PACKS STORAGE ===================== */

async function savePack(pack) {
  if (isLocal) {
    const packs = readJSON(PACKS_FILE);
    packs.push(pack);
    writeJSON(PACKS_FILE, packs);
    console.log("LOCAL PACK SAVED");
    return;
  }

  await packsCollection.insertOne(pack);
}

async function getPendingPacks() {
  if (isLocal) {
    return readJSON(PACKS_FILE);
  }

  return await packsCollection.find({}).toArray();
}

async function getApprovedPacks() {
  if (isLocal) {
    const packs = readJSON(PACKS_FILE);
    return packs.filter(pack => pack.status === "approved");
  }

  return await packsCollection.find({ status: "approved" }).toArray();
}

async function updatePackStatus(id, status) {
  if (isLocal) {
    const packs = readJSON(PACKS_FILE);
    const index = packs.findIndex(pack => pack.id === id);

    if (index === -1) return null;

    packs[index].status = status;
    packs[index].moderatedAt = new Date().toISOString();

    writeJSON(PACKS_FILE, packs);
    return packs[index];
  }

  await packsCollection.updateOne(
    { id },
    { $set: { status } }
  );

  return await packsCollection.findOne({ id });
}

/* ===================== REGISTER ===================== */

app.post("/api/register", upload.any(), async (req, res) => {
  try {
    const profile = req.body.profile
      ? JSON.parse(req.body.profile)
      : req.body;

    console.log("REGISTER RECU");
    console.log(profile);

    const imageArtistFile = req.files?.find(file => file.fieldname === "imageArtist");

    if (imageArtistFile) {
      profile.imageArtist = await handleFile(imageArtistFile, "artists");
    }

    if (profile.role === "user") {
      profile.status = "approved";
    } else {
      profile.status = "pending";
    }

    profile.createdAt = new Date().toISOString();
    profile.id = Date.now().toString();

    if (profile.role === "user" || profile.role === "both") {
      profile.downloadedPacks = [];
      profile.downloadedTracks = [];
    }

    await saveUser(profile);

    if (profile.status === "pending") {
      await sendAdminArtistMail(profile);
    }

    console.log("REGISTER FINISH");
    console.log(profile);

    res.json({
      success: true,
      message: "Profile enregistré",
      profile
    });

    console.log("REGISTER RESPONSE SENT");
  } catch (error) {
    console.error("REGISTER ERROR :", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/* ===================== USER ROUTES ===================== */

app.get("/api/users/:id", async (req, res) => {
  const user = await getUserById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Utilisateur introuvable"
    });
  }

  res.json({
    success: true,
    user
  });
});

app.get("/api/pending-users", async (req, res) => {
  const pendingUsers = await getPendingUsers();

  res.json(pendingUsers);
});

app.patch("/api/users/:id/status", async (req, res) => {
  const updatedUser = await updateUserStatus(req.params.id, req.body.status);

  if (!updatedUser) {
    return res.status(404).json({
      success: false,
      message: "Utilisateur introuvable"
    });
  }

  res.json({
    success: true,
    message: `Utilisateur ${req.body.status}`,
    user: updatedUser
  });
});

/* ===================== DOWNLOADS USER ===================== */

app.post("/api/add-downloaded-pack", async (req, res) => {
  const { userId, packId } = req.body;
  const user = await getUserById(userId);

  if (!user) {
    return res.status(404).json({ success: false });
  }

  if (user.role !== "user" && user.role !== "both") {
    return res.status(403).json({ success: false });
  }

  user.downloadedPacks ||= [];

  if (!user.downloadedPacks.includes(packId)) {
    user.downloadedPacks.push(packId);
  }

  if (isLocal) {
    const users = readJSON(USERS_FILE);
    const index = users.findIndex(u => u.id === userId);
    users[index] = user;
    writeJSON(USERS_FILE, users);
  } else {
    await usersCollection.updateOne(
      { id: userId },
      { $set: { downloadedPacks: user.downloadedPacks } }
    );
  }

  res.json({ success: true });
});

app.post("/api/add-downloaded-track", async (req, res) => {
  const { userId, trackId } = req.body;
  const user = await getUserById(userId);

  if (!user) {
    return res.status(404).json({ success: false });
  }

  if (user.role !== "user" && user.role !== "both") {
    return res.status(403).json({ success: false });
  }

  user.downloadedTracks ||= [];

  if (!user.downloadedTracks.includes(trackId)) {
    user.downloadedTracks.push(trackId);
  }

  if (isLocal) {
    const users = readJSON(USERS_FILE);
    const index = users.findIndex(u => u.id === userId);
    users[index] = user;
    writeJSON(USERS_FILE, users);
  } else {
    await usersCollection.updateOne(
      { id: userId },
      { $set: { downloadedTracks: user.downloadedTracks } }
    );
  }

  res.json({ success: true });
});

/* ===================== PACK ROUTES ===================== */

app.get("/api/packs/pending", async (req, res) => {
  const packs = await getPendingPacks();
  res.json(packs);
});

app.get("/api/packs", async (req, res) => {
  const packs = await getApprovedPacks();
  res.json(packs);
});

function createZip(zipPath, files) {
  const zip = new AdmZip();

  files.forEach(fileName => {
    if (!fileName) return;

    const filePath = path.join(UPLOADS_DIR, fileName);

    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath);
    }
  });

  zip.writeZip(zipPath);
}

app.post("/api/packs/pending", upload.any(), async (req, res) => {
  try {
    const receivedPack = JSON.parse(req.body.packData);

    const coverPackFile = req.files.find(file => file.fieldname === "coverPack");

    receivedPack.coverPack = coverPackFile
      ? await handleFile(coverPackFile, "packs/covers")
      : receivedPack.coverPack;

    receivedPack.tracks = await Promise.all(
      receivedPack.tracks.map(async (track, index) => {
        const trackCoverFile = req.files.find(file => file.fieldname === `trackCover_${index}`);
        const trackAudioFile = req.files.find(file => file.fieldname === `trackAudio_${index}`);

        return {
          ...track,
          coverPack: trackCoverFile
            ? await handleFile(trackCoverFile, "tracks/covers")
            : track.coverPack,

          audioName: trackAudioFile
            ? await handleFile(trackAudioFile, "tracks/audio")
            : track.audioName
        };
      })
    );

    const newPack = {
      ...receivedPack,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    await savePack(newPack);

    res.json({
      success: true,
      message: "Pack envoyé en modération",
      pack: newPack
    });
  } catch (error) {
    console.error("ERREUR /api/packs/pending :", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.patch("/api/packs/:id/status", async (req, res) => {
  const updatedPack = await updatePackStatus(req.params.id, req.body.status);

  if (!updatedPack) {
    return res.status(404).json({
      success: false,
      message: "Pack introuvable"
    });
  }

  res.json({
    success: true,
    message: `Pack ${req.body.status}`,
    pack: updatedPack
  });
});

/* ===================== SERVER CHECK ===================== */

function checkServerFiles() {
  const checks = [
    { name: "creator.js", path: "./app/js/creator.js" },
    { name: "create-pack.js", path: "./app/js/js-creator/create-pack.js" },
    { name: "pending.js", path: "./app/js/pending.js" },
    { name: "admin.js", path: "./app/js/admin.js" },
    { name: "home.js", path: "./app/js/home.js" },
    { name: "pack.js", path: "./app/js/pack.js" },
    { name: "uploads folder", path: "./uploads" },
    { name: "data/users.json", path: "./data/users.json" },
    { name: "data/pendingPacks.json", path: "./data/pendingPacks.json" }
  ];

  console.log("Vérification Sonara Server...");

  checks.forEach(item => {
    console.log(fs.existsSync(item.path) ? `OK ${item.name}` : `MANQUE ${item.name}`);
  });
}

app.listen(PORT, () => {
  checkServerFiles();

  console.log(`
━━━━━━━━━━━━━━━━━━
SONARA READY
MODE: ${isLocal ? "LOCAL" : "PRODUCTION"}
URL: http://localhost:${PORT}
━━━━━━━━━━━━━━━━━━
`);
});