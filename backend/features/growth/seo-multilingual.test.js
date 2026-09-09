const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const LANGS = ['fr','en','sq','ar','tr','id','es','de','it','pt','nl','pl','ro','ru','zh','sw'];
const LOCALIZED = LANGS.filter((lang) => lang !== 'fr');
const PAGES = ['how-it-works','for-creators','for-artists','licensing','pre-v1'];
const origin = 'https://sonarapack.com';
const urlFor = (lang, page) => lang === 'fr' ? `${origin}/${page}` : `${origin}/${lang}/${page}`;

test('les 5 pages piliers exposent 16 variantes hreflang sans changer les URLs FR existantes', () => {
  for (const page of PAGES) {
    const html = read(`${page}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https:\\/\\/sonarapack\\.com\\/${page}"`, 'i'));
    for (const lang of LANGS) {
      assert.ok(html.includes(`hreflang="${lang}" href="${urlFor(lang, page)}"`), `${page}:${lang}`);
    }
    assert.ok(html.includes(`hreflang="x-default" href="${urlFor('fr', page)}"`), `${page}:x-default`);
  }
});

test('75 pages SEO localisées sont pré-rendues, indexables et fixes dans leur langue', () => {
  let count = 0;
  for (const lang of LOCALIZED) {
    for (const page of PAGES) {
      const rel = `seo-languages/${lang}/${page}.html`;
      assert.ok(fs.existsSync(path.join(ROOT, rel)), rel);
      const html = read(rel);
      count += 1;
      assert.match(html, new RegExp(`<html[^>]+lang="${lang}"`, 'i'), rel);
      if (lang === 'ar') assert.match(html, /<html[^>]+dir="rtl"/i, rel);
      assert.match(html, /<meta[^>]+content="index, follow, max-image-preview:large"[^>]+name="robots"/i, rel);
      assert.ok(html.includes(`href="${urlFor(lang, page)}" rel="canonical"`) || html.includes(`rel="canonical" href="${urlFor(lang, page)}"`), rel);
      assert.ok(html.includes(`content="${urlFor(lang, page)}" property="og:url"`) || html.includes(`property="og:url" content="${urlFor(lang, page)}"`), rel);
      assert.match(html, /<title>[^<]{6,}<\/title>/i, rel);
      assert.match(html, /<h1>[^<]{4,}<\/h1>/i, rel);
      assert.match(html, /href="\/index\.html"/i, rel);
      assert.doesNotMatch(html, /\/app\/js\/core\/i18n\.js|\/app\/js\/seo\/pillars\.js/i, rel);
      for (const sibling of PAGES) assert.ok(html.includes(`href="/${lang}/${sibling}"`), `${rel}->${sibling}`);
      for (const alternate of LANGS) assert.ok(html.includes(`hreflang="${alternate}"`), `${rel}:${alternate}`);
      assert.ok(html.includes('hreflang="x-default"'), `${rel}:x-default`);
      assert.match(html, new RegExp(`"inLanguage":"${lang}"`), rel);
    }
  }
  assert.equal(count, 75);
});

test('le sitemap static référence les 80 variantes piliers avec hreflang et aucune URL Local/Test', () => {
  const sitemap = read('sitemap-static.xml');
  assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  for (const page of PAGES) {
    for (const lang of LANGS) {
      assert.ok(sitemap.includes(`<loc>${urlFor(lang, page)}</loc>`), `${page}:${lang}`);
      assert.ok(sitemap.includes(`hreflang="${lang}" href="${urlFor(lang, page)}"`), `alternate:${page}:${lang}`);
    }
  }
  assert.doesNotMatch(sitemap, /localhost|127\.0\.0\.1|test\.|-test\.|\/test\//i);
});

test('les routes multilingues réutilisent les pages statiques sans toucher à index.html', () => {
  const redirects = read('_redirects');
  for (const page of PAGES) {
    assert.match(redirects, new RegExp(String.raw`^/:lang/${page}\s+/seo-languages/:lang/${page}\.html\s+200$`, 'm'), page);
    assert.match(redirects, new RegExp(String.raw`^/:lang/${page}\.html\s+/:lang/${page}\s+301!$`, 'm'), page);
  }
});
