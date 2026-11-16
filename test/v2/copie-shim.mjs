// Pour tester scripts/copie.mjs sans Supabase : l'API de gestion est remplacée par psql sur une base locale du même nom que la référence.
import { execFileSync } from "child_process";
const P = (process.env.PSQL || "psql -h /tmp/kplan-pg -p 54329 -U postgres").split(" ");
globalThis.fetch = async (url, o) => {
  const ref = url.match(/projects\/([^/]+)\//)[1], { query } = JSON.parse(o.body);
  const seul = /^\s*select\b/i.test(query) && !query.trim().replace(/;$/, "").includes(";");
  const q = seul ? `select coalesce(jsonb_agg(q), '[]'::jsonb) from (${query.trim().replace(/;$/, "")}) q` : query.replace(/^create extension.*$/gm, "");
  try { const out = execFileSync(P[0], [...P.slice(1), "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", ref, "-f", "-"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1 << 28 });
    return { ok: true, status: 200, text: async () => (seul ? out : "[]") };
  } catch (e) { return { ok: false, status: 400, text: async () => String(e.stderr || e.message) }; }
};
