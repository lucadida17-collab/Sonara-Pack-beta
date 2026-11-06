"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../..");
const LIBRARIES = ["app/js/catalog/library.js", "app/js/user/library/index.js"];

function setupLibrary(relativePath, fetchStub) {
  const content = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const begin = content.indexOf("// A full-file ticket expires after 20 minutes.");
  const end = content.indexOf("let packs = [];", begin);
  assert.ok(begin >= 0 && end > begin, "Recovery routines are installed");
  const diagnostics = [];
  const alerts = [];
  const context = {
    fetch: fetchStub,
    API_URL: "https://api.example.test",
    getFilePath: (src) => `https://api.example.test${src}`,
    reportLibraryAudioError: (...args) => alerts.push(args),
    console: { warn(...args) { diagnostics.push(args); } },
    WeakMap,
    Error
  };
  vm.createContext(context);
  vm.runInContext(content.slice(begin, end) + "\nthis.testRecovery = { recoverLibraryAudioFailure, startLibraryAudio };", context);
  const row = { dataset: { packId: "pack_12", trackId: "track_34" } };
  const audio = {
    src: "https://api.example.test/api/media/full/old-ticket",
    currentSrc: "https://api.example.test/api/media/full/old-ticket",
    dataset: {},
    isConnected: true,
    error: { code: 4 },
    getAttribute(key) { return key === "src" ? this.src : null; },
    closest() { return row; },
    loadCount: 0,
    playCount: 0,
    load() { this.loadCount++; },
    play() { this.playCount++; return Promise.resolve(); }
  };
  return { ...context.testRecovery, audio, diagnostics, alerts, content };
}

for (const file of LIBRARIES) {
  test(`${file}: expired full ticket is renewed only as another full ticket`, async () => {
    let rangeChecks = 0;
    let catalogueChecks = 0;
    const library = setupLibrary(file, async (url, opts) => {
      if (url.includes("/api/media/full/")) {
        rangeChecks++;
        assert.equal(opts.headers.Range, "bytes=0-1");
        return { status: 403, body: { async cancel() {} } };
      }
      catalogueChecks++;
      assert.ok(url.includes("packId=pack_12"));
      return {
        ok: true,
        async json() { return [{ id:"pack_12", tracks:[{id:"track_34",audioName:"/api/media/full/new-ticket"}] }]; }
      };
    });
    await library.recoverLibraryAudioFailure(library.audio, { name:"NotSupportedError" });
    assert.equal(rangeChecks, 1);
    assert.equal(catalogueChecks, 1);
    assert.equal(library.audio.src, "https://api.example.test/api/media/full/new-ticket");
    assert.equal(library.audio.loadCount, 1);
    assert.equal(library.audio.playCount, 1);
    assert.equal(library.alerts.length, 0);
  });

  test(`${file}: missing original stays a hard failure, no preview fallback`, async () => {
    let catalogueChecks = 0;
    const library = setupLibrary(file, async (url) => {
      if (url.includes("/api/packs")) catalogueChecks++;
      return { status:404, body:{ async cancel() {} } };
    });
    await library.recoverLibraryAudioFailure(library.audio, { name:"NotSupportedError" });
    assert.equal(catalogueChecks, 0);
    assert.equal(library.audio.src, "https://api.example.test/api/media/full/old-ticket");
    assert.equal(library.alerts.length, 1);
    assert.ok(library.diagnostics.some((args) => args[1]?.httpStatus === 404));
  });

  test(`${file}: never use a preview as an expired full-ticket replacement`, async () => {
    const library = setupLibrary(file, async (url) => {
      if (url.includes("/api/media/full/")) return { status:403, body:{ async cancel() {} } };
      return { ok:true, async json() { return [{ id:"pack_12", tracks:[{id:"track_34",audioName:"/api/media/preview/pack_12/track_34"}] }]; } };
    });
    await library.recoverLibraryAudioFailure(library.audio, new Error("play failed"));
    assert.equal(library.audio.loadCount, 0);
    assert.equal(library.audio.playCount, 0);
    assert.equal(library.alerts.length, 1);
  });

  test(`${file}: both library renderers carry pack ids and error handlers`, () => {
    const library = setupLibrary(file, async () => { throw new Error("unused"); });
    assert.equal((library.content.match(/data-pack-id="\$\{escapeLibraryHtml\((?:packData\.id|track\.packId)\)\}"/g) || []).length, 4);
    assert.equal((library.content.match(/audio\.onerror = \(\) => \{ void recoverLibraryAudioFailure\(audio, audio\.error\); \};/g) || []).length, 2);
  });
}
