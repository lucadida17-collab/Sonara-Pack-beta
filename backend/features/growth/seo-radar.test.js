const test = require('node:test');
const assert = require('node:assert/strict');
const { GOOGLE_INSPECTION_ENDPOINT, auditPage, classifyGoogleStatus, robotsAllowsPath, createGoogleClient } = require('./seo-radar');

test('robots autorise le catalogue public et bloque download', () => {
  const robots = `User-agent: *\nAllow: /\nDisallow: /download\nDisallow: /app/pages/account/\n`;
  assert.equal(robotsAllowsPath(robots, 'https://sonarapack.com/catalog/packs/pack_1', 'Googlebot'), true);
  assert.equal(robotsAllowsPath(robots, 'https://sonarapack.com/download?id=pack_1', 'Googlebot'), false);
});

test('statuts Google simplifiés', () => {
  assert.equal(classifyGoogleStatus({ verdict: 'PASS', coverageState: 'Submitted and indexed' }, {}).code, 'INDEXED');
  assert.equal(classifyGoogleStatus({ coverageState: 'Discovered - currently not indexed' }, {}).code, 'WAITING_FOR_CRAWL');
  assert.equal(classifyGoogleStatus({ coverageState: 'Crawled - currently not indexed', lastCrawlTime: '2026-09-08T00:00:00Z' }, { visibleTextLength: 900, structuredData: true }).code, 'CRAWLED_NOT_INDEXED');
  assert.equal(classifyGoogleStatus({ robotsTxtState: 'DISALLOWED', coverageState: 'Blocked by robots.txt' }, {}).code, 'TECHNICAL_ERROR');
});

test('audit Sonara valide une page pack SEO complète', async () => {
  const pageUrl = 'https://sonarapack.com/catalog/packs/pack_test';
  const imageUrl = 'https://cdn.example.com/cover.jpg';
  const html = `<!doctype html><html><head>
    <title>Test Pack – Cinematic Music | Sonara Pack</title>
    <meta name="description" content="A cinematic instrumental available on Sonara Pack under license for creative projects.">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta property="og:image" content="${imageUrl}">
    <link rel="canonical" href="${pageUrl}">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"MusicAlbum"}</script>
    </head><body><h1>Test Pack</h1><img class="public-catalog-cover" src="${imageUrl}" alt="Test Pack cinematic music" width="600" height="600"><p>${'cinematic music '.repeat(40)}</p></body></html>`;
  const parent = `<html><body><a href="${pageUrl}">Test Pack</a></body></html>`;
  const fakeFetch = async (url) => {
    const value = String(url);
    if (value === pageUrl) return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    if (value === imageUrl) return new Response('x', { status: 206, headers: { 'content-type': 'image/jpeg' } });
    if (value === 'https://sonarapack.com/catalog') return new Response(parent, { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('', { status: 404 });
  };
  const audit = await auditPage({
    fetchImpl: fakeFetch,
    page: { url: pageUrl, kind: 'pack', parentUrls: ['https://sonarapack.com/catalog'] },
    robotsText: 'User-agent: *\nAllow: /',
    sitemapXml: `<url><loc>${pageUrl}</loc><image:image><image:loc>${imageUrl}</image:loc></image:image></url>`
  });
  assert.equal(audit.httpStatus, 200);
  assert.equal(audit.noindex, false);
  assert.equal(audit.robotsAllowed, true);
  assert.equal(audit.sitemapDetected, true);
  assert.equal(audit.incomingLinkDetected, true);
  assert.equal(audit.imageSeoReady, true);
  assert.equal(audit.ready, true);
});


test('Search Console utilise URL Inspection officielle en lecture', async () => {
  const previous = {
    id: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID,
    secret: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET,
    refresh: process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN,
    site: process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL
  };
  process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID = 'client-test';
  process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET = 'secret-test';
  process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN = 'refresh-test';
  process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL = 'sc-domain:sonarapack.com';
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'token-test', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url) === GOOGLE_INSPECTION_ENDPOINT) return new Response(JSON.stringify({ inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  };
  try {
    const client = createGoogleClient({ environment: 'main', fetchImpl: fakeFetch });
    const result = await client.inspect('https://sonarapack.com/catalog/packs/pack_test');
    assert.equal(result.verdict, 'PASS');
    const inspectionCall = calls.find((call) => call.url === GOOGLE_INSPECTION_ENDPOINT);
    assert.ok(inspectionCall);
    const body = JSON.parse(inspectionCall.options.body);
    assert.equal(body.inspectionUrl, 'https://sonarapack.com/catalog/packs/pack_test');
    assert.equal(body.siteUrl, 'sc-domain:sonarapack.com');
    assert.equal(calls.some((call) => call.url.includes('indexing.googleapis.com')), false);
  } finally {
    if (previous.id === undefined) delete process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID; else process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID = previous.id;
    if (previous.secret === undefined) delete process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET; else process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET = previous.secret;
    if (previous.refresh === undefined) delete process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN; else process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN = previous.refresh;
    if (previous.site === undefined) delete process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL; else process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL = previous.site;
  }
});
