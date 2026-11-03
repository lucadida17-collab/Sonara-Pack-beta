"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createLicenseProtection, normalizeTrackRights, packRequiresRightsReview
} = require("./license-protection");
const { defaultPackLicense } = require("./pack-license");
const { isProtected, createAccountGate, makeSession, findSession } = require("../../security/account-security");
const { createPrivateMedia } = require("../../security/private-media");
function pack(hash = "abc", rightsInfo = null, licenseVersion = 1) {
  return {
    id: "pack_rights", title: "Rights Pack", artistId: "artist_1",
    accountId: "artist_1", rightsDeclarationAccepted: true,
    license: { ...defaultPackLicense(), id: `pack_rights:license:v${licenseVersion}`, version: licenseVersion,
      customTerms: `Licence historique ${licenseVersion}` },
    tracks: [{ id: "track_1", title: "Track 1", originalFileHash: hash,
      audioName: "private-audio.mp3", rightsInfo }]
  };
}
function service() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rights-verification-"));
  const svc = createLicenseProtection({ environment: "local", dataDir: dir });
  return { dir, svc };
}

test("droits tiers par track: formats légitimes, cas inconnus, données héritées", () => {
  assert.equal(normalizeTrackRights(null).valid, true);
  assert.equal(normalizeTrackRights(null).value, null);
  assert.equal(normalizeTrackRights({ status: "third_party", kinds: [] }).valid, false);
  assert.equal(normalizeTrackRights({ status: "third_party", kinds: ["samples"], permissionsConfirmed: false }).valid, false);
  assert.equal(normalizeTrackRights({ status: "invented" }).valid, false);
  const ok = normalizeTrackRights({status: "third_party", kinds: ["collaborators", "samples", "hacker"],
    permissionsConfirmed: true, management: "content_id", notes: "Artiste coauteur"});
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.value.kinds, ["collaborators", "samples"]);
  assert.equal(ok.requiresReview, true);
  assert.equal(packRequiresRightsReview(pack("x", ok.value)), true);
  assert.equal(packRequiresRightsReview(pack("x", {status:"controlled",management:"distributor"})), true);
  assert.equal(packRequiresRightsReview(pack("x", {status:"controlled",management:"none"})), false);
  assert.equal(packRequiresRightsReview(pack()), false);
});

test("déclaration liée aux empreintes et aux droits; déduplication non silencieuse", async () => {
  const { svc } = service(); await svc.init();
  const initial = pack("hash-A", {status:"controlled",management:"none"});
  const d1 = await svc.recordRightsDeclaration({rootUserId:"user_1",artistId:"artist_1",pack:initial});
  const duplicate = await svc.recordRightsDeclaration({rootUserId:"user_1",artistId:"artist_1",pack:initial});
  assert.equal(duplicate.rightsDeclarationId, d1.rightsDeclarationId);
  assert.match(d1.declarationContentHash, /^[a-f0-9]{64}$/);
  assert.match(d1.declarationTextHash, /^[a-f0-9]{64}$/);
  assert.equal(d1.legalTextStatus, "LEGAL_TEXT_REVIEW_REQUIRED");
  const updatedRights = pack("hash-A", {status:"third_party", kinds:["collaborators"],
    permissionsConfirmed:true, management:"content_id"});
  const d2 = await svc.recordRightsDeclaration({rootUserId:"user_1",artistId:"artist_1",pack:updatedRights});
  assert.notEqual(d2.rightsDeclarationId, d1.rightsDeclarationId);
  assert.equal(d2.previousRightsDeclarationId, d1.rightsDeclarationId);
  assert.equal(d2.trackDeclarations[0].rightsInfo.management, "content_id");
  const changedAudio = pack("hash-B", updatedRights.tracks[0].rightsInfo);
  const d3 = await svc.recordRightsDeclaration({rootUserId:"user_1",artistId:"artist_1",pack:changedAudio});
  assert.notEqual(d3.declarationContentHash, d2.declarationContentHash);
  assert.equal(d3.previousRightsDeclarationId, d2.rightsDeclarationId);
  assert.equal((await svc.recordsByType("RIGHTS_DECLARATION")).length, 3);
  await assert.rejects(() => svc.recordRightsDeclaration({artistId:"artist_1",pack:{...initial,rightsDeclarationAccepted:false}}), /acceptée/);
});

