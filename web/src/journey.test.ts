import { describe, expect, it } from "vitest";
import { attentionApplication, journeyStage, nextAction } from "./journey";
import type { Application } from "./types";

const app = (status: string, id = status) =>
  ({
    id,
    status,
    updated_at: "2026-10-22T10:00:00Z",
    params: { product_id: "EQUIPMENT_LOAN" },
  }) as Application;

describe("Следующий шаг без лишних вопросов", () => {
  it("приоритет у запроса клиента, а не у случайной первой заявки", () => {
    expect(
      attentionApplication([app("draft"), app("issued"), app("needs_info")])
        ?.status,
    ).toBe("needs_info");
  });
  it("финальные заявки не требуют нового действия", () => {
    expect(
      attentionApplication([app("issued"), app("declined"), app("closed")]),
    ).toBeUndefined();
    expect(nextAction().to).toBe("/app/financing");
  });
  it("возобновляет правильный продукт черновика", () => {
    expect(nextAction(app("draft", "saved")).to).toBe(
      "/app/applications/new?draft=saved&product=EQUIPMENT_LOAN",
    );
  });
  it("не показывает подписание или выдачу до соответствующего состояния", () => {
    expect(journeyStage("needs_info")).toBe(1);
    expect(journeyStage("declined")).toBe(2);
    expect(journeyStage("offer_accepted")).toBe(3);
    expect(journeyStage("issued")).toBe(4);
  });
});
