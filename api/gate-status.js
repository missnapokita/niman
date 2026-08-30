const { hasUnlock } = require("./_gate-lib");

module.exports = async function handler(req,res) {
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");

  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({
      ok:false,
      error:"METHOD_NOT_ALLOWED"
    }));
  }

  try {
    return res.end(JSON.stringify({
      ok:true,
      unlocked:hasUnlock(req),
      serverTime:Date.now()
    }));
  } catch (e) {
    console.error("[gate-status]",e);
    res.statusCode = 500;
    return res.end(JSON.stringify({
      ok:false,
      error:"SERVER_ERROR"
    }));
  }
};
