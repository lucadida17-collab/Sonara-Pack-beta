const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizeAttribution,
  excludedUserAgent
} = require('./organic-visibility');
const {
  applyPlatformReturnActivity,
  buildPlatformGrowth
} = require('./platform-growth');

function record(overrides = {}) {
  return {
    visitorId: 'organic-test-visitor-000001',
    firstTouch: { source: 'Direct', landingPath: '/', internalTraffic: false },
    lastTouch: { source: 'Direct', landingPath: '/', internalTraffic: false },
    firstSeenAt: '2026-09-10T10:00:00.000Z',
    lastSeenAt: '2026-09-10T10:05:00.000Z',
    visitCount: 1,
    internalVisitCount: 0,
    accountId: '',
    accountCreatedAt: '',
    linkedAt: '',
    signupAttributed: false,
    journey: [],
    ...overrides
  };
}

test('A/C — 10 refreshs du même visitorId = 1 visiteur unique et 10 pages publiques vues', () => {
  const result = summarizeAttribution([record({ visitCount: 10 })]);
  assert.equal(result.visitors, 1);
  assert.equal(result.pageViews, 10);
  assert.equal(result.visits, 10); // alias historique conservé
});

test('A — trafic Founder/interne marqué = 0 visiteur externe', () => {
  const result = summarizeAttribution([record({ visitCount: 10, internalVisitCount: 10 })]);
  assert.equal(result.visitors, 0);
  assert.equal(result.pageViews, 0);
  assert.equal(result.internalTraffic.visitors, 1);
  assert.equal(result.internalTraffic.pageViews, 10);
});

test('D — source TikTok conservée pour une inscription attribuée', () => {
  const result = summarizeAttribution([record({
    firstTouch: { source: 'TikTok', landingPath: '/?utm_source=TikTok', internalTraffic: false },
    accountId: 'acc_external_tiktok',
    accountCreatedAt: '2026-09-10T10:04:00.000Z',
    linkedAt: '2026-09-10T10:05:00.000Z',
    signupAttributed: true
  })]);
  const tiktok = result.bySource.find((row) => row.source === 'TikTok');
  assert.equal(tiktok.visitors, 1);
  assert.equal(tiktok.signups, 1);
  assert.equal(result.attributedSignups, 1);
});

test('E — source Google est isolée de Direct', () => {
  const result = summarizeAttribution([record({
    firstTouch: { source: 'Google', landingPath: '/catalog', internalTraffic: false }
  })]);
  const google = result.bySource.find((row) => row.source === 'Google');
  const direct = result.bySource.find((row) => row.source === 'Direct');
  assert.equal(google.visitors, 1);
  assert.equal(direct.visitors, 0);
});

test('G — Googlebot, Render healthcheck et curl sont exclus des visiteurs humains', () => {
  assert.equal(excludedUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(excludedUserAgent('Render-Health-Check/1.0'), true);
  assert.equal(excludedUserAgent('curl/8.7.1'), true);
  assert.equal(excludedUserAgent('Mozilla/5.0 Chrome/140 Safari/537.36'), false);
});

test('Sessions — un refresh rapproché ne crée pas une nouvelle session, 30 min d’inactivité oui', () => {
  const account = { createdAt: '2026-09-10T10:00:00.000Z' };
  const first = applyPlatformReturnActivity(account, new Date('2026-09-10T10:05:00.000Z'));
  assert.equal(first.newSession, true);
  assert.equal(first.sessionCount, 1);

  const refresh = applyPlatformReturnActivity(account, new Date('2026-09-10T10:10:00.000Z'));
  assert.equal(refresh.newSession, false);
  assert.equal(refresh.sessionCount, 1);

  const later = applyPlatformReturnActivity(account, new Date('2026-09-10T10:41:00.000Z'));
  assert.equal(later.newSession, true);
  assert.equal(later.sessionCount, 2);
});

test('Retours — un utilisateur n’est Returning que sur un jour postérieur à son inscription', async () => {
  const account = {
    accountId: 'acc_external_return',
    createdAt: '2026-09-09T10:00:00.000Z',
    platformActivityDays: ['2026-09-09', '2026-09-10']
  };
  const result = await buildPlatformGrowth({
    environment: 'test',
    getAccounts: async () => [account],
    getPacks: async () => [],
    financeApi: null,
    now: new Date('2026-09-10T12:00:00.000Z')
  });
  assert.equal(result.current.returningUsers, 1);
});

test('Google Search Console — hors Main/non configuré, impressions/clics restent indisponibles et ne sont pas inventés à 0', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createSeoRadar } = require('./seo-radar');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonara-seo-audit-'));
  try {
    const radar = createSeoRadar({
      environment: 'test',
      dataDir,
      publicOrigin: 'https://example.test',
      getPages: async () => [],
      fetchImpl: async () => { throw new Error('fetch should not run'); }
    });
    const snapshot = await radar.snapshot({ kickBackground: false });
    assert.equal(snapshot.google.enabled, false);
    assert.equal(snapshot.google.performance.available, false);
    assert.equal(Object.hasOwn(snapshot.google.performance, 'impressions'), false);
    assert.equal(Object.hasOwn(snapshot.google.performance, 'clicks'), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
