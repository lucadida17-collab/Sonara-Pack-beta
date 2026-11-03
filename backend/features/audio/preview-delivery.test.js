"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const project = path.resolve(__dirname, "../../..");
const read = (name) => fs.readFileSync(path.join(project, name), "utf8");

test("all public discovery previews use the protected server-generated audio route", () => {
  const server = read("backend/features/growth/organic-visibility.js");
  assert.match(server, /function previewUrl\(req, packId, trackId/);
  // Founder moderation retains its existing source for unpublished packs.
  assert.match(server, /previewAudioUrl: mediaUrl\(req, track\.audioName\)/);
  const publicUrlAssignments = server.match(/previewAudioUrl: previewUrl\(req,/g) || [];
  assert.equal(publicUrlAssignments.length, 2);
  assert.match(server, /previewAudioUrl: previewTrack \? previewUrl\(req, normalized\.id, previewTrack\.id/);
  assert.match(server, /previewAudioUrl: previewUrl\(req, normalizedPack\.id, normalizedTrack\.id/);
});

test("catalogue, artist and home use processed preview, never the full-audio ticket", () => {
  const pack = read("app/js/catalog/pack.js");
  const artist = read("app/js/catalog/artist.js");
  const home = read("app/js/home/home.js");
  const catalog = read("app/js/catalog/public-catalog.js");
  assert.match(pack, /const previewPackId = track\.sourcePackId \|\| packData\?\.id/);
  assert.match(pack, /\/api\/media\/preview\/\$\{encodeURIComponent\(previewPackId\)\}/);
  assert.match(artist, /\/api\/media\/preview\/\$\{encodeURIComponent\(pack\.id\)\}/);
  assert.match(home, /const previewTrackId = track\.trackId \|\| track\.id/);
  assert.match(home, /\/api\/media\/preview\/\$\{encodeURIComponent\(previewPackId\)\}/);
  assert.match(catalog, /const requestedStart = processedPreview \? 0 :/);
});

test("server exports faded 30s previews, and full playback is served separately", () => {
  const media = read("backend/security/private-media.js");
  const renderer = read("backend/features/audio/preview-export.js");
  assert.match(media, /renderAudioPreview\(\{inputPath:input,outputPath:output,start,duration\}\)/);
  assert.match(media, /app\.get\("\/api\/media\/preview\/:packId\/:trackId",preview\)/);
  assert.match(media, /app\.get\("\/api\/media\/full\/:ticket",full\)/);
  assert.match(renderer, /const fadeInDuration = Math\.min\(5, safeDuration \/ 2\)/);
  assert.match(renderer, /const fadeOutDuration = Math\.min\(5, safeDuration \/ 2\)/);
});
