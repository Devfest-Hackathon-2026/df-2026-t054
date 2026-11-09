import type { ReactNode } from 'react'
import { navigate } from './useRoute.ts'

// ページを再読み込みせずに画面を切り替えるリンク
function Link({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

export default Link
