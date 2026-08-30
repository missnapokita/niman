const {
  TTL_MS, json, cors, cleanId, sha256, voucherCode, updateWithRetry
} = require("./_voucher-lib");

module.exports = async function handler(req, res) {
  cors(req,res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const generatorId = cleanId(body.generatorId,180);

    if (!generatorId) {
      return json(res,400,{ok:false,error:"INVALID_GENERATOR_ID"});
    }

    const generatorHash = sha256(generatorId);

    const result = await updateWithRetry((db, now) => {
      const existing = db.vouchers.find(v =>
        v.generatorHash === generatorHash &&
        Number(v.expiresAt || 0) > now
      );

      if (existing) {
        return {
          noWrite:true,
          voucher:existing.code,
          expiresAt:Number(existing.expiresAt),
          existing:true
        };
      }

      let code = "";
      for (let i=0;i<8;i++) {
        const c = voucherCode();
        if (!db.vouchers.some(v => v.code === c)) {
          code = c;
          break;
        }
      }

      if (!code) throw new Error("CODE_COLLISION");

      const row = {
        code: code,
        generatorHash: generatorHash,
        createdAt: now,
        expiresAt: now + TTL_MS,
        boundDevice: "",
        redeemedAt: null
      };

      db.vouchers.unshift(row);

      return {
        voucher:row.code,
        expiresAt:row.expiresAt,
        existing:false
      };
    }, "Generate Bidamax voucher");

    return json(res,200,{
      ok:true,
      voucher:result.voucher,
      expiresAt:result.expiresAt,
      serverTime:Date.now(),
      existing:!!result.existing
    });
  } catch (e) {
    console.error("[voucher-generate]",e);
    return json(res,500,{ok:false,error:"SERVER_ERROR"});
  }
};
