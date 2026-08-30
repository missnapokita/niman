const crypto = require("crypto");

const TTL_SECONDS = 2 * 24 * 60 * 60;
const VOUCHER_GRACE_SECONDS = 7 * 24 * 60 * 60;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}

function cors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = [
    "https://niman-theta.vercel.app"
  ];

  const extra = String(process.env.VOUCHER_ALLOWED_ORIGINS || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const origins = allowed.concat(extra);

  if (!origin || origins.indexOf(origin) >= 0) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}

function cleanId(value, max) {
  value = String(value || "").trim();
  if (!value || value.length > max) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) return "";
  return value;
}

function cleanVoucher(value) {
  value = String(value || "").trim().toUpperCase();
  if (!/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(value)) return "";
  return value;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function voucherCode() {
  const h = crypto.randomBytes(6).toString("hex").toUpperCase();
  return h.slice(0,4) + "-" + h.slice(4,8) + "-" + h.slice(8,12);
}

async function redis(command) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "");

  if (!url || !token) {
    throw new Error("Redis environment variables are missing");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    throw new Error(data.error || ("Redis HTTP " + response.status));
  }

  return data.result;
}

async function evalRedis(script, keys, args) {
  const command = ["EVAL", script, String(keys.length)]
    .concat(keys)
    .concat(args.map(v => String(v)));
  return redis(command);
}

module.exports = {
  TTL_SECONDS,
  VOUCHER_GRACE_SECONDS,
  json,
  cors,
  cleanId,
  cleanVoucher,
  sha256,
  voucherCode,
  redis,
  evalRedis
};
