import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCheck2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { api, useCompany, useProducts } from "../api";
import type { Application, Params } from "../types";
import { ErrorBox, Heading, Loading } from "../components/common";
import { Button } from "../components/ui/button";
import { rub } from "../lib";
const schema = z.object({
  amount: z.number().positive("Введите сумму больше нуля"),
  term: z.number().int().positive("Введите срок"),
  consent: z.boolean(),
});
type Values = z.infer<typeof schema>;
export function Wizard() {
  const company = useCompany();
  const products = useProducts();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Application>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount: 1000000, term: 24, consent: false },
  });
  const draftId = search.get("draft");
  const hydratedDraft = useRef("");
  const existing = useQuery({
    queryKey: ["resume-draft", draftId],
    queryFn: () => api<Application>("/applications/" + draftId),
    enabled: !!draftId,
  });
  const reset = form.reset;
  useEffect(() => {
    if (existing.data && hydratedDraft.current !== existing.data.id) {
      hydratedDraft.current = existing.data.id;
      setDraft(existing.data);
      reset({
        amount: existing.data.params.amount_kopeks / 100,
        term: existing.data.params.term_months,
        consent: false,
      });
    }
  }, [existing.data, reset]);
  if (
    company.isPending ||
    products.isPending ||
    (draftId && existing.isPending)
  )
    return <Loading />;
  if (company.error || products.error || existing.error)
    return (
      <ErrorBox error={company.error || products.error || existing.error} />
    );
  if (existing.data && existing.data.status !== "draft") {
    return (
      <div className="panel">
        <h2>Заявка уже отправлена</h2>
        <p>Изменить сохранённый черновик больше нельзя.</p>
        <Button
          onClick={() => navigate("/app/applications/" + existing.data!.id)}
        >
          Открыть актуальную заявку
        </Button>
      </div>
    );
  }
  const c = company.data!;
  const p =
    products.data!.find(
      (p) =>
        p.id === (existing.data?.params.product_id || search.get("product")),
    ) || products.data![0];
  const values = form.watch();
  const params = (): Params => ({
    product_id: p.id,
    purpose: p.purpose,
    amount_kopeks: Math.round(form.getValues("amount") * 100),
    term_months: form.getValues("term"),
    declared_revenue_kopeks: c.declared_revenue_kopeks,
  });
  async function save() {
    if (!(await form.trigger(["amount", "term"]))) return undefined;
    const pr = params();
    if (
      pr.amount_kopeks < p.min_amount_kopeks ||
      pr.amount_kopeks > p.max_amount_kopeks
    ) {
      form.setError("amount", {
        message: `От ${rub(p.min_amount_kopeks)} до ${rub(p.max_amount_kopeks)}`,
      });
      return undefined;
    }
    if (
      pr.term_months < p.min_term_months ||
      pr.term_months > p.max_term_months
    ) {
      form.setError("term", {
        message: `От ${p.min_term_months} до ${p.max_term_months} месяцев`,
      });
      return undefined;
    }
    const result = draft
      ? await api<Application>("/applications/" + draft.id, "PATCH", {
          ...pr,
          version: draft.version,
        })
      : await api<Application>("/applications", "POST", pr);
    setDraft(result);
    await client.invalidateQueries({ queryKey: ["applications"] });
    return result;
  }
  async function next() {
    setError(undefined);
    setBusy(true);
    try {
      const d = await save();
      if (d) {
        navigate(
          `/app/applications/new?draft=${d.id}&product=${d.params.product_id}`,
          { replace: true },
        );
        setStep(step + 1);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveExit() {
    setBusy(true);
    setError(undefined);
    try {
      const d = await save();
      if (d) navigate("/app/applications/" + d.id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function addDocument() {
    if (!draft) return;
    setError(undefined);
    setBusy(true);
    try {
      const d = await api<Application>(
        "/applications/" + draft.id + "/documents",
        "POST",
        {
          version: draft.version,
          kind: p.required_document || "statement",
          name: p.required_document
            ? "Демо-счёт-на-оборудование.txt"
            : "Демо-выписка.txt",
          synthetic: true,
        },
      );
      setDraft(d);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!draft) return;
    if (!form.getValues("consent")) {
      form.setError("consent", { message: "Подтвердите корректность данных" });
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const a = await api<Application>(
        "/applications/" + draft.id + "/submit",
        "POST",
        { version: draft.version, consent: true },
      );
      await client.invalidateQueries({ queryKey: ["applications"] });
      navigate("/app/applications/" + a.id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="ФИНАНСИРОВАНИЕ / НОВАЯ ЗАЯВКА"
        title="От планов — к возможностям"
      >
        Знакомые банку сведения уже заполнены. Осталось самое важное.
      </Heading>
      <div className="wizard-layout">
        <section className="panel wizard">
          <div className="wizard-steps">
            {["Параметры", "Данные и документы", "Проверка"].map((s, i) => (
              <div
                key={s}
                aria-current={step === i ? "step" : undefined}
                className={step === i ? "current" : step > i ? "complete" : ""}
              >
                <span>{step > i ? <Check size={15} /> : i + 1}</span>
                {s}
              </div>
            ))}
          </div>
          {!!error && <ErrorBox error={error} />}
          {step === 0 && (
            <>
              <p className="eyebrow">ШАГ 01 / ВАША ПОТРЕБНОСТЬ</p>
              <h2>Сколько нужно бизнесу?</h2>
              <p className="muted">{p.name} · гипотетические условия</p>
              <label className="field">
                Сумма кредита, ₽
                <input
                  type="number"
                  step="0.01"
                  {...form.register("amount", { valueAsNumber: true })}
                  aria-invalid={!!form.formState.errors.amount}
                />
                <small
                  className={form.formState.errors.amount ? "field-error" : ""}
                >
                  {form.formState.errors.amount?.message ||
                    `${rub(p.min_amount_kopeks)} — ${rub(p.max_amount_kopeks)}`}
                </small>
              </label>
              <label className="field">
                Срок, месяцев
                <input
                  type="number"
                  {...form.register("term", { valueAsNumber: true })}
                  aria-invalid={!!form.formState.errors.term}
                />
                <small
                  className={form.formState.errors.term ? "field-error" : ""}
                >
                  {form.formState.errors.term?.message ||
                    `${p.min_term_months}–${p.max_term_months} месяцев`}
                </small>
              </label>
              <div className="wizard-actions">
                <Button variant="secondary" disabled={busy} onClick={saveExit}>
                  <Save size={17} />
                  Сохранить черновик
                </Button>
                <Button onClick={next} disabled={busy}>
                  Продолжить
                  <ArrowRight size={17} />
                </Button>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <p className="eyebrow">ШАГ 02 / УЖЕ ЗНАКОМЫ</p>
              <h2>Данные вашей компании</h2>
              <dl className="key-values">
                <div>
                  <dt>Компания</dt>
                  <dd>{c.name}</dd>
                </div>
                <div>
                  <dt>Фиктивный идентификатор</dt>
                  <dd>{c.tax_id}</dd>
                </div>
                <div>
                  <dt>Представитель</dt>
                  <dd>{c.contact}</dd>
                </div>
                <div>
                  <dt>Заявленный оборот / месяц</dt>
                  <dd>{rub(c.declared_revenue_kopeks)}</dd>
                </div>
              </dl>
              <div className="document-zone">
                <FileCheck2 size={28} />
                <h3>
                  {p.required_document
                    ? "Счёт на оборудование"
                    : "Выписка по операциям"}
                </h3>
                <p>
                  Для демо используйте явно синтетический документ.
                  <br />
                  Реальные клиентские данные не нужны.
                </p>
                <Button
                  variant="secondary"
                  onClick={addDocument}
                  disabled={busy || (draft?.documents.length || 0) > 0}
                >
                  {draft?.documents.length
                    ? "Демо-документ прикреплён"
                    : "Прикрепить демо-документ"}
                </Button>
              </div>
              <div className="wizard-actions">
                <Button
                  variant="ghost"
                  onClick={() => setStep(0)}
                  disabled={busy}
                >
                  <ArrowLeft size={17} />
                  Назад
                </Button>
                <Button onClick={() => setStep(2)} disabled={busy}>
                  Проверить заявку
                  <ArrowRight size={17} />
                </Button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p className="eyebrow">ШАГ 03 / ВСЁ ПОД КОНТРОЛЕМ</p>
              <h2>Проверьте перед отправкой</h2>
              <dl className="key-values review-values">
                <div>
                  <dt>Компания</dt>
                  <dd>{c.name}</dd>
                </div>
                <div>
                  <dt>Продукт</dt>
                  <dd>{p.name}</dd>
                </div>
                <div>
                  <dt>Сумма</dt>
                  <dd>{rub(Math.round(values.amount * 100))}</dd>
                </div>
                <div>
                  <dt>Срок</dt>
                  <dd>{values.term} месяцев</dd>
                </div>
                <div>
                  <dt>Ставка / комиссия</dt>
                  <dd>{p.apr_basis_points / 100}% годовых / 0 ₽</dd>
                </div>
                <div>
                  <dt>Документы</dt>
                  <dd>{draft?.documents.length || 0} прикреплено</dd>
                </div>
              </dl>
              <div className="notice">
                <ShieldCheck size={20} />
                <p>
                  Это заявка в учебный конвейер, а не реальная банковская
                  оферта. Данные и проверки — синтетические.
                </p>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" {...form.register("consent")} />
                Подтверждаю корректность демо-данных и отправку на проверку
              </label>
              {form.formState.errors.consent && (
                <p role="alert" className="field-error">
                  {form.formState.errors.consent.message}
                </p>
              )}
              <div className="wizard-actions">
                <Button
                  variant="ghost"
                  onClick={() => setStep(1)}
                  disabled={busy}
                >
                  <ArrowLeft size={17} />
                  Назад
                </Button>
                <Button onClick={submit} disabled={busy}>
                  {busy ? "Отправляем…" : "Отправить заявку"}
                  <ArrowRight size={17} />
                </Button>
              </div>
            </>
          )}
        </section>
        <aside className="wizard-context">
          <p className="eyebrow">ВАШ ПРОДУКТ</p>
          <h2>{p.name}</h2>
          <strong className="product-rate">
            {p.apr_basis_points / 100}
            <span>% годовых</span>
          </strong>
          <p>
            Аннуитетный платёж.
            <br />
            Без скрытых комиссий.
            <br />
            Все расчёты — на сервере.
          </p>
          <hr />
          <h3>Что дальше?</h3>
          <ol className="next-steps">
            <li>Проверим полноту данных</li>
            <li>Рассчитаем допустимые условия</li>
            <li>Покажем предложение или следующий шаг</li>
          </ol>
          <small className="muted">
            Время обработки не гарантируется. Учебный сценарий выполняется
            локально.
          </small>
        </aside>
      </div>
    </>
  );
}
