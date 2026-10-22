import { request } from "@playwright/test";
export default async function setup() {
  const api = await request.newContext({
    baseURL: process.env.BASE_URL || "http://localhost:5173",
  });
  const login = await api.post("/api/v1/demo/session", {
    data: { persona: "ADMIN" },
  });
  if (!login.ok())
    throw new Error(
      "Не удалось войти для сброса синтетических fixtures: " +
        (await login.text()),
    );
  const { csrf_token } = await login.json();
  const reset = await api.post("/api/v1/demo/reset", {
    headers: { "X-CSRF-Token": csrf_token },
    data: { confirm: "RESET_SYNTHETIC_DATA" },
  });
  if (!reset.ok())
    throw new Error(
      "Не удалось сбросить синтетические fixtures: " + (await reset.text()),
    );
  await api.dispose();
}
