import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { ErrorBox } from "./common";
export function CashflowImport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState("");
  const client = useQueryClient();
  async function upload(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setResult("");
    if (file.size > 1024 * 1024) {
      setError(new Error("CSV не должен превышать 1 МБ"));
      return;
    }
    setBusy(true);
    try {
      const data = await api<{
        imported_count: number;
        duplicate_count: number;
      }>("/companies/me/cashflow/import", "POST", { csv: await file.text() });
      setResult(
        `Добавлено: ${data.imported_count}; повторов пропущено: ${data.duplicate_count}. Исторические решения не изменены.`,
      );
      await client.invalidateQueries({ queryKey: ["cashflow"] });
      await client.invalidateQueries({ queryKey: ["forecast"] });
      await client.invalidateQueries({ queryKey: ["company"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">P1 / ПРОЗРАЧНЫЕ ДАННЫЕ</p>
          <h2>Дополните финансовую историю</h2>
        </div>
        <FileUp size={21} />
      </div>
      <p className="small muted">
        Только синтетический CSV, UTF-8, до 1 МБ / 1000 строк. Рубли с точкой,
        RUB, credit/debit. Импорт добавляет операции, но не переписывает снимки
        решений.
      </p>
      <details className="assumptions">
        <summary>Формат и ограничения CSV</summary>
        <code>date,amount,currency,direction,category,description</code>
        <p>
          Дата до 01.10.2026 (полные месяцы истории). Категории: sales,
          operations, rent, payroll, debt, internal_transfer, one_off, refund.
          Дубликаты одной компании пропускаются.
        </p>
        <a className="text-link" href="/demo-cashflow.csv" download>
          Скачать синтетический шаблон
        </a>
      </details>
      <label className="field">
        Импортировать CSV
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {busy && (
        <p role="status" className="small muted">
          Проверяем и сохраняем операции…
        </p>
      )}
      {!!error && <ErrorBox error={error} />}
      <div aria-live="polite">
        {result && (
          <div className="notice success">
            <ShieldCheck size={18} />
            <p>{result}</p>
          </div>
        )}
      </div>
    </section>
  );
}
