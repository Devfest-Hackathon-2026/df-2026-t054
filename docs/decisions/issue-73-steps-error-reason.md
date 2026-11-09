# ステップに分けられなかった理由を3つに分けて `steps/{uid}.errorCode` に書き，投稿を同じ中身で書き直して再実行できるようにする（2026-11-08）

- 決めたこと:
  - 理由の分類（`server/src/stepsError.ts`）:
    - `unreadable`（読み取れなかった）: Gemini が空の `steps` を返した．`normalizeSteps` が `UnreadableError` を投げて見分ける．返ってきたステップを全部捨てたときは，投稿は読めていて返し方（`source.kind` など）がずれているだけのこともあり，撮り直しを勧めるのはずれた案内になるので `unknown` にする（PR #79 のレビュー）
    - `temporary`（一時的なエラー）: Vertex AI の 408・429・5xx（`@google/genai` の `ApiError.status`），時間切れ（`AbortError`・`TimeoutError`），接続の失敗（`ECONNRESET` など．`cause` もたどる）
    - `unknown`（それ以外）: JSON が壊れている・`steps` の配列がない・全部捨てた・400 / 403・Storage のファイルが読めない など．文言は今までのものに「もう一度ステップに分ける」を足した（同じ枠にボタンが出るので．PR #79 のレビュー）
  - Firestore のデータ構造（009 に足す）:
    ```
    problems/{problemId}/steps/{uid}
      errorCode: 'unreadable' | 'temporary' | 'unknown' | null   ← failed のときの理由．processing・done では null．#73 より前のドキュメントには無い
      error: string | null                                         ← 分類ごとに決めた見出しの文言（今まで通り画面に出す）
    ```
  - どうすればよいか（撮り直す・字が切れていないか確かめる・少し待つ など）は画面（`web/src/StepsStatus.tsx`）が `errorCode` と投稿の種類から出す．サーバーは見出しだけを書く
  - 一時的なエラーはサーバーが3秒待って1回だけやり直す．Gemini の呼び出しは1回 130 秒で打ち切る（`httpOptions.timeout`）．2回分と待ち時間が `postToSteps` の上限 300 秒に収まるようにするため
  - 再実行: 「もう一度ステップに分ける」ボタンで，`posts/{uid}` を同じ中身（同じ `imagePaths`・`videoPath` など）で `createdAt` だけ新しくして書き直す（`web/src/posts.ts` の `retrySteps`）．`postToSteps` は `createdAt` が変わると動くので，サーバーもルールも変えずに済む．ボタンは失敗したときと，`processing` のまま6分たったときに出す．出し直しと同じく，締め切り前で未提出のときだけ
- 理由:
  - 設計原則（AI に正誤を判定させない）に合わせ，分類は「読み取れたか」「AI 側が一時的に失敗したか」だけにした．「解法として不十分」のような，出来に触れる分類・文言は作らない
  - 「読み取れない」を Gemini に自己申告させる項目は，契約（`shared/schema/thought-steps.schema.json`）を変えるのでやらず，返り値（残ったステップの数）から決めた
  - 見出しをサーバーが書くのは，009 の「`error` は画面に出す文言」をそのまま保つため（古い画面でも読める）．どうすればよいかは投稿の種類で変わる画面の都合なので画面に置いた
  - `@google/genai` の組み込みの再試行（`retryOptions`）は HTTP のステータスしか見ず，時間切れはやり直さない．回数も既定で5回と多いので，分類と同じ判定を使う小さな関数を自前で書き，テストした
  - 時間を区切らないと，Vertex AI が返事をしないときは関数ごと 300 秒で止まり（`processing` のまま），時間切れとして分類もやり直しもできない
- 捨てた案とその理由:
  - Gemini に `unreadable: true` を返させる: 契約を変える（Issue で除外）
  - 理由ごとの文言（見出しとどうすればよいか）を全部サーバーが書く: 項目が増えて 009 の構造の変更が大きくなる．種類ごとの言い回しの調整のたびにデプロイが要る
  - Functions の `retry: true`（イベントの再配信）: 失敗の種類を選べず，読み取れない投稿でも何度も呼んで費用がかかる
  - 再実行用の callable 関数を足す: 投稿を書き直せば今のトリガーとルールで動くので，入口を増やさない
- 承知のうえの弱さ:
  - 動画は 130 秒で打ち切るので，それより長くかかる動画は時間切れ（`temporary`）になる．今までの実測では数十秒で終わっている
  - 同じ中身で再実行しても，`temperature: 0` なので `unreadable` は同じ結果になりやすい．画面では撮り直して「出し直す」ことを先に勧める
  - 締め切り後・提出後は投稿を書けないので再実行できない．#70 で失敗したステップのままは提出できないので，締め切り後に失敗が残ることはない
- デプロイの順番: Functions（`--only functions`）と Hosting はどちらが先でもよい．画面は `errorCode` が無ければ見出しだけを出し，古い Functions は今まで通りの `error` を書く
