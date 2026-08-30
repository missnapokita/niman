const {
  TTL_SECONDS,
  VOUCHER_GRACE_SECONDS,
  json,
  cors,
  cleanId,
  sha256,
  voucherCode,
  evalRedis
} = require("./_voucher-lib");

const GENERATE_SCRIPT = `
local existing = redis.call("GET", KEYS[1])
if existing then
  local e = redis.call("HGET", "bidamax:voucher:" .. existing, "expiresAt")
  if e then
    return {"EXISTING", existing, e}
  end
  redis.call("DEL", KEYS[1])
end

if redis.call("EXISTS", KEYS[2]) == 1 then
  return {"COLLISION"}
end

redis.call("HSET", KEYS[2],
  "createdAt", ARGV[2],
  "expiresAt", ARGV[3],
  "generatorHash", ARGV[4],
  "boundDevice", "",
  "redeemedAt", ""
)
redis.call("EXPIRE", KEYS[2], ARGV[5])
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[6])

return {"CREATED", ARGV[1], ARGV[3]}
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
    const generatorId = cleanId(body.generatorId, 180);

    if (!generatorId) {
      return json(res, 400, { ok:false, error:"INVALID_GENERATOR_ID" });
    }

    const generatorHash = sha256(generatorId);
    const generatorKey = "bidamax:voucher-generator:" + generatorHash;

    for (let attempt = 0; attempt < 4; attempt++) {
      const code = voucherCode();
      const voucherKey = "bidamax:voucher:" + code;
      const now = Date.now();
      const expiresAt = now + (TTL_SECONDS * 1000);

      const result = await evalRedis(
        GENERATE_SCRIPT,
        [generatorKey, voucherKey],
        [
          code,
          now,
          expiresAt,
          generatorHash,
          TTL_SECONDS + VOUCHER_GRACE_SECONDS,
          TTL_SECONDS
        ]
      );

      if (Array.isArray(result) && result[0] === "COLLISION") {
        continue;
      }

      if (Array.isArray(result) && (result[0] === "CREATED" || result[0] === "EXISTING")) {
        const returnedCode = String(result[1]);
        const returnedExpiry = Number(result[2]);

        return json(res, 200, {
          ok: true,
          voucher: returnedCode,
          expiresAt: returnedExpiry,
          serverTime: Date.now(),
          existing: result[0] === "EXISTING"
        });
      }

      throw new Error("Unexpected Redis result");
    }

    return json(res, 503, { ok:false, error:"GENERATION_RETRY" });
  } catch (e) {
    console.error("[voucher-generate]", e);
    return json(res, 500, { ok:false, error:"SERVER_ERROR" });
  }
};
