"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const project = path.resolve(__dirname, "../../..");
const source = (file) => fs.readFileSync(path.join(project, file), "utf8");
const pack = source("app/js/catalog/pack.js");

function compileGetFilePath(file) {
  const match = source(file).match(/function getFilePath\(file\) \{[\s\S]*?\n\}/);
  assert.ok(match, `getFilePath exists in ${file}`);
  return vm.runInNewContext(`(${match[0]})`, { API_URL: "https://test.sonara.invalid" });
}

for (const file of [
  "app/js/catalog/pack.js",
  "app/js/catalog/library.js",
  "app/js/user/library/index.js",
  "app/js/home/home.js"
]) {
  test(`${file}: secure media URLs never become /uploads/api/media`, () => {
    const get = compileGetFilePath(file);
    assert.equal(get("/api/media/preview/p_1/t_1"), "https://test.sonara.invalid/api/media/preview/p_1/t_1");
    assert.equal(get("/api/media/full/ticket"), "https://test.sonara.invalid/api/media/full/ticket");
    assert.equal(get("/uploads/cover.jpg"), "https://test.sonara.invalid/uploads/cover.jpg");
    assert.equal(get("cover.jpg"), "https://test.sonara.invalid/uploads/cover.jpg");
  });
}

function createPackPlayerHarness(audioPath, previewStart = 65, duration = NaN) {
  const begin = pack.indexOf("  let previewRequestId = 0;");
  const end = pack.indexOf("  function togglePlayback() {", begin);
  assert.ok(begin > 0 && end > begin);
  const calls = [];
  const listeners = new Map();
  const audio = {
    src: "",
    currentTime: 0,
    duration,
    readyState: 0,
    paused: true,
    pause() { this.paused = true; calls.push("pause"); },
    play() { this.paused = false; calls.push("play"); return Promise.resolve(); },
    addEventListener(name, callback) { listeners.set(name, callback); }
  };
  const track = { id: "t1", audioName: audioPath, previewStart, previewDuration: 30 };
  const context = {
    tracks: [track],
    packData: { id: "pack_1" },
    API_URL: "https://test.sonara.invalid",
    packPreviewState: null,
    audio,
    previewRequestId: 0,
    navigator: { onLine: true },
    PACK_PREVIEW_DURATION: 30,
    getFilePath(file) { return `https://test.sonara.invalid${file}`; },
    window: {
      location: { href: "https://sonara.invalid/pack" },
      setTimeout() { return 7; },
      clearTimeout() {}
    },
    syncProgress() {}, syncRows() {}, syncPlayButtons() {}, updatePlayerIdentity() {},
    showPopup() { calls.push("error"); },
    fallbackPackPreviewStart(item, audioDuration) {
      return Math.min(item.previewStart, Math.max(0, audioDuration - 1));
    }
  };
  const controller = vm.runInNewContext(`(function() { ${pack.slice(begin, end)} return { selectTrack, state: () => packPreviewState }; })()`, context);
  return { controller, context, calls, audio, listeners };
}

test("pack: one click calls audio.play immediately with no preview analysis or metadata await", () => {
  const {controller, calls, audio} = createPackPlayerHarness("/api/media/preview/p/t");
  controller.selectTrack(0);
  assert.ok(calls.includes("play"));
  assert.equal(audio.src, "https://test.sonara.invalid/api/media/preview/pack_1/t1");
  assert.equal(controller.state().start, 0);
  assert.equal(controller.state().end, 30);
});

test("pack: a buyer with a full-audio ticket still hears ONLY the processed 30 s preview", () => {
  const {controller, audio, listeners} = createPackPlayerHarness("/api/media/full/opaque", 65, 30);
  controller.selectTrack(0);
  assert.equal(audio.src, "https://test.sonara.invalid/api/media/preview/pack_1/t1");
  assert.equal(controller.state().start, 0);
  assert.equal(controller.state().end, 30);
  audio.readyState = 1;
  listeners.get("loadedmetadata")();
  assert.equal(controller.state().start, 0);
  assert.equal(controller.state().end, 30);
  assert.equal(audio.currentTime, 0);
});

test("pack: no cover play button on tablets/touch or mobiles; mouse desktop is supported", () => {
  const css = source("app/css/catalog/pack.css");
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 899px\)/);
  assert.match(css, /body\.pack-page \.playerBtnMob \{ display: none !important; \}/);
  assert.match(css, /@media \(min-width: 900px\) and \(hover: hover\) and \(pointer: fine\)/);
});

test("library: touch and click are not double bound; playback errors are visible", () => {
  for (const file of ["app/js/catalog/library.js", "app/js/user/library/index.js"]) {
    const js = source(file);
    assert.doesNotMatch(js, /row\.addEventListener\("touchend"/);
    assert.match(js, /function reportLibraryAudioError/);
    assert.match(js, /role", "alert"/);
    assert.match(js, /audio\.onerror =/);
  }
});

test("pack and home show distinct network errors without asserting every fault is a network outage", () => {
  assert.match(pack, /Erreur de connexion/);
  const home = source("app/js/home/home.js");
  assert.match(home, /Aucune connexion Internet/);
  assert.match(home, /fetchHomeWithTimeout/);
});
