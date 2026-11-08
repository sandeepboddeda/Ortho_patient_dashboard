const { PASSWORD, TOKEN, LOGIN_PAGE } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.writeHead(302, { Location: "/" }); return res.end(); }
  const body = req.body || {};
  const pw = typeof body === "string" ? new URLSearchParams(body).get("password") : body.password;
  if (PASSWORD && pw === PASSWORD) {
    res.writeHead(303, {
      "Set-Cookie": `obs=${TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
      Location: "/",
      "Cache-Control": "no-store",
    });
    return res.end();
  }
  await new Promise(r => setTimeout(r, 1200)); // slows down password guessing
  res.writeHead(401, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(LOGIN_PAGE("Wrong password"));
};
