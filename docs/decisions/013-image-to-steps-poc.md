# 画像・LaTeX のステップ化 PoC は TypeScript ＋ `@google/genai` で書き，既定のモデルは gemini-3.5-flash にする（2026-11-08）

<!-- 2026-11-06 に書き始めたときは 003 だったが，main と他の PR で 003〜012 が使われたため 013 にした -->

- 決めたこと:
  - `poc/8-image-to-steps/` を TypeScript で書き，Gemini は公式 SDK `@google/genai` で呼ぶ．実行は Node 24 の型除去（`node src/main.ts`），型チェックは `tsc --noEmit`
  - AI Studio（`GEMINI_API_KEY`，課金なしのプロジェクト）と Vertex AI（`GOOGLE_GENAI_USE_VERTEXAI=true` ＋ ADC）を `.env` だけで切り替える．PoC は AI Studio の無料枠で試し，運営のクレジットは使わない
  - Gemini には契約スキーマそのものではなく，「Gemini に埋めさせる部分」だけのスキーマを渡す．`id`・`schemaVersion` はコードで付け，`kind` は 1 要素の `enum`，`why.by` は `post_quote` だけを許す
  - 出力は ajv で契約スキーマに通し，スキーマで表せない約束（`why.text` が同じステップの `transcript` に含まれるか，`what` に評価語が無いか）もコードで確かめる
  - 既定のモデルは `gemini-3.5-flash`
- 理由:
  - #14 の `server/` も TS ＋ `@google/genai` なので，PoC で試したプロンプトやモデルの違いをそのまま持ち込める
  - Node 24 は `.ts` を直接実行できるので，tsx などの実行用の依存を増やさずに済む
  - `@google/genai` は AI Studio と Vertex AI を同じ API で扱えるので，クレジットの都合で経路を変えてもコードが変わらない
  - 契約スキーマをそのまま渡す実験で，構造化出力が `const` を守らないこと（`schemaVersion: "1.0"`，`kind: "latex"`）を確かめた
  - `why.by: "author"` を Gemini に選ばせないことで，「AI が理由を書かない」原則をプロンプトだけでなくスキーマでも強制できる
  - 手書き写真で，`gemini-3.1-flash-lite` は枠が約 1 行ぶん上にずれる写真があった（EXIF・解像度を変えても同じ）．`gemini-3.5-flash` は同じ写真でほぼぴったりで，`gemini-3.8-flash`（151〜478 秒）より速い
- 捨てた案とその理由:
  - Python で書く: Gemini の PoC 例は多いが，#14 の `server/` と言語が分かれる
  - tsx で実行する: 依存が1つ増えるだけで，Node 24 で足りる
  - 契約スキーマをそのまま `responseJsonSchema` に渡す: API は受け付けるが `const` が守られず，`by: "author"` も選べてしまう
  - 出力の検証を省く（構造化出力を信じる）: 実際に `const` が守られなかった．「スキーマ通りの JSON が取れる」を確かめるのが #8 の目的なので，独立に検証する
  - 既定を `gemini-3.1-flash-lite`（#7 の既定）にする: 速いが手書きの枠がずれる．動画（#7）と画像で向くモデルが違う
  - 既定を `gemini-3.8-flash` にする: 枠は正確だが，無料枠で 2〜8 分かかり，混雑（503）も多い
- 未決: #14 で画像に使うモデル（#9 で処理時間・費用と合わせて決める），区切り方の細かさ（`gemini-3.5-flash` は題名・消した行もステップにする）
