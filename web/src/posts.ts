// 投稿（problems/{problemId}/posts/{uid}）とそのファイル（Storage）．データ構造は docs/decisions/008-post-upload.md
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore'
import { ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from './firebase.ts'
import { applyExifOrientation } from './imageOrientation.ts'
import { problemDoc } from './problems.ts'

export type PostKind = 'image' | 'text' | 'video'

export type Post = { createdAt: Timestamp | null } & (
  | { kind: 'image'; imagePaths: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'video'; videoPath: string; durationSec: number }
)

// 上限は firebase/firestore.rules・firebase/storage.rules と揃える
export const imageMaxCount = 5
export const imageMaxBytes = 10 * 1024 * 1024
export const imageTypes = ['image/jpeg', 'image/png', 'image/webp']
export const textMaxLength = 20000
export const videoMaxBytes = 100 * 1024 * 1024
export const videoMaxSec = 60
export const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm']

export function postDoc(problemId: string, uid: string) {
  return doc(db, 'problems', problemId, 'posts', uid)
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`

// 選んだ画像が上限を超えていれば理由を返す
export function checkImages(files: File[]): string | null {
  if (files.length === 0) return '画像を選んでください．'
  if (files.length > imageMaxCount) return `画像は${imageMaxCount}枚までです．`
  for (const f of files) {
    if (!imageTypes.includes(f.type)) return `${f.name}: JPEG・PNG・WebP の画像を選んでください．`
    if (f.size > imageMaxBytes) return `${f.name}: 1枚${mb(imageMaxBytes)}までです．`
  }
  return null
}

export function checkVideoFile(file: File): string | null {
  if (!videoTypes.includes(file.type)) return 'MP4・MOV・WebM の動画を選んでください．'
  if (file.size > videoMaxBytes) return `動画は${mb(videoMaxBytes)}までです（選んだ動画は${mb(file.size)}）．`
  return null
}

// 動画の長さ（秒）をブラウザで読む．Storage のルールでは長さを確かめられないため
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      if (Number.isFinite(video.duration) && video.duration > 0) resolve(video.duration)
      else reject(new Error('動画の長さを読み取れませんでした．別の形式で保存し直してください．'))
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('このブラウザでは動画を読み込めませんでした．MP4 で保存し直してください．'))
    }
    video.src = url
  })
}

// 同じ名前で上書きしないよう，ファイル名は毎回新しく作る（ルールで上書きを許していない）
function newFilePath(problemId: string, uid: string, file: File): string {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : ''
  return `problems/${problemId}/posts/${uid}/${Date.now()}-${crypto.randomUUID()}${ext}`
}

// ファイルを順にアップロードする．onProgress には全体の進み具合（0〜1）を渡す
async function uploadFiles(
  problemId: string,
  uid: string,
  files: File[],
  onProgress: (ratio: number) => void,
): Promise<string[]> {
  const total = files.reduce((sum, f) => sum + f.size, 0) || 1
  let done = 0
  const paths: string[] = []
  for (const file of files) {
    const path = newFilePath(problemId, uid, file)
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type })
    task.on('state_changed', (s) => onProgress((done + s.bytesTransferred) / total))
    await task
    done += file.size
    paths.push(path)
  }
  onProgress(1)
  return paths
}

// 投稿は下書き．書いただけでは提出にならない（docs/decisions/issue-70-confirm-submit.md）．
// 提出していないあいだは何度でも出し直せる（提出したあとはルールで拒否される．取り消してから出し直す）
function writePost(problemId: string, uid: string, data: Record<string, unknown>) {
  return setDoc(postDoc(problemId, uid), { ...data, createdAt: serverTimestamp() })
}

// 「もう一度ステップに分ける」．同じ中身（Storage のファイルもそのまま）で createdAt だけ新しくして書き直すと，
// サーバーがステップ化をやり直す（docs/decisions/issue-73-steps-error-reason.md）．書ける条件は出し直しと同じ
export function retrySteps(problemId: string, uid: string, post: Post) {
  if (post.kind === 'image') return writePost(problemId, uid, { kind: 'image', imagePaths: post.imagePaths })
  if (post.kind === 'text') return writePost(problemId, uid, { kind: 'text', text: post.text })
  return writePost(problemId, uid, { kind: 'video', videoPath: post.videoPath, durationSec: post.durationSec })
}

// 「この内容で提出」．自分の uid を problem の submittedUids に足す．
// ルールが「今の投稿のステップ化が done か」を確かめるので，それより前に押すと拒否される
export function submitPost(problemId: string, uid: string) {
  return updateDoc(problemDoc(problemId), { submittedUids: arrayUnion(uid) })
}

// 提出の取り消し．締め切り（全員の提出）より前だけできる
export function withdrawSubmission(problemId: string, uid: string) {
  return updateDoc(problemDoc(problemId), { submittedUids: arrayRemove(uid) })
}

export async function postImages(problemId: string, uid: string, files: File[], onProgress: (r: number) => void) {
  // 縦に撮った写真は EXIF の向きを画素に反映してから上げる（docs/decisions/issue-49-image-orientation.md）
  // 大きな画像を同時に開いてメモリを使いすぎないよう，1 枚ずつ変換する
  const uprights: File[] = []
  for (const file of files) uprights.push(await applyExifOrientation(file, imageMaxBytes))
  const imagePaths = await uploadFiles(problemId, uid, uprights, onProgress)
  await writePost(problemId, uid, { kind: 'image', imagePaths })
}

export function postText(problemId: string, uid: string, text: string) {
  return writePost(problemId, uid, { kind: 'text', text })
}

export async function postVideo(
  problemId: string,
  uid: string,
  file: File,
  durationSec: number,
  onProgress: (r: number) => void,
) {
  const [videoPath] = await uploadFiles(problemId, uid, [file], onProgress)
  await writePost(problemId, uid, { kind: 'video', videoPath, durationSec })
}
