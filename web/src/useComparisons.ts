import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { comparisonsCollection, type Comparison, type ComparisonDoc } from './comparisons.ts'

type Loaded = { key: string; comparisons: Comparison[]; error: Error | null }

// 問題の対応関係をまとめて読む．全員が提出したあとの参加者だけが読める（firebase/firestore.rules）．
// comparisons: undefined = 読み込み中
export function useComparisons(problemId: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(
    () =>
      onSnapshot(
        comparisonsCollection(problemId),
        (snap) =>
          setLoaded({
            key: problemId,
            comparisons: snap.docs.map((d) => ({ ...(d.data() as ComparisonDoc), id: d.id })),
            error: null,
          }),
        (error) => setLoaded({ key: problemId, comparisons: [], error }),
      ),
    [problemId],
  )

  if (loaded?.key !== problemId) return { comparisons: undefined, error: null }
  return { comparisons: loaded.comparisons, error: loaded.error }
}
