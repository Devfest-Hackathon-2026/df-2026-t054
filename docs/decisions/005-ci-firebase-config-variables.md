# CI のビルドには Firebase の Web 設定をリポジトリの Variables から渡す（2026-11-07）

- 決めたこと: `.github/workflows/web.yml` の `npm run build` に，GitHub リポジトリの Variables（`vars.VITE_FIREBASE_*`）を環境変数として渡す
- 理由: `VITE_` 付きの値はビルドに埋め込まれ，ブラウザから誰でも読める公開前提の値．渡さないとプレビューが「設定が足りません」の表示になり，ログインを試せない．Variables ならログに値が見えても問題がなく，チームの誰でも値を確認できる
- 捨てた案とその理由:
  - Secrets に入れる: 秘密ではない値を秘密扱いにすると，値の確認や更新がしにくい．本当の秘密（`server/` 側）と区別がつかなくなる
  - `web/.env.production` をコミットする: `.env.*` はコミットしない方針（`.gitignore`）に反する
