import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { byCreatedAt, repliesCollection, type Reply } from './threads.ts'

type Loaded = { key: string; replies: Reply[]; error: Error | null }

// 1つの質問への返信を古い順に読む．replies: undefined = 読み込み中
export function useReplies(problemId: string, threadId: string) {
  const key = `${problemId}/${threadId}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(
    () =>
      onSnapshot(
        repliesCollection(problemId, threadId),
        (snap) =>
          setLoaded({
            key,
            replies: snap.docs.map((d) => ({ ...(d.data() as Omit<Reply, 'id'>), id: d.id })).sort(byCreatedAt),
            error: null,
          }),
        (error) => setLoaded({ key, replies: [], error }),
      ),
    [key, problemId, threadId],
  )

  if (loaded?.key !== key) return { replies: undefined, error: null }
  return { replies: loaded.replies, error: loaded.error }
}
