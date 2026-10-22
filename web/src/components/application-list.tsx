import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useApplications } from "../api";
import { date, rub } from "../lib";
import { Badge, ErrorBox, Loading } from "./common";
export function ClientApplicationList() {
  const q = useApplications();
  return (
    <section className="panel" style={{ marginTop: 28 }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">ВАШЕ ФИНАНСИРОВАНИЕ / ИСТОРИЯ</p>
          <h2>Все заявки компании</h2>
        </div>
        <span className="count">{q.data?.length || 0}</span>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Создана</th>
                <th>Продукт</th>
                <th>Исходная сумма</th>
                <th>Статус</th>
                <th>Карточка</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((a) => (
                <tr key={a.id}>
                  <td>{date(a.created_at)}</td>
                  <td>
                    {a.params.product_id === "EQUIPMENT_LOAN"
                      ? "Оборудование"
                      : "Оборотный кредит"}
                  </td>
                  <td>{rub(a.params.amount_kopeks)}</td>
                  <td>
                    <Badge status={a.status} />
                  </td>
                  <td>
                    <Link
                      to={"/app/applications/" + a.id}
                      className="queue-action"
                    >
                      Подробнее
                      <ArrowRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
