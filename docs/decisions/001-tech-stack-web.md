# フロントエンドは Vite + React + TypeScript で作り，Firebase Hosting に静的配信する（2026-11-06）

- 決めたこと:
  - `web/` は Vite + React + TypeScript（`create-vite` の `react-ts` テンプレート）．lint はテンプレート同梱の oxlint
  - ビルド成果物 `web/dist` を Firebase Hosting（プロジェクト `gdgoc-hackathon-513704`）へデプロイする．SPA なので全パスを `index.html` に rewrite
  - Firebase CLI は依存に入れず `npx firebase-tools` で使う
  - 動画処理など重い処理は計画どおり `server/`（Cloud Run / Functions）に分け，フロントからは呼ぶだけにする
- 理由:
  - 静的ビルドなので Firebase Hosting にそのまま載り，締切（11/10）までの初日デプロイが最短で通る
  - 構成が単純で，4人がそれぞれ AI に書かせても衝突・迷いが少ない
- 捨てた案とその理由:
  - Next.js: SSR / API ルートを使うには Firebase App Hosting 等が要り，設定と課金の論点が増える．API は Cloud Run に分けるので不要
  - Flutter Web: Google 技術ではあるが，Web 中心のプロダクトには重く，チームの経験も前提にできない
