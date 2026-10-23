import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Eye, EyeOff, Wallet } from "lucide-react";
import { rub } from "../lib";

export function AccountBalance({ balance }: { balance: number }) {
  const [hidden, setHidden] = useState(false);

  return (
    <section className="balance-card" aria-labelledby="balance-title">
      <div className="balance-card-head">
        <span className="balance-card-icon" aria-hidden="true">
          <Wallet size={21} strokeWidth={1.7} />
        </span>
        <span className="balance-card-kicker">ФИНАНСЫ КОМПАНИИ</span>
        <span className="balance-demo">Демо-счёт</span>
      </div>
      <div className="balance-card-main">
        <h2 id="balance-title">Доступно на счетах</h2>
        <div className="balance-value-row">
          <div
            className="balance-number"
            id="account-balance"
            aria-live="polite"
          >
            {hidden ? (
              <span className="balance-masked">
                <span className="sr-only">Баланс скрыт</span>
                <span aria-hidden="true">••• ••• ₽</span>
              </span>
            ) : (
              rub(balance)
            )}
          </div>
          <button
            type="button"
            className="balance-visibility icon-button"
            aria-label={hidden ? "Показать баланс" : "Скрыть баланс"}
            aria-pressed={hidden}
            aria-controls="account-balance"
            onClick={() => setHidden((value) => !value)}
          >
            {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
        <p className="balance-status">
          <span aria-hidden="true" />
          Синтетический баланс · реальные деньги не используются
        </p>
      </div>
      <div className="balance-card-footer">
        <span className="balance-account">
          Расчётный счёт <span>· ₽</span>
        </span>
        <Link to="/app/insights" className="balance-insight-link">
          Движение денег <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
