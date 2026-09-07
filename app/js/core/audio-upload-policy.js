(function initSonaraAudioUploadPolicy(root, factory) {
  const policy = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = policy;
  }

  if (root) {
    root.SonaraAudioUploadPolicy = policy;
  }
})(typeof window !== "undefined" ? window : null, function buildSonaraAudioUploadPolicy() {
  "use strict";

  const MAX_MP3_FILE_SIZE_BYTES = 64 * 1024 * 1024;
  const MAX_MP3_FILE_SIZE_MB = MAX_MP3_FILE_SIZE_BYTES / (1024 * 1024);
  const MP3_EXTENSION = ".mp3";
  const MP3_MIME_TYPES = Object.freeze([
    "audio/mpeg",
    "audio/mp3",
    "audio/x-mp3",
    "audio/mpeg3",
    "audio/x-mpeg-3"
  ]);

  function normalizeMimeType(value) {
    return String(value || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
  }

  function hasMp3Extension(fileName) {
    return String(fileName || "").trim().toLowerCase().endsWith(MP3_EXTENSION);
  }

  function hasAllowedMp3MimeType(mimeType) {
    return MP3_MIME_TYPES.includes(normalizeMimeType(mimeType));
  }

  function isAllowedMp3Metadata(fileLike) {
    return Boolean(
      fileLike &&
      hasMp3Extension(fileLike.name || fileLike.originalname) &&
      hasAllowedMp3MimeType(fileLike.type || fileLike.mimetype)
    );
  }

  return Object.freeze({
    MAX_MP3_FILE_SIZE_BYTES,
    MAX_MP3_FILE_SIZE_MB,
    MP3_EXTENSION,
    MP3_MIME_TYPES,
    normalizeMimeType,
    hasMp3Extension,
    hasAllowedMp3MimeType,
    isAllowedMp3Metadata
  });
});