test("acheteurs distincts: anciens textes et hash restent consultables après licence V2", async () => {
  const { svc } = service(); await svc.init();
  const oldPack = pack("hash-A",null,1);
  const newPack = pack("hash-A",null,2);
  const first = await svc.recordAcceptance({rootUserId:"root1",accountId:"buyer1",pack:oldPack,trackId:"track_1"});
  const second = await svc.recordAcceptance({rootUserId:"root2",accountId:"buyer2",pack:newPack,trackId:"track_1"});
  const prior = await svc.prepareDownload({rootUserId:"root1",accountId:"buyer1",pack:newPack,trackId:"track_1"});
  assert.equal(prior.receipt.acceptanceId,first.acceptanceId);
  assert.match(prior.receipt.licenseTextSnapshot,/Licence historique 1/);
  const buyer1 = await svc.acceptedLicensesForAccount("buyer1");
  const buyer2 = await svc.acceptedLicensesForAccount("buyer2");
  assert.equal(buyer1[0].integrity,"OK");
  assert.equal(buyer2[0].integrity,"OK");
  assert.match(buyer1[0].licenseTextSnapshot,/Licence historique 1/);
  assert.match(buyer2[0].licenseTextSnapshot,/Licence historique 2/);
  assert.notEqual(buyer1[0].licenseHash,buyer2[0].licenseHash);
  assert.equal((await svc.acceptedLicensesForAccount("stranger")).length, 0);
  await assert.rejects(() => svc.prepareDownload({rootUserId:"root2",accountId:"buyer2",pack:newPack,trackId:"track_1",acceptanceId:first.acceptanceId}),/ne correspond pas/);
});

test("si le snapshot a disparu, le téléchargement ne substitue pas la licence actuelle", async () => {
  const { svc,dir } = service(); await svc.init();
  const current = pack("original",null,1);
  const a = await svc.recordAcceptance({rootUserId:"root",accountId:"buyer",pack:current,trackId:"track_1"});
  const p = path.join(dir,"license-evidence.json");
  const records = JSON.parse(fs.readFileSync(p,"utf8")).filter(r => r.recordType !== "LICENSE_SNAPSHOT");
  fs.writeFileSync(p, JSON.stringify(records));
  await assert.rejects(() => svc.prepareDownload({rootUserId:"root",accountId:"buyer",pack:pack("original",null,2),trackId:"track_1",acceptanceId:a.acceptanceId}),
    e => e.code === "LICENSE_SNAPSHOT_MISSING");
  const list = await svc.acceptedLicensesForAccount("buyer");
  assert.equal(list[0].integrity,"SNAPSHOT_MISSING_OR_MISMATCH");
});

test("accès historique protégé par session; pas de fuite publique des droits tiers", async () => {
  assert.equal(isProtected({path:"/api/licenses/mine",method:"GET"}),true);
  const user={id:"root1",accounts:[{id:"buyer1",accountId:"buyer1",status:"approved"}]};
  const acc=user.accounts[0];const token=makeSession(acc);
  const gate=createAccountGate({
    findTokenAccount:async digest=>findSession(acc,digest)?{rootUser:user,account:acc}:null,
    saveAccount:async()=>{},findAccountById:async()=>({rootUser:user,account:acc})
  });
  const makeReq=(provided="")=>({path:"/api/licenses/mine",method:"GET",body:{},query:{},get:()=>provided?`Bearer ${provided}`:""});
  const res=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}});
  const denied=res();let called=false;
  await gate.middleware(makeReq(),denied,()=>called=true);
  assert.equal(denied.statusCode,401);assert.equal(called,false);
  const passed=res();await gate.middleware(makeReq(token),passed,()=>called=true);
  assert.equal(called,true);
  const media=createPrivateMedia({readPacks:async()=>[],getAuthenticated:async()=>null});
  const visible = await media.catalogue({},[{...pack("x",{status:"third_party",kinds:["samples"],notes:"contact privé"}),status:"approved"}]);
  assert.equal(visible[0].tracks[0].rightsInfo,undefined);
  assert.equal(JSON.stringify(visible).includes("contact privé"),false);
});

test("les deux routes d'approbation des serveurs LOCAL/TEST vérifient la revue humaine", () => {
  const project=path.resolve(__dirname,"../../..");
  for (const server of ["server-local.js","server-test.js"]) {
    const source=fs.readFileSync(path.join(project,server),"utf8");
    assert.ok((source.match(/RIGHTS_REVIEW_REQUIRED/g)||[]).length >= 2,server);
    assert.match(source,/rightsDeclarationReviewRequired/);
  }
});
