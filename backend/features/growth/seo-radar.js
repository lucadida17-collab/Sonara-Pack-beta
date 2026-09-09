const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GOOGLE_INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_SEARCH_ANALYTICS_BASE = 'https://www.googleapis.com/webmasters/v3';
const GOOGLE_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const GOOGLE_REFRESH_LIMIT = 12;
const MANUAL_GOOGLE_REFRESH_LIMIT = 30;
const LOCAL_AUDIT_LIMIT = 80;
const FETCH_TIMEOUT_MS = 9000;

function normalizeEnvironment(value) {
  const env = String(value || '').trim().toLowerCase();
  return ['local', 'test', 'main'].includes(env) ? env : 'local';
}

function nowIso() {
  return new Date().toISOString();
}

function safeDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueStrings(values = [], max = 100) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, max);
}

function sameUrl(a, b) {
  try {
    const left = new URL(String(a || ''));
    const right = new URL(String(b || ''));
    const normalizePath = (pathname) => pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
    return left.protocol === right.protocol && left.host === right.host && normalizePath(left.pathname) === normalizePath(right.pathname) && left.search === right.search;
  } catch {
    return String(a || '').replace(/\/+$/, '') === String(b || '').replace(/\/+$/, '');
  }
}

function htmlText(value = '') {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function readAttr(tag = '', name = '') {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? String(match[2] || '').trim() : '';
}

function firstMatch(html = '', pattern) {
  const match = String(html).match(pattern);
  return match ? String(match[1] || '').trim() : '';
}

function metaContent(html = '', key = '', attribute = 'name') {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (readAttr(tag, attribute).toLowerCase() === String(key || '').toLowerCase()) return readAttr(tag, 'content');
  }
  return '';
}

function canonicalHref(html = '') {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const rel = readAttr(tag, 'rel').toLowerCase().split(/\s+/g);
    if (rel.includes('canonical')) return readAttr(tag, 'href');
  }
  return '';
}

function imageTags(html = '') {
  return String(html).match(/<img\b[^>]*>/gi) || [];
}

function anchorHrefs(html = '') {
  return (String(html).match(/<a\b[^>]*>/gi) || []).map((tag) => readAttr(tag, 'href')).filter(Boolean);
}

function resolveUrl(baseUrl, value) {
  try { return new URL(String(value || ''), String(baseUrl || '')).toString(); }
  catch { return String(value || ''); }
}

function robotsAllowsPath(robotsText = '', targetUrl = '', userAgent = 'Googlebot') {
  let pathname = '/';
  try { pathname = new URL(targetUrl).pathname || '/'; } catch {}
  const lines = String(robotsText || '').split(/\r?\n/g).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
  const groups = [];
  let group = null;
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      continue;
    }
    if (!group || !['allow', 'disallow'].includes(field)) continue;
    group.rules.push({ type: field, path: value });
  }
  const ua = String(userAgent || '').toLowerCase();
  const matching = groups.filter((item) => item.agents.some((agent) => agent === '*' || ua.includes(agent)));
  const exact = matching.filter((item) => item.agents.some((agent) => agent !== '*' && ua.includes(agent)));
  const active = exact.length ? exact : matching.filter((item) => item.agents.includes('*'));
  const rules = active.flatMap((item) => item.rules).filter((rule) => rule.path);
  let winner = null;
  for (const rule of rules) {
    const clean = rule.path.split('*')[0];
    if (!clean || !pathname.startsWith(clean)) continue;
    if (!winner || clean.length > winner.path.length || (clean.length === winner.path.length && rule.type === 'allow')) {
      winner = { ...rule, path: clean };
    }
  }
  return !winner || winner.type !== 'disallow';
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function localAuditStatus(audit = {}) {
  const hard = [];
  if (Number(audit.httpStatus || 0) !== 200) hard.push(`HTTP_${audit.httpStatus || 'ERROR'}`);
  if (audit.noindex === true) hard.push('NOINDEX');
  if (audit.robotsAllowed === false) hard.push('ROBOTS_BLOCKED');
  if (!audit.canonical) hard.push('CANONICAL_MISSING');
  else if (!sameUrl(audit.canonical, audit.url)) hard.push('CANONICAL_MISMATCH');
  if (!audit.title) hard.push('TITLE_MISSING');
  if (!audit.metaDescription) hard.push('META_DESCRIPTION_MISSING');
  if (!audit.h1) hard.push('H1_MISSING');
  if (audit.kind === 'pack' || audit.kind === 'track') {
    if (!audit.image?.present) hard.push('IMAGE_MISSING');
    else {
      if (!audit.image.alt) hard.push('IMAGE_ALT_MISSING');
      if (!audit.image.public) hard.push('IMAGE_NOT_PUBLIC');
      if (audit.image.robotsAllowed === false) hard.push('IMAGE_ROBOTS_BLOCKED');
      if (!audit.image.width || !audit.image.height) hard.push('IMAGE_DIMENSIONS_MISSING');
      if (audit.image.inSitemap === false) hard.push('IMAGE_SITEMAP_MISSING');
      if (audit.openGraphImage && audit.image.matchesOpenGraph === false) hard.push('OG_IMAGE_MISMATCH');
    }
    if (!audit.openGraphImage) hard.push('OG_IMAGE_MISSING');
  }
  if (!audit.sitemapDetected) hard.push('SITEMAP_MISSING');
  if (audit.kind === 'pack' || audit.kind === 'track') {
    if (!audit.incomingLinkDetected) hard.push('INTERNAL_LINK_MISSING');
  }
  return { ready: hard.length === 0, issues: hard };
}

