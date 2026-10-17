"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {createCommercialPolicy} = require("../config/commercial-mode");
const {createAccountGate,makeSession,findSession,digestToken,hashPassword,verifyPassword,isProtected} = require("./account-security");
const {createPrivateMedia,isPublicImageKey,publicPackMetadata} = require("./private-media");
const {migrateLocalPasswords} = require("./password-migration");
const {renderAudioPreview} = require("../features/audio/preview-export");

function res() {
 return {statusCode:200,payload:undefined,headers:{},status(n){this.statusCode=n;return this},json(obj){this.payload=obj;return this},end(){this.ended=true;return this},setHeader(k,v){this.headers[k]=v},getHeader(k){return this.headers[k]}};
}
function gateFixture(){
 const rootUser={id:"user_main",accounts:[{id:"account_alpha",accountId:"account_alpha",status:"approved",downloadedPacks:["pack_public"]},{id:"account_beta",accountId:"account_beta",status:"approved"}]};
 const account=rootUser.accounts[0];
 const token=makeSession(account);
 const gate=createAccountGate({findTokenAccount:async d=>findSession(account,d)?{rootUser,account}:null,saveAccount:async()=>{},findAccountById:async()=>({rootUser,account})});
 return {rootUser,account,token,gate};
}
function req(p,token,body={},query={},method="POST"){
 return {method,path:p,body,query,get(name){return name.toLowerCase()==="authorization"&&token?`Bearer ${token}`:""}};
}
async function runGate(fixture,request){ const reply=res();let called=0;await fixture.gate.middleware(request,reply,()=>called++);return {reply,called,request}; }

