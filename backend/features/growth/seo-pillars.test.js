const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGES = [
  ['how-it-works.html', '/how-it-works'],
  ['for-creators.html', '/for-creators'],
  ['for-artists.html', '/for-artists'],
  ['licensing.html', '/licensing'],
  ['pre-v1.html', '/pre-v1']
];

function attr(html, selectorRegex) {
  const match = html.match(selectorRegex);
  return match ? match[1] : '';
}

test('les 5 pages piliers sont publiques, complètes et indexables', () => {
  for (const [file, route] of PAGES) {
    const html = read(file);
    assert.match(html, /<title>[^<]{10,}<\/title>/i, file);
    assert.match(html, /<meta name="description" content="[^"]{40,}"/i, file);
    assert.match(html, new RegExp(`<link rel="canonical" href="https:\\/\\/sonarapack\\.com${route.replaceAll('/', '\\/')}"`, 'i'), file);
    assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large"/i, file);
    assert.match(html, /<h1>[^<]{8,}<\/h1>/i, file);
    assert.match(html, /<meta property="og:title"/i, file);
    assert.match(html, /<meta property="og:image" content="https:\/\/sonarapack\.com\/assets\/image\/logo-sonara-pack\.PNG"/i, file);
    assert.match(html, /<script type="application\/ld\+json">/i, file);
    assert.match(html, /href="\/index\.html"/i, file);
    assert.doesNotMatch(html, /data-public-catalog-load="true"|require\(|fetch\([^)]*login/i, file);
  }
});

test('les pages artistes, licensing et pre-v1 respectent le mode actuel', () => {
  const artists = read('for-artists.html');
  assert.match(artists, /Disponible maintenant en Pré-V1/);
  assert.match(artists, /Prévu pour la V1 \/ plus tard/);
  assert.match(artists, /paiements réels[^.]*restent désactivés/i);

  const licensing = read('licensing.html');
  for (const expected of ['non exclusif', 'non transférable', 'mondial', 'perpétuel', 'Content ID', 'sous-licence']) {
    assert.ok(licensing.toLocaleLowerCase('fr').includes(expected.toLocaleLowerCase('fr')), expected);
  }

  const preV1 = read('pre-v1.html');
  assert.match(preV1, /paiements Stripe[^.]*restent désactivés/i);
  assert.match(preV1, /MIDI/);
  assert.match(preV1, /DAW/);
});

test('sitemap et routes exposent les pages piliers uniquement sur Main', () => {
  const sitemap = read('sitemap-static.xml');
  const redirects = read('_redirects');
  for (const [, route] of PAGES) {
    assert.ok(sitemap.includes(`<loc>https://sonarapack.com${route}</loc>`), route);
    assert.match(redirects, new RegExp(`^${route.replaceAll('/', '\\/')}\\s+\\/${route.slice(1)}\\.html\\s+200$`, 'm'), route);
  }
  assert.doesNotMatch(sitemap, /localhost|127\.0\.0\.1|test\.|-test\.|\/test\//i);
  assert.match(sitemap, /https:\/\/sonarapack\.com\/assets\/image\/logo-sonara-pack\.PNG/);
});

test('Google Images réutilise le logo officiel, les covers et une galerie promo limitée', () => {
  const index = read('index.html');
  const renderer = read('netlify/functions/_organic-seo.js');
  const visibility = read('backend/features/growth/organic-visibility.js');

  assert.match(index, /"@type"\s*:\s*"Organization"/);
  assert.match(index, /"logo"\s*:\s*"https:\/\/sonarapack\.com\/assets\/image\/logo-sonara-pack\.PNG"/);
  assert.match(renderer, /class="public-catalog-cover"[^>]+alt="\$\{escapeHtml\(imageAlt\)\}"[^>]+width="600" height="600"/);
  assert.match(renderer, /public-catalog-visual-showcase/);
  assert.match(renderer, /rows\.filter\(\(pack\) => pack\?\.promoImageUrl && pack\?\.canonicalUrl\)\.slice\(0, 6\)/);
  assert.match(renderer, /href="\$\{escapeHtml\(pack\.canonicalUrl\)\}"/);
  assert.match(visibility, /const SEO_PROMO_IMAGE_LIMIT = 8;/);
  assert.match(visibility, /promoImageUrl/);
});

test('les 16 dictionnaires couvrent toutes les nouvelles chaînes piliers', () => {
  const sourceStrings = new Set();
  for (const [file] of PAGES) {
    const source = read(file)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    const patterns = [
      /<title>([\s\S]*?)<\/title>/gi,
      /<meta\s+name="description"\s+content="([^"]+)"/gi,
      /data-pillar-seo-title="([^"]+)"/gi,
      /data-pillar-seo-description="([^"]+)"/gi,
      /alt="([^"]+)"/gi,
      /aria-label="([^"]+)"/gi,
      />([^<>]+)</g
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source))) {
        const value = String(match[1] || '').replace(/\s+/g, ' ').trim();
        if (value) sourceStrings.add(value);
      }
    }
  }
  const languages = ['fr','en','sq','ar','tr','id','es','de','it','pt','nl','pl','ro','ru','zh','sw'];
  for (const language of languages) {
    const dictionary = JSON.parse(read(`app/lang/${language}.json`));
    const missing = [...sourceStrings].filter((value) => !Object.prototype.hasOwnProperty.call(dictionary, value));
    assert.deepEqual(missing, [], `${language}: ${missing.join(' | ')}`);
  }
});
