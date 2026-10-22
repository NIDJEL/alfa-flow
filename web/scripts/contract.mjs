import SwaggerParser from "@apidevtools/swagger-parser";
import { readFile } from "node:fs/promises";
const file = "../api/openapi.yaml";
const spec = JSON.parse(await readFile(file, "utf8"));
await SwaggerParser.validate(file);
const api = await SwaggerParser.dereference(file);
const origin = process.env.BASE_URL || "http://localhost:5173";
let cookie = "",
  csrf = "",
  checks = 0;
function validate(schema, data, path = "$") {
  if (data === null) {
    if (schema.nullable) return;
    throw new Error(path + " must not be null");
  }
  if (schema.type === "array") {
    if (!Array.isArray(data)) throw new Error(path + " not array");
    for (const [i, x] of data.entries())
      validate(schema.items, x, path + "[" + i + "]");
    return;
  }
  if (schema.type === "object") {
    if (typeof data !== "object") throw new Error(path + " not object");
    for (const key of schema.required || [])
      if (!(key in data)) throw new Error(path + "." + key + " missing");
    for (const [k, v] of Object.entries(schema.properties || {}))
      if (k in data) validate(v, data[k], path + "." + k);
    return;
  }
  if (schema.type === "integer") {
    if (!Number.isSafeInteger(data))
      throw new Error(path + " not safe integer");
    return;
  }
  if (
    schema.type &&
    typeof data !==
      { number: "number", boolean: "boolean", string: "string" }[schema.type]
  )
    throw new Error(path + " type mismatch");
}
async function req(method, path, data, template = path) {
  const res = await fetch(origin + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": crypto.randomUUID(),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (res.headers.has("set-cookie"))
    cookie = res.headers.get("set-cookie").split(";")[0];
  const result = await res.json();
  if (result.csrf_token) csrf = result.csrf_token;
  const schema =
    api.paths[template][method.toLowerCase()].responses[String(res.status)]
      ?.content?.["application/json"]?.schema;
  if (!schema)
    throw new Error(
      "Undocumented response: " + method + " " + template + " " + res.status,
    );
  validate(schema, result);
  checks++;
  if (!res.ok) throw new Error(JSON.stringify(result));
  return result;
}
await req("GET", "/health/ready");
await req("GET", "/demo/personas");
await req("POST", "/demo/session", { persona: "A_APPROVED" });
await req("GET", "/me");
const c = await req("GET", "/companies/me");
await req("GET", "/loan-products");
await req("GET", "/companies/me/cashflow");
await req("POST", "/companies/me/cashflow/forecast", { horizon_days: 90 });
await req("GET", "/applications");
const params = {
  product_id: "WORKING_CAPITAL_LOAN",
  purpose: "working_capital",
  amount_kopeks: 100000000,
  term_months: 24,
  declared_revenue_kopeks: c.declared_revenue_kopeks,
};
let a = await req("POST", "/applications", params);
a = await req(
  "PATCH",
  "/applications/" + a.id,
  { ...params, version: a.version },
  "/applications/{id}",
);
await req("GET", "/applications/" + a.id, undefined, "/applications/{id}");
a = await req(
  "POST",
  "/applications/" + a.id + "/submit",
  { version: a.version, consent: true },
  "/applications/{id}/submit",
);
await req(
  "GET",
  "/applications/" + a.id + "/offers",
  undefined,
  "/applications/{id}/offers",
);
await req(
  "GET",
  "/applications/" + a.id + "/timeline",
  undefined,
  "/applications/{id}/timeline",
);
await req(
  "GET",
  "/applications/" + a.id + "/decision-passport",
  undefined,
  "/applications/{id}/decision-passport",
);
await req(
  "POST",
  "/applications/" + a.id + "/simulations",
  params,
  "/applications/{id}/simulations",
);
a = await req(
  "POST",
  "/applications/" + a.id + "/offers/" + a.active_offer_id + "/accept",
  { version: a.version, consent: true },
  "/applications/{id}/offers/{offerId}/accept",
);
a = await req(
  "POST",
  "/applications/" + a.id + "/sign-simulated",
  { version: a.version, consent: true },
  "/applications/{id}/sign-simulated",
);
await req("POST", "/demo/session", { persona: "BANK" });
await req("GET", "/bank/applications");
await req(
  "GET",
  "/bank/applications/" + a.id + "/checks",
  undefined,
  "/bank/applications/{id}/checks",
);
await req(
  "GET",
  "/bank/applications/" + a.id + "/audit",
  undefined,
  "/bank/applications/{id}/audit",
);
await req(
  "POST",
  "/bank/applications/" + a.id + "/decision-passport/replay",
  {},
  "/bank/applications/{id}/decision-passport/replay",
);
console.log(
  `PASS: OpenAPI 3.0.3, ${Object.keys(spec.paths).length} путей; ${checks} реальных ответов проверены по схемам.`,
);