function classifyGoogleStatus(index = {}, localAudit = {}) {
  const coverage = String(index.coverageState || '').trim();
  const verdict = String(index.verdict || '').toUpperCase();
  const robots = String(index.robotsTxtState || '').toUpperCase();
  const indexing = String(index.indexingState || '').toUpperCase();
  const fetchState = String(index.pageFetchState || '').toUpperCase();
  const hasLocalAudit = Boolean(localAudit && (localAudit.checkedAt || localAudit.httpStatus || localAudit.fetchError));
  const local = hasLocalAudit ? localAuditStatus(localAudit) : { ready: true, issues: [] };

  const technical = [];
  if (robots.includes('BLOCKED') || robots.includes('DISALLOWED')) technical.push('ROBOTS_BLOCKED');
  if (indexing.includes('BLOCKED')) technical.push(indexing || 'NOINDEX');
  if (fetchState && !['SUCCESSFUL', 'PAGE_FETCH_STATE_UNSPECIFIED'].includes(fetchState)) technical.push(fetchState);
  if (coverage && /soft 404|redirect error|server error|blocked|unauthorized|forbidden|not found|5\d\d|4\d\d/i.test(coverage)) technical.push(coverage);
  if (index.userCanonical && index.googleCanonical && !sameUrl(index.userCanonical, index.googleCanonical)) technical.push('GOOGLE_CANONICAL_DIFFERS');
  if (!local.ready && local.issues.some((issue) => /HTTP_|NOINDEX|ROBOTS|CANONICAL/.test(issue))) technical.push(...local.issues.filter((issue) => /HTTP_|NOINDEX|ROBOTS|CANONICAL/.test(issue)));

  if (technical.length) {
    return { code: 'TECHNICAL_ERROR', color: 'red', label: 'Technical problem', reasons: uniqueStrings(technical) };
  }
  if (verdict === 'PASS' || /submitted and indexed|indexed/i.test(coverage) && !/not indexed|excluded|duplicate/i.test(coverage)) {
    return { code: 'INDEXED', color: 'green', label: 'Indexed', reasons: [] };
  }
  if (index.lastCrawlTime) {
    const hints = [];
    if (!local.ready) hints.push(...local.issues);
    if (Number(localAudit.visibleTextLength || 0) > 0 && localAudit.visibleTextLength < 350) hints.push('CONTENT_MAY_BE_THIN');
    if (!localAudit.structuredData) hints.push('STRUCTURED_DATA_MISSING');
    return { code: 'CRAWLED_NOT_INDEXED', color: 'orange', label: 'Crawled, not indexed', reasons: uniqueStrings(hints.length ? hints : [coverage || 'GOOGLE_NOT_INDEXED']) };
  }
  const unknownToGoogle = /unknown to google|not known to google/i.test(coverage);
  return { code: 'WAITING_FOR_CRAWL', color: 'blue', label: unknownToGoogle ? 'Not discovered by Google' : 'Discovered', reasons: [coverage || 'WAITING_FOR_CRAWL'] };
}

