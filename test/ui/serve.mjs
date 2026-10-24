// Sert site/ pour les tests, avec /test.html : la vraie page, branchée sur le faux client Supabase.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../site");
const fake = path.resolve(here, "fake-supabase.js");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff": "font/woff", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
const port = +process.argv[2] || 8790;
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x").pathname;
  if (u === "/test.html") {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace('<script src="config.js"></script>', '<script src="config.js"></script>\n<script src="__fake.js"></script>');
    res.writeHead(200, { "content-type": "text/html" }); return res.end(html);
  }
  const f = u === "/__fake.js" ? fake : path.join(root, decodeURIComponent(u === "/" ? "/index.html" : u));
  if (!f.startsWith(root) && f !== fake) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(d); });
}).listen(port, () => console.log("http://localhost:" + port));
