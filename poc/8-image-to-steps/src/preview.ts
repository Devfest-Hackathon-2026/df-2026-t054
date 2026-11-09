// 「元の場所（画像の範囲）が取れるか」を目で確かめるための HTML を作る．
// 画像に box2d の枠を重ね，LaTeX は該当行に印を付ける．依存なしの素の HTML．
import type { ThoughtSteps } from "./validate.ts";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COLORS = ["#d62728", "#1f77b4", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#e377c2", "#8c564b"];

export function renderPreview(
  doc: ThoughtSteps,
  images: { src: string; name: string }[],
  latexLines: string[] | undefined,
): string {
  const color = (id: string) => COLORS[(Number(id.slice(1)) - 1) % COLORS.length];

  const imageBlocks = images
    .map((img, i) => {
      const boxes = doc.steps
        .filter((s) => s.source.kind === "image" && s.source.imageIndex === i)
        .map((s) => {
          if (s.source.kind !== "image") return "";
          const [ymin, xmin, ymax, xmax] = s.source.box2d;
          const style = `top:${ymin / 10}%;left:${xmin / 10}%;height:${(ymax - ymin) / 10}%;width:${(xmax - xmin) / 10}%;border-color:${color(s.id)}`;
          return `<div class="box" style="${style}"><span style="background:${color(s.id)}">${s.id}</span></div>`;
        })
        .join("");
      return `<figure><figcaption>画像 ${i}: ${esc(img.name)}</figcaption><div class="frame"><img src="${esc(img.src)}">${boxes}</div></figure>`;
    })
    .join("");

  const latexBlock = latexLines
    ? `<figure><figcaption>LaTeX</figcaption><pre>${latexLines
        .map((line, i) => {
          const n = i + 1;
          // 範囲が重なるステップもあるので，当たったものを全部並べる
          const hits = doc.steps.filter(
            (s) => s.source.kind === "text" && s.source.lineStart <= n && n <= s.source.lineEnd,
          );
          const ids = hits.map((h) => h.id).join(",");
          const mark = hits.map((h) => `<b style="color:${color(h.id)}">${h.id}</b>`).join(",");
          return `${mark}${" ".repeat(Math.max(1, 8 - ids.length))}${String(n).padStart(3)}: ${esc(line)}`;
        })
        .join("\n")}</pre></figure>`
    : "";

  const rows = doc.steps
    .map((s) => {
      const where =
        s.source.kind === "image"
          ? `画像 ${s.source.imageIndex} [${s.source.box2d.join(", ")}]`
          : `行 ${s.source.lineStart}–${s.source.lineEnd}`;
      const why = s.why ? `${esc(s.why.text)} <small>(${s.why.by})</small>` : `<em>null</em>`;
      return `<tr><td><b style="color:${color(s.id)}">${s.id}</b></td><td>${esc(s.what)}</td><td>${why}</td><td><code>${esc(s.transcript ?? "")}</code></td><td>${where}</td></tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>思考ステップ プレビュー</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px;color:#222}
.frame{position:relative;display:inline-block;max-width:100%}
.frame img{display:block;max-width:100%;max-height:85vh}
.box{position:absolute;border:3px solid;box-sizing:border-box}
.box span{position:absolute;top:-1.4em;left:-3px;color:#fff;font-size:12px;padding:0 4px}
figure{margin:0 0 24px}
pre{background:#f6f6f6;padding:8px;overflow-x:auto}
table{border-collapse:collapse;width:100%}td{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
</style></head><body>
<h1>思考ステップ プレビュー</h1>
<table><tr><td>id</td><td>what</td><td>why</td><td>transcript</td><td>source</td></tr>${rows}</table>
<h2>元の場所</h2>
${imageBlocks}${latexBlock}
</body></html>
`;
}
