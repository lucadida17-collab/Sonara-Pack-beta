"use strict";

const LICENSE_SCHEMA_VERSION = 1;
const LICENSE_TEMPLATE = "sonara-standard";
const MAX_HISTORY_ENTRIES = 50;

const PERMISSION_KEYS = [
  "personalProjects",
  "commercialProjects",
  "monetization",
  "socialMedia",
  "videoFilm",
  "advertising",
  "gamesApps",
  "podcasts",
  "liveStreaming",
  "clientWork",
  "soundEditing",
  "unlimitedProjects"
];

const RESTRICTION_KEYS = [
  "standaloneResale",
  "redistribution",
  "musicPlatformUpload",
  "contentIdRegistration",
  "sublicensing",
  "misleadingOwnership"
];

const DEFAULT_PERMISSIONS = Object.freeze({
  personalProjects: true,
  commercialProjects: true,
  monetization: true,
  socialMedia: true,
  videoFilm: true,
  advertising: true,
  gamesApps: true,
  podcasts: true,
  liveStreaming: true,
  clientWork: true,
  soundEditing: true,
  unlimitedProjects: true
});

const DEFAULT_RESTRICTIONS = Object.freeze({
  standaloneResale: true,
  redistribution: true,
  musicPlatformUpload: true,
  contentIdRegistration: true,
  sublicensing: true,
  misleadingOwnership: true
});

function cleanText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function cleanStringList(value, maxItems = 12, maxLength = 180) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/\n|;/)
        .map((item) => item.trim());

  const seen = new Set();
  const result = [];

  for (const item of source) {
    const cleaned = cleanText(item, maxLength);
    const key = cleaned.toLocaleLowerCase("fr");
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maxItems) break;
  }

  return result;
}

function normalizeBooleanMap(value, keys, defaults) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    keys.map((key) => [
      key,
      Object.prototype.hasOwnProperty.call(source, key)
        ? Boolean(source[key])
        : Boolean(defaults[key])
    ])
  );
}

function defaultPackLicense() {
  return {
    schemaVersion: LICENSE_SCHEMA_VERSION,
    template: LICENSE_TEMPLATE,
    version: 1,
    name: "Licence standard Sonara",
    appliesTo: "pack_and_tracks",
    territory: "worldwide",
    duration: "perpetual",
    exclusive: false,
    transferable: false,
    creditRequired: false,
    permissions: { ...DEFAULT_PERMISSIONS },
    restrictions: { ...DEFAULT_RESTRICTIONS },
    customPermissions: [],
    customRestrictions: [],
    customTerms: "",
    updatedAt: null,
    updatedByAccountId: null
  };
}

function normalizePackLicense(value, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const fallback = defaultPackLicense();
  const parsedVersion = Number.parseInt(source.version, 10);

  return {
    schemaVersion: LICENSE_SCHEMA_VERSION,
    template: cleanText(source.template || fallback.template, 60) || fallback.template,
    version:
      Number.isFinite(parsedVersion) && parsedVersion > 0
        ? parsedVersion
        : fallback.version,
    name: cleanText(source.name || fallback.name, 90) || fallback.name,
    appliesTo: "pack_and_tracks",
    territory: "worldwide",
    duration: "perpetual",
    exclusive: false,
    transferable: false,
    creditRequired: Boolean(source.creditRequired),
    permissions: normalizeBooleanMap(
      source.permissions,
      PERMISSION_KEYS,
      DEFAULT_PERMISSIONS
    ),
    restrictions: normalizeBooleanMap(
      source.restrictions,
      RESTRICTION_KEYS,
      DEFAULT_RESTRICTIONS
    ),
    customPermissions: cleanStringList(source.customPermissions),
    customRestrictions: cleanStringList(source.customRestrictions),
    customTerms: cleanText(source.customTerms, 1600),
    updatedAt: source.updatedAt ? cleanText(source.updatedAt, 40) : null,
    updatedByAccountId: source.updatedByAccountId
      ? cleanText(source.updatedByAccountId, 120)
      : null,
    ...(options.includeInternal && source.id ? { id: cleanText(source.id, 180) } : {})
  };
}

function comparableLicense(value) {
  const normalized = normalizePackLicense(value);
  const { version, updatedAt, updatedByAccountId, ...comparable } = normalized;
  return comparable;
}

function packLicenseChanged(currentValue, nextValue) {
  return JSON.stringify(comparableLicense(currentValue)) !== JSON.stringify(comparableLicense(nextValue));
}

function buildUpdatedPackLicense(currentValue, submittedValue, options = {}) {
  const hasCurrent = options.hasCurrent !== false && Boolean(currentValue && typeof currentValue === "object");
  const current = normalizePackLicense(currentValue);
  const next = normalizePackLicense(submittedValue);
  const changed = !hasCurrent || packLicenseChanged(current, next);
  const now = options.now || new Date().toISOString();
  const packId = cleanText(options.packId, 120);
  const currentVersion = hasCurrent ? current.version : 0;
  const version = changed ? currentVersion + 1 : Math.max(1, currentVersion);

  return {
    changed,
    license: {
      ...next,
      id: packId ? `${packId}:license:v${version}` : `license:v${version}`,
      version,
      updatedAt: changed ? now : current.updatedAt,
      updatedByAccountId: changed
        ? cleanText(options.accountId, 120) || null
        : current.updatedByAccountId
    },
    previous: current
  };
}

function appendPackLicenseHistory(historyValue, previousLicense, options = {}) {
  const history = Array.isArray(historyValue) ? historyValue.slice() : [];
  const previous = normalizePackLicense(previousLicense, { includeInternal: true });
  const alreadyStored = history.some((entry) =>
    Number(entry?.version) === Number(previous.version)
  );

  if (!alreadyStored) {
    history.push({
      ...previous,
      archivedAt: options.archivedAt || new Date().toISOString(),
      archivedReason: cleanText(options.reason || "license_updated", 80)
    });
  }

  return history
    .sort((a, b) => Number(a?.version || 0) - Number(b?.version || 0))
    .slice(-MAX_HISTORY_ENTRIES);
}

function licenseMetadata(pack) {
  const license = normalizePackLicense(pack?.license);
  return {
    licenseId: String(pack?.license?.id || `${pack?.id || "pack"}:license:v${license.version}`).slice(0, 450),
    licenseVersion: String(license.version),
    licenseTemplate: String(license.template).slice(0, 450),
    licenseNameSnapshot: String(license.name).slice(0, 450)
  };
}

function licenseModerationSummary(pack) {
  const license = normalizePackLicense(pack?.license);
  return {
    id: pack?.license?.id || `${pack?.id || "pack"}:license:v${license.version}`,
    version: license.version,
    name: license.name,
    template: license.template,
    creditRequired: license.creditRequired,
    permissions: license.permissions,
    restrictions: license.restrictions,
    customPermissions: license.customPermissions,
    customRestrictions: license.customRestrictions,
    customTerms: license.customTerms,
    updatedAt: license.updatedAt
  };
}

module.exports = {
  LICENSE_SCHEMA_VERSION,
  PERMISSION_KEYS,
  RESTRICTION_KEYS,
  defaultPackLicense,
  normalizePackLicense,
  packLicenseChanged,
  buildUpdatedPackLicense,
  appendPackLicenseHistory,
  licenseMetadata,
  licenseModerationSummary
};
