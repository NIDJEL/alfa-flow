import { Check, CircleDot } from "lucide-react";
import { journeyStage, journeySteps } from "../journey";

export function ApplicationJourney({ status }: { status: string }) {
  const stage = journeyStage(status);
  const terminal = ["declined", "closed"].includes(status);
  const note =
    status === "needs_info"
      ? "Сейчас нужен ваш ответ на запрос. Проверка продолжится после уточнения."
      : status === "manual_review"
        ? "Следующий шаг за специалистом банка. Это не отказ."
        : status === "declined"
          ? "Рассмотрение завершено. Причины приведены ниже; подписание и выдача недоступны."
          : status === "issued"
            ? "Сценарий завершён: выдача только смоделирована, реальные деньги не переводились."
            : status === "draft"
              ? "Черновик сохранён на сервере, но ещё не отправлен банку."
              : "Условия и следующий доступный шаг показаны ниже. Срок рассмотрения не гарантируется.";
  return (
    <section className="application-journey" aria-label="Этапы заявки">
      <ol>
        {journeySteps
          .slice(0, terminal ? stage + 1 : undefined)
          .map((title, i) => (
            <li
              key={title}
              aria-current={i === stage ? "step" : undefined}
              className={
                i < stage || (status === "issued" && i === stage)
                  ? "complete"
                  : i === stage
                    ? "current"
                    : ""
              }
            >
              <span>
                {i < stage || (status === "issued" && i === stage) ? (
                  <Check size={14} />
                ) : (
                  i + 1
                )}
              </span>
              {terminal && i === stage ? "Результат" : title}
            </li>
          ))}
      </ol>
      <p>
        <CircleDot size={15} />
        {note}
      </p>
    </section>
  );
}
