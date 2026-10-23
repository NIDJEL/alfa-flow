import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  FileCheck2,
  Fingerprint,
  GitCompareArrows,
  History,
  Info,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { api, useApplication, useCashflow, useProducts } from "../api";
import type {
  Application,
  Check as CheckType,
  Decision,
  Params,
  Simulation,
} from "../types";
import {
  ApplicationTimeline,
  Badge,
  CashflowChart,
  Empty,
  ErrorBox,
  Heading,
  LinkButton,
  Loading,
  Metric,
  PaymentSchedule,
} from "../components/common";
import { Button } from "../components/ui/button";
import { DocumentUpload } from "../components/documents";
import { ApplicationJourney } from "../components/application-journey";
import {
  ScenarioComparison,
  type ComparedScenario,
} from "../components/scenario-comparison";
import { date, outcomeText, rub, statusText } from "../lib";
export function ApplicationDetail({ bank = false }: { bank?: boolean }) {
  const { id = "" } = useParams();
  const query = useApplication(id);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [consent, setConsent] = useState(false);
  const [answer, setAnswer] = useState("");
  const [revenue, setRevenue] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState(false);
  const checks = useQuery({
    queryKey: ["checks", id],
    queryFn: () => api<CheckType[]>("/bank/applications/" + id + "/checks"),
    enabled: bank,
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorBox error={query.error} />;
  const a = query.data!;
  const offer = a.offers.find((o) => o.id === a.active_offer_id);
  const decision = a.decisions.at(-1);
  const openRequest = a.info_requests.find((r) => r.open);
  const base = (bank ? "/bank" : "/app") + "/applications/" + a.id;
  async function action(path: string, body: object, bankAction = false) {
    setBusy(true);
    setError(undefined);
    try {
      const data = await api<Application>(
        (bankAction ? "/bank" : "") + "/applications/" + id + "/" + path,
        "POST",
        { ...body, version: a.version },
      );
      client.setQueryData(["application", id], data);
      await client.invalidateQueries({ queryKey: ["applications"] });
      await client.invalidateQueries({ queryKey: ["checks", id] });
      setConsent(false);
      setMessage("");
      setReason("");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to={bank ? "/bank" : "/app"} className="back-link">
        <ArrowLeft size={15} />
        {bank ? "К очереди заявок" : "К обзору бизнеса"}
      </Link>
      <Heading
        eyebrow={`${bank ? "КРЕДИТНЫЙ КОНВЕЙЕР" : "ВАШЕ ФИНАНСИРОВАНИЕ"} / ЗАЯВКА ${a.id.slice(0, 8).toUpperCase()}`}
        title={bank ? a.company_name : "Финансирование на ваших условиях"}
        action={<Badge status={a.status} />}
      >
        {a.params.product_id === "EQUIPMENT_LOAN"
          ? "Кредит на оборудование"
          : "Оборотный кредит"}{" "}
        · исходный запрос {rub(a.params.amount_kopeks)} на{" "}
        {a.params.term_months} мес.
      </Heading>
      <ApplicationJourney status={a.status} />
      {error && <ErrorBox error={error} />}
      <div className="detail-layout">
        <div className="detail-main">
          {a.status === "draft" && (
            <section className="panel">
              <p className="eyebrow">СОХРАНЕНО, НЕ ОТПРАВЛЕНО</p>
              <h2>Ваш черновик ждёт продолжения</h2>
              <p className="muted">
                Параметры хранятся на сервере. Продолжите оформление или
                отправьте их на проверку.
              </p>
              <dl className="key-values">
                <div>
                  <dt>Сумма</dt>
                  <dd>{rub(a.params.amount_kopeks)}</dd>
                </div>
                <div>
                  <dt>Срок</dt>
                  <dd>{a.params.term_months} месяцев</dd>
                </div>
              </dl>
              {!bank && (
                <>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    Подтверждаю корректность синтетических данных
                  </label>
                  <div className="inline-actions">
                    <Button
                      disabled={busy || !consent}
                      onClick={() => action("submit", { consent: true })}
                    >
                      Отправить на проверку
                      <ArrowRight size={16} />
                    </Button>
                    <LinkButton
                      secondary
                      to={
                        "/app/applications/new?draft=" +
                        a.id +
                        "&product=" +
                        a.params.product_id
                      }
                    >
                      Продолжить оформление
                    </LinkButton>
                  </div>
                </>
              )}
            </section>
          )}
          {offer &&
            [
              "offer_issued",
              "offer_accepted",
              "issued",
              "signing_simulated",
            ].includes(a.status) && (
              <section
                className={
                  "offer-panel " + (a.status === "issued" ? "issued-panel" : "")
                }
              >
                <div className="section-heading">
                  <span className="eyebrow">
                    {a.status === "issued"
                      ? "ПУТЬ ПРОЙДЕН"
                      : offer.type === "counteroffer"
                        ? "ВСТРЕЧНОЕ ПРЕДЛОЖЕНИЕ"
                        : "ВАШЕ ПРЕДЛОЖЕНИЕ"}
                  </span>
                  <span className="offer-revision">
                    Версия {offer.revision}
                  </span>
                </div>
                {a.status === "issued" ? (
                  <>
                    <div className="success-icon">
                      <CheckCheck />
                    </div>
                    <h2>Финансирование смоделировано</h2>
                    <p>
                      Все этапы завершены. Событие выдачи и согласие сохранены в
                      истории.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>
                      {offer.type === "counteroffer"
                        ? "Та же цель. Более комфортная нагрузка."
                        : "Бизнесу — ресурсы для следующего шага."}
                    </h2>
                    <p>
                      {offer.type === "counteroffer"
                        ? "Исходная сумма велика относительно денежного потока. Нашли допустимые условия по той же политике."
                        : "Предложение рассчитано на основе данных вашей компании и демонстрационных правил."}
                    </p>
                  </>
                )}
                <div className="offer-amount">
                  {rub(offer.params.amount_kopeks)}
                </div>
                <div className="offer-metrics">
                  <Metric
                    label="Ежемесячный платёж"
                    value={rub(offer.schedule.monthly_payment_kopeks, true)}
                  />
                  <Metric
                    label="Ставка / срок"
                    value={`${offer.schedule.apr_basis_points / 100}% / ${offer.params.term_months} мес.`}
                  />
                </div>
                <dl className="key-values">
                  <div>
                    <dt>Всего к возврату</dt>
                    <dd>{rub(offer.schedule.total_payment_kopeks, true)}</dd>
                  </div>
                  <div>
                    <dt>Проценты за весь срок</dt>
                    <dd>{rub(offer.schedule.total_interest_kopeks, true)}</dd>
                  </div>
                  <div>
                    <dt>Комиссии</dt>
                    <dd>0 ₽</dd>
                  </div>
                  <div>
                    <dt>Предложение действительно до</dt>
                    <dd>{date(offer.expires_at)}</dd>
                  </div>
                </dl>
                {!bank && a.status === "offer_issued" && (
                  <div className="offer-actions">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      Принимаю демонстрационные условия предложения
                    </label>
                    <div className="inline-actions">
                      <Button
                        disabled={busy || !consent}
                        onClick={() =>
                          action("offers/" + offer.id + "/accept", {
                            consent: true,
                          })
                        }
                      >
                        Принять предложение
                        <ArrowRight size={17} />
                      </Button>
                      <LinkButton secondary to={base + "/what-if"}>
                        Сравнить сценарии
                      </LinkButton>
                    </div>
                  </div>
                )}
                {!bank && a.status === "offer_accepted" && (
                  <div className="offer-actions">
                    <div className="notice">
                      <FileCheck2 size={20} />
                      <p>
                        Предложение принято. Подтвердите учебное подписание —
                        система сама выполнит симуляцию выдачи. SMS не
                        требуется.
                      </p>
                    </div>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      Подтверждаю имитацию подписания. Реальные деньги не
                      переводятся.
                    </label>
                    <Button
                      disabled={busy || !consent}
                      onClick={() =>
                        action("sign-simulated", { consent: true })
                      }
                    >
                      Подписать в демо
                      <Check size={17} />
                    </Button>
                  </div>
                )}
                {a.status === "issued" && (
                  <div className="notice success">
                    <ShieldCheck size={20} />
                    <p>
                      Только учебная операция. Идентификатор симуляции:{" "}
                      <code>{a.disbursement_id}</code>
                    </p>
                  </div>
                )}
                <PaymentSchedule schedule={offer.schedule} />
                <p className="fine-print">
                  Синтетические данные · гипотетические условия · не банковская
                  оферта
                </p>
              </section>
            )}
          {a.status === "needs_info" && (
            <section className="panel info-panel">
              <div className="round-icon warning">
                <MessageSquareText />
              </div>
              <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ / УТОЧНИТЬ ДАННЫЕ</p>
              <h2>Немного деталей — и продолжим</h2>
              <p>
                {openRequest?.message || "Проверьте запрос сведений в истории."}
              </p>
              {!bank && openRequest && (
                <>
                  <label className="field">
                    Ответ на запрос
                    <textarea
                      rows={3}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Опишите, что вы уточнили"
                    />
                  </label>
                  <label className="field">
                    Уточнённый месячный оборот, ₽
                    <input
                      type="number"
                      value={revenue}
                      onChange={(e) => setRevenue(e.target.value)}
                      placeholder="Например, 3000000"
                    />
                    <small>
                      Корректируйте по данным выписки, не под желаемое решение.
                    </small>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    Подтверждаю корректность уточнённых демо-данных
                  </label>
                  <Button
                    disabled={busy || !consent || !answer.trim()}
                    onClick={() =>
                      action("provide-info", {
                        request_id: openRequest.id,
                        answer,
                        declared_revenue_kopeks: Math.round(
                          Number(revenue) * 100,
                        ),
                        consent: true,
                      })
                    }
                  >
                    Отправить уточнение
                    <ArrowRight size={17} />
                  </Button>
                </>
              )}
            </section>
          )}
          {a.status === "manual_review" && (
            <section className="panel">
              <div className="round-icon">
                <ShieldCheck />
              </div>
              <p className="eyebrow">РАССМОТРЕНИЕ В БАНКЕ</p>
              <h2>Заявку проверит специалист</h2>
              <p>
                Не все проверки можно завершить автоматически. Это не отказ.
                Результат и запросы появятся здесь после обработки банком.
              </p>
              <div className="notice">
                <Info size={19} />
                <p>
                  Для демонстрации откройте роль аналитика и обработайте эту
                  заявку. Статус синхронизируется с сервером каждые 2,5 секунды.
                </p>
              </div>
            </section>
          )}
          {a.status === "declined" && (
            <section className="panel decline-panel">
              <p className="eyebrow">РЕЗУЛЬТАТ ПРОВЕРКИ</p>
              <h2>Сейчас не можем предложить финансирование</h2>
              <p>
                Сработало обязательное условие демонстрационной политики.
                Изменение суммы или срока не отменяет юридические факты.
              </p>
              {decision?.result.triggered_rules.map((r) => (
                <div className="reason-item" key={r.id}>
                  <Info size={18} />
                  <p>{r.message}</p>
                </div>
              ))}
              <LinkButton secondary to={base + "/passport"}>
                Посмотреть объяснение
              </LinkButton>
            </section>
          )}
          {bank && (
            <>
              <section className="panel">
                <div className="section-heading">
                  <h2>Результаты проверок</h2>
                  <span className="mini-label">SIMULATED</span>
                </div>
                {checks.isPending ? (
                  <Loading />
                ) : checks.error ? (
                  <ErrorBox error={checks.error} />
                ) : (
                  checks.data?.map((c) => (
                    <div className="check-row" key={c.id}>
                      <div
                        className={
                          "check-icon " +
                          (c.status === "unavailable" ? "warning" : "")
                        }
                      >
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <strong>
                          {c.provider === "registry"
                            ? "Реестр юридических лиц"
                            : c.provider === "bki"
                              ? "Кредитная история"
                              : "Полномочия представителя"}
                        </strong>
                        <p>{c.detail}</p>
                      </div>
                      <Badge
                        status={
                          c.status === "clear" ||
                          c.status === "active" ||
                          c.status === "checked"
                            ? "offer_issued"
                            : "manual_review"
                        }
                      >
                        {c.status}
                      </Badge>
                    </div>
                  ))
                )}
              </section>
              {["manual_review", "needs_info"].includes(a.status) && (
                <section className="panel analyst-actions">
                  <p className="eyebrow">РАБОЧЕЕ МЕСТО / ДЕЙСТВИЯ</p>
                  <h2>Продолжить рассмотрение</h2>
                  <label className="field">
                    Запрос клиенту
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="Какие сведения нужно уточнить?"
                    />
                  </label>
                  <Button
                    variant="secondary"
                    disabled={busy || message.trim().length < 8}
                    onClick={() => action("request-info", { message }, true)}
                  >
                    <MessageSquareText size={17} />
                    Запросить сведения
                  </Button>
                  {a.status === "manual_review" && (
                    <>
                      <hr />
                      <label className="field">
                        Основание ручного решения
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          placeholder="Зафиксируйте результат проверки и основание"
                        />
                      </label>
                      <p className="small muted">
                        Одобрение не обходит hard-stop, требования к истории,
                        документам и долговой ёмкости. Исключение по недоступной
                        mock БКИ требует основания.
                      </p>
                      <div className="inline-actions">
                        <Button
                          disabled={busy || reason.trim().length < 8}
                          onClick={() =>
                            action(
                              "decide",
                              { decision: "offer", reason },
                              true,
                            )
                          }
                        >
                          Сформировать предложение
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy || reason.trim().length < 8}
                          onClick={() =>
                            action(
                              "decide",
                              { decision: "decline", reason },
                              true,
                            )
                          }
                        >
                          Отклонить
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {decision && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ПРОЗРАЧНОЕ РЕШЕНИЕ</p>
                  <h2>Почему именно так</h2>
                </div>
                <Link to={base + "/passport"} className="subtle-link">
                  Паспорт
                  <ArrowRight size={16} />
                </Link>
              </div>
              {decision.result.triggered_rules.map((r) => (
                <div key={r.id} className="reason-item">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>{r.message}</strong>
                    {bank && (
                      <p className="small muted">
                        <code>{r.id}</code> · вход {r.input} · порог{" "}
                        {r.threshold}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <div className="coverage-row">
                <Metric
                  label="Свободный поток / месяц"
                  value={rub(decision.result.available_cash_kopeks)}
                />
                <span>÷</span>
                <Metric
                  label="Новый платёж / месяц"
                  value={rub(decision.result.schedule.monthly_payment_kopeks)}
                />
                <span>=</span>
                <Metric
                  label="Покрытие платежа"
                  value={
                    decision.result.coverage_ratio === null
                      ? "Не рассчитано"
                      : `${decision.result.coverage_ratio.toFixed(2)}×`
                  }
                />
              </div>
              <p className="small muted">
                Поток уже учитывает операционные расходы и действующие долговые
                платежи. Модель и риск-категории — демонстрационные.
              </p>
            </section>
          )}
          <section className="panel">
            <div className="section-heading">
              <h2>История заявки</h2>
              <button
                className="text-button"
                onClick={() => setHistory(!history)}
              >
                {history ? "Свернуть" : "Вся история"}
                <History size={16} />
              </button>
            </div>
            <ApplicationTimeline
              events={history ? a.events : a.events.slice(-5)}
            />
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel">
            <div className="section-heading">
              <Fingerprint size={22} />
              <span className="mini-label">ЗАЯВКА</span>
            </div>
            <h3>{a.company_name}</h3>
            <dl className="key-values">
              <div>
                <dt>Исходная сумма</dt>
                <dd>{rub(a.params.amount_kopeks)}</dd>
              </div>
              <div>
                <dt>Срок</dt>
                <dd>{a.params.term_months} мес.</dd>
              </div>
              <div>
                <dt>Версия записи</dt>
                <dd>{a.version}</dd>
              </div>
              <div>
                <dt>Создана</dt>
                <dd>{date(a.created_at)}</dd>
              </div>
            </dl>
            {decision && (
              <Link to={base + "/passport"} className="aside-link">
                <ShieldCheck size={18} />
                <span>
                  Паспорт решения<small>Причины и версия данных</small>
                </span>
                <ArrowRight size={16} />
              </Link>
            )}
            {!bank && (
              <Link to={base + "/what-if"} className="aside-link">
                <SlidersHorizontal size={18} />
                <span>
                  Что, если?<small>Сравните сумму и срок</small>
                </span>
                <ArrowRight size={16} />
              </Link>
            )}
          </section>
          <section className="panel documents-panel">
            <h3>Документы</h3>
            {!bank && (a.status === "draft" || a.status === "needs_info") && (
              <DocumentUpload application={a} />
            )}{" "}
            {a.documents.length ? (
              a.documents.map((d) => (
                <div className="document-row" key={d.id}>
                  <FileCheck2 size={19} />
                  <div>
                    <strong>{d.name}</strong>
                    <small>
                      {d.source === "simulated"
                        ? "Синтетический документ"
                        : "Метаданные загруженного файла"}{" "}
                      · {d.size_bytes} Б
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="small muted">
                Документы не прикреплены. Финансовая история взята из
                синтетического банковского профиля.
              </p>
            )}
          </section>
          <div className="aside-note">
            <LockKeyhole size={18} />
            <p>
              Все действия сохраняются на сервере. Обновление страницы не меняет
              результат.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
export function WhatIf() {
  const { id = "" } = useParams();
  const app = useApplication(id);
  const products = useProducts();
  const cash = useCashflow();
  if (app.isPending || products.isPending || cash.isPending) return <Loading />;
  if (app.error || products.error || cash.error)
    return <ErrorBox error={app.error || products.error || cash.error} />;
  return <WhatIfPanel key={id} application={app.data!} />;
}
function WhatIfPanel({ application: a }: { application: Application }) {
  const product = useProducts().data!.find(
    (p) => p.id === a.params.product_id,
  )!;
  const active = a.offers.find((o) => o.id === a.active_offer_id);
  const initial = active?.params || a.params;
  const [amount, setAmount] = useState(initial.amount_kopeks / 100);
  const [term, setTerm] = useState(initial.term_months);
  const [debounced, setDebounced] = useState({ amount, term });
  const [savedScenarios, setSavedScenarios] = useState<ComparedScenario[]>([]);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ amount, term }), 350);
    return () => clearTimeout(timer);
  }, [amount, term]);
  const params: Params = {
    ...a.params,
    amount_kopeks: Math.round(debounced.amount * 100),
    term_months: debounced.term,
  };
  const valid =
    Number.isFinite(amount) &&
    Number.isInteger(term) &&
    amount * 100 >= product.min_amount_kopeks &&
    amount * 100 <= product.max_amount_kopeks &&
    term >= product.min_term_months &&
    term <= product.max_term_months;
  const simulation = useQuery({
    queryKey: ["simulation", a.id, a.version, params],
    queryFn: ({ signal }) =>
      api<Simulation>(
        "/applications/" + a.id + "/simulations",
        "POST",
        params,
        signal,
      ),
    enabled: valid && debounced.amount === amount && debounced.term === term,
  });
  const stale =
    debounced.amount !== amount ||
    debounced.term !== term ||
    simulation.isFetching;
  const s = simulation.data;
  async function requestOffer(p: Params) {
    setBusy(true);
    setError(undefined);
    try {
      await api("/applications/" + a.id + "/request-offer", "POST", {
        ...p,
        version: a.version,
      });
      await client.invalidateQueries({ queryKey: ["application", a.id] });
      navigate("/app/applications/" + a.id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function preset(mode: string) {
    if (mode === "payment") setTerm(product.max_term_months);
    if (mode === "cost") setTerm(product.min_term_months);
    if (mode === "need") {
      setAmount(a.params.amount_kopeks / 100);
      setTerm(a.params.term_months);
    }
  }
  return (
    <>
      <Link to={"/app/applications/" + a.id} className="back-link">
        <ArrowLeft size={15} />К заявке
      </Link>
      <Heading
        eyebrow="WHAT-IF / ЛАБОРАТОРИЯ УСЛОВИЙ"
        title="А если изменить условия?"
        action={
          <span className="demo-tag">
            <i />
            Расчёт на сервере
          </span>
        }
      >
        Найдите баланс между суммой, ежемесячным платежом и переплатой.
      </Heading>
      {error && <ErrorBox error={error} />}
      <div className="simulation-layout">
        <section className="panel scenario-controls">
          <p className="eyebrow">ВАШ СЦЕНАРИЙ</p>
          <h2>Настройте под бизнес</h2>
          <label className="field">
            Сумма, ₽
            <input
              type="number"
              min={product.min_amount_kopeks / 100}
              max={product.max_amount_kopeks / 100}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <input
            type="range"
            aria-label="Изменить сумму"
            min={product.min_amount_kopeks / 100}
            max={product.max_amount_kopeks / 100}
            step={10000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>{rub(product.min_amount_kopeks)}</span>
            <span>{rub(product.max_amount_kopeks)}</span>
          </div>
          <label className="field">
            Срок, месяцев
            <input
              type="number"
              min={product.min_term_months}
              max={product.max_term_months}
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
            />
          </label>
          <input
            type="range"
            aria-label="Изменить срок"
            min={product.min_term_months}
            max={product.max_term_months}
            step={1}
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>{product.min_term_months} мес.</span>
            <span>{product.max_term_months} мес.</span>
          </div>
          <div className="preset-chips">
            <button onClick={() => preset("payment")}>Меньший платёж</button>
            <button onClick={() => preset("cost")}>Меньше переплата</button>
            <button onClick={() => preset("need")}>Ближе к нужной сумме</button>
          </div>
          <div className="notice">
            <Info size={18} />
            <p>
              Расчёт не меняет заявку. Новое предложение создаётся только по
              вашему действию.
            </p>
          </div>
        </section>
        <div className={"scenario-result " + (stale ? "calculating" : "")}>
          {!valid ? (
            <ErrorBox
              error={new Error("Сумма или срок вне ограничений продукта")}
            />
          ) : simulation.isPending ? (
            <Loading />
          ) : simulation.error ? (
            <ErrorBox error={simulation.error} />
          ) : (
            s && (
              <>
                <section className="panel scenario-financials">
                  <div className="section-heading">
                    <p className="eyebrow">РЕЗУЛЬТАТ СЦЕНАРИЯ</p>
                    <Badge
                      status={
                        s.eligibility === "eligible"
                          ? "offer_issued"
                          : s.eligibility === "ineligible"
                            ? "declined"
                            : "manual_review"
                      }
                    >
                      {outcomeText[s.eligibility] ||
                        outcomeText[s.evaluation.outcome]}
                    </Badge>
                  </div>
                  <div className="scenario-payment">
                    <span>Платёж в месяц</span>
                    <strong>{rub(s.monthly_payment_kopeks, true)}</strong>
                    <small>
                      {product.apr_basis_points / 100}% годовых · без комиссии
                    </small>
                  </div>
                  <div className="offer-metrics">
                    <Metric
                      label="Всего к возврату"
                      value={rub(s.total_cost_kopeks, true)}
                    />
                    <Metric
                      label="Покрытие платежа"
                      value={
                        s.coverage_ratio === null
                          ? "Нет данных"
                          : s.coverage_ratio.toFixed(2) + "×"
                      }
                    />
                  </div>
                  {s.evaluation.triggered_rules.map((r) => (
                    <p className="small reason-inline" key={r.id}>
                      <ShieldCheck size={17} />
                      {r.message}
                    </p>
                  ))}
                  {a.status === "offer_issued" &&
                    s.eligibility === "eligible" && (
                      <Button
                        disabled={busy || stale}
                        onClick={() => requestOffer(params)}
                      >
                        Запросить эти условия
                        <ArrowRight size={17} />
                      </Button>
                    )}
                  {stale && (
                    <span className="small muted" role="status">
                      Обновляем расчёт…
                    </span>
                  )}
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">ДЕНЕЖНЫЙ ГОРИЗОНТ</p>
                      <h2>С кредитом и без</h2>
                    </div>
                    <GitCompareArrows size={20} />
                  </div>
                  <CashflowChart forecast={s.forecast} />
                  <div className="forecast-result">
                    <Metric
                      label="Минимум со сценарием"
                      value={rub(s.forecast.funded_min_balance_kopeks)}
                    />
                    <Metric
                      label="Разрыв со сценарием"
                      value={
                        s.forecast.funded_gap_date
                          ? date(s.forecast.funded_gap_date)
                          : "Не выявлен"
                      }
                    />
                  </div>
                  <details className="assumptions">
                    <summary>Допущения модели</summary>
                    <ul>
                      {s.assumptions.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </details>
                </section>
                {s.alternatives.length > 0 && (
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Допустимые альтернативы</h2>
                      <Sparkles size={20} />
                    </div>
                    {s.alternatives.map((alt, i) => (
                      <div className="alternative-row" key={i}>
                        <div>
                          <strong>
                            {rub(alt.params.amount_kopeks)} /{" "}
                            {alt.params.term_months} мес.
                          </strong>
                          <p>
                            {rub(alt.schedule.monthly_payment_kopeks, true)} в
                            месяц · всего{" "}
                            {rub(alt.schedule.total_payment_kopeks, true)}
                          </p>
                          <small>{alt.reason}</small>
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setAmount(alt.params.amount_kopeks / 100);
                            setTerm(alt.params.term_months);
                          }}
                        >
                          Сравнить
                        </Button>
                      </div>
                    ))}
                  </section>
                )}
                <ScenarioComparison
                  params={params}
                  simulation={s}
                  stale={stale}
                  revision={a.version}
                  saved={savedScenarios}
                  setSaved={setSavedScenarios}
                />
                <section className="panel">
                  <PaymentSchedule schedule={s.evaluation.schedule} />
                </section>
              </>
            )
          )}
        </div>
      </div>
    </>
  );
}
export function Passport({ bank = false }: { bank?: boolean }) {
  const { id = "" } = useParams();
  const app = useApplication(id);
  const [selected, setSelected] = useState("");
  const [replay, setReplay] = useState<{
    match: boolean;
    status: string;
    diff: string[];
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  if (app.isPending) return <Loading />;
  if (app.error) return <ErrorBox error={app.error} />;
  const a = app.data!;
  const d: Decision | undefined =
    a.decisions.find((x) => x.decision_id === selected) || a.decisions.at(-1);
  const base = (bank ? "/bank" : "/app") + "/applications/" + a.id;
  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      setReplay(
        await api(
          "/bank/applications/" + id + "/decision-passport/replay",
          "POST",
          { decision_id: d!.decision_id },
        ),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to={base} className="back-link">
        <ArrowLeft size={15} />К заявке
      </Link>
      <Heading
        eyebrow="DECISION PASSPORT / ПРОВЕРЯЕМОСТЬ"
        title="У каждого решения есть основание"
        action={
          <span className="passport-stamp">
            <ShieldCheck size={20} />
            IMMUTABLE SNAPSHOT
          </span>
        }
      >
        Не чёрный ящик, а сохранённые факты, расчёт и объяснение.
      </Heading>
      {!d ? (
        <Empty title="Решение ещё не сформировано">
          <p>Отправьте заявку на проверку, чтобы увидеть паспорт.</p>
        </Empty>
      ) : (
        <>
          <div className="passport-layout">
            <section className="panel passport-main">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    РЕШЕНИЕ / {d.decision_id.slice(0, 8).toUpperCase()}
                  </p>
                  <h2>{outcomeText[d.result.outcome]}</h2>
                </div>
                <select
                  aria-label="Версия решения"
                  value={d.decision_id}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setReplay(undefined);
                  }}
                >
                  {a.decisions.map((v, i) => (
                    <option value={v.decision_id} key={v.decision_id}>
                      Решение {i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div className="passport-facts">
                <Metric label="Версия правил" value={d.ruleset_version} />
                <Metric label="Версия продукта" value={d.product_version} />
                <Metric
                  label="Снимок заявки"
                  value={"v" + d.application_revision}
                />
              </div>
              <h3>Что повлияло на результат</h3>
              {d.result.triggered_rules.map((r) => (
                <div className="passport-rule" key={r.id}>
                  <span>
                    <Check size={16} />
                  </span>
                  <div>
                    <strong>{r.message}</strong>
                    {bank && (
                      <dl className="rule-details">
                        <div>
                          <dt>Rule ID</dt>
                          <dd>
                            <code>{r.id}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Вход</dt>
                          <dd>{r.input}</dd>
                        </div>
                        <div>
                          <dt>Порог</dt>
                          <dd>{r.threshold}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                </div>
              ))}
              <div className="coverage-row">
                <Metric
                  label="Доступно для нового долга"
                  value={rub(d.result.available_cash_kopeks)}
                />
                <Metric
                  label="Платёж"
                  value={rub(d.result.schedule.monthly_payment_kopeks, true)}
                />
                <Metric
                  label="Покрытие"
                  value={
                    d.result.coverage_ratio === null
                      ? "Нет данных"
                      : d.result.coverage_ratio.toFixed(2) + "×"
                  }
                />
              </div>
              <p className="small muted">
                Демонстрационная риск-категория: {d.result.risk_band}. Это не
                вероятность дефолта и не ML-оценка.
              </p>
              <div className="hash-block">
                <Fingerprint size={20} />
                <div>
                  <span>SHA-256 / КАНОНИЧЕСКИЙ INPUT</span>
                  <code>{d.input_sha256}</code>
                </div>
              </div>
              <p className="small muted">
                Создано {date(d.created_at)} · engine {d.engine_version}
              </p>
              {bank && d.input_snapshot_json && (
                <details className="assumptions">
                  <summary>Исходный snapshot / mock-проверки</summary>
                  <pre>{JSON.stringify(d.input_snapshot_json, null, 2)}</pre>
                </details>
              )}
            </section>
            <aside>
              <section className="panel replay-card">
                <div className="round-icon">
                  <History />
                </div>
                <p className="eyebrow">ВОСПРОИЗВОДИМОСТЬ</p>
                <h2>Решение можно проверить</h2>
                <p>
                  Исходный снимок + исходные правила = воспроизводимый
                  результат. Новые правила не переписывают историю.
                </p>
                {bank ? (
                  <>
                    <Button onClick={run} disabled={busy}>
                      {busy ? "Сравниваем…" : "Воспроизвести решение"}
                      <ArrowRight size={16} />
                    </Button>
                    {error && <ErrorBox error={error} />}
                    <div aria-live="polite">
                      {replay && (
                        <div
                          className={
                            "notice " + (replay.match ? "success" : "error")
                          }
                        >
                          <ShieldCheck size={20} />
                          <div>
                            <strong>
                              {replay.match
                                ? "Результат совпал"
                                : replay.status === "cannot_replay"
                                  ? "Эта версия не поддерживается"
                                  : "Обнаружены различия"}
                            </strong>
                            {replay.diff?.map((s) => (
                              <p key={s}>{s}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="notice">
                    <LockKeyhole size={18} />
                    <p>
                      Банк может повторить расчёт исходной версии. В клиентском
                      объяснении внутренние пороги скрыты.
                    </p>
                  </div>
                )}
              </section>
              <div className="aside-note">
                <ShieldCheck size={18} />
                <p>
                  Решения и журнал доступны только соответствующей компании и
                  уполномоченному банку.
                </p>
              </div>
            </aside>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Аудиторский след</h2>
              <span className="mini-label">{statusText[a.status]}</span>
            </div>
            <ApplicationTimeline events={a.events} />
          </section>
        </>
      )}
    </>
  );
}
