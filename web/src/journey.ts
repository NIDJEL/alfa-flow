import type { Application } from "./types";

const attentionOrder: Record<string, number> = {
  needs_info: 0,
  offer_accepted: 1,
  signing_simulated: 1,
  offer_issued: 2,
  draft: 3,
  manual_review: 4,
};

export function attentionApplication(applications: Application[]) {
  return applications
    .filter((a) => !["issued", "declined", "closed"].includes(a.status))
    .sort(
      (a, b) =>
        (attentionOrder[a.status] ?? 5) - (attentionOrder[b.status] ?? 5) ||
        b.updated_at.localeCompare(a.updated_at),
    )[0];
}

export function nextAction(application?: Application) {
  const base = application ? "/app/applications/" + application.id : "";
  switch (application?.status) {
    case "draft":
      return {
        eyebrow: "ЧЕРНОВИК СОХРАНЁН",
        title: "Продолжим с того же места.",
        description:
          "Сумма, срок и документы уже сохранены. Проверьте сведения и отправьте заявку.",
        link: "Продолжить оформление",
        to: `/app/applications/new?draft=${application.id}&product=${application.params.product_id}`,
      };
    case "needs_info":
      return {
        eyebrow: "НУЖНО ВАШЕ ДЕЙСТВИЕ",
        title: "Одно уточнение — и дальше.",
        description:
          "Банк запросил сведения. Ответьте прямо в заявке — без писем и звонков.",
        link: "Ответить на запрос",
        to: base,
      };
    case "offer_issued":
      return {
        eyebrow: "ПРЕДЛОЖЕНИЕ ГОТОВО",
        title: "Ваши условия уже здесь.",
        description:
          "Проверьте сумму, срок, платёж и полную сумму возврата. Выбор остаётся за вами.",
        link: "Посмотреть предложение",
        to: base,
      };
    case "offer_accepted":
    case "signing_simulated":
      return {
        eyebrow: "ФИНАЛЬНЫЙ ШАГ",
        title: "Осталось демо-подписание.",
        description:
          "Подтвердите имитацию подписания, чтобы завершить сценарий. Реальные деньги не переводятся.",
        link: "Завершить оформление",
        to: base,
      };
    case "manual_review":
      return {
        eyebrow: "ЗАЯВКА В РАБОТЕ",
        title: "Специалист проверяет факты.",
        description:
          "Это не отказ. Результат и возможные запросы появятся в заявке после проверки банком.",
        link: "Следить за статусом",
        to: base,
      };
    default:
      return {
        eyebrow: "СЛЕДУЮЩИЙ ШАГ ДЛЯ БИЗНЕСА",
        title: "Планы есть. Найдём решение.",
        description:
          "Оборотные средства или новое оборудование — выберите финансирование под свою задачу.",
        link: "Подобрать финансирование",
        to: "/app/financing",
      };
  }
}

export const journeySteps = [
  "Параметры",
  "Проверка",
  "Условия",
  "Подписание",
  "Результат",
];

export function journeyStage(status: string) {
  if (status === "draft") return 0;
  if (
    [
      "submitted",
      "validating",
      "scoring",
      "manual_review",
      "needs_info",
    ].includes(status)
  )
    return 1;
  if (["offer_issued", "declined"].includes(status)) return 2;
  if (["offer_accepted", "signing_simulated"].includes(status)) return 3;
  return status === "issued" ? 4 : 0;
}
