import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'problem'; problemId: string }
  | { name: 'join'; problemId: string }
  | { name: 'notFound' }

function parse(pathname: string): Route {
  if (pathname === '/') return { name: 'home' }
  const m = pathname.match(/^\/problems\/([A-Za-z0-9]+)(\/join)?\/?$/)
  if (!m) return { name: 'notFound' }
  return m[2] ? { name: 'join', problemId: m[1] } : { name: 'problem', problemId: m[1] }
}

// 画面が少ないのでルーターのライブラリは使わない（docs/decisions/007-problem-firestore-invite.md）
export function navigate(path: string) {
  if (path === location.pathname) return
  history.pushState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname))
  useEffect(() => {
    // 目次の #mine などページ内リンクでも popstate が起きるので，パスが変わっていなければ同じ値を返して描き直さない
    const onPop = () => {
      const next = parse(location.pathname)
      setRoute((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  return route
}
