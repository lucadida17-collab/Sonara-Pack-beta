"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { normalizePackLicense } = require("./pack-license");

const CURRENT_LICENSE_VERSION = "SONARA_LICENSE_PRE_V1_1";
const RIGHTS_DECLARATION_VERSION = "SONARA_RIGHTS_PRE_V1_1";
const LEGAL_TEXT_REVIEW_REQUIRED = "LEGAL_TEXT_REVIEW_REQUIRED";
const FINGERPRINT_STATUS = "NOT_CONFIGURED";
const DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

const INCIDENT_STATUSES = Object.freeze([
  "PENDING",
  "UNDER_REVIEW",
  "CONFIRMED",
  "REJECTED",
  "RESOLVED"
]);

const SANCTION_LEVELS = Object.freeze([
  "WARNING",
  "DOWNLOAD_RESTRICTED",
  "TEMPORARY_SUSPENSION",
  "PERMANENT_BAN"
]);

const INCIDENT_TYPES = Object.freeze([
  "UNAUTHORIZED_MUSIC_REPUBLICATION",
  "UNAUTHORIZED_REDISTRIBUTION",
  "FALSE_OWNERSHIP_CLAIM",
  "OTHER_RIGHTS_VIOLATION"
]);

function text(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

async function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function buildCanonicalLicenseText(pack) {
  const license = normalizePackLicense(pack?.license);
  const enabledPermissions = Object.entries(license.permissions || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  const enabledRestrictions = Object.entries(license.restrictions || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  const lines = [
    `licenseName=${license.name}`,
    `template=${license.template}`,
    `packLicenseVersion=${license.version}`,
    `appliesTo=${license.appliesTo}`,
    `territory=${license.territory}`,
    `duration=${license.duration}`,
    `exclusive=${Boolean(license.exclusive)}`,
    `transferable=${Boolean(license.transferable)}`,
    `creditRequired=${Boolean(license.creditRequired)}`,
    `permissions=${enabledPermissions.join(",")}`,
    `restrictions=${enabledRestrictions.join(",")}`,
    `customPermissions=${(license.customPermissions || []).join(" | ")}`,
    `customRestrictions=${(license.customRestrictions || []).join(" | ")}`,
    `customTerms=${license.customTerms || ""}`
  ];

  return lines.join("\n");
}

function buildLicenseSnapshot(pack, createdAt = nowIso()) {
  const normalizedLicense = normalizePackLicense(pack?.license);
  const licenseText = buildCanonicalLicenseText(pack);
  const payload = {
    licenseVersion: CURRENT_LICENSE_VERSION,
    packId: text(pack?.id, 180),
    packLicenseId: text(pack?.license?.id || `${pack?.id || "pack"}:license:v${normalizedLicense.version}`, 240),
    packLicenseVersion: Number(normalizedLicense.version || 1),
    license: normalizedLicense,
    licenseText
  };

  return {
    recordType: "LICENSE_SNAPSHOT",
    id: makeId("license_snapshot"),
    uniqueKey: `license_snapshot:${payload.packId}:${payload.packLicenseId}:${sha256(stableStringify(payload))}`,
    ...payload,
    licenseHash: sha256(stableStringify(payload)),
    createdAt
  };
}

function fileEvidenceForItem(pack, trackId = null) {
  const tracks = Array.isArray(pack?.tracks) ? pack.tracks : [];
  if (trackId) {
    const track = tracks.find((item) => String(item?.id || "") === String(trackId));
    if (!track) return [];
    return [{
      trackId: text(track.id, 180),
      titleSnapshot: text(track.title, 240),
      fileName: text(track.audioName || track.audio, 500),
      originalFileHash: text(track.originalFileHash, 128) || null,
      originalFileHashAlgorithm: track.originalFileHash ? "SHA-256" : null,
      fingerprintStatus: text(track.fingerprintStatus || FINGERPRINT_STATUS, 80)
    }];
  }

  return tracks.map((track) => ({
    trackId: text(track?.id, 180),
    titleSnapshot: text(track?.title, 240),
    fileName: text(track?.audioName || track?.audio, 500),
    originalFileHash: text(track?.originalFileHash, 128) || null,
    originalFileHashAlgorithm: track?.originalFileHash ? "SHA-256" : null,
    fingerprintStatus: text(track?.fingerprintStatus || FINGERPRINT_STATUS, 80)
  }));
}

class EvidenceStore {
  constructor({ environment, dataDir, collection }) {
    this.environment = environment;
    this.collection = collection || null;
    this.filePath = dataDir ? path.join(dataDir, "license-evidence.json") : null;
  }

  async init() {
    if (this.collection) {
      await Promise.all([
        this.collection.createIndex({ uniqueKey: 1 }, { unique: true, sparse: true, name: "license_unique_key" }),
        this.collection.createIndex({ recordType: 1, accountId: 1, createdAt: -1 }, { name: "license_account_history" }),
        this.collection.createIndex({ recordType: 1, artistId: 1, createdAt: -1 }, { name: "license_artist_history" }),
        this.collection.createIndex({ downloadId: 1 }, { sparse: true, name: "license_download_id" }),
        this.collection.createIndex({ incidentId: 1 }, { sparse: true, name: "license_incident_id" }),
        this.collection.createIndex({ tokenHash: 1 }, { sparse: true, name: "license_download_token" })
      ]);
      return;
    }

    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, "[]\n", "utf8");
  }

  readLocal() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  writeLocal(records) {
    fs.writeFileSync(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  matches(record, filter = {}) {
    return Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (Array.isArray(value.$in)) return value.$in.map(String).includes(String(record?.[key]));
        if (Object.prototype.hasOwnProperty.call(value, "$ne")) return String(record?.[key]) !== String(value.$ne);
      }
      return String(record?.[key] ?? "") === String(value ?? "");
    });
  }

  async insert(record) {
    const safe = { ...record, environment: this.environment };
    if (this.collection) {
      if (safe.uniqueKey) {
        await this.collection.updateOne(
          { uniqueKey: safe.uniqueKey },
          { $setOnInsert: safe },
          { upsert: true }
        );
        return this.collection.findOne({ uniqueKey: safe.uniqueKey });
      }
      await this.collection.insertOne(safe);
      return safe;
    }

    const records = this.readLocal();
    if (safe.uniqueKey) {
      const existing = records.find((item) => item.uniqueKey === safe.uniqueKey);
      if (existing) return existing;
    }
    records.push(safe);
    this.writeLocal(records);
    return safe;
  }

  async find(filter = {}, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 100), 1000));
    if (this.collection) {
      return this.collection.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
    }
    return this.readLocal()
      .filter((item) => this.matches(item, filter))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, limit);
  }

  async findOne(filter = {}) {
    if (this.collection) return this.collection.findOne(filter, { sort: { createdAt: -1 } });
    return (await this.find(filter, { limit: 1 }))[0] || null;
  }

  async updateById(id, patch = {}) {
    if (this.collection) {
      await this.collection.updateOne({ id }, { $set: patch });
      return this.collection.findOne({ id });
    }
    const records = this.readLocal();
    const index = records.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return null;
    records[index] = { ...records[index], ...patch };
    this.writeLocal(records);
    return records[index];
  }
}

