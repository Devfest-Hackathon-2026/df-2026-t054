import { useEffect, useState } from 'react'

// 今の時刻（ミリ秒）．intervalMs ごとに更新して再描画する
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
