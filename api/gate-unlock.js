const {
  PENDING_COOKIE,
  UNLOCK_COOKIE,
  parseCookies,
  verify,
  sign,
  makeCookie,
  clearCookie
} = require("./_gate-lib");

module.exports = async function handler(req,res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  try {
    const c = parseCookies(req);
    const pending = verify(c[PENDING_COOKIE]);

    if (!pending || pending.kind !== "pending") {
      res.setHeader("Set-Cookie",clearCookie(PENDING_COOKIE));
      res.statusCode = 302;
      res.setHeader("Cache-Control","no-store");
      res.setHeader("Location","/?gate=required");
      return res.end();
    }

    const now = Date.now();

    const unlock = sign({
      kind:"unlock",
      nonce:pending.nonce,
      iat:now,
      exp:now + (20 * 60 * 1000)
    });

    res.setHeader("Set-Cookie",[
      makeCookie(UNLOCK_COOKIE,unlock,20 * 60),
      clearCookie(PENDING_COOKIE)
    ]);

    res.statusCode = 302;
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Location","/?gate=unlocked");
    return res.end();
  } catch (e) {
    console.error("[gate-unlock]",e);
    res.statusCode = 500;
    return res.end("Unlock failed");
  }
};
