import { writeFile } from "node:fs/promises";
const origin = process.env.BASE_URL || "http://localhost:8088";
const login = await fetch(origin + "/api/v1/demo/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ persona: "A_APPROVED" }),
});
const cookie = login.headers.get("set-cookie").split(";")[0];
await login.json();
const samples = [];
for (let i = 0; i < 120; i++) {
  const start = performance.now();
  const res = await fetch(origin + "/api/v1/applications", {
    headers: { Cookie: cookie },
  });
  if (!res.ok) throw new Error(await res.text());
  await res.json();
  const ms = performance.now() - start;
  if (i >= 20) samples.push(ms);
}
samples.sort((a, b) => a - b);
const result = {
  date: new Date().toISOString(),
  origin,
  conditions:
    "Windows local Docker Desktop Linux engine; sequential HTTP through Nginx; 20 warmup +100 GET /applications; no LLM; synthetic dataset; not production SLA",
  n: samples.length,
  min_ms: samples[0],
  p50_ms: samples[50],
  p95_ms: samples[95],
  max_ms: samples.at(-1),
};
await writeFile("../artifacts/benchmark.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
