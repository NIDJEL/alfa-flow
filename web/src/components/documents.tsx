import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Application } from "../types";
import { api } from "../api";
import { ErrorBox } from "./common";
import { Button } from "./ui/button";
export function DocumentUpload({
  application: a,
}: {
  application: Application;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const client = useQueryClient();
  const kind =
    a.params.product_id === "EQUIPMENT_LOAN"
      ? "equipment_invoice"
      : "statement";
  async function upload(file?: File) {
    setError(undefined);
    if (file && file.size > 2 * 1024 * 1024) {
      setError(new Error("Не более 2 МБ"));
      return;
    }
    setBusy(true);
    try {
      let content = "";
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        content = btoa(binary);
      }
      const result = await api<Application>(
        "/applications/" + a.id + "/documents",
        "POST",
        {
          version: a.version,
          kind,
          name: file?.name || "Демо-документ.txt",
          synthetic: !file,
          ...(file ? { content_base64: content } : {}),
        },
      );
      client.setQueryData(["application", a.id], result);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="document-uploader">
      <p className="small muted">
        Только синтетика. Сохраняем проверенные метаданные и hash, не архив
        оригиналов.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => upload()}>
        Прикрепить демо-документ
      </Button>
      <label className="field">
        Или синтетический файл
        <input
          type="file"
          accept=".pdf,.txt,.csv"
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {!!error && <ErrorBox error={error} />}
    </div>
  );
}
