// ステップへの質問のスレッド（problems/{problemId}/threads/{threadId}）と返信（その下の replies/{replyId}）．
// データ構造は docs/decisions/issue-21-step-threads.md．読み書きできるのは全員が提出したあとの参加者だけ（firebase/firestore.rules）
import { addDoc, collection, deleteDoc, doc, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from './firebase.ts'

// firebase/firestore.rules と揃える
export const threadTextMaxLength = 1000

export type Thread = {
  id: string
  uid: string
  stepOwnerUid: string
  stepId: string
  text: string
  createdAt: Timestamp | null
}

export type Reply = { id: string; uid: string; text: string; createdAt: Timestamp | null }

// スレッドを見る人．名前は保存していないので，ほかの画面と同じく「参加者N」（参加順）で出す
export type ThreadViewer = { uid: string; memberUids: string[] }

export const memberLabel = (viewer: ThreadViewer, uid: string) =>
  `参加者${viewer.memberUids.indexOf(uid) + 1}${uid === viewer.uid ? '（あなた）' : ''}`

export function threadsCollection(problemId: string) {
  return collection(db, 'problems', problemId, 'threads')
}

export function repliesCollection(problemId: string, threadId: string) {
  return collection(db, 'problems', problemId, 'threads', threadId, 'replies')
}

export function addThread(problemId: string, uid: string, stepOwnerUid: string, stepId: string, text: string) {
  return addDoc(threadsCollection(problemId), { uid, stepOwnerUid, stepId, text, createdAt: serverTimestamp() })
}

export function deleteThread(problemId: string, threadId: string) {
  return deleteDoc(doc(threadsCollection(problemId), threadId))
}

export function addReply(problemId: string, threadId: string, uid: string, text: string) {
  return addDoc(repliesCollection(problemId, threadId), { uid, text, createdAt: serverTimestamp() })
}

export function deleteReply(problemId: string, threadId: string, replyId: string) {
  return deleteDoc(doc(repliesCollection(problemId, threadId), replyId))
}

// 書いた直後（サーバーの時刻が決まる前）は createdAt が null なので，いちばん新しいものとして後ろに並べる
export const byCreatedAt = (x: { createdAt: Timestamp | null }, y: { createdAt: Timestamp | null }) =>
  (x.createdAt?.toMillis() ?? Infinity) - (y.createdAt?.toMillis() ?? Infinity)
