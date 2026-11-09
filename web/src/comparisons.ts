// 2人ずつの思考ステップの対応関係（problems/{problemId}/comparisons/{uidA}_{uidB}）．書くのはサーバー（server/）だけ．
// データ構造は docs/decisions/012-step-alignment.md．alignment の形は shared/schema/step-alignment.schema.json（契約）
import { collection, type Timestamp } from 'firebase/firestore'
import { db } from './firebase.ts'

export type Segment = { type: 'same' | 'split'; a: string[]; b: string[] }
export type StepAlignment = { schemaVersion: '0.1.0'; segments: Segment[] }

// AI の問いかけ．形は shared/schema/step-questions.schema.json（契約）．side の a が uids[0]，b が uids[1]
export type StepQuestion = {
  side: 'a' | 'b'
  stepId: string
  kind: 'branch' | 'missing_why'
  text: string
  by: 'ai' | 'template'
}
export type StepQuestions = { schemaVersion: '0.1.0'; questions: StepQuestion[] }

export type ComparisonDoc = {
  status: 'processing' | 'done' | 'failed'
  uids: [string, string] // segments の a が uids[0]，b が uids[1]．uids[0] < uids[1]
  aPostCreatedAt: Timestamp
  bPostCreatedAt: Timestamp
  alignment: StepAlignment | null
  questions?: StepQuestions | null // #19 より前に作った対応関係には無い
  warnings: string[]
  error: string | null
  model: string
  updatedAt: Timestamp | null
}

export type Comparison = ComparisonDoc & { id: string }

export function comparisonsCollection(problemId: string) {
  return collection(db, 'problems', problemId, 'comparisons')
}

// ドキュメント ID は uid を文字列の順に並べて _ でつないだもの（server/src/index.ts と揃える）
export function pairId(uid1: string, uid2: string): string {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`
}

// 区間の境目の種類．same → split が分岐点，split → same が合流点．先頭が split なら最初から分かれている
export type Boundary = 'start-split' | 'branch' | 'merge' | 'continue' | null

export function boundaryBefore(segments: Segment[], i: number): Boundary {
  const cur = segments[i].type
  if (i === 0) return cur === 'split' ? 'start-split' : null
  const prev = segments[i - 1].type
  if (prev === 'same' && cur === 'split') return 'branch'
  if (prev === 'split' && cur === 'same') return 'merge'
  return 'continue'
}
