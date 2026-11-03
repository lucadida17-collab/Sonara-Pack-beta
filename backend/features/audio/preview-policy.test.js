"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {applyCreatorPreview,applyModeratorPreviews,validatePreviewStart} = require("./preview-policy");
test("artist's manual selection survives automatic analysis",()=>{
 const result=applyCreatorPreview({previewMode:"manual",previewStart:47.3},{previewStart:112,previewDuration:30,audioDuration:180},180);
 assert.equal(result.previewStart,47.3);
 assert.equal(result.previewChosenBy,"artist");
 assert.equal(result.previewFadeIn,5);
 assert.equal(result.previewFadeOut,5);
});
test("automatic mode retains the original algorithm without rewriting it",()=>{
 const result=applyCreatorPreview({previewMode:"auto"},{previewStart:28,previewDuration:30,audioDuration:110},110);
 assert.equal(result.previewStart,28);
 assert.equal(result.previewChosenBy,"system");
});
test("moderator may correct an automatic preview",()=>{
 const pack={tracks:[{id:"t1",previewMode:"auto",previewStart:20,duration:130}]};
 assert.deepEqual(applyModeratorPreviews(pack,[{trackId:"t1",previewStart:35}]),{ok:true,updated:1});
 assert.equal(pack.tracks[0].previewStart,35);
 assert.equal(pack.tracks[0].previewChosenBy,"moderator");
});
test("moderator cannot override an artist's manual choice",()=>{
 const pack={tracks:[{id:"t1",previewMode:"manual",previewStart:20,duration:130}]};
 assert.equal(applyModeratorPreviews(pack,[{trackId:"t1",previewStart:35}]).ok,false);
 assert.equal(pack.tracks[0].previewStart,20);
});
test("invalid starts cannot be saved or clamped to a silent clip",()=>{
 assert.throws(()=>validatePreviewStart(300,95),RangeError);
 assert.throws(()=>validatePreviewStart(-1,95),RangeError);
 assert.throws(()=>validatePreviewStart("not-a-time",95),RangeError);
});
test("moderation batch is atomic when one track is invalid",()=>{
 const pack={tracks:[{id:"a",previewMode:"auto",previewStart:3,duration:80},{id:"b",previewMode:"manual",previewStart:15,duration:100}]};
 const result=applyModeratorPreviews(pack,[{trackId:"a",previewStart:20},{trackId:"b",previewStart:40}]);
 assert.equal(result.ok,false);
 assert.equal(pack.tracks[0].previewStart,3);
});
