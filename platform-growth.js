const CONFIRMED_STATUSES = new Set(["confirmed", "succeeded", "paid", "completed"]);
const TIME_ZONE = "Europe/Paris";

function normalizeEnvironment(value) {
  const environment = String(value || "").trim().toLowerCase();
  return ["local", "test", "main"].includes(environment) ? environment : "local";
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["complete", "completed", "confirmed", "paid", "succeeded"].includes(status)) return "confirmed";
  return status;
}

function dayKey(value, timeZone = TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDay(key, offset) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "";
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function accountId(account = {}) {
  return String(account.accountId || account.id || account.userId || "").trim();
}

function accountIsArtist(account = {}) {
  const roles = [account.role, account.originalRole]
    .map((value) => String(value || "").trim().toLowerCase());
  return roles.some((role) => role === "artist" || role === "both") || Boolean(account.artistStatus);
}

function applyPlatformActivity(account, value = new Date()) {
  if (!account || typeof account !== "object") return false;

  const occurredAt = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(occurredAt.getTime())) return false;

  const key = dayKey(occurredAt);
  if (!key) return false;

  const previousDays = Array.isArray(account.platformActivityDays)
    ? account.platformActivityDays.map(String).filter(Boolean)
    : [];
  const uniqueDays = [...new Set(previousDays)];
  const alreadyRecorded = uniqueDays.includes(key);

  if (!alreadyRecorded) uniqueDays.push(key);
  uniqueDays.sort();
  account.platformActivityDays = uniqueDays.slice(-730);
  account.lastSeenAt = occurredAt.toISOString();
  account.platformVisitCount = Math.max(0, Number(account.platformVisitCount || 0)) + 1;
  account.updatedAt = account.updatedAt || occurredAt.toISOString();

  return !alreadyRecorded;
}

function allowedRevenueEnvironments(runtimeEnvironment) {
  if (runtimeEnvironment === "test") return new Set(["test", "test_legacy"]);
  return new Set([runtimeEnvironment]);
}

function emptyPoint(date) {
  return {
    date,
    newUsers: 0,
    newArtists: 0,
    returningUsers: 0,
    returningArtists: 0,
    revenueCents: 0
  };
}

function addPoint(target, source) {
  target.newUsers += Number(source.newUsers || 0);
  target.newArtists += Number(source.newArtists || 0);
  target.returningUsers += Number(source.returningUsers || 0);
  target.returningArtists += Number(source.returningArtists || 0);
  target.revenueCents += Number(source.revenueCents || 0);
}

function sumPoints(points) {
  return points.reduce((total, point) => {
    addPoint(total, point);
    return total;
  }, emptyPoint("total"));
}

