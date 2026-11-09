# 2つの投稿の対応関係は「同じ／分かれた」の区間の列にし，全員のステップがそろったら Cloud Functions で全ペア分を作って `problems/{problemId}/comparisons/{uidA}_{uidB}` に保存する（2026-11-08）

- 決めたこと:
  - 形（新しい契約）: `shared/schema/step-alignment.schema.json`．`{ schemaVersion, segments[] }` で，各区間は `{ type: 'same' | 'split', a: id[], b: id[] }`．a・b それぞれ全区間の id をつなぐとステップ列に一致する．`same` → `split` の境目が分岐点，`split` → `same` の境目が合流点（README に書いた）
  - Gemini に答えさせるのは「同じことをしたステップの組」（`matches: [{ a: id[], b: id[] }]`）だけ．`responseJsonSchema` で id を実際のステップの id の `enum` に絞る．続いていない組・重なる組・順番が食い違う組を捨て（含むステップが最も多くなる組み合わせを選ぶ），区間に並べるのはコード（`server/src/alignment.ts`）で行い，`validateStepAlignment` で確かめてから保存する
  - Gemini に渡すのは問題文と，各ステップの `id`・`what`・`transcript` だけ．`why` の項目と元の場所は渡さない（`post_quote` の `why.text` は transcript にそのまま含まれる引用なので，その文は transcript の一部として届く）
  - プロンプトで「正しい・誤っている・どちらがよいは判断しない．理由や説明は書かない」と指示する．出力に文章の項目を作らない
  - トリガー: `problems/{problemId}/steps/{uid}` の書き込み（`onDocumentWritten`）で，新しく `done` になったとき．問題が「全員が提出した」（011 と同じ条件）ときだけ，ステップが `done` の人どうしの組をすべて作る．作り済みの組（同じ `postCreatedAt` どうし）は飛ばす
  - 3人以上なら全ペア（n(n-1)/2 組）を作る．画面で2人を選ぶ
  - Firestore のデータ構造（共有の契約）:
    ```
    problems/{problemId}/comparisons/{uidA}_{uidB}   ← uidA < uidB（文字列の順）
      status: 'processing' | 'done' | 'failed'
      uids: [uidA, uidB]                ← segments の a が uidA，b が uidB
      aPostCreatedAt: Timestamp         ← どの投稿どうしの結果か（steps/{uid}.postCreatedAt）
      bPostCreatedAt: Timestamp
      alignment: StepAlignment | null   ← done のとき．形は shared/schema/step-alignment.schema.json
      warnings: string[]                ← 捨てた組の理由（確認用）
      error: string | null              ← failed のとき画面に出す文言
      model: string
      updatedAt: Timestamp
    ```
  - ルール: 書くのはサーバーだけ．読めるのは，全員が提出したあとの参加者（011 の `canSeeOthers()` を使う）．`get`・`list` とも許す（#17 で問題の組をまとめて読むため）．テストは `firebase/test/rules.test.ts`
  - ルールの反映: リポジトリ直下で `npx firebase-tools@15 deploy --only firestore:rules,functions`（レビュー後に人が行う）
- 理由:
  - 区間の列にしたのは，#17 の図（2本の道が分かれて合流する）をそのまま描けるから．分岐点・合流点を別に持つと区間と食い違いうる
  - 区間そのものを Gemini に作らせず組だけ答えさせたのは，「全ステップを順に1回ずつ」という決まりを LLM に守らせるのは難しく，組なら1つずつ確かめて捨てられるから．#14 と同じく「AI の出力はコードで直して契約に合わせる」方針
  - 「同じことをしたか」は正誤の判定ではない．組にしない（split）ことは「誤り」ではなく「道が違う」だけで，どちらがよいかは表さない
  - `why` の項目を渡さないのは，本人がアプリで書いた理由（`author`）の有無や中身で「同じ」の判断が引っ張られないようにするため．`post_quote` の文は transcript から取り除かない．取り除くと原本の書き起こしが欠け，同じ式・文を書いたかの判断材料が減るため（レビューで指摘されて書き直した）．元の場所は対応の判断に要らない
  - 全員がそろうまで作らないのは，そろうまで他人の投稿を見せない（011）ので早く作っても使えず，そろえば締め切られて投稿もステップも変わらないので結果が固まるから
  - ステップの `done` をトリガーにしたのは，最後に提出した人のステップ化が終わった時点が「全部そろった」ときだから．problem の `submittedUids` の更新では，まだステップができていない
  - 画面が開いたときに作る（Callable）案より，トリガーの方が #14 と同じ形で，画面を開いたときにはもうできている
- 捨てた案とその理由:
  - Gemini に `segments` をそのまま作らせる: 抜け・重複・順番の誤りがあると全体を捨てるしかない
  - 「分岐点」「合流点」のステップ id の一覧で持つ: 図を描くにはどこまでが同じかも要り，結局区間に直す
  - 組ごとに「何が同じか」の説明を AI に書かせる: 画面に AI の文章が増え，「AI は整理するだけ」の線が曖昧になる．what を並べれば足りる
  - 埋め込み（embedding）の類似度で組を作る: 書き方が違う同じ操作（`n!+1` と `p_1⋯p_n+1`）を拾えるか分からず，順番の制約も別に要る．Gemini 1回で済む
  - Callable Function で画面から呼ぶ: 上の理由．呼ぶまで費用はかからないが，初回の表示が待たされる
  - 最初の2人だけを比べる: 3人目が比べられない．デモは2人なので費用は変わらない
- 承知のうえの弱さ:
  - Gemini の呼び出しは本番にデプロイして確かめていない（ローカルに ADC が無く，エミュレータでは demo プロジェクトのため 403 になる）．トリガー・組の作り方・保存はエミュレータで確かめた（未提出の人がいる間は作らない，3人で 3 組が1回ずつできる）
  - `failed` になった組を作り直す仕組みが無い．締め切り後は投稿もステップも変わらないので，次のトリガーが来ない（直すなら Callable で作り直すボタンを足す）
  - 締め切り後にステップ化が `failed` になった人は，出し直せない（011）ので，その人を含む組は作られない
  - n 人なら Gemini を n(n-1)/2 回呼ぶ．MVP では人数に上限が無い
  - 「全員が提出した」の条件を書く場所が4か所になった（ルール2つ・web・server）
- #17（図）への申し送り（レビューより）:
  - 「同じ／分かれた」も AI の判断（提案）なので，図では「AI が対応づけた」と分かるように見せ，人が「ここは違う」と言える入口を考える（最終判断は人がする）
  - `processing` のまま `updatedAt` が古い（目安 6 分．#14 のステップと同じ）組は，`failed` と同じく「比べられませんでした」として出す．締め切り後は作り直しの口が無いため
