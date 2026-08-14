const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RUNTIME_ENVIRONMENTS = new Set(["local", "test", "main"]);
const FINANCIAL_ENVIRONMENTS = new Set(["local", "test", "test_legacy", "main"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "succeeded", "paid", "completed"]);
const DEFAULT_RECONCILE_LIMIT = 500;
const FULL_HISTORY_RECONCILE_LIMIT = 5000;
const RECONCILE_CACHE_MS = 10000;
const DEFAULT_COMMISSION_RATE = 0.20;

function asCents(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function cleanDocument(item = {}) {
  if (!item || typeof item !== "object") return null;
  const { _id, ...clean } = item;
  return clean;
}

function normalizeRuntimeEnvironment(value) {
  const environment = String(value || "local").trim().toLowerCase();
  if (!RUNTIME_ENVIRONMENTS.has(environment)) {
    throw new Error(`Environnement financier Sonara invalide : ${environment}.`);
  }
  return environment;
}

function normalizeFinancialEnvironment(value) {
  const environment = String(value || "").trim().toLowerCase();
  return FINANCIAL_ENVIRONMENTS.has(environment) ? environment : "";
}

function explicitCheckoutEnvironment(metadata = {}) {
  return normalizeFinancialEnvironment(
    metadata.sonaraEnvironment || metadata.sonara_environment || ""
  );
}

function environmentFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    const full = `${hostname}${parsed.pathname}`.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1") return "local";
    if (
      full.includes("sonarapack-test") ||
      full.includes("sonara-pack-beta") ||
      full.includes("sonarapack-beta") ||
      full.includes("/test/") ||
      full.includes("staging")
    ) return "test";
    if (hostname === "sonarapack.com" || hostname === "www.sonarapack.com") return "main";
  } catch {
    return "";
  }

  return "";
}

function inferCheckoutEnvironment(session = {}, metadata = {}, runtimeEnvironment = "test") {
  const explicit = explicitCheckoutEnvironment(metadata);
  if (explicit && explicit !== "test_legacy") {
    return { environment: explicit, source: "metadata", hint: explicit };
  }

  const possibleUrls = [
    session.success_url,
    session.cancel_url,
    session.after_completion?.redirect?.url,
    metadata.successUrl,
    metadata.cancelUrl,
    metadata.frontendUrl,
    metadata.frontendOrigin
  ];
  const hint = possibleUrls.map(environmentFromUrl).find(Boolean) || "";

  // Les anciens paiements Stripe TEST sans métadonnée sont volontairement non classés.
  // Ils n'appartiennent ni arbitrairement à LOCAL ni arbitrairement au serveur TEST.
  if (session.livemode === false && runtimeEnvironment === "test") {
    return { environment: "test_legacy", source: "stripe_test_legacy", hint };
  }

  return { environment: "", source: "missing", hint };
}

function isSonaraCheckout(session = {}, paymentIntent = {}, metadata = {}) {
  const hasSonaraMetadata = Boolean(
    String(metadata.sonaraSource || "").toUpperCase() === "SONARA_PACK" ||
    String(metadata.packId || "").trim() ||
    String(metadata.artistId || "").trim() ||
    String(metadata.purchaseType || "").trim() ||
    String(metadata.sonaraCommissionCents || "").trim() ||
    String(metadata.sonaraCommissionRate || "").trim()
  );
  const urls = [session.success_url, session.cancel_url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const hasSonaraUrl = urls.includes("sonara");
  const hasPlatformCommission = asCents(paymentIntent.application_fee_amount) > 0;
  return hasSonaraMetadata || (hasSonaraUrl && hasPlatformCommission);
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["succeeded", "paid", "complete", "completed", "confirmed"].includes(status)) return "confirmed";
  if (["pending", "requires_action", "processing", "requested"].includes(status)) return "pending";
  if (["failed", "failure"].includes(status)) return "failed";
  if (["canceled", "cancelled"].includes(status)) return "cancelled";
  return status || "pending";
}

function movementCountsInNet(movement) {
  return movement.affectsNet !== false && CONFIRMED_STATUSES.has(normalizeStatus(movement.status));
}

