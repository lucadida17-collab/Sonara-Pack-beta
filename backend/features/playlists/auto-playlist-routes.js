"use strict";

const { buildAutoPlaylists, findAutoPlaylist } = require("./auto-playlists");

function text(value) {
  return String(value ?? "").trim();
}

function isBlockedAccount(account = {}) {
  const accountStatus = text(account.status || "approved").toLowerCase();
  const artistStatus = text(account.artistStatus || "").toLowerCase();
  return ["banned", "suspended"].includes(accountStatus) ||
    ["banned", "suspended"].includes(artistStatus) ||
    account.licenseDownloadRestriction?.active === true;
}

function registerAutoPlaylistRoutes(app, options = {}) {
  const {
    getApprovedAudioPacks,
    findAccount,
    saveAccount,
    commercialPolicy,
    licenseProtection,
    appendAcquisitionHistory
  } = options;

  if (typeof getApprovedAudioPacks !== "function") {
    throw new TypeError("getApprovedAudioPacks requis pour les playlists Sonara.");
  }

  app.get("/api/auto-playlists", async (_req, res) => {
    try {
      const packs = await getApprovedAudioPacks();
      const payload = buildAutoPlaylists(packs);
      return res.json({
        success: true,
        ...payload,
        commercialState: {
          mode: commercialPolicy?.mode || commercialPolicy?.publicState?.().mode || "PRE_V1",
          paymentsActive: commercialPolicy?.paymentsActive === true
        }
      });
    } catch (error) {
      console.error("Playlists automatiques Sonara :", error);
      return res.status(500).json({ success: false, message: "Playlists Sonara indisponibles." });
    }
  });

  app.get("/api/auto-playlists/:playlistId", async (req, res) => {
    try {
      const packs = await getApprovedAudioPacks();
      const playlist = findAutoPlaylist(packs, req.params.playlistId);
      if (!playlist) {
        return res.status(404).json({ success: false, message: "Playlist Sonara introuvable." });
      }
      return res.json({
        success: true,
        playlist,
        commercialState: {
          mode: commercialPolicy?.publicState?.().mode || "PRE_V1",
          paymentsActive: commercialPolicy?.paymentsActive === true
        }
      });
    } catch (error) {
      console.error("Playlist automatique Sonara :", error);
      return res.status(500).json({ success: false, message: "Playlist Sonara indisponible." });
    }
  });

  app.post("/api/auto-playlists/:playlistId/acquire", async (req, res) => {
    try {
      const userId = text(req.body?.userId);
      const licensesAccepted = req.body?.licensesAccepted === true;

      if (!userId) {
        return res.status(400).json({ success: false, message: "Utilisateur manquant." });
      }
      if (!licensesAccepted) {
        return res.status(409).json({
          success: false,
          code: "PLAYLIST_LICENSES_REQUIRED",
          message: "Les licences des morceaux doivent être acceptées avant le téléchargement."
        });
      }

      /*
        En PRE_V1, l'acquisition gratuite existante reste la seule voie.
        En COMMERCIAL, aucune playlist multi-artistes ne doit contourner
        le checkout V1 : on renvoie uniquement le prix calculé.
      */
      if (commercialPolicy?.freeAcquisitionEnabled !== true || commercialPolicy?.paymentsActive === true) {
        const packs = await getApprovedAudioPacks();
        const playlist = findAutoPlaylist(packs, req.params.playlistId);
        return res.status(409).json({
          success: false,
          code: "PLAYLIST_COMMERCIAL_CHECKOUT_REQUIRED",
          message: "Cette playlist doit passer par le paiement V1.",
          pricing: playlist?.pricing || null
        });
      }

      if (
        typeof findAccount !== "function" ||
        typeof saveAccount !== "function" ||
        !licenseProtection ||
        typeof appendAcquisitionHistory !== "function"
      ) {
        return res.status(503).json({ success: false, message: "Acquisition playlist indisponible." });
      }

      const [packs, accountResult] = await Promise.all([
        getApprovedAudioPacks(),
        findAccount(userId)
      ]);
      const playlist = findAutoPlaylist(packs, req.params.playlistId);
      if (!playlist) {
        return res.status(404).json({ success: false, message: "Playlist Sonara introuvable." });
      }

      const account = accountResult?.account;
      if (!account) {
        return res.status(404).json({ success: false, message: "Compte utilisateur introuvable." });
      }
      if (!["user", "artist", "both"].includes(text(account.role).toLowerCase())) {
        return res.status(403).json({ success: false, message: "Ce compte ne peut pas télécharger." });
      }
      if (isBlockedAccount(account)) {
        return res.status(403).json({ success: false, code: "ACCOUNT_DOWNLOAD_BLOCKED", message: "Ce compte ne peut pas télécharger actuellement." });
      }

      const packsById = new Map(packs.map((pack) => [text(pack.id), pack]));
      account.downloadedTracks = Array.isArray(account.downloadedTracks) ? account.downloadedTracks : [];
      const alreadyOwned = new Set(account.downloadedTracks.map((id) => text(id)));
      const preparedDownloads = [];
      let acquisitionsAdded = 0;

      for (const playlistTrack of playlist.tracks) {
        const pack = packsById.get(text(playlistTrack.packId));
        const trackId = text(playlistTrack.trackId);
        const track = Array.isArray(pack?.tracks)
          ? pack.tracks.find((item) => text(item?.id) === trackId)
          : null;
        if (!pack || !track) continue;

        const acceptance = await licenseProtection.recordAcceptance({
          rootUserId: text(accountResult.rootUser?.id || accountResult.rootUser?._id),
          accountId: text(account.accountId || account.id || userId),
          pack,
          trackId,
          source: "auto_playlist_pre_v1"
        });

        if (!alreadyOwned.has(trackId)) {
          account.downloadedTracks.push(trackId);
          alreadyOwned.add(trackId);
          acquisitionsAdded += 1;
          appendAcquisitionHistory(account, {
            packId: text(pack.id),
            trackId,
            source: "auto_playlist_pre_v1"
          });
        }

        const prepared = await licenseProtection.prepareDownload({
          rootUserId: text(accountResult.rootUser?.id || accountResult.rootUser?._id),
          accountId: text(account.accountId || account.id || userId),
          pack,
          trackId,
          acceptanceId: acceptance.acceptanceId,
          source: "auto_playlist_pre_v1"
        });

        preparedDownloads.push({
          packId: text(pack.id),
          trackId,
          title: text(track.title || pack.title || "Track Sonara"),
          fileUrl: `/api/downloads/file/${encodeURIComponent(prepared.token)}`
        });
      }

      await saveAccount(accountResult.rootUser, account);

      return res.json({
        success: true,
        playlistId: playlist.id,
        acquisitionsAdded,
        downloadCount: preparedDownloads.length,
        downloads: preparedDownloads
      });
    } catch (error) {
      console.error("Acquisition playlist Sonara :", error);
      return res.status(500).json({ success: false, message: "Impossible de préparer cette playlist." });
    }
  });
}

module.exports = { registerAutoPlaylistRoutes };
