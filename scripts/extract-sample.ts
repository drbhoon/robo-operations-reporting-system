import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseGirWorkbook } from "../src/lib/reporting/excel-parser";

const workbookPath =
  process.argv[2] ?? "C:/Users/KSBHOON/Downloads/Gir plant May daily reports 2026.xlsx";

const input = await import("node:fs/promises").then((fs) => fs.readFile(workbookPath));
const snapshot = await parseGirWorkbook(input, path.basename(workbookPath));
const outputDir = path.join(process.cwd(), "data");
await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "sample-gir-may2026-snapshot.json"),
  JSON.stringify(snapshot, null, 2),
);

console.log(`Wrote ${snapshot.daily.length} daily rows to data/sample-gir-may2026-snapshot.json`);
