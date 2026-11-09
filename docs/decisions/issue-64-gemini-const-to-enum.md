# Gemini に渡すスキーマでは const を値1つの enum に置き換える（2026-11-08）

- 決めたこと: `server/src/contract.ts` の `schemaFor` で，Gemini の `responseJsonSchema` に渡す直前にスキーマ中の `const` をすべて `enum: [値]` に置き換える．`shared/schema/` の契約（`const` のまま）は変えない
- 理由: 画像の投稿で，`"kind": {"const": "image"}` と指定しても Gemini（gemini-3.1-flash-lite）は `source.kind` に `"text"` を返し，全ステップが捨てられて失敗した．同じ画像で `enum: ["image"]` にすると，結果を確かめた3回とも全ステップが `"image"` になった．意味は同じなので契約は変えずに済む
- 使わない種類の定義（画像なら `$defs` の `textSource`・`videoSource`）も消す．レビューで「残った定義に引きずられて `"text"` が返ったのでは」と指摘があったので，同じ画像で各2回試した．const のままだと，定義を残しても消しても全ステップ `"box"`（どの種類でもない値）が返り，enum にすると定義を消しても全ステップ `"image"` だった．原因は const が効かないことで，定義を消すのは紛らわしさをなくすため
- const の置き換えは，スキーマのキーワードの位置だけにする（`properties`・`$defs` の直下は名前なので，`const` という名前のプロパティは置き換えない）．`server/test/contract.test.ts` で確かめる
- 捨てた案とその理由:
  - 契約の `const` を `enum` に書き換える: 契約の変更になり単独の PR と確認が要る．JSON Schema としては `const` のほうが素直で，Gemini 向けの都合は server 側で吸収すれば足りる
  - `normalizeSteps` で `source.kind` を投稿の種類で上書きする: 今回は直るが，モデルがスキーマを守っていないことを見えなくする．中身（`imageIndex`・`box2d`）の検査はそのまま効くので悪くはないが，まずはスキーマで守らせる
