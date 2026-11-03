"use strict";
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { renderAudioPreview } = require("../features/audio/preview-export");
const { bearer, digestToken, findSession } = require("./account-security");

const TTL = 20 * 60 * 1000;
const IMAGE_EXT = /\.(?:png|jpe?g|webp|gif|avif)$/i;
const PRIVATE_EXT = /\.(?:mp3|wav|aiff?|flac|ogg|m4a|aac|zip|rar|7z|mid|midi|als|flp|rpp|logicx|mp4|mov|pdf)$/i;
// Raw upload URLs serve artwork only, never feedback screenshots or moderation proofs.
function isPublicImageKey(key) {
  const clean=normalizedKey(key);
  if (!clean || clean.includes("..") || !IMAGE_EXT.test(clean)) return false;
  if (/^(?:feedback|moderation|private|support|tickets|appeals)\//i.test(clean)) return false;
  // LOCAL has historic flat upload names, MAIN uses artwork folders.
  return !clean.includes("/") || /^(?:profiles|packs\/covers|tracks\/covers|resources\/covers)\//i.test(clean);
}
function publicPackMetadata(pack) {
  const safe={...pack};
  for (const key of ["downloadZip","fileKey","creationEvidence","creationEvidenceKinds","creationProcess","humanModeration","technicalModerationSignals","stripeAccountId","stripeCustomerId","bankAccount","bankDetails","moderationInternalNote","originalFileHash"]) delete safe[key];
  delete safe.rightsDeclarationReviewRequired;
  delete safe.rightsReviewRequired;
  safe.tracks=(Array.isArray(pack.tracks)?pack.tracks:[]).map(item=>{
    const track={...item};
    delete track.rightsInfo;
    return track;
  });
  safe.resources=(Array.isArray(pack.resources)?pack.resources:[]).map(item=>{
    const resource={...item};
    for(const key of ["fileKey","downloadZip","storageKey","originalFileHash","originalFileHashAlgorithm","originalFileHashComputedAt"]) delete resource[key];
    return resource;
  });
  return safe;
}

function normalizedKey(s) {
  return String(s || "").split(/[?#]/)[0].replace(/\\/g,"/").replace(/^https?:\/\/[^/]+\/uploads\//i,"").replace(/^\/+/,"").replace(/^uploads\//,"");
}
function isApproved(pack) {
  return String(pack?.status || "").toLowerCase() === "approved" && pack?.moderationHidden !== true;
}
function purchased(account, pack, track) {
  if (!account) return false;
  const ownIds = [account.id, account.accountId].filter(Boolean).map(String);
  if (ownIds.includes(String(pack.artistId || ""))) return true;
  const packId = String(pack.id);
  return (account.downloadedPacks || []).some(id => String(id)===packId) ||
    (account.downloadedTracks || []).some(id => String(id)===String(track?.id || ""));
}
function findAudioByKey(packs, key) {
  const clean = normalizedKey(key);
  if (!clean || clean.includes("..")) return null;
  for(const pack of packs) {
    const tracks = Array.isArray(pack.tracks) && pack.tracks.length ? pack.tracks : [pack];
    for(const track of tracks) {
      const source = normalizedKey(track.audioName || track.audio || "");
      if(source && source===clean) return {pack,track,source};
    }
  }
  return null;
}
function createPrivateMedia({ readPacks, getInput, sendOriginal, getAuthenticated, getAccountById }) {
  const tickets = new Map();
  const previewCache = new Map();
  const previewPending = new Map();
  let issued = 0;
  async function catalogue(req, packs) {
    let identity = null;
    try { identity = await getAuthenticated(req); } catch { identity = null; }
    const now = Date.now();
    if (++issued % 100 === 0) for(const [key,ticket] of tickets) if(ticket.expiresAt<now) tickets.delete(key);
    if(tickets.size>20000) tickets.clear();
    return packs.map(pack => {
      const tracks = Array.isArray(pack.tracks) ? pack.tracks : [];
      const withAudio = tracks.map(item => {
        const track = { ...item };
        delete track.rightsInfo;
        const source = normalizedKey(track.audioName || track.audio || "");
        if (!source) return track;
        const preview = `/api/media/preview/${encodeURIComponent(pack.id)}/${encodeURIComponent(track.id || "single")}`;
        if (identity && purchased(identity.account, pack, track)) {
          const ticket = crypto.randomBytes(28).toString("base64url");
          // Bind the native-audio capability to the creating server session.
          // The URL alone never survives a logout/password reset.
          const sessionToken = typeof req.get === "function" ? bearer(req) : "";
          tickets.set(ticket, { packId:String(pack.id), trackId:String(track.id||"single"), accountId:String(identity.account.accountId || identity.account.id), sessionDigest:sessionToken?digestToken(sessionToken):"", expiresAt:now+TTL });
          return {...track,audioName:`/api/media/full/${ticket}`,audio:`/api/media/full/${ticket}`};
        }
        return {...track,audioName:preview,audio:preview};
      });
      const output={...publicPackMetadata(pack),tracks:withAudio.map(track=>{
        const safe={...track};
        delete safe.downloadZip; delete safe.fileKey; delete safe.storageKey;
        return safe;
      })};
      if(!tracks.length && (pack.audioName||pack.audio)) {
        const preview=`/api/media/preview/${encodeURIComponent(pack.id)}/single`;
        output.audioName=preview;output.audio=preview;
      }
      return output;
    });
  }
  function findTrack(packs, packId, trackId) {
    const pack=packs.find(x=>String(x.id)===String(packId));
    if(!pack) return null;
    const tracks=Array.isArray(pack.tracks)&&pack.tracks.length?pack.tracks:[pack];
    const track=tracks.find(x=>String(x === pack ? "single" : (x.id||"single"))===String(trackId));
    return track ? {pack,track,source:normalizedKey(track.audioName||track.audio)} : null;
  }
  async function preview(req,res) {
    try {
      const entry=findTrack(await readPacks(),req.params.packId,req.params.trackId);
      if(!entry || !isApproved(entry.pack) || !entry.source) return res.status(404).json({success:false,code:"PREVIEW_NOT_FOUND"});
      const start=Math.max(0,Number.isFinite(Number(entry.track.previewStart)) ? Number(entry.track.previewStart) : 0);
      const duration=Math.max(1,Math.min(30,Number(entry.track.previewDuration)||30));
      const key=crypto.createHash("sha256").update(JSON.stringify([entry.source,start,duration,"5s-fade-v1"])).digest("hex");
      const now=Date.now();
      const cached=previewCache.get(key);
      if (cached && cached.expiresAt > now && fs.existsSync(cached.file)) {
        res.setHeader("Content-Type","audio/mpeg");res.setHeader("Cache-Control","private, no-store");
        return res.sendFile(cached.file);
      }
      // Limit the maximum simultaneous CPU/IO-heavy ffmpeg conversions.
      if (!previewPending.has(key) && previewPending.size >= 4) {
        res.setHeader("Retry-After","3");
        return res.status(429).json({success:false,code:"PREVIEW_BUSY",message:"Aperçu momentanément occupé."});
      }
      if (!previewPending.has(key)) {
        const promise=(async()=>{
          const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sonara-secure-preview-"));
          try {
            const input=path.join(directory,"original"+path.extname(entry.source));
            const output=path.join(directory,"preview.mp3");
            await getInput(entry.source,input);
            await renderAudioPreview({inputPath:input,outputPath:output,start,duration});
            try{fs.rmSync(input,{force:true});}catch{}
            previewCache.set(key,{file:output,directory,expiresAt:Date.now()+5*60*1000});
            // A small bounded temporary cache prevents N downloads/encodes for N listeners.
            for(const [cacheKey,item] of previewCache) {
              if(item.expiresAt>Date.now() && previewCache.size<=64) continue;
              previewCache.delete(cacheKey);
              if(cacheKey!==key) try{fs.rmSync(item.directory,{recursive:true,force:true});}catch{}
            }
            return output;
          } catch(err) {
            try{fs.rmSync(directory,{recursive:true,force:true});}catch{}
            throw err;
          }
        })().finally(()=>previewPending.delete(key));
        previewPending.set(key,promise);
      }
      const file=await previewPending.get(key);
      res.setHeader("Content-Type","audio/mpeg");res.setHeader("Cache-Control","private, no-store");
      return res.sendFile(file);
    } catch(err) {
      console.error("[MEDIA] Preview indisponible:",err.message);
      if(!res.headersSent) return res.status(503).json({success:false,code:"PREVIEW_UNAVAILABLE"});
    }
  }
  async function full(req,res) {
    const token=String(req.params.ticket||"");
    const ticket=tickets.get(token);
    if(!ticket || ticket.expiresAt<=Date.now()) return res.status(403).json({success:false,code:"MEDIA_TICKET_EXPIRED"});
    try {
      // Native <audio> doesn't attach a bearer header. The ticket is an opaque,
      // short-lived capability. Recheck ownership on every range request.
      const entry=findTrack(await readPacks(),ticket.packId,ticket.trackId);
      if(!entry || !isApproved(entry.pack)) return res.status(404).end();
      const identity = await getAccountById(ticket.accountId);
      if (!identity?.account || !purchased(identity.account, entry.pack, entry.track) ||
          (ticket.sessionDigest && !findSession(identity.account,ticket.sessionDigest)) ||
          ["banned","suspended","rejected"].includes(String(identity.account.status||"").toLowerCase())) {
        tickets.delete(token);
        return res.status(403).json({success:false,code:"MEDIA_ACCESS_REVOKED"});
      }
      if (!entry.source) return res.status(404).end();
      res.setHeader("Cache-Control","private, no-store");
      return await sendOriginal(entry.source,req,res);
    } catch(err) {
      console.error("[MEDIA] Lecture protégée impossible:",err.message);
      if(!res.headersSent) return res.status(503).json({success:false,code:"MEDIA_UNAVAILABLE"});
    }
  }
  async function blockRaw(req,res,next) {
    const key=normalizedKey(req.path);
    const basename=path.posix.basename(key);
    if(!key || key.includes("..") || basename.startsWith(".")) return res.status(404).end();
    // Only public images; all original audio and project archives stay private.
    if(isPublicImageKey(key)) return next();
    // A non-public image is private too (e.g. feedback evidence JPEG).
    if(!isPublicImageKey(key)) {
      const audio=PRIVATE_EXT.test(key) ? findAudioByKey(await readPacks(),key) : null;
      if(audio && isApproved(audio.pack) && /\.(?:mp3|wav|flac|ogg|m4a|aac|aiff?)$/i.test(key)) {
        return res.redirect(307,`/api/media/preview/${encodeURIComponent(audio.pack.id)}/${encodeURIComponent(audio.track===audio.pack ? "single" : (audio.track.id||"single"))}`);
      }
      return res.status(403).json({success:false,code:"PRIVATE_ASSET",message:"Fichier privé : autorisation requise."});
    }
    return next();
  }
  function mount(app) {
    app.get("/api/media/preview/:packId/:trackId",preview);
    app.get("/api/media/full/:ticket",full);
    app.use("/uploads",(req,res,next)=>{Promise.resolve(blockRaw(req,res,next)).catch(()=>res.status(503).end());});
  }
  return {catalogue,mount,findTrack,purchased};
}
module.exports={createPrivateMedia,normalizedKey,isApproved,purchased,findAudioByKey,isPublicImageKey,publicPackMetadata};
