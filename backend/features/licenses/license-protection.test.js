"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  CURRENT_LICENSE_VERSION,
  FINGERPRINT_STATUS,
  createLicenseProtection,
  hashFileSha256
} = require("./license-protection");
const { defaultPackLicense } = require("./pack-license");

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sonara-${label}-`));
}

function makePack(version = 1) {
  return {
    id: "pack_test_1",
    title: "Pack Test",
    accountId: "artist_acc_1",
    artistId: "artist_acc_1",
    status: "approved",
    submittedAt: "2026-08-18T10:00:00.000Z",
    publishedAt: "2026-08-18T11:00:00.000Z",
    license: {
      ...defaultPackLicense(),
      id: `pack_test_1:license:v${version}`,
      version,
      customTerms: version === 1 ? "Version initiale" : "Version modifiée"
    },
    tracks: [
      {
        id: "track_test_1",
        title: "Track Test",
        audioName: "track-test.wav",
        originalFileHash: "abc123",
        originalFileHashAlgorithm: "SHA-256",
        fingerprintStatus: FINGERPRINT_STATUS
      }
    ]
  };
}

async function createLocalService(label = "local") {
  const dir = tempDir(label);
  const service = createLicenseProtection({ environment: label, dataDir: dir });
  await service.init();
  return { dir, service };
}

test("A — publication: hash original + déclaration de droits + preuve de publication", async () => {
  const { dir, service } = await createLocalService("local-a");
  const audio = path.join(dir, "audio.bin");
  fs.writeFileSync(audio, Buffer.from("audio-original-sonara"));
  const hash = await hashFileSha256(audio);
  assert.match(hash, /^[a-f0-9]{64}$/);

  const pack = makePack(1);
  pack.tracks[0].originalFileHash = hash;
  const declaration = await service.recordRightsDeclaration({
    rootUserId: "user_root_1",
    artistId: "artist_acc_1",
    pack,
    acceptedAt: "2026-08-18T10:00:00.000Z"
  });
  const publication = await service.recordPublication({
    artistId: "artist_acc_1",
    pack,
    publishedAt: "2026-08-18T11:00:00.000Z"
  });

  assert.equal(declaration.legalTextStatus, "LEGAL_TEXT_REVIEW_REQUIRED");
  assert.equal(declaration.files[0].originalFileHash, hash);
  assert.equal(publication.files[0].originalFileHash, hash);
  assert.equal(publication.fingerprintStatus, "NOT_CONFIGURED");
});

test("B/C/D/E — acceptation versionnée, receipt, retéléchargement, ancienne licence conservée", async () => {
  const { service } = await createLocalService("local-b");
  const packV1 = makePack(1);
  const acceptanceV1 = await service.recordAcceptance({
    rootUserId: "user_root_1",
    accountId: "buyer_acc_1",
    pack: packV1,
    trackId: "track_test_1",
    acceptedAt: "2026-08-18T12:00:00.000Z"
  });

  assert.equal(acceptanceV1.licenseVersion, CURRENT_LICENSE_VERSION);
  assert.ok(acceptanceV1.licenseHash);

  const first = await service.prepareDownload({
    rootUserId: "user_root_1",
    accountId: "buyer_acc_1",
    pack: packV1,
    trackId: "track_test_1",
    acceptanceId: acceptanceV1.acceptanceId
  });
  assert.ok(first.receipt.downloadId);
  assert.ok(first.receipt.licenseReceiptId);
  assert.equal(first.receipt.acceptanceId, acceptanceV1.acceptanceId);
  assert.equal(first.receipt.originalFileHash, "abc123");
  const delivered = await service.consumeDownloadToken(first.token);
  assert.equal(delivered.ok, true);
  assert.equal(delivered.receipt.status, "DELIVERED");

  const second = await service.prepareDownload({
    rootUserId: "user_root_1",
    accountId: "buyer_acc_1",
    pack: packV1,
    trackId: "track_test_1"
  });
  assert.notEqual(second.receipt.downloadId, first.receipt.downloadId);
  assert.equal(second.receipt.acceptanceId, acceptanceV1.acceptanceId);

  const packV2 = makePack(2);
  const acceptanceV2 = await service.recordAcceptance({
    rootUserId: "user_root_1",
    accountId: "buyer_acc_1",
    pack: packV2,
    trackId: "track_test_1",
    acceptedAt: "2026-08-18T13:00:00.000Z"
  });
  assert.notEqual(acceptanceV2.licenseHash, acceptanceV1.licenseHash);

  const snapshots = await service.recordsByType("LICENSE_SNAPSHOT", 20);
  assert.ok(snapshots.some((item) => item.licenseHash === acceptanceV1.licenseHash));
  assert.ok(snapshots.some((item) => item.licenseHash === acceptanceV2.licenseHash));
});

test("acceptation pack couvre le retéléchargement d’une track du même pack", async () => {
  const { service } = await createLocalService("local-pack-track");
  const pack = makePack(1);
  const packAcceptance = await service.recordAcceptance({
    rootUserId: "root_pack",
    accountId: "account_pack",
    pack,
    trackId: null
  });

  const prepared = await service.prepareDownload({
    rootUserId: "root_pack",
    accountId: "account_pack",
    pack,
    trackId: "track_test_1"
  });

  assert.equal(prepared.receipt.acceptanceId, packAcceptance.acceptanceId);
  assert.equal(prepared.receipt.trackId, "track_test_1");
  assert.equal(prepared.receipt.legacyLicenseRecord, false);
});

test("un même pack peut être téléchargé par plusieurs comptes sans limite globale", async () => {
  const { service } = await createLocalService("local-multi-buyers");
  const pack = makePack(1);
  const downloadIds = new Set();
  const receiptIds = new Set();

  for (let index = 1; index <= 25; index += 1) {
    const accountId = `buyer_account_${index}`;
    const rootUserId = `buyer_root_${index}`;
    const acceptance = await service.recordAcceptance({
      rootUserId,
      accountId,
      pack,
      trackId: null
    });

    const prepared = await service.prepareDownload({
      rootUserId,
      accountId,
      pack,
      trackId: null,
      acceptanceId: acceptance.acceptanceId
    });

    assert.equal(prepared.receipt.packId, pack.id);
    assert.equal(prepared.receipt.accountId, accountId);
    assert.equal(prepared.receipt.acceptanceId, acceptance.acceptanceId);
    assert.equal(downloadIds.has(prepared.receipt.downloadId), false);
    assert.equal(receiptIds.has(prepared.receipt.licenseReceiptId), false);
    downloadIds.add(prepared.receipt.downloadId);
    receiptIds.add(prepared.receipt.licenseReceiptId);
  }

  assert.equal(downloadIds.size, 25);
  assert.equal(receiptIds.size, 25);
});

test("acceptanceId ne peut pas être réutilisé pour un autre compte", async () => {
  const { service } = await createLocalService("local-acceptance-guard");
  const pack = makePack(1);
  const acceptance = await service.recordAcceptance({
    rootUserId: "root_a",
    accountId: "account_a",
    pack,
    trackId: "track_test_1"
  });
  await assert.rejects(
    service.prepareDownload({
      rootUserId: "root_b",
      accountId: "account_b",
      pack,
      trackId: "track_test_1",
      acceptanceId: acceptance.acceptanceId
    }),
    /ne correspond pas/
  );
});

test("F/G — incident PENDING puis confirmation humaine et sanction", async () => {
  const { service } = await createLocalService("local-fg");
  const incident = await service.createIncident({
    reporterUserId: "artist_root",
    reporterAccountId: "artist_acc_1",
    reportedUserId: "buyer_root",
    reportedAccountId: "buyer_acc_1",
    artistId: "artist_acc_1",
    packId: "pack_test_1",
    trackId: "track_test_1",
    downloadId: "download_known",
    externalPlatform: "Spotify",
    externalUrl: "https://example.com/republication",
    reason: "Republication comme œuvre propre"
  });
  assert.equal(incident.status, "PENDING");
  const confirmed = await service.reviewIncident(incident.incidentId, {
    status: "CONFIRMED",
    reviewedBy: "founder"
  });
  assert.equal(confirmed.status, "CONFIRMED");
  const sanction = await service.createSanction({
    incidentId: incident.incidentId,
    accountId: "buyer_acc_1",
    userId: "buyer_root",
    level: "DOWNLOAD_RESTRICTED",
    reason: "Violation confirmée",
    appliedBy: "founder"
  });
  assert.equal(sanction.level, "DOWNLOAD_RESTRICTED");
  assert.equal(sanction.status, "ACTIVE");
});

test("H — incident rejeté: aucune sanction possible", async () => {
  const { service } = await createLocalService("local-h");
  const incident = await service.createIncident({
    reporterAccountId: "artist_acc_1",
    reportedAccountId: "buyer_acc_1",
    artistId: "artist_acc_1",
    packId: "pack_test_1",
    externalPlatform: "YouTube",
    externalUrl: "https://example.com/false-positive",
    reason: "À vérifier"
  });
  await service.reviewIncident(incident.incidentId, { status: "REJECTED", reviewedBy: "founder" });
  await assert.rejects(
    service.createSanction({
      incidentId: incident.incidentId,
      accountId: "buyer_acc_1",
      level: "WARNING",
      reason: "Ne doit pas passer",
      appliedBy: "founder"
    }),
    /incident confirmé/
  );
});

test("migration legacy — aucune acceptation ni date historique inventée", async () => {
  const { service } = await createLocalService("local-legacy");
  const pack = makePack(1);
  await service.migrateLegacyDownloads({
    rootUsers: [{
      id: "legacy_root",
      accounts: [{ accountId: "legacy_acc", downloadedPacks: [pack.id], downloadedTracks: [] }]
    }],
    packs: [pack]
  });
  const evidence = await service.accountEvidence("legacy_acc", "legacy_root");
  assert.equal(evidence.legacyDownloads.length, 1);
  assert.equal(evidence.legacyDownloads[0].acceptedAt, null);
  assert.equal(evidence.legacyDownloads[0].licenseVersion, null);
  assert.equal(evidence.legacyDownloads[0].legacyLicenseRecord, true);
});

test("I — Local / Test / Main restent séparés", async () => {
  const local = await createLocalService("local");
  const testEnv = await createLocalService("test");
  const main = await createLocalService("main");
  const pack = makePack(1);

  await local.service.recordAcceptance({ rootUserId: "root", accountId: "local_acc", pack });
  await testEnv.service.recordAcceptance({ rootUserId: "root", accountId: "test_acc", pack });
  await main.service.recordAcceptance({ rootUserId: "root", accountId: "main_acc", pack });

  assert.equal((await local.service.accountEvidence("local_acc")).acceptances.length, 1);
  assert.equal((await local.service.accountEvidence("test_acc")).acceptances.length, 0);
  assert.equal((await testEnv.service.accountEvidence("test_acc")).acceptances.length, 1);
  assert.equal((await testEnv.service.accountEvidence("main_acc")).acceptances.length, 0);
  assert.equal((await main.service.accountEvidence("main_acc")).acceptances.length, 1);
});
