# 思考ステップのスキーマ（契約）

1つの投稿（手書き写真・LaTeX などのテキスト・説明動画）を「思考ステップ」の列にした JSON の形を決める．
Gemini によるステップ化（#7, #8）・保存（#14）・比較 UI（#15〜）はすべてこの形を前提にする．

**このディレクトリは共有の契約．変更は単独の PR にし，誰か1人の確認を得て，マージ前に Discord で告知する．**

**スキーマを変えたら，同じ形を手で書いている次の2つも直す**: `server/src/contract.ts`（型と保存前の検証），`web/src/thoughtSteps.ts`（表示に使う型）．
対応関係のスキーマ（`step-alignment.schema.json`）と問いかけのスキーマ（`step-questions.schema.json`），式変形の確認のスキーマ（`math-checks.schema.json`）は `server/src/contract.ts` に型と検証を手で書いている（画面の型は #17・#20 で足す）．

| ファイル | 内容 |
|---|---|
| `thought-steps.schema.json` | スキーマ本体（JSON Schema draft 2020-12） |
| `examples/image.sample.json` | 手書きノート（2枚）のサンプル．背理法で証明 |
| `examples/text.sample.json` | LaTeX の投稿のサンプル．`n! + 1` で n より大きい素数を作る．本文は `examples/text.sample.tex`（行番号はこのファイルの行） |
| `examples/video.sample.json` | ホワイトボード説明動画のサンプル．新しい素数を作る方針で証明 |
| `step-alignment.schema.json` | 2つの投稿のステップの対応（同じ・分岐・合流）．下の「2つの投稿の対応関係」を参照 |
| `examples/alignment.image-video.sample.json` | `image.sample.json`（a）と `video.sample.json`（b）の対応のサンプル |
| `step-questions.schema.json` | 2つの投稿を比べたときの AI の問いかけ（分岐点・why が空のステップ）．下の「AI の問いかけ」を参照 |
| `examples/questions.image-video.sample.json` | 上の対応での問いかけのサンプル（手で書いた形の例．Gemini の実際の出力ではない） |
| `math-checks.schema.json` | 式を変形したステップを SymPy で確かめた結果（参考）．下の「式変形の確認」を参照 |
| `examples/algebra.sample.json` | 式の計算の投稿のサンプル（`(x+1)^2 - (x-1)^2` を展開する．途中にわざと書き誤りがある）．本文は `examples/algebra.sample.tex` |
| `examples/math-checks.algebra.sample.json` | `algebra.sample.json` の式変形の確認のサンプル |

サンプルは統合案6章のデモ（「素数が無限にあること」を別々に証明）を想定した架空のデータ．どれも s1 で道が分かれている．

## 形

```jsonc
{
  "schemaVersion": "0.1.0",
  "steps": [
    {
      "id": "s1",                 // 投稿内で一意．分岐点・質問から参照する
      "what": "…",                // 何をしたか（必須）
      "why": null,                // なぜ（null を許す）または { "text": "…", "by": "post_quote" | "author" }
      "transcript": "…",          // 元の場所に書かれた式・文／話した言葉（任意．post_quote のときは必須）
      "source": { "kind": "image", "imageIndex": 0, "box2d": [ymin, xmin, ymax, xmax] }
      //   または { "kind": "text", "lineStart": 3, "lineEnd": 4 }
      //   または { "kind": "video", "startSec": 21.5, "endSec": 38.0 }
    }
  ]
}
```

## 守ること（設計原則との対応）

- **`why` を AI が推測して書かない**．AI が埋めてよいのは，投稿の中で本人が書いた・話した理由をそのまま引用するとき（`by: "post_quote"`）だけ．そうでなければ `null` にして，AI は問いかけるだけにする．本人がアプリで書き込んだら `by: "author"`
  - **注記: `by: "author"` は今は使っていない値**．今の設計（#20，PR #62）では，AI の問いかけに本人が書いた理由は `problems/{problemId}/comparisons/{uidA}_{uidB}/answers/{side}_{stepId}` に保存し，`steps/{uid}` の `why` には書かない（理由とルールは `docs/decisions/issue-20-author-answers.md`）．値はスキーマに残しているが，今のアプリは `why` に `by: "author"` を書かない．AI が `by: "author"` を返したときも，サーバー（`server/src/steps.ts` の `normalizeSteps`）が `why` を `null` にして捨てる
- **`post_quote` には次の2つを条件にする**
  - 同じステップに `transcript` があり，`why.text` がその中にそのまま含まれていること．満たさなければ `why` を `null` にする（#7 の PoC がコードで確かめているのと同じ決まり）
  - UI では「AI が抜き出した本人の言葉」と表示し，本人が承認・削除できるようにする．`transcript` 自体も AI の書き起こしで誤りうる（#7 で「背理法」が「入り法」になった例がある）ので，文字列が含まれているかの確認だけでは本人の言葉だと保証できない
