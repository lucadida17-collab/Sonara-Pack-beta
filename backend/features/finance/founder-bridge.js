const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function registerFounderBridge(options) {
  const { app, db, usersCollection, packsCollection, sanitizeAccount, findRootAndAccountById, saveAccountState } = options;
  const isMongo = Boolean(db && usersCollection && packsCollection);
  const dataDir = options.dataDir || path.resolve(__dirname, "../../../data");
  const usersPath = options.usersPath || path.join(dataDir, "users.json");
  const packsPath = options.packsPath || path.join(dataDir, "pendingPacks.json");
  const notificationsPath = path.join(dataDir, "founder-notifications.json");
  const supportPath = path.join(dataDir, "support-tickets.json");

  fs.mkdirSync(dataDir, { recursive: true });
  for (const file of [notificationsPath, supportPath]) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, "[]", "utf8");
  }

  const readJson = (file, fallback = []) => {
    try { return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
  const clean = (doc) => { if (!doc) return doc; const { _id, ...rest } = doc; return rest; };

  const notificationCollection = isMongo ? db.collection("founder_notifications") : null;
  const supportCollection = isMongo ? db.collection("support_tickets") : null;

  function requireFounderKey(req, res, next) {
    const expected = String(process.env.FOUNDER_ACCESS_KEY || "").trim();
    const received = String(req.get("x-founder-key") || "").trim();
    const valid = expected && received && expected.length === received.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    if (!expected) return res.status(503).json({ success: false, message: "FOUNDER_ACCESS_KEY absente sur Sonara." });
    if (!valid) return res.status(401).json({ success: false, message: "Clé Founder invalide." });
    next();
  }

  async function createFounderNotification(input = {}) {
    const item = {
      id: `notif_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      type: input.type || "system",
      title: input.title || "Nouvelle activité Sonara",
      message: input.message || "",
      entityId: input.entityId || null,
      read: false,
      createdAt: new Date().toISOString()
    };
    if (isMongo) await notificationCollection.insertOne(item);
    else { const items = readJson(notificationsPath); items.unshift(item); writeJson(notificationsPath, items.slice(0, 500)); }
    if (typeof app.locals.sendFounderAlert === "function") {
      Promise.resolve(app.locals.sendFounderAlert(item)).catch(error => console.error("Alerte Founder :", error));
    }
    return item;
  }
  app.locals.createFounderNotification = createFounderNotification;

  async function getRoots() { return isMongo ? usersCollection.find({}).toArray() : readJson(usersPath); }
  async function getPacks() { return isMongo ? packsCollection.find({}).toArray() : readJson(packsPath); }
  const flattenAccounts = roots => roots.flatMap(root => (root.accounts || [root]).map(account => ({ ...account, userId: root.id || account.userId })));

  app.get("/api/founder/health", requireFounderKey, async (_req, res) => {
    if (isMongo) await db.command({ ping: 1 });
    res.json({ success: true, service: "sonara-pack", storage: isMongo ? "mongodb" : "json-local", now: new Date().toISOString() });
  });

  app.get("/api/founder/overview", requireFounderKey, async (_req, res) => {
    const roots = await getRoots(); const packs = await getPacks(); const accounts = flattenAccounts(roots);
    const notifications = isMongo ? await notificationCollection.find({ read: false }).toArray() : readJson(notificationsPath).filter(x => !x.read);
    const tickets = isMongo ? await supportCollection.find({ status: { $in: ["open", "in_progress"] } }).toArray() : readJson(supportPath).filter(x => ["open", "in_progress"].includes(x.status));
    res.json({ success: true, stats: {
      users: accounts.length,
      pendingArtists: accounts.filter(a => a.status === "pending" && ["artist", "both"].includes(a.role)).length,
      pendingPacks: packs.filter(p => p.status === "pending").length,
      approvedPacks: packs.filter(p => p.status === "approved").length,
      unreadNotifications: notifications.length,
      openTickets: tickets.length
    }});
  });

  app.get("/api/founder/notifications", requireFounderKey, async (_req, res) => {
    const items = isMongo ? await notificationCollection.find({}).sort({ createdAt: -1 }).limit(200).toArray() : readJson(notificationsPath).slice(0, 200);
    res.json({ success: true, items: items.map(clean) });
  });
  app.patch("/api/founder/notifications/read-all", requireFounderKey, async (_req, res) => {
    const now = new Date().toISOString();
    if (isMongo) await notificationCollection.updateMany({ read: false }, { $set: { read: true, readAt: now } });
    else writeJson(notificationsPath, readJson(notificationsPath).map(x => ({ ...x, read: true, readAt: x.readAt || now })));
    res.json({ success: true });
  });
  app.patch("/api/founder/notifications/:id/read", requireFounderKey, async (req, res) => {
    const now = new Date().toISOString();
    if (isMongo) await notificationCollection.updateOne({ id: req.params.id }, { $set: { read: true, readAt: now } });
    else writeJson(notificationsPath, readJson(notificationsPath).map(x => x.id === req.params.id ? { ...x, read: true, readAt: now } : x));
    res.json({ success: true });
  });

  app.get("/api/founder/moderation/artists", requireFounderKey, async (_req, res) => {
    const items = flattenAccounts(await getRoots()).filter(a => a.status === "pending" && ["artist", "both"].includes(a.role));
    res.json({ success: true, items: items.map(a => typeof sanitizeAccount === "function" ? sanitizeAccount(a, a.userId) : clean(a)) });
  });
  app.get("/api/founder/moderation/packs", requireFounderKey, async (_req, res) => {
    res.json({ success: true, items: (await getPacks()).filter(p => p.status === "pending").map(clean) });
  });

  app.patch("/api/founder/moderation/artists/:id/status", requireFounderKey, async (req, res) => {
    const status = String(req.body.status || "");
    if (!['approved','rejected','pending'].includes(status)) return res.status(400).json({ success:false, message:"Statut invalide." });
    if (isMongo) {
      const result = await findRootAndAccountById(req.params.id);
      if (!result?.account) return res.status(404).json({ success:false, message:"Artiste introuvable." });
      result.account.status = status; result.account.moderatedAt = new Date().toISOString();
      await saveAccountState(result.rootUser, result.account);
      await createFounderNotification({ type:"moderation", title:"Artiste modéré", message:`${result.account.pseudo || result.account.mail} : ${status}`, entityId:req.params.id });
      return res.json({ success:true, account: sanitizeAccount(result.account, result.rootUser.id) });
    }
    const roots = readJson(usersPath); let found = null;
    for (const root of roots) for (const account of root.accounts || [root]) if ([account.id, account.accountId, root.id].map(String).includes(String(req.params.id))) { account.status=status; account.moderatedAt=new Date().toISOString(); found=account; }
    if (!found) return res.status(404).json({ success:false, message:"Artiste introuvable." });
    writeJson(usersPath, roots); await createFounderNotification({ type:"moderation", title:"Artiste modéré", message:`${found.pseudo || found.mail} : ${status}`, entityId:req.params.id });
    res.json({ success:true, account: clean(found) });
  });

  app.patch("/api/founder/moderation/packs/:id/status", requireFounderKey, async (req, res) => {
    const status = String(req.body.status || ""); const now = new Date().toISOString(); let pack;
    if (isMongo) { const result=await packsCollection.updateOne({ id:req.params.id },{$set:{status,moderatedAt:now}}); if(!result.matchedCount) return res.status(404).json({success:false,message:"Pack introuvable."}); pack=await packsCollection.findOne({id:req.params.id}); }
    else { const packs=readJson(packsPath); pack=packs.find(p=>String(p.id)===String(req.params.id)); if(!pack) return res.status(404).json({success:false,message:"Pack introuvable."}); pack.status=status; pack.moderatedAt=now; writeJson(packsPath,packs); }
    await createFounderNotification({type:"moderation",title:"Pack modéré",message:`${pack.title || pack.name || pack.id} : ${status}`,entityId:req.params.id});
    res.json({success:true,pack:clean(pack)});
  });

  app.get("/api/founder/support", requireFounderKey, async (_req, res) => {
    const items = isMongo ? await supportCollection.find({}).sort({ createdAt:-1 }).limit(200).toArray() : readJson(supportPath).slice(0,200);
    res.json({success:true,items:items.map(clean)});
  });
  app.patch("/api/founder/support/:id/status", requireFounderKey, async (req,res) => {
    const status=String(req.body.status || "open"); const now=new Date().toISOString();
    if(isMongo){const result=await supportCollection.updateOne({$or:[{id:req.params.id},{ticketId:req.params.id}]},{$set:{status,updatedAt:now}});if(!result.matchedCount)return res.status(404).json({success:false,message:"Ticket introuvable."});}
    else {const items=readJson(supportPath);const item=items.find(x=>[x.id,x.ticketId].map(String).includes(String(req.params.id)));if(!item)return res.status(404).json({success:false,message:"Ticket introuvable."});item.status=status;item.updatedAt=now;writeJson(supportPath,items);}
    res.json({success:true});
  });

  app.post("/api/support/tickets", async (req,res) => {
    const ticket={id:`ticket_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,name:String(req.body.name||"").trim(),email:String(req.body.email||"").trim().toLowerCase(),subject:String(req.body.subject||"").trim(),message:String(req.body.message||"").trim(),status:"open",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; ticket.ticketId=ticket.id;
    if(!ticket.email||!ticket.message)return res.status(400).json({success:false,message:"E-mail et message obligatoires."});
    if(isMongo)await supportCollection.insertOne(ticket);else{const items=readJson(supportPath);items.unshift(ticket);writeJson(supportPath,items);}
    await createFounderNotification({type:"support",title:"Nouveau ticket support",message:ticket.subject||ticket.email,entityId:ticket.id});
    res.status(201).json({success:true,ticket:clean(ticket)});
  });

  return { createFounderNotification };
}
module.exports = { registerFounderBridge };
