# PoC: 画像・LaTeX → 思考ステップ（#8）

手書きノートの写真や LaTeX を Gemini に渡し，構造化出力（`responseJsonSchema`）で思考ステップの JSON を受け取る．
受け取った JSON は契約スキーマ（#6: `shared/schema/thought-steps.schema.json`）で検証し，元の場所（画像の範囲）を枠で重ねた HTML を出す．

- 2026-11-06（開発開始後）に書いたコード．TypeScript で書いた（#14 の `server/` と同じ言語・SDK）
- 本番の実装は #14（`server/src/steps.ts`）にある．この PoC は，モデル・プロンプト・写真の撮り方を手元で試し比べるために残す
- Node 24 の型除去で `.ts` をそのまま実行する（tsx などは使わない）

## 準備

```bash
cd poc/8-image-to-steps
npm install
cp .env.example .env   # GEMINI_API_KEY などを入れる
```

### AI Studio と Vertex AI の切り替え

コードは同じで，`.env` だけを変える（`@google/genai` が両方に対応している）．

| | 使うとき | `.env` |
|---|---|---|
| AI Studio | 試すとき（無料枠．Google Cloud のクレジットは使えない） | `GEMINI_API_KEY=...`．キーは**課金を設定していないプロジェクト**で作る |
| Vertex AI | 本番・クレジットを使うとき | `GOOGLE_GENAI_USE_VERTEXAI=true`，`GOOGLE_CLOUD_PROJECT=...`，`GOOGLE_CLOUD_LOCATION=global`．認証は `gcloud auth application-default login` |

**AI Studio の無料枠では入力がモデル改善に使われうる．実在の学生の答案は送らず，自分たちで書いた問題・答案で試す．**

## 使い方

```bash
npm start -- samples/sqrt2.tex                       # LaTeX（デモの題材 √2 の無理数性）
npm start -- samples/private/page1.JPG samples/private/page2.JPG   # 手書き 2 枚（imageIndex 0, 1）
npm start -- samples/sqrt2.tex --dry-run             # API を呼ばずに送る内容と応答スキーマを表示
npm start -- samples/sqrt2.tex --contract-schema     # 契約スキーマをそのまま responseJsonSchema に渡す実験
GEMINI_MODEL=gemini-3.1-flash-lite npm start -- samples/sqrt2.tex   # モデルを一時的に変える（既定は gemini-3.5-flash）
npm run models                                       # 使えるモデル名の一覧（GEMINI_MODEL を選ぶ）
npm run typecheck
```

手書き写真は `samples/private/` に置く（`.gitignore` 済み）．画像と LaTeX を同時に渡すこともできるが，#14 では 1 投稿 1 種類なので，ふつうは分けて試す．

### 出力（`out/<日時>/`，コミットしない）

| ファイル | 内容 |
|---|---|
| `steps.json` | 思考ステップ（契約の形．`id`・`schemaVersion` はコードで付ける） |
| `run.json` | backend・モデル・処理時間・トークン数・検証結果・生の応答（#9 の比較メモの材料） |
| `preview.html` | 画像に `box2d` の枠を重ねたもの・LaTeX の該当行．**元の場所が合っているかはこれを目で見て確かめる**（画像は相対パスで読むので，ブラウザで直接開く） |

### 実行時のチェック

- **契約スキーマ**: `shared/schema/thought-steps.schema.json` に ajv（draft 2020-12）で通るか
- **スキーマでは表せない約束**:
  - `box2d` の大小・`lineStart <= lineEnd`・行番号が本文の行数以内
  - `what` に評価語（正しい・誤り・惜しい など）が無いか（設計原則「AI に正誤を判定させない」）
  - `why.text` が同じステップの `transcript` にそのまま含まれるか（契約の「守ること」．#14 では満たさないと `null` に落ちる）．LaTeX は原文の該当行にも含まれるか

## Gemini に渡すスキーマと契約の違い（`src/response-schema.ts`）

| 項目 | 契約（#6） | Gemini に渡す形 | 理由 |
|---|---|---|---|
| `id`・`schemaVersion` | 必須 | 渡さない（コードで付ける） | 連番・定数を LLM に任せる理由がない．`const` も守られない（下の結果） |
| `why.by` | `post_quote` / `author` | `post_quote` だけ | `author` は本人がアプリで書いたときの値．AI に選ばせない |
| `transcript` | 任意 | 必須 | 人が `what` と原本を照らし合わせる材料を必ず残す |
| `kind` | `const` | 1 要素の `enum` | 構造化出力は `const` を守らない（下の結果） |
| LaTeX の場所 | `textSource`（`kind: "text"`，行番号） | 同じ | この PoC で試した形を #31 で契約に入れた |

## サンプルで見たいこと

どちらも自作の答案（教科書などからの引用ではない）．`primes.tex` は最初の試し（下の結果の元）で，`sqrt2.tex` はデモの題材（#11 で決まった √2 の無理数性）に合わせたもの．

`primes.tex`:
- 方針には本人の理由（「〜難しいので」）がある → `why` が `post_quote` で原文どおり引用されるか
- 他の行には理由が無い → `why` が `null` になるか（AI が理由を補わないか）
- 「よって $N$ は素数である」は論理が飛んでいる（$N$ が素数とは限らない） → `what` で誤りを指摘・評価せず，書かれた通りに整理するか

`sqrt2.tex`（手書きの写真と別の道：偶奇ではなく素因数 2 の個数を数える．#16 で分岐点を試す相手にできる）:
- 理由が 2 か所（「〜少なくて済むので」「素因数分解はただ一通りなので」） → `post_quote` で引用されるか
- 「2 の個数は偶数／奇数」は理由を書いていない → `why` が `null` のままか

