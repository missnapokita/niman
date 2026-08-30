const crypto = require("crypto");
const {
  PENDING_COOKIE,
  sign,
  makeCookie
} = require("./_gate-lib");

const SHORTLINK_URL =
  process.env.VOUCHER_SHORTLINK_URL ||
  "https://earn4link.in/fxSdsQ";

module.exports = async function handler(req,res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  try {
    const now = Date.now();

    const pending = sign({
      kind:"pending",
      nonce:crypto.randomBytes(18).toString("hex"),
      iat:now,
      exp:now + (10 * 60 * 1000)
    });

    res.setHeader(
      "Set-Cookie",
      makeCookie(PENDING_COOKIE,pending,10 * 60)
    );

    res.statusCode = 302;
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Location",SHORTLINK_URL);
    return res.end();
  } catch (e) {
    console.error("[gate-start]",e);
    res.statusCode = 500;
    return res.end("Gate unavailable");
  }
};