function nextInspectionDelayMs(page = {}, status = {}) {
  const created = safeDate(page.publishedAt || page.discoveredAt) || new Date();
  const age = Date.now() - created.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (status.code === 'TECHNICAL_ERROR') return 12 * 60 * 60 * 1000;
  if (age < 3 * day) return 6 * 60 * 60 * 1000;
  if (age < 14 * day) return 12 * 60 * 60 * 1000;
  if (status.code === 'INDEXED') return 72 * 60 * 60 * 1000;
  if (age < 60 * day) return day;
  return 48 * 60 * 60 * 1000;
}

function createJsonStore(filePath) {
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : { pages: {}, meta: {} };
    } catch { return { pages: {}, meta: {} }; }
  }
  function write(state) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }
  return {
    async listPages() { return Object.values(read().pages || {}); },
    async upsertPage(url, patch) { const state = read(); state.pages ||= {}; state.pages[url] = { ...(state.pages[url] || {}), ...patch, url }; write(state); return state.pages[url]; },
    async getMeta(key) { return read().meta?.[key] || null; },
    async setMeta(key, value) { const state = read(); state.meta ||= {}; state.meta[key] = value; write(state); return value; }
  };
}

function createMongoStore(db, environment) {
  const collection = db.collection(`seo_radar_${environment}`);
  return {
    async listPages() { return collection.find({ type: 'page' }, { projection: { _id: 0 } }).toArray(); },
    async upsertPage(url, patch) {
      const value = { ...patch, type: 'page', url, updatedAt: nowIso() };
      await collection.updateOne({ type: 'page', url }, { $set: value }, { upsert: true });
      return collection.findOne({ type: 'page', url }, { projection: { _id: 0 } });
    },
    async getMeta(key) { const item = await collection.findOne({ type: 'meta', key }, { projection: { _id: 0 } }); return item?.value || null; },
    async setMeta(key, value) { await collection.updateOne({ type: 'meta', key }, { $set: { type: 'meta', key, value, updatedAt: nowIso() } }, { upsert: true }); return value; }
  };
}

function createStore({ db, dataDir, environment }) {
  if (db && typeof db.collection === 'function') return createMongoStore(db, environment);
  return createJsonStore(path.join(dataDir || process.cwd(), `seo-radar-${environment}.json`));
}

function googleConfig(environment) {
  if (normalizeEnvironment(environment) !== 'main') return { enabled: false, reason: 'MAIN_ONLY' };
  const clientId = String(process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET || '').trim();
  const refreshToken = String(process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN || '').trim();
  const siteUrl = String(process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || 'sc-domain:sonarapack.com').trim();
  const enabled = Boolean(clientId && clientSecret && refreshToken && siteUrl);
  return { enabled, clientId, clientSecret, refreshToken, siteUrl, reason: enabled ? '' : 'GOOGLE_OAUTH_NOT_CONFIGURED' };
}

function createGoogleClient({ environment, fetchImpl = global.fetch }) {
  const config = googleConfig(environment);
  let accessToken = '';
  let expiresAt = 0;

  async function token() {
    if (!config.enabled) throw Object.assign(new Error('Google Search Console OAuth non configuré.'), { code: config.reason });
    if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    });
    const response = await fetchWithTimeout(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw Object.assign(new Error(data.error_description || data.error || `OAuth Google ${response.status}`), { status: response.status });
    accessToken = String(data.access_token);
    expiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000;
    return accessToken;
  }

  async function inspect(url) {
    const bearer = await token();
    const response = await fetchWithTimeout(fetchImpl, GOOGLE_INSPECTION_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: config.siteUrl, languageCode: 'fr-FR' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data?.error?.message || `Inspection Google ${response.status}`), { status: response.status, payload: data });
    return data?.inspectionResult?.indexStatusResult || {};
  }

  async function performance(days = 28) {
    const bearer = await token();
    const end = new Date();
    const start = new Date(end.getTime() - Math.max(1, Number(days || 28) - 1) * 86400000);
    const fmt = (date) => date.toISOString().slice(0, 10);
    const endpoint = `${GOOGLE_SEARCH_ANALYTICS_BASE}/sites/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`;
    const response = await fetchWithTimeout(fetchImpl, endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), type: 'web', rowLimit: 1 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data?.error?.message || `Search Analytics ${response.status}`), { status: response.status, payload: data });
    const row = Array.isArray(data.rows) ? data.rows[0] || {} : {};
    return {
      periodDays: days,
      startDate: fmt(start),
      endDate: fmt(end),
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 0),
      fetchedAt: nowIso()
    };
  }

  return { config: { enabled: config.enabled, siteUrl: config.siteUrl, reason: config.reason }, inspect, performance };
}

