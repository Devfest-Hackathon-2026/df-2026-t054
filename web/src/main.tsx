import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { missingFirebaseEnv } from './firebaseConfig.ts'
import './index.css'

const root = createRoot(document.getElementById('root')!)

if (missingFirebaseEnv.length > 0) {
  // 設定が足りないまま Firebase を起動すると読み込み時に例外になり画面が真っ白になるので，
  // App（＝Firebase）を読み込まずに足りない変数を表示する
  root.render(
    <main>
      <h1>Firebase の設定が足りません</h1>
      <p>web/.env に次の値を書いてから，開発サーバーを起動し直してください（web/.env.example を参照）．</p>
      <ul>
        {missingFirebaseEnv.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </main>,
  )
} else {
  import('./App.tsx')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    })
    .catch((e: unknown) => {
      // 再デプロイ後に古いタブが消えたファイルを読みに行った場合や，Firebase の起動に失敗した場合
      console.error(e)
      root.render(
        <main>
          <h1>読み込みに失敗しました</h1>
          <p>ページを再読み込みしてください．直らない場合は開発者に伝えてください．</p>
        </main>,
      )
    })
}
