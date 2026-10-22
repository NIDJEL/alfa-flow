import { useQuery } from "@tanstack/react-query";
import type { Application, Cashflow, Company, Product } from "./types";
export class APIError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
let csrf = "";
export const setCSRF = (value: string) => {
  csrf = value;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...(method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new APIError(
      data.message || "Не удалось выполнить запрос",
      response.status,
      data.code,
    );
  if (data && typeof data.csrf_token === "string") setCSRF(data.csrf_token);
  return data as T;
}
export const useCompany = () =>
  useQuery({
    queryKey: ["company"],
    queryFn: ({ signal }) =>
      api<Company>("/companies/me", "GET", undefined, signal),
  });
export const useProducts = () =>
  useQuery({
    queryKey: ["products"],
    queryFn: ({ signal }) =>
      api<Product[]>("/loan-products", "GET", undefined, signal),
  });
export const useApplications = (bank = false, status = "") =>
  useQuery({
    queryKey: ["applications", bank, status],
    queryFn: ({ signal }) =>
      api<Application[]>(
        (bank ? "/bank" : "") +
          "/applications?limit=100&status=" +
          encodeURIComponent(status),
        "GET",
        undefined,
        signal,
      ),
    refetchInterval: 3000,
  });
export const useApplication = (id: string) =>
  useQuery({
    queryKey: ["application", id],
    queryFn: ({ signal }) =>
      api<Application>("/applications/" + id, "GET", undefined, signal),
    refetchInterval: 2500,
  });
export const useCashflow = () =>
  useQuery({
    queryKey: ["cashflow"],
    queryFn: ({ signal }) =>
      api<Cashflow>("/companies/me/cashflow", "GET", undefined, signal),
  });
