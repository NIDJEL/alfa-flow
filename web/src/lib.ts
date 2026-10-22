export const rub = (kopeks = 0, decimals = false) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(kopeks / 100);
export const num = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
export const date = (s: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(s));
export const shortDate = (s: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(s));
export const statusText: Record<string, string> = {
  draft: "Черновик",
  submitted: "Отправлена",
  validating: "Проверка данных",
  scoring: "Оценка условий",
  offer_issued: "Есть предложение",
  needs_info: "Нужны сведения",
  manual_review: "Рассмотрение в банке",
  declined: "Не одобрено",
  offer_accepted: "Предложение принято",
  signing_simulated: "Подписание",
  issued: "Выдача смоделирована",
  closed: "Закрыта",
};
export const outcomeText: Record<string, string> = {
  offer: "Предложение",
  counteroffer: "Встречное предложение",
  manual_review: "Ручное рассмотрение",
  needs_info: "Нужны сведения",
  decline: "Отказ по демо-правилам",
  eligible: "Допустимый сценарий",
  ineligible: "Недопустимый сценарий",
};
