const crypto = require('crypto');

const HUMAN_DECLARATION_VERSION = 1;
const AI_ASSISTANCE_TYPES = new Set([
  'none', 'mastering', 'cleanup', 'correction', 'stem-separation', 'technical', 'other'
]);
const MODERATION_STATES = new Set([
  'pending', 'approved', 'rejected', 'information_requested', 'on_hold', 'suspect'
]);

function text(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function list(value, maxItems = 30, maxLength = 100) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,\n;]/g);
  return [...new Set(source.map(item => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalizeCreationProcess(input = {}) {
  const aiUsed = input.aiAssistanceUsed === true;
  let aiType = text(input.aiAssistanceType || (aiUsed ? 'other' : 'none'), 40).toLowerCase();
  if (!AI_ASSISTANCE_TYPES.has(aiType)) aiType = aiUsed ? 'other' : 'none';
  if (!aiUsed) aiType = 'none';

  return {
    declarationVersion: HUMAN_DECLARATION_VERSION,
    humanCreationConfirmed: input.humanCreationConfirmed === true,
    daw: text(input.daw, 100),
    instruments: list(input.instruments),
    plugins: list(input.plugins),
    midiPresent: input.midiPresent === true,
    aiAssistanceUsed: aiUsed,
    aiAssistanceType: aiType,
    aiAssistanceDetails: text(input.aiAssistanceDetails, 700),
    processComment: text(input.processComment, 1600),
    declaredAt: text(input.declaredAt, 60) || new Date().toISOString()
  };
}

function validateCreationProcess(input = {}) {
  const value = normalizeCreationProcess(input);
  if (!value.humanCreationConfirmed) {
    return { valid: false, code: 'HUMAN_CREATION_DECLARATION_REQUIRED', message: 'La déclaration de création humaine est obligatoire avant publication.' };
  }
  if (value.aiAssistanceUsed && value.aiAssistanceType === 'none') {
    return { valid: false, code: 'AI_ASSISTANCE_TYPE_REQUIRED', message: 'Précise le type d’aide IA utilisé.' };
  }
  return { valid: true, value };
}

function evidenceId() {
  return `evidence_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function normalizeEvidenceMeta(input = {}) {
  return {
    id: text(input.id, 100) || evidenceId(),
    kind: text(input.kind || 'other', 40).toLowerCase(),
    originalName: text(input.originalName, 240),
    mimeType: text(input.mimeType, 120),
    size: Math.max(0, Number(input.size) || 0),
    storageKey: text(input.storageKey, 800),
    uploadedAt: text(input.uploadedAt, 60) || new Date().toISOString(),
    midiAnalysis: input.midiAnalysis && typeof input.midiAnalysis === 'object' ? input.midiAnalysis : null
  };
}

function buildTechnicalSignals(pack = {}) {
  const creation = normalizeCreationProcess(pack.creationProcess || {});
  const evidence = Array.isArray(pack.creationEvidence) ? pack.creationEvidence : [];
  const midi = evidence.map(item => item?.midiAnalysis).filter(Boolean);
  const notes = midi.flatMap(item => Array.isArray(item.notes) ? item.notes : []);
  const midiNoteCount = midi.reduce((sum, item) => sum + Math.max(0, Number(item?.noteCount) || (Array.isArray(item?.notes) ? item.notes.length : 0)), 0);
  const velocityVariety = Math.max(
    ...midi.map(item => Math.max(0, Number(item?.velocityVariety) || 0)),
    [...new Set(notes.map(note => Number(note?.velocity)).filter(Number.isFinite))].length,
    0
  );
  const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
  return {
    label: 'Signal de détection automatique — non conclusif',
    automaticDecision: false,
    midiProvided: midi.length > 0 || creation.midiPresent,
    midiFiles: midi.length,
    midiNoteCount,
    midiVelocityVariety: velocityVariety,
    stemsProvided: evidence.some(item => String(item?.kind || '').toLowerCase() === 'stems'),
    projectProvided: evidence.some(item => String(item?.kind || '').toLowerCase() === 'project'),
    declaredInstrumentCount: creation.instruments.length,
    declaredPluginCount: creation.plugins.length,
    trackCount: tracks.length,
    durationSeconds: tracks.reduce((sum, track) => sum + Math.max(0, Number(track?.duration) || 0), 0),
    aiAssistanceDeclared: creation.aiAssistanceUsed,
    aiAssistanceType: creation.aiAssistanceType,
    generatedAt: new Date().toISOString()
  };
}

function appendModerationEvent(pack = {}, event = {}) {
  const history = Array.isArray(pack.humanModeration?.history) ? [...pack.humanModeration.history] : [];
  history.push({
    id: `review_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    type: text(event.type || 'decision', 50),
    state: text(event.state || 'pending', 50),
    note: text(event.note, 1800),
    author: text(event.author || 'moderation', 120),
    createdAt: new Date().toISOString()
  });
  return history.slice(-150);
}

function publicPackWithoutPrivateEvidence(pack = {}) {
  const clone = { ...pack };
  delete clone.creationEvidence;
  delete clone.creationEvidenceKinds;
  delete clone.creationProcess;
  delete clone.humanModeration;
  delete clone.technicalModerationSignals;
  return clone;
}

module.exports = {
  HUMAN_DECLARATION_VERSION,
  MODERATION_STATES,
  normalizeCreationProcess,
  validateCreationProcess,
  normalizeEvidenceMeta,
  buildTechnicalSignals,
  appendModerationEvent,
  publicPackWithoutPrivateEvidence
};