function createLicenseProtection(options = {}) {
  const environment = text(options.environment || "local", 20).toLowerCase();
  const store = new EvidenceStore({
    environment,
    dataDir: options.dataDir,
    collection: options.collection
  });

  async function audit(eventType, data = {}) {
    return store.insert({
      recordType: "AUDIT_EVENT",
      id: makeId("license_audit"),
      eventType: text(eventType, 120),
      ...data,
      createdAt: data.createdAt || nowIso()
    });
  }

  async function archiveLicense(pack, at = nowIso()) {
    const snapshot = buildLicenseSnapshot(pack, at);
    const stored = await store.insert(snapshot);
    return stored;
  }

  async function recordRightsDeclaration({ rootUserId, artistId, pack, acceptedAt = nowIso() }) {
    const tracks = Array.isArray(pack?.tracks) ? pack.tracks : [];
    const record = await store.insert({
      recordType: "RIGHTS_DECLARATION",
      id: makeId("rights_declaration"),
      rightsDeclarationId: makeId("rights"),
      uniqueKey: `rights:${text(pack?.id, 180)}:${RIGHTS_DECLARATION_VERSION}`,
      declarationVersion: RIGHTS_DECLARATION_VERSION,
      legalTextStatus: LEGAL_TEXT_REVIEW_REQUIRED,
      declarationTextSnapshot: "Je confirme disposer des droits nécessaires pour publier et licencier ce contenu sur Sonara Pack.",
      userId: text(rootUserId, 180) || null,
      artistId: text(artistId, 180),
      packId: text(pack?.id, 180),
      packTitleSnapshot: text(pack?.title || pack?.name, 240),
      trackIds: tracks.map((track) => text(track?.id, 180)).filter(Boolean),
      files: fileEvidenceForItem(pack, null),
      submittedAt: pack?.submittedAt || pack?.createdAt || null,
      acceptedAt,
      createdAt: acceptedAt
    });
    await audit("RIGHTS_DECLARATION_ACCEPTED", {
      userId: record.userId,
      artistId: record.artistId,
      packId: record.packId,
      rightsDeclarationId: record.rightsDeclarationId,
      createdAt: acceptedAt
    });
    return record;
  }

  async function recordPublication({ artistId, pack, publishedAt = nowIso() }) {
    const snapshot = await archiveLicense(pack, publishedAt);
    const record = await store.insert({
      recordType: "PACK_PUBLICATION_EVIDENCE",
      id: makeId("pack_publication"),
      uniqueKey: `publication:${text(pack?.id, 180)}:${text(publishedAt, 80)}`,
      artistId: text(artistId || pack?.accountId || pack?.artistAccountId || pack?.artistId, 180) || null,
      packId: text(pack?.id, 180),
      packTitleSnapshot: text(pack?.title || pack?.name, 240),
      publishedAt,
      originalPublishedAt: pack?.publishedAt || null,
      files: fileEvidenceForItem(pack, null),
      licenseSnapshotId: snapshot.id,
      licenseVersion: snapshot.licenseVersion,
      licenseHash: snapshot.licenseHash,
      fingerprintStatus: FINGERPRINT_STATUS,
      createdAt: publishedAt
    });
    await audit("PACK_PUBLISHED", {
      artistId: record.artistId,
      packId: record.packId,
      publicationEvidenceId: record.id,
      licenseSnapshotId: snapshot.id,
      createdAt: publishedAt
    });
    return record;
  }

  async function recordAcceptance({ rootUserId, accountId, pack, trackId = null, source = "pre_v1_free", acceptedAt = nowIso() }) {
    const snapshot = await archiveLicense(pack, acceptedAt);
    const acceptanceId = makeId("license_acceptance");
    const record = await store.insert({
      recordType: "LICENSE_ACCEPTANCE",
      id: acceptanceId,
      acceptanceId,
      userId: text(rootUserId, 180) || null,
      accountId: text(accountId, 180),
      artistId: text(pack?.accountId || pack?.artistAccountId || pack?.artistId, 180) || null,
      packId: text(pack?.id, 180),
      trackId: text(trackId, 180) || null,
      licenseVersion: snapshot.licenseVersion,
      licenseSnapshotId: snapshot.id,
      licenseHash: snapshot.licenseHash,
      packLicenseId: snapshot.packLicenseId,
      packLicenseVersion: snapshot.packLicenseVersion,
      acceptedAt,
      source: text(source, 80),
      firstDownloadId: null,
      legacyLicenseRecord: false,
      createdAt: acceptedAt
    });
    await audit("LICENSE_ACCEPTED", {
      userId: record.userId,
      accountId: record.accountId,
      artistId: record.artistId,
      packId: record.packId,
      trackId: record.trackId,
      acceptanceId,
      licenseVersion: record.licenseVersion,
      licenseHash: record.licenseHash,
      createdAt: acceptedAt
    });
    return record;
  }

  async function findLatestAcceptance({ accountId, packId, trackId = null }) {
    const records = await store.find({ recordType: "LICENSE_ACCEPTANCE", accountId: text(accountId, 180), packId: text(packId, 180) }, { limit: 100 });
    const exact = records.find((item) => String(item.trackId || "") === String(trackId || ""));
    if (exact) return exact;
    if (trackId) {
      return records.find((item) => !item.trackId) || null;
    }
    return null;
  }

  async function ensureLegacyDownload({ rootUserId, accountId, pack, trackId = null }) {
    const legacyKey = `legacy:${text(accountId, 180)}:${text(pack?.id, 180)}:${text(trackId, 180) || "pack"}`;
    return store.insert({
      recordType: "LEGACY_DOWNLOAD",
      id: makeId("legacy_download"),
      uniqueKey: legacyKey,
      userId: text(rootUserId, 180) || null,
      accountId: text(accountId, 180),
      artistId: text(pack?.accountId || pack?.artistAccountId || pack?.artistId, 180) || null,
      packId: text(pack?.id, 180),
      trackId: text(trackId, 180) || null,
      acceptedAt: null,
      licenseVersion: null,
      licenseHash: null,
      downloadId: null,
      legacyLicenseRecord: true,
      migrationNote: "Téléchargement antérieur détecté sans preuve serveur suffisante. Aucune acceptation ni date historique n’a été inventée.",
      observedAt: nowIso(),
      createdAt: nowIso()
    });
  }

  async function prepareDownload({ rootUserId, accountId, pack, trackId = null, acceptanceId = null, source = "download_page" }) {
    let acceptance = acceptanceId
      ? await store.findOne({ recordType: "LICENSE_ACCEPTANCE", acceptanceId: text(acceptanceId, 220) })
      : await findLatestAcceptance({ accountId, packId: pack?.id, trackId });

    if (acceptanceId && !acceptance) {
      const error = new Error("Acceptation de licence introuvable.");
      error.code = "LICENSE_ACCEPTANCE_INVALID";
      throw error;
    }

    const acceptanceTrackId = String(acceptance?.trackId || "");
    const requestedTrackId = String(trackId || "");
    const trackAcceptanceMismatch = acceptance
      ? (requestedTrackId
        ? Boolean(acceptanceTrackId && acceptanceTrackId !== requestedTrackId)
        : Boolean(acceptanceTrackId))
      : false;

    if (acceptance && (
      String(acceptance.accountId || "") !== String(accountId || "") ||
      String(acceptance.packId || "") !== String(pack?.id || "") ||
      trackAcceptanceMismatch
    )) {
      const error = new Error("Cette acceptation de licence ne correspond pas à ce téléchargement.");
      error.code = "LICENSE_ACCEPTANCE_MISMATCH";
      throw error;
    }

    const legacyLicenseRecord = !acceptance;
    if (!acceptance) {
      await ensureLegacyDownload({ rootUserId, accountId, pack, trackId });
    }

    const snapshot = acceptance
      ? await store.findOne({ recordType: "LICENSE_SNAPSHOT", id: acceptance.licenseSnapshotId })
      : null;
    const downloadId = makeId("download");
    const licenseReceiptId = makeId("license_receipt");
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(rawToken);
    const createdAt = nowIso();
    const files = fileEvidenceForItem(pack, trackId);

    const receipt = await store.insert({
      recordType: "LICENSE_RECEIPT",
      id: licenseReceiptId,
      licenseReceiptId,
      downloadId,
      userId: text(rootUserId, 180) || null,
      accountId: text(accountId, 180),
      artistId: text(pack?.accountId || pack?.artistAccountId || pack?.artistId, 180) || null,
      packId: text(pack?.id, 180),
      packTitleSnapshot: text(pack?.title || pack?.name, 240),
      trackId: text(trackId, 180) || null,
      trackTitleSnapshot: trackId
        ? text((pack?.tracks || []).find((item) => String(item?.id || "") === String(trackId))?.title, 240)
        : null,
      acceptanceId: acceptance?.acceptanceId || null,
      licenseVersion: acceptance?.licenseVersion || null,
      packLicenseId: acceptance?.packLicenseId || snapshot?.packLicenseId || null,
      packLicenseVersion: acceptance?.packLicenseVersion || snapshot?.packLicenseVersion || null,
      licenseHash: acceptance?.licenseHash || null,
      licenseSnapshotId: acceptance?.licenseSnapshotId || null,
      licenseTextSnapshot: snapshot?.licenseText || null,
      files,
      originalFileHash: files.length === 1 ? files[0].originalFileHash : null,
      originalFileHashes: files,
      legacyLicenseRecord,
      source: text(source, 80),
      tokenHash,
      tokenExpiresAt: new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS).toISOString(),
      status: "PREPARED",
      preparedAt: createdAt,
      deliveredAt: null,
      createdAt
    });

    if (acceptance && !acceptance.firstDownloadId) {
      await store.updateById(acceptance.id, { firstDownloadId: downloadId });
    }

    await audit("DOWNLOAD_PREPARED", {
      userId: receipt.userId,
      accountId: receipt.accountId,
      artistId: receipt.artistId,
      packId: receipt.packId,
      trackId: receipt.trackId,
      downloadId,
      licenseReceiptId,
      acceptanceId: receipt.acceptanceId,
      legacyLicenseRecord,
      createdAt
    });

    return { receipt, token: rawToken };
  }

  async function inspectDownloadToken(rawToken) {
    const tokenHash = sha256(text(rawToken, 200));
    const receipt = await store.findOne({ recordType: "LICENSE_RECEIPT", tokenHash });
    if (!receipt) return { ok: false, code: "DOWNLOAD_TOKEN_INVALID" };
    if (new Date(receipt.tokenExpiresAt || 0).getTime() < Date.now()) {
      return { ok: false, code: "DOWNLOAD_TOKEN_EXPIRED", receipt };
    }
    if (receipt.deliveredAt) {
      return { ok: false, code: "DOWNLOAD_TOKEN_USED", receipt };
    }
    return { ok: true, receipt };
  }

  async function consumeDownloadToken(rawToken) {
    const inspected = await inspectDownloadToken(rawToken);
    if (!inspected.ok) return inspected;
    const receipt = inspected.receipt;

    const deliveredAt = nowIso();
    const next = await store.updateById(receipt.id, {
      status: "DELIVERED",
      deliveredAt,
      accessCount: 1
    });
    await audit("DOWNLOAD_DELIVERED", {
      userId: receipt.userId,
      accountId: receipt.accountId,
      artistId: receipt.artistId,
      packId: receipt.packId,
      trackId: receipt.trackId,
      downloadId: receipt.downloadId,
      licenseReceiptId: receipt.licenseReceiptId,
      createdAt: deliveredAt
    });
    return { ok: true, receipt: next };
  }

  async function createIncident(input = {}) {
    const incidentId = makeId("rights_incident");
    const incidentType = INCIDENT_TYPES.includes(String(input.incidentType || ""))
      ? String(input.incidentType)
      : "UNAUTHORIZED_MUSIC_REPUBLICATION";
    const createdAt = nowIso();
    const externalUrl = text(input.externalUrl, 1200);
    if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
      throw new Error("L’URL externe doit commencer par http:// ou https://.");
    }
    const record = await store.insert({
      recordType: "RIGHTS_INCIDENT",
      id: incidentId,
      incidentId,
      incidentType,
      reportedUserId: text(input.reportedUserId, 180) || null,
      reportedAccountId: text(input.reportedAccountId, 180) || null,
      reporterUserId: text(input.reporterUserId, 180) || null,
      reporterAccountId: text(input.reporterAccountId, 180) || null,
      artistId: text(input.artistId, 180) || null,
      packId: text(input.packId, 180),
      trackId: text(input.trackId, 180) || null,
      downloadId: text(input.downloadId, 220) || null,
      externalPlatform: text(input.externalPlatform, 120),
      externalUrl,
      reason: text(input.reason, 1000),
      evidence: Array.isArray(input.evidence)
        ? input.evidence.map((item) => text(item, 1200)).filter(Boolean).slice(0, 20)
        : [text(input.evidence, 1200)].filter(Boolean),
      status: "PENDING",
      createdAt,
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: ""
    });
    await audit("RIGHTS_INCIDENT_CREATED", {
      incidentId,
      reporterUserId: record.reporterUserId,
      reporterAccountId: record.reporterAccountId,
      artistId: record.artistId,
      packId: record.packId,
      trackId: record.trackId,
      createdAt
    });
    return record;
  }

  async function reviewIncident(incidentId, { status, reviewedBy, reviewNotes = "" }) {
    const targetStatus = text(status, 40).toUpperCase();
    if (!INCIDENT_STATUSES.includes(targetStatus) || targetStatus === "PENDING") {
      throw new Error("Statut d’incident invalide.");
    }
    const incident = await store.findOne({ recordType: "RIGHTS_INCIDENT", incidentId: text(incidentId, 220) });
    if (!incident) throw new Error("Incident introuvable.");
    const reviewedAt = nowIso();
    const updated = await store.updateById(incident.id, {
      status: targetStatus,
      reviewedAt,
      reviewedBy: text(reviewedBy, 180) || "founder",
      reviewNotes: text(reviewNotes, 1200)
    });
    await audit("RIGHTS_INCIDENT_REVIEWED", {
      incidentId: incident.incidentId,
      status: targetStatus,
      reviewedBy: updated.reviewedBy,
      createdAt: reviewedAt
    });
    return updated;
  }

  async function createSanction({ incidentId, accountId, userId = null, level, reason, appliedBy, durationDays = null }) {
    const safeLevel = text(level, 50).toUpperCase();
    if (!SANCTION_LEVELS.includes(safeLevel)) throw new Error("Niveau de sanction invalide.");
    const incident = await store.findOne({ recordType: "RIGHTS_INCIDENT", incidentId: text(incidentId, 220) });
    if (!incident) throw new Error("Incident introuvable.");
    if (incident.status !== "CONFIRMED") {
      throw new Error("Une sanction de licence exige un incident confirmé humainement.");
    }
    if (incident.reportedAccountId && String(incident.reportedAccountId) !== String(accountId || "")) {
      throw new Error("La sanction ne correspond pas au compte signalé par cet incident.");
    }
    const appliedAt = nowIso();
    const sanctionId = makeId("license_sanction");
    const record = await store.insert({
      recordType: "LICENSE_SANCTION",
      id: sanctionId,
      sanctionId,
      incidentId: incident.incidentId,
      accountId: text(accountId, 180),
      userId: text(userId, 180) || null,
      level: safeLevel,
      reason: text(reason, 1200),
      appliedAt,
      appliedBy: text(appliedBy, 180) || "founder",
      durationDays: safeLevel === "TEMPORARY_SUSPENSION" ? Number(durationDays || 7) : null,
      status: "ACTIVE",
      createdAt: appliedAt
    });
    await audit("LICENSE_SANCTION_APPLIED", {
      incidentId: incident.incidentId,
      sanctionId,
      accountId: record.accountId,
      level: safeLevel,
      appliedBy: record.appliedBy,
      createdAt: appliedAt
    });
    return record;
  }

  async function accountEvidence(accountId, userId = null) {
    const id = text(accountId, 180);
    const records = await store.find({ accountId: id }, { limit: 300 });
    const reporterRecords = await store.find({ reporterAccountId: id }, { limit: 100 });
    const reportedRecords = await store.find({ reportedAccountId: id }, { limit: 100 });
    const incidents = [...records, ...reporterRecords, ...reportedRecords]
      .filter((item, index, all) => item.recordType === "RIGHTS_INCIDENT" && all.findIndex((x) => x.id === item.id) === index)
      .slice(0, 50);
    return {
      currentLicenseVersion: CURRENT_LICENSE_VERSION,
      downloads: records.filter((item) => item.recordType === "LICENSE_RECEIPT").slice(0, 50),
      acceptances: records.filter((item) => item.recordType === "LICENSE_ACCEPTANCE").slice(0, 50),
      legacyDownloads: records.filter((item) => item.recordType === "LEGACY_DOWNLOAD").slice(0, 50),
      incidents,
      sanctions: records.filter((item) => item.recordType === "LICENSE_SANCTION").slice(0, 50),
      userId: text(userId, 180) || null
    };
  }

  async function artistEvidence(artistId) {
    const id = text(artistId, 180);
    const records = await store.find({ artistId: id }, { limit: 500 });
    return {
      publications: records.filter((item) => item.recordType === "PACK_PUBLICATION_EVIDENCE"),
      rightsDeclarations: records.filter((item) => item.recordType === "RIGHTS_DECLARATION"),
      downloads: records.filter((item) => item.recordType === "LICENSE_RECEIPT"),
      incidents: records.filter((item) => item.recordType === "RIGHTS_INCIDENT"),
      audit: records.filter((item) => item.recordType === "AUDIT_EVENT")
    };
  }

  async function migrateLegacyDownloads({ rootUsers = [], packs = [] } = {}) {
    let observed = 0;
    for (const rootUser of Array.isArray(rootUsers) ? rootUsers : []) {
      for (const account of Array.isArray(rootUser?.accounts) ? rootUser.accounts : []) {
        const accountId = text(account?.accountId || account?.id, 180);
        if (!accountId) continue;
        for (const packId of Array.isArray(account?.downloadedPacks) ? account.downloadedPacks : []) {
          const pack = packs.find((item) => String(item?.id || "") === String(packId));
          if (!pack) continue;
          await ensureLegacyDownload({ rootUserId: rootUser?.id || rootUser?._id, accountId, pack, trackId: null });
          observed += 1;
        }
        for (const trackId of Array.isArray(account?.downloadedTracks) ? account.downloadedTracks : []) {
          const pack = packs.find((item) => Array.isArray(item?.tracks) && item.tracks.some((track) => String(track?.id || "") === String(trackId)));
          if (!pack) continue;
          await ensureLegacyDownload({ rootUserId: rootUser?.id || rootUser?._id, accountId, pack, trackId });
          observed += 1;
        }
      }
    }
    return { observed };
  }

  async function getIncident(incidentId) {
    return store.findOne({ recordType: "RIGHTS_INCIDENT", incidentId: text(incidentId, 220) });
  }

  async function findReceiptByDownloadId(downloadId) {
    return store.findOne({ recordType: "LICENSE_RECEIPT", downloadId: text(downloadId, 220) });
  }

  async function recordsByType(recordType, limit = 200) {
    return store.find({ recordType }, { limit });
  }

  return {
    constants: {
      CURRENT_LICENSE_VERSION,
      RIGHTS_DECLARATION_VERSION,
      LEGAL_TEXT_REVIEW_REQUIRED,
      FINGERPRINT_STATUS,
      INCIDENT_STATUSES,
      SANCTION_LEVELS,
      INCIDENT_TYPES
    },
    init: () => store.init(),
    archiveLicense,
    recordRightsDeclaration,
    recordPublication,
    recordAcceptance,
    findLatestAcceptance,
    ensureLegacyDownload,
    prepareDownload,
    inspectDownloadToken,
    consumeDownloadToken,
    createIncident,
    reviewIncident,
    createSanction,
    accountEvidence,
    artistEvidence,
    migrateLegacyDownloads,
    getIncident,
    findReceiptByDownloadId,
    recordsByType,
    audit
  };
}

module.exports = {
  CURRENT_LICENSE_VERSION,
  RIGHTS_DECLARATION_VERSION,
  LEGAL_TEXT_REVIEW_REQUIRED,
  FINGERPRINT_STATUS,
  INCIDENT_STATUSES,
  SANCTION_LEVELS,
  INCIDENT_TYPES,
  buildCanonicalLicenseText,
  buildLicenseSnapshot,
  hashFileSha256,
  createLicenseProtection
};
