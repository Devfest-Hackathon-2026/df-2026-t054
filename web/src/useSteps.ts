import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { stepsDoc, type StepsDoc } from './thoughtSteps.ts'

type Loaded = { key: string; steps: StepsDoc | null; error: Error | null }

// steps: undefined = 読み込み中，null = まだサーバーが処理を始めていない
export function useSteps(problemId: string, uid: string) {
  const key = `${problemId}/${uid}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(
    () =>
      onSnapshot(
        stepsDoc(problemId, uid),
        (snap) => setLoaded({ key, steps: snap.exists() ? (snap.data() as StepsDoc) : null, error: null }),
        (error) => setLoaded({ key, steps: null, error }),
      ),
    [key, problemId, uid],
  )

  if (loaded?.key !== key) return { steps: undefined, error: null }
  return { steps: loaded.steps, error: loaded.error }
}
