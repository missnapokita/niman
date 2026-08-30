const crypto = require("crypto");

const OWNER = process.env.VOUCHER_GITHUB_OWNER || "missnapokita";
const REPO = process.env.VOUCHER_GITHUB_REPO || "cache";
const BRANCH = process.env.VOUCHER_GITHUB_BRANCH || "main";
const PATH = process.env.VOUCHER_GITHUB_PATH || "database/remove_ads_vouchers.json";
const MAX_ROWS = Math.max(100, Number(process.env.VOUCHER_MAX_ROWS || 3000));

const TTL_MS = 2 * 24 * 60 * 60 * 1000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}

function cors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = ["https://niman-theta.vercel.app"];
  const extra = String(process.env.VOUCHER_ALLOWED_ORIGINS || "")
    .split(",").map(v => v.trim()).filter(Boolean);

  const all = allowed.concat(extra);

  if (!origin || all.indexOf(origin) >= 0) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}

function token() {
  return String(process.env.DIAGNOSTICS_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "");
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function cleanId(v, max) {
  v = String(v || "").trim();
  if (!v || v.length > max) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(v)) return "";
  return v;
}

function cleanVoucher(v) {
  v = String(v || "").trim().toUpperCase();
  if (!/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(v)) return "";
  return v;
}

function voucherCode() {
  const h = crypto.randomBytes(6).toString("hex").toUpperCase();
  return h.slice(0,4) + "-" + h.slice(4,8) + "-" + h.slice(8,12);
}

function emptyDb() {
  return { version: 1, updatedAt: null, vouchers: [] };
}

function normalizeDb(db) {
  if (!db || typeof db !== "object") db = emptyDb();
  if (!Array.isArray(db.vouchers)) db.vouchers = [];
  if (!db.version) db.version = 1;
  return db;
}

function prune(db, now) {
  db = normalizeDb(db);

  // Keep active rows plus recently-expired rows for a small audit window.
  const auditCutoff = now - (7 * 24 * 60 * 60 * 1000);

  db.vouchers = db.vouchers.filter(v => {
    const exp = Number(v.expiresAt || 0);
    return exp > now || exp >= auditCutoff;
  });

  if (db.vouchers.length > MAX_ROWS) {
    db.vouchers.sort((a,b) => Number(b.createdAt||0) - Number(a.createdAt||0));
    db.vouchers = db.vouchers.slice(0, MAX_ROWS);
  }

  return db;
}

async function ghFetch(url, options) {
  const t = token();
  if (!t) throw new Error("GITHUB_TOKEN_MISSING");

  options = options || {};
  options.headers = Object.assign({
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + t,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Bidamax-Voucher-Service"
  }, options.headers || {});

  return fetch(url, options);
}

function contentsUrl() {
  return "https://api.github.com/repos/" +
    encodeURIComponent(OWNER) + "/" +
    encodeURIComponent(REPO) +
    "/contents/" + PATH.split("/").map(encodeURIComponent).join("/") +
    "?ref=" + encodeURIComponent(BRANCH);
}

async function readDb() {
  const r = await ghFetch(contentsUrl(), { method:"GET" });

  if (r.status === 404) {
    return { db: emptyDb(), sha: null };
  }

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.message || ("GITHUB_GET_" + r.status));
  }

  const text = Buffer.from(String(data.content || "").replace(/\n/g,""), "base64").toString("utf8");
  let db;
  try { db = JSON.parse(text); } catch (e) { db = emptyDb(); }

  return { db: normalizeDb(db), sha: data.sha || null };
}

async function writeDb(db, sha, message) {
  db.updatedAt = new Date().toISOString();

  const body = {
    message: message || "Update Bidamax vouchers",
    content: Buffer.from(JSON.stringify(db, null, 2) + "\n", "utf8").toString("base64"),
    branch: BRANCH
  };

  if (sha) body.sha = sha;

  const r = await ghFetch(contentsUrl().replace(/\?ref=.*/, ""), {
    method:"PUT",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const err = new Error(data.message || ("GITHUB_PUT_" + r.status));
    err.httpCode = r.status;
    throw err;
  }

  return data;
}

async function updateWithRetry(mutator, commitMessage) {
  for (let attempt=0; attempt<3; attempt++) {
    const snap = await readDb();
    const now = Date.now();
    const db = prune(snap.db, now);

    const result = mutator(db, now);

    if (result && result.noWrite) {
      return result;
    }

    try {
      await writeDb(db, snap.sha, commitMessage);
      return result;
    } catch (e) {
      if ((e.httpCode === 409 || e.httpCode === 422) && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 180 + (attempt * 220)));
        continue;
      }
      throw e;
    }
  }

  throw new Error("WRITE_CONFLICT");
}

module.exports = {
  TTL_MS,
  json,
  cors,
  cleanId,
  cleanVoucher,
  sha256,
  voucherCode,
  readDb,
  updateWithRetry
};
