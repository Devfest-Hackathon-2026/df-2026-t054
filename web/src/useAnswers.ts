import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { answersCollection, type Answer } from './answers.ts'

type Loaded = { key: string; answers: Answer[]; error: Error | null }

// 2人の組の問いかけへの理由をまとめて読む．全員が提出したあとの参加者だけが読める．answers: undefined = 読み込み中
export function useAnswers(problemId: string, pairId: string) {
  const key = `${problemId}/${pairId}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(
    () =>
      onSnapshot(
        answersCollection(problemId, pairId),
        (snap) => setLoaded({ key, answers: snap.docs.map((d) => d.data() as Answer), error: null }),
        (error) => setLoaded({ key, answers: [], error }),
      ),
    [key, problemId, pairId],
  )

  if (loaded?.key !== key) return { answers: undefined, error: null }
  return { answers: loaded.answers, error: loaded.error }
}