test("MAIN reste PRE_V1 même avec des variables de déploiement COMMERCIAL/LIVE",()=>{
 const old=process.env.SONARA_COMMERCIAL_MODE;process.env.SONARA_COMMERCIAL_MODE="COMMERCIAL";
 try {
  const main=createCommercialPolicy({environment:"main",paymentSwitch:true});
  assert.equal(main.mode,"PRE_V1");assert.equal(main.paymentsActive,false);
  assert.equal(main.bankAccessible,false);assert.equal(main.checkoutEnabled,false);
  const local=createCommercialPolicy({environment:"local",paymentSwitch:true});
  assert.equal(local.mode,"COMMERCIAL");assert.equal(local.paymentsActive,true);
 } finally{if(old==null)delete process.env.SONARA_COMMERCIAL_MODE;else process.env.SONARA_COMMERCIAL_MODE=old;}
});
test("La migration locale convertit les anciens mots de passe et préserve les hachages existants",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sonara-credentials-"));
 try{
  const file=path.join(dir,"users.json"),hash=hashPassword("alreadyHashed");
  fs.writeFileSync(file,JSON.stringify([{id:"root",accounts:[{id:"old",password:"legacyPass"},{id:"new",password:hash}]}]));
  assert.equal(migrateLocalPasswords(file),1);
  const [root]=JSON.parse(fs.readFileSync(file,"utf8"));
  assert.equal(verifyPassword("legacyPass",root.accounts[0].password),true);
  assert.notEqual(root.accounts[0].password,"legacyPass");
  assert.equal(root.accounts[1].password,hash);
  assert.equal(migrateLocalPasswords(file),0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("Une session expirée ou révoquée ne donne plus accès",async()=>{
 const account={authSessions:[]},token=makeSession(account,Date.now()-8*24*3600*1000);
 assert.equal(findSession(account,digestToken(token)),false);
 const fixture=gateFixture();fixture.account.authSessions=[];
 const result=await runGate(fixture,req("/api/downloads/prepare",fixture.token,{userId:"account_alpha"}));
 assert.equal(result.reply.statusCode,401);assert.equal(result.called,0);
});
for(const endpoint of [
 ["/api/auto-playlists/auto%3Atest/acquire",{userId:"account_beta"},{}],
 ["/api/packs/pack_public/moderation-response",{accountId:"account_beta"},{}],
 ["/api/packs/pack_public/moderation-request",{}, {accountId:"account_beta"}],
 ["/api/growth/organic/link-account",{accountId:"account_beta"},{}]
]) test(`Identité usurpée interdite : ${endpoint[0]}`,async()=>{
 const fixture=gateFixture();const response=await runGate(fixture,req(endpoint[0],fixture.token,endpoint[1],endpoint[2],endpoint[0].endsWith("moderation-request")?"GET":"POST"));
 assert.equal(response.reply.statusCode,403);assert.equal(response.called,0);
});
test("Les routes annexes protègent également l'absence de session",async()=>{
 const fixture=gateFixture();for(const [p] of [
 ["/api/auto-playlists/playlist/acquire"],
 ["/api/packs/a/moderation-response"],
 ["/api/packs/a/moderation-request"],
 ["/api/growth/organic/link-account"]]){
 const response=await runGate(fixture,req(p,"",{accountId:"account_alpha"}));
 assert.equal(response.reply.statusCode,401,p);
 }
 assert.equal(isProtected(req("/api/packs", "",{}, {}, "GET")),false);
});
test("Une requête authentifiée vers son propre contenu demeure autorisée",async()=>{
 const fixture=gateFixture();
 for(const request of [req("/api/auto-playlists/a/acquire",fixture.token,{userId:"account_alpha"}),req("/api/packs/x/moderation-response",fixture.token,{accountId:"account_alpha"})]){
  const result=await runGate(fixture,request);assert.equal(result.called,1);
 }
});
test("Un en-tête founder arbitraire ne contourne plus les autres routes compte",async()=>{
 const fixture=gateFixture();
 const request=req("/api/users/account_beta/email", "");request.method="PATCH";request.get=n=>n==="x-founder-key"?"fake-founder": "";
 const response=await runGate(fixture,request);assert.equal(response.reply.statusCode,401);
});
test("Le catalogue public ne révèle plus les fichiers originaux ni justificatifs",()=>{
 const raw={id:"p",downloadZip:"zips/private.zip",stripeAccountId:"acct_private",creationEvidence:[{storageKey:"secret"}],tracks:[{id:"t",audioName:"tracks/audio/song.mp3",downloadZip:"zips/track.zip"}],resources:[{fileKey:"midi/private.mid",originalName:"demo.mid"}]};
 const safe=publicPackMetadata(raw);
 assert.equal(safe.downloadZip,undefined);assert.equal(safe.creationEvidence,undefined);
 assert.equal(safe.stripeAccountId,undefined);assert.equal(safe.resources[0].fileKey,undefined);
 assert.equal(safe.resources[0].originalName,"demo.mid");
});
test("Les captures de support restent privées, mais les covers publiques sont autorisées",()=>{
 assert.equal(isPublicImageKey("feedback/main/issue/picture.png"),false);
 assert.equal(isPublicImageKey("moderation/evidence/proof.jpg"),false);
 assert.equal(isPublicImageKey("packs/covers/art.jpg"),true);
 assert.equal(isPublicImageKey("profile-local-123.png"),true);
 assert.equal(isPublicImageKey("private/image.jpg"),false);
});
test("Un ticket média est revérifié côté serveur et révoqué après suppression d'acquisition",async()=>{
 const pack={id:"pack_public",status:"approved",artistId:"artist",tracks:[{id:"track_1",audioName:"tracks/audio/song.mp3"}]};
 const account={id:"buyer",accountId:"buyer",downloadedPacks:["pack_public"],status:"approved"};
 const bearerToken=makeSession(account);
 let served=0;
 const media=createPrivateMedia({readPacks:async()=>[pack],getInput:async()=>{},sendOriginal:async(_key,_req,response)=>{served++;response.end();},getAuthenticated:async()=>({account}),getAccountById:async()=>({account})});
 let handler;
 media.mount({get(url,callback){if(url==="/api/media/full/:ticket")handler=callback;},use(){}});
 const [visible]=await media.catalogue({get(name){return name==="Authorization"?`Bearer ${bearerToken}`:""}},[pack]);
 assert.equal(visible.tracks[0].downloadZip,undefined);
 const ticket=visible.tracks[0].audioName.split("/").pop();
 const good=res();await handler({params:{ticket},headers:{}},good);
 assert.equal(served,1);
 account.authSessions=[]; // logout/password reset revokes the originating server session
 const revoked=res();await handler({params:{ticket},headers:{}},revoked);
 assert.equal(revoked.statusCode,403);assert.equal(served,1);
 // A fresh login with no acquisition must also be unable to reuse a full-audio ticket.
 account.downloadedPacks=["pack_public"];
 const secondToken=makeSession(account);
 const [again]=await media.catalogue({get(name){return name==="Authorization"?`Bearer ${secondToken}`:""}},[pack]);
 account.downloadedPacks=[];
 const withoutPurchase=res();
 await handler({params:{ticket:again.tracks[0].audioName.split("/").pop()},headers:{}},withoutPurchase);
 assert.equal(withoutPurchase.statusCode,403);assert.equal(served,1);
});
test("Aperçu MP3 réel transcodé à 30 secondes maximum par ffmpeg",async(t)=>{
 try{execFileSync("ffmpeg",["-version"],{stdio:"ignore"});execFileSync("ffprobe",["-version"],{stdio:"ignore"});}catch{return t.skip("ffmpeg/ffprobe indisponibles");}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sonara-preview-proof-"));
 try{
  const input=path.join(dir,"full.wav"),output=path.join(dir,"preview.mp3");
  execFileSync("ffmpeg",["-nostdin","-v","error","-f","lavfi","-i","sine=frequency=440:duration=42","-c:a","pcm_s16le","-y",input],{timeout:20000});
  await renderAudioPreview({inputPath:input,outputPath:output,start:5,duration:300});
  const seconds=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",output],{encoding:"utf8",timeout:10000}).trim());
  assert.ok(seconds<=30.2 && seconds>=29.0,`Preview length ${seconds}s`);
  assert.ok(fs.statSync(output).size<fs.statSync(input).size);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("L'accès direct /uploads ne délivre jamais l'original audio, ZIP ou les preuves privées",async()=>{
 const pack={id:"pack_private",status:"approved",tracks:[{id:"track_private",audioName:"tracks/audio/private.mp3"}]};
 const media=createPrivateMedia({readPacks:async()=>[pack],getInput:async()=>{},sendOriginal:async()=>{throw Error("Never serve raw")},getAuthenticated:async()=>null,getAccountById:async()=>null});
 let block;
 media.mount({get(){},use(url,callback){if(url==="/uploads")block=callback;}});
 const attempt=async p=>{
  const response=res();response.redirect=function(status,location){this.statusCode=status;this.location=location;return this};
  let next=0;await block({path:p,method:"GET"},response,()=>next++);
  return {response,next};
 };
 const mp3=await attempt("/tracks/audio/private.mp3");
 assert.equal(mp3.response.statusCode,307);
 assert.equal(mp3.response.location,"/api/media/preview/pack_private/track_private");
 const zip=await attempt("/zips/tracks/private.zip");assert.equal(zip.response.statusCode,403);
 const evidence=await attempt("/feedback/main/issue.jpg");assert.equal(evidence.response.statusCode,403);
 const artwork=await attempt("/packs/covers/cover.webp");assert.equal(artwork.next,1);
});
