"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {normalizeSubmission,validateRegistrationNumber,registerArtistLegalIdentityRoutes}=require("./artist-legal-identity");

function fakeRoutes() {
  const routes={}, app={post:(p,f)=>routes[`POST ${p}`]=f,get:(p,f)=>routes[`GET ${p}`]=f,patch:(p,f)=>routes[`PATCH ${p}`]=f};
  let writes=0;
  registerArtistLegalIdentityRoutes({app,saveAccountState:async()=>{writes++;}});
  const res=()=>({statusCode:200,status(code){this.statusCode=code;return this;},setHeader(){return this;},json(body){this.body=body;return this;}});
  return {writes:()=>writes, invoke:async(body,account={role:'artist'})=>{const response=res();await routes['PATCH /api/creator/legal-identity']({sonaraIdentity:{rootUser:{id:'R'},account},body},response);return response;}};
}
test('Le formulaire vide est REFUSÉ côté serveur et ne déclenche aucune écriture',async()=>{
  const routes=fakeRoutes();
  for(const payload of [{},{country:'FR',activityType:'not_provided'},{country:'FR',activityType:''},{country:'FR',activityType:'registered',identifierType:'FR_SIRET',registrationNumber:''}]){
    const r=await routes.invoke(payload);
    assert.equal(r.statusCode,400);
  }
  assert.equal(routes.writes(),0);
});
test('Suppression volontaire exige un indicateur explicite',async()=>{
  const account={role:'artist',artistLegalIdentity:{country:'FR',activityType:'registered',identifierType:'FR_SIRET',registrationNumber:'73282932000074'}};
  const r=fakeRoutes();
  assert.equal((await r.invoke({country:'FR',activityType:'not_provided'},account)).statusCode,400);
  assert.ok(account.artistLegalIdentity);
  assert.equal((await r.invoke({activityType:'not_provided',clear:true},account)).statusCode,200);
  assert.equal(account.artistLegalIdentity,undefined);
  assert.equal(r.writes(),1);
});
test('Indépendant sans numéro : déclaration explicite obligatoire',()=>{
  const draft={country:'US',activityType:'individual_no_number'};
  assert.equal(normalizeSubmission(draft).code,'INDIVIDUAL_ATTESTATION_REQUIRED');
  assert.equal(normalizeSubmission({...draft,individualAttested:true}).valid,true);
});
test('SIRET 14, SIREN 9 : longueur exacte et checksum',()=>{
  const basic=(identifierType,registrationNumber)=>normalizeSubmission({country:'FR',activityType:'registered',identifierType,registrationNumber});
  assert.equal(basic('FR_SIRET','73282932000074').valid,true);
  assert.equal(basic('FR_SIRET','7328293200007').valid,false);
  assert.equal(basic('FR_SIRET','732829320000745').valid,false);
  assert.equal(basic('FR_SIREN','732829320').valid,true);
  assert.equal(basic('FR_SIREN','73282932000074').valid,false);
  assert.equal(basic('FR_SIRET','00000000000000').code,'REGISTRATION_PLACEHOLDER_INVALID');
  assert.equal(normalizeSubmission({siret:'00000000000000'}).code,'REGISTRATION_PLACEHOLDER_INVALID');
});
test('EIN 9 et autres identifiants adaptés sans imposer 14 à tous',()=>{
  assert.equal(validateRegistrationNumber('US_EIN','12-3456789').valid,true);
  assert.equal(validateRegistrationNumber('US_EIN','12345678').valid,false);
  assert.equal(validateRegistrationNumber('US_EIN','1234567890').valid,false);
  assert.equal(validateRegistrationNumber('GB_CRN','SC123456').valid,true);
  assert.equal(validateRegistrationNumber('CA_NEQ','1234567890').valid,true);
  assert.equal(validateRegistrationNumber('AU_ABN','51 824 753 556').valid,true);
});
test('Statut orange et interface incomplète interdite',()=>{
  const root=path.resolve(__dirname,'../../..');
  const js=fs.readFileSync(path.join(root,'app/js/creator/management/legal-identity.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/css/creator/management/legal-identity.css'),'utf8');
  assert.match(js,/function refreshSaveState\(\)/);
  assert.match(js,/ACTIVITY_TYPE_REQUIRED/);
  assert.match(js,/Déclaration reçue · non vérifiée/);
  assert.match(js,/"pending"\);/);
  assert.match(js,/clear:true/);
  assert.match(js,/individualAttested:individualAttestation\.checked/);
  assert.match(css,/\.artist-legal-feedback\[data-tone="pending"\]/);
  assert.match(css,/#f9dca4/);
});
test('Les déclarations ne sont pas envoyées automatiquement à Stripe',()=>{
  const frontend=fs.readFileSync(path.resolve(__dirname,'../../../app/js/creator/management/legal-identity.js'),'utf8');
  assert.match(frontend,/pas envoyées automatiquement à Stripe/);
  const backend=fs.readFileSync(path.join(__dirname,'artist-legal-identity.js'),'utf8');
  assert.match(backend,/verificationProvider\.retrieveAccount/);
  assert.doesNotMatch(backend,/verificationProvider\.(?:updateAccount|createAccount)/);
});

