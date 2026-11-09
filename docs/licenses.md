# 著作物利用シート

プロダクトで使っているライブラリ・素材・データの出典とライセンスの一覧（提出物「著作物利用シート」の元データ）．

- 対象: `web/`・`server/`・`firebase/`・`poc/` の直接の依存，CI・デプロイで使うツール，リポジトリに置いた素材．間接依存（依存の依存）は載せない
- 依存・素材を足す PR では，同じ PR でこの表に1行足す（`CLAUDE.md`「作業のルール」）
- バージョンは `package.json` の指定をそのまま書く

## ライブラリ（`web/`）

| 名前 | バージョン指定 | 用途 | 種別 | ライセンス | 出典 |
|---|---|---|---|---|---|
| firebase | ^13.2.0 | Firebase Auth / Firestore / Storage の JS SDK（Google 公式）．#10 で追加 | 実行時 | Apache-2.0 | https://github.com/firebase/firebase-js-sdk |
| react | ^19.3.1 | UI ライブラリ | 実行時 | MIT | https://github.com/react/react |
| react-dom | ^19.3.1 | React の DOM 描画 | 実行時 | MIT | https://github.com/react/react |
| vite | ^8.3.6 | ビルドツール・開発サーバ | 開発時 | MIT | https://github.com/vitejs/vite |
| @vitejs/plugin-react | ^6.1.2 | Vite の React 対応 | 開発時 | MIT | https://github.com/vitejs/vite-plugin-react |
| typescript | ~7.0.2 | 型チェック | 開発時 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| oxlint | ^1.90.0 | lint | 開発時 | MIT | https://github.com/oxc-project/oxc |
| @types/react | ^19.3.0 | React の型定義 | 開発時 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | ^19.3.0 | react-dom の型定義 | 開発時 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | ^24.19.2 | Node.js の型定義（設定ファイル用） | 開発時 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

## ライブラリ（`server/`）

| 名前 | バージョン指定 | 用途 | 種別 | ライセンス | 出典 |
|---|---|---|---|---|---|
| firebase-functions | 7.4.0 | Cloud Functions（2nd gen）の Firestore トリガー（Google 公式）．#14 で追加 | 実行時 | MIT | https://github.com/firebase/firebase-functions |
| firebase-admin | 14.5.0 | サーバーから Firestore・Storage を使う Admin SDK（Google 公式）．#14 で追加 | 実行時 | Apache-2.0 | https://github.com/firebase/firebase-admin-node |
| @google/genai | 2.31.0 | Vertex AI の Gemini を呼ぶ SDK（Google 公式）．#14 で追加（PoC #7 と同じ版） | 実行時 | Apache-2.0 | https://github.com/googleapis/js-genai |
| typescript | 7.0.2 | 型チェック・ビルド | 開発時 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @types/node | 24.19.2 | Node.js の型定義 | 開発時 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

## ライブラリ（`firebase/`．ルールのテスト用）

| 名前 | バージョン指定 | 用途 | 種別 | ライセンス | 出典 |
|---|---|---|---|---|---|
| @firebase/rules-unit-testing | 6.0.0 | エミュレータでセキュリティルールをテストする（Google 公式）．#13 で追加 | 開発時 | Apache-2.0 | https://github.com/firebase/firebase-js-sdk |
| firebase | 13.2.0 | テストからエミュレータを読み書きする JS SDK（`web/` と同じ版）．#13 で追加 | 開発時 | Apache-2.0 | https://github.com/firebase/firebase-js-sdk |

## ライブラリ（Gemini のコード実行の中で動くもの）

リポジトリの依存には入らない．Vertex AI の Gemini のコード実行環境に入っているものを，こちらが作ったコードから使う

| 名前 | バージョン指定 | 用途 | 種別 | ライセンス | 出典 |
|---|---|---|---|---|---|
| SymPy | 指定なし（コード実行環境に入っている版） | 式変形の前後が同じ式かを確かめる（参考）．#22 で追加 | 実行時 | BSD-3-Clause | https://github.com/sympy/sympy |

## ライブラリ（`poc/`．検証用で本番では使わない）

提出用リポジトリには入るので載せる．`server/` と同じ版のもの（`@google/genai` 2.31.0・`typescript` 7.0.2・`@types/node` 24.19.2）は上の表を参照し，ここには `poc/` にしか無いものだけを書く

| 名前 | バージョン指定 | 用途 | 種別 | ライセンス | 出典 |
|---|---|---|---|---|---|
| ajv | 8.20.0 | Gemini の出力が契約スキーマに通るかを検証する（`poc/8-image-to-steps`）．#8 で追加 | 実行時（PoC） | MIT | https://github.com/ajv-validator/ajv |

## CI・デプロイで使うツール

`package.json` の依存には入らない．GitHub Actions（`.github/workflows/`）と `npx` から使う．プロダクトには同梱しない

| 名前 | バージョン指定 | 用途 | 種別 | ライセンス | 出典 |
|---|---|---|---|---|---|
| firebase-tools | 15（`npx firebase-tools@15`） | エミュレータ・デプロイ・CI のプレビュー配信 | 開発時 | MIT | https://github.com/firebase/firebase-tools |
| actions/checkout | v4 | CI でリポジトリを取得する | 開発時 | MIT | https://github.com/actions/checkout |
| actions/setup-node | v4 | CI で Node.js を用意する | 開発時 | MIT | https://github.com/actions/setup-node |
| actions/upload-artifact | v4 | CI のビルド結果を次のジョブに渡す | 開発時 | MIT | https://github.com/actions/upload-artifact |
| actions/download-artifact | v4 | CI のビルド結果を受け取る | 開発時 | MIT | https://github.com/actions/download-artifact |
| google-github-actions/auth | v3 | CI から Google Cloud に認証する（Google 公式） | 開発時 | Apache-2.0 | https://github.com/google-github-actions/auth |

## 素材・データ

| 名前 | 置き場所 | 用途 | ライセンス | 出典 |
|---|---|---|---|---|
| ミチクラベのアイコン（SVG） | `web/public/favicon.svg` | favicon．分かれ道が分岐して合流する形（Vite のロゴから差し替え） | チームの自作（Claude Code と作成．第三者のロゴ・素材は使っていない） | チームで作成 |
| デモ用の解法データ（手書き写真 2 枚・LaTeX 3 本・説明動画 48 秒） | チームの Google ドライブ（`共有資料/解法/`．リポジトリには置かない） | デモの投稿．題材は「√2 が無理数であること」．#23 で追加 | チームの自作（第三者の著作物・顔の映り込みなし．教科書の問題文は使っていない） | チームで作成 |
| 思考ステップのサンプルデータ（JSON 7 件・LaTeX 2 本） | `shared/schema/examples/` | スキーマに沿った出力の見本（コードからは読み込まない）．題材は「素数が無限にあること」と式の展開．#6・#16・#19・#22 で追加 | チームの自作（架空のデータ．第三者の著作物なし） | チームで作成 |
| PoC のサンプル（LaTeX 2 本） | `poc/8-image-to-steps/samples/`（`primes.tex`・`sqrt2.tex`） | 画像から思考ステップを作る PoC の入力の見本．#8 で追加 | チームの自作（第三者の著作物なし） | チームで作成 |
