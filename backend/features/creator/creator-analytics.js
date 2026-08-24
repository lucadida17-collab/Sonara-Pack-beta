"use strict";

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function acquisitionAccountKey(rootUser, account, index = 0) {
  return String(
    account?.accountId ||
    account?.id ||
    account?.userId ||
    rootUser?.id ||
    `account-${index}`
  );
}

function appendAcquisitionHistory(account, {
  packId,
  trackId = null,
  resourceId = null,
  source = "free",
  acquiredAt = new Date().toISOString()
} = {}) {
  if (!account || !packId) return false;

  const normalizedPackId = String(packId);
  const normalizedTrackId = trackId ? String(trackId) : null;
  const normalizedResourceId = resourceId ? String(resourceId) : null;
  account.downloadHistory = Array.isArray(account.downloadHistory)
    ? account.downloadHistory
    : [];

  const alreadyRecorded = account.downloadHistory.some((entry) =>
    String(entry?.packId || "") === normalizedPackId &&
    String(entry?.trackId || "") === String(normalizedTrackId || "") &&
    String(entry?.resourceId || "") === String(normalizedResourceId || "")
  );

  if (alreadyRecorded) return false;

  account.downloadHistory.push({
    packId: normalizedPackId,
    trackId: normalizedTrackId,
    resourceId: normalizedResourceId,
    acquisitionType: normalizedTrackId ? "track" : normalizedResourceId ? "resource" : "pack",
    source: String(source || "free"),
    acquiredAt
  });

  // Garde un historique utile sans laisser grandir le document sans limite.
  if (account.downloadHistory.length > 500) {
    account.downloadHistory = account.downloadHistory.slice(-500);
  }

  return true;
}

function buildCreatorAcquisitionAnalytics(rootUsers, creatorPacks) {
  const packs = Array.isArray(creatorPacks) ? creatorPacks : [];
  const roots = Array.isArray(rootUsers) ? rootUsers : [];
  const packIds = new Set(packs.map((pack) => String(pack?.id || "")).filter(Boolean));
  const trackToPack = new Map();
  const resourceToPack = new Map();
  const statsByPack = new Map();

  packs.forEach((pack) => {
    const packId = String(pack?.id || "");
    if (!packId) return;

    const entry = {
      downloadCount: 0,
      packDownloadCount: 0,
      trackDownloadCount: 0,
      resourceDownloadCount: 0,
      uniqueDownloaders: 0,
      _audience: new Set()
    };
    statsByPack.set(packId, entry);

    (Array.isArray(pack?.tracks) ? pack.tracks : []).forEach((track) => {
      const trackId = String(track?.id || "").trim();
      if (trackId) trackToPack.set(trackId, packId);
    });
    (Array.isArray(pack?.resources) ? pack.resources : []).forEach((resource) => {
      const resourceId = String(resource?.id || "").trim();
      if (resourceId) resourceToPack.set(resourceId, packId);
    });
  });

  const globalAudience = new Set();
  const recentAcquisitions = [];

  roots.forEach((rootUser, rootIndex) => {
    const accounts = Array.isArray(rootUser?.accounts) ? rootUser.accounts : [];

    accounts.forEach((account, accountIndex) => {
      const accountKey = acquisitionAccountKey(
        rootUser,
        account,
        `${rootIndex}-${accountIndex}`
      );
      let touchedCreator = false;

      uniqueStrings(account?.downloadedPacks).forEach((downloadedPackId) => {
        const packStats = statsByPack.get(downloadedPackId);
        if (!packStats) return;

        packStats.packDownloadCount += 1;
        packStats.downloadCount += 1;
        packStats._audience.add(accountKey);
        touchedCreator = true;
      });

      uniqueStrings(account?.downloadedTracks).forEach((downloadedTrackId) => {
        const relatedPackId = trackToPack.get(downloadedTrackId);
        const packStats = relatedPackId ? statsByPack.get(relatedPackId) : null;
        if (!packStats) return;

        packStats.trackDownloadCount += 1;
        packStats.downloadCount += 1;
        packStats._audience.add(accountKey);
        touchedCreator = true;
      });
      uniqueStrings(account?.downloadedResources).forEach((downloadedResourceId) => {
        const relatedPackId = resourceToPack.get(downloadedResourceId);
        const packStats = relatedPackId ? statsByPack.get(relatedPackId) : null;
        if (!packStats) return;

        packStats.resourceDownloadCount += 1;
        packStats.downloadCount += 1;
        packStats._audience.add(accountKey);
        touchedCreator = true;
      });

      if (touchedCreator) globalAudience.add(accountKey);

      const userLabel = String(
        account?.pseudo ||
        account?.username ||
        account?.firstname ||
        account?.artistname ||
        "Utilisateur Sonara"
      ).trim();

      (Array.isArray(account?.downloadHistory) ? account.downloadHistory : [])
        .forEach((entry) => {
          const historyPackId = String(entry?.packId || "").trim();
          if (!packIds.has(historyPackId)) return;

          const trackId = entry?.trackId ? String(entry.trackId) : null;
          if (trackId && trackToPack.get(trackId) !== historyPackId) return;

          recentAcquisitions.push({
            packId: historyPackId,
            trackId,
            acquisitionType: trackId ? "track" : "pack",
            source: String(entry?.source || "free"),
            acquiredAt: entry?.acquiredAt || null,
            userLabel
          });
        });
    });
  });

  const byPack = {};
  let downloadCount = 0;
  let packDownloadCount = 0;
  let trackDownloadCount = 0;

  statsByPack.forEach((entry, packId) => {
    entry.uniqueDownloaders = entry._audience.size;
    delete entry._audience;
    byPack[packId] = entry;
    downloadCount += entry.downloadCount;
    packDownloadCount += entry.packDownloadCount;
    trackDownloadCount += entry.trackDownloadCount;
  });

  recentAcquisitions.sort((a, b) =>
    new Date(b.acquiredAt || 0) - new Date(a.acquiredAt || 0)
  );

  return {
    byPack,
    totals: {
      downloadCount,
      packDownloadCount,
      trackDownloadCount,
      uniqueAudienceCount: globalAudience.size
    },
    recentAcquisitions: recentAcquisitions.slice(0, 30)
  };
}

module.exports = {
  appendAcquisitionHistory,
  buildCreatorAcquisitionAnalytics
};