// Error messages come from the backend's validation contract, not guessed by the form.
test('Erreur de situation absente : HTTP 400 ciblé sur le menu professionnel',async()=>{
  const r=fakeRoutes();
  const answer=await r.invoke({country:'FR',activityType:''});
  assert.equal(answer.statusCode,400);
  assert.equal(answer.body.code,'ACTIVITY_TYPE_REQUIRED');
  assert.equal(answer.body.field,'activityType');
  assert.match(answer.body.message,/Sélectionne/);
  assert.match(answer.body.messageEn,/Choose/);
  assert.equal(r.writes(),0);
});
test('SIRET invalide : erreur renvoyée par serveur avec le champ et le motif exact',async()=>{
  const r=fakeRoutes();
  const answer=await r.invoke({country:'FR',activityType:'registered',identifierType:'FR_SIRET',registrationNumber:'12345678901234'});
  assert.equal(answer.statusCode,400);
  assert.equal(answer.body.code,'SIRET_CHECKSUM_INVALID');
  assert.equal(answer.body.field,'registrationNumber');
  assert.match(answer.body.message,/clé de contrôle du SIRET/);
  assert.equal(r.writes(),0);
});
test('SIRET court et SIREN long : messages différents et longueur fournie par serveur',async()=>{
  const r=fakeRoutes();
  const short=await r.invoke({country:'FR',activityType:'registered',identifierType:'FR_SIRET',registrationNumber:'1234567890123'});
  assert.equal(short.body.field,'registrationNumber');
  assert.match(short.body.message,/14 chiffres/);
  const long=await r.invoke({country:'FR',activityType:'registered',identifierType:'FR_SIREN',registrationNumber:'12345678901234'});
  assert.equal(long.body.field,'registrationNumber');
  assert.match(long.body.message,/9 chiffres/);
  assert.equal(r.writes(),0);
});
test('EIN court et pays illégal : ciblage selon la validation du serveur',async()=>{
  const r=fakeRoutes();
  const short=await r.invoke({country:'US',activityType:'registered',identifierType:'US_EIN',registrationNumber:'12345'});
  assert.equal(short.body.field,'registrationNumber');
  assert.match(short.body.message,/EIN.*9 chiffres/);
  const badCountry=await r.invoke({country:'XX',activityType:'registered',identifierType:'LOCAL_REGISTRATION',registrationNumber:'ABC00009'});
  assert.equal(badCountry.body.field,'country');
  assert.equal(r.writes(),0);
});
test('Attestation individuelle : le serveur renvoie une erreur sur la case à cocher',async()=>{
  const r=fakeRoutes();
  const answer=await r.invoke({country:'FR',activityType:'individual_no_number',individualAttested:false});
  assert.equal(answer.statusCode,400);
  assert.equal(answer.body.field,'individualAttested');
  assert.match(answer.body.message,/Confirme/);
  assert.equal(r.writes(),0);
});
test('Le frontend rend le bouton cliquable et suit les erreurs structurées 400 (avec CSS rouge)',()=>{
  const root=path.resolve(__dirname,'../../..');
  const js=fs.readFileSync(path.join(root,'app/js/creator/management/legal-identity.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/css/creator/management/legal-identity.css'),'utf8');
  assert.match(js,/button\.disabled = false;/);
  assert.match(js,/validationAttempted = true;\s*if \(!validateVisibleFields\(\)\) return;/);
  assert.match(js,/field:typeof data\.field === "string" \? data\.field : null/);
  assert.match(js,/error\.httpStatus === 400 \|\| error\.httpStatus === 403/);
  assert.match(js,/control\.setAttribute\("aria-invalid", "true"\)/);
  assert.match(css,/\.artist-legal-control\[aria-invalid="true"\]/);
  assert.match(css,/#ff6478/);
});
