"use strict";

const fs = require("fs");
const { spawn } = require("child_process");
let ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
try {
  ffmpegPath = require("ffmpeg-static") || ffmpegPath;
} catch {
  // En développement local, ffmpeg système peut prendre le relais.
}

const DEFAULT_PREVIEW_DURATION = 30;
const ANALYSIS_SAMPLE_RATE = 1000;
const ANALYSIS_VERSION = 1;

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function decodeMonoEnergy(buffer, sampleRate = ANALYSIS_SAMPLE_RATE) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return [];

  const sampleCount = Math.floor(buffer.length / 4);
  const secondCount = Math.ceil(sampleCount / sampleRate);
  const sumSquares = new Float64Array(secondCount);
  const peaks = new Float64Array(secondCount);
  const counts = new Uint32Array(secondCount);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const byteIndex = sampleIndex * 4;
    const sample = buffer.readFloatLE(byteIndex);
    if (!Number.isFinite(sample)) continue;

    const secondIndex = Math.floor(sampleIndex / sampleRate);
    const absolute = Math.abs(sample);
    sumSquares[secondIndex] += sample * sample;
    counts[secondIndex] += 1;
    if (absolute > peaks[secondIndex]) peaks[secondIndex] = absolute;
  }

  return Array.from({ length: secondCount }, (_, index) => {
    const count = counts[index] || 1;
    const rms = Math.sqrt(sumSquares[index] / count);
    return {
      rms,
      peak: peaks[index]
    };
  });
}

function scorePreviewWindows(energy, previewDuration = DEFAULT_PREVIEW_DURATION) {
  const durationSeconds = energy.length;
  const previewSeconds = Math.max(1, Math.min(previewDuration, durationSeconds));

  if (durationSeconds <= previewSeconds) {
    return { start: 0, duration: durationSeconds };
  }

  let bestStart = 0;
  let bestScore = -Infinity;

  for (let start = 0; start <= durationSeconds - previewSeconds; start += 1) {
    let rmsSum = 0;
    let peakSum = 0;
    let activeSeconds = 0;
    let variation = 0;
    let previousRms = null;

    for (let offset = 0; offset < previewSeconds; offset += 1) {
      const item = energy[start + offset] || { rms: 0, peak: 0 };
      rmsSum += item.rms;
      peakSum += item.peak;
      if (item.rms > 0.015 || item.peak > 0.06) activeSeconds += 1;
      if (previousRms !== null) variation += Math.abs(item.rms - previousRms);
      previousRms = item.rms;
    }

    const averageRms = rmsSum / previewSeconds;
    const averagePeak = peakSum / previewSeconds;
    const activityRatio = activeSeconds / previewSeconds;
    const dynamicRatio = variation / Math.max(1, previewSeconds - 1);

    // Le cœur de la sélection privilégie une zone pleine et musicale :
    // énergie moyenne + présence continue + quelques variations/transitoires.
    let score =
      averageRms * 0.58 +
      averagePeak * 0.17 +
      activityRatio * 0.20 +
      dynamicRatio * 0.05;

    // Une intro silencieuse ne doit pas gagner juste parce qu'un pic arrive à sa fin.
    if (start < 5 && durationSeconds > previewSeconds + 10) {
      score *= 0.92;
    }

    // Évite autant que possible une fenêtre collée à la toute fin du fichier.
    if (start + previewSeconds > durationSeconds - 2) {
      score *= 0.96;
    }

    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return {
    start: clamp(bestStart, 0, Math.max(0, durationSeconds - previewSeconds)),
    duration: previewSeconds
  };
}

function analyzeAudioPreview(filePath, { previewDuration = DEFAULT_PREVIEW_DURATION } = {}) {
  return new Promise((resolve) => {
    const fallback = {
      previewStart: 0,
      previewDuration,
      previewAnalysisVersion: 0,
      previewAnalysisMethod: "fallback"
    };

    if (!ffmpegPath || !filePath || !fs.existsSync(filePath)) {
      resolve(fallback);
      return;
    }

    const args = [
      "-v", "error",
      "-i", filePath,
      "-vn",
      "-ac", "1",
      "-ar", String(ANALYSIS_SAMPLE_RATE),
      "-f", "f32le",
      "-acodec", "pcm_f32le",
      "pipe:1"
    ];

    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const chunks = [];
    let outputBytes = 0;
    let stderr = "";
    const MAX_ANALYSIS_BYTES = 64 * 1024 * 1024;

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_ANALYSIS_BYTES) {
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString("utf8");
    });

    child.on("error", () => resolve(fallback));

    child.on("close", (code) => {
      if (code !== 0 || !chunks.length || outputBytes > MAX_ANALYSIS_BYTES) {
        if (stderr.trim()) {
          console.warn("Analyse preview audio indisponible :", stderr.trim().slice(0, 600));
        }
        resolve(fallback);
        return;
      }

      try {
        const energy = decodeMonoEnergy(Buffer.concat(chunks));
        const selection = scorePreviewWindows(energy, previewDuration);
        resolve({
          previewStart: Number(selection.start.toFixed(2)),
          previewDuration: Math.min(previewDuration, Math.max(1, selection.duration)),
          previewAnalysisVersion: ANALYSIS_VERSION,
          previewAnalysisMethod: "sonara-energy-v1"
        });
      } catch (error) {
        console.warn("Analyse preview audio échouée :", error.message);
        resolve(fallback);
      }
    });
  });
}

function normalizeStoredPreview(track = {}, previewDuration = DEFAULT_PREVIEW_DURATION) {
  const start = Math.max(0, safeNumber(track.previewStart, 0));
  const duration = clamp(
    safeNumber(track.previewDuration, previewDuration),
    1,
    previewDuration
  );

  return {
    previewStart: start,
    previewDuration: duration
  };
}

module.exports = {
  DEFAULT_PREVIEW_DURATION,
  ANALYSIS_VERSION,
  analyzeAudioPreview,
  normalizeStoredPreview
};
