const test = require('node:test');
const assert = require('node:assert/strict');
const human = require('./human-creation');

test('publication humaine obligatoire', () => {
  const denied = human.validateCreationProcess({ humanCreationConfirmed: false });
  assert.equal(denied.valid, false);
  assert.equal(denied.code, 'HUMAN_CREATION_DECLARATION_REQUIRED');
  const accepted = human.validateCreationProcess({ humanCreationConfirmed: true, aiAssistanceUsed: true, aiAssistanceType: 'mastering' });
  assert.equal(accepted.valid, true);
  assert.equal(accepted.value.aiAssistanceType, 'mastering');
});

test('les signaux techniques sont non conclusifs et ne décident jamais', () => {
  const signals = human.buildTechnicalSignals({
    creationProcess: { humanCreationConfirmed: true, instruments: ['Piano'], plugins: ['Kontakt'] },
    creationEvidence: [{ kind: 'midi', midiAnalysis: { noteCount: 840, velocityVariety: 17, notes: [{ note: 60, velocity: 80 }] } }],
    tracks: [{ duration: 120 }]
  });
  assert.equal(signals.automaticDecision, false);
  assert.equal(signals.label, 'Signal de détection automatique — non conclusif');
  assert.equal(signals.midiNoteCount, 840);
  assert.equal(signals.midiVelocityVariety, 17);
});

test('les données privées sont retirées du pack public', () => {
  const publicPack = human.publicPackWithoutPrivateEvidence({ id:'p1', title:'x', creationProcess:{daw:'FL Studio'}, creationEvidence:[{storageKey:'secret'}], humanModeration:{internalNote:'private'}, technicalModerationSignals:{x:1} });
  assert.equal(publicPack.title, 'x');
  assert.equal('creationProcess' in publicPack, false);
  assert.equal('creationEvidence' in publicPack, false);
  assert.equal('humanModeration' in publicPack, false);
});
