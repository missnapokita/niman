const {
  json,
  cors,
  cleanId,
  cleanVoucher,
  evalRedis
} = require("./_voucher-lib");

const REDEEM_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then
  return {"INVALID"}
end

local expiresAt = tonumber(redis.call("HGET", KEYS[1], "expiresAt") or "0")
local now = tonumber(ARGV[1])

if expiresAt <= now then
  return {"EXPIRED", tostring(expiresAt)}
end

local bound = redis.call("HGET", KEYS[1], "boundDevice") or ""

if bound == "" then
  redis.call("HSET", KEYS[1], "boundDevice", ARGV[2], "redeemedAt", ARGV[1])
  return {"BOUND", tostring(expiresAt)}
end

if bound == ARGV[2] then
  return {"SAME_DEVICE", tostring(expiresAt)}
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

    if (!voucher) {
      return json(res, 400, { ok:false, error:"INVALID_VOUCHER" });
    }

    if (!deviceHash || deviceHash.length < 32) {
      return json(res, 400, { ok:false, error:"INVALID_DEVICE" });
    }

    const now = Date.now();
    const result = await evalRedis(
      REDEEM_SCRIPT,
      ["bidamax:voucher:" + voucher],
      [now, deviceHash]
    );

    const state = Array.isArray(result) ? String(result[0]) : "";

    if (state === "BOUND" || state === "SAME_DEVICE") {
      const expiresAt = Number(result[1]);
      return json(res, 200, {
        ok: true,
        state: state,
        expiresAt: expiresAt,
        serverTime: Date.now(),
        remainingMs: Math.max(0, expiresAt - Date.now())
      });
    }

    if (state === "EXPIRED") {
      return json(res, 410, {
        ok:false,
        error:"VOUCHER_EXPIRED",
        expiresAt:Number(result[1] || 0),
        serverTime:Date.now()
      });
    }

    if (state === "OTHER_DEVICE") {
      return json(res, 409, {
        ok:false,
        error:"VOUCHER_USED_OTHER_DEVICE",
        serverTime:Date.now()
      });
    }

    return json(res, 404, {
      ok:false,
      error:"VOUCHER_NOT_FOUND",
      serverTime:Date.now()
    });
  } catch (e) {
    console.error("[voucher-redeem]", e);
    return json(res, 500, { ok:false, error:"SERVER_ERROR" });
  }
};
