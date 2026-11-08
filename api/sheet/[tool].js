const { SHEET_ID, loggedIn, sheetsClient } = require("../_lib");

const TOOLS = {
  async get_values(s, { range }) {
    const r = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
    return { range: r.data.range, values: r.data.values || [] };
  },
  async update_values(s, { range, values }) {
    const r = await s.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range, valueInputOption: "RAW", requestBody: { values } });
    return { updatedRange: r.data.updatedRange, updatedRows: r.data.updatedRows, status: "success" };
  },
  async update_spreadsheet(s, { requests }) {
    // only row deletion is allowed from the board
    const ok = Array.isArray(requests) && requests.every(q => q && q.deleteDimension && Object.keys(q).length === 1);
    if (!ok) throw Object.assign(new Error("Only row deletion is allowed"), { code: "tool_error" });
    await s.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
    return { status: "success" };
  },
};

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (!loggedIn(req)) { res.statusCode = 401; return res.end('{"error":"login"}'); }
  const tool = req.query.tool;
  if (req.method !== "POST" || !TOOLS[tool]) { res.statusCode = 404; return res.end('{"error":"not found"}'); }
  try {
    const args = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const out = await TOOLS[tool](sheetsClient(), args);
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) {
    const msg = (e && e.message) || "Failed";
    console.error(tool, "failed:", msg);
    const transient = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|rate|quota/i.test(msg);
    res.statusCode = transient ? 503 : 400;
    res.end(JSON.stringify({ error: msg, code: transient ? "server_unavailable" : "tool_error" }));
  }
};
