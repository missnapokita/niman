const {
  json, cors, cleanId, cleanVoucher, updateWithRetry
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

    if (!voucher) return json(res,400,{ok:false,error:"INVALID_VOUCHER"});
    if (!deviceHash || deviceHash.length < 32) return json(res,400,{ok:false,error:"INVALID_DEVICE"});

    const result = await updateWithRetry((db,now) => {
      const row = db.vouchers.find(v => v.code === voucher);

      if (!row) return { noWrite:true, state:"NOT_FOUND" };

      if (Number(row.expiresAt||0) <= now) {
        return { noWrite:true, state:"EXPIRED", expiresAt:Number(row.expiresAt||0) };
      }

      if (!row.boundDevice) {
        row.boundDevice = deviceHash;
        row.redeemedAt = now;
        return { state:"BOUND", expiresAt:Number(row.expiresAt) };
      }

      if (row.boundDevice === deviceHash) {
        return { noWrite:true, state:"SAME_DEVICE", expiresAt:Number(row.expiresAt) };
      }

      return { noWrite:true, state:"OTHER_DEVICE", expiresAt:Number(row.expiresAt) };
    }, "Redeem Bidamax voucher");

    if (result.state === "BOUND" || result.state === "SAME_DEVICE") {
      return json(res,200,{
        ok:true,
        state:result.state,
        expiresAt:result.expiresAt,
        serverTime:Date.now(),
        remainingMs:Math.max(0,result.expiresAt-Date.now())
      });
    }

    if (result.state === "EXPIRED") {
      return json(res,410,{ok:false,error:"VOUCHER_EXPIRED",expiresAt:result.expiresAt,serverTime:Date.now()});
    }

    if (result.state === "OTHER_DEVICE") {
      return json(res,409,{ok:false,error:"VOUCHER_USED_OTHER_DEVICE",serverTime:Date.now()});
    }

    return json(res,404,{ok:false,error:"VOUCHER_NOT_FOUND",serverTime:Date.now()});
  } catch(e) {
    console.error("[voucher-redeem]",e);
    return json(res,500,{ok:false,error:"SERVER_ERROR"});
  }
};
