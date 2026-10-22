import { createContext, useContext } from "react";
import type { Actor } from "./types";
export const SessionContext = createContext<{
  actor: Actor;
  refresh: () => Promise<void>;
} | null>(null);
export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error("Нет сеанса");
  return c;
}
