// 思考ステップ（problems/{problemId}/steps/{uid}）．書くのはサーバー（server/）だけ．データ構造は docs/decisions/009-steps-trigger.md
// thoughtSteps の形は shared/schema/thought-steps.schema.json（契約）
import { doc, type Timestamp } from 'firebase/firestore'
import { db } from './firebase.ts'

export type Why = { text: string; by: 'post_quote' | 'author' }
export type StepSource =
  | { kind: 'image'; imageIndex: number; box2d: [number, number, number, number] }
  | { kind: 'text'; lineStart: number; lineEnd: number }
  | { kind: 'video'; startSec: number; endSec: number }
export type Step = { id: string; what: string; why: Why | null; transcript?: string; source: StepSource }
export type ThoughtSteps = { schemaVersion: '0.1.0'; steps: Step[] }

// 式変形を SymPy で確かめた結果（参考）．形は shared/schema/math-checks.schema.json（docs/decisions/issue-22-sympy-check.md）
export type MathCheck = {
  stepId: string
  before: string
  after: string
  result: 'same' | 'not_confirmed' | 'unparsed'
  detail: string | null
}
export type MathChecks = { schemaVersion: '0.1.0'; checks: MathCheck[]; code: string | null }

export type StepsDoc = {
  status: 'processing' | 'done' | 'failed'
  postCreatedAt: Timestamp
  thoughtSteps: ThoughtSteps | null
  warnings: string[]
  error: string | null
  // failed の理由（issue-73）．無いのは #73 より前の失敗
  errorCode?: 'unreadable' | 'temporary' | 'unknown' | null
  model: string
  updatedAt: Timestamp | null
  // 式変形の確認．ステップが done になってから別に作る．無い（#22 より前の投稿）・failed のときは画面に出さない
  mathCheckStatus?: 'processing' | 'done' | 'failed'
  mathChecks?: MathChecks | null
}

export function stepsDoc(problemId: string, uid: string) {
  return doc(db, 'problems', problemId, 'steps', uid)
}
