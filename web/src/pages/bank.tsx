import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Filter, Search, ShieldCheck } from "lucide-react";
import { useApplications } from "../api";
import {
  Badge,
  Empty,
  ErrorBox,
  Heading,
  Loading,
  Metric,
} from "../components/common";
import { date, rub, statusText } from "../lib";
export function BankQueue() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const q = useApplications(true, status);
  const all = useApplications(true);
  const applications =
    q.data?.filter((a) =>
      (a.company_name + " " + a.id + " " + a.persona)
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const count = (status: string) =>
    all.data?.filter((a) => a.status === status).length || 0;
  return (
    <>
      <Heading
        eyebrow="РАБОЧЕЕ МЕСТО БАНКА / КРЕДИТНЫЙ КОНВЕЙЕР"
        title="Решения начинаются с фактов"
        action={
          <span className="demo-tag">
            <i />
            Серверная очередь · polling 3 с
          </span>
        }
      >
        Проверки, риски и следующий шаг по каждой заявке — в одном рабочем
        контексте.
      </Heading>
      <div className="stats-strip bank-stats">
        <Metric label="Заявок в демо-очереди" value={all.data?.length ?? "—"} />
        <Metric
          label="Нужен специалист"
          value={count("manual_review")}
          note="Проверить факты и принять решение"
        />
        <Metric
          label="Ожидают сведения"
          value={count("needs_info")}
          note="Клиенту доступен запрос в кабинете"
        />
        <Metric
          label="Предложения сформированы"
          value={count("offer_issued")}
        />
      </div>
      <section className="panel queue-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ОПЕРАЦИОННЫЙ КОНТРОЛЬ</p>
            <h2>Очередь заявок</h2>
          </div>
          <span className="small muted">
            <ShieldCheck size={15} /> Синтетические профили
          </span>
        </div>
        <div className="queue-controls">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Поиск по компании или заявке"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти компанию, заявку или сценарий"
            />
          </label>
          <label className="filter-field">
            <Filter size={17} />
            <select
              aria-label="Фильтр по статусу"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Все статусы</option>
              {[
                "manual_review",
                "needs_info",
                "offer_issued",
                "issued",
                "declined",
                "draft",
              ].map((s) => (
                <option key={s} value={s}>
                  {statusText[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : applications.length === 0 ? (
          <Empty title="Заявок по этому запросу нет">
            <p>Измените фильтр или поисковую строку.</p>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Компания / сценарий</th>
                  <th>Сумма / срок</th>
                  <th>Статус</th>
                  <th>Обновлена</th>
                  <th>Следующее действие</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link
                        className="company-link"
                        to={"/bank/applications/" + a.id}
                      >
                        <span className="table-monogram">
                          {a.company_name
                            .replace(/ООО|ИП|«|»/g, "")
                            .trim()
                            .slice(0, 1)}
                        </span>
                        <span>
                          <strong>{a.company_name}</strong>
                          <small>
                            {a.persona} · {a.id.slice(0, 8)}
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <strong>{rub(a.params.amount_kopeks)}</strong>
                      <small>{a.params.term_months} месяцев</small>
                    </td>
                    <td>
                      <Badge status={a.status} />
                    </td>
                    <td>{date(a.updated_at)}</td>
                    <td>
                      <Link
                        to={"/bank/applications/" + a.id}
                        className="queue-action"
                      >
                        {a.status === "manual_review"
                          ? "Рассмотреть"
                          : a.status === "needs_info"
                            ? "Проверить запрос"
                            : "Открыть"}
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>Показано {applications.length} · лимит страницы 100</span>
          <span>Сроки обработки не являются production SLA</span>
        </div>
      </section>
    </>
  );
}