## 試した結果（2026-11-06，AI Studio 無料枠，`samples/primes.tex`）

| モデル | 応答スキーマ | 処理時間 | ステップ | 結果 |
|---|---|---|---|---|
| `gemini-2.5-flash` | PoC | ― | ― | 404．新規ユーザーには提供終了 |
| `gemini-3.8-flash` | PoC | 330 秒 | 7 | 行番号はすべて正しい．`why` は理由のある 2 か所だけ原文どおり引用，他は `null`．誤った行（$N$ は素数）は「主張する」と書き，評価しない |
| `gemini-3.1-flash-lite` | PoC | 2.4 秒 | 7 | 行番号は正しい．`what` が短く情報が減る（「数Nを定義する」）．`why` は1つで，理由以外の部分まで引用 |
| `gemini-3.5-flash` | PoC | ― | ― | 503．混雑 |
| `gemini-3.8-flash` | 契約そのまま（`--contract-schema`） | 478 秒 | 7 | API は受け付けたが，**`const` が守られない**（`schemaVersion: "1.0"`，`kind: "latex"`）．契約の検証で NG |

分かったこと:
- 契約スキーマはそのまま渡せるが，`const` は出力を縛らない．`id`・`schemaVersion` をコードで付け，`kind` を 1 要素の `enum` にする今の作りは必要
- LaTeX の行番号での `source` は，どちらのモデルでも正しく取れた
- 無料枠の `gemini-3.8-flash` は数分かかることがあり，デモには使いにくい

## `sqrt2.tex` の結果（2026-11-08，`gemini-3.5-flash`）

19 秒，7 ステップ．行番号はすべて正しく，契約の検証・約束のチェックとも OK．理由の 2 か所は原文どおり `post_quote`，他は `null`．

## 手書き写真での結果（2026-11-08，√2 の無理数性の自作答案）

`gemini-3.1-flash-lite`:

| 写真 | 処理時間 | 結果 |
|---|---|---|
| 1 枚目＋2 枚目（縦．EXIF Orientation 6） | 33 秒 | 9 ステップ．消した行はステップにならない．理由なしの行は `why: null` |
| 1 枚目だけ（再実行） | 3.7 秒 | 同じ 3 ステップ．**枠が 2 回とも約 1 行ぶん上にずれる** |
| 1 枚目を横に持って撮った見開き（Orientation 1） | 17 秒 | 3 ステップ．枠はぴったり |

- 余白のメモ（「← √2も分数も消して整数だけにしたい」）は `why: post_quote` として拾われたが，`transcript` に入らない．契約の「`why.text` は同じステップの `transcript` に含まれる」を満たさないので，#14 の実装では `null` に落ちる
- 見開きの写真では余白のメモを「根号も消して…」と読み違えたまま引用した．`why` の照合がこれを捕まえた

### 1 枚目の枠の上ずれの切り分け

正解の y 範囲を目で測り（切り出して確認），各ステップの枠の中心との差を比べた（1000 正規化．行の間隔は約 40）．

| 条件 | モデル | 方針 | √2=p/q | 両辺2乗 |
|---|---|---|---|---|
| 元の写真（EXIF 6）× 3 回 | flash-lite | -42 | -23〜-28 | -16〜-31 |
| 画素を回転済み（EXIF 1）× 2 回 | flash-lite | -37 | -23 | -21 |
| 回転済み＋長辺 1600px に縮小 × 2 回 | flash-lite | -37 | -23 | -21 |
| 上半分だけに切り出し | flash-lite | （ステップが抜けた） | 大きくずれる | ― |
| 回転済み＋縮小 | **`gemini-3.5-flash`**（14 秒） | **+2** | **-1** | **+5** |
| 回転済み＋縮小 | **`gemini-3.8-flash`**（151 秒） | **+4** | **-1** | **+2** |

- EXIF の回転・解像度は原因ではない（入力トークンも 1483 で変わらない．Gemini 側で一定の大きさに縮めている）
- **原因は `gemini-3.1-flash-lite` の位置の精度**．`gemini-3.5-flash`・`gemini-3.8-flash` はほぼぴったり
- `gemini-3.5-flash` は余白のメモも `transcript` に入れたので，`why` が契約の照合を通る．一方，題名と消した行（「p = 2q を書いて二重線で消す」）もステップにした．粒度はプロンプトで揃える必要がある．なお本番（`server/src/steps.ts`）のプロンプトには「挨拶・締めはステップにしない」があり，この PoC には無い．この違いが効いている可能性があるので，#9 でモデルを決めるときは本番のプロンプトでも確かめる
- `gemini-3.8-flash` はステップが flash-lite と同じ 3 つ（題名・消した行を含めない）．ただし余白のメモを `transcript` には `\sqrt{2}`，`why` には `√2` と別の書き方で入れたので，照合で落ちる．**`transcript` は LaTeX，`why` は引用，と書き方が混ざると照合が通らない**
- `gemini-3.1-pro-preview` は無料枠の上限が 0 で使えない
- 画像のステップ化は，flash-lite では枠が 1 行ずれうる．#14 で使うモデルを選ぶとき（#9）の材料にする．この PoC の既定は `gemini-3.5-flash` にした

## まだ確かめていないこと

- `gemini-3.5-flash` の枠の精度が他の写真でも保たれるか（今回は 1 枚・1 回）
- Vertex AI での処理時間（無料枠の待ち時間が無い場合）
