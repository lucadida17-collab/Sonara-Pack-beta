"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { renderFullListeningAudio } = require("./preview-export");
const { createPrivateMedia } = require("../../security/private-media");

test("La version d'écoute intégrale reprend -16 LUFS sans couper/fader le morceau original", async (t) => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return t.skip("FFmpeg absent");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sonara-full-normalization-test-"));
  try {
    const input=path.join(dir,"original.wav");
    const output=path.join(dir,"listening.mp3");
    assert.equal(spawnSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=6","-ar","22050",input]).status,0);
    const originalHash=fs.statSync(input).size;
    await renderFullListeningAudio({inputPath:input,outputPath:output});
    assert.equal(fs.statSync(input).size,originalHash,"master reste intact");
    const duration=spawnSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",output],{encoding:"utf8"});
    assert.equal(duration.status,0);
    assert.ok(Number(duration.stdout)>5.7,"le fichier ne devient pas un extrait de 30 s");
    const src=fs.readFileSync(path.join(__dirname,"preview-export.js"),"utf8");
    const normalizer=src.slice(src.indexOf("function renderFullListeningAudio"),src.indexOf("function renderPromoVideo"));
    assert.match(normalizer,/loudnorm=I=-16:TP=-1\.5:LRA=11/);
    assert.doesNotMatch(normalizer,/afade|safeDuration|previewStart/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test("Lecture entière : contrôle de droit, source intacte au premier clic, cache de normalisation protégé ensuite", async (t) => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return t.skip("FFmpeg absent");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sonara-media-security-test-"));
  const source=path.join(dir,"original.wav");
  const normalized=[];
  try {
    assert.equal(spawnSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=5",source]).status,0);
    const pack={id:"p",artistId:"creator",status:"approved",tracks:[{id:"t",audioName:"tracks/song.wav",originalFileHash:"sha1"}]};
    const account={id:"buyer",accountId:"buyer",downloadedPacks:["p"]};
    const routes=new Map();
    let originalCount=0, fullCheckCount=0, derivedSaved=false;
    const media=createPrivateMedia({
      readPacks:async()=>[pack],
      getInput:async(_key,target)=>fs.copyFileSync(source,target),
      sendOriginal:async()=>{originalCount++;},
      getAuthenticated:async()=>({account}),
      getAccountById:async()=>({account}),
      savePreparedFull:async()=>{derivedSaved=true;},
      sendPreparedFull:async()=>false,
    });
    media.mount({get(route,fn){routes.set(route,fn)},use(){}});
    const [catalogue]=await media.catalogue({},[pack]);
    const ticket=catalogue.tracks[0].audioName.split("/").at(-1);
    const response={headersSent:false,headers:{},setHeader(k,v){this.headers[k]=v;},sendFile(file){normalized.push(file);return file;},status(code){this.code=code;return this},json(data){this.jsonPayload=data;return data}};
    const full=routes.get("/api/media/full/:ticket");
    await full({params:{ticket},headers:{}},response);
    assert.equal(originalCount,1,"la première lecture ne patiente pas pour la normalisation");
    for(let i=0;i<80 && !derivedSaved;i++) await new Promise(r=>setTimeout(r,50));
    assert.equal(derivedSaved,true,"la version d'écoute est préparée après une lecture autorisée");
    await full({params:{ticket},headers:{}},response);
    assert.equal(normalized.length,1,"lecture du dérivé au deuxième accès");
    assert.match(normalized[0],/listening\.mp3$/);
    assert.equal(originalCount,1);
    const attacker=createPrivateMedia({readPacks:async()=>[pack],getInput:async()=>{},sendOriginal:async()=>{fullCheckCount++},getAuthenticated:async()=>({account:{id:"other",accountId:"other"}}),getAccountById:async()=>null});
    const attackerPack=await attacker.catalogue({},[pack]);
    assert.match(attackerPack[0].tracks[0].audioName,/\/api\/media\/preview\//);
    assert.equal(fullCheckCount,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test("La preview de 30 s survit à un redémarrage via son cache distant sans retraiter le master", async (t) => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) return t.skip("FFmpeg absent");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sonara-preview-persistent-test-"));
  const source=path.join(dir,"master.wav");
  try {
    assert.equal(spawnSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=330:duration=32",source]).status,0);
    const pack={id:"p",status:"approved",tracks:[{id:"t",audioName:"private/audio.wav",originalFileHash:"hash",previewStart:0,previewDuration:30}]};
    const durable=new Map();
    let masterLoads=0;
    const create=()=>{
      const routes=new Map();
      const media=createPrivateMedia({
        readPacks:async()=>[pack],
        getInput:async(_key,target)=>{masterLoads++;fs.copyFileSync(source,target);},
        sendOriginal:async()=>{},getAuthenticated:async()=>null,getAccountById:async()=>null,
        loadPreparedPreview:async(key,target)=>{
          if(!durable.has(key)) return false;
          fs.writeFileSync(target,durable.get(key));return true;
        },
        savePreparedPreview:async(key,file)=>{durable.set(key,fs.readFileSync(file));}
      });
      media.mount({get(route,fn){routes.set(route,fn);},use(){}});
      return routes.get("/api/media/preview/:packId/:trackId");
    };
    async function request(route) {
      let served;
      const res={setHeader(){},sendFile(file){served=file;return file;},status(n){return {json(v){throw Error(`HTTP ${n} ${JSON.stringify(v)}`)}}}};
      await route({params:{packId:"p",trackId:"t"}},res);
      assert.ok(served);
      return served;
    }
    const first=await request(create());
    assert.equal(masterLoads,1);
    assert.equal(durable.size,1);
    const second=await request(create());
    assert.equal(masterLoads,1,"la seconde instance relit le cache distant et non le master");
    for(const file of [first,second])fs.rmSync(path.dirname(file),{recursive:true,force:true});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
