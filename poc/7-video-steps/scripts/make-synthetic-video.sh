#!/usr/bin/env bash
# 台本（samples/<name>.script.json）から合成の説明動画と正解の区間を作る．
#   出力: samples/<name>.mp4，samples/<name>.truth.json（各ステップの正しい開始・終了秒）
# 必要: macOS（say, swift），ffmpeg, ffprobe, node
set -euo pipefail
cd "$(dirname "$0")/.."
name="${1:-synthetic-primes}"
script="samples/$name.script.json"
build="samples/build/$name"
rm -rf "$build" && mkdir -p "$build"

n=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$script','utf8')).segments.length)")
voice=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$script','utf8')).voice)")
rate=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$script','utf8')).rate)")

: > "$build/list.txt"
for ((i = 0; i < n; i++)); do
  # 板書の画像
  node -e "
    const s = JSON.parse(require('fs').readFileSync('$script','utf8')).segments[$i];
    process.stdout.write(s.board.join('\0'));
  " | xargs -0 swift scripts/render-board.swift "$build/$i.png"
  # 読み上げ（区間の最後に 0.8 秒の間を入れる）
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$script','utf8')).segments[$i].narration + ' [[slnc 800]]')" > "$build/$i.txt"
  say -v "$voice" -r "$rate" -f "$build/$i.txt" -o "$build/$i.aiff"
  # 画像＋音声 → 区間の動画
  # -shortest だと静止画の映像が音声より数秒長くなることがあるので，音声の長さで明示的に切る
  adur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$build/$i.aiff")
  ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 10 -i "$build/$i.png" -i "$build/$i.aiff" \
    -c:v libx264 -tune stillimage -pix_fmt yuv420p -r 10 -c:a aac -b:a 96k -ar 44100 -t "$adur" "$build/$i.mp4"
  echo "file '$i.mp4'" >> "$build/list.txt"
done

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$build/list.txt" -c copy "samples/$name.mp4"

# 正解の区間: 各区間の長さ（ffprobe）を足していく
durations=()
for ((i = 0; i < n; i++)); do
  durations+=("$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$build/$i.aiff")")
done
node -e "
  const s = JSON.parse(require('fs').readFileSync('$script','utf8'));
  const d = process.argv.slice(1).map(Number);
  let t = 0; const steps = [];
  s.segments.forEach((seg, i) => {
    if (seg.step) steps.push({ id: seg.step, label: seg.label, startSec: +t.toFixed(2), endSec: +(t + d[i]).toFixed(2) });
    t += d[i];
  });
  require('fs').writeFileSync('samples/$name.truth.json', JSON.stringify({ totalSec: +t.toFixed(2), steps }, null, 2) + '\n');
  console.log('動画の長さ', t.toFixed(1), '秒'); console.table(steps);
" "${durations[@]}"
ls -la "samples/$name.mp4"
# 映像と音声の長さがそろっているか（ずれていると正解の区間が信用できない）
ffprobe -v error -show_entries stream=codec_type,duration -of compact "samples/$name.mp4"
