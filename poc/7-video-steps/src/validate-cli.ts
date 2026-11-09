// 保存した JSON が契約に合っているか確かめる: npm run validate -- out/xxx.steps.json ...
import { readFileSync } from "node:fs";
import { validateThoughtSteps } from "./contract.ts";

let failed = false;
for (const f of process.argv.slice(2)) {
  const errors = validateThoughtSteps(JSON.parse(readFileSync(f, "utf8")));
  console.log(errors.length ? `NG ${f}\n  ${errors.join("\n  ")}` : `OK ${f}`);
  failed ||= errors.length > 0;
}
process.exit(failed ? 1 : 0);
