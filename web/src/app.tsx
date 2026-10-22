import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowRight,
  Building2,
  ChevronDown,
  CircleHelp,
  Command,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { api, APIError, setCSRF } from "./api";
import type { Actor } from "./types";
import { ErrorBox, Loading } from "./components/common";
import { Button } from "./components/ui/button";
import { SessionContext, useSession } from "./session";
import { Dashboard, Financing, Insights } from "./pages/overview";
import { Wizard } from "./pages/wizard";
import { ApplicationDetail, Passport, WhatIf } from "./pages/application";
import { BankQueue } from "./pages/bank";
type Session = { actor: Actor; csrf_token: string };
export function App() {
  const location = useLocation();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/me"),
    retry: false,
    enabled: location.pathname !== "/demo",
  });
  useEffect(() => {
    if (query.data) setCSRF(query.data.csrf_token);
  }, [query.data]);
  return (
    <Routes>
      <Route path="/demo" element={<Demo />} />
      <Route
        element={
          query.isPending ? (
            <Loading />
          ) : query.data ? (
            <SessionContext.Provider
              value={{
                actor: query.data.actor,
                refresh: async () => {
                  await query.refetch();
                },
              }}
            >
              <Shell />
            </SessionContext.Provider>
          ) : query.error instanceof APIError && query.error.status === 401 ? (
            <Navigate to="/demo" replace />
          ) : (
            <main className="standalone">
              <ErrorBox error={query.error} />
              <Link to="/demo">Выбрать профиль</Link>
            </main>
          )
        }
      >
        <Route
          path="/app"
          element={
            <ClientOnly>
              <Dashboard />
            </ClientOnly>
          }
        />
        <Route
          path="/app/financing"
          element={
            <ClientOnly>
              <Financing />
            </ClientOnly>
          }
        />
        <Route
          path="/app/applications/new"
          element={
            <ClientOnly>
              <Wizard />
            </ClientOnly>
          }
        />
        <Route
          path="/app/applications/:id"
          element={
            <ClientOnly>
              <ApplicationDetail />
            </ClientOnly>
          }
        />
        <Route
          path="/app/applications/:id/what-if"
          element={
            <ClientOnly>
              <WhatIf />
            </ClientOnly>
          }
        />
        <Route
          path="/app/applications/:id/passport"
          element={
            <ClientOnly>
              <Passport />
            </ClientOnly>
          }
        />
        <Route
          path="/app/insights"
          element={
            <ClientOnly>
              <Insights />
            </ClientOnly>
          }
        />
        <Route
          path="/bank"
          element={
            <BankOnly>
              <BankQueue />
            </BankOnly>
          }
        />
        <Route
          path="/bank/applications/:id"
          element={
            <BankOnly>
              <ApplicationDetail bank />
            </BankOnly>
          }
        />
        <Route
          path="/bank/applications/:id/passport"
          element={
            <BankOnly>
              <Passport bank />
            </BankOnly>
          }
        />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/demo" replace />} />
      </Route>
    </Routes>
  );
}
function ClientOnly({ children }: { children: React.ReactNode }) {
  return useSession().actor.role === "client" ? (
    children
  ) : (
    <Navigate to="/demo" />
  );
}
function BankOnly({ children }: { children: React.ReactNode }) {
  return useSession().actor.role === "bank_analyst" ? (
    children
  ) : (
    <Navigate to="/demo" />
  );
}
function Shell() {
  const { actor } = useSession();
  const [open, setOpen] = useState(false);
  const bank = actor.role === "bank_analyst";
  return (
    <div className={"app-shell " + (open ? "nav-open" : "")}>
      <aside className="sidebar">
        <Link to={bank ? "/bank" : "/app"} className="brand">
          <span className="brand-symbol">А</span>
          <span>
            ALFA<span className="brand-flow">FLOW</span>
          </span>
        </Link>
        <div className="workspace-label">БИЗНЕС. В ДВИЖЕНИИ.</div>
        <Link
          to="/demo"
          className="company-switch"
          title="Сменить демонстрационную компанию или роль"
        >
          <div className="company-monogram">
            {bank ? <ShieldCheck size={20} /> : <Building2 size={20} />}
          </div>
          <div>
            <strong>
              {bank
                ? "Кредитный конвейер"
                : actor.persona === "A_APPROVED"
                  ? "Северный Кофе"
                  : "Демо-компания"}
            </strong>
            <small>{bank ? "Рабочее место банка" : "Бизнес-кабинет"}</small>
          </div>
          <ChevronDown size={14} />
        </Link>
        <nav aria-label="Основная навигация" onClick={() => setOpen(false)}>
          {bank ? (
            <>
              <NavLink to="/bank" end>
                <LayoutDashboard /> Очередь заявок
              </NavLink>
              <Link to="/demo">
                <ArrowDownUp /> Сменить роль
              </Link>
            </>
          ) : actor.role === "client" ? (
            <>
              <NavLink to="/app" end>
                <LayoutDashboard />
                Обзор бизнеса
              </NavLink>
              <NavLink to="/app/financing">
                <WalletCards />
                Финансирование
              </NavLink>
              <NavLink to="/app/insights">
                <Sparkles />
                Финансовый двойник<span className="nav-new">NEW</span>
              </NavLink>
            </>
          ) : (
            <NavLink to="/admin">
              <FlaskConical />
              Демо-стенд
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <strong>
              Решения, которым
              <br />
              есть объяснение
            </strong>
            <p>
              Прозрачные условия.
              <br />
              Контроль на каждом этапе.
            </p>
          </div>
          <Link to="/demo" className="switch-role">
            <LogOut size={17} /> Сменить демо-профиль
          </Link>
          <span className="sidebar-version">ALFA HACK / 2026</span>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setOpen(!open)}
            >
              <PanelLeftClose />
            </button>
            <span>Кабинет {bank ? "банка" : "предпринимателя"}</span>
            <span className="topbar-divider" />
            <span className="demo-tag">
              <i />
              Демо · синтетические данные
            </span>
          </div>
          <div className="topbar-right">
            <Link to="/demo" className="help-link" title="Выбор демо-профиля">
              <CircleHelp size={19} />
            </Link>
            <div className="avatar">{bank ? "БА" : "СК"}</div>
            <div className="profile">
              <strong>{bank ? "Банковский аналитик" : actor.name}</strong>
              <small>{actor.persona}</small>
            </div>
          </div>
        </header>
        <main id="main" className="page-content">
          <Outlet />
        </main>
        <footer className="footer">
          <span>
            Демонстрационный прототип. Не официальный продукт Альфа-Банка.
          </span>
          <span>Сделано для бизнеса. Проверяемо для банка.</span>
        </footer>
      </div>
    </div>
  );
}
export function Demo() {
  const query = useQuery({
    queryKey: ["personas"],
    queryFn: () =>
      api<{ persona: string; name: string; role: string }[]>("/demo/personas"),
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>();
  const client = useQueryClient();
  const navigate = useNavigate();
  async function login(persona: string) {
    setBusy(persona);
    setError(undefined);
    try {
      const session = await api<Session>("/demo/session", "POST", { persona });
      setCSRF(session.csrf_token);
      await client.cancelQueries({
        predicate: (q) => q.queryKey[0] !== "session",
      });
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      client.setQueryData(["session"], session);
      navigate(
        session.actor.role === "bank_analyst"
          ? "/bank"
          : session.actor.role === "demo_admin"
            ? "/admin"
            : "/app",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  const descriptions: Record<string, string> = {
    A_APPROVED: "Стабильный поток → предложение → выдача",
    B_COUNTEROFFER: "Высокая сумма → допустимая альтернатива",
    C_NEEDS_INFO: "Расхождение оборота → запрос уточнения",
    D_DECLINED: "Юридический hard-stop → объяснимый отказ",
    E_MANUAL_REVIEW: "БКИ недоступна → решение специалиста",
    F_INSUFFICIENT_HISTORY: "Короткая история → честный запрос данных",
  };
  return (
    <main className="demo-page">
      <div className="demo-intro">
        <div className="brand">
          <span className="brand-symbol">А</span>
          <span>
            ALFA<span className="brand-flow">FLOW</span>
          </span>
        </div>
        <span className="demo-tag">
          <i />
          ALFA HACK 2026 / ДЕМОНСТРАЦИЯ
        </span>
        <h1>
          Бизнес движется.
          <br />
          <span>
            Финансирование —<br />в его ритме.
          </span>
        </h1>
        <p>
          От потребности в деньгах до объяснимого решения и управляемой выдачи.
          В одном кабинете.
        </p>
        <div className="intro-principles">
          <span>
            <ShieldCheck /> Проверяемые решения
          </span>
          <span>
            <Command /> Без платных API
          </span>
        </div>
        <small>
          Учебный прототип. Только синтетические данные.
          <br />
          Реальные деньги не переводятся.
        </small>
      </div>
      <section className="demo-roles">
        <p className="eyebrow">НАЧНИТЕ ЗДЕСЬ</p>
        <h2>Выберите свою роль</h2>
        <p className="muted">Без регистрации, SMS и внешних сервисов.</p>
        {!!error && <ErrorBox error={error} />}
        <div className="persona-list">
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorBox error={query.error} />
          ) : (
            query.data?.slice(0, 6).map((p, i) => (
              <button
                key={p.persona}
                onClick={() => login(p.persona)}
                disabled={!!busy}
                className="persona-card"
              >
                <span className="persona-number">0{i + 1}</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{descriptions[p.persona]}</small>
                </span>
                {busy === p.persona ? (
                  <span className="spin">◌</span>
                ) : (
                  <ArrowRight size={18} />
                )}
              </button>
            ))
          )}
        </div>
        <div className="demo-other">
          <Button
            variant="secondary"
            onClick={() => login("BANK")}
            disabled={!!busy}
          >
            <ShieldCheck size={18} />
            Войти как аналитик банка
            <ArrowRight size={17} />
          </Button>
          <button
            className="text-button muted"
            onClick={() => login("ADMIN")}
            disabled={!!busy}
          >
            Управление демо-стендом
          </button>
        </div>
      </section>
    </main>
  );
}
function Admin() {
  const { actor } = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (actor.role !== "demo_admin") return <Navigate to="/demo" />;
  async function reset() {
    setBusy(true);
    try {
      await api("/demo/reset", "POST", { confirm: "RESET_SYNTHETIC_DATA" });
      client.clear();
      navigate("/demo");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel narrow">
      <p className="eyebrow">ТОЛЬКО СИНТЕТИКА</p>
      <h1>Управление демо</h1>
      <p>
        Сброс удалит только учебные заявки, сеансы, события и решения. Будет
        создано 20 профилей с seed=2026.
      </p>
      {!!error && <ErrorBox error={error} />}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        Я понимаю, что текущие демонстрационные заявки будут удалены
      </label>
      <Button variant="danger" disabled={!confirm || busy} onClick={reset}>
        Сбросить синтетические данные
      </Button>
    </section>
  );
}
