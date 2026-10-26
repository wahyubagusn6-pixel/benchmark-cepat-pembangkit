// api/fetch.js: reads a public web link for the "Tautan web" import of Benchmark Cepat.
// Vercel runs this file as a serverless function at /api/fetch?url=...
// Only public http(s) addresses are allowed; private and local networks are refused, files are capped at 20 MB.
const dns = require("dns").promises;
const net = require("net");
const MAX = 20 * 1024 * 1024;

function privateV4(ip) {
  const p = ip.split(".").map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
function privateV6(ip) {
  const s = ip.toLowerCase();
  if (s.startsWith("::ffff:")) return privateV4(s.split(":").pop());
  return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb");
}
async function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.+\.local|.+\.internal|metadata\.google\.internal)$/i.test(host)) return null;
  let addrs;
  try { addrs = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true }); } catch (e) { return null; }
  if (!addrs.length || addrs.some((a) => (a.family === 4 ? privateV4(a.address) : privateV6(a.address)))) return null;
  return u;
}

module.exports = async (req, res) => {
  res.setHeader("x-proxy", "benchmark-cepat");
  res.setHeader("cache-control", "no-store");
  try {
    if (req.method !== "GET") return res.status(405).send("Hanya permintaan GET yang dilayani.");
    let url = await safeUrl(String((req.query && req.query.url) || ""));
    if (!url) return res.status(400).send("Tautan tidak valid atau mengarah ke alamat yang tidak diizinkan.");
    let r;
    for (let hop = 0; hop < 5; hop++) {
      r = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Benchmark Cepat link reader)", accept: "*/*" }, signal: AbortSignal.timeout(20000) });
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        url = await safeUrl(new URL(loc, url).href);
        if (!url) return res.status(400).send("Tautan dialihkan ke alamat yang tidak diizinkan.");
        continue;
      }
      break;
    }
    if (!r.ok) return res.status(502).send(`Situs sumber menjawab ${r.status}.`);
    if (+r.headers.get("content-length") > MAX) return res.status(413).send("File lebih dari 20 MB.");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return res.status(413).send("File lebih dari 20 MB.");
    res.setHeader("content-type", r.headers.get("content-type") || "application/octet-stream");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).send("Tautan tidak bisa dibaca: " + (e && e.name === "TimeoutError" ? "waktu habis" : (e && e.message) || "galat"));
  }
};
module.exports.safeUrl = safeUrl;