- **`what` に正誤の評価を書かない**（「正しく示した」「誤って〜」など）．何をしたかだけを書く
- `transcript` は原本の書き起こし．AI の言い換えではなく，人が `what` と原本を照らし合わせるための材料

## 元の場所 `source`

| kind | フィールド | 意味 |
|---|---|---|
| `image` | `imageIndex` | 投稿内の何枚目の画像か（0 始まり） |
| | `box2d` | `[ymin, xmin, ymax, xmax]`．画像の幅・高さを 1000 とした整数．Gemini が返す bounding box と同じ形なので変換なしで受け取れる．表示するときは `top = ymin / 1000 * 画像の高さ` のように割り戻す |
| `text` | `lineStart`, `lineEnd` | 投稿の本文を改行で分けたときの行番号（1 始まり，`lineEnd` の行を含む）．Gemini には各行の先頭に行番号を付けて渡し，番号で答えさせる．LaTeX もコードもこの形 |
| `video` | `startSec`, `endSec` | 秒（小数可）．`<video>` の `currentTime` にそのまま渡せる |

## 使う側で確かめる決まり（スキーマでは表せない・表さない）

AI の出力を保存する前（#14）と，PoC の検証で確かめる．満たさないステップは捨てるか，人に直してもらう．

| 決まり | 備考 |
|---|---|
| `id` が投稿の中で重複しない | |
| `box2d` は `ymin ≤ ymax`，`xmin ≤ xmax` | |
| `lineStart ≤ lineEnd ≤ 本文の行数` | |
| `startSec ≤ endSec ≤ 動画の長さ` | #7 で 69 秒の動画に 104 秒が返った例がある |
| `why.by = "post_quote"` なら `transcript` があり，`why.text` を含む | Gemini にそのまま渡せる形を保つため，`if`/`then` でスキーマに書くのはやめた（下を参照） |

## Gemini の構造化出力に渡すとき

- このスキーマは `responseJsonSchema` にそのまま渡せる（#7 の PoC で確認．`$schema`・`$id`・`$defs`/`$ref`・`anyOf`・`const`・`pattern` を含んだまま通った）
- `textSource` を足した版はまだ Gemini に渡していない．#8 の PoC で確かめる
- 動画の時刻は，Gemini に `MM:SS` で答えさせて秒に直す方が安定するかもしれない．その場合も保存は秒にする

## まだ決めていないこと

- 1つの投稿にテキストが2つ以上あるとき（`textIndex`）．MVP では1投稿1テキストとする
- 1行に長く書いた LaTeX の中の細かい範囲．実データで困ったら単位を足す
- 人が付ける質問とスレッドの形（#21 で決める）．AI の問いかけは下の「AI の問いかけ」

## 2つの投稿の対応関係（`step-alignment.schema.json`）

2つの投稿（a と b）のステップ列を，頭から順に区間（segment）に分けたもの（#16）．`a`・`b` は思考ステップの `id` を並べる．

```jsonc
{
  "schemaVersion": "0.1.0",
  "segments": [
    { "type": "split", "a": ["s1"], "b": ["s1"] },  // 最初から道が分かれている
    { "type": "same",  "a": ["s2"], "b": ["s2"] },  // ← 合流点（split → same）
    { "type": "same",  "a": ["s3"], "b": ["s3"] },
    { "type": "split", "a": ["s4"], "b": ["s4"] }   // ← 分岐点（same → split）
  ]
}
```

- `same`: a の `a[]` と b の `b[]` が同じことをしている（記号や書き方は違ってよい）．1つと2つが対応してもよい（`a: ["s3"], b: ["s3", "s4"]`）
- `split`: 道が分かれていて，対応するステップがない．片方は空でもよい（もう片方だけが寄り道した部分）
- **分岐点** は `same` → `split` の境目（直前の `same` の最後のステップから分かれた）．先頭が `split` なら最初から分かれている
- **合流点** は `split` → `same` の境目（その `same` の最初のステップで道が戻った）
- 正誤やどちらがよいかは表さない．「同じことをしたか」だけ

### 対応関係で使う側が確かめる決まり

| 決まり | 備考 |
|---|---|
| a について，全区間の `a` をつなぐと投稿の `steps` の `id` に順番どおり一致する（抜け・重複なし）．b も同じ | |
| `same` は `a`・`b` ともに1つ以上 | |
| `split` は `a`・`b` の少なくとも片方が1つ以上．`split` が2つ続かない | 続いたら1つにまとめる |

