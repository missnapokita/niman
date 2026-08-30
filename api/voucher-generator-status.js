const {
  json, cors, cleanId, sha256, readDb
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
    const now = Date.now();
    const snap = await readDb();

    const existing = snap.db.vouchers.find(v =>
      v.generatorHash === generatorHash &&
      Number(v.expiresAt || 0) > now
    );

    if (!existing) {
      return json(res,200,{
        ok:true,
        active:false,
        serverTime:now
      });
    }

    return json(res,200,{
      ok:true,
      active:true,
      voucher:existing.code,
      expiresAt:Number(existing.expiresAt),
      serverTime:now
    });
  } catch (e) {
    console.error("[voucher-generator-status]",e);
    return json(res,500,{ok:false,error:"SERVER_ERROR"});
  }
};