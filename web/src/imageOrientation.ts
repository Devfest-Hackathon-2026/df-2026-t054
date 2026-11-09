// 写真の EXIF の向き（Orientation）を画素に反映する．判断は docs/decisions/issue-49-image-orientation.md
// スマホで縦に撮った写真は，画素は横長のまま「縦向きで見る」という向きだけを EXIF に持つ．
// Vertex AI の Gemini はこの向きを反映しないので，上げる前にブラウザで回転しておく（反映しないと box2d が横倒しの座標で返る）

// 長辺の上限（px）．スマホの写真（4032×3024 など）は縮めない．これを超える写真だけ縮める
export const maxLongEdge = 4096

// 書き出す JPEG の品質．大きさが上限を超えたら次の品質で書き直す
const qualities = [0.92, 0.85, 0.75]

// JPEG の EXIF から向き（1〜8）を読む．EXIF が無い・読めないときは 1（回転なし）を返す
// 1: 回転なし／3: 180°／6: 時計回りに 90°（縦に持って撮った写真に多い）／8: 反時計回りに 90°／2・4・5・7: 鏡像つき
export async function readJpegOrientation(file: Blob): Promise<number> {
  try {
    // EXIF は先頭の APP1 セグメント（最大 64KB）に入っている
    const view = new DataView(await file.slice(0, 70 * 1024).arrayBuffer())
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1
    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset)
      // 先頭の 0xFF でなければ JPEG のセグメントではない．0xFFDA は画像データの始まり（これより後に EXIF は無い）
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1
      const length = view.getUint16(offset + 2)
      // APP1 で，中身が "Exif\0\0" から始まるもの
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
        return readTiffOrientation(view, offset + 10, Math.min(offset + 2 + length, view.byteLength))
      }
      offset += 2 + length
    }
  } catch {
    // 壊れた EXIF は無かったものとして扱う（今までどおりそのまま上げる）
  }
  return 1
}

// EXIF の中の TIFF 構造から Orientation（タグ 0x0112）を探す
function readTiffOrientation(view: DataView, tiff: number, end: number): number {
  const byteOrder = view.getUint16(tiff)
  const little = byteOrder === 0x4949 // 'II'．'MM'（0x4d4d）なら big endian
  if (!little && byteOrder !== 0x4d4d) return 1
  if (view.getUint16(tiff + 2, little) !== 42) return 1
  const ifd = tiff + view.getUint32(tiff + 4, little)
  if (ifd + 2 > end) return 1
  const count = view.getUint16(ifd, little)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return 1
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// 向きが「回転あり」の JPEG だけ，向きを反映した画素の JPEG にして返す．
// 向きの情報が無い・回転なしの画像，JPEG 以外（PNG・WebP）は何もせず元のファイルを返す．
// 変換に失敗したとき・変換後が maxBytes を超えるときも元のファイルを返す（今までと同じ動き）
export async function applyExifOrientation(file: File, maxBytes: number): Promise<File> {
  if (file.type !== 'image/jpeg') return file
  if ((await readJpegOrientation(file)) === 1) return file
  try {
    // 'from-image' で EXIF の向きを反映して読む．既定値に頼らず明示する
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try {
      const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const context = canvas.getContext('2d')
      if (!context) return file
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, quality)
        if (blob && blob.size <= maxBytes) {
          return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified })
        }
      }
    } finally {
      bitmap.close()
    }
  } catch {
    // 読み込み・描画に失敗したら，回転しないまま上げる
  }
  return file
}
