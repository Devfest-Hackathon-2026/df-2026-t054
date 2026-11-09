// Gemini クライアントを作る．同じコードのまま環境変数で AI Studio と Vertex AI を切り替える．
//   AI Studio: GEMINI_API_KEY
//   Vertex AI: GOOGLE_GENAI_USE_VERTEXAI=true, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION（認証は ADC）
import { GoogleGenAI } from "@google/genai";

// 既定は gemini-3.5-flash: 手書き写真の box2d が flash-lite より正確で，3.8-flash より速い（README「試した結果」）
// gemini-2.5-flash は新規ユーザーに提供終了（2026-11-06 に 404 で確認）
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

export function createClient(): { ai: GoogleGenAI; backend: string } {
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true") {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
    if (!project) {
      throw new Error("Vertex AI を使うには GOOGLE_CLOUD_PROJECT を .env に設定してください");
    }
    return {
      ai: new GoogleGenAI({ vertexai: true, project, location }),
      backend: `vertex-ai (${project} / ${location})`,
    };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY を .env に設定してください（.env.example を参照）");
  }
  return { ai: new GoogleGenAI({ apiKey }), backend: "ai-studio" };
}
