import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleHelp, X } from "lucide-react";

export function ProductHelp({
  bank,
  onClose,
}: {
  bank: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="help-dialog"
      aria-labelledby="help-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="help-content">
        <div className="section-heading">
          <div className="round-icon">
            <CircleHelp size={22} />
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть помощь"
          >
            <X size={21} />
          </button>
        </div>
        <p className="eyebrow">ВСЁ В ОДНОМ КАБИНЕТЕ</p>
        <h2 id="help-title">Как пройти путь без вопросов</h2>
        <p className="muted">
          Это учебный стенд, не официальный сервис банка. Все данные, условия и
          операции — синтетические.
        </p>
        <ol className="help-steps">
          {(bank
            ? [
                [
                  "Откройте заявку из очереди",
                  "Фильтр и поиск помогут найти компанию. Запросы и ручное рассмотрение требуют внимания.",
                ],
                [
                  "Проверьте факты и причины",
                  "Источники проверок, версия правил и снимок данных доступны в карточке и паспорте решения.",
                ],
                [
                  "Зафиксируйте следующее действие",
                  "Запросите сведения внутри кабинета или примите мотивированное решение. Действия попадут в журнал.",
                ],
              ]
            : [
                [
                  "Выберите цель и параметры",
                  "Сумма и срок сохраняются в черновике. Сведения о компании уже заполнены.",
                ],
                [
                  "Отправьте и следите за статусом",
                  "Проверки и запросы банка появятся в заявке. Уточнение отправляется здесь же, без SMS и звонков.",
                ],
                [
                  "Сравните условия и завершите демо",
                  "What-if не изменяет заявку. Только явный запрос создаст новое предложение. После принятия доступна имитация подписи.",
                ],
              ]
          ).map(([title, description]) => (
            <li key={title}>
              <strong>{title}</strong>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <details className="help-faq">
          <summary>Что означают прогноз и покрытие платежа?</summary>
          <p>
            Прогноз — прозрачная модель по истории операций и будущим
            обязательствам, а не гарантия. Покрытие показывает, во сколько раз
            свободный месячный поток превышает новый платёж. Окончательный
            результат определяется демо-правилами, не одной метрикой.
          </p>
        </details>
        <details className="help-faq">
          <summary>Что здесь реально, а что смоделировано?</summary>
          <p>
            Реальны сохранение данных в PostgreSQL, расчёт платежей, история,
            контроль доступа и переходы заявки. БКИ, KYC, документы, подпись и
            выдача — симуляторы. Денег и обращений во внешние сервисы нет.
          </p>
        </details>
        <Link to="/demo" onClick={onClose} className="text-link help-profiles">
          Выбрать демонстрационный сценарий <ArrowRight size={17} />
        </Link>
      </div>
    </dialog>
  );
}
