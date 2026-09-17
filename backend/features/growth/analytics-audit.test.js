const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizeAttribution,
  buildAnalyticsSnapshot,
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

test('E — Google Search est isolé de Direct', () => {
  const result = summarizeAttribution([record({
    firstTouch: { source: 'Google', landingPath: '/catalog', internalTraffic: false }
  })]);
  const google = result.bySource.find((row) => row.source === 'Google Search');
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


test('Temps réel — sessions, pages, pack, audio, CTA et téléchargement sont comptés sans trafic interne', () => {
  const now = new Date('2026-09-17T14:00:00.000Z');
  const events = [
    ['page_view', '13:55:00', '/catalog/packs/p1'],
    ['landing_page', '13:55:01', '/catalog/packs/p1'],
    ['pack_view', '13:55:02', '/catalog/packs/p1'],
    ['audio_play', '13:55:10', '/catalog/packs/p1'],
    ['cta_click', '13:55:20', '/catalog/packs/p1'],
    ['signup_completed', '13:55:30', '/app/pages/auth/pending.html'],
    ['download_completed', '13:55:40', '/app/pages/catalog/download.html']
  ].map(([eventType, time, pathname]) => ({
    visitorId: 'organic-live-visitor-0001',
    sessionId: 'session-live-0001',
    eventType,
    pathname,
    packId: eventType === 'pack_view' || eventType === 'audio_play' ? 'p1' : '',
    source: 'Google Search',
    capturedAt: `2026-09-17T${time}.000Z`,
    internalTraffic: false
  }));
  events.push({
    visitorId: 'organic-founder-visitor', sessionId: 'session-founder-0001', eventType: 'page_view',
    pathname: '/home.html', source: 'Direct', capturedAt: '2026-09-17T13:59:00.000Z', internalTraffic: true
  });

  const result = buildAnalyticsSnapshot(events, { now });
  assert.equal(result.periods.today.visitors, 1);
  assert.equal(result.periods.today.sessions, 1);
  assert.equal(result.periods.today.pageViews, 1);
  assert.equal(result.periods.today.packViews, 1);
  assert.equal(result.periods.today.audioPlays, 1);
  assert.equal(result.periods.today.ctaClicks, 1);
  assert.equal(result.periods.today.signups, 1);
  assert.equal(result.periods.today.downloads, 1);
  assert.equal(result.now.visitors, 1); // trafic externe récent actif ; trafic Founder exclu
});

test('Temps réel — Google Images reste distinct de Google Search dans l’acquisition', () => {
  const now = new Date('2026-09-17T14:00:00.000Z');
  const events = [
    { visitorId: 'organic-img-visitor-0001', sessionId: 'session-img-0001', eventType: 'page_view', pathname: '/catalog/packs/a', source: 'Google Images', capturedAt: '2026-09-17T13:59:30.000Z', internalTraffic: false },
    { visitorId: 'organic-search-visitor-1', sessionId: 'session-search-001', eventType: 'page_view', pathname: '/catalog/packs/b', source: 'Google Search', capturedAt: '2026-09-17T13:59:40.000Z', internalTraffic: false }
  ];
  const result = buildAnalyticsSnapshot(events, { now });
  const images = result.acquisition.find((row) => row.source === 'Google Images');
  const search = result.acquisition.find((row) => row.source === 'Google Search');
  assert.equal(images.sessions, 1);
  assert.equal(search.sessions, 1);
  assert.equal(result.now.visitors, 2);
});
