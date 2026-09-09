"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

let ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
try {
  ffmpegPath = require("ffmpeg-static") || ffmpegPath;
} catch {
  // En local, ffmpeg système peut prendre le relais.
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createPreviewWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sonara-founder-preview-"));
  return {
    directory,
    inputPath: path.join(directory, "source-audio"),
    outputPath: path.join(directory, "preview.mp3"),
    framePath: path.join(directory, "promo.png"),
    videoPath: path.join(directory, "promo.mp4"),
    cleanup() {
      try {
        fs.rmSync(directory, { recursive: true, force: true });
      } catch {
        // Le nettoyage est best effort : jamais bloquer une réponse Founder pour ça.
      }
    }
  };
}

function renderAudioPreview({ inputPath, outputPath, start = 0, duration = 30, levelPercent = 100 }) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("FFmpeg indisponible."));
      return;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      reject(new Error("Audio source introuvable."));
      return;
    }

    const safeStart = Math.max(0, safeNumber(start, 0));
    const safeDuration = clamp(safeNumber(duration, 30), 1, 30);
    const safeLevel = clamp(safeNumber(levelPercent, 100), 70, 100) / 100;
    const fadeInDuration = Math.min(0.15, safeDuration / 4);
    const fadeOutDuration = Math.min(0.35, safeDuration / 3);
    const fadeOutStart = Math.max(0, safeDuration - fadeOutDuration);
    const audioFilter = [
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      `volume=${safeLevel.toFixed(3)}`,
      `afade=t=in:st=0:d=${fadeInDuration.toFixed(3)}`,
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutDuration.toFixed(3)}`
    ].join(",");

    const args = [
      "-v", "error",
      "-y",
      "-ss", safeStart.toFixed(3),
      "-i", inputPath,
      "-t", safeDuration.toFixed(3),
      "-vn",
      "-map_metadata", "-1",
      "-af", audioFilter,
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
      outputPath
    ];

    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 6000) stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(outputPath)) {
        reject(new Error(stderr.trim() || `FFmpeg a quitté avec le code ${code}.`));
        return;
      }
      resolve(outputPath);
    });
  });
}


function renderPromoVideo({ framePath, audioPath, outputPath, duration = 30 }) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("FFmpeg indisponible."));
      return;
    }
    if (!framePath || !fs.existsSync(framePath)) {
      reject(new Error("Visuel promo introuvable."));
      return;
    }
    if (!audioPath || !fs.existsSync(audioPath)) {
      reject(new Error("Extrait audio introuvable."));
      return;
    }

    const safeDuration = clamp(safeNumber(duration, 30), 1, 30);
    const args = [
      "-v", "error",
      "-y",
      "-loop", "1",
      "-framerate", "30",
      "-i", framePath,
      "-i", audioPath,
      "-t", safeDuration.toFixed(3),
      "-map_metadata", "-1",
      "-vf", "scale=1080:1920:flags=lanczos,setsar=1",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-shortest",
      "-movflags", "+faststart",
      outputPath
    ];

    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8000) stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(outputPath)) {
        reject(new Error(stderr.trim() || `FFmpeg a quitté avec le code ${code}.`));
        return;
      }
      resolve(outputPath);
    });
  });
}

function safeDownloadPart(value, fallback = "sonara") {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function previewDownloadName(pack = {}, track = {}) {
  return `${safeDownloadPart(pack.title || pack.name || "sonara-pack")}-${safeDownloadPart(track.title || track.name || "extrait")}-30s.mp3`;
}

function coverDownloadName(pack = {}, storedName = "") {
  const extension = path.extname(String(storedName || "")).toLowerCase();
  const safeExtension = /^\.(?:png|jpe?g|webp|gif|avif)$/i.test(extension) ? extension : ".jpg";
  return `${safeDownloadPart(pack.title || pack.name || "sonara-pack")}-cover${safeExtension}`;
}

function promoVideoDownloadName(pack = {}, track = {}) {
  return `${safeDownloadPart(pack.title || pack.name || "sonara-pack")}-${safeDownloadPart(track.title || track.name || "track")}-promo.mp4`;
}

module.exports = {
  createPreviewWorkspace,
  renderAudioPreview,
  renderPromoVideo,
  previewDownloadName,
  coverDownloadName,
  promoVideoDownloadName
};
