import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { problemsCollection, type Problem } from './problems.ts'

type Loaded = { uid: string; problems: Problem[] | undefined; error: Error | null }

// 作成直後でサーバーの時刻がまだ無いものは一番新しいとみなす
const pendingMillis = Number.MAX_SAFE_INTEGER

// 自分が参加している問題（新しい順）．problems: undefined = 読み込み中
export function useMyProblems(uid: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    const q = query(problemsCollection, where('memberUids', 'array-contains', uid))
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Problem)
        // 複合インデックスを作らないよう，並べ替えは画面側でする
        list.sort((a, b) => (b.createdAt?.toMillis() ?? pendingMillis) - (a.createdAt?.toMillis() ?? pendingMillis))
        setLoaded({ uid, problems: list, error: null })
      },
      (error) => setLoaded({ uid, problems: undefined, error }),
    )
  }, [uid])

  // ユーザーが替わった直後は，前のユーザーの一覧を見せずに読み込み中にする
  if (loaded?.uid !== uid) return { problems: undefined, error: null }
  return { problems: loaded.problems, error: loaded.error }
}
