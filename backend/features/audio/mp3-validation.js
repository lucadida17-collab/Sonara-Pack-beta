"use strict";

const fs = require("fs");
const audioPolicy = require("../../../app/js/core/audio-upload-policy");

const MP3_SCAN_BYTES = 64 * 1024;
const MPEG1_LAYER3_BITRATES = Object.freeze([0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]);
const MPEG2_LAYER3_BITRATES = Object.freeze([0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]);
const MPEG1_SAMPLE_RATES = Object.freeze([44100, 48000, 32000]);

function parseMpegLayer3Header(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + 4 > buffer.length) return null;

  const b0 = buffer[offset];
  const b1 = buffer[offset + 1];
  const b2 = buffer[offset + 2];

  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;

  // MP3 = MPEG Audio Layer III. Version 01 est réservée.
  if (versionBits === 0x01 || layerBits !== 0x01) return null;
  if (bitrateIndex === 0x00 || bitrateIndex === 0x0f) return null;
  if (sampleRateIndex === 0x03) return null;

  const isMpeg1 = versionBits === 0x03;
  const bitrateKbps = (isMpeg1 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex];
  let sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex];
  if (versionBits === 0x02) sampleRate /= 2;
  if (versionBits === 0x00) sampleRate /= 4;

  if (!bitrateKbps || !sampleRate) return null;

  const coefficient = isMpeg1 ? 144 : 72;
  const frameLength = Math.floor((coefficient * bitrateKbps * 1000) / sampleRate) + padding;
  if (frameLength < 24) return null;

  return { versionBits, sampleRate, frameLength };
}

function synchsafeInteger(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + 4 > buffer.length) return 0;
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

async function readChunk(fileHandle, position, length) {
  const buffer = Buffer.allocUnsafe(length);
  const { bytesRead } = await fileHandle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

async function hasMp3FrameSignature(filePath) {
  if (!filePath) return false;

  let handle;
  try {
    handle = await fs.promises.open(filePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 4) return false;

    const header = await readChunk(handle, 0, Math.min(10, stat.size));
    let scanOffset = 0;

    if (header.length >= 10 && header.toString("ascii", 0, 3) === "ID3") {
      const tagSize = synchsafeInteger(header, 6);
      scanOffset = Math.min(stat.size, 10 + tagSize);
    }

    const scanLength = Math.min(MP3_SCAN_BYTES, Math.max(0, stat.size - scanOffset));
    if (scanLength < 4) return false;

    const scan = await readChunk(handle, scanOffset, scanLength);
    for (let offset = 0; offset <= scan.length - 4; offset += 1) {
      const first = parseMpegLayer3Header(scan, offset);
      if (!first) continue;

      const nextFramePosition = scanOffset + offset + first.frameLength;
      if (nextFramePosition + 4 > stat.size) continue;

      const nextHeader = await readChunk(handle, nextFramePosition, 4);
      const second = parseMpegLayer3Header(nextHeader, 0);
      if (
        second &&
        second.versionBits === first.versionBits &&
        second.sampleRate === first.sampleRate
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  } finally {
    if (handle) {
      try { await handle.close(); } catch {}
    }
  }
}

async function validateMp3Upload(file) {
  if (!file || !audioPolicy.isAllowedMp3Metadata(file)) {
    return {
      valid: false,
      code: "MP3_ONLY",
      message: "Sonara Pack accepte actuellement uniquement les fichiers MP3."
    };
  }

  if (Number(file.size || 0) > audioPolicy.MAX_MP3_FILE_SIZE_BYTES) {
    return {
      valid: false,
      code: "MP3_TOO_LARGE",
      message: `Ce fichier MP3 dépasse ${audioPolicy.MAX_MP3_FILE_SIZE_MB} Mo.`
    };
  }

  if (!await hasMp3FrameSignature(file.path)) {
    return {
      valid: false,
      code: "INVALID_MP3_CONTENT",
      message: "Le fichier envoyé ne contient pas un flux MP3 valide."
    };
  }

  return { valid: true };
}

module.exports = {
  ...audioPolicy,
  hasMp3FrameSignature,
  validateMp3Upload
};
