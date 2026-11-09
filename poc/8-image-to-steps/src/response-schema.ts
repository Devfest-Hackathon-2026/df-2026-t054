// Gemini の responseJsonSchema に渡す「Gemini に埋めさせる部分」のスキーマと，その型．
//
// 契約（shared/schema/thought-steps.schema.json, #6）との違い:
//   - id と schemaVersion は Gemini に作らせず，コード側で付ける（連番・定数を LLM に任せる理由がない）
//   - why.by は "post_quote" だけを許す．"author" は本人がアプリで書き込んだときの値なので AI には選ばせない
//   - transcript は契約では任意だが，人が what と原本を照らし合わせられるよう Gemini には必須で書かせる
//   - const の代わりに 1 要素の enum を使う（Gemini の構造化出力が const を受けるか未確認のため）
//   - LaTeX は契約の textSource（kind: "text"，1 始まりの行番号の範囲）．入力の各行に行番号を付けて答えさせる

export type WhyFromPost = { text: string; by: "post_quote" };

export type ImageSource = { kind: "image"; imageIndex: number; box2d: [number, number, number, number] };
export type TextSource = { kind: "text"; lineStart: number; lineEnd: number };

export type GeminiStep = {
  what: string;
  why: WhyFromPost | null;
  transcript: string;
  source: ImageSource | TextSource;
};

export type GeminiResponse = { steps: GeminiStep[] };

export function buildResponseSchema(input: { imageCount: number; latexLineCount: number }): object {
  const sources: object[] = [];
  if (input.imageCount > 0) {
    sources.push({
      type: "object",
      description: "画像の中で，このステップが書かれている範囲",
      properties: {
        kind: { type: "string", enum: ["image"] },
        imageIndex: {
          type: "integer",
          description: "何枚目の画像か（0 始まり）",
          minimum: 0,
          maximum: input.imageCount - 1,
        },
        box2d: {
          type: "array",
          description: "範囲 [ymin, xmin, ymax, xmax]．画像の幅・高さを 1000 とした整数",
          items: { type: "integer", minimum: 0, maximum: 1000 },
          minItems: 4,
          maxItems: 4,
        },
      },
      required: ["kind", "imageIndex", "box2d"],
    });
  }
  if (input.latexLineCount > 0) {
    sources.push({
      type: "object",
      description: "LaTeX の中で，このステップが書かれている行の範囲（行番号は入力に付けた番号）",
      properties: {
        kind: { type: "string", enum: ["text"] },
        lineStart: { type: "integer", minimum: 1, maximum: input.latexLineCount },
        lineEnd: { type: "integer", minimum: 1, maximum: input.latexLineCount },
      },
      required: ["kind", "lineStart", "lineEnd"],
    });
  }

  return {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "思考ステップ．考えた順に並べる",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            what: {
              type: "string",
              description: "何をしたか．短く．正誤・良し悪しの評価は書かない",
            },
            why: {
              description:
                "本人が投稿の中に理由を書いているときだけ，その文をそのまま引用する．書いていなければ null．推測しない",
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "本人が書いた理由の引用（言い換えない）" },
                    by: { type: "string", enum: ["post_quote"] },
                  },
                  required: ["text", "by"],
                },
              ],
            },
            transcript: {
              type: "string",
              description: "その範囲に実際に書かれている式・文の書き起こし．数式は LaTeX",
            },
            source: sources.length === 1 ? sources[0] : { anyOf: sources },
          },
          required: ["what", "why", "transcript", "source"],
        },
      },
    },
    required: ["steps"],
  };
}
