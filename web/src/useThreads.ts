import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { byCreatedAt, threadsCollection, type Thread } from './threads.ts'

type Loaded = { key: string; threads: Thread[]; error: Error | null }

// 1人の投稿のステップに付いた質問を，古い順に読む．threads: undefined = 読み込み中．
// 並べ替えは画面でする（where と orderBy を別の項目にすると複合インデックスが要るため）
export function useThreads(problemId: string, stepOwnerUid: string) {
  const key = `${problemId}/${stepOwnerUid}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(
    () =>
      onSnapshot(
        query(threadsCollection(problemId), where('stepOwnerUid', '==', stepOwnerUid)),
        (snap) =>
          setLoaded({
            key,
            threads: snap.docs.map((d) => ({ ...(d.data() as Omit<Thread, 'id'>), id: d.id })).sort(byCreatedAt),
            error: null,
          }),
        (error) => setLoaded({ key, threads: [], error }),
      ),
    [key, problemId, stepOwnerUid],
  )

  if (loaded?.key !== key) return { threads: undefined, error: null }
  return { threads: loaded.threads, error: loaded.error }
}
