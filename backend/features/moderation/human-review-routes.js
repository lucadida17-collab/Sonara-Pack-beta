const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildTechnicalSignals, appendModerationEvent, MODERATION_STATES } = require('./human-creation');

function registerHumanCreationReviewRoutes(options = {}) {
  const { app, packsCollection = null, packsPath = '', environment = 'local', getRemoteObject = null, localEvidenceDir = '' } = options;
  if (!app) throw new Error('Human moderation: app manquante.');
  const isMongo = Boolean(packsCollection);
  const dataPath = packsPath ? path.resolve(packsPath) : '';

  const clean = doc => { if (!doc) return doc; const { _id, ...rest } = doc; return rest; };
  const readPacks = async () => {
    if (isMongo) return packsCollection.find({ moderationHidden: { $ne: true } }).toArray();
    try { return JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]'); } catch { return []; }
  };
  const getPack = async id => {
    if (isMongo) return packsCollection.findOne({ id: String(id) });
    return (await readPacks()).find(pack => String(pack?.id || '') === String(id)) || null;
  };
  const savePack = async pack => {
    if (isMongo) {
      const { _id, ...set } = pack;
      await packsCollection.updateOne({ id: String(pack.id) }, { $set: set });
      return getPack(pack.id);
    }
    const packs = await readPacks();
    const index = packs.findIndex(item => String(item?.id || '') === String(pack.id));
    if (index < 0) return null;
    packs[index] = pack;
    fs.writeFileSync(dataPath, JSON.stringify(packs, null, 2), 'utf8');
    return pack;
  };

  function requireFounderKey(req, res, next) {
    const expected = String(process.env.FOUNDER_ACCESS_KEY || '').trim();
    const received = String(req.get('x-founder-key') || '').trim();
    const valid = expected && received && expected.length === received.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    if (!expected) return res.status(503).json({ success: false, message: 'FOUNDER_ACCESS_KEY absente sur Sonara.' });
    if (!valid) return res.status(401).json({ success: false, message: 'Clé Founder invalide.' });
    next();
  }

  function moderationView(pack, allPacks) {
    const evidence = (Array.isArray(pack.creationEvidence) ? pack.creationEvidence : []).map(item => ({
      id: item.id,
      kind: item.kind,
      originalName: item.originalName,
      mimeType: item.mimeType,
      size: item.size,
      uploadedAt: item.uploadedAt,
      midiAnalysis: item.midiAnalysis || null,
      url: `/api/moderation/human-creation/packs/${encodeURIComponent(pack.id)}/evidence/${encodeURIComponent(item.id)}`
    }));
    const artistPacks = allPacks.filter(item => String(item?.artistId || '') === String(pack?.artistId || ''));
    return {
      ...clean(pack),
      creationEvidence: evidence,
      technicalModerationSignals: buildTechnicalSignals(pack),
      artistHistory: {
        totalSubmissions: artistPacks.length,
        approved: artistPacks.filter(item => String(item?.status) === 'approved').length,
        rejected: artistPacks.filter(item => String(item?.status) === 'rejected').length,
        suspect: artistPacks.filter(item => String(item?.humanModeration?.state) === 'suspect').length
      },
      tracks: (Array.isArray(pack.tracks) ? pack.tracks : []).map(track => ({
        ...track,
        moderationAudioUrl: track?.audioName ? `/uploads/${String(track.audioName).replace(/^\/+/, '')}` : ''
      }))
    };
  }

  app.get('/api/moderation/human-creation/packs', requireFounderKey, async (_req, res) => {
    try {
      const packs = await readPacks();
      const items = packs
        .filter(pack => {
          const state = String(pack?.humanModeration?.state || 'pending');
          return String(pack?.status || '') === 'pending' || ['information_requested', 'on_hold', 'suspect'].includes(state);
        })
        .sort((a, b) => String(a.submittedAt || a.createdAt || '').localeCompare(String(b.submittedAt || b.createdAt || '')))
        .map(pack => moderationView(pack, packs));
      res.json({ success: true, environment, items });
    } catch (error) {
      console.error('Human moderation list:', error);
      res.status(500).json({ success: false, message: 'Impossible de charger la modération qualitative.' });
    }
  });

  app.get('/api/moderation/human-creation/packs/:packId/evidence/:evidenceId', requireFounderKey, async (req, res) => {
    try {
      const pack = await getPack(req.params.packId);
      const evidence = (Array.isArray(pack?.creationEvidence) ? pack.creationEvidence : [])
        .find(item => String(item?.id || '') === String(req.params.evidenceId));
      if (!pack || !evidence?.storageKey) return res.status(404).json({ success: false, message: 'Justificatif introuvable.' });
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${String(evidence.originalName || 'evidence').replace(/["\r\n]/g, '')}"`);
      if (typeof getRemoteObject === 'function') {
        const object = await getRemoteObject(evidence.storageKey);
        if (!object?.Body || typeof object.Body.pipe !== 'function') throw new Error('Flux justificatif indisponible.');
        return object.Body.pipe(res);
      }
      const filePath = path.join(localEvidenceDir || path.join(process.cwd(), 'data', 'moderation-evidence'), path.basename(String(evidence.storageKey)));
      if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Justificatif introuvable.' });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('Human moderation evidence:', error);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Justificatif indisponible.' });
    }
  });

  app.patch('/api/moderation/human-creation/packs/:packId/review', requireFounderKey, async (req, res) => {
    try {
      const state = String(req.body?.state || '').trim();
      if (!MODERATION_STATES.has(state)) return res.status(400).json({ success: false, message: 'Décision qualitative invalide.' });
      const pack = await getPack(req.params.packId);
      if (!pack) return res.status(404).json({ success: false, message: 'Pack introuvable.' });
      const note = String(req.body?.note || '').trim().slice(0, 1800);
      const previous = pack.humanModeration && typeof pack.humanModeration === 'object' ? pack.humanModeration : {};
      const requests = Array.isArray(previous.requests) ? [...previous.requests] : [];
      if (state === 'information_requested') {
        requests.push({
          id: `request_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          question: note || 'La modération demande des informations supplémentaires sur le processus de création.',
          response: '',
          status: 'open',
          requestedAt: new Date().toISOString(),
          respondedAt: null
        });
      }
      pack.humanModeration = {
        ...previous,
        state,
        internalNote: note || previous.internalNote || '',
        reviewedAt: new Date().toISOString(),
        requests: requests.slice(-50),
        history: appendModerationEvent(pack, { type: 'review', state, note })
      };
      pack.technicalModerationSignals = buildTechnicalSignals(pack);
      const saved = await savePack(pack);
      res.json({ success: true, pack: moderationView(saved, await readPacks()) });
    } catch (error) {
      console.error('Human moderation review:', error);
      res.status(500).json({ success: false, message: 'Impossible d’enregistrer la review.' });
    }
  });

  app.get('/api/packs/:packId/moderation-request', async (req, res) => {
    const pack = await getPack(req.params.packId);
    if (!pack || String(pack.artistId || '') !== String(req.query.accountId || '')) return res.status(404).json({ success: false });
    const requests = Array.isArray(pack.humanModeration?.requests) ? pack.humanModeration.requests : [];
    res.json({ success: true, requests: requests.map(({ id, question, response, status, requestedAt, respondedAt }) => ({ id, question, response, status, requestedAt, respondedAt })) });
  });

  app.post('/api/packs/:packId/moderation-response', async (req, res) => {
    try {
      const pack = await getPack(req.params.packId);
      const accountId = String(req.body?.accountId || '');
      if (!pack || String(pack.artistId || '') !== accountId) return res.status(403).json({ success: false, message: 'Ce pack ne vous appartient pas.' });
      const response = String(req.body?.response || '').trim().slice(0, 2200);
      if (!response) return res.status(400).json({ success: false, message: 'Réponse vide.' });
      const requests = Array.isArray(pack.humanModeration?.requests) ? [...pack.humanModeration.requests] : [];
      const index = [...requests].map((item, i) => ({ item, i })).reverse().find(({ item }) => item?.status === 'open')?.i;
      if (index == null) return res.status(409).json({ success: false, message: 'Aucune demande ouverte.' });
      requests[index] = { ...requests[index], response, status: 'answered', respondedAt: new Date().toISOString() };
      pack.humanModeration = {
        ...(pack.humanModeration || {}),
        state: 'pending',
        requests,
        history: appendModerationEvent(pack, { type: 'artist_response', state: 'pending', note: response, author: accountId })
      };
      await savePack(pack);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Réponse non enregistrée.' });
    }
  });
}

module.exports = { registerHumanCreationReviewRoutes };
