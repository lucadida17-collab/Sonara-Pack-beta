"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createPrivateMedia,normalizedKey,purchased,findAudioByKey,isApproved}=require("./private-media");
const pack={id:"pack_1",status:"approved",artistId:"acc_artist",tracks:[{id:"track_1",audioName:"tracks/audio/song.mp3",previewStart:71,previewDuration:30}]};
const approvedAccount={id:"acc_1",accountId:"acc_1",downloadedPacks:["pack_1"]};
const otherAccount={id:"acc_2",accountId:"acc_2",downloadedPacks:[]};
test("media key normalization never grants a direct public file",()=>{
 assert.equal(normalizedKey("/uploads/tracks/audio/song.mp3"),"tracks/audio/song.mp3");
 assert.equal(findAudioByKey([pack],"tracks/audio/song.mp3")?.track?.id,"track_1");
 assert.equal(isApproved({...pack,status:"pending"}),false);
});
test("only purchasers or pack owner are entitled to full audio",()=>{
 assert.equal(purchased(otherAccount,pack,pack.tracks[0]),false);
 assert.equal(purchased(approvedAccount,pack,pack.tracks[0]),true);
 assert.equal(purchased({accountId:"acc_artist"},pack,pack.tracks[0]),true);
});
test("anonymous catalogue gets preview, purchaser gets temporary full ticket",async()=>{
 let identity=null;
 const media=createPrivateMedia({readPacks:async()=>[pack],getInput:async()=>{},sendOriginal:async()=>{},getAuthenticated:async()=>identity,getAccountById:async()=>null});
 const [publicPack]=await media.catalogue({},[pack]);
 assert.equal(publicPack.tracks[0].audioName,"/api/media/preview/pack_1/track_1");
 identity={account:approvedAccount};
 const [privatePack]=await media.catalogue({},[pack]);
 assert.match(privatePack.tracks[0].audioName,/^\/api\/media\/full\/[A-Za-z0-9_-]{25,}$/);
 assert.equal(pack.tracks[0].audioName,"tracks/audio/song.mp3");
});
