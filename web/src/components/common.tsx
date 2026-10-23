import { AlertCircle, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { AppEvent, Forecast, Schedule } from "../types";
import { date, rub, shortDate, statusText } from "../lib";
import { Button } from "./ui/button";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Загружаем данные кабинета…
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={20} />
      <div>
        {error instanceof Error ? error.message : "Не удалось загрузить данные"}
      </div>
    </div>
  );
}
export function Badge({
  status,
  children,
}: {
  status: string;
  children?: ReactNode;
}) {
  return (
    <span className={"badge " + status}>
      {children || statusText[status] || status}
    </span>
  );
}
export function Heading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <p className="lead">{children}</p>}
      </div>
      {action}
    </header>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Check />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function ApplicationTimeline({ events }: { events: AppEvent[] }) {
  return (
    <ol className="timeline">
      {[...events].reverse().map((e) => (
        <li key={e.id}>
          <div className="timeline-dot" />
          <div>
            <strong>{e.note}</strong>
            <p>
              {date(e.at)} ·{" "}
              {e.actor === "system"
                ? "Система"
                : e.actor === "client"
                  ? "Клиент"
                  : "Участник процесса"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function CashflowChart({ forecast }: { forecast: Forecast }) {
  if (!forecast.sufficient_history)
    return (
      <Empty title="Недостаточно финансовой истории">
        <p>
          Нужно не менее трёх полных месяцев. Мы не строим прогноз с выдуманной
          точностью.
        </p>
      </Empty>
    );
  const hasScenario = forecast.points.some(
    (p) => p.baseline_kopeks !== p.funded_kopeks,
  );
  return (
    <div
      className="chart-wrap"
      role="img"
      aria-label="Прогноз остатка денег, без кредита и со сценарием, в рублях"
    >
      <div className="chart-legend">
        <span>
          <i className="legend-baseline" />
          Без кредита
        </span>
        {hasScenario && (
          <span>
            <i className="legend-funded" />
            Со сценарием
          </span>
        )}
        <span className="muted">Демо · ₽</span>
      </div>
      {forecast.cash_gap_date && (
        <div className="chart-alert" role="note">
          <span className="chart-alert-marker" aria-hidden="true" />
          <span>
            Возможный разрыв{" "}
            <strong>{shortDate(forecast.cash_gap_date)}</strong>
          </span>
        </div>
      )}
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={forecast.points}
            margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              minTickGap={50}
              axisLine={false}
              tickLine={false}
              fontSize={11}
            />
            <YAxis
              width={80}
              tickFormatter={(v) =>
                `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(v) / 100000000)} млн`
              }
              axisLine={false}
              tickLine={false}
              fontSize={11}
            />
            <Tooltip
              labelFormatter={(v) => shortDate(String(v))}
              formatter={(value) => rub(Number(value))}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            />
            <ReferenceLine
              y={0}
              stroke="var(--text-secondary)"
              strokeDasharray="4 4"
            />
            {forecast.cash_gap_date && (
              <ReferenceLine
                x={forecast.cash_gap_date}
                stroke="var(--accent-action)"
                strokeDasharray="3 3"
              />
            )}
            <Line
              isAnimationActive={false}
              dataKey="baseline_kopeks"
              name="Без кредита"
              stroke="var(--text-secondary)"
              strokeWidth={2}
              dot={false}
            />
            {hasScenario && (
              <Line
                isAnimationActive={false}
                dataKey="funded_kopeks"
                name="Со сценарием"
                stroke="var(--positive)"
                strokeWidth={2.5}
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
export function PaymentSchedule({ schedule }: { schedule: Schedule }) {
  return (
    <details className="schedule">
      <summary>График платежей · {schedule.payments.length} месяцев</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Платёж</th>
              <th>Основной долг</th>
              <th>Проценты</th>
              <th>Остаток</th>
            </tr>
          </thead>
          <tbody>
            {schedule.payments.map((p) => (
              <tr key={p.month}>
                <td>{p.month}</td>
                <td>{rub(p.payment_kopeks, true)}</td>
                <td>{rub(p.principal_kopeks, true)}</td>
                <td>{rub(p.interest_kopeks, true)}</td>
                <td>{rub(p.balance_kopeks, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export function LinkButton({
  to,
  children,
  secondary = false,
}: {
  to: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Button variant={secondary ? "secondary" : "default"} asChild>
      <Link to={to}>
        {children}
        <ArrowRight size={17} />
      </Link>
    </Button>
  );
}
