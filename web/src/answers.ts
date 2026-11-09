// AI の問いかけに本人が書いた理由（problems/{problemId}/comparisons/{pairId}/answers/{side}_{stepId}）．
// データ構造は docs/decisions/issue-20-author-answers.md．書けるのはその side の本人だけ（firebase/firestore.rules）
import { collection, deleteDoc, doc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from './firebase.ts'

// firebase/firestore.rules と揃える
export const answerMaxLength = 1000

export type Side = 'a' | 'b'

export type Answer = {
  uid: string
  side: Side
  stepId: string
  text: string
  updatedAt: Timestamp | null
}

export function answersCollection(problemId: string, pairId: string) {
  return collection(db, 'problems', problemId, 'comparisons', pairId, 'answers')
}

export const answerId = (side: Side, stepId: string) => `${side}_${stepId}`

function answerDoc(problemId: string, pairId: string, side: Side, stepId: string) {
  return doc(answersCollection(problemId, pairId), answerId(side, stepId))
}

export function saveAnswer(problemId: string, pairId: string, uid: string, side: Side, stepId: string, text: string) {
  return setDoc(answerDoc(problemId, pairId, side, stepId), { uid, side, stepId, text, updatedAt: serverTimestamp() })
}

export function deleteAnswer(problemId: string, pairId: string, side: Side, stepId: string) {
  return deleteDoc(answerDoc(problemId, pairId, side, stepId))
}
