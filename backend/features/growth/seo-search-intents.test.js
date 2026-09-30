const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const LANGS = ['en','sq','ar','tr','id','es','de','it','pt','nl','pl','ro','ru','zh','sw'];

test('entrée Sonara cible des recherches créateurs sans meta keywords', () => {
  const html = read('index.html');
  assert.match(html, /Musique pour vidéos et création de contenu/i);
  assert.match(html, /montage vidéo/i);
  assert.match(html, /jeu(?:x)? vidéo/i);
  assert.match(html, /rel="alternate" hreflang="en"/i);
  assert.doesNotMatch(html, /<meta\s+name="keywords"/i);
  assert.doesNotMatch(html, /pre-v1-cinematic/i);
});

test('15 entrées localisées sont indexables, canoniques et sans cinématique', () => {
  for (const lang of LANGS) {
    const rel = `seo-languages/${lang}/index.html`;
    const html = read(rel);
    assert.match(html, new RegExp(`<html[^>]+lang="${lang}"`, 'i'), rel);
    assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/i, rel);
    assert.ok(html.includes(`rel="canonical" href="https://sonarapack.com/${lang}/"`), rel);
    assert.match(html, /<title>[^<]{12,}<\/title>/i, rel);
    assert.doesNotMatch(html, /pre-v1-cinematic/i, rel);
  }
});

test('catalogue public expose des intentions de recherche visibles', () => {
  const renderer = read('netlify/functions/_organic-seo.js');
  const visibility = read('backend/features/growth/organic-visibility.js');
  assert.match(renderer, /Musique pour création de contenu et montage vidéo/);
  assert.match(renderer, /YouTube, TikTok, Instagram, films, jeux vidéo/);
  assert.match(visibility, /Musique pour vidéos, créateurs, films et jeux/);
  assert.match(visibility, /licensed music for videos, films, games and content creation/);
});
