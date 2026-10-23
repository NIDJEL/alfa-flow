import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
const raw = JSON.parse(
  await readFile("../artifacts/licenses-raw.json", "utf8"),
);
const dependencies = [];
const texts = [];
for (const entries of Object.values(raw))
  for (const item of entries) {
    dependencies.push({
      name: item.name,
      versions: item.versions,
      license: item.license,
      author: item.author || "",
      homepage: item.homepage || "https://www.npmjs.com/package/" + item.name,
    });
    const path = item.paths[0];
    const files = (await readdir(path)).filter((name) =>
      /^(license|licence|copyright|notice)(\.|$)/i.test(name),
    );
    for (const name of files) {
      const text = await readFile(path + "/" + name, "utf8");
      texts.push(
        `\n${"=".repeat(72)}\n${item.name} ${item.versions.join(", ")} — ${name}\n${"=".repeat(72)}\n${text}`,
      );
    }
  }
dependencies.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  "../docs/DEPENDENCY_LICENSES.json",
  JSON.stringify(
    {
      generated: new Date().toISOString().slice(0, 10),
      scope:
        "Все установленные прямые и транзитивные npm runtime/dev dependencies; exact lockfile versions",
      dependencies,
    },
    null,
    2,
  ) + "\n",
);
const goModules = execFileSync("go", ["list", "-m", "-json", "all"], {
  cwd: "../backend",
  encoding: "utf8",
});
const goObjects = goModules
  .trim()
  .split(/\r?\n}\r?\n/)
  .map((part, i, all) =>
    JSON.parse(part + (i === all.length - 1 ? "" : "\n}")),
  );
for (const item of goObjects) {
  if (!item.Dir || item.Main) continue;
  const files = (await readdir(item.Dir)).filter((name) =>
    /^(license|licence|copyright|notice)(\.|$)/i.test(name),
  );
  for (const name of files) {
    texts.push(
      `\n${"=".repeat(72)}\n${item.Path} ${item.Version} — ${name}\n${"=".repeat(72)}\n${await readFile(item.Dir + "/" + name, "utf8")}`,
    );
  }
}
await writeFile("../docs/DEPENDENCY_LICENSE_TEXTS.txt", texts.join("\n"));
console.log(
  `Лицензии: ${dependencies.length} npm пакетов; ${texts.length} copyright/license/notice texts incl Go modules.`,
);
