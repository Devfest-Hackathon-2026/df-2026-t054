import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { postDoc, type Post } from './posts.ts'

type Loaded = { key: string; post: Post | null; error: Error | null }

// post: undefined = 読み込み中，null = まだ投稿していない
export function usePost(problemId: string, uid: string) {
  const key = `${problemId}/${uid}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(
    () =>
      onSnapshot(
        postDoc(problemId, uid),
        (snap) => setLoaded({ key, post: snap.exists() ? (snap.data() as Post) : null, error: null }),
        (error) => setLoaded({ key, post: null, error }),
      ),
    [key, problemId, uid],
  )

  if (loaded?.key !== key) return { post: undefined, error: null }
  return { post: loaded.post, error: loaded.error }
}
