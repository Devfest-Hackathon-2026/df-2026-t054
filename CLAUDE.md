# CLAUDE.md（チーム共通の指示）

このファイルはチーム4人の Claude Code が共通で読む．個人の好みは `CLAUDE.local.md`（コミットしない）に書く．

## プロダクト
- 学生どうしが別々に考えた解法（手書き写真・LaTeX・短い説明動画）を「思考ステップ」に分け，分岐点を比べて問い合う学習プラットフォーム
- 詳細: `docs/planning/【教育】思考共有プラットフォーム_統合案.md`

## 設計原則（必ず守る）
- **プロダクト内の AI は答えや理由を代わりに書かない**．整理する・比べる・問いかけるだけ
- **AI に正誤を判定させない**．最終判断は人がする
- メインの技術は Google 技術（Gemini / Firebase / Cloud Run など）

## ハッカソンのレギュレーション
- ルール・期限・審査基準・提出物の要約: `docs/regulations.md`
- 依存ライブラリ・API・素材の追加，AI 機能の実装，デプロイ構成の変更，`poc/` からの流用，デモデータ作成のときは，作業前に同ファイルの「Claude Code 向けチェックリスト」を確認する．違反のおそれがあれば手を止めて人間に伝える

## 技術スタック・ディレクトリ
- `web/`: フロントエンド．Vite + React + TypeScript，lint は oxlint．Firebase Hosting に静的配信（`docs/decisions/001-tech-stack-web.md`）
  - 確認コマンド: `cd web && npm run lint && npm run build`
  - Firebase（Auth / Firestore / Storage）はここから使う
- `server/`: 投稿を思考ステップにする Cloud Functions（2nd gen．中身は Cloud Run）．Gemini は Vertex AI 経由で呼ぶ（`docs/decisions/009-steps-trigger.md`）
  - 確認コマンド: `cd server && npm run typecheck && npm run build`
- `shared/schema/`: 思考ステップの JSON スキーマ（＝契約）．変更は単独の PR にし，誰か1人の確認を得る
- `firebase/`: `firestore.rules`・`storage.rules` とそのテスト（`firebase/test/`）
  - ルールのテスト: `cd firebase && npm install && npm test`（エミュレータを立てて流す．Java が要る）
  - ルール・Functions（`server/`）・エミュレータの設定はリポジトリ直下の `firebase.json`．Firebase CLI はリポジトリ直下で動かす（`web/` の中では Hosting 用の `web/firebase.json` が使われる）
  - エミュレータ: `npx firebase-tools@15 emulators:start --only auth,firestore,storage,functions`
  - デプロイは必ず `--only` を付ける（例: `--only functions`）．付けないとルールと Functions がまとめて本番に出る．デプロイはレビュー後に人が行う
- `poc/`: PoC のコード．本番コード（`web/`・`server/`）から参照しない
- `docs/`: `planning/`（企画・計画），`decisions/`（判断の記録），`ai-usage/`（AI の使い方の記録．過去分は `ai-usage.md`），`regulations.md`
- これ以外の新しいフレームワークやライブラリは勝手に導入しない

### 命名規則
- ブランチ・コミットメッセージ: 下の「作業のルール」を参照
- React コンポーネントは `PascalCase.tsx`（1ファイル1コンポーネント），フックは `useXxx.ts`，それ以外の TS は `camelCase.ts`
- 判断の記録は `docs/decisions/issue-<Issue番号>-短い説明.md`（例: `issue-9-poc-comparison.md`．`000-template.md` をコピー）
  - 連番にしないのは，並行する PR が同じ番号を取り合って衝突するため．`001`〜`013` は以前の付け方で，名前を変えない
- AI の使い方の記録は `docs/ai-usage/issue-<Issue番号>.md` に書く（書き方は `docs/ai-usage/README.md`）．`docs/ai-usage.md` には行を足さない（全員が同じ表の末尾に足すと毎回衝突するため）
- 環境変数は `UPPER_SNAKE_CASE`．`web/` で使うものは `VITE_` を付ける（Vite がブラウザに渡すのは `VITE_` 付きだけ）
  - `VITE_` 付きはビルドに埋め込まれて誰でも読めるので，秘密の値を入れない．秘密は `server/` 側だけで読む

### 環境変数
- 変数名の一覧は各ディレクトリの `.env.example`（`web/.env.example`，`server/.env.example`）．`cp .env.example .env` して値を書く
- 変数を足したら，同じ PR で `.env.example` に名前と1行の説明を足す．`.env.example` に値は書かない

## 「Issue #N をやって」と言われたときの手順
タスクは GitHub Issue（リポジトリ `crab2424/gdgoc-2026`，ボード https://github.com/users/crab2424/projects/1 ）で管理している．

1. **読む**: `gh issue view N --comments` で「完了の条件」「AI に渡すときの要点」「前提の Issue」「引き継ぎメモ」を確認する
   - 前提の Issue が閉じていなければ，着手せず人間に伝える
   - 引き継ぎメモ・既存ブランチがあれば，そこから再開する
   - 計画書・統合案（`docs/planning/`）は，Issue に書かれていない判断が必要なときだけ該当箇所を読む
2. **着手を宣言する**: `gh issue edit N --add-assignee @me` を実行し，ボードの Status を「In Progress」にするよう人間に伝える（WIP は1人1つまで）
3. **ブランチを切る**: `git switch main && git pull` → `git switch -c <種類>/N-<短い説明>`（既存ブランチがあればそれを使う）
4. **作業する**: 完了の条件を満たす最小の変更にする．範囲外の改善に気づいたら，手を出さず最後に報告する
5. **確認する**: lint・型チェック・ビルド・動作確認を通す．完了の条件を1つずつ確かめる
6. **判断を記録する**: 技術選定や方針の判断をしたら `docs/decisions/issue-N-<短い説明>.md` を1つ足す（`000-template.md` をコピー）．AI の使い方で特筆すべきことがあれば `docs/ai-usage/issue-N.md` に1行足す
7. **PR を出す**: コミットして push し，`.github/pull_request_template.md` に沿って PR を作る（`Closes #N` を含める）．「なぜこの方法にしたか」「AIの使い方」は，このセッションで実際に検討したこと・人間が修正したことを書く
8. **報告する**: PR の URL，満たせなかった完了の条件，残った課題を人間に伝える

### 途中でやめるとき
作業中のブランチを push し，Issue にコメントで引き継ぎメモ（どこまでやったか／残り／ブランチ名／ハマった点）を書いてから，`gh issue edit N --remove-assignee @me` で手放す．

## 作業のルール
- 依頼された範囲のファイルだけを変更する．無関係なファイルの整形・リネーム・リファクタをしない
- 新しい依存ライブラリを追加する前に，人間に確認する
- 依存ライブラリ・素材・データを足す PR では，同じ PR で著作物利用シート（`docs/licenses.md`）に1行足す
- 共有の「契約」（スキーマ・Firestore のデータ構造・セキュリティルール）は勝手に変えない．変更が必要なら提案だけする
- 秘密情報（APIキー・サービスアカウント鍵）はハードコードせず，`.env` から読む．`.env` はコミットしない
- `main` に直接コミット・push しない．ブランチは `<feat|fix|docs|chore|poc>/<Issue番号>-<短い説明>`
- コミットメッセージは `feat: 〇〇 (#12)` の形式
- コミット前に lint・型チェック・ビルドを通す
- PR の本文はテンプレートに沿って書き，「なぜこの方法にしたか」「捨てた案」を必ず含める
