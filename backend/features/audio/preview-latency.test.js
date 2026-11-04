"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createPrivateMedia } = require("../../security/private-media");

const read = (file) => fs.readFileSync(path.resolve(__dirname, "../../..", file), "utf8");

test("Pack and artist pages do not wait 6 seconds for navigation", () => {
  const pack = read("app/js/catalog/pack.js");
  const artist = read("app/js/catalog/artist.js");
  assert.doesNotMatch(pack, /PACK_MIN_LOADING_TIME|waitForPackMinimum/);
  assert.doesNotMatch(artist, /ARTIST_PUBLIC_MIN_LOADING_MS|waitMinimum\?\./);
  assert.match(pack, /await Promise\.all\(\[/);
  assert.match(pack, /loadPack\(\{ render: false \}\)/);
  assert.match(pack, /if \(render\) renderPack\(\)/);
});

test("Only one pack preview is preloaded, with no autoplay or full-audio ticket", () => {
  const pack = read("app/js/catalog/pack.js");
  assert.match(pack, /audio\.preload = "auto"/);
  assert.match(pack, /const initialTrack = tracks\.find/);
  assert.match(pack, /api\/media\/preview\/\$\{encodeURIComponent\(warmPackId\)\}/);
  assert.match(pack, /navigator\.connection\?\.saveData !== true/);
  assert.doesNotMatch(pack.slice(pack.indexOf('const audio = new Audio();'), pack.indexOf('const miniPlayer =')), /audio\.play\(/);
  const local = read("server-local.js");
  const testServer = read("server-test.js");
  assert.match(local, /requestedPackId = String\(req\.query\?\.packId/);
  assert.match(testServer, /requestedPackId = String\(req\.query\?\.packId/);
  // Production still understands /api/packs?packId as the existing route,
  // even before the optional server-side filter is deployed there.
  assert.match(read("server.js"), /app\.get\("\/api\/packs",/);
});

test("Generated previews are cached and correctly invalidated by source rights/segment", async (t) => {
  const check = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (check.error || check.status !== 0) return t.skip("FFmpeg not installed");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sonara-preview-latency-test-"));
  const raw = path.join(folder, "sound.wav");
  const generated = [];
  try {
    const ff = spawnSync("ffmpeg", ["-v","error","-y","-f","lavfi","-i","sine=frequency=300:duration=35","-ar","22050",raw]);
    assert.equal(ff.status, 0, String(ff.stderr));
    const track = { id: "t", audioName: "audio/original.wav", previewStart: 2, previewDuration: 30, originalFileHash: "first" };
    const pack = { id: "p", status: "approved", tracks: [track] };
    let sourceReads = 0;
    const routes = new Map();
    const media = createPrivateMedia({
      readPacks: async () => [pack],
      getInput: async (_source, target) => { sourceReads++; fs.copyFileSync(raw, target); },
      sendOriginal: async () => {}, getAuthenticated: async () => null, getAccountById: async () => null
    });
    media.mount({get(route, handler) { routes.set(route, handler); },use() {}});
    const preview = routes.get("/api/media/preview/:packId/:trackId");
    assert.ok(preview);
    async function serve() {
      const response = {
        headers: {}, setHeader(k, v) { this.headers[k] = v; },
        sendFile(file) { generated.push(file); return file; },
        status(code) { throw Error("HTTP " + code); }
      };
      await preview({params:{packId:"p",trackId:"t"}}, response);
      assert.equal(response.headers["Content-Type"], "audio/mpeg");
      return generated.at(-1);
    }
    const first = await serve();
    assert.equal(sourceReads, 1);
    assert.ok(fs.statSync(first).size > 100000);
    const again = await serve();
    assert.equal(again, first, "cache hit reuses encoded preview");
    assert.equal(sourceReads, 1);
    track.previewStart = 3;
    const differentPassage = await serve();
    assert.notEqual(differentPassage, first);
    assert.equal(sourceReads, 2);
    track.originalFileHash = "changed";
    const differentOriginal = await serve();
    assert.notEqual(differentOriginal, differentPassage);
    assert.equal(sourceReads, 3);
  } finally {
    for (const out of new Set(generated)) {
      if (out.startsWith(os.tmpdir()) && out.includes("sonara-secure-preview-")) fs.rmSync(path.dirname(out), { recursive:true, force:true });
    }
    fs.rmSync(folder, {recursive:true, force:true});
  }
});
