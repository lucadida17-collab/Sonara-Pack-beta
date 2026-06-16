const dns = require("dns");
dns.setDefaultResultOrder("ipv4first")

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const AdmZip = require("adm-zip");
require("dotenv").config();

const { Resend } = require("resend");
const { MongoClient } = require("mongodb");


const resend = new Resend(process.env.RESEND_API_KEY)
const client = new MongoClient(process.env.MONGO_URI);

const db = client.db("sonara-pack-db");

const usersCollection = db.collection("users");
const packsCollection = db.collection("packs");


async function connectDB() {
  try {
    await client.connect()
    console.log("MongoDB connecté 🔥")
  } catch (error) {
    console.error(error)
  }
}

connectDB()


const app = express();




const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

app.use("/uploads", express.static("uploads"));

const downloadsPath = path.join(__dirname, "downloads");
const packsZipPath = path.join(downloadsPath, "packs");
const tracksZipPath = path.join(downloadsPath, "tracks");

[downloadsPath, packsZipPath, tracksZipPath].forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

app.use("/downloads", express.static("downloads"));


app.post("/api/register", upload.any(), async (req, res) => {
  const profile = req.body.profile
    ? JSON.parse(req.body.profile)
    : req.body;

    console.log("REGISTER RECU")
    console.log(profile)

  const imageArtistFile = req.files?.find(
    file => file.fieldname === "imageArtist"
  );

  console.log("IMAGE ARTIST :", imageArtistFile)

  profile.imageArtist = imageArtistFile ? imageArtistFile.filename : "";

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

  console.log("avant insert")

  await usersCollection.insertOne(profile);

  console.log("apres insert ");

  if (profile.status === "pending") {

    try {
      console.log("AVANTT MAIL")
      await resend.emails.send({
        from: "Sonara Pack <onboarding@resend.dev>",
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
            <p><strong>Nom d’artiste :</strong> ${profile.artistname || "Non renseigné"}</p>
            <p><strong>SIRET :</strong> ${profile.siretinput || "Non renseigné"}</p>
            <p><strong>Image artiste :</strong> ${profile.imageArtist || "Aucune image"}</p>
            <p><strong>Status :</strong> ${profile.status}</p>
            <p><strong>Date :</strong> ${profile.createdAt}</p>
          </div>

          <div style="margin-top:30px;">
            <a href="https://sonarapack-test.netlify.app/admin.html"
              style="display:inline-block; padding:14px 22px; background:#7ddcff; color:#000; text-decoration:none; border-radius:999px; font-weight:bold;">
              Open Admin
            </a>

          </div>
        </div>
      `
      })
      console.log("EMAIL ADMIN ENVOYER")
    } catch (mailError) {
      console.log("Erreur Admin Mail :", mailError.message)
    }

    console.log("APRES MAIL")
  }



  res.json({
    success: true,
    message: "Profil enregistré",
    profilef
  });
});

app.post("/api/add-downloaded-pack", async (req, res) => {



  const { userId, packId } = req.body;

  const user = await usersCollection.findOne({
    id: userId
  });

  if (!user) {
    return res.status(404).json({
      success: false
    });
  }

  if (
    user.role !== "user" &&
    user.role !== "both"
  ) {
    return res.status(403).json({
      success: false
    });
  }

  if (!user.downloadedPacks) {
    user.downloadedPacks = [

    ];
  }

  if (!user.downloadedPacks.includes(packId)) {
    user.downloadedPacks.push(packId);
  }

  await usersCollection.updateOne(
    { id: userId },
    {
      $set: {
        downloadedPacks: user.downloadedPacks
      }
    }
  );

  res.json({
    success: true
  });

});

app.post("/api/add-downloaded-track", async (req, res) => {

  const { userId, trackId } = req.body;

const user = await usersCollection.findOne({
  id: userId
});

  if (!user) {
    return res.status(404).json({
      success: false
    });
  }

  if (
    user.role !== "user" &&
    user.role !== "both"
  ) {
    return res.status(403).json({
      success: false
    });
  }

  if (!user.downloadedTracks) {
    user.downloadedTracks = [];
  }

  if (!user.downloadedTracks.includes(trackId)) {
    user.downloadedTracks.push(trackId);
  }

 await usersCollection.updateOne(
  { id: userId },
  {
    $set: {
      downloadedTracks: user.downloadedTracks
    }
  }
);

  res.json({
    success: true
  });

});

app.get("/api/pending-users",  async (req, res) => {
 const pendingUsers = await usersCollection
  .find({ status: "pending" })
  .toArray();

res.json(pendingUsers);
});



app.get("/api/users/:id", async (req, res) => {

  const user = await usersCollection.findOne({
  id: req.params.id
});

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




app.patch("/api/users/:id/status", async (req, res) => {

  const userId = req.params.id;
  const { status } = req.body;

  const user = await usersCollection.findOne({
    id: userId
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Utilisateur introuvable"
    });
  }

  await usersCollection.updateOne(
    { id: userId },
    {
      $set: {
        status,
        moderatedAt: new Date().toISOString()
      }
    }
  );

  const updatedUser = await usersCollection.findOne({
    id: userId
  });

  res.json({
    success: true,
    message: `Utilisateur ${status}`,
    user: updatedUser
  });

});

app.get("/api/packs/pending", (req, res) => {
  const packs = JSON.parse(
    fs.readFileSync("./data/pendingPacks.json", "utf8")
  );

  res.json(packs);
});

app.get("/api/packs", (req, res) => {
  const packs = JSON.parse(
    fs.readFileSync("./data/pendingPacks.json", "utf8")
  );

  const approvedPacks = packs.filter(pack => pack.status === "approved");

  res.json(approvedPacks);
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

app.post("/api/packs/pending", upload.any(), async (req, res) => {
  try {
    const packs = JSON.parse(fs.readFileSync("./data/pendingPacks.json", "utf8"));
    const receivedPack = JSON.parse(req.body.packData);

    const coverPackFile = req.files.find(file => file.fieldname === "coverPack");

    receivedPack.coverPack = coverPackFile ? coverPackFile.filename : receivedPack.coverPack;

    receivedPack.tracks = receivedPack.tracks.map((track, index) => {
      const trackCoverFile = req.files.find(file => file.fieldname === `trackCover_${index}`);
      const trackAudioFile = req.files.find(file => file.fieldname === `trackAudio_${index}`);

      return {
        ...track,
        coverPack: trackCoverFile ? trackCoverFile.filename : track.coverPack,
        audioName: trackAudioFile ? trackAudioFile.filename : track.audioName
      };
    });

    const newPack = {
      ...receivedPack,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    const packZipName = `${newPack.id}_pack.zip`;
    const packZipFullPath = path.join(packsZipPath, packZipName);

    newPack.downloadZip = `/downloads/packs/${packZipName}`;

    newPack.tracks.forEach(track => {
      const trackZipName = `${track.id}.zip`;
      track.downloadZip = `/downloads/tracks/${trackZipName}`;
    });

    packs.push(newPack);

    fs.writeFileSync(
      "./data/pendingPacks.json",
      JSON.stringify(packs, null, 2)
    );

    res.json({
      success: true,
      message: "Pack envoyé en modération",
      pack: newPack
    });

    setTimeout(() => {
      try {
        createZip(
          packZipFullPath,
          newPack.tracks.map(track => track.audioName)
        );

        newPack.tracks.forEach(track => {
          const trackZipName = `${track.id}.zip`;
          const trackZipFullPath = path.join(tracksZipPath, trackZipName);

          createZip(
            trackZipFullPath,
            [track.audioName]
          );
        });
      
       await resend.emails.send({
          from: "Sonara Pack <luca.dida17@gmail.com>",
          to: "luca.dida17@gmail.com",
          subject: "Nouvelle demande de pack à modérer",
          html: `
           <div style="font-family: Arial, sans-serif; background:#080b12; color:white; padding:30px; border-radius:16px;">
            <h2>Nouvelle demande Sonara Pack</h2>
           <div style="background:#111827; padding:20px; border-radius:14px; margin-top:20px;">
            <p><strong>Titre :</strong> ${newPack.title || "Pack sans titre"}</p>
            <p><strong>Artiste :</strong> ${newPack.artist || "Non renseigné"}</p>
            <p><strong>Prix :</strong> ${newPack.price || newPack.globalPrice || "Non renseigné"}</p>
            <p><strong>Tracks :</strong> ${newPack.tracks?.length || 0}</p>
            <p><strong>Status :</strong> ${newPack.status}</p>
            <p><strong>ID :</strong> ${newPack.id}</p>
         

            <p>
              <strong>Vérification obligatoire :</strong><br>
              cover,bientôt écoute audio, cohérence du pack, prix, droits, qualité générale.
            </p>
          </div>
            <div style="margin-top:30px;">
            <a href="https://sonarapack-test.netlify.app/admin.html"
              style="display:inline-block; padding:14px 22px; background:#7ddcff; color:#000; text-decoration:none; border-radius:999px; font-weight:bold;">
              Open Admin
            </a>
            
           </div>
        </div>
          `
        }).catch(error => {
          console.error("Erreur mail :", error);
        });

      } catch (zipError) {
        console.error("Erreur création ZIP :", zipError);
      }
    }, 0);

  } catch (error) {
    console.error("ERREUR /api/packs/pending :", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.patch("/api/packs/:id/status", (req, res) => {
  const packId = req.params.id
  const { status } = req.body

  const packs = JSON.parse(
    fs.readFileSync("./data/pendingPacks.json", "utf8")
  )

  const pack = packs.find(pack => pack.id === packId)

  if (!pack) {
    return res.status(404).json({
      success: false,
      message: "Pack introuvable"
    })
  }

  pack.status = status

  fs.writeFileSync(
    "./data/pendingPacks.json",
    JSON.stringify(packs, null, 2)
  )

  res.json({
    success: true,
    message: `Pack ${status}`,
    pack
  })
})

function checkServerFiles() {
  const checks = [
    { name: "creator.js", path: "./app/js/creator.js" },
    { name: "create-pack.js", path: "./app/js/js-creator/create-pack.js" },
    { name: "pending.js", path: "./app/js/pending.js" },
    { name: "admin.js", path: "./app/js/admin.js" },
    { name: "home.js", path: "./app/js/home.js" },
    { name: "pack.js", path: "./app/js/pack.js" },
    { name: "pendingPacks.json", path: "./data/pendingPacks.json" },
    { name: "uploads folder", path: "./uploads" }
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

app.listen(PORT, () => {

  checkServerFiles();

  console.log(`
━━━━━━━━━━━━━━━━━━
🔥 SONARA READY
🌐 http://localhost:${PORT}
━━━━━━━━━━━━━━━━━━
`);

});

