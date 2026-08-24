"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const multer = require("multer");

let bundledFfmpeg = "";
try {
  bundledFfmpeg = require("ffmpeg-static") || "";
} catch {}

const FFMPEG_PATH = String(process.env.FFMPEG_PATH || bundledFfmpeg || "ffmpeg").trim();
const TEMP_ROOT = path.join(os.tmpdir(), "sonara-sync-engine");
const RESULT_ROOT = path.join(TEMP_ROOT, "results");
const RESULT_TTL_MS = 30 * 60 * 1000;
const MAX_SYNC_FILE_SIZE = Number(process.env.SYNC_MAX_FILE_SIZE || 20 * 1024 * 1024 * 1024);
const SYNC_BLOCKED_RESOURCE_EXTENSIONS = new Set([
  ".mid", ".midi",
  ".flp", ".als", ".rpp", ".logicx", ".cpr", ".ptx", ".song"
]);

function isSonaraSyncAudioTrack(track = {}) {
  const contentType = String(track.contentType || track.resourceType || "audio").trim().toLowerCase();
  if (["midi", "daw"].includes(contentType)) return false;

  const extension = path.extname(String(track.file?.originalname || "")).trim().toLowerCase();
  if (SYNC_BLOCKED_RESOURCE_EXTENSIONS.has(extension)) return false;

  const mimeType = String(track.file?.mimetype || "").trim().toLowerCase();
  if (["audio/midi", "audio/x-midi", "application/x-midi"].includes(mimeType)) return false;
  return mimeType.startsWith("audio/");
}

fs.mkdirSync(RESULT_ROOT, { recursive: true });

const resultFiles = new Map();

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cleanDir(directory) {
  if (!directory) return;
  fs.rm(directory, { recursive: true, force: true }, () => {});
}

function cleanResult(token) {
  const item = resultFiles.get(token);
  if (!item) return;
  resultFiles.delete(token);
  fs.rm(item.path, { force: true }, () => {});
}

function rememberResult(filePath) {
  const token = crypto.randomBytes(24).toString("hex");
  const timer = setTimeout(() => cleanResult(token), RESULT_TTL_MS);
  timer.unref?.();
  resultFiles.set(token, { path: filePath, timer });
  return token;
}

function runFfmpeg(args, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    let stdoutBuffer = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const split = line.indexOf("=");
        if (split < 0) continue;
        const key = line.slice(0, split);
        const value = line.slice(split + 1);
        onProgress?.(key, value);
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-16000);
    });

    child.once("error", (error) => {
      reject(new Error(`Moteur Sonara Sync impossible à démarrer (${error.message}).`));
    });

    child.once("close", (code) => {
      if (code === 0) return resolve();
      const detail = stderr.trim().split(/\r?\n/).slice(-8).join("\n");
      reject(new Error(detail || `FFmpeg a quitté avec le code ${code}.`));
    });
  });
}

async function videoHasAudio(videoPath) {
  try {
    await runFfmpeg([
      "-v", "error",
      "-i", videoPath,
      "-map", "0:a:0",
      "-frames:a", "1",
      "-f", "null",
      process.platform === "win32" ? "NUL" : "/dev/null"
    ]);
    return true;
  } catch {
    return false;
  }
}

function buildAudioFilter({ hasOriginalAudio, tracks, duration }) {
  const filters = [];
  const mixLabels = [];

  if (hasOriginalAudio) {
    filters.push("[0:a:0]aresample=48000,volume=1[sonara_base]");
    mixLabels.push("[sonara_base]");
  }

  tracks.forEach((track, index) => {
    const inputIndex = index + 1;
    const start = Math.max(0, safeNumber(track.trimStart, 0));
    const end = Math.max(start + 0.05, safeNumber(track.trimEnd, start + 0.05));
    const delay = Math.max(0, Math.round(safeNumber(track.offset, 0) * 1000));
    const volume = clamp(safeNumber(track.volume, 1), 0, 1.5);
    const label = `sonara_layer_${index}`;

    filters.push(
      `[${inputIndex}:a:0]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},` +
      `asetpts=PTS-STARTPTS,aresample=48000,volume=${volume.toFixed(4)},` +
      `adelay=${delay}:all=1[${label}]`
    );
    mixLabels.push(`[${label}]`);
  });

  if (!mixLabels.length) {
    throw new Error("Aucune piste audio à intégrer.");
  }

  const finalDuration = Math.max(0.1, safeNumber(duration, 0.1));
  if (mixLabels.length === 1) {
    filters.push(`${mixLabels[0]}apad,atrim=duration=${finalDuration.toFixed(3)},aresample=async=1:first_pts=0[sonara_out]`);
  } else {
    filters.push(
      `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0:normalize=0,` +
      `apad,atrim=duration=${finalDuration.toFixed(3)},aresample=async=1:first_pts=0[sonara_out]`
    );
  }

  return filters.join(";");
}

