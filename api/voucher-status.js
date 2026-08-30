const {
  json, cors, cleanId, cleanVoucher, readDb
} = require("./_voucher-lib");

module.exports = async function handler(req,res) {
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
    const voucher = cleanVoucher(body.voucher);
    const deviceHash = cleanId(body.deviceHash,128);

    if (!voucher || !deviceHash) {
      return json(res,400,{ok:false,error:"INVALID_REQUEST"});
    }

    const snap = await readDb();
    const now = Date.now();
    const row = (snap.db.vouchers || []).find(v => v.code === voucher);

    if (!row) {
      return json(res,200,{ok:true,active:false,reason:"INVALID",serverTime:now});
    }

    if (Number(row.expiresAt||0) <= now) {
      return json(res,200,{ok:true,active:false,reason:"EXPIRED",serverTime:now});
    }

    if (row.boundDevice === deviceHash) {
      return json(res,200,{
        ok:true,
        active:true,
        expiresAt:Number(row.expiresAt),
        serverTime:now,
        remainingMs:Math.max(0,Number(row.expiresAt)-now)
      });
    }

    if (!row.boundDevice) {
      return json(res,200,{ok:true,active:false,reason:"NOT_REDEEMED",serverTime:now});
    }

    return json(res,200,{ok:true,active:false,reason:"OTHER_DEVICE",serverTime:now});
  } catch(e) {
    console.error("[voucher-status]",e);
    return json(res,500,{ok:false,error:"SERVER_ERROR"});
  }
};
