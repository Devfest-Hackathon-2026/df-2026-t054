import { useState } from 'react'
import CreateProblemForm from './CreateProblemForm.tsx'
import Intro from './Intro.tsx'
import Link from './Link.tsx'
import ProblemList from './ProblemList.tsx'
import ProblemPage from './ProblemPage.tsx'
import { useAuth } from './useAuth.ts'
import { useRoute, type Route } from './useRoute.ts'

// プロダクト名（issue-91）．変えるときは，ここと index.html の <title> を直す
const productName = 'ミチクラベ'

// エラー表示しないコード（ユーザーが自分でポップアップを閉じた，前のポップアップが置き換わった）
const ignoredErrorCodes = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']

// よくあるコードは，どうすればよいかを日本語で案内する
const errorMessages: Record<string, string> = {
  'auth/popup-blocked':
    'ログイン用のポップアップがブロックされました．ブラウザでこのサイトのポップアップを許可してから，もう一度お試しください．',
  'auth/unauthorized-domain':
    'このドメインではログインできません．Firebase コンソールの Authentication → 設定 → 承認済みドメインに，このページのドメインを追加してください．',
}

function Page({ route, uid }: { route: Route; uid: string }) {
  switch (route.name) {
    case 'home':
      return (
        <>
          <ProblemList uid={uid} />
          <CreateProblemForm uid={uid} />
        </>
      )
    case 'problem':
    case 'join':
      return <ProblemPage problemId={route.problemId} uid={uid} isJoinLink={route.name === 'join'} />
    case 'notFound':
      return (
        <>
          <p>
            <Link to="/">← 問題一覧へ</Link>
          </p>
          <p>ページが見つかりません．</p>
        </>
      )
  }
}

function App() {
  const { user, signIn, logOut } = useAuth()
  const route = useRoute()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = (action: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    action()
      .catch((e: unknown) => {
        const code = (e as { code?: string }).code ?? ''
        if (ignoredErrorCodes.includes(code)) return
        setError(errorMessages[code] ?? `エラーが起きました: ${e instanceof Error ? e.message : String(e)}`)
      })
      .finally(() => setBusy(false))
  }

  return (
    <>
      <header>
        <h1>
          <Link to="/">{productName}</Link>
        </h1>
        {user && (
          <p>
            {user.displayName || user.email || '名前の無いユーザー'} さんとしてログイン中{' '}
            <button type="button" onClick={() => run(logOut)} disabled={busy}>
              ログアウト
            </button>
          </p>
        )}
      </header>
      <main>
        {user === undefined ? (
          <p>読み込み中…</p>
        ) : user === null ? (
          <>
            {route.name !== 'join' && <Intro />}
            <section>
              <h2>ログイン</h2>
              {route.name === 'join' && <p>問題に招待されています．参加するにはログインしてください．</p>}
              <button type="button" className="primary" onClick={() => run(signIn)} disabled={busy}>
                Google でログイン
              </button>
            </section>
            {/* 招待リンクから来た人は参加が目的なので，ログインを先に出し，説明はその下に置く */}
            {route.name === 'join' && <Intro />}
          </>
        ) : null}
        {error && <p role="alert">{error}</p>}
        {user && <Page route={route} uid={user.uid} />}
      </main>
    </>
  )
}

export default App