function createUpload() {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      if (!req.sonaraSyncTempDir) {
        req.sonaraSyncTempDir = path.join(TEMP_ROOT, `job-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`);
        fs.mkdirSync(req.sonaraSyncTempDir, { recursive: true });
      }
      cb(null, req.sonaraSyncTempDir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || "").slice(0, 12);
      cb(null, `${file.fieldname}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: MAX_SYNC_FILE_SIZE,
      files: 24,
      fields: 30
    }
  });
}

function registerSonaraSyncEngine(app) {
  const upload = createUpload();

  app.get("/api/sync/health", (req, res) => {
    res.json({
      success: true,
      engine: "SONARA_SYNC_NATIVE",
      videoMode: "STREAM_COPY",
      ffmpegReady: Boolean(FFMPEG_PATH)
    });
  });

  app.post("/api/sync/render", upload.any(), async (req, res) => {
    const tempDir = req.sonaraSyncTempDir;
    let outputPath = "";

    try {
      const files = Array.isArray(req.files) ? req.files : [];
      const video = files.find((file) => file.fieldname === "video");
      if (!video) return res.status(400).json({ success: false, message: "Vidéo introuvable." });

      let project;
      try {
        project = JSON.parse(req.body.project || "{}");
      } catch {
        return res.status(400).json({ success: false, message: "Projet Sync invalide." });
      }

      const duration = Math.max(0.1, safeNumber(project.videoDuration, 0));
      if (!duration) return res.status(400).json({ success: false, message: "Durée vidéo invalide." });

      const requestedTracks = Array.isArray(project.audioTracks) ? project.audioTracks : [];
      const tracks = requestedTracks.map((track, index) => {
        const field = `audio_${index}`;
        const file = files.find((item) => item.fieldname === field);
        return file ? { ...track, file } : null;
      }).filter(Boolean);

      if (!tracks.length) {
        return res.status(400).json({ success: false, message: "Aucun son Sonara à intégrer." });
      }

      if (tracks.some((track) => !isSonaraSyncAudioTrack(track))) {
        return res.status(415).json({
          success: false,
          code: "SONARA_SYNC_AUDIO_ONLY",
          message: "Sonara Sync accepte uniquement des contenus audio. Les fichiers MIDI et projets DAW restent séparés."
        });
      }

      const originalAudio = await videoHasAudio(video.path);
      const filter = buildAudioFilter({ hasOriginalAudio: originalAudio, tracks, duration });

      outputPath = path.join(RESULT_ROOT, `sonara-sync-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.mp4`);
      const args = ["-hide_banner", "-y", "-i", video.path];
      tracks.forEach((track) => args.push("-i", track.file.path));

      args.push(
        "-filter_complex", filter,
        "-map", "0:v:0",
        "-map", "[sonara_out]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "256k",
        "-ar", "48000",
        "-ac", "2",
        "-movflags", "+faststart",
        "-map_metadata", "0",
        "-progress", "pipe:1",
        "-nostats",
        outputPath
      );

      await runFfmpeg(args);

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
        throw new Error("Le moteur Sonara n'a produit aucun fichier.");
      }

      const token = rememberResult(outputPath);
      outputPath = "";
      return res.json({
        success: true,
        engine: "SONARA_SYNC_NATIVE",
        videoReencoded: false,
        downloadUrl: `/api/sync/download/${token}`
      });
    } catch (error) {
      console.error("Erreur moteur Sonara Sync :", error);
      if (outputPath) fs.rm(outputPath, { force: true }, () => {});
      return res.status(500).json({
        success: false,
        message: error?.message || "Le moteur Sonara Sync n'a pas pu générer la vidéo."
      });
    } finally {
      cleanDir(tempDir);
    }
  });

  app.get("/api/sync/download/:token", (req, res) => {
    const token = String(req.params.token || "");
    const item = resultFiles.get(token);

    if (!item || !fs.existsSync(item.path)) {
      return res.status(404).json({ success: false, message: "Export Sonara Sync expiré ou introuvable." });
    }

    const filename = `sonara-sync-${Date.now()}.mp4`;
    res.download(item.path, filename, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ success: false, message: "Téléchargement du rendu impossible." });
      }
      clearTimeout(item.timer);
      cleanResult(token);
    });
  });
}

module.exports = { registerSonaraSyncEngine };
