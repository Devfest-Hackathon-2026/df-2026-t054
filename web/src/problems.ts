// 問題（problems コレクション）の読み書き．データ構造は docs/decisions/007-problem-firestore-invite.md
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase.ts'

export type Problem = {
  id: string
  title: string
  body: string
  ownerUid: string
  memberUids: string[]
  submittedUids: string[]
  // 作成直後のローカルの書き込みでは，サーバーの時刻が決まるまで null
  createdAt: Timestamp | null
}

export const problemTitleMax = 100
export const problemBodyMax = 5000

export const problemsCollection = collection(db, 'problems')

export async function createProblem(uid: string, title: string, body: string): Promise<string> {
  const ref = await addDoc(problemsCollection, {
    title,
    body,
    ownerUid: uid,
    memberUids: [uid],
    submittedUids: [],
    createdAt: serverTimestamp(),
  })
  return ref.id
}

// 参加者全員が提出したか（firebase/firestore.rules の allSubmitted と揃える）．
// そろうと他の人の投稿が読めるようになり，参加・出し直しは締め切られる
export function isAllSubmitted(problem: Problem): boolean {
  return problem.memberUids.length >= 2 && problem.submittedUids.length === problem.memberUids.length
}

export function problemDoc(problemId: string) {
  return doc(db, 'problems', problemId)
}

export function joinProblem(problemId: string, uid: string): Promise<void> {
  return updateDoc(problemDoc(problemId), { memberUids: arrayUnion(uid) })
}

// 削除できるのは，作った人が，まだ自分しか参加していないときだけ（firebase/firestore.rules と揃える）．
// ほかの人が参加したあとは，その人の解法まで消えてしまうので消せない（docs/decisions/issue-72-delete-problem.md）
export function canDeleteProblem(problem: Problem, uid: string): boolean {
  return problem.ownerUid === uid && problem.memberUids.length === 1 && problem.memberUids[0] === uid
}

// 問題のドキュメントだけを消す．投稿・ステップ・Storage のファイルはサーバー（server/ の deleteProblemData）が消す．
// deleteDoc だとサーバーが拒否する前に画面から問題が消えてしまうので，サーバーで確定してから反映されるトランザクションで消す
export function deleteProblem(problemId: string, uid: string): Promise<void> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(problemDoc(problemId))
    if (!snap.exists()) throw new Error('問題が見つかりません')
    if (!canDeleteProblem({ id: snap.id, ...snap.data() } as Problem, uid)) {
      throw new Error('ほかの人が参加したので削除できません')
    }
    tx.delete(problemDoc(problemId))
  })
}

export function problemPath(problemId: string): string {
  return `/problems/${problemId}`
}

export function inviteUrl(problemId: string): string {
  return `${location.origin}${problemPath(problemId)}/join`
}
