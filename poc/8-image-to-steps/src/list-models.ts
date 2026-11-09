// 使えるモデル名を一覧する（GEMINI_MODEL を選ぶため）
import { createClient } from "./gemini.ts";

const { ai, backend } = createClient();
console.log(`backend: ${backend}`);
const pager = await ai.models.list();
for await (const model of pager) {
  if (model.name?.includes("gemini")) console.log(model.name);
}
