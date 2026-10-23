import { GitCompareArrows, Plus, X } from "lucide-react";
import type { Params, Simulation } from "../types";
import { rub, shortDate, outcomeText } from "../lib";
import { Button } from "./ui/button";

export type ComparedScenario = {
  params: Params;
  result: Simulation;
  revision: number;
};
export function ScenarioComparison({
  params,
  simulation,
  stale,
  revision,
  saved,
  setSaved,
}: {
  params: Params;
  simulation: Simulation;
  stale: boolean;
  revision: number;
  saved: ComparedScenario[];
  setSaved: React.Dispatch<React.SetStateAction<ComparedScenario[]>>;
}) {
  const duplicate = saved.some(
    (item) =>
      item.revision === revision &&
      item.params.amount_kopeks === params.amount_kopeks &&
      item.params.term_months === params.term_months,
  );
  const add = () =>
    setSaved((previous) => [
      ...previous,
      { params: { ...params }, result: simulation, revision },
    ]);
  return (
    <section
      className="panel comparison-panel"
      aria-label="Сравнение сценариев"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">НЕ ВЫБИРАЙТЕ ВСЛЕПУЮ</p>
          <h2>Сравните варианты рядом</h2>
        </div>
        <GitCompareArrows size={21} />
      </div>
      <p className="small muted">
        Закрепите до трёх серверных расчётов, затем меняйте сумму и срок. Заявка
        и предложение не изменятся.
      </p>
      <Button
        variant="secondary"
        disabled={stale || duplicate || saved.length >= 3}
        onClick={add}
      >
        <Plus size={16} />
        {duplicate
          ? "Этот вариант закреплён"
          : saved.length >= 3
            ? "Закреплено 3 из 3"
            : "Закрепить текущий вариант"}
      </Button>
      {saved.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="comparison-table">
              <caption className="sr-only">
                Закреплённые расчёты. Изменения показаны относительно первого
                варианта.
              </caption>
              <thead>
                <tr>
                  <th>Сценарий</th>
                  {saved.map((item, index) => (
                    <th key={index}>
                      <span>Вариант {index + 1}</span>
                      <button
                        className="icon-button"
                        aria-label={`Убрать вариант ${index + 1}`}
                        onClick={() =>
                          setSaved(saved.filter((_, i) => i !== index))
                        }
                      >
                        <X size={15} />
                      </button>
                      <small>Снимок заявки v{item.revision}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Сумма / срок</th>
                  {saved.map((s, i) => (
                    <td key={i}>
                      {rub(s.params.amount_kopeks)}
                      <small>{s.params.term_months} мес.</small>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Платёж / месяц</th>
                  {saved.map((s, i) => (
                    <td key={i}>
                      <strong>
                        {rub(s.result.monthly_payment_kopeks, true)}
                      </strong>
                      {i > 0 && (
                        <small>
                          {s.result.monthly_payment_kopeks <
                          saved[0].result.monthly_payment_kopeks
                            ? "На "
                            : "Разница +"}
                          {rub(
                            Math.abs(
                              s.result.monthly_payment_kopeks -
                                saved[0].result.monthly_payment_kopeks,
                            ),
                            true,
                          )}
                          {s.result.monthly_payment_kopeks <
                          saved[0].result.monthly_payment_kopeks
                            ? " меньше"
                            : ""}
                        </small>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Проценты за весь срок</th>
                  {saved.map((s, i) => (
                    <td key={i}>
                      {rub(
                        s.result.evaluation.schedule.total_interest_kopeks,
                        true,
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Всего к возврату</th>
                  {saved.map((s, i) => (
                    <td key={i}>{rub(s.result.total_cost_kopeks, true)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Покрытие платежа</th>
                  {saved.map((s, i) => (
                    <td key={i}>
                      {s.result.coverage_ratio === null
                        ? "Нет данных"
                        : s.result.coverage_ratio.toFixed(2) + "×"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Разрыв со сценарием</th>
                  {saved.map((s, i) => (
                    <td key={i}>
                      {!s.result.forecast.sufficient_history
                        ? "Нет прогноза"
                        : s.result.forecast.funded_gap_date
                          ? shortDate(s.result.forecast.funded_gap_date)
                          : "Не выявлен"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Результат правил</th>
                  {saved.map((s, i) => (
                    <td key={i}>
                      {outcomeText[s.result.eligibility] ||
                        s.result.eligibility}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="small muted comparison-note">
            Меньший платёж может означать большую переплату. При разных суммах
            сравнивайте также объём финансирования. Расчёты учебные, сохраняются
            только до выхода с экрана.
          </p>
        </>
      )}
      <span className="sr-only" role="status">
        Закреплено вариантов: {saved.length}
      </span>
    </section>
  );
}