async function imagePublicCheck(fetchImpl, imageUrl) {
  if (!imageUrl) return { public: false, status: 0, contentType: '' };
  try {
    const response = await fetchWithTimeout(fetchImpl, imageUrl, { headers: { Range: 'bytes=0-2047', 'User-Agent': 'SonaraSeoRadar/1.0' } });
    return {
      public: response.status === 200 || response.status === 206,
      status: response.status,
      contentType: String(response.headers.get('content-type') || '')
    };
  } catch (error) {
    return { public: false, status: 0, contentType: '', error: error.message || 'IMAGE_FETCH_FAILED' };
  }
}

function htmlIncludesLink(html, sourceUrl, targetUrl) {
  return anchorHrefs(html).some((href) => sameUrl(resolveUrl(sourceUrl, href), targetUrl));
}

async function auditPage({ fetchImpl, page, sitemapXml = '', robotsText = '', parentHtmlCache = new Map() }) {
  const audit = {
    url: page.url,
    kind: page.kind,
    checkedAt: nowIso(),
    httpStatus: 0,
    fetchOk: false,
    robotsAllowed: robotsAllowsPath(robotsText, page.url, 'Googlebot'),
    noindex: false,
    canonical: '',
    title: '',
    metaDescription: '',
    h1: '',
    visibleTextLength: 0,
    openGraphImage: '',
    structuredData: false,
    sitemapDetected: sitemapXml.includes(`<loc>${page.url}</loc>`) || sitemapXml.includes(`<loc><![CDATA[${page.url}]]></loc>`),
    incomingLinkDetected: false,
    incomingLinkSources: [],
    image: { present: false, src: '', alt: '', width: 0, height: 0, public: false, httpStatus: 0, contentType: '', robotsAllowed: true, inSitemap: false, matchesOpenGraph: false },
    issues: []
  };

  try {
    const response = await fetchWithTimeout(fetchImpl, page.url, { headers: { 'User-Agent': 'SonaraSeoRadar/1.0 (+https://sonarapack.com)' } });
    audit.httpStatus = response.status;
    audit.fetchOk = response.ok;
    const xRobots = String(response.headers.get('x-robots-tag') || '');
    const html = await response.text();
    audit.title = htmlText(firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
    audit.metaDescription = metaContent(html, 'description');
    audit.h1 = htmlText(firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
    audit.canonical = resolveUrl(page.url, canonicalHref(html));
    const robotsMeta = `${metaContent(html, 'robots')} ${metaContent(html, 'googlebot')} ${xRobots}`.toLowerCase();
    audit.noindex = /(?:^|[,\s])noindex(?:[,\s]|$)/i.test(robotsMeta);
    audit.openGraphImage = resolveUrl(page.url, metaContent(html, 'og:image', 'property'));
    audit.structuredData = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
    audit.visibleTextLength = htmlText(html).length;

    const imgs = imageTags(html);
    if (imgs.length) {
      const primary = imgs.find((tag) => /public-catalog-cover/i.test(readAttr(tag, 'class'))) || imgs[0];
      const src = resolveUrl(page.url, readAttr(primary, 'src'));
      const imageCheck = await imagePublicCheck(fetchImpl, src);
      let imageRobotsAllowed = true;
      try {
        const pageHost = new URL(page.url).host;
        const imageHost = new URL(src).host;
        if (pageHost === imageHost) imageRobotsAllowed = robotsAllowsPath(robotsText, src, 'Googlebot-Image');
      } catch {}
      audit.image = {
        present: Boolean(src),
        src,
        alt: readAttr(primary, 'alt'),
        width: Number(readAttr(primary, 'width') || 0),
        height: Number(readAttr(primary, 'height') || 0),
        public: imageCheck.public,
        httpStatus: imageCheck.status,
        contentType: imageCheck.contentType,
        robotsAllowed: imageRobotsAllowed,
        inSitemap: Boolean(src && sitemapXml.includes(`<image:loc>${src}</image:loc>`)),
        matchesOpenGraph: Boolean(src && audit.openGraphImage && sameUrl(src, audit.openGraphImage)),
        error: imageCheck.error || ''
      };
    }

    const parents = uniqueStrings(page.parentUrls || [], 8);
    for (const parentUrl of parents) {
      let parentHtml = parentHtmlCache.get(parentUrl);
      if (parentHtml === undefined) {
        try {
          const parentResponse = await fetchWithTimeout(fetchImpl, parentUrl, { headers: { 'User-Agent': 'SonaraSeoRadar/1.0 (+https://sonarapack.com)' } });
          parentHtml = parentResponse.ok ? await parentResponse.text() : '';
        } catch { parentHtml = ''; }
        parentHtmlCache.set(parentUrl, parentHtml);
      }
      if (parentHtml && htmlIncludesLink(parentHtml, parentUrl, page.url)) audit.incomingLinkSources.push(parentUrl);
    }
    audit.incomingLinkDetected = audit.incomingLinkSources.length > 0 || !['pack', 'track'].includes(page.kind);
  } catch (error) {
    audit.fetchError = error.message || 'FETCH_FAILED';
  }

  const local = localAuditStatus(audit);
  audit.ready = local.ready;
  audit.issues = local.issues;
  audit.imageSeoReady = Boolean(
    audit.image.present && audit.image.public && audit.image.robotsAllowed !== false && audit.image.alt && audit.image.width && audit.image.height && audit.openGraphImage && audit.image.matchesOpenGraph && audit.image.inSitemap && audit.sitemapDetected && audit.robotsAllowed
  );
  audit.imageSeoReason = audit.imageSeoReady ? '' : uniqueStrings([
    !audit.image.present ? 'IMAGE_MISSING' : '',
    audit.image.present && !audit.image.public ? 'IMAGE_NOT_PUBLIC' : '',
    audit.image.present && !audit.image.alt ? 'IMAGE_ALT_MISSING' : '',
    audit.image.present && audit.image.robotsAllowed === false ? 'IMAGE_ROBOTS_BLOCKED' : '',
    audit.image.present && !audit.image.inSitemap ? 'IMAGE_SITEMAP_MISSING' : '',
    audit.image.present && audit.openGraphImage && !audit.image.matchesOpenGraph ? 'OG_IMAGE_MISMATCH' : '',
    audit.image.present && (!audit.image.width || !audit.image.height) ? 'IMAGE_DIMENSIONS_MISSING' : '',
    !audit.openGraphImage ? 'OG_IMAGE_MISSING' : '',
    !audit.sitemapDetected ? 'SITEMAP_IMAGE_OR_PAGE_MISSING' : '',
    !audit.robotsAllowed ? 'ROBOTS_BLOCKED' : ''
  ]).join(', ');
  return audit;
}

function summaryFromPages(pages = []) {
  const summary = {
    total: pages.length,
    indexed: 0,
    waitingCrawl: 0,
    crawledNotIndexed: 0,
    technicalErrors: 0,
    pendingChecks: 0,
    imagesSeoReady: 0,
    localSeoReady: 0
  };
  for (const page of pages) {
    const code = page.status?.code || 'PENDING_CHECK';
    if (code === 'INDEXED') summary.indexed += 1;
    else if (code === 'WAITING_FOR_CRAWL') summary.waitingCrawl += 1;
    else if (code === 'CRAWLED_NOT_INDEXED') summary.crawledNotIndexed += 1;
    else if (code === 'TECHNICAL_ERROR') summary.technicalErrors += 1;
    else summary.pendingChecks += 1;
    if (page.localAudit?.imageSeoReady) summary.imagesSeoReady += 1;
    if (page.localAudit?.ready) summary.localSeoReady += 1;
  }
  return summary;
}

function createSeoRadar({ environment, db = null, dataDir, publicOrigin, getPages, fetchImpl = global.fetch }) {
  const env = normalizeEnvironment(environment);
  const origin = String(publicOrigin || '').replace(/\/+$/, '');
  const store = createStore({ db, dataDir, environment: env });
  const google = createGoogleClient({ environment: env, fetchImpl });
  let refreshPromise = null;

  async function syncPages() {
    const rawDescriptors = await getPages();
    const descriptors = Array.isArray(rawDescriptors) ? rawDescriptors : [];
    const existing = new Map((await store.listPages()).map((item) => [item.url, item]));
    const activeUrls = new Set(descriptors.map((descriptor) => String(descriptor?.url || '')).filter(Boolean));
    for (const descriptor of descriptors) {
      if (!descriptor?.url) continue;
      const previous = existing.get(descriptor.url) || {};
      await store.upsertPage(descriptor.url, {
        ...previous,
        ...descriptor,
        discoveredAt: previous.discoveredAt || nowIso(),
        active: true,
        nextGoogleCheckAt: previous.nextGoogleCheckAt || (env === 'main' ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null)
      });
    }
    for (const [url, previous] of existing.entries()) {
      if (!activeUrls.has(url) && previous.active !== false) {
        await store.upsertPage(url, { ...previous, active: false, removedFromPublicCatalogAt: nowIso() });
      }
    }
    return descriptors;
  }

  async function fetchSiteResources() {
    const [robotsResponse, sitemapResponse, sitemapIndexResponse, staticSitemapResponse] = await Promise.all([
      fetchWithTimeout(fetchImpl, `${origin}/robots.txt`, { headers: { 'User-Agent': 'SonaraSeoRadar/1.0' } }).catch(() => null),
      fetchWithTimeout(fetchImpl, `${origin}/sitemap-catalog.xml`, { headers: { 'User-Agent': 'SonaraSeoRadar/1.0' } }).catch(() => null),
      fetchWithTimeout(fetchImpl, `${origin}/sitemap.xml`, { headers: { 'User-Agent': 'SonaraSeoRadar/1.0' } }).catch(() => null),
      fetchWithTimeout(fetchImpl, `${origin}/sitemap-static.xml`, { headers: { 'User-Agent': 'SonaraSeoRadar/1.0' } }).catch(() => null)
    ]);
    const robotsText = robotsResponse?.ok ? await robotsResponse.text() : '';
    const sitemapXml = sitemapResponse?.ok ? await sitemapResponse.text() : '';
    const sitemapIndexXml = sitemapIndexResponse?.ok ? await sitemapIndexResponse.text() : '';
    const staticSitemapXml = staticSitemapResponse?.ok ? await staticSitemapResponse.text() : '';
    const combined = `${sitemapIndexXml}
${sitemapXml}
${staticSitemapXml}`;
    const sitemapUrls = uniqueStrings((combined.match(/<loc>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/loc>/gi) || []).map((tag) => htmlText(tag.replace(/<\/?loc>|<!\[CDATA\[|\]\]>/gi, ''))), 20000);
    const foreignEnvironmentUrls = sitemapUrls.filter((url) => /localhost|127\.0\.0\.1|test\.|-test\.|\/test\//i.test(url));
    const privateUrls = sitemapUrls.filter((url) => /\/(?:download|creator|account|auth|system|library|montage)(?:\/|\.|$)/i.test(url));
    const siteAudit = {
      checkedAt: nowIso(),
      robotsHttpStatus: robotsResponse?.status || 0,
      sitemapIndexHttpStatus: sitemapIndexResponse?.status || 0,
      catalogSitemapHttpStatus: sitemapResponse?.status || 0,
      staticSitemapHttpStatus: staticSitemapResponse?.status || 0,
      sitemapIndexHasCatalog: sitemapIndexXml.includes('sitemap-catalog.xml'),
      sitemapIndexHasStatic: sitemapIndexXml.includes('sitemap-static.xml'),
      robotsReferencesSitemap: robotsText.includes('/sitemap.xml'),
      sitemapUrlCount: sitemapUrls.length,
      foreignEnvironmentUrls: foreignEnvironmentUrls.slice(0, 20),
      privateUrls: privateUrls.slice(0, 20),
      ready: Boolean(robotsResponse?.ok && sitemapIndexResponse?.ok && sitemapResponse?.ok && sitemapIndexXml.includes('sitemap-catalog.xml') && sitemapIndexXml.includes('sitemap-static.xml') && foreignEnvironmentUrls.length === 0 && privateUrls.length === 0)
    };
    return { robotsText, sitemapXml, sitemapIndexXml, staticSitemapXml, siteAudit };
  }

  async function auditLocalPages({ urls = [], limit = LOCAL_AUDIT_LIMIT } = {}) {
    const pages = await store.listPages();
    const targets = pages
      .filter((page) => page.active !== false)
      .filter((page) => !urls.length || urls.includes(page.url))
      .sort((a, b) => new Date(b.publishedAt || b.discoveredAt || 0) - new Date(a.publishedAt || a.discoveredAt || 0))
      .slice(0, Math.max(1, limit));
    const resources = await fetchSiteResources();
    await store.setMeta('siteAudit', resources.siteAudit);
    const parentHtmlCache = new Map();
    for (const page of targets) {
      const audit = await auditPage({ fetchImpl, page, ...resources, parentHtmlCache });
      const status = page.googleInspection ? classifyGoogleStatus(page.googleInspection, audit) : page.status || { code: 'PENDING_CHECK', color: 'gray', label: 'Pending Google check', reasons: [] };
      await store.upsertPage(page.url, { ...page, localAudit: audit, status, lastLocalAuditAt: audit.checkedAt });
    }
    return targets.length;
  }

  async function refreshGooglePerformance({ force = false } = {}) {
    if (!google.config.enabled) return null;
    const cached = await store.getMeta('googlePerformance');
    const cachedAt = safeDate(cached?.fetchedAt);
    if (!force && cachedAt && Date.now() - cachedAt.getTime() < 6 * 60 * 60 * 1000) return cached;
    const value = await google.performance(28);
    await store.setMeta('googlePerformance', value);
    return value;
  }

  async function inspectPages({ force = false, urls = [], limit = GOOGLE_REFRESH_LIMIT } = {}) {
    if (!google.config.enabled) return { inspected: 0, disabled: true, reason: google.config.reason };
    const pages = await store.listPages();
    const now = Date.now();
    const targets = pages
      .filter((page) => page.active !== false)
      .filter((page) => !urls.length || urls.includes(page.url))
      .filter((page) => force || !page.nextGoogleCheckAt || new Date(page.nextGoogleCheckAt).getTime() <= now)
      .sort((a, b) => {
        const aIndexed = a.status?.code === 'INDEXED' ? 1 : 0;
        const bIndexed = b.status?.code === 'INDEXED' ? 1 : 0;
        if (aIndexed !== bIndexed) return aIndexed - bIndexed;
        return new Date(b.publishedAt || b.discoveredAt || 0) - new Date(a.publishedAt || a.discoveredAt || 0);
      })
      .slice(0, Math.max(1, limit));

    let inspected = 0;
    const errors = [];
    for (const page of targets) {
      try {
        const index = await google.inspect(page.url);
        const status = classifyGoogleStatus(index, page.localAudit || {});
        const checkedAt = nowIso();
        await store.upsertPage(page.url, {
          ...page,
          googleInspection: index,
          status,
          lastGoogleCheckAt: checkedAt,
          nextGoogleCheckAt: new Date(Date.now() + nextInspectionDelayMs(page, status)).toISOString(),
          googleError: null
        });
        inspected += 1;
      } catch (error) {
        errors.push({ url: page.url, message: error.message || 'GOOGLE_INSPECTION_FAILED' });
        await store.upsertPage(page.url, { ...page, googleError: error.message || 'GOOGLE_INSPECTION_FAILED', lastGoogleCheckAt: nowIso(), nextGoogleCheckAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() });
        if (error.status === 429) break;
      }
    }
    await refreshGooglePerformance({ force }).catch(() => null);
    return { inspected, errors };
  }

  async function refresh({ forceGoogle = false, urls = [], manual = false } = {}) {
    if (refreshPromise && !manual) return refreshPromise;
    const work = (async () => {
      await syncPages();
      await auditLocalPages({ urls, limit: urls.length || LOCAL_AUDIT_LIMIT });
      return inspectPages({ force: forceGoogle, urls, limit: manual ? MANUAL_GOOGLE_REFRESH_LIMIT : GOOGLE_REFRESH_LIMIT });
    })();
    if (!manual) refreshPromise = work.finally(() => { refreshPromise = null; });
    return work;
  }

  async function notifyIndexNow(urls = []) {
    if (env !== 'main') return { enabled: false, reason: 'MAIN_ONLY' };
    const key = String(process.env.INDEXNOW_KEY || '').trim();
    if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) return { enabled: false, reason: 'INDEXNOW_KEY_NOT_CONFIGURED' };
    const list = uniqueStrings(urls, 100).filter((url) => {
      try { return new URL(url).host === new URL(origin).host; } catch { return false; }
    });
    if (!list.length) return { enabled: true, submitted: 0 };
    const host = new URL(origin).host;
    const keyLocation = `${origin}/indexnow-key.txt`;
    const response = await fetchWithTimeout(fetchImpl, INDEXNOW_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList: list })
    });
    return { enabled: true, submitted: list.length, status: response.status, accepted: [200, 202].includes(response.status), note: 'IndexNow concerne les moteurs compatibles, pas Google.' };
  }

  async function registerPublishedUrls(urls = []) {
    const descriptors = await syncPages();
    const roots = uniqueStrings(urls, 50);
    const list = uniqueStrings([
      ...roots,
      ...descriptors.filter((page) => (page.parentUrls || []).some((parent) => roots.includes(parent))).map((page) => page.url)
    ], 100);
    const pages = await store.listPages();
    const byUrl = new Map(pages.map((page) => [page.url, page]));
    let queued = 0;
    for (const url of list) {
      const page = byUrl.get(url);
      if (!page) continue;
      await store.upsertPage(url, { ...page, nextGoogleCheckAt: env === 'main' ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null, publicationQueuedAt: nowIso() });
      queued += 1;
    }
    notifyIndexNow(list).catch(() => null);
    return { queued };
  }

  async function snapshot({ kickBackground = true } = {}) {
    await syncPages();
    const pages = (await store.listPages()).filter((page) => page.active !== false).sort((a, b) => new Date(b.publishedAt || b.discoveredAt || 0) - new Date(a.publishedAt || a.discoveredAt || 0));
    const performance = await store.getMeta('googlePerformance');
    const siteAudit = await store.getMeta('siteAudit');
    const titleCounts = new Map();
    const descriptionCounts = new Map();
    for (const page of pages) {
      const title = String(page.localAudit?.title || '').trim().toLowerCase();
      const description = String(page.localAudit?.metaDescription || '').trim().toLowerCase();
      if (title) titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
      if (description) descriptionCounts.set(description, (descriptionCounts.get(description) || 0) + 1);
    }
    const decoratedPages = pages.map((page) => {
      const localAudit = page.localAudit ? { ...page.localAudit } : null;
      if (localAudit) {
        localAudit.similaritySignals = uniqueStrings([
          localAudit.visibleTextLength > 0 && localAudit.visibleTextLength < 350 ? 'CONTENT_MAY_BE_THIN' : '',
          localAudit.title && titleCounts.get(String(localAudit.title).trim().toLowerCase()) > 1 ? 'DUPLICATE_TITLE' : '',
          localAudit.metaDescription && descriptionCounts.get(String(localAudit.metaDescription).trim().toLowerCase()) > 1 ? 'DUPLICATE_META_DESCRIPTION' : ''
        ]);
      }
      return { ...page, localAudit };
    });
    if (kickBackground) refresh({ forceGoogle: false }).catch(() => null);
    return {
      success: true,
      environment: env,
      google: {
        enabled: google.config.enabled,
        siteUrl: google.config.siteUrl,
        reason: google.config.reason,
        inspectionApi: GOOGLE_INSPECTION_ENDPOINT,
        indexingApiUsed: false,
        performance: performance || { clicks: 0, impressions: 0, periodDays: 28 }
      },
      indexNow: { enabled: env === 'main' && Boolean(String(process.env.INDEXNOW_KEY || '').trim()), google: false },
      siteAudit: siteAudit || null,
      summary: summaryFromPages(decoratedPages),
      pages: decoratedPages,
      generatedAt: nowIso()
    };
  }

  return { environment: env, syncPages, auditLocalPages, inspectPages, refresh, snapshot, registerPublishedUrls, notifyIndexNow, googleConfig: google.config };
}

module.exports = {
  GOOGLE_INSPECTION_ENDPOINT,
  GOOGLE_READONLY_SCOPE,
  robotsAllowsPath,
  localAuditStatus,
  classifyGoogleStatus,
  auditPage,
  createGoogleClient,
  createSeoRadar,
  sameUrl
};
