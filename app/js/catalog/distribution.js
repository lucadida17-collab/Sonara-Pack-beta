/* ==========================================================
   SONARA PACK — DISTRIBUTION HOME
   V2.0 : réputation / discipline / performance / découverte

   RÈGLES :
   - aucune donnée n'est persistée ici ;
   - aucune nouvelle catégorie n'est écrite dans les packs ;
   - les catégories existantes servent uniquement de métadonnées ;
   - la Home reçoit un résultat déjà classé + des collections ;
   - l'algorithme s'adapte au catalogue réellement disponible ;
   - les signaux restent isolés pour pouvoir évoluer brique par brique.
========================================================== */

/*
  Compatibilité défensive avec les anciennes pages qui chargent encore ce
  fichier. La Home n'utilise PAS cette fonction. Elle ne contient plus aucun
  tableau de relations de catégories écrit à la main.
*/
function getDistributionCategories(mainMood) {
  const mood = String(mainMood || "").trim().toLowerCase();
  return mood ? [mood] : [];
}

(function attachSonaraDistribution(globalScope) {
  const DISTRIBUTION_VERSION = "2.0.0";
  const DEFAULT_MAX_SECTION_ITEMS = 10;

  /*
    Distribution V2 — configuration centrale.
    Tous les poids et les principaux paramètres comportementaux vivent ici
    afin de pouvoir faire évoluer le moteur sans disperser les coefficients.
  */
  const DISTRIBUTION_CONFIG = Object.freeze({
    weights: Object.freeze({
      reputation: 0.17,
      consistency: 0.14,
      performance: 0.27,
      discovery: 0.18,
      recency: 0.24,
      affinity: 0
    }),
    recency: Object.freeze({
      halfLifeDays: 45
    }),
    discovery: Object.freeze({
      newPackWindowDays: 45,
      newPackHalfLifeDays: 18,
      newArtistWindowDays: 90,
      newArtistHalfLifeDays: 35,
      provenDownloadTransition: 4,
      initialExposureMinScore: 55,
      initialExposureWindowMin: 7,
      initialExposureMaxSlots: 3
    }),
    consistency: Object.freeze({
      analysisWindowDays: 90,
      bucketDays: 15,
      frequencySaturation: 4,
      spacingSaturationDays: 3,
      inactivityHalfLifeDays: 70,
      burstWindowHours: 48,
      burstPenaltyStartsAt: 0.55,
      burstPenaltyMax: 0.28
    }),
    performance: Object.freeze({
      goodClickRate: 0.12,
      goodListenRate: 0.35,
      goodDownloadRate: 0.08
    }),
    reputation: Object.freeze({
      evidenceScale: 8,
      breadthSaturation: 3,
      tenureFullDays: 365
    }),
    diversity: Object.freeze({
      repetitionPenalty: 12,
      concentratedRepetitionPenalty: 17,
      consecutivePenalty: 45,
      concentratedConsecutivePenalty: 58,
      repeatedUseAcceleration: 0.35
    })
  });

  function safeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeTag(value) {
    return normalizeText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /*
    Catégories éditoriales réelles choisies à la publication.
    Les anciennes ambiances (emotional, dark, calm, melancholic, epic, etc.)
    restent des métadonnées utiles au moteur de proximité, mais ne peuvent
    plus créer seules un rail principal sur la Home.
  */
  const CATEGORY_DISPLAY_NAMES = Object.freeze({
    "rap hiphop": "Rap & Hip-Hop",
    pop: "Pop",
    "rnb soul": "R&B & Soul",
    electronic: "Électro",
    "rock alternative": "Rock & Alternative",
    chanson: "Chanson",
    vocal: "Vocal & chant",
    "beats production": "Beatmaking & production",
    afro: "Afro",
    "reggae dancehall": "Reggae & Dancehall",
    jazz: "Jazz",
    piano: "Piano",
    cinematic: "Cinématique",
    classical: "Classique",
    "drums percussion": "Batterie & percussions",
    "violin strings": "Violon & cordes",
    guitar: "Guitare",
    orchestral: "Orchestre",
    "ambient textures": "Ambient & textures",
    "sound design": "Sound design",
    other: "Autre"
  });

  const CATEGORY_DESCRIPTIONS = Object.freeze({
    "rap hiphop": "Rap, flows, productions et univers hip-hop.",
    pop: "Mélodies pop, refrains et productions accessibles ou modernes.",
    "rnb soul": "Voix, grooves et sonorités R&B ou soul.",
    electronic: "Productions électroniques, synthés, rythmes et textures numériques.",
    "rock alternative": "Guitares, groupes et univers rock ou alternatifs.",
    chanson: "Chansons centrées sur l’interprétation, les textes et les mélodies.",
    vocal: "Voix, chant et performances vocales au premier plan.",
    "beats production": "Beats, instrumentales et productions pensées pour créer ou poser une voix.",
    afro: "Rythmes et sonorités afro, modernes ou traditionnelles.",
    "reggae dancehall": "Grooves reggae, dancehall et sonorités caribéennes.",
    jazz: "Improvisation, harmonie et sonorités inspirées du jazz.",
    piano: "Piano, claviers et compositions centrées sur le jeu pianistique.",
    cinematic: "Musiques pensées pour l’image, les histoires et les univers cinématographiques.",
    classical: "Œuvres et inspirations issues de la musique classique.",
    "drums percussion": "Rythmes, batteries, percussions et grooves.",
    "violin strings": "Violons, cordes et arrangements centrés sur les instruments à archet.",
    guitar: "Guitares acoustiques, électriques et compositions construites autour de la guitare.",
    orchestral: "Orchestres, ensembles et arrangements de grande ampleur.",
    "ambient textures": "Textures, nappes et paysages sonores atmosphériques.",
    "sound design": "Effets, textures et créations sonores destinés au design audio.",
    other: "Des créations qui sortent des catégories principales de Sonara Pack."
  });

  const BASE_CATEGORY_KEYS = new Set(Object.keys(CATEGORY_DISPLAY_NAMES));

  function prettyTag(value) {
    const normalized = normalizeText(value).replace(/[_-]+/g, " ");
    if (!normalized) return "Univers";

    const key = normalizeTag(normalized);

    if (CATEGORY_DISPLAY_NAMES[key]) {
      return CATEGORY_DISPLAY_NAMES[key];
    }

    return normalized
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function isEligiblePack(pack = {}) {
    const status = normalizeText(pack.status).toLowerCase();

    return Boolean(
      pack &&
      normalizeText(pack.id) &&
      status === "approved" &&
      pack.moderationHidden !== true
    );
  }

  function getArtistKey(pack = {}) {
    return normalizeText(
      pack.artistProfile?.accountId ||
      pack.accountId ||
      pack.artistAccountId ||
      pack.artistId ||
      pack.artistProfile?.name ||
      pack.artist ||
      pack.pseudo ||
      `unknown:${pack.id || "pack"}`
    ).toLowerCase();
  }

  function getArtistProfile(pack = {}) {
    const profile =
      pack.artistProfile &&
      typeof pack.artistProfile === "object"
        ? pack.artistProfile
        : {};

    const accountId = normalizeText(
      profile.accountId ||
      pack.accountId ||
      pack.artistAccountId ||
      pack.artistId
    );

    return {
      accountId,
      userId: normalizeText(profile.userId || pack.userId || pack.rootUserId),
      name: normalizeText(
        profile.name ||
        profile.pseudo ||
        pack.artist ||
        pack.pseudo ||
        "Artiste Sonara"
      ),
      avatar:
        profile.avatar ||
        profile.imageArtist ||
        profile.imageProfile ||
        pack.imageArtist ||
        pack.imageProfile ||
        "",
      imageArtist: profile.imageArtist || pack.imageArtist || "",
      artistRewards: Array.isArray(profile.artistRewards) ? profile.artistRewards : [],
      imageProfile: profile.imageProfile || pack.imageProfile || "",
      biography: normalizeText(profile.biography || "")
    };
  }

  function getMonthlyEditionKey(now = Date.now()) {
    const date = new Date(safeNumber(now, Date.now()));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function getPackTags(pack = {}) {
    const rawValues = [];

    if (Array.isArray(pack.categorie)) {
      rawValues.push(...pack.categorie);
    } else if (pack.categorie) {
      rawValues.push(pack.categorie);
    }

    if (Array.isArray(pack.categories)) {
      rawValues.push(...pack.categories);
    }

    if (pack.category) {
      rawValues.push(pack.category);
    }

    const unique = new Map();

    rawValues.forEach((rawValue) => {
      const display = normalizeText(rawValue);
      const key = normalizeTag(display);
      if (!key || unique.has(key)) return;
      unique.set(key, display || key);
    });

    return [...unique.entries()].map(([key, display]) => ({
      key,
      display
    }));
  }

  function getPackActivity(pack = {}) {
    const downloads = safeNumber(
      pack.metrics?.downloadCount ?? pack.downloadCount,
      0
    );

    const sales = safeNumber(
      pack.metrics?.salesCount ?? pack.salesCount,
      0
    );

    return {
      downloads: Math.max(0, downloads),
      sales: Math.max(0, sales),
      weightedActivity:
        Math.max(0, downloads) +
        Math.max(0, sales) * 2
    };
  }

  function getPackReferenceDate(pack = {}) {
    const rawDate =
      pack.publishedAt ||
      pack.moderatedAt ||
      pack.updatedAt ||
      pack.createdAt ||
      "";

    const timestamp = Date.parse(rawDate);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function getPackAgeDays(pack = {}, now = Date.now()) {
    const referenceDate = getPackReferenceDate(pack);
    if (!referenceDate) return Infinity;
    return Math.max(0, (safeNumber(now, Date.now()) - referenceDate) / 86400000);
  }

  function getOptionalMetric(pack = {}, names = []) {
    const metrics = pack?.metrics && typeof pack.metrics === "object"
      ? pack.metrics
      : {};

    for (const name of names) {
      const candidates = [metrics[name], pack?.[name]];
      for (const candidate of candidates) {
        if (candidate === null || candidate === undefined || candidate === "") {
          continue;
        }
        const value = Number(candidate);
        if (Number.isFinite(value) && value >= 0) {
          return value;
        }
      }
    }

    return null;
  }

  function safeRatio(numerator, denominator) {
    const top = Number(numerator);
    const bottom = Number(denominator);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) {
      return null;
    }
    return clamp(top / bottom, 0, 1);
  }

  function extractPerformanceMetrics(pack = {}) {
    const downloads = getOptionalMetric(pack, ["downloadCount", "downloads"]);
    const impressions = getOptionalMetric(pack, ["impressionCount", "impressions"]);
    const clicks = getOptionalMetric(pack, ["clickCount", "clicks"]);
    const listens = getOptionalMetric(pack, ["listenCount", "listens", "playCount", "plays"]);
    const libraryAdds = getOptionalMetric(pack, ["libraryAddCount", "libraryAdds"]);

    return {
      downloads,
      impressions,
      clicks,
      listens,
      libraryAdds,
      clickRate: safeRatio(clicks, impressions),
      listenRate: safeRatio(listens, impressions),
      downloadRate: safeRatio(downloads, impressions)
    };
  }

  function percentileRank(value, values = []) {
    const numeric = values
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry) && entry >= 0)
      .sort((a, b) => a - b);

    if (!numeric.length || !Number.isFinite(Number(value))) return 0;

    const target = Number(value);
    const lessOrEqual = numeric.filter((entry) => entry <= target).length;
    return clamp((lessOrEqual / numeric.length) * 100, 0, 100);
  }

  function buildPerformanceProfile(packs = []) {
    const downloadValues = [];
    const clickRates = [];
    const listenRates = [];
    const downloadRates = [];
    let impressionCoverage = 0;

    packs.forEach((pack) => {
      const metrics = extractPerformanceMetrics(pack);

      if (metrics.downloads !== null) {
        downloadValues.push(metrics.downloads);
      }
      if (metrics.clickRate !== null) clickRates.push(metrics.clickRate);
      if (metrics.listenRate !== null) listenRates.push(metrics.listenRate);
      if (metrics.downloadRate !== null) downloadRates.push(metrics.downloadRate);
      if (metrics.impressions !== null && metrics.impressions > 0) {
        impressionCoverage += 1;
      }
    });

    const positiveDownloads = downloadValues.filter((value) => value > 0);

    return {
      downloadValues,
      positiveDownloads,
      clickRates,
      listenRates,
      downloadRates,
      maximumDownloads: positiveDownloads.length
        ? Math.max(...positiveDownloads)
        : 0,
      hasDownloads: positiveDownloads.length > 0,
      hasRatioSignals:
        clickRates.length > 0 ||
        listenRates.length > 0 ||
        downloadRates.length > 0,
      impressionCoverage,
      available:
        positiveDownloads.length > 0 ||
        clickRates.length > 0 ||
        listenRates.length > 0 ||
        downloadRates.length > 0
    };
  }

  function buildArtistAnalytics(packs = [], now = Date.now()) {
    const artists = new Map();

    packs.forEach((pack) => {
      const artistKey = getArtistKey(pack);
      const referenceDate = getPackReferenceDate(pack);
      const performanceMetrics = extractPerformanceMetrics(pack);

      if (!artists.has(artistKey)) {
        artists.set(artistKey, {
          artistKey,
          packs: [],
          publicationDates: [],
          totalDownloads: 0,
          packsWithDownloads: 0,
          firstPublishedAt: 0,
          latestPublishedAt: 0
        });
      }

      const artist = artists.get(artistKey);
      artist.packs.push(pack);

      if (referenceDate > 0) {
        artist.publicationDates.push(referenceDate);
        artist.firstPublishedAt = artist.firstPublishedAt
          ? Math.min(artist.firstPublishedAt, referenceDate)
          : referenceDate;
        artist.latestPublishedAt = Math.max(
          artist.latestPublishedAt,
          referenceDate
        );
      }

      const downloads = Math.max(0, safeNumber(performanceMetrics.downloads, 0));
      artist.totalDownloads += downloads;
      if (downloads > 0) artist.packsWithDownloads += 1;
    });

    artists.forEach((artist) => {
      artist.publicationDates.sort((a, b) => a - b);
      artist.packCount = artist.packs.length;
      artist.activeSpanDays =
        artist.firstPublishedAt && artist.latestPublishedAt
          ? Math.max(
              0,
              (artist.latestPublishedAt - artist.firstPublishedAt) / 86400000
            )
          : 0;
      artist.daysSinceLatest = artist.latestPublishedAt
        ? Math.max(0, (now - artist.latestPublishedAt) / 86400000)
        : Infinity;
    });

    return artists;
  }

  function buildReputationProfile(artistAnalytics = new Map()) {
    const totals = [...artistAnalytics.values()].map(
      (artist) => Math.max(0, safeNumber(artist.totalDownloads, 0))
    );
    const positiveTotals = totals.filter((value) => value > 0);

    return {
      maximumArtistDownloads: positiveTotals.length
        ? Math.max(...positiveTotals)
        : 0,
      artistDownloadTotals: totals,
      available: positiveTotals.length > 0
    };
  }

  function buildCatalogueProfile(packs = [], now = Date.now()) {
    const tagFrequency = new Map();
    const artistFrequency = new Map();
    let activePackCount = 0;
    let recent30Count = 0;
    let recent90Count = 0;
    let maximumActivity = 0;
    let referenceDateCount = 0;

    packs.forEach((pack) => {
      const artistKey = getArtistKey(pack);
      artistFrequency.set(
        artistKey,
        (artistFrequency.get(artistKey) || 0) + 1
      );

      getPackTags(pack).forEach((tag) => {
        tagFrequency.set(
          tag.key,
          (tagFrequency.get(tag.key) || 0) + 1
        );
      });

      const activity = getPackActivity(pack).weightedActivity;
      if (activity > 0) activePackCount += 1;
      maximumActivity = Math.max(maximumActivity, activity);

      const referenceDate = getPackReferenceDate(pack);
      if (!referenceDate) return;
      referenceDateCount += 1;

      const ageDays = Math.max(0, (now - referenceDate) / 86400000);
      if (ageDays <= 30) recent30Count += 1;
      if (ageDays <= 90) recent90Count += 1;
    });

    const packCount = packs.length;
    const uniqueArtistCount = artistFrequency.size;
    const artistConcentration = packCount
      ? Math.max(0, ...artistFrequency.values()) / packCount
      : 0;

    return {
      packCount,
      uniqueArtistCount,
      tagFrequency,
      artistFrequency,
      activePackCount,
      maximumActivity,
      recent30Ratio: packCount ? recent30Count / packCount : 0,
      recent90Ratio: packCount ? recent90Count / packCount : 0,
      activityCoverage: packCount ? activePackCount / packCount : 0,
      referenceDateCoverage: packCount ? referenceDateCount / packCount : 0,
      artistConcentration
    };
  }

  function recencyScore(pack = {}, context = {}) {
    const ageDays = getPackAgeDays(pack, context.now);
    if (!Number.isFinite(ageDays)) return 0;

    const halfLifeDays = Math.max(
      1,
      safeNumber(DISTRIBUTION_CONFIG.recency.halfLifeDays, 45)
    );

    return clamp(
      100 * Math.pow(0.5, ageDays / halfLifeDays),
      0,
      100
    );
  }

  function calculatePackPerformance(pack = {}, context = {}) {
    const profile = context.performanceProfile || {};
    const metrics = extractPerformanceMetrics(pack);
    const components = [];

    if (
      metrics.downloads !== null &&
      safeNumber(profile.maximumDownloads, 0) > 0
    ) {
      const downloads = Math.max(0, metrics.downloads);
      const maximum = Math.max(1, safeNumber(profile.maximumDownloads, 1));
      const logRelative = downloads > 0
        ? (Math.log1p(downloads) / Math.log1p(maximum)) * 100
        : 0;
      const percentile = downloads > 0
        ? percentileRank(downloads, profile.positiveDownloads || [])
        : 0;

      components.push({
        key: "downloads",
        score: clamp(logRelative * 0.65 + percentile * 0.35, 0, 100),
        weight: 1,
        value: downloads
      });
    }

    const ratioSignals = [
      {
        key: "clickRate",
        rate: metrics.clickRate,
        target: DISTRIBUTION_CONFIG.performance.goodClickRate
      },
      {
        key: "listenRate",
        rate: metrics.listenRate,
        target: DISTRIBUTION_CONFIG.performance.goodListenRate
      },
      {
        key: "downloadRate",
        rate: metrics.downloadRate,
        target: DISTRIBUTION_CONFIG.performance.goodDownloadRate
      }
    ];

    ratioSignals.forEach((signal) => {
      if (signal.rate === null) return;
      const target = Math.max(0.0001, safeNumber(signal.target, 1));
      components.push({
        key: signal.key,
        score: clamp((signal.rate / target) * 100, 0, 100),
        weight: 1.2,
        value: signal.rate
      });
    });

    if (!components.length) {
      return {
        score: 0,
        available: false,
        metrics,
        components: []
      };
    }

    const totalWeight = components.reduce(
      (sum, component) => sum + component.weight,
      0
    );
    const score = components.reduce(
      (sum, component) => sum + component.score * component.weight,
      0
    ) / Math.max(totalWeight, 1);

    return {
      score: clamp(score, 0, 100),
      available: true,
      metrics,
      components
    };
  }

  function packPerformanceScore(pack = {}, context = {}) {
    return calculatePackPerformance(pack, context).score;
  }

  function getArtistAnalyticsForPack(pack = {}, context = {}) {
    const analytics = context.artistAnalytics;
    if (!(analytics instanceof Map)) return null;
    return analytics.get(getArtistKey(pack)) || null;
  }

  function calculateArtistConsistency(pack = {}, context = {}) {
    const artist = getArtistAnalyticsForPack(pack, context);
    if (!artist || !artist.publicationDates?.length) {
      return {
        score: 0,
        available: false,
        recent30: 0,
        recent60: 0,
        recent90: 0,
        activeBuckets: 0,
        burstRatio: 0
      };
    }

    const now = safeNumber(context.now, Date.now());
    const config = DISTRIBUTION_CONFIG.consistency;
    const windowDays = Math.max(1, safeNumber(config.analysisWindowDays, 90));
    const bucketDays = Math.max(1, safeNumber(config.bucketDays, 15));

    const ageOf = (timestamp) => Math.max(0, (now - timestamp) / 86400000);
    const recentDates = artist.publicationDates.filter(
      (timestamp) => ageOf(timestamp) <= windowDays
    );

    const countWithin = (days) => artist.publicationDates.filter(
      (timestamp) => ageOf(timestamp) <= days
    ).length;

    const recent30 = countWithin(30);
    const recent60 = countWithin(60);
    const recent90 = countWithin(90);
    const publicationCount = recentDates.length;

    const saturation = Math.max(
      1,
      safeNumber(config.frequencySaturation, 4)
    );
    const frequencyScore = publicationCount > 0
      ? (1 - Math.exp(-publicationCount / saturation)) * 100
      : 0;

    const totalBuckets = Math.max(1, Math.ceil(windowDays / bucketDays));
    const activeBuckets = new Set(
      recentDates.map((timestamp) =>
        Math.min(
          totalBuckets - 1,
          Math.floor(ageOf(timestamp) / bucketDays)
        )
      )
    ).size;
    const continuityScore = clamp(
      (activeBuckets / totalBuckets) * 100,
      0,
      100
    );

    let spacingScore = 0;
    if (recentDates.length >= 2) {
      const intervals = [];
      for (let index = 1; index < recentDates.length; index += 1) {
        intervals.push(
          Math.max(0.25, (recentDates[index] - recentDates[index - 1]) / 86400000)
        );
      }

      const mean = intervals.reduce((sum, value) => sum + value, 0) /
        Math.max(1, intervals.length);
      const variance = intervals.reduce(
        (sum, value) => sum + Math.pow(value - mean, 2),
        0
      ) / Math.max(1, intervals.length);
      const deviation = Math.sqrt(variance);
      const coefficientOfVariation = mean > 0 ? deviation / mean : 1;
      const regularity = clamp(100 / (1 + coefficientOfVariation), 0, 100);
      const spacingSaturationDays = Math.max(
        0.25,
        safeNumber(config.spacingSaturationDays, 3)
      );
      const cadenceFactor = clamp(
        1 - Math.exp(-mean / spacingSaturationDays),
        0,
        1
      );
      spacingScore = regularity * cadenceFactor;

      if (intervals.length === 1) {
        spacingScore = Math.min(spacingScore, 62);
      }
    }

    const latestAge = Number.isFinite(artist.daysSinceLatest)
      ? artist.daysSinceLatest
      : Infinity;
    const inactivityHalfLife = Math.max(
      1,
      safeNumber(config.inactivityHalfLifeDays, 70)
    );
    const recentActivityScore = Number.isFinite(latestAge)
      ? clamp(100 * Math.pow(0.5, latestAge / inactivityHalfLife), 0, 100)
      : 0;

    const burstWindowMs = Math.max(
      1,
      safeNumber(config.burstWindowHours, 48)
    ) * 3600000;
    let maximumBurst = publicationCount ? 1 : 0;

    for (let left = 0; left < recentDates.length; left += 1) {
      let right = left;
      while (
        right + 1 < recentDates.length &&
        recentDates[right + 1] - recentDates[left] <= burstWindowMs
      ) {
        right += 1;
      }
      maximumBurst = Math.max(maximumBurst, right - left + 1);
    }

    const burstRatio = publicationCount >= 3
      ? maximumBurst / publicationCount
      : 0;
    const burstStart = clamp(
      safeNumber(config.burstPenaltyStartsAt, 0.55),
      0,
      0.99
    );
    const burstSeverity = burstRatio > burstStart
      ? clamp((burstRatio - burstStart) / (1 - burstStart), 0, 1)
      : 0;
    const burstPenalty = burstSeverity * clamp(
      safeNumber(config.burstPenaltyMax, 0.28),
      0,
      0.8
    );

    const baseScore =
      frequencyScore * 0.28 +
      continuityScore * 0.28 +
      spacingScore * 0.24 +
      recentActivityScore * 0.20;

    return {
      score: clamp(baseScore * (1 - burstPenalty), 0, 100),
      available: true,
      recent30,
      recent60,
      recent90,
      activeBuckets,
      frequencyScore,
      continuityScore,
      spacingScore,
      recentActivityScore,
      burstRatio,
      burstPenalty
    };
  }

  function artistConsistencyScore(pack = {}, context = {}) {
    return calculateArtistConsistency(pack, context).score;
  }

  function calculateArtistReputation(pack = {}, context = {}) {
    const artist = getArtistAnalyticsForPack(pack, context);
    const reputationProfile = context.reputationProfile || {};

    if (
      !artist ||
      !reputationProfile.available ||
      artist.totalDownloads <= 0
    ) {
      return {
        score: 0,
        available: false,
        cumulativeScore: 0,
        averagePerformance: 0,
        breadthScore: 0,
        evidenceFactor: 0,
        tenureScore: 0
      };
    }

    const maxArtistDownloads = Math.max(
      1,
      safeNumber(reputationProfile.maximumArtistDownloads, 1)
    );
    const cumulativeScore = clamp(
      (Math.log1p(artist.totalDownloads) / Math.log1p(maxArtistDownloads)) * 100,
      0,
      100
    );

    const performanceValues = artist.packs.map(
      (artistPack) => packPerformanceScore(artistPack, context)
    );
    const averagePerformance = performanceValues.length
      ? performanceValues.reduce((sum, value) => sum + value, 0) /
        performanceValues.length
      : 0;

    const breadthSaturation = Math.max(
      1,
      safeNumber(DISTRIBUTION_CONFIG.reputation.breadthSaturation, 3)
    );
    const breadthScore = clamp(
      (1 - Math.exp(-artist.packsWithDownloads / breadthSaturation)) * 100,
      0,
      100
    );

    const evidenceScale = Math.max(
      1,
      safeNumber(DISTRIBUTION_CONFIG.reputation.evidenceScale, 8)
    );
    const evidenceUnits =
      artist.totalDownloads + artist.packsWithDownloads * 2;
    const evidenceFactor = clamp(
      1 - Math.exp(-evidenceUnits / evidenceScale),
      0,
      1
    );

    const tenureFullDays = Math.max(
      1,
      safeNumber(DISTRIBUTION_CONFIG.reputation.tenureFullDays, 365)
    );
    const tenureScore = clamp(
      (artist.activeSpanDays / tenureFullDays) * 100,
      0,
      100
    );

    const historicalCore =
      cumulativeScore * 0.42 +
      averagePerformance * 0.36 +
      breadthScore * 0.22;

    const score =
      historicalCore * evidenceFactor +
      tenureScore * 0.08 * evidenceFactor;

    return {
      score: clamp(score, 0, 100),
      available: true,
      cumulativeScore,
      averagePerformance,
      breadthScore,
      evidenceFactor,
      tenureScore
    };
  }

  function artistReputationScore(pack = {}, context = {}) {
    return calculateArtistReputation(pack, context).score;
  }

  function calculateDiscovery(pack = {}, context = {}) {
    const ageDays = getPackAgeDays(pack, context.now);
    const artist = getArtistAnalyticsForPack(pack, context);
    const config = DISTRIBUTION_CONFIG.discovery;

    if (!Number.isFinite(ageDays)) {
      return {
        score: 0,
        newPackBoost: 0,
        newArtistBoost: 0,
        evidenceTransition: 1,
        isNewPack: false,
        isNewArtist: false
      };
    }

    const newPackWindow = Math.max(1, safeNumber(config.newPackWindowDays, 45));
    const newPackHalfLife = Math.max(1, safeNumber(config.newPackHalfLifeDays, 18));
    const isNewPack = ageDays <= newPackWindow;
    const newPackBoost = isNewPack
      ? clamp(100 * Math.pow(0.5, ageDays / newPackHalfLife), 0, 100)
      : 0;

    const firstPublishedAge = artist?.firstPublishedAt
      ? Math.max(
          0,
          (safeNumber(context.now, Date.now()) - artist.firstPublishedAt) / 86400000
        )
      : Infinity;
    const newArtistWindow = Math.max(
      1,
      safeNumber(config.newArtistWindowDays, 90)
    );
    const newArtistHalfLife = Math.max(
      1,
      safeNumber(config.newArtistHalfLifeDays, 35)
    );
    const isNewArtist = Boolean(
      artist &&
      firstPublishedAge <= newArtistWindow &&
      safeNumber(artist.packCount, 0) <= 3
    );
    const catalogueDepthFactor = artist
      ? clamp(1 / Math.sqrt(Math.max(1, artist.packCount)), 0.58, 1)
      : 0;
    const newArtistBoost = isNewArtist
      ? clamp(
          100 *
            Math.pow(0.5, firstPublishedAge / newArtistHalfLife) *
            catalogueDepthFactor,
          0,
          100
        )
      : 0;

    const downloads = Math.max(
      0,
      safeNumber(extractPerformanceMetrics(pack).downloads, 0)
    );
    const transitionScale = Math.max(
      1,
      safeNumber(config.provenDownloadTransition, 4)
    );
    const evidenceTransition = 1 / (1 + downloads / transitionScale);

    return {
      score: clamp(
        Math.max(newPackBoost, newArtistBoost * 0.92) * evidenceTransition,
        0,
        100
      ),
      newPackBoost,
      newArtistBoost,
      evidenceTransition,
      isNewPack,
      isNewArtist,
      firstPublishedAge
    };
  }

  function discoveryScore(pack = {}, context = {}) {
    return calculateDiscovery(pack, context).score;
  }

  function userAffinityScore(pack = {}, context = {}) {
    /*
      V2 prépare la responsabilité sans inventer de personnalisation.
      Tant qu'un historique exploitable n'est pas branché ici, le signal est
      neutre et son poids reste désactivé dans la configuration centrale.
    */
    return 50;
  }

  function hasUserHistory(userContext = null) {
    if (!userContext || typeof userContext !== "object") {
      return false;
    }

    const possibleHistory = [
      userContext.downloadedPacks,
      userContext.downloadedTracks,
      userContext.viewedPacks,
      userContext.artistHistory
    ];

    return possibleHistory.some(
      (items) => Array.isArray(items) && items.length > 0
    );
  }

  function resolveDistributionWeights(context = {}) {
    const weights = {
      ...DISTRIBUTION_CONFIG.weights
    };

    if (!context.performanceProfile?.available) {
      weights.performance = 0;
      weights.reputation = 0;
    }

    if (safeNumber(context.catalogueProfile?.referenceDateCoverage, 0) <= 0) {
      weights.recency = 0;
      weights.discovery = 0;
      weights.consistency = 0;
    }

    /* Affinité V2 : architecture prête, personnalisation non activée. */
    weights.affinity = 0;

    return weights;
  }

  function scorePack(pack = {}, context = {}) {
    const reputation = calculateArtistReputation(pack, context);
    const consistency = calculateArtistConsistency(pack, context);
    const performance = calculatePackPerformance(pack, context);
    const discovery = calculateDiscovery(pack, context);

    const signals = {
      reputation: clamp(reputation.score, 0, 100),
      consistency: clamp(consistency.score, 0, 100),
      performance: clamp(performance.score, 0, 100),
      discovery: clamp(discovery.score, 0, 100),
      recency: clamp(recencyScore(pack, context), 0, 100),
      affinity: clamp(userAffinityScore(pack, context), 0, 100)
    };

    const weights = context.distributionWeights || resolveDistributionWeights(context);
    const activeWeightEntries = Object.entries(weights).filter(
      ([, value]) => safeNumber(value, 0) > 0
    );
    const totalWeight = activeWeightEntries.reduce(
      (sum, [, value]) => sum + safeNumber(value, 0),
      0
    );

    const contributions = Object.fromEntries(
      Object.entries(signals).map(([key, value]) => [
        key,
        value * Math.max(0, safeNumber(weights[key], 0))
      ])
    );

    const weightedTotal = activeWeightEntries.reduce(
      (sum, [key, weight]) => sum + signals[key] * safeNumber(weight, 0),
      0
    );
    const baseTotal = totalWeight > 0 ? weightedTotal / totalWeight : 0;
    const missionVisibilityBoost = clamp(
      safeNumber(pack.artistProfile?.missionVisibilityBoost?.bonus, 0),
      0,
      15
    );

    return {
      total: clamp(baseTotal + missionVisibilityBoost, 0, 100),
      baseTotal: clamp(baseTotal, 0, 100),
      missionVisibilityBoost,
      signals,
      contributions,
      weights,
      details: {
        reputation,
        consistency,
        performance,
        discovery
      }
    };
  }

  /* Compatibilité V1 : anciennes fonctions publiques conservées. */
  function freshnessScore(pack = {}, context = {}) {
    return recencyScore(pack, context);
  }

  function popularityScore(pack = {}, context = {}) {
    return packPerformanceScore(pack, context);
  }

  function stringHash(value) {
    let hash = 2166136261;
    const text = String(value || "");

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function resolveArtistPenalties(profile = {}) {
    const concentration = safeNumber(profile.artistConcentration, 0);
    const uniqueArtists = safeNumber(profile.uniqueArtistCount, 0);
    const config = DISTRIBUTION_CONFIG.diversity;

    return {
      repetition:
        concentration >= 0.45 && uniqueArtists >= 2
          ? config.concentratedRepetitionPenalty
          : config.repetitionPenalty,
      consecutive:
        concentration >= 0.45 && uniqueArtists >= 2
          ? config.concentratedConsecutivePenalty
          : config.consecutivePenalty
    };
  }

  /* -------------------------
     Diversification artiste
  ------------------------- */
  function diversifyArtists(scoredItems = [], options = {}) {
    const remaining = [...scoredItems];
    const output = [];
    const artistUsage = new Map();
    let previousArtist = "";

    const repetitionPenalty = safeNumber(
      options.repetitionPenalty,
      DISTRIBUTION_CONFIG.diversity.repetitionPenalty
    );
    const consecutivePenalty = safeNumber(
      options.consecutivePenalty,
      DISTRIBUTION_CONFIG.diversity.consecutivePenalty
    );
    const acceleration = Math.max(
      0,
      safeNumber(
        DISTRIBUTION_CONFIG.diversity.repeatedUseAcceleration,
        0.35
      )
    );

    while (remaining.length) {
      let bestIndex = 0;
      let bestAdjustedScore = -Infinity;

      remaining.forEach((item, index) => {
        const artistKey = item.artistKey;
        const previousUses = artistUsage.get(artistKey) || 0;
        const usagePenalty = previousUses * repetitionPenalty *
          (1 + Math.max(0, previousUses - 1) * acceleration);
        const adjustedScore =
          safeNumber(item.score?.total, 0) -
          usagePenalty -
          (previousArtist === artistKey ? consecutivePenalty : 0);

        if (adjustedScore > bestAdjustedScore) {
          bestAdjustedScore = adjustedScore;
          bestIndex = index;
        }
      });

      const [selected] = remaining.splice(bestIndex, 1);
      output.push(selected);
      artistUsage.set(
        selected.artistKey,
        (artistUsage.get(selected.artistKey) || 0) + 1
      );
      previousArtist = selected.artistKey;
    }

    return output;
  }

  function ensureInitialDiscoveryExposure(rankedItems = [], context = {}) {
    if (rankedItems.length <= 2) return rankedItems;

    const config = DISTRIBUTION_CONFIG.discovery;
    const output = [...rankedItems];
    const windowSize = Math.min(
      output.length,
      Math.max(
        safeNumber(config.initialExposureWindowMin, 7),
        Math.ceil(Math.sqrt(output.length)) * 2
      )
    );
    const maxSlots = Math.min(
      safeNumber(config.initialExposureMaxSlots, 3),
      Math.max(1, Math.ceil(windowSize / 3))
    );

    let candidates = output
      .filter((item) => {
        const details = item.score?.details?.discovery;
        return Boolean(
          details?.isNewPack &&
          safeNumber(item.score?.signals?.discovery, 0) >=
            safeNumber(config.initialExposureMinScore, 55)
        );
      })
      .sort((a, b) => {
        const ageA = getPackAgeDays(a.pack, context.now);
        const ageB = getPackAgeDays(b.pack, context.now);
        const urgencyA = Number.isFinite(ageA)
          ? ageA / Math.max(1, config.newPackWindowDays)
          : 0;
        const urgencyB = Number.isFinite(ageB)
          ? ageB / Math.max(1, config.newPackWindowDays)
          : 0;
        return (
          urgencyB - urgencyA ||
          safeNumber(b.score?.signals?.discovery, 0) -
            safeNumber(a.score?.signals?.discovery, 0) ||
          getPackReferenceDate(b.pack) - getPackReferenceDate(a.pack)
        );
      });

    /*
      Les places de découverte garanties servent à tester plusieurs artistes,
      pas à permettre à un seul compte de remplir la fenêtre avec un burst.
      Si le catalogue ne contient qu'un artiste, aucun contenu n'est bloqué.
    */
    if (safeNumber(context.catalogueProfile?.uniqueArtistCount, 0) > 1) {
      const seenArtists = new Set();
      candidates = candidates.filter((item) => {
        if (seenArtists.has(item.artistKey)) return false;
        seenArtists.add(item.artistKey);
        return true;
      });
    }

    let guaranteed = 0;

    for (const candidate of candidates) {
      if (guaranteed >= maxSlots) break;

      const currentIndex = output.indexOf(candidate);
      if (currentIndex >= 0 && currentIndex < windowSize) {
        guaranteed += 1;
        continue;
      }

      if (currentIndex < 0) continue;

      output.splice(currentIndex, 1);

      let targetIndex = Math.min(
        output.length,
        2 + guaranteed * 3
      );

      /* Évite de casser la diversification en injectant le même artiste. */
      while (targetIndex < Math.min(windowSize, output.length)) {
        const previousArtist = targetIndex > 0
          ? output[targetIndex - 1]?.artistKey
          : "";
        const nextArtist = output[targetIndex]?.artistKey || "";
        if (
          previousArtist !== candidate.artistKey &&
          nextArtist !== candidate.artistKey
        ) {
          break;
        }
        targetIndex += 1;
      }

      output.splice(Math.min(targetIndex, output.length), 0, candidate);
      guaranteed += 1;
    }

    return output;
  }

  function tagSet(pack = {}) {
    return new Set(getPackTags(pack).map((tag) => tag.key));
  }

  function packSimilarity(packA = {}, packB = {}, profile = {}) {
    const tagsA = tagSet(packA);
    const tagsB = tagSet(packB);

    if (!tagsA.size || !tagsB.size) return 0;

    const union = new Set([...tagsA, ...tagsB]);
    const shared = [...tagsA].filter((tag) => tagsB.has(tag));

    if (!shared.length || !union.size) return 0;

    const catalogueSize = Math.max(1, safeNumber(profile.packCount, 1));
    const tagFrequency = profile.tagFrequency instanceof Map
      ? profile.tagFrequency
      : new Map();

    const sharedWeight = shared.reduce((sum, tag) => {
      const frequency = Math.max(1, safeNumber(tagFrequency.get(tag), 1));
      const specificity = Math.log((catalogueSize + 1) / (frequency + 1)) + 1;
      return sum + specificity;
    }, 0);

    const unionWeight = [...union].reduce((sum, tag) => {
      const frequency = Math.max(1, safeNumber(tagFrequency.get(tag), 1));
      const specificity = Math.log((catalogueSize + 1) / (frequency + 1)) + 1;
      return sum + specificity;
    }, 0);

    return unionWeight > 0 ? sharedWeight / unionWeight : 0;
  }

  function averagePairSimilarity(items = [], profile = {}) {
    if (items.length < 2) return 0;

    let total = 0;
    let comparisons = 0;

    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        total += packSimilarity(items[left].pack, items[right].pack, profile);
        comparisons += 1;
      }
    }

    return comparisons ? total / comparisons : 0;
  }

  function deriveCollectionSignature(items = [], profile = {}) {
    const catalogueSize = Math.max(1, safeNumber(profile.packCount, 1));
    const tagFrequency = profile.tagFrequency instanceof Map
      ? profile.tagFrequency
      : new Map();
    const localFrequency = new Map();
    const displayValues = new Map();

    items.forEach((item) => {
      getPackTags(item.pack).forEach((tag) => {
        localFrequency.set(tag.key, (localFrequency.get(tag.key) || 0) + 1);
        if (!displayValues.has(tag.key)) {
          displayValues.set(tag.key, tag.display);
        }
      });
    });

    return [...localFrequency.entries()]
      .map(([key, count]) => {
        const globalCount = Math.max(1, safeNumber(tagFrequency.get(key), 1));
        const coverage = items.length ? count / items.length : 0;
        const specificity = Math.log((catalogueSize + 1) / (globalCount + 1)) + 1;

        return {
          key,
          display: displayValues.get(key) || key,
          count,
          coverage,
          weight: coverage * specificity
        };
      })
      .filter((entry) => entry.coverage >= 0.34)
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        return b.count - a.count;
      })
      .slice(0, 2);
  }

  function buildCollectionTitle(signature = [], context = {}) {
    const labels = signature
      .map((entry) => prettyTag(entry.display || entry.key))
      .filter(Boolean);

    if (!labels.length) return "À explorer";

    const editionKey =
      normalizeText(context.editionKey) ||
      getMonthlyEditionKey(context.now);

    const signatureKey = signature
      .map((entry) => entry.key)
      .join("|");

    const [editionYear, editionMonth] = editionKey
      .split("-")
      .map((value) => Number(value));

    const editionIndex =
      Number.isFinite(editionYear) &&
      Number.isFinite(editionMonth)
        ? editionYear * 12 + editionMonth
        : 0;

    /*
      Le titre avance d'une variante chaque mois. Le regroupement reste
      piloté par le catalogue ; seule sa présentation éditoriale tourne.
    */
    const variant =
      stringHash(signatureKey) + editionIndex;

    if (labels.length >= 2) {
      const templates = [
        `${labels[0]} · ${labels[1]}`,
        `Entre ${labels[0]} et ${labels[1]}`,
        `${labels[0]} / ${labels[1]}`,
        `Sélection ${labels[0]} · ${labels[1]}`
      ];

      return templates[variant % templates.length];
    }

    const templates = [
      `${labels[0]}`,
      `${labels[0]} du moment`,
      `À découvrir : ${labels[0]}`,
      `Sélection ${labels[0]}`,
      `Autour de ${labels[0]}`
    ];

    return templates[variant % templates.length];
  }

  function collectionOverlap(collectionA = {}, collectionB = {}) {
    const idsA = new Set((collectionA.items || []).map((item) => item.pack.id));
    const idsB = new Set((collectionB.items || []).map((item) => item.pack.id));

    if (!idsA.size || !idsB.size) return 0;

    const intersection = [...idsA].filter((id) => idsB.has(id)).length;
    const union = new Set([...idsA, ...idsB]).size;
    return union ? intersection / union : 0;
  }

  function buildClusterCandidates(rankedItems = [], context = {}) {
    const profile = context.catalogueProfile || {};
    const packCount = rankedItems.length;

    if (packCount < 2) return [];

    const minimumItems = packCount < 7 ? 2 : 3;
    const maximumItems = clamp(
      Math.ceil(Math.sqrt(packCount)) + 3,
      4,
      DEFAULT_MAX_SECTION_ITEMS
    );
    const similarityFloor = packCount < 7 ? 0.16 : 0.2;

    const candidates = [];

    rankedItems.forEach((seedItem) => {
      const neighbors = rankedItems
        .filter((item) => item.pack.id !== seedItem.pack.id)
        .map((item) => ({
          item,
          similarity: packSimilarity(seedItem.pack, item.pack, profile)
        }))
        .filter((entry) => entry.similarity >= similarityFloor)
        .sort((a, b) => {
          const aValue = a.similarity * 100 + safeNumber(a.item.score?.total, 0) * 0.24;
          const bValue = b.similarity * 100 + safeNumber(b.item.score?.total, 0) * 0.24;
          return bValue - aValue;
        });

      const clusterItems = [
        seedItem,
        ...neighbors.slice(0, Math.max(0, maximumItems - 1)).map((entry) => entry.item)
      ];

      if (clusterItems.length < minimumItems) return;

      const signature = deriveCollectionSignature(clusterItems, profile);
      if (!signature.length) return;

      const artistCount = new Set(clusterItems.map((item) => item.artistKey)).size;
      const artistDiversity = artistCount / clusterItems.length;
      const cohesion = averagePairSimilarity(clusterItems, profile);
      const averageDistributionScore = clusterItems.reduce(
        (sum, item) => sum + safeNumber(item.score?.total, 0),
        0
      ) / clusterItems.length;

      const candidateScore =
        averageDistributionScore +
        cohesion * 42 +
        artistDiversity * 18 +
        Math.min(clusterItems.length, 8) * 1.5;

      const signatureKey = signature.map((entry) => entry.key).join("|");

      candidates.push({
        id: `dynamic:${signatureKey}:${seedItem.pack.id}`,
        kind: "dynamic",
        title: buildCollectionTitle(signature, context),
        subtitle: "",
        signature,
        score: candidateScore,
        cohesion,
        artistDiversity,
        items: clusterItems
      });
    });

    const uniqueCandidates = [];

    candidates
      .sort((a, b) => b.score - a.score)
      .forEach((candidate) => {
        const duplicate = uniqueCandidates.some((existing) => {
          const sameSignature =
            existing.signature.map((entry) => entry.key).join("|") ===
            candidate.signature.map((entry) => entry.key).join("|");

          return sameSignature || collectionOverlap(existing, candidate) >= 0.72;
        });

        if (!duplicate) {
          uniqueCandidates.push(candidate);
        }
      });

    return uniqueCandidates;
  }

  function resolveSectionLimit(packCount) {
    if (packCount < 2) return 0;
    if (packCount <= 5) return 1;
    if (packCount <= 10) return 2;
    if (packCount <= 18) return 3;
    if (packCount <= 30) return 4;
    return 5;
  }

  function allocateDynamicCollections(candidates = [], rankedItems = [], context = {}) {
    const packCount = rankedItems.length;
    const maxSections = resolveSectionLimit(packCount);
    if (!maxSections) return [];

    const exposure = new Map();
    const maxExposure = packCount <= 5 ? 3 : 2;
    const profile = context.catalogueProfile || {};
    const penalties = resolveArtistPenalties(profile);
    const result = [];

    for (const candidate of candidates) {
      if (result.length >= maxSections) break;

      const allowed = candidate.items.filter((item) => {
        const uses = exposure.get(item.pack.id) || 0;
        return uses < maxExposure;
      });

      const minimumItems = packCount < 7 ? 2 : 3;
      if (allowed.length < minimumItems) continue;

      const diversified = diversifyArtists(allowed, {
        repetitionPenalty: penalties.repetition,
        consecutivePenalty: penalties.consecutive
      });

      const items = diversified.slice(0, DEFAULT_MAX_SECTION_ITEMS);
      const uniqueArtists = new Set(items.map((item) => item.artistKey));

      if (
        items.length >= 3 &&
        uniqueArtists.size === 1 &&
        safeNumber(profile.uniqueArtistCount, 0) > 1
      ) {
        continue;
      }

      items.forEach((item) => {
        exposure.set(item.pack.id, (exposure.get(item.pack.id) || 0) + 1);
      });

      result.push({
        ...candidate,
        items
      });
    }

    return result;
  }

  function getBaseDistributionCategory(pack = {}) {
    /*
      Un vieux pack peut encore contenir "emotional", "dark", "calm", etc.
      On ne devine jamais sa nouvelle catégorie : on conserve ces valeurs pour
      l'analyse dynamique, mais on ne les transforme pas en catégorie éditoriale.
    */
    return getPackTags(pack).find((tag) => BASE_CATEGORY_KEYS.has(tag.key)) || null;
  }

  function buildCategoryDescription(tag = {}) {
    const key = normalizeTag(tag.key || tag.display);
    if (CATEGORY_DESCRIPTIONS[key]) {
      return CATEGORY_DESCRIPTIONS[key];
    }

    const label = prettyTag(tag.display || tag.key);
    return label ? `Des sons et des packs autour de ${label.toLowerCase()}.` : "";
  }

  function buildDynamicCollectionDescription(signature = []) {
    const labels = signature
      .map((entry) => prettyTag(entry.display || entry.key))
      .filter(Boolean);

    if (!labels.length) return "Des sons à explorer selon leur univers musical.";
    if (labels.length === 1) {
      return `Des sons qui explorent un univers ${labels[0].toLowerCase()}.`;
    }

    return `Des sons qui croisent ${labels[0].toLowerCase()} et ${labels[1].toLowerCase()}.`;
  }

  function buildBaseCategorySections(rankedItems = [], context = {}) {
    if (!rankedItems.length) return [];

    const groups = new Map();

    rankedItems.forEach((item) => {
      /*
        La première catégorie correspond au choix éditorial de l'artiste.
        Aucun lien artificiel n'est créé entre catégories.
      */
      const primaryCategory = getBaseDistributionCategory(item.pack);
      if (!primaryCategory?.key) return;

      if (!groups.has(primaryCategory.key)) {
        groups.set(primaryCategory.key, {
          tag: primaryCategory,
          items: []
        });
      }

      groups.get(primaryCategory.key).items.push(item);
    });

    const profile = context.catalogueProfile || {};
    const penalties = resolveArtistPenalties(profile);
    const groupList = [...groups.values()]
      .map((group) => {
        const diversified = diversifyArtists(group.items, {
          repetitionPenalty: penalties.repetition,
          consecutivePenalty: penalties.consecutive
        });

        const averageScore = diversified.reduce(
          (sum, item) => sum + safeNumber(item.score?.total, 0),
          0
        ) / Math.max(1, diversified.length);

        return {
          ...group,
          items: diversified.slice(0, DEFAULT_MAX_SECTION_ITEMS),
          score:
            averageScore +
            Math.min(diversified.length, 8) * 2
        };
      })
      .sort((a, b) => b.score - a.score);

    const maxSections = clamp(
      Math.ceil(Math.sqrt(Math.max(1, rankedItems.length))),
      1,
      4
    );

    return groupList
      .slice(0, maxSections)
      .map((group) => {
        const signature = [{
          key: group.tag.key,
          display: group.tag.display,
          coverage: 1
        }];

        return {
          id: `category:${group.tag.key}`,
          kind: "category",
          // La catégorie reste bien la base réelle choisie à la publication,
          // mais son titre sur la Home peut tourner entre une version simple
          // (ex. "Piano") et des variantes éditoriales (ex. "Sélection Piano").
          title: buildCollectionTitle(signature, context),
          subtitle: "",
          signature,
          score: group.score,
          items: group.items
        };
      });
  }

  function buildArtistSpotlightSection(rankedItems = [], context = {}) {
    if (!rankedItems.length) return null;

    const artists = new Map();

    rankedItems.forEach((item) => {
      const profile = getArtistProfile(item.pack);
      if (!profile.accountId) return;

      const key = profile.accountId.toLowerCase();
      const activity = getPackActivity(item.pack);
      const referenceDate = getPackReferenceDate(item.pack);
      const trackCount = Array.isArray(item.pack?.tracks)
        ? item.pack.tracks.length
        : 0;
      const signals = item.score?.signals || {};

      if (!artists.has(key)) {
        artists.set(key, {
          ...profile,
          packCount: 0,
          trackCount: 0,
          downloadCount: 0,
          salesCount: 0,
          latestPackAt: 0,
          reputationTotal: 0,
          consistencyTotal: 0,
          performanceTotal: 0,
          recencyTotal: 0,
          bestPackScore: 0
        });
      }

      const artist = artists.get(key);
      artist.packCount += 1;
      artist.trackCount += trackCount;
      artist.downloadCount += activity.downloads;
      artist.salesCount += activity.sales;
      artist.latestPackAt = Math.max(artist.latestPackAt, referenceDate);
      artist.reputationTotal += safeNumber(signals.reputation, 0);
      artist.consistencyTotal += safeNumber(signals.consistency, 0);
      artist.performanceTotal += safeNumber(signals.performance, 0);
      artist.recencyTotal += safeNumber(signals.recency, 0);
      artist.bestPackScore = Math.max(
        artist.bestPackScore,
        safeNumber(item.score?.total, 0)
      );

      if (!artist.avatar && profile.avatar) artist.avatar = profile.avatar;
      if (!artist.imageArtist && profile.imageArtist) artist.imageArtist = profile.imageArtist;
      if (!artist.imageProfile && profile.imageProfile) artist.imageProfile = profile.imageProfile;
      if (!artist.biography && profile.biography) artist.biography = profile.biography;
    });

    const rankedArtists = [...artists.values()]
      .map((artist) => {
        const divisor = Math.max(1, artist.packCount);
        const reputation = artist.reputationTotal / divisor;
        const consistency = artist.consistencyTotal / divisor;
        const performance = artist.performanceTotal / divisor;
        const recency = artist.recencyTotal / divisor;

        return {
          ...artist,
          momentScore: clamp(
            reputation * 0.28 +
            consistency * 0.27 +
            performance * 0.27 +
            recency * 0.18,
            0,
            100
          )
        };
      })
      .sort((a, b) => {
        if (b.momentScore !== a.momentScore) {
          return b.momentScore - a.momentScore;
        }
        if (b.downloadCount !== a.downloadCount) {
          return b.downloadCount - a.downloadCount;
        }
        return b.latestPackAt - a.latestPackAt;
      });

    if (!rankedArtists.length) return null;

    const limit = clamp(
      Math.ceil(Math.sqrt(rankedArtists.length)) + 3,
      1,
      DEFAULT_MAX_SECTION_ITEMS
    );

    return {
      id: "artists:moment",
      kind: "artists",
      title: "Artistes du moment",
      subtitle: "",
      items: rankedArtists.slice(0, limit)
    };
  }

  function buildDiscoverySection(rankedItems = [], context = {}) {
    if (!rankedItems.length) return null;

    const packCount = rankedItems.length;
    const maxItems = clamp(
      Math.ceil(Math.sqrt(packCount)) + 5,
      6,
      DEFAULT_MAX_SECTION_ITEMS
    );

    return {
      id: "discovery:main",
      kind: "discovery",
      title: "À découvrir",
      subtitle: "",
      items: rankedItems.slice(0, maxItems)
    };
  }

  function buildAlternativeDiscoverySection(rankedItems = [], dynamicSections = [], context = {}) {
    if (rankedItems.length < 7) return null;

    const usedInDynamic = new Set(
      dynamicSections.flatMap((section) =>
        section.items.map((item) => item.pack.id)
      )
    );

    const candidates = rankedItems
      .filter((item) => !usedInDynamic.has(item.pack.id))
      .sort((a, b) => {
        const aActivity = getPackActivity(a.pack).weightedActivity;
        const bActivity = getPackActivity(b.pack).weightedActivity;
        const aDiscovery = safeNumber(a.score?.signals?.discovery, 0);
        const bDiscovery = safeNumber(b.score?.signals?.discovery, 0);

        return (
          (bDiscovery - aDiscovery) ||
          (aActivity - bActivity) ||
          (safeNumber(b.score?.total, 0) - safeNumber(a.score?.total, 0))
        );
      });

    if (candidates.length < 3) return null;

    const profile = context.catalogueProfile || {};
    const penalties = resolveArtistPenalties(profile);
    const diversified = diversifyArtists(candidates, {
      repetitionPenalty: penalties.repetition,
      consecutivePenalty: penalties.consecutive
    });

    return {
      id: "discovery:alternate",
      kind: "exploration",
      title: "Un autre angle",
      subtitle: "",
      items: diversified.slice(0, DEFAULT_MAX_SECTION_ITEMS)
    };
  }

  function decorateItem(item, position, context = {}, sectionId = "global") {
    return {
      ...item.pack,
      distribution: {
        version: DISTRIBUTION_VERSION,
        sectionId,
        position: position + 1,
        score: Number(safeNumber(item.score?.total, 0).toFixed(3)),
        signals: Object.fromEntries(
          Object.entries(item.score?.signals || {}).map(
            ([key, value]) => [key, Number(safeNumber(value, 0).toFixed(3))]
          )
        ),
        weights: Object.fromEntries(
          Object.entries(item.score?.weights || {}).map(
            ([key, value]) => [key, Number(safeNumber(value, 1).toFixed(3))]
          )
        )
      }
    };
  }

  function decorateSection(section, context = {}) {
    const isArtistSection = section.kind === "artists";

    return {
      id: section.id,
      kind: section.kind,
      title: section.title,
      subtitle: section.subtitle || "",
      signature: Array.isArray(section.signature)
        ? section.signature.map((entry) => ({
            key: entry.key,
            label: prettyTag(entry.display || entry.key),
            coverage: Number(safeNumber(entry.coverage, 0).toFixed(3))
          }))
        : [],
      items: isArtistSection
        ? section.items.map((artist, index) => ({
            ...artist,
            momentScore: Number(
              safeNumber(artist.momentScore, 0).toFixed(3)
            ),
            position: index + 1
          }))
        : section.items.map((item, index) =>
            decorateItem(item, index, context, section.id)
          )
    };
  }

  function createHomeDistribution(rawPacks = [], options = {}) {
    const now = safeNumber(options.now, Date.now());

    const eligiblePacks = Array.isArray(rawPacks)
      ? rawPacks.filter(isEligiblePack)
      : [];

    const catalogueProfile = buildCatalogueProfile(eligiblePacks, now);
    const performanceProfile = buildPerformanceProfile(eligiblePacks);
    const artistAnalytics = buildArtistAnalytics(eligiblePacks, now);
    const reputationProfile = buildReputationProfile(artistAnalytics);

    const context = {
      now,
      editionKey: getMonthlyEditionKey(now),
      userContext: options.userContext || null,
      catalogueProfile,
      performanceProfile,
      artistAnalytics,
      reputationProfile
    };
    context.distributionWeights = resolveDistributionWeights(context);

    const artistPenalties = resolveArtistPenalties(catalogueProfile);

    const scoredItems = eligiblePacks
      .map((pack) => ({
        pack,
        artistKey: getArtistKey(pack),
        score: scorePack(pack, context)
      }))
      .sort((a, b) => {
        if (b.score.total !== a.score.total) {
          return b.score.total - a.score.total;
        }
        return getPackReferenceDate(b.pack) - getPackReferenceDate(a.pack);
      });

    const diversifiedItems = diversifyArtists(scoredItems, {
      repetitionPenalty: artistPenalties.repetition,
      consecutivePenalty: artistPenalties.consecutive
    });

    const rankedItems = ensureInitialDiscoveryExposure(
      diversifiedItems,
      context
    );

    const baseCategorySections =
      buildBaseCategorySections(rankedItems, context);

    const clusterCandidates = buildClusterCandidates(rankedItems, context);
    const rawDynamicSections = allocateDynamicCollections(
      clusterCandidates,
      rankedItems,
      context
    );

    const dynamicSections = rawDynamicSections.filter(
      (candidate) =>
        !baseCategorySections.some(
          (categorySection) =>
            collectionOverlap(candidate, categorySection) >= 0.72
        )
    );

    const sections = [];
    const discoverySection = buildDiscoverySection(rankedItems, context);

    if (discoverySection) {
      sections.push(discoverySection);
    }

    const artistSpotlightSection =
      buildArtistSpotlightSection(rankedItems, context);

    if (artistSpotlightSection) {
      sections.push(artistSpotlightSection);
    }

    baseCategorySections.forEach((section) => sections.push(section));
    dynamicSections.forEach((section) => sections.push(section));

    const alternativeSection = buildAlternativeDiscoverySection(
      rankedItems,
      [...baseCategorySections, ...dynamicSections],
      context
    );

    if (alternativeSection) {
      sections.push(alternativeSection);
    }

    const result = {
      version: DISTRIBUTION_VERSION,
      generatedAt: new Date(now).toISOString(),
      mode: hasUserHistory(options.userContext)
        ? "catalogue-adaptive"
        : "new-user-adaptive",
      catalogue: {
        packCount: catalogueProfile.packCount,
        uniqueArtistCount: catalogueProfile.uniqueArtistCount,
        activityCoverage: Number(catalogueProfile.activityCoverage.toFixed(3)),
        recent30Ratio: Number(catalogueProfile.recent30Ratio.toFixed(3)),
        editionKey: context.editionKey,
        performanceSignalsAvailable: Boolean(performanceProfile.available),
        distributionWeights: Object.fromEntries(
          Object.entries(context.distributionWeights).map(
            ([key, value]) => [key, Number(safeNumber(value, 0).toFixed(3))]
          )
        )
      },
      items: rankedItems.map((item, index) =>
        decorateItem(item, index, context, "global")
      ),
      sections: sections.map((section) => decorateSection(section, context))
    };

    if (options.debug === true) {
      result.debug = rankedItems.map((item, index) => ({
        position: index + 1,
        packId: normalizeText(item.pack?.id),
        artistId: normalizeText(
          item.pack?.artistProfile?.accountId ||
          item.pack?.accountId ||
          item.pack?.artistId
        ),
        reputation: Number(safeNumber(item.score?.signals?.reputation, 0).toFixed(2)),
        consistency: Number(safeNumber(item.score?.signals?.consistency, 0).toFixed(2)),
        performance: Number(safeNumber(item.score?.signals?.performance, 0).toFixed(2)),
        discovery: Number(safeNumber(item.score?.signals?.discovery, 0).toFixed(2)),
        recency: Number(safeNumber(item.score?.signals?.recency, 0).toFixed(2)),
        affinity: Number(safeNumber(item.score?.signals?.affinity, 0).toFixed(2)),
        missionVisibilityBoost: Number(safeNumber(item.score?.missionVisibilityBoost, 0).toFixed(2)),
        baseScore: Number(safeNumber(item.score?.baseTotal, 0).toFixed(2)),
        finalScore: Number(safeNumber(item.score?.total, 0).toFixed(2)),
        weights: { ...item.score.weights },
        details: item.score.details
      }));
    }

    return result;
  }

  function createDistributionDebug(rawPacks = [], options = {}) {
    return createHomeDistribution(rawPacks, {
      ...options,
      debug: true
    }).debug || [];
  }

  globalScope.SonaraDistribution = Object.freeze({
    version: DISTRIBUTION_VERSION,
    config: DISTRIBUTION_CONFIG,
    createHomeDistribution,
    createDistributionDebug,
    scorePack,
    artistReputationScore,
    artistConsistencyScore,
    packPerformanceScore,
    discoveryScore,
    recencyScore,
    userAffinityScore,
    freshnessScore,
    popularityScore,
    diversifyArtists,
    ensureInitialDiscoveryExposure,
    isEligiblePack,
    getArtistKey,
    getPackTags,
    packSimilarity,
    buildCatalogueProfile,
    buildPerformanceProfile,
    buildArtistAnalytics,
    buildArtistSpotlightSection,
    buildBaseCategorySections,
    getArtistProfile,
    getMonthlyEditionKey
  });
})(window);
