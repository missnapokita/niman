const crypto = require("crypto");

const PENDING_COOKIE = "bidamax_gate_pending";
const UNLOCK_COOKIE = "bidamax_gate_unlock";

function gateSecret() {
  const value = String(
    process.env.VOUCHER_GATE_SECRET ||
    process.env.GITHUB_TOKEN ||
    process.env.DIAGNOSTICS_GITHUB_TOKEN ||
    ""
  );
  if (!value) throw new Error("VOUCHER_GATE_SECRET_MISSING");
  return value;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

function sign(payload) {
  const body = base64url(Buffer.from(JSON.stringify(payload),"utf8"));
  const sig = base64url(
    crypto.createHmac("sha256",gateSecret()).update(body).digest()
  );
  return body + "." + sig;
}

function verify(token) {
  token = String(token || "");
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const expected = base64url(
    crypto.createHmac("sha256",gateSecret()).update(parts[0]).digest()
  );

  const suppliedBuffer = Buffer.from(parts[1]);
  const expectedBuffer = Buffer.from(expected);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer,expectedBuffer)
  ) return null;

  try {
    let encoded = parts[0].replace(/-/g,"+").replace(/_/g,"/");
    while (encoded.length % 4) encoded += "=";

    const payload = JSON.parse(
      Buffer.from(encoded,"base64").toString("utf8")
    );

    if (!payload || Number(payload.exp || 0) <= Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function parseCookies(req) {
  const raw = String((req.headers && req.headers.cookie) || "");
  const out = {};

  raw.split(";").forEach(function(part){
    const i = part.indexOf("=");
    if (i <= 0) return;

    const name = part.slice(0,i).trim();
    const value = part.slice(i+1).trim();

    try {
      out[name] = decodeURIComponent(value);
    } catch (_) {
      out[name] = value;
    }
  });

  return out;
}

function makeCookie(name,value,maxAgeSeconds) {
  return name + "=" + encodeURIComponent(value) +
    "; Path=/; Max-Age=" + maxAgeSeconds +
    "; HttpOnly; Secure; SameSite=Lax";
}

function clearCookie(name) {
  return name + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

function hasUnlock(req) {
  const c = parseCookies(req);
  const token = verify(c[UNLOCK_COOKIE]);
  return !!(token && token.kind === "unlock");
}

module.exports = {
  PENDING_COOKIE,
  UNLOCK_COOKIE,
  sign,
  verify,
  parseCookies,
  makeCookie,
  clearCookie,
  hasUnlock
};
