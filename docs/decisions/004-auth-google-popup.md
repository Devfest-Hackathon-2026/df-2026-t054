# ログインは Firebase Auth の Google ログインをポップアップ方式で行う（2026-11-07）

- 決めたこと: `firebase` JS SDK を web/ に追加し，`signInWithPopup` + `GoogleAuthProvider` でログイン，`signOut` でログアウトする．ログイン状態は `useAuth` フック（`onAuthStateChanged`）で持つ
- 理由: 追加の設定なしに Firebase Hosting でもローカル（localhost）でも動く．状態の購読をフック1つにまとめると，後の画面からも同じ方法で使える
- 捨てた案とその理由:
  - `signInWithRedirect`: 最近のブラウザのサードパーティストレージ制限で，authDomain とホスティングのドメインが違うと失敗しやすく，追加の設定が要る
  - FirebaseUI: 依存が増え，React 19 での動作も保証されていない．ボタン1つなら SDK 直接で足りる
