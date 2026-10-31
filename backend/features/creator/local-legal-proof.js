"use strict";
// LOCAL only. Supporting business registration evidence is private and never verifies
// legal status automatically. Do not mount this route in MAIN or TEST.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeSubmission, proofBinding, explainLegalIdentityError } = require("./artist-legal-identity");

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^[a-f0-9]{32}\.(pdf|png|jpg|webp|heic)$/;

function proofFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {mime:"image/png",ext:"png"};
  if (buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return {mime:"image/jpeg",ext:"jpg"};
  if (buffer.subarray(0,5).toString("ascii") === "%PDF-") return {mime:"application/pdf",ext:"pdf"};
  if (buffer.length >= 12 && buffer.subarray(0,4).toString("ascii") === "RIFF" && buffer.subarray(8,12).toString("ascii") === "WEBP")
    return {mime:"image/webp",ext:"webp"};
  if (buffer.length >= 12 && buffer.subarray(4,8).toString("ascii") === "ftyp" &&
      ["heic","heix","hevc","hevx"].includes(buffer.subarray(8,12).toString("ascii")))
    return {mime:"image/heic",ext:"heic"};
  return null;
}
function registerLocalLegalProofRoutes({ app, saveAccountState, privateDirectory }) {
  const multer = require("multer");
  const upload = multer({
    storage:multer.memoryStorage(),
    limits:{files:1,fileSize:MAX_PROOF_BYTES,fields:5,fieldSize:256,parts:6},
    fileFilter(_req,file,cb) {
      if (file.fieldname !== "registrationProof" || !["image/png","image/jpeg","image/webp","image/heic","image/heif","application/pdf"].includes(file.mimetype)) {
        return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE",file.fieldname));
      }
      cb(null,true);
    }
  }).single("registrationProof");
  const fullDirectory = path.resolve(privateDirectory);
  async function removeProof(proof) {
    if (!proof || typeof proof.storageName !== "string" || !NAME_RE.test(proof.storageName)) return;
    await fs.rm(path.join(fullDirectory,proof.storageName),{force:true});
  }
  app.post("/api/creator/legal-identity/proof", (req,res) => {
    const auth = req.sonaraIdentity;
    if (!auth?.account || !auth.rootUser) return res.status(401).json({success:false,code:"AUTH_REQUIRED"});
    if (!["artist","both"].includes(String(auth.account.role || "").toLowerCase())) {
      return res.status(403).json({success:false,code:"ARTIST_REQUIRED"});
    }
    upload(req,res,async (uploadError) => {
      if (uploadError) {
        const large = uploadError.code === "LIMIT_FILE_SIZE";
        return res.status(large ? 413 : 400).json({success:false,code:large?"PROOF_TOO_LARGE":"PROOF_UPLOAD_INVALID",field:"registrationProof"});
      }
      if (!req.file || !req.file.buffer || req.file.size < 12) {
        return res.status(400).json({success:false,code:"REGISTRATION_PROOF_REQUIRED",field:"registrationProof"});
      }
      const checked = normalizeSubmission({
        country:req.body.country,activityType:"registered",identifierType:req.body.identifierType,
        registrationNumber:req.body.registrationNumber,testMode:req.body.testMode === "true"
      },{allowLocalZeroTest:true});
      if (!checked.valid) return res.status(400).json({success:false,code:checked.code,...explainLegalIdentityError(checked.code,req.body)});
      const format = proofFormat(req.file.buffer);
      if (!format || (format.mime !== req.file.mimetype && !(format.mime === "image/heic" && req.file.mimetype === "image/heif"))) {
        return res.status(400).json({success:false,code:"PROOF_FILE_TYPE_INVALID",field:"registrationProof"});
      }
      const storageName = `${crypto.randomBytes(16).toString("hex")}.${format.ext}`;
      const safeName = path.basename(String(req.file.originalname || "justificatif"))
        .replace(/[^\p{L}\p{N} ._()-]/gu,"_").slice(0,120) || "justificatif";
      const info = {storageName,originalName:safeName,mime:format.mime,size:req.file.size,
        uploadedAt:new Date().toISOString(),binding:proofBinding(checked)};
      let wroteFile=false;
      const previous=auth.account.artistLegalProof;
      try {
        await fs.mkdir(fullDirectory,{recursive:true,mode:0o700});
        await fs.writeFile(path.join(fullDirectory,storageName),req.file.buffer,{mode:0o600,flag:"wx"});
        wroteFile=true;
        auth.account.artistLegalProof=info;
        await saveAccountState(auth.rootUser,auth.account);
        if (previous) await removeProof(previous).catch(()=>{});
      } catch (error) {
        auth.account.artistLegalProof=previous;
        if (wroteFile) await removeProof(info).catch(()=>{});
        console.error("Preuve de déclaration locale indisponible:",error.message);
        return res.status(503).json({success:false,code:"PROOF_SAVE_UNAVAILABLE"});
      }
      res.setHeader("Cache-Control","no-store, private");
      return res.json({success:true,registrationProof:{present:true,fileName:safeName,uploadedAt:info.uploadedAt},
        status:"uploaded_unverified",isTestOnly:checked.testMode === true});
    });
  });
  return {removeProof};
}
module.exports={registerLocalLegalProofRoutes,proofFormat,MAX_PROOF_BYTES};
