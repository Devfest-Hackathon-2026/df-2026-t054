import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase.ts'
import { isAllSubmitted, type Problem } from './problems.ts'

// confirmed: サーバーで確定した最新の状態（自分の書き込みがまだ届いていないローカルの状態は入れない）
type Loaded = { problemId: string; problem: Problem | null; confirmed: Problem | null; error: Error | null }

// problem: undefined = 読み込み中，null = 存在しない．
// closed: 締め切られたか．サーバーで確定した状態で決める．最後の1人が提出した直後，ローカルの書き込みだけで
// 締め切りと見なすと，サーバーはまだ締め切っていないので締め切り後の読み込みがルールに拒否される
// （docs/decisions/issue-78-wait-confirmed-close.md）
export function useProblem(problemId: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'problems', problemId),
        // 書き込みが確定したとき（hasPendingWrites が false に戻ったとき）にも通知してもらう
        { includeMetadataChanges: true },
        (snap) => {
          const problem = snap.exists() ? ({ id: snap.id, ...snap.data() } as Problem) : null
          setLoaded((prev) => ({
            problemId,
            problem,
            confirmed: !snap.metadata.hasPendingWrites
              ? problem
              : prev?.problemId === problemId
                ? prev.confirmed
                : null,
            error: null,
          }))
        },
        (error) => setLoaded({ problemId, problem: null, confirmed: null, error }),
      ),
    [problemId],
  )

  // 別の問題に切り替えた直後は，前の問題の結果を見せずに読み込み中にする
  if (loaded?.problemId !== problemId) return { problem: undefined, closed: false, error: null }
  return {
    problem: loaded.problem,
    closed: !!loaded.confirmed && isAllSubmitted(loaded.confirmed),
    error: loaded.error,
  }
}
