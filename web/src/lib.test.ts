import { describe, expect, it } from "vitest";
import { rub, statusText } from "./lib";
describe("Локализация финансов", () => {
  it("копейки переводятся в рубли без изменения серверного значения", () => {
    expect(rub(123456, true)).toContain("1 234,56");
    expect(rub(0)).toContain("0");
  });
  it("финал явно указывает симуляцию", () => {
    expect(statusText.issued).toBe("Выдача смоделирована");
  });
});
