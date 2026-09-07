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
const ANALYSIS_VERSION = 2;
const MAX_ANALYSIS_BYTES = 32 * 1024 * 1024;

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createEnergyAccumulator(sampleRate = ANALYSIS_SAMPLE_RATE) {
  const sumSquares = [];
  const peaks = [];
  const counts = [];
  let sampleIndex = 0;
  const pendingSample = Buffer.allocUnsafe(4);
  let pendingLength = 0;

  function accumulateSample(sample) {
    const secondIndex = Math.floor(sampleIndex / sampleRate);
    sampleIndex += 1;
    if (!Number.isFinite(sample)) return;

    const absolute = Math.abs(sample);
    sumSquares[secondIndex] = (sumSquares[secondIndex] || 0) + sample * sample;
    counts[secondIndex] = (counts[secondIndex] || 0) + 1;
    peaks[secondIndex] = Math.max(peaks[secondIndex] || 0, absolute);
  }

  function pushChunk(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) return;

    let byteIndex = 0;

    if (pendingLength) {
      const needed = 4 - pendingLength;
      const copied = Math.min(needed, chunk.length);
      chunk.copy(pendingSample, pendingLength, 0, copied);
      pendingLength += copied;
      byteIndex += copied;
      if (pendingLength === 4) {
        accumulateSample(pendingSample.readFloatLE(0));
        pendingLength = 0;
      }
    }

    const remainingBytes = chunk.length - byteIndex;
    const completeBytes = remainingBytes - (remainingBytes % 4);
    const completeEnd = byteIndex + completeBytes;

    for (; byteIndex < completeEnd; byteIndex += 4) {
      accumulateSample(chunk.readFloatLE(byteIndex));
    }

    if (byteIndex < chunk.length) {
      pendingLength = chunk.length - byteIndex;
      chunk.copy(pendingSample, 0, byteIndex);
    }
  }

  function finish() {
    return Array.from({ length: counts.length }, (_, index) => {
      const count = counts[index] || 1;
      return {
        rms: Math.sqrt((sumSquares[index] || 0) / count),
        peak: peaks[index] || 0
      };
    });
  }

  return { pushChunk, finish };
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

    let score =
      averageRms * 0.58 +
      averagePeak * 0.17 +
      activityRatio * 0.20 +
      dynamicRatio * 0.05;

    if (start < 5 && durationSeconds > previewSeconds + 10) {
      score *= 0.92;
    }

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

    const accumulator = createEnergyAccumulator();
    let outputBytes = 0;
    let stderr = "";
    let settled = false;
    let killedForLimit = false;

    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_ANALYSIS_BYTES) {
        killedForLimit = true;
        child.kill("SIGKILL");
        return;
      }
      accumulator.pushChunk(chunk);
    });

    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString("utf8");
    });

    child.on("error", () => settle(fallback));

    child.on("close", (code) => {
      if (code !== 0 || outputBytes === 0 || killedForLimit) {
        if (stderr.trim()) {
          console.warn("Analyse preview audio indisponible :", stderr.trim().slice(0, 600));
        }
        settle(fallback);
        return;
      }

      try {
        const energy = accumulator.finish();
        if (!energy.length) {
          settle(fallback);
          return;
        }
        const selection = scorePreviewWindows(energy, previewDuration);
        settle({
          previewStart: Number(selection.start.toFixed(2)),
          previewDuration: Math.min(previewDuration, Math.max(1, selection.duration)),
          previewAnalysisVersion: ANALYSIS_VERSION,
          previewAnalysisMethod: "sonara-energy-stream-v2"
        });
      } catch (error) {
        console.warn("Analyse preview audio échouée :", error.message);
        settle(fallback);
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
