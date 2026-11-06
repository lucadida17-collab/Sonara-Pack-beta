"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadStats(mode = "PRE_V1") {
  const context = {
    document: { addEventListener() {} },
    window: { SonaraCommercial: { getState: () => ({ mode }) } }
  };
  const file = path.resolve(__dirname, "../../../app/js/catalog/pack-stats.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.window.SonaraPackStats;
}

test("total duration uses original tracks, never previews", () => {
  const stats = loadStats();
  const result = stats.calculate([
    { price: "3,50€", tracks: [
      { duration: 200, previewDuration: 30 },
      { audioDuration: 125, previewDuration: 30 }
    ] },
    { price: "1.50", tracks: [{ duration: "2:10", previewDuration: 30 }] }
  ]);
  assert.equal(result.duration, 455);
  assert.equal(result.tracks, 3);
  assert.equal(result.packs, 2);
  assert.equal(result.price, 5);
  assert.equal(stats.formatDuration(result.duration), "7:35");
});

test("missing full duration and missing prices are not invented", () => {
  const stats = loadStats();
  const result = stats.calculate([{ tracks: [{ previewDuration: 30 }] }]);
  assert.equal(result.duration, 0);
  assert.equal(result.missingDurations, 1);
  assert.equal(result.missingPrices, 1);
  const markup = stats.renderPack({ tracks: [{ previewDuration: 30 }] });
  assert.match(markup, /Durée indisponible/);
  assert.match(markup, /Prix indisponible/);
  assert.doesNotMatch(markup, />0:30</);
});

test("artist profile shows cumulative cost without triggering purchases", () => {
  const stats = loadStats();
  const markup = stats.renderArtist([
    { price: "4.00", tracks: [{ duration: 60 }] },
    { price: "2.75", tracks: [{ duration: 90 }] }
  ], "Luca Dida");
  assert.match(markup, /6,75 €/);
  assert.match(markup, /2:30/);
  assert.match(markup, /Prix total prévu/);
  assert.match(markup, /Glisser vers la droite/);
  assert.doesNotMatch(markup, /checkout|fetch\(/i);
});
