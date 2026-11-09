# 投稿の書き込みをトリガーに Cloud Functions（2nd gen）で思考ステップにし，`problems/{problemId}/steps/{uid}` に保存する（2026-11-07）

- 決めたこと:
  - 実行基盤: `server/` を Cloud Functions for Firebase（2nd gen．中身は Cloud Run）の codebase にする．リポジトリ直下の `firebase.json` の `functions.source` が `server`（はじめ `firebase/firebase.json` から `../server` を指したが，デプロイで拒否されたので 010 で直下に移した）
  - トリガー: Firestore の `problems/{problemId}/posts/{uid}` の書き込み（`onDocumentWritten`）．`createdAt` が変わったとき（新しい投稿・出し直し）だけ処理する
  - PoC #7（PR #34．開発期間中の 11/6 に書いたもの）のコードを `server/` に書き直して使う．流用が禁止されている 11/5 10:00 より前のコードではない
  - Gemini: Vertex AI 経由で `@google/genai` を使う．モデルの既定は `gemini-3.1-flash-lite`（PoC #7 の申し送り．#50 でステップ化だけ投稿の種類ごとにし，画像は `gemini-3.8-flash` にした．`issue-50-model-per-kind.md`）．画像・動画は Firebase Storage の `gs://` をそのまま渡し，テキストは各行に行番号を付けて渡す
  - `responseJsonSchema` は契約（`shared/schema/thought-steps.schema.json`）を `source` だけ投稿の種類に絞って渡す（契約の部分集合で，契約そのものは変えない）．ビルド時に `server/lib/` へ写す
  - 動画は先頭の 60 秒だけを Gemini に渡す（`videoMetadata.endOffset`）．`durationSec` はブラウザが書く値なので，長い動画でも費用が膨らまないようにする
  - 保存前に「使う側で確かめる決まり」（`shared/schema/README.md`）を確かめる．種類違い・範囲外・大小が逆・整数でないステップはそのステップだけを捨て（投稿全体は失敗にしない），`endSec`・`lineEnd` は長さに切り詰め，`id` はコードで振り直し，`why` は transcript にそのまま含まれる引用でなければ `null` にする
  - テキストの投稿は，transcript を Gemini の書き起こしではなく本文の該当行（`lineStart`〜`lineEnd`）にする
  - Firestore のデータ構造（共有の契約）:
    ```
    problems/{problemId}/steps/{uid}   ← ドキュメント ID は投稿した人の uid（投稿と 1 対 1）
      status: 'processing' | 'done' | 'failed'
      postCreatedAt: Timestamp          ← どの投稿（posts/{uid}.createdAt）の結果か
      thoughtSteps: ThoughtSteps | null ← done のとき．形は shared/schema/thought-steps.schema.json
      warnings: string[]                ← 捨てた・直したステップの理由（確認用）
      error: string | null              ← failed のとき画面に出す文言（内部のエラーはログだけ）
      model: string
      updatedAt: Timestamp
    ```
  - ルール: 書くのはサーバー（Admin SDK）だけ．読めるのは本人だけ（#13 で投稿と同じく広げる）
  - 処理中に出し直されたら，古い投稿の結果では上書きしない（トランザクションで `posts/{uid}.createdAt` と突き合わせる）
- 理由:
  - Functions は `firebase deploy` 1つで Firestore のトリガーまで設定でき，エミュレータで投稿→ステップ化を通して試せる．中身は Cloud Run なので「実行基盤に Cloud Run を使う」構成も保てる
  - Storage のアップロードではなく Firestore の投稿をトリガーにした: 画像は複数枚あり，全部そろったことは投稿のドキュメントでしか分からない．投稿の種類・動画の長さもドキュメントにある
  - 別ドキュメントにした: 投稿は本人が書き，ステップはサーバーが書くので，ルールを分けられる．投稿の `validPost` や #13 の公開のルールに手を入れずに済む
  - Gemini は LaTeX のバックスラッシュを transcript で崩した（`\le` → 改行と `e`，`\blacksquare` → 制御文字）．テキストは原本があるので，行番号だけ使い原本を写す方が確実
  - #8（画像・LaTeX の PoC）は無いが，契約は #6 で 3 種類を決めてあり，構造化出力の方法は #7 と同じなので，PoC を挟まず組み込んだ（#15 まで今日中に進めるため）
- 捨てた案とその理由:
  - Cloud Run + Eventarc で自前のサーバー: 同じことができるが，Eventarc の設定とデプロイ手順が増える
  - ステップを `posts/{uid}` に足す: 読み込みは1回で済むが，本人が書けるドキュメントにサーバーの結果が混ざり，ルールが複雑になる
  - 検証に ajv を足す: PoC の申し送りでは推奨だったが，依存を増やさず PoC の手書きの検証を移した．契約が変わったら `server/src/contract.ts` も直す
  - Storage へのアップロードをトリガーにする: 上の理由
- 承知のうえの弱さ:
  - 画像・動画は Storage のエミュレータのファイルを Gemini に渡せないので，ローカルではテキストしか通して試せない．本番にデプロイして確かめる
  - 失敗しても自動で再試行しない（`retry` なし）．出し直せば再処理される．出し直しの回数に上限はない（費用は予算アラートで見る）
  - タイムアウト・クラッシュすると `processing` のまま残る．画面は `updatedAt` から 6 分たったら出し直しを促す
  - 画像の `box2d` の精度は未確認（#8 でやる予定だった確認）
