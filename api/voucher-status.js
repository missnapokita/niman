const {
  json,
  cors,
  cleanId,
  cleanVoucher,
  evalRedis
} = require("./_voucher-lib");

const STATUS_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then
  return {"INVALID"}
end

local expiresAt = tonumber(redis.call("HGET", KEYS[1], "expiresAt") or "0")
local now = tonumber(ARGV[1])

if expiresAt <= now then
  return {"EXPIRED", tostring(expiresAt)}
end

local bound = redis.call("HGET", KEYS[1], "boundDevice") or ""

if bound == ARGV[2] then
  return {"ACTIVE", tostring(expiresAt)}
end

if bound == "" then
  return {"NOT_REDEEMED", tostring(expiresAt)}
end

return {"OTHER_DEVICE", tostring(expiresAt)}
`;

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok:false, error:"METHOD_NOT_ALLOWED" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const voucher = cleanVoucher(body.voucher);
    const deviceHash = cleanId(body.deviceHash, 128);

    if (!voucher || !deviceHash) {
      return json(res, 400, { ok:false, error:"INVALID_REQUEST" });
    }

    const now = Date.now();
    const result = await evalRedis(
      STATUS_SCRIPT,
      ["bidamax:voucher:" + voucher],
      [now, deviceHash]
    );

    const state = Array.isArray(result) ? String(result[0]) : "";

    if (state === "ACTIVE") {
      const expiresAt = Number(result[1]);
      return json(res, 200, {
        ok:true,
        active:true,
        expiresAt:expiresAt,
        serverTime:Date.now(),
        remainingMs:Math.max(0, expiresAt - Date.now())
      });
    }

    return json(res, 200, {
      ok:true,
      active:false,
      reason:state || "INVALID",
      serverTime:Date.now()
    });
  } catch (e) {
    console.error("[voucher-status]", e);
    return json(res, 500, { ok:false, error:"SERVER_ERROR" });
  }
};
