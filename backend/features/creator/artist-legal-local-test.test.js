"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {
 normalizeSubmission,proofBinding,registerArtistLegalIdentityRoutes,artistLegalSummary
}=require("./artist-legal-identity");
const {proofFormat,MAX_PROOF_BYTES}=require("./local-legal-proof");
const {sanitizeAccountSecrets}=require("../../security/data-protection");
const data={country:"FR",activityType:"registered",identifierType:"FR_SIRET",registrationNumber:"00000000000000"};
function makeRoutes(options={}) {
  const h={};let writes=0;
  const app={get:(p,fn)=>h[`GET ${p}`]=fn,patch:(p,fn)=>h[`PATCH ${p}`]=fn};
  registerArtistLegalIdentityRoutes({app,saveAccountState:async()=>{writes++},...options});
  async function invoke(method,account,body={}) {
    const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
    await h[`${method} /api/creator/legal-identity`]({sonaraIdentity:account?{account,rootUser:{id:"root"}}:null,body},res);
    return res;
  }
  return {invoke,writes:()=>writes};
}
test("MAIN rejects all-zero SIRET even with Test requested",()=>{
  assert.equal(normalizeSubmission(data).code,"REGISTRATION_PLACEHOLDER_INVALID");
  assert.equal(normalizeSubmission({...data,testMode:true}).code,"LOCAL_TEST_FORBIDDEN");
  assert.equal(normalizeSubmission({...data,testMode:false},{allowLocalZeroTest:true}).code,"REGISTRATION_PLACEHOLDER_INVALID");
});
test("LOCAL Test accepts zeros only with exact business identifier length",()=>{
  const checked=normalizeSubmission({...data,testMode:true},{allowLocalZeroTest:true});
  assert.equal(checked.valid,true);assert.equal(checked.testMode,true);
  assert.equal(normalizeSubmission({...data,testMode:true,registrationNumber:"0000000000000"},{allowLocalZeroTest:true}).valid,false);
  assert.equal(normalizeSubmission({...data,testMode:true,registrationNumber:"73282932000074"},{allowLocalZeroTest:true}).code,"LOCAL_TEST_NUMBER_REQUIRED");
  assert.equal(normalizeSubmission({...data,testMode:true,identifierType:"LOCAL_REGISTRATION"},{allowLocalZeroTest:true}).code,"LOCAL_TEST_NUMBER_REQUIRED");
});
test("LOCAL requires private proof linked to same registration before saving",async()=>{
  const routes=makeRoutes({localTestRegistration:true,requireRegistrationProof:true});
  const account={role:"artist",accountId:"a"};
  const no=await routes.invoke("PATCH",account,{...data,testMode:true});
  assert.equal(no.statusCode,400);assert.equal(no.body.code,"REGISTRATION_PROOF_REQUIRED");
  assert.equal(routes.writes(),0);
  const checked=normalizeSubmission({...data,testMode:true},{allowLocalZeroTest:true});
  account.artistLegalProof={binding:proofBinding(checked),originalName:"dummy.png",uploadedAt:"2026-10-24T00:00:00.000Z",storageName:"a".repeat(32)+".png"};
  const yes=await routes.invoke("PATCH",account,{...data,testMode:true});
  assert.equal(yes.statusCode,200);assert.equal(routes.writes(),1);
  assert.equal(yes.body.legalIdentity.status,"local_test_unverified");
  assert.equal(yes.body.legalIdentity.registrationProof.present,true);
  assert.equal(yes.body.legalIdentity.testMode,true);
  assert.equal(yes.body.legalIdentity.officiallyVerified,undefined);
  const reset=await routes.invoke("PATCH",account,{...data,testMode:false});
  assert.equal(reset.statusCode,400);
  assert.equal(reset.body.code,"REGISTRATION_PLACEHOLDER_INVALID");
});
test("registration proof cannot be reused when SIRET changes",async()=>{
  const acc={role:"artist",artistLegalProof:{binding:proofBinding(normalizeSubmission({...data,testMode:true},{allowLocalZeroTest:true})),originalName:"dummy.png"}};
  assert.equal(artistLegalSummary({ ...acc,artistLegalIdentity:{...data,testMode:true} }).registrationProof.present,true);
  const routes=makeRoutes({localTestRegistration:true,requireRegistrationProof:true});
  const attempt=await routes.invoke("PATCH",acc,{country:"FR",activityType:"registered",identifierType:"FR_SIRET",registrationNumber:"73282932000074",testMode:false});
  assert.equal(attempt.body.code,"REGISTRATION_PROOF_REQUIRED");
});
test("MAIN does not expose Local Test capabilities",async()=>{
  const acc={role:"artist"};const routes=makeRoutes();
  const result=await routes.invoke("GET",acc);
  assert.equal(result.body.capabilities.localTestRegistration,false);
  assert.equal(result.body.capabilities.registrationProof,false);
  assert.equal((await routes.invoke("PATCH",acc,{...data,testMode:true})).body.code,"LOCAL_TEST_FORBIDDEN");
});
test("private document content signatures, maximum size, account sanitizer",()=>{
  assert.equal(MAX_PROOF_BYTES,5*1024*1024);
  assert.equal(proofFormat(Buffer.from("%PDF-1.7\nany"))?.ext,"pdf");
  assert.equal(proofFormat(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]))?.ext,"png");
  assert.equal(proofFormat(Buffer.from([255,216,255,224]))?.ext,"jpg");
  assert.equal(proofFormat(Buffer.from("<script>alert(1)</script>")),null);
  assert.equal(proofFormat(Buffer.from("RIFF____WEBP_______"))?.ext,"webp");
  assert.equal(proofFormat(Buffer.from("____ftypheic_______"))?.ext,"heic");
  assert.equal(sanitizeAccountSecrets({artistLegalProof:{storageName:"secret"}},"root").artistLegalProof,undefined);
  const serverMain=fs.readFileSync(path.join(__dirname,"../../../server.js"),"utf8");
  const serverLocal=fs.readFileSync(path.join(__dirname,"../../../server-local.js"),"utf8");
  assert.doesNotMatch(serverMain,/registerLocalLegalProofRoutes/);
  assert.match(serverLocal,/registerLocalLegalProofRoutes/);
  assert.match(serverLocal,/localTestRegistration:true, requireRegistrationProof:true/);
});