`server/src/alignment.ts` が Gemini の返り値をこの形に直し，`server/src/contract.ts` の `validateStepAlignment` で確かめてから保存する．Gemini には区間ではなく「同じことをしたステップの組」だけを答えさせ，順番が食い違う組を捨てて区間に並べるのはコードで行う．

## AI の問いかけ（`step-questions.schema.json`）

2つの投稿を比べたとき，ステップを書いた本人に向けて AI が出す問い（#19）．本人が理由を書き込む（#20）きっかけにする．

```jsonc
{
  "schemaVersion": "0.1.0",
  "questions": [
    { "side": "a", "stepId": "s1", "kind": "branch", "text": "もう1人は…から始めました．あなたはなぜ…のですか？", "by": "ai" },
    { "side": "a", "stepId": "s2", "kind": "missing_why", "text": "…したのはなぜですか？", "by": "ai" },
    { "side": "b", "stepId": "s4", "kind": "branch", "text": "ここでもう1人とは別の進め方になりました．…", "by": "template" }
  ]
}
```

- **どのステップに問うかはコードが決める**（`server/src/questions.ts` の `questionTargets`）．Gemini は問いの文だけを書く
  - `branch`: 対応関係の `split` の区間で，その側の最初のステップ（道が分かれて最初にしたこと）．`why` があっても問う（もう1人と比べた「なぜこちらを選んだか」は別の問いなので）．片方が空の `split` では，空の側には付けない
  - `missing_why`: それ以外で `why` が `null` のステップ
- `by: "template"` は Gemini の問いが無い・使えなかったときの決まった文．画面ではどちらも「AI の問いかけ」と分かるように出す
- 問いは2人の組ごとに作る．3人以上だと，同じステップに組の数だけ問いが付きうる

### 問いかけで使う側が確かめる決まり

| 決まり | 備考 |
|---|---|
| `stepId` が `side` の投稿のステップにある．1つのステップに問いは1つまで．並びは a の順，次に b の順 | |
| `text` は1文（改行なし）で「？」で終わり，120字まで | |
| `text` に答え・理由の候補・ヒント・正誤の評価を含まない | コードでは目安で捨てて決まった文にする: 理由を一から問う疑問詞（なぜ・どうして・何・どの・どう・どんな）を含まない問い（はい／いいえで答える問いはほぼ必ず理由の候補を含む），「〜だからですか？」の形，「正しい」などの評価の言葉．漏れはありうるので，プロンプトでも禁じている |

`server/src/questions.ts` が Gemini の返り値をこの形に直し，`server/src/contract.ts` の `validateStepQuestions` で確かめてから保存する．

## 式変形の確認（`math-checks.schema.json`）

1つの投稿で，本人が式を書き換えたところ（`A = B` の A → B）を SymPy で確かめた結果（#22）．**参考の情報で，正誤の判定ではない**．

```jsonc
{
  "schemaVersion": "0.1.0",
  "checks": [
    { "stepId": "s1", "before": "(x + 1)**2", "after": "x**2 + 2*x + 1", "result": "same", "detail": null },
    { "stepId": "s1", "before": "(x - 1)**2", "after": "x**2 - 2*x - 1", "result": "not_confirmed", "detail": "2" }
  ],
  "code": "import json\nfrom sympy import ..."   // 実際に実行したコード．checks が空なら null
}
```

- `before`・`after` は投稿の式を Gemini が SymPy の書き方に写したもの．直したり補ったりしない（写し間違いはありうる）．使える名前は1文字の変数と，決めた数学の関数・定数・ギリシャ文字だけ（`server/src/mathChecks.ts` の `ALLOWED_NAMES`．`parse_expr` が中で `eval` するため）
- `result`: `same` = SymPy で同じ式になった（`simplify(before - after)` が 0 か，`equals(0)` が True）．`not_confirmed` = SymPy では同じだと確かめられなかった（`sqrt(x**2)` と `x` のように，条件しだいで同じになる式もここに入る）．`unparsed` = 式として読み取れなかった
- 画面では「正しい／誤り」と書かず，上の事実だけを書く
- 文字の置き方（`M = n! + 1 とおく`）や，方程式・不等式を解く変形は対象にしない

### 式変形の確認で使う側が確かめる決まり

| 決まり | 備考 |
|---|---|
| `stepId` が投稿のステップにあり，ステップの順に並ぶ | 1つのステップに2つ以上あってよい |
| `checks` が空なら `code` は `null`，そうでなければ空でない文字列 | |
| `result` が `same` なら `detail` は `null` | |

`server/src/mathChecks.ts` が組み立て，`server/src/contract.ts` の `validateMathChecks` で確かめてから保存する．
