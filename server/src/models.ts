// 使う Gemini のモデル名を環境変数から決める（issue-50-model-per-kind.md）．
// ステップ化だけ投稿の種類ごとに変えられる．対応関係・問いかけ・式変形の確認はテキストだけなので GEMINI_MODEL を使う
import type { Post } from './steps.ts'

type Env = Record<string, string | undefined>

/** GEMINI_MODEL が空のときのモデル（PoC #7 の申し送り） */
export const DEFAULT_MODEL = 'gemini-3.1-flash-lite'

/** ステップ化の既定．画像は flash-lite だと手書きの枠が半行〜1 行ずれるので上げる（issue-9-poc-comparison.md） */
const DEFAULT_STEPS_MODEL: Record<Post['kind'], string> = {
  image: 'gemini-3.8-flash',
  video: DEFAULT_MODEL,
  text: DEFAULT_MODEL,
}

const STEPS_MODEL_ENV: Record<Post['kind'], string> = {
  image: 'GEMINI_MODEL_IMAGE',
  video: 'GEMINI_MODEL_VIDEO',
  text: 'GEMINI_MODEL_TEXT',
}

/** ステップ化以外（テキストだけを渡す呼び出し）のモデル */
export const baseModel = (env: Env = process.env) => env.GEMINI_MODEL || DEFAULT_MODEL

/** ステップ化のモデル．GEMINI_MODEL_<種類> → GEMINI_MODEL → 種類ごとの既定 の順に，空でない最初の値 */
export const stepsModel = (kind: Post['kind'], env: Env = process.env) =>
  env[STEPS_MODEL_ENV[kind]] || env.GEMINI_MODEL || DEFAULT_STEPS_MODEL[kind]
