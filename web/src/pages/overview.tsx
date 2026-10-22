import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Coffee,
  Layers,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  api,
  useApplications,
  useCashflow,
  useCompany,
  useProducts,
} from "../api";
import {
  Badge,
  CashflowChart,
  Empty,
  ErrorBox,
  Heading,
  LinkButton,
  Loading,
  Metric,
} from "../components/common";
import type { Forecast } from "../types";
import { date, rub, shortDate } from "../lib";
import { Button } from "../components/ui/button";
import { CashflowImport } from "../components/cashflow-import";
import { ClientApplicationList } from "../components/application-list";
export function Dashboard() {
  const company = useCompany();
  const cash = useCashflow();
  const applications = useApplications();
  const forecast = useQuery({
    queryKey: ["forecast", 90],
    queryFn: ({ signal }) =>
      api<Forecast>(
        "/companies/me/cashflow/forecast",
        "POST",
        { horizon_days: 90 },
        signal,
      ),
  });
  if (company.isPending || cash.isPending || applications.isPending)
    return <Loading />;
  if (company.error || cash.error || applications.error)
    return (
      <ErrorBox error={company.error || cash.error || applications.error} />
    );
  const c = company.data!;
  const f = cash.data!;
  const active = applications.data?.find(
    (a) => !["issued", "declined", "closed"].includes(a.status),
  );
  return (
    <>
      <Heading
        eyebrow="ВАШ БИЗНЕС / ОБЗОР"
        title="Больше возможностей для роста"
        action={
          <span className="date-label">
            22 октября 2026<small>Данные демо-стенда</small>
          </span>
        }
      >
        Здравствуйте! Всё важное о финансах {c.name} — здесь.
      </Heading>
      <div className="overview-grid">
        <section className="balance-card">
          <div className="card-topline">
            <span>
              <Wallet size={18} />
              Доступно на счетах
            </span>
            <span className="mini-label">RUB</span>
          </div>
          <div className="balance-number">{rub(f.opening_balance_kopeks)}</div>
          <div className="balance-bottom">
            <span className="positive">
              <span className="live-dot" />
              Синтетический баланс
            </span>
            <span className="account-label">Расчётный счёт · ДЕМО</span>
          </div>
          <div className="balance-lines" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
        <section className="growth-card">
          <div className="round-icon">
            <TrendingUp size={21} />
          </div>
          <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ ДЛЯ БИЗНЕСА</p>
          <h2>
            Планы есть.
            <br />
            Найдём финансирование.
          </h2>
          <p>
            Оборотные средства или новое оборудование —
            <br className="desktop" />
            подберём понятные условия под вашу задачу.
          </p>
          <Link to="/app/financing" className="text-link">
            Подобрать финансирование
            <ArrowRight size={18} />
          </Link>
          <span className="growth-index" aria-hidden="true">
            ↗
          </span>
        </section>
      </div>
      <div className="stats-strip">
        <Metric
          label="Средний оборот / месяц"
          value={rub(f.average_inflow_kopeks)}
          note={
            <>
              <ArrowDownLeft size={13} /> Поступления от бизнеса
            </>
          }
        />
        <Metric
          label="Операционные расходы"
          value={rub(f.average_operating_kopeks)}
          note={
            <>
              <ArrowUpRight size={13} /> Без платежей по кредитам
            </>
          }
        />
        <Metric
          label="Свободный денежный поток"
          value={rub(f.free_cashflow_kopeks)}
          note={
            <>
              <span className="positive">После действующих долгов</span> · в
              месяц
            </>
          }
        />
      </div>
      <div className="content-grid">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FINANCIAL TWIN LITE</p>
              <h2>Загляните в будущее бизнеса</h2>
            </div>
            <Link to="/app/insights" className="subtle-link">
              Подробнее
              <ChevronRight size={17} />
            </Link>
          </div>
          <p className="muted small">
            Прогноз остатка · ближайшие 90 дней · детерминированная модель
          </p>
          {forecast.isPending ? (
            <Loading />
          ) : forecast.error ? (
            <ErrorBox error={forecast.error} />
          ) : (
            <CashflowChart forecast={forecast.data!} />
          )}
          <div className="chart-note">
            <span className="small-icon">
              <Layers size={18} />
            </span>
            <p>
              {forecast.data?.cash_gap_date ? (
                <>
                  Возможен кассовый разрыв{" "}
                  <strong>{shortDate(forecast.data.cash_gap_date)}</strong>.
                  Проверьте предстоящие обязательства.
                </>
              ) : (
                "Прогноз учитывает операции и будущие обязательства. Это ориентир, не гарантия."
              )}
            </p>
            <Link to="/app/insights" aria-label="Открыть финансовый прогноз">
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>
        <section className="panel application-summary">
          <div className="section-heading">
            <h2>Ваши заявки</h2>
            <span className="count">{applications.data?.length}</span>
          </div>
          {active ? (
            <>
              <Badge status={active.status} />
              <h3>
                {active.params.product_id === "EQUIPMENT_LOAN"
                  ? "Новое оборудование"
                  : "На развитие бизнеса"}
              </h3>
              <strong className="application-amount">
                {rub(active.params.amount_kopeks)}
              </strong>
              <p className="muted">
                {active.params.term_months} мес. · {date(active.created_at)}
              </p>
              <div className="status-rail">
                <i />
                <i className={active.status !== "draft" ? "done" : ""} />
                <i className={active.status === "offer_issued" ? "done" : ""} />
                <i />
              </div>
              <p className="small muted">
                {active.status === "draft"
                  ? "Параметры сохранены. Продолжите заявку, когда будете готовы."
                  : active.status === "needs_info"
                    ? "Нужны уточнения. Ответьте на запрос, чтобы продолжить."
                    : "Ваша заявка уже в кредитном процессе. Посмотрите следующий шаг."}
              </p>
              <LinkButton to={"/app/applications/" + active.id} secondary>
                Открыть заявку
              </LinkButton>
            </>
          ) : (
            <Empty title="Нет активных заявок">
              <p>Готовы к следующему шагу?</p>
              <LinkButton to="/app/financing">Выбрать продукт</LinkButton>
            </Empty>
          )}
        </section>
      </div>
      <section className="trust-strip">
        <ShieldCheck size={21} />
        <div>
          <strong>Понятные решения. Никаких чёрных ящиков.</strong>
          <p>
            Каждое решение сохраняет причины, исходные данные и версию правил.
          </p>
        </div>
        <span className="mini-label">DECISION PASSPORT</span>
      </section>
      <ClientApplicationList />
    </>
  );
}
export function Financing() {
  const products = useProducts();
  const [purpose, setPurpose] = useState("working_capital");
  return (
    <>
      <Heading eyebrow="ФИНАНСИРОВАНИЕ / ПОДБОР" title="Деньги под вашу задачу">
        Два продукта. Прозрачная математика. Ноль скрытых комиссий.
      </Heading>
      <section className="purpose-section">
        <span className="step-number">01</span>
        <div>
          <h2>Что поможет бизнесу расти?</h2>
          <p className="muted">
            Выберите цель — мы покажем подходящий продукт.
          </p>
          <div className="segmented">
            <button
              className={purpose === "working_capital" ? "active" : ""}
              onClick={() => setPurpose("working_capital")}
            >
              <Coffee size={18} />
              Закупка сырья / оборот
            </button>
            <button
              className={purpose === "equipment" ? "active" : ""}
              onClick={() => setPurpose("equipment")}
            >
              <Layers size={18} />
              Покупка оборудования
            </button>
          </div>
        </div>
      </section>
      {products.isPending ? (
        <Loading />
      ) : products.error ? (
        <ErrorBox error={products.error} />
      ) : (
        <div className="products-grid">
          {products.data?.map((p) => (
            <section
              key={p.id}
              className={
                "panel product-card " +
                (purpose === p.purpose ? "recommended" : "")
              }
            >
              <div className="section-heading">
                <div className="round-icon">
                  {p.purpose === "working_capital" ? <Wallet /> : <Layers />}
                </div>
                {purpose === p.purpose && (
                  <Badge status="offer_issued">Под вашу цель</Badge>
                )}
              </div>
              <h2>{p.name}</h2>
              <p className="muted">
                {p.purpose === "working_capital"
                  ? "На закупку, сезонный запас и текущие задачи."
                  : "На технику и оборудование для нового этапа."}
              </p>
              <strong className="product-rate">
                {p.apr_basis_points / 100}
                <span>% годовых</span>
              </strong>
              <dl className="key-values">
                <div>
                  <dt>Сумма</dt>
                  <dd>
                    {rub(p.min_amount_kopeks)} — {rub(p.max_amount_kopeks)}
                  </dd>
                </div>
                <div>
                  <dt>Срок</dt>
                  <dd>
                    {p.min_term_months}–{p.max_term_months} месяцев
                  </dd>
                </div>
                <div>
                  <dt>Комиссия</dt>
                  <dd>{rub(p.fee_kopeks)}</dd>
                </div>
                <div>
                  <dt>Обеспечение</dt>
                  <dd>Не требуется в демо</dd>
                </div>
              </dl>
              <p className="product-document">
                <Check size={16} />
                {p.required_document
                  ? "Понадобится счёт на оборудование"
                  : "Данные компании уже предзаполнены"}
              </p>
              <LinkButton
                to={"/app/applications/new?product=" + p.id}
                secondary={purpose !== p.purpose}
              >
                Оформить заявку
              </LinkButton>
            </section>
          ))}
        </div>
      )}
      <div className="notice">
        <ShieldCheck size={20} />
        <p>
          Гипотетические условия 2026 года для демонстрации. Не оферта и не
          действующие ставки Альфа-Банка. Финальное предложение формируется по
          демо-правилам.
        </p>
      </div>
    </>
  );
}
export function Insights() {
  const cash = useCashflow();
  const [horizon, setHorizon] = useState(90);
  const [transactions, setTransactions] = useState(false);
  const forecast = useQuery({
    queryKey: ["forecast", horizon],
    queryFn: ({ signal }) =>
      api<Forecast>(
        "/companies/me/cashflow/forecast",
        "POST",
        { horizon_days: horizon },
        signal,
      ),
  });
  if (cash.isPending) return <Loading />;
  if (cash.error) return <ErrorBox error={cash.error} />;
  const f = cash.data!;
  return (
    <>
      <Heading
        eyebrow="ФИНАНСОВЫЙ ДВОЙНИК / FINANCIAL TWIN LITE"
        title="Видеть дальше. Решать увереннее."
        action={
          <LinkButton to="/app/financing">Подобрать финансирование</LinkButton>
        }
      >
        Движение денег и будущие обязательства — в одной прозрачной модели.
      </Heading>
      <div className="stats-strip">
        <Metric label="Текущий остаток" value={rub(f.opening_balance_kopeks)} />
        <Metric
          label="Свободный поток / месяц"
          value={rub(f.free_cashflow_kopeks)}
        />
        <Metric
          label="Глубина истории"
          value={`${f.history_months} мес.`}
          note="Только синтетические операции"
        />
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ПРОГНОЗ ОСТАТКА / ₽</p>
            <h2>Ваш денежный горизонт</h2>
          </div>
          <div className="segmented compact">
            {[30, 60, 90].map((n) => (
              <button
                key={n}
                className={horizon === n ? "active" : ""}
                onClick={() => setHorizon(n)}
              >
                {n} дней
              </button>
            ))}
          </div>
        </div>
        {forecast.isPending ? (
          <Loading />
        ) : forecast.error ? (
          <ErrorBox error={forecast.error} />
        ) : (
          <>
            <CashflowChart forecast={forecast.data!} />
            <div className="forecast-result">
              <Metric
                label="Минимальный остаток без кредита"
                value={rub(forecast.data!.forecast_min_balance_kopeks)}
              />
              <Metric
                label="Возможный кассовый разрыв"
                value={
                  forecast.data!.cash_gap_date
                    ? shortDate(forecast.data!.cash_gap_date)
                    : "Не выявлен"
                }
              />
            </div>
            <details className="assumptions">
              <summary>Почему прогноз такой?</summary>
              <ul>
                {forecast.data!.assumptions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p>
                Дата модели зафиксирована: 22.10.2026. Будущее обязательство:
                разовая закупка 1 100 000 ₽ 2 ноября. Межсчётные переводы не
                считаются выручкой.
              </p>
            </details>
          </>
        )}
      </section>
      <CashflowImport />
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ИСТОЧНИК МОДЕЛИ</p>
            <h2>История, которую можно проверить</h2>
          </div>
          <Button
            variant="secondary"
            onClick={() => setTransactions(!transactions)}
          >
            {transactions ? "Скрыть операции" : "Показать операции"}
          </Button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Месяц</th>
                <th>Поступления</th>
                <th>Операционные расходы</th>
                <th>Действующий долг</th>
                <th>Свободный поток</th>
              </tr>
            </thead>
            <tbody>
              {f.monthly.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>{rub(m.inflow_kopeks)}</td>
                  <td>{rub(m.operating_kopeks)}</td>
                  <td>{rub(m.debt_kopeks)}</td>
                  <td>{rub(m.net_kopeks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions && (
          <div className="table-scroll transaction-table">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Операция</th>
                  <th>Категория</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {f.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{shortDate(t.date)}</td>
                    <td>
                      {t.description}
                      {t.recurring && <small>Регулярная</small>}
                    </td>
                    <td>{t.category}</td>
                    <td className={t.direction === "credit" ? "positive" : ""}>
                      {t.direction === "credit" ? "+" : "−"}
                      {rub(t.amount_kopeks)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
