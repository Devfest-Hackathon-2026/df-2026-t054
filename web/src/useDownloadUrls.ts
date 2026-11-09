import { useEffect, useState } from 'react'
import { getDownloadURL, ref } from 'firebase/storage'
import { storage } from './firebase.ts'

type Loaded = { key: string; urls: string[] | null; error: Error | null }

// Storage のパスを表示用の URL にする．urls: null = 読み込み中
export function useDownloadUrls(paths: string[]) {
  const key = paths.join('\n')
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  // 古い key の結果が後から届いても，下の key の比較で捨てる
  useEffect(() => {
    if (!key) return
    // ref() が同期的に投げても画面を落とさず，エラー表示にする
    Promise.resolve()
      .then(() => Promise.all(key.split('\n').map((p) => getDownloadURL(ref(storage, p)))))
      .then(
        (urls) => setLoaded({ key, urls, error: null }),
        (error: Error) => setLoaded({ key, urls: null, error }),
      )
  }, [key])

  if (!key) return { urls: [], error: null }
  if (loaded?.key !== key) return { urls: null, error: null }
  return { urls: loaded.urls, error: loaded.error }
}
