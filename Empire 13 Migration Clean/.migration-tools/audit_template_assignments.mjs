import fs from "node:fs/promises";
import { Workbook } from "/Users/webstation/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const files = process.argv.slice(2);

for (const fileArg of files) {
  const [file, rangesArg] = fileArg.split("::");
  const csvText = await fs.readFile(file, "utf8");
  const workbook = await Workbook.fromCSV(csvText, { sheetName: "Products" });
  console.log(`FILE\t${file}`);
  const ranges = rangesArg ? rangesArg.split(",") : ["A1:AZ8"];
  for (const range of ranges) {
    const overview = await workbook.inspect({
      kind: "table",
      sheetId: "Products",
      range,
      include: "values",
      tableMaxRows: 30,
      tableMaxCols: 52,
      tableMaxCellChars: 160,
      maxChars: 24000,
    });
    console.log(`RANGE\t${range}`);
    console.log(overview.ndjson);
  }
}
