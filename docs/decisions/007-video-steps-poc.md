# 動画のステップ化は Vertex AI の Gemini に gs:// を渡し，契約のスキーマで構造化出力させる（2026-11-06）

<!-- PoC #7 の判断．本番のモデル・時刻の形の最終決定は #9（比較メモ）で行う -->

- 決めたこと:
  - 動画は Cloud Storage に置き，Vertex AI の `generateContent` に `fileData.fileUri: gs://...` で渡す（サイズによらず同じ経路．20MB 超の inline 制限を気にしなくてよい）
  - SDK は `@google/genai`（Vertex AI モード，ADC で認証）．`web/` と同じ TypeScript にそろえ，Node 24 の型の取り除きでそのまま実行する（tsx などは足さない）
  - 構造化出力は `responseJsonSchema`．契約のスキーマ（`shared/schema/thought-steps.schema.json`）をそのまま渡し，時刻は秒で受け取る（PoC の既定 `--mode contract`）
  - `why` は「transcript の中にそのまま有る引用」だけを残し，`by` はコードが `post_quote` を付ける
  - PoC の第一候補モデルは `gemini-3.1-flash-lite`（5 分の動画 1 本 約 2 円）．精度が足りなければ `gemini-3.8-flash`（約 4 円）
- 理由:
  - 本番の投稿は Firebase Storage（中身は Cloud Storage のバケット）に入るので，`gs://` を渡す経路なら PoC と本番で同じ形になる
  - 69 秒の合成動画で，どのモデル・モードでも契約に合う JSON が返り，理由は本人が話した「方針」のステップだけが引用された．flash-lite を各モード 3 回ずつ回すと，contract は 3 回とも 4 ステップ・開始のずれ平均 0.1〜0.35 秒で安定した
  - クレジット $20 を節約したいので，安いモデルで足りるかを先に確かめた
- 捨てた案とその理由:
  - Gemini API（AI Studio）の Files API: クレジットが AI Studio に効かず，48 時間で消えるので本番の Storage と経路が分かれる
  - 動画を inline（base64）で送る: 20MB を超える実際の動画で使えない
  - 時刻を `MM:SS` で答えさせる（README の候補）: 整数秒になり，ずれは平均 0.3〜0.8 秒．3 回中 2 回は挨拶もステップにした．秒で答えさせた方が正確で安定した．ただし秒では最後の `endSec` が 3 回とも動画の長さを超えたので，本番では動画の長さで切り詰める
  - `gemini-2.5-flash`: このプロジェクトでは 404 で使えなかった
  - 検証に `ajv` を足す: PoC では依存を増やさず手書きの検証にした．本番（#14）で改めて決める
- 未決: 実際の手書き説明動画での精度（#23 の動画ができたら試す），本番のモデル（#9）