function movementSignedAmount(movement) {
  if (!movementCountsInNet(movement)) return 0;
  return String(movement.direction || "").toUpperCase() === "OUT"
    ? -asCents(movement.amountCents)
    : asCents(movement.amountCents);
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function registerFounderFinance({ app, stripe, environment, db = null, dataDir, enabled = true }) {
  const runtimeEnvironment = normalizeRuntimeEnvironment(environment);
  const isMongo = Boolean(db);
  const movementsCollection = isMongo ? db.collection("founder_finance_movements") : null;
  const legacyTransactionsCollection = isMongo ? db.collection("founder_finance_transactions") : null;
  const eventsCollection = isMongo ? db.collection("founder_finance_events") : null;
  const baseDataDir = dataDir || path.resolve(__dirname, "../../../data");
  const movementsPath = path.join(baseDataDir, `founder-finance-movements-${runtimeEnvironment}.json`);
  const eventsPath = path.join(baseDataDir, `founder-finance-events-${runtimeEnvironment}.json`);
  const legacyPath = path.join(baseDataDir, `founder-finance-${runtimeEnvironment}.json`);

  let lastReconcileAt = 0;
  let reconcilePromise = null;
  let lastReconcileResult = {
    scanned: 0,
    matched: 0,
    legacyMatched: 0,
    recorded: 0,
    updated: 0,
    skipped: 0,
    unresolved: 0,
    errors: [],
    completedAt: null,
    environment: runtimeEnvironment
  };

  // Le miroir JSON reste disponible même avec MongoDB : il garantit la continuité
  // pendant une panne temporaire puis permet une reprise idempotente.
  fs.mkdirSync(baseDataDir, { recursive: true });
  for (const filePath of [movementsPath, eventsPath]) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
  }

  function readArray(filePath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeArray(filePath, items) {
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(items, null, 2), "utf8");
    try {
      fs.renameSync(temporaryPath, filePath);
    } catch {
      fs.copyFileSync(temporaryPath, filePath);
      fs.rmSync(temporaryPath, { force: true });
    }
  }

  function upsertJsonMovement(movement) {
    const items = readArray(movementsPath);
    const index = items.findIndex((item) => item.externalKey === movement.externalKey);
    if (index >= 0) items[index] = { ...items[index], ...movement };
    else items.push(movement);
    writeArray(movementsPath, items);
  }

  function upsertJsonEvent(record) {
    const items = readArray(eventsPath);
    const index = items.findIndex((item) => item.stripeEventId === record.stripeEventId);
    if (index >= 0) items[index] = { ...items[index], ...record };
    else items.push(record);
    writeArray(eventsPath, items);
  }

  function mongoUpsertDocument(record = {}) {
    const { createdAt, ...mutableFields } = record || {};
    return {
      $set: mutableFields,
      $setOnInsert: {
        createdAt: createdAt || new Date().toISOString()
      }
    };
  }

  async function ensureMongoIndexesSafely() {
    if (!isMongo) return { enabled: false, reason: "json_storage" };

    // Rejoue les écritures du secours JSON après une panne MongoDB.
    for (const movement of readArray(movementsPath)) {
      if (!movement?.externalKey) continue;
      await movementsCollection.updateOne(
        { externalKey: movement.externalKey },
        mongoUpsertDocument(movement),
        { upsert: true }
      );
    }
    for (const event of readArray(eventsPath)) {
      if (!event?.stripeEventId) continue;
      await eventsCollection.updateOne(
        { stripeEventId: event.stripeEventId },
        mongoUpsertDocument(event),
        { upsert: true }
      );
    }

    const duplicateMovementKeys = await movementsCollection.aggregate([
      { $match: { externalKey: { $type: "string", $ne: "" } } },
      { $group: { _id: "$externalKey", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 }
    ]).toArray();
    const duplicateEvents = await eventsCollection.aggregate([
      { $match: { stripeEventId: { $type: "string", $ne: "" } } },
      { $group: { _id: "$stripeEventId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 }
    ]).toArray();

    const created = [];
    if (!duplicateMovementKeys.length) {
      await movementsCollection.createIndex(
        { externalKey: 1 },
        { unique: true, sparse: true, name: "uniq_founder_finance_external_key" }
      );
      created.push("uniq_founder_finance_external_key");
    }
    if (!duplicateEvents.length) {
      await eventsCollection.createIndex(
        { stripeEventId: 1 },
        { unique: true, sparse: true, name: "uniq_founder_finance_stripe_event" }
      );
      created.push("uniq_founder_finance_stripe_event");
    }
    await movementsCollection.createIndex(
      { environment: 1, occurredAt: -1 },
      { name: "founder_finance_environment_occurred_at" }
    );
    await movementsCollection.createIndex(
      { stripePaymentIntentId: 1, category: 1 },
      { sparse: true, name: "founder_finance_payment_category" }
    );
    await movementsCollection.createIndex(
      { stripeRefundId: 1, category: 1 },
      { sparse: true, name: "founder_finance_refund_category" }
    );

    return {
      enabled: true,
      created,
      skippedUniqueMovementIndex: duplicateMovementKeys.length > 0,
      skippedUniqueEventIndex: duplicateEvents.length > 0
    };
  }

  ensureMongoIndexesSafely().catch((error) => {
    console.warn("Index financiers Founder non créés immédiatement :", error.message);
  });

  function requireFounderFinance(req, res, next) {
    const expectedKey = String(process.env.FOUNDER_ACCESS_KEY || "").trim();
    const receivedKey = String(req.get("x-founder-key") || "").trim();
    const requestedEnvironment = String(
      req.get("x-founder-environment") || runtimeEnvironment
    ).toLowerCase();

    if (!expectedKey) {
      return res.status(503).json({ success: false, message: "FOUNDER_ACCESS_KEY absente sur Sonara." });
    }
    if (!safeEqual(expectedKey, receivedKey)) {
      return res.status(401).json({ success: false, message: "Clé Founder invalide." });
    }
    if (requestedEnvironment !== runtimeEnvironment) {
      return res.status(409).json({
        success: false,
        message: `Environnements incompatibles : Founder ${requestedEnvironment} ne peut pas lire Sonara ${runtimeEnvironment}.`,
        environment: runtimeEnvironment
      });
    }
    next();
  }

  function allowedFinancialEnvironments() {
    return runtimeEnvironment === "test" ? ["test", "test_legacy"] : [runtimeEnvironment];
  }

  async function listMovements({ limit = 5000, environment: requestedEnvironment = "", since = "", category = "", status = "" } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 10000);
    const allowed = allowedFinancialEnvironments();
    const selected = normalizeFinancialEnvironment(requestedEnvironment);
    const environments = selected && allowed.includes(selected) ? [selected] : allowed;

    if (isMongo) {
      const query = { environment: { $in: environments } };
      if (since && !Number.isNaN(new Date(since).getTime())) query.updatedAt = { $gt: new Date(since).toISOString() };
      if (category) query.category = String(category).toUpperCase();
      if (status) query.status = normalizeStatus(status);
      try {
        const items = (await movementsCollection.find(query)
          .sort({ occurredAt: -1, createdAt: -1 })
          .limit(safeLimit)
          .toArray()).map(cleanDocument);
        items.forEach(upsertJsonMovement);
        return items;
      } catch (error) {
        console.warn(`MongoDB ${runtimeEnvironment.toUpperCase()} indisponible pour le registre, lecture du miroir JSON :`, error.message);
      }
    }

    return readArray(movementsPath)
      .filter((item) => environments.includes(String(item.environment || "").toLowerCase()))
      .filter((item) => !since || String(item.updatedAt || "") > String(since))
      .filter((item) => !category || String(item.category || "").toUpperCase() === String(category).toUpperCase())
      .filter((item) => !status || normalizeStatus(item.status) === normalizeStatus(status))
      .sort((a, b) => String(b.occurredAt || b.createdAt || "").localeCompare(String(a.occurredAt || a.createdAt || "")))
      .slice(0, safeLimit);
  }

  async function findMovement(query = {}) {
    const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (!entries.length) return null;
    if (isMongo) {
      try {
        const found = cleanDocument(await movementsCollection.findOne(Object.fromEntries(entries)));
        if (found) return found;
      } catch (error) {
        console.warn(`MongoDB ${runtimeEnvironment.toUpperCase()} indisponible pour la recherche financière :`, error.message);
      }
    }
    return readArray(movementsPath).find((item) => entries.every(([key, value]) => String(item[key] ?? "") === String(value))) || null;
  }

  async function upsertMovement(input) {
    const now = new Date().toISOString();
    const environment = normalizeFinancialEnvironment(input.environment);
    if (!environment || !allowedFinancialEnvironments().includes(environment)) {
      throw new Error(`Mouvement ${input.environment || "inconnu"} refusé par Sonara ${runtimeEnvironment.toUpperCase()}.`);
    }
    const movement = {
      id: String(input.id || createId("finance_move")),
      externalKey: String(input.externalKey || "").trim(),
      direction: String(input.direction || "IN").toUpperCase() === "OUT" ? "OUT" : "IN",
      category: String(input.category || "OTHER").trim().toUpperCase(),
      source: String(input.source || "SONARA_PACK").trim().toUpperCase(),
      environment,
      status: normalizeStatus(input.status),
      amountCents: asCents(input.amountCents),
      currency: String(input.currency || "eur").trim().toLowerCase(),
      affectsNet: input.affectsNet !== false,
      occurredAt: input.occurredAt || now,
      createdAt: input.createdAt || now,
      updatedAt: now,
      stripeEventIds: Array.from(new Set((Array.isArray(input.stripeEventIds) ? input.stripeEventIds : []).filter(Boolean).map(String))),
      stripeEventId: String(input.stripeEventId || (Array.isArray(input.stripeEventIds) ? input.stripeEventIds.find(Boolean) : "") || ""),
      stripeCheckoutSessionId: String(input.stripeCheckoutSessionId || ""),
      stripePaymentIntentId: String(input.stripePaymentIntentId || ""),
      stripeChargeId: String(input.stripeChargeId || ""),
      stripeApplicationFeeId: String(input.stripeApplicationFeeId || ""),
      stripeBalanceTransactionId: String(input.stripeBalanceTransactionId || ""),
      stripeRefundId: String(input.stripeRefundId || ""),
      sonaraOrderId: String(input.sonaraOrderId || ""),
      packId: String(input.packId || ""),
      packTitleSnapshot: String(input.packTitleSnapshot || ""),
      trackId: String(input.trackId || ""),
      trackTitleSnapshot: String(input.trackTitleSnapshot || ""),
      artistId: String(input.artistId || ""),
      artistNameSnapshot: String(input.artistNameSnapshot || ""),
      buyerId: String(input.buyerId || ""),
      description: String(input.description || "").slice(0, 1000),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
    };

    if (!movement.externalKey) throw new Error("Clé d’idempotence financière absente.");
    if (!movement.amountCents && movement.status === "confirmed") {
      throw new Error("Montant financier confirmé absent.");
    }

    const existing = await findMovement({ externalKey: movement.externalKey });
    if (existing) {
      movement.id = existing.id;
      movement.createdAt = existing.createdAt || movement.createdAt;
      movement.stripeEventIds = Array.from(new Set([
        ...(Array.isArray(existing.stripeEventIds) ? existing.stripeEventIds : []),
        ...movement.stripeEventIds
      ]));
    }

    if (isMongo) {
      try {
        await movementsCollection.updateOne(
          { externalKey: movement.externalKey },
          mongoUpsertDocument(movement),
          { upsert: true }
        );
      } catch (error) {
        console.warn(`Écriture MongoDB ${runtimeEnvironment.toUpperCase()} impossible, mouvement conservé en JSON :`, error.message);
      }
    }

    upsertJsonMovement(movement);
    return { movement, created: !existing };
  }

  async function registerStripeEvent(event, state = "processing", errorMessage = "") {
    const eventId = String(event?.id || "").trim();
    if (!eventId) return { duplicate: false, eventId: "" };
    const now = new Date();
    const jsonExisting = readArray(eventsPath).find((item) => item.stripeEventId === eventId) || null;
    let mongoExisting = null;

    if (isMongo) {
      try {
        mongoExisting = cleanDocument(await eventsCollection.findOne({ stripeEventId: eventId }));
      } catch (error) {
        console.warn(`Lecture de l'idempotence Stripe impossible dans MongoDB ${runtimeEnvironment.toUpperCase()} :`, error.message);
      }
    }

    const existing = mongoExisting || jsonExisting;
    if (state === "processing" && existing?.status === "processed") {
      return { duplicate: true, eventId, status: "processed" };
    }
    if (state === "processing" && existing?.status === "processing") {
      const lockedAt = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      if (Number.isFinite(lockedAt) && now.getTime() - lockedAt < 30000) {
        return { duplicate: true, eventId, status: "processing" };
      }
    }

    const record = {
      stripeEventId: eventId,
      type: String(event.type || existing?.type || ""),
      environment: runtimeEnvironment,
      livemode: event.livemode === true,
      status: state,
      attempts: state === "processing" ? asCents(existing?.attempts) + 1 : asCents(existing?.attempts) || 1,
      lastError: errorMessage ? String(errorMessage).slice(0, 1000) : "",
      createdAt: existing?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      processedAt: state === "processed" ? now.toISOString() : existing?.processedAt || null
    };

    if (isMongo) {
      try {
        await eventsCollection.updateOne(
          { stripeEventId: eventId },
          mongoUpsertDocument(record),
          { upsert: true }
        );
      } catch (error) {
        if (error?.code === 11000 && state === "processing") {
          return { duplicate: true, eventId, status: "processing" };
        }
        console.warn(`Écriture de l'idempotence Stripe impossible dans MongoDB ${runtimeEnvironment.toUpperCase()} :`, error.message);
      }
    }

    upsertJsonEvent(record);
    return { duplicate: false, eventId, status: state };
  }

  async function annotateDeletedPacks(items = []) {
    const packIds = Array.from(new Set(items.map((item) => String(item.packId || "").trim()).filter(Boolean)));
    if (!packIds.length) return items;
    let existingIds = null;

    if (isMongo) {
      try {
        const existing = await db.collection("packs")
          .find({ id: { $in: packIds } }, { projection: { id: 1 } })
          .toArray();
        existingIds = new Set(existing.map((pack) => String(pack.id || "")));
      } catch (error) {
        console.warn(`Impossible de vérifier les packs supprimés dans MongoDB ${runtimeEnvironment.toUpperCase()} :`, error.message);
      }
    } else {
      try {
        const packsPath = path.join(baseDataDir, "pendingPacks.json");
        if (fs.existsSync(packsPath)) {
          existingIds = new Set(readArray(packsPath).map((pack) => String(pack.id || "")));
        }
      } catch { /* l'historique reste visible sans étiquette supprimée */ }
    }

    if (!existingIds) return items;
    return items.map((item) => item.packId && !existingIds.has(String(item.packId))
      ? { ...item, metadata: { ...(item.metadata || {}), packDeleted: true } }
      : item);
  }

  async function resolvePaymentIntent(session) {
    let paymentIntent = session?.payment_intent || null;
    if (typeof paymentIntent === "string") {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent, {
        expand: ["latest_charge", "latest_charge.balance_transaction"]
      });
    }
    return paymentIntent && typeof paymentIntent === "object" ? paymentIntent : null;
  }

  function mergeCheckoutMetadata(session, paymentIntent) {
    return { ...(paymentIntent?.metadata || {}), ...(session?.metadata || {}) };
  }

  function assertStripeMode(session, financialEnvironment) {
    const isLive = session?.livemode === true;
    if (financialEnvironment === "main" && !isLive) {
      throw new Error("Paiement Stripe TEST refusé dans MAIN.");
    }
    if (["local", "test", "test_legacy"].includes(financialEnvironment) && isLive) {
      throw new Error(`Paiement Stripe LIVE refusé dans ${financialEnvironment.toUpperCase()}.`);
    }
  }

  async function inspectCheckoutEnvironment(session) {
    if (!session || !session.id) throw new Error("Session Stripe absente.");
    const paymentIntent = await resolvePaymentIntent(session);
    const metadata = mergeCheckoutMetadata(session, paymentIntent);
    const inferred = inferCheckoutEnvironment(session, metadata, runtimeEnvironment);
    const checkoutEnvironment = inferred.environment;

    if (!checkoutEnvironment) {
      throw new Error("Environnement Sonara absent : transaction refusée pour éviter tout mélange LOCAL / TEST / MAIN.");
    }
    const allowed = allowedFinancialEnvironments();
    if (!allowed.includes(checkoutEnvironment)) {
      throw new Error(`Paiement ${checkoutEnvironment.toUpperCase()} refusé par Sonara ${runtimeEnvironment.toUpperCase()}.`);
    }
    assertStripeMode(session, checkoutEnvironment);
    return { paymentIntent, metadata, checkoutEnvironment, environmentSource: inferred.source, environmentHint: inferred.hint };
  }

  async function retrieveChargeAndFee(paymentIntent) {
    let latestCharge = paymentIntent?.latest_charge || null;
    if (typeof latestCharge === "string") {
      latestCharge = await stripe.charges.retrieve(latestCharge, { expand: ["balance_transaction"] });
    } else if (latestCharge && typeof latestCharge === "object" && typeof latestCharge.balance_transaction === "string") {
      try {
        latestCharge.balance_transaction = await stripe.balanceTransactions.retrieve(latestCharge.balance_transaction);
      } catch {
        // Le paiement reste exploitable même si le détail des frais est temporairement indisponible.
      }
    }

    let applicationFee = latestCharge?.application_fee || null;
    if (typeof applicationFee === "string") {
      try {
        applicationFee = await stripe.applicationFees.retrieve(applicationFee, { expand: ["balance_transaction"] });
      } catch {
        applicationFee = null;
      }
    }
    return { latestCharge, applicationFee };
  }

  async function snapshotFromMetadata(metadata = {}, session = {}) {
    const snapshot = {
      sonaraOrderId: String(metadata.orderId || session.client_reference_id || ""),
      packId: String(metadata.packId || ""),
      packTitleSnapshot: String(metadata.packTitleSnapshot || metadata.packTitle || ""),
      trackId: String(metadata.trackId || ""),
      trackTitleSnapshot: String(metadata.trackTitleSnapshot || metadata.trackTitle || ""),
      artistId: String(metadata.artistId || ""),
      artistNameSnapshot: String(metadata.artistNameSnapshot || metadata.artistName || ""),
      buyerId: String(metadata.userId || session.client_reference_id || "")
    };

    // Les anciens paiements n'avaient pas encore les snapshots dans metadata.
    // Stripe conserve cependant le libellé acheté dans les line items : on le fige
    // dans le registre pour que la suppression future du pack ne casse jamais l'historique.
    if ((!snapshot.packTitleSnapshot || (snapshot.trackId && !snapshot.trackTitleSnapshot)) && session?.id) {
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const purchasedLabel = String(lineItems?.data?.[0]?.description || "").trim();
        if (purchasedLabel) {
          const purchaseType = String(metadata.purchaseType || (snapshot.trackId ? "track" : "pack")).toLowerCase();
          if (purchaseType === "track") {
            const separatorIndex = purchasedLabel.lastIndexOf(" - ");
            if (separatorIndex > 0) {
              if (!snapshot.trackTitleSnapshot) snapshot.trackTitleSnapshot = purchasedLabel.slice(0, separatorIndex).trim();
              if (!snapshot.packTitleSnapshot) snapshot.packTitleSnapshot = purchasedLabel.slice(separatorIndex + 3).trim();
            } else if (!snapshot.trackTitleSnapshot) {
              snapshot.trackTitleSnapshot = purchasedLabel;
            }
          } else if (!snapshot.packTitleSnapshot) {
            snapshot.packTitleSnapshot = purchasedLabel;
          }
        }
      } catch {
        // Le mouvement reste comptable même si Stripe ne restitue pas le libellé historique.
      }
    }

    if (!snapshot.packTitleSnapshot) {
      snapshot.packTitleSnapshot = snapshot.packId
        ? `Pack Sonara (${snapshot.packId})`
        : "Pack Sonara";
    }
    return snapshot;
  }

  async function recordCheckout(session, { eventId = "", source = "stripe" } = {}) {
    const inspection = await inspectCheckoutEnvironment(session);
    if (!enabled) return { recorded: false, reason: "finance_disabled" };
    if (session.payment_status !== "paid") return { recorded: false, reason: "not_paid" };

    const { paymentIntent, metadata, checkoutEnvironment, environmentSource, environmentHint } = inspection;
    const grossAmountCents = asCents(session.amount_total ?? paymentIntent?.amount_received ?? paymentIntent?.amount);
    if (!grossAmountCents) throw new Error("Montant Stripe introuvable : transaction Founder refusée.");

    const { latestCharge, applicationFee } = await retrieveChargeAndFee(paymentIntent);
    const metadataCommission = asCents(metadata.sonaraCommissionCents);
    const commissionGrossCents = asCents(
      applicationFee?.amount ?? paymentIntent?.application_fee_amount ?? metadataCommission
    );
    if (!commissionGrossCents) {
      throw new Error("Commission Sonara introuvable : le chiffre d’affaires artiste ne sera jamais compté à sa place.");
    }
    if (commissionGrossCents > grossAmountCents) throw new Error("Commission Sonara supérieure au paiement.");

    const paymentIntentId = String(paymentIntent?.id || session.payment_intent || "");
    const chargeId = String(latestCharge?.id || "");
    const applicationFeeId = String(
      applicationFee?.id || (typeof latestCharge?.application_fee === "string" ? latestCharge.application_fee : "") || ""
    );
    const paidAt = session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString();
    const snapshot = await snapshotFromMetadata(metadata, session);
    const common = {
      environment: checkoutEnvironment,
      source: "SONARA_PACK",
      currency: String(session.currency || paymentIntent?.currency || "eur").toLowerCase(),
      occurredAt: paidAt,
      stripeEventIds: eventId ? [eventId] : [],
      stripeCheckoutSessionId: String(session.id || ""),
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
      stripeApplicationFeeId: applicationFeeId,
      ...snapshot,
      metadata: {
        ingestionSource: source,
        environmentSource,
        environmentHint,
        purchaseType: String(metadata.purchaseType || (metadata.trackId ? "track" : "pack")),
        grossAmountCents,
        artistAmountCents: Math.max(0, grossAmountCents - commissionGrossCents),
        commissionRate: Number(metadata.sonaraCommissionRate) > 0
          ? Number(metadata.sonaraCommissionRate)
          : commissionGrossCents / grossAmountCents
      }
    };

    const commissionResult = await upsertMovement({
      ...common,
      externalKey: `stripe:commission:${paymentIntentId || session.id}`,
      direction: "IN",
      category: "SONARA_COMMISSION",
      status: "CONFIRMED",
      amountCents: commissionGrossCents,
      description: snapshot.trackId
        ? `Commission Sonara — ${snapshot.trackTitleSnapshot || "track"}${snapshot.packTitleSnapshot ? ` · ${snapshot.packTitleSnapshot}` : ""}`
        : `Commission Sonara — ${snapshot.packTitleSnapshot || "pack"}`
    });

    const balanceTransaction = latestCharge?.balance_transaction && typeof latestCharge.balance_transaction === "object"
      ? latestCharge.balance_transaction
      : null;
    const stripeFeeCents = asCents(balanceTransaction?.fee);
    let feeResult = null;
    if (stripeFeeCents > 0) {
      feeResult = await upsertMovement({
        ...common,
        externalKey: `stripe:fee:${String(balanceTransaction?.id || chargeId || paymentIntentId)}`,
        direction: "OUT",
        category: "STRIPE_FEE",
        status: "CONFIRMED",
        amountCents: stripeFeeCents,
        stripeBalanceTransactionId: String(balanceTransaction?.id || ""),
        description: `Frais Stripe — ${snapshot.packTitleSnapshot || "vente Sonara"}`
      });
    }

    await syncRefundsForCharge(latestCharge, { eventId, common, commissionGrossCents });
    return {
      recorded: commissionResult.created,
      movement: commissionResult.movement,
      feeMovement: feeResult?.movement || null
    };
  }

  function refundStatus(refund) {
    return normalizeStatus(refund?.status || "pending");
  }

  async function syncRefundsForCharge(chargeInput, { eventId = "", common = null, commissionGrossCents = 0 } = {}) {
    if (!chargeInput) return { recorded: 0, updated: 0 };
    let charge = chargeInput;
    if (typeof charge === "string") {
      charge = await stripe.charges.retrieve(charge, { expand: ["refunds", "application_fee"] });
    }
    if (!charge?.id) return { recorded: 0, updated: 0 };

    const paymentIntentId = String(charge.payment_intent || common?.stripePaymentIntentId || "");
    const commissionMovement = await findMovement({ externalKey: `stripe:commission:${paymentIntentId}` });
    if (!commissionMovement && !common) return { recorded: 0, updated: 0, reason: "commission_not_found" };

    const base = common || {
      environment: commissionMovement.environment,
      source: commissionMovement.source,
      currency: commissionMovement.currency,
      occurredAt: commissionMovement.occurredAt,
      stripeCheckoutSessionId: commissionMovement.stripeCheckoutSessionId,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: String(charge.id || ""),
      stripeApplicationFeeId: commissionMovement.stripeApplicationFeeId,
      sonaraOrderId: commissionMovement.sonaraOrderId,
      packId: commissionMovement.packId,
      packTitleSnapshot: commissionMovement.packTitleSnapshot,
      trackId: commissionMovement.trackId,
      trackTitleSnapshot: commissionMovement.trackTitleSnapshot,
      artistId: commissionMovement.artistId,
      artistNameSnapshot: commissionMovement.artistNameSnapshot,
      buyerId: commissionMovement.buyerId,
      metadata: commissionMovement.metadata || {}
    };
    const grossCommission = asCents(commissionGrossCents || commissionMovement?.amountCents);
    if (!grossCommission) return { recorded: 0, updated: 0, reason: "commission_amount_missing" };

    let applicationFee = charge.application_fee || base.stripeApplicationFeeId || null;
    if (typeof applicationFee === "string") {
      try {
        applicationFee = await stripe.applicationFees.retrieve(applicationFee);
      } catch {
        applicationFee = null;
      }
    }

    let refunds = Array.isArray(charge.refunds?.data) ? charge.refunds.data.slice() : [];
    if ((!refunds.length || charge.refunds?.has_more) && stripe.refunds?.list) {
      const page = await stripe.refunds.list({ charge: charge.id, limit: 100 });
      refunds = Array.isArray(page.data) ? page.data : refunds;
    }
    refunds.sort((a, b) => Number(a.created || 0) - Number(b.created || 0));

    const chargeAmount = asCents(charge.amount);
    const successful = refunds.filter((refund) => refundStatus(refund) === "confirmed");
    const successfulGross = successful.reduce((sum, refund) => sum + asCents(refund.amount), 0);
    const exactCommissionRefunded = asCents(applicationFee?.amount_refunded);
    const targetCommissionRefunded = Math.min(
      grossCommission,
      exactCommissionRefunded || (chargeAmount > 0
        ? Math.round(grossCommission * Math.min(1, successfulGross / chargeAmount))
        : 0)
    );

    let allocatedConfirmed = 0;
    let cumulativeSuccessfulGross = 0;
    let recorded = 0;
    let updated = 0;
    for (let index = 0; index < refunds.length; index += 1) {
      const refund = refunds[index];
      const status = refundStatus(refund);
      let amountCents = 0;
      if (status === "confirmed") {
        cumulativeSuccessfulGross += asCents(refund.amount);
        const cumulativeTarget = successfulGross > 0
          ? Math.min(
              targetCommissionRefunded,
              Math.round(targetCommissionRefunded * cumulativeSuccessfulGross / successfulGross)
            )
          : 0;
        amountCents = Math.max(0, cumulativeTarget - allocatedConfirmed);
        allocatedConfirmed += amountCents;
      } else {
        amountCents = chargeAmount > 0
          ? Math.min(grossCommission, Math.round(grossCommission * asCents(refund.amount) / chargeAmount))
          : 0;
      }

      const result = await upsertMovement({
        ...base,
        externalKey: `stripe:refund:${refund.id}`,
        direction: "OUT",
        category: "SONARA_REFUND",
        status,
        amountCents,
        occurredAt: refund.created ? new Date(refund.created * 1000).toISOString() : new Date().toISOString(),
        stripeEventIds: eventId ? [eventId] : [],
        stripeRefundId: String(refund.id || ""),
        description: `Remboursement ${status === "confirmed" ? "confirmé" : status} — ${base.packTitleSnapshot || "vente Sonara"}`,
        metadata: {
          ...(base.metadata || {}),
          stripeRefundGrossCents: asCents(refund.amount),
          stripeRefundReason: String(refund.reason || ""),
          stripeRefundStatus: String(refund.status || "")
        }
      });
      if (result.created) recorded += 1;
      else updated += 1;
    }

    return { recorded, updated, targetCommissionRefunded };
  }

  async function recordRefund(charge, { eventId = "" } = {}) {
    if (!enabled || !charge) return { recorded: false, reason: "finance_disabled_or_missing_charge" };
    const result = await syncRefundsForCharge(charge, { eventId });
    return { recorded: result.recorded > 0, changed: result.recorded > 0 || result.updated > 0, ...result };
  }

  async function handleStripeEvent(event) {
    const registration = await registerStripeEvent(event, "processing");
    if (registration.duplicate) {
      return { processed: false, duplicate: true, eventId: registration.eventId, status: registration.status };
    }

    try {
      const object = event?.data?.object;
      let result;
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        result = { processed: true, checkout: await recordCheckout(object, { eventId: event.id, source: "stripe_webhook" }) };
      } else if (event.type === "charge.refunded") {
        result = { processed: true, refund: await recordRefund(object, { eventId: event.id }) };
      } else if (["refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
        const chargeId = typeof object?.charge === "string" ? object.charge : object?.charge?.id;
        if (!chargeId) result = { processed: true, ignored: "refund_charge_missing" };
        else {
          const charge = await stripe.charges.retrieve(chargeId, { expand: ["refunds", "application_fee"] });
          result = { processed: true, refund: await recordRefund(charge, { eventId: event.id }) };
        }
      } else if (event.type === "application_fee.refunded") {
        const chargeId = typeof object?.charge === "string" ? object.charge : object?.charge?.id;
        if (!chargeId) result = { processed: true, ignored: "application_fee_charge_missing" };
        else {
          const charge = await stripe.charges.retrieve(chargeId, { expand: ["refunds", "application_fee"] });
          result = { processed: true, refund: await recordRefund(charge, { eventId: event.id }) };
        }
      } else {
        result = { processed: true, ignored: event.type };
      }

      await registerStripeEvent(event, "processed");
      return result;
    } catch (error) {
      await registerStripeEvent(event, "failed", error.message || String(error));
      throw error;
    }
  }

  async function migrateLegacyTransactions() {
    let legacyItems = fs.existsSync(legacyPath) ? readArray(legacyPath) : [];
    if (isMongo) {
      try {
        const mongoLegacy = (await legacyTransactionsCollection.find({ environment: runtimeEnvironment }).toArray()).map(cleanDocument);
        const merged = new Map();
        for (const item of [...legacyItems, ...mongoLegacy]) {
          const key = String(item.paymentIntentId || item.sessionId || item.id || createId("legacy"));
          merged.set(key, item);
        }
        legacyItems = Array.from(merged.values());
      } catch (error) {
        console.warn(`Ancien registre MongoDB ${runtimeEnvironment.toUpperCase()} indisponible, migration JSON uniquement :`, error.message);
      }
    }
    let migrated = 0;
    for (const item of legacyItems) {
      const paymentIntentId = String(item.paymentIntentId || "");
      const sessionId = String(item.sessionId || "");
      if (!paymentIntentId && !sessionId) continue;
      const financialEnvironment = runtimeEnvironment === "test" && item.environmentSource !== "metadata"
        ? "test_legacy"
        : runtimeEnvironment;
      const common = {
        environment: financialEnvironment,
        source: "SONARA_PACK",
        currency: String(item.currency || "eur"),
        occurredAt: item.paidAt || item.createdAt || new Date().toISOString(),
        stripeEventIds: Array.isArray(item.eventIds) ? item.eventIds : [],
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: String(item.chargeId || ""),
        stripeApplicationFeeId: String(item.applicationFeeId || ""),
        packId: String(item.packId || ""),
        trackId: String(item.trackId || ""),
        artistId: String(item.artistId || ""),
        buyerId: String(item.buyerId || ""),
        description: "Commission Sonara migrée depuis l’ancien registre",
        metadata: {
          migratedFromLegacyRegistry: true,
          grossAmountCents: asCents(item.grossAmountCents),
          artistAmountCents: asCents(item.artistAmountCents),
          purchaseType: String(item.purchaseType || "")
        }
      };
      const commission = await upsertMovement({
        ...common,
        externalKey: `stripe:commission:${paymentIntentId || sessionId}`,
        direction: "IN",
        category: "SONARA_COMMISSION",
        status: "CONFIRMED",
        amountCents: asCents(item.commissionGrossCents)
      });
      migrated += commission.created ? 1 : 0;
      const refunded = asCents(item.commissionRefundedCents);
      if (refunded > 0) {
        const refund = await upsertMovement({
          ...common,
          externalKey: `legacy:refund:${paymentIntentId || sessionId}`,
          direction: "OUT",
          category: "SONARA_REFUND",
          status: "CONFIRMED",
          amountCents: refunded,
          description: "Remboursement Sonara migré depuis l’ancien registre"
        });
        migrated += refund.created ? 1 : 0;
      }
    }
    return { scanned: legacyItems.length, migrated };
  }

  async function reconcileStripeTransactions({ force = false, limit = DEFAULT_RECONCILE_LIMIT } = {}) {
    if (!enabled) return { ...lastReconcileResult, disabled: true, environment: runtimeEnvironment };
    const now = Date.now();
    if (!force && lastReconcileResult.completedAt && now - lastReconcileAt < RECONCILE_CACHE_MS) return lastReconcileResult;
    if (reconcilePromise) return reconcilePromise;

    reconcilePromise = (async () => {
      const result = {
        scanned: 0,
        matched: 0,
        legacyMatched: 0,
        recorded: 0,
        updated: 0,
        skipped: 0,
        unresolved: 0,
        errors: [],
        completedAt: null,
        environment: runtimeEnvironment,
        legacyMigration: await migrateLegacyTransactions()
      };
      let startingAfter;
      const maximum = Math.min(Math.max(Number(limit) || DEFAULT_RECONCILE_LIMIT, 1), 5000);

      do {
        const remaining = maximum - result.scanned;
        if (remaining <= 0) break;
        const page = await stripe.checkout.sessions.list({
          limit: Math.min(100, remaining),
          ...(startingAfter ? { starting_after: startingAfter } : {}),
          expand: ["data.payment_intent", "data.payment_intent.latest_charge"]
        });

        for (const session of page.data || []) {
          result.scanned += 1;
          if (session.mode !== "payment" || session.payment_status !== "paid") {
            result.skipped += 1;
            continue;
          }
          const paymentIntent = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
          const metadata = mergeCheckoutMetadata(session, paymentIntent);
          if (!isSonaraCheckout(session, paymentIntent || {}, metadata)) {
            result.skipped += 1;
            continue;
          }
          const inferred = inferCheckoutEnvironment(session, metadata, runtimeEnvironment);
          if (!inferred.environment) {
            result.unresolved += 1;
            continue;
          }
          if (!allowedFinancialEnvironments().includes(inferred.environment)) {
            result.skipped += 1;
            continue;
          }
          result.matched += 1;
          if (inferred.environment === "test_legacy") result.legacyMatched += 1;
          try {
            const recorded = await recordCheckout(session, {
              eventId: `reconcile:${session.id}`,
              source: inferred.environment === "test_legacy" ? "stripe_historical_backfill" : "stripe_reconciliation"
            });
            if (recorded.recorded) result.recorded += 1;
            else if (recorded.movement) result.updated += 1;
          } catch (error) {
            result.errors.push({ sessionId: String(session.id || ""), message: String(error.message || error) });
          }
        }
        startingAfter = page.has_more && page.data?.length ? page.data[page.data.length - 1].id : null;
      } while (startingAfter && result.scanned < maximum);

      result.completedAt = new Date().toISOString();
      lastReconcileAt = Date.now();
      lastReconcileResult = result;
      return result;
    })().finally(() => { reconcilePromise = null; });

    return reconcilePromise;
  }

  async function summary() {
    if (!enabled) {
      return {
        success: true,
        linked: true,
        enabled: false,
        environment: runtimeEnvironment,
        financialEnvironments: allowedFinancialEnvironments(),
        mode: runtimeEnvironment === "main" ? "live" : "test",
        currency: "EUR",
        companyId: "sonara-pack",
        companyName: "Sonara Pack",
        ownershipStatus: "owned",
        totalInCents: 0,
        totalOutCents: 0,
        netCents: 0,
        founderRevenueCents: 0,
        sonaraCommissionGrossCents: 0,
        sonaraCommissionRefundedCents: 0,
        stripeFeesCents: 0,
        successfulPayments: 0,
        lastPaymentAt: null,
        reason: "live_finance_disabled",
        reconciliation: { disabled: true, environment: runtimeEnvironment }
      };
    }

    let reconciliation;
    try {
      const firstReconciliationSinceStartup = !lastReconcileResult.completedAt;
      reconciliation = await reconcileStripeTransactions({
        force: firstReconciliationSinceStartup,
        limit: firstReconciliationSinceStartup
          ? FULL_HISTORY_RECONCILE_LIMIT
          : DEFAULT_RECONCILE_LIMIT
      });
    } catch (error) {
      reconciliation = { ...lastReconcileResult, environment: runtimeEnvironment, error: String(error.message || error) };
    }

    const movements = await listMovements({ limit: 10000 });
    const confirmed = movements.filter(movementCountsInNet);
    const totalInCents = confirmed
      .filter((item) => item.direction === "IN")
      .reduce((sum, item) => sum + asCents(item.amountCents), 0);
    const totalOutCents = confirmed
      .filter((item) => item.direction === "OUT")
      .reduce((sum, item) => sum + asCents(item.amountCents), 0);
    const commissionGross = confirmed
      .filter((item) => item.category === "SONARA_COMMISSION")
      .reduce((sum, item) => sum + asCents(item.amountCents), 0);
    const refunds = confirmed
      .filter((item) => item.category === "SONARA_REFUND")
      .reduce((sum, item) => sum + asCents(item.amountCents), 0);
    const stripeFees = confirmed
      .filter((item) => item.category === "STRIPE_FEE")
      .reduce((sum, item) => sum + asCents(item.amountCents), 0);
    const commissionMovements = confirmed.filter((item) => item.category === "SONARA_COMMISSION");
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const currentMonthNet = confirmed
      .filter((item) => String(item.occurredAt || "").slice(0, 7) === currentMonthKey)
      .reduce((sum, item) => sum + movementSignedAmount(item), 0);

    const byEnvironment = {};
    for (const env of allowedFinancialEnvironments()) {
      const envMovements = confirmed.filter((item) => item.environment === env);
      byEnvironment[env] = {
        totalInCents: envMovements.filter((item) => item.direction === "IN").reduce((sum, item) => sum + asCents(item.amountCents), 0),
        totalOutCents: envMovements.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + asCents(item.amountCents), 0),
        netCents: envMovements.reduce((sum, item) => sum + movementSignedAmount(item), 0),
        movementCount: envMovements.length
      };
    }

    return {
      success: true,
      linked: true,
      enabled: true,
      environment: runtimeEnvironment,
      financialEnvironments: allowedFinancialEnvironments(),
      mode: runtimeEnvironment === "main" ? "live" : "test",
      currency: "EUR",
      companyId: "sonara-pack",
      companyName: "Sonara Pack",
      ownershipStatus: "owned",
      totalInCents,
      totalOutCents,
      netCents: totalInCents - totalOutCents,
      sonaraCommissionGrossCents: commissionGross,
      sonaraCommissionRefundedCents: refunds,
      stripeFeesCents: stripeFees,
      sonaraCommissionNetCents: commissionGross - refunds - stripeFees,
      founderRevenueCents: commissionGross - refunds - stripeFees,
      currentMonthFounderRevenueCents: currentMonthNet,
      successfulPayments: commissionMovements.length,
      lastPaymentAt: commissionMovements.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))[0]?.occurredAt || null,
      movementCount: movements.length,
      byEnvironment,
      generatedAt: new Date().toISOString(),
      reconciliation
    };
  }

  app.get("/api/founder/finance/connection", requireFounderFinance, async (_req, res) => {
    const data = await summary();
    res.json({
      success: true,
      linked: true,
      enabled: data.enabled,
      environment: data.environment,
      financialEnvironments: data.financialEnvironments,
      mode: data.mode,
      companyId: data.companyId,
      companyName: data.companyName,
      ownershipStatus: data.ownershipStatus,
      reason: data.reason || null
    });
  });

  app.get("/api/founder/finance/summary", requireFounderFinance, async (_req, res) => {
    res.json(await summary());
  });

  app.get("/api/founder/finance/movements", requireFounderFinance, async (req, res) => {
    const items = enabled
      ? await annotateDeletedPacks(await listMovements({
          limit: req.query.limit,
          environment: req.query.environment,
          since: req.query.since,
          category: req.query.category,
          status: req.query.status
        }))
      : [];
    res.json({
      success: true,
      enabled,
      environment: runtimeEnvironment,
      financialEnvironments: allowedFinancialEnvironments(),
      items
    });
  });

  // Compatibilité avec l’ancienne route : elle renvoie désormais le registre central.
  app.get("/api/founder/finance/transactions", requireFounderFinance, async (req, res) => {
    res.json({
      success: true,
      enabled,
      environment: runtimeEnvironment,
      items: enabled ? await annotateDeletedPacks(await listMovements({ limit: req.query.limit })) : []
    });
  });

  const api = {
    assertCheckoutEnvironment: inspectCheckoutEnvironment,
    recordCheckout,
    recordRefund,
    handleStripeEvent,
    reconcileStripeTransactions,
    summary,
    listMovements,
    listTransactions: (limit) => listMovements({ limit }),
    upsertMovement,
    ensureMongoIndexesSafely,
    enabled,
    environment: runtimeEnvironment
  };

  app.locals.founderFinance = api;
  return api;
}

module.exports = {
  registerFounderFinance,
  inferCheckoutEnvironment,
  movementSignedAmount,
  movementCountsInNet,
  normalizeStatus
};