async function buildPlatformGrowth({
  environment,
  getAccounts,
  financeApi,
  now = new Date(),
  timeZone = TIME_ZONE
}) {
  const runtimeEnvironment = normalizeEnvironment(environment);
  const today = dayKey(now, timeZone);
  const keys = Array.from({ length: 14 }, (_, index) => shiftDay(today, index - 13));
  const acceptedKeys = new Set(keys);
  const pointsByDay = new Map(keys.map((key) => [key, emptyPoint(key)]));
  const returningByDay = new Map(keys.map((key) => [key, new Set()]));
  const returningArtistsByDay = new Map(keys.map((key) => [key, new Set()]));
  const loadedAccounts = await getAccounts();
  const accounts = Array.isArray(loadedAccounts) ? loadedAccounts : [];

  for (const account of accounts) {
    const created = dayKey(account.createdAt || account.registeredAt || account.updatedAt, timeZone);
    if (created && acceptedKeys.has(created)) {
      const point = pointsByDay.get(created);
      point.newUsers += 1;
      if (accountIsArtist(account)) point.newArtists += 1;
    }

    const id = accountId(account);
    if (!id) continue;

    for (const activityDay of Array.isArray(account.platformActivityDays) ? account.platformActivityDays : []) {
      const key = String(activityDay || "").slice(0, 10);
      if (!acceptedKeys.has(key)) continue;
      if (created && key <= created) continue;
      returningByDay.get(key).add(id);
      if (accountIsArtist(account)) returningArtistsByDay.get(key).add(id);
    }
  }

  for (const [key, ids] of returningByDay) {
    pointsByDay.get(key).returningUsers = ids.size;
  }

  for (const [key, ids] of returningArtistsByDay) {
    pointsByDay.get(key).returningArtists = ids.size;
  }

  const allowedEnvironments = allowedRevenueEnvironments(runtimeEnvironment);
  const movements = financeApi?.listMovements
    ? await financeApi.listMovements({ limit: 50000 })
    : [];

  for (const movement of Array.isArray(movements) ? movements : []) {
    if (String(movement.source || "").trim().toUpperCase() !== "SONARA_PACK") continue;
    if (String(movement.category || "").trim().toUpperCase() !== "SONARA_COMMISSION") continue;
    if (String(movement.direction || "").trim().toUpperCase() !== "IN") continue;
    if (!CONFIRMED_STATUSES.has(normalizeStatus(movement.status))) continue;
    if (!allowedEnvironments.has(String(movement.environment || "").trim().toLowerCase())) continue;

    const key = dayKey(movement.occurredAt || movement.createdAt, timeZone);
    if (!acceptedKeys.has(key)) continue;
    pointsByDay.get(key).revenueCents += Math.max(0, Math.round(Number(movement.amountCents || 0)));
  }

  const points = keys.map((key) => pointsByDay.get(key));
  const previousPoints = points.slice(0, 7);
  const currentPoints = points.slice(7);

  return {
    success: true,
    environment: runtimeEnvironment,
    timeZone,
    periodDays: 7,
    rangeStart: keys[0],
    rangeEnd: keys.at(-1),
    current: sumPoints(currentPoints),
    previous: sumPoints(previousPoints),
    points,
    trackedAccounts: accounts.length,
    generatedAt: now.toISOString(),
    rules: {
      revenue: "Commissions Sonara confirmées uniquement",
      ignored: ["dépenses", "frais Stripe", "remboursements", "URSSAF", "investissements", "pertes"],
      returningUsers: "Compte actif un jour différent de son jour d’inscription",
      returningArtists: "Artiste actif un jour différent de son jour d’inscription"
    }
  };
}

function registerPlatformGrowth({
  app,
  environment,
  requireFounder,
  getAccounts,
  recordActivity,
  financeApi,
  timeZone = TIME_ZONE
}) {
  const runtimeEnvironment = normalizeEnvironment(environment);

  app.post("/api/platform/activity", async (req, res) => {
    try {
      const requestedAccountId = String(req.body?.accountId || "").trim();
      if (!requestedAccountId) {
        return res.status(400).json({ success: false, message: "Compte obligatoire." });
      }

      const result = await recordActivity(requestedAccountId, new Date());
      if (!result?.found) {
        return res.status(404).json({ success: false, message: "Compte introuvable." });
      }

      return res.json({
        success: true,
        environment: runtimeEnvironment,
        recorded: result.recorded === true,
        day: result.day || dayKey(new Date(), timeZone)
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Activité impossible à enregistrer."
      });
    }
  });

  app.get("/api/founder/platform-growth", requireFounder, async (_req, res) => {
    try {
      return res.json(await buildPlatformGrowth({
        environment: runtimeEnvironment,
        getAccounts,
        financeApi,
        now: new Date(),
        timeZone
      }));
    } catch (error) {
      return res.status(500).json({
        success: false,
        environment: runtimeEnvironment,
        message: error.message || "Croissance Sonara indisponible."
      });
    }
  });
}

module.exports = {
  registerPlatformGrowth,
  buildPlatformGrowth,
  applyPlatformActivity,
  dayKey
};
