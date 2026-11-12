#!/bin/sh
# QA only (#55): the dev seed's Preview loops are one flat brown fixture (loop-ok.mp4), so every
# playing card looks the same. Replace each QA loop file with a 4 s, 1280x720 test-pattern clip
# (testsrc2: timecode and moving line) in a hue of its own per card, so playing, freezing and
# resuming are visible and the cards differ.
# The two Showreel files (videos/demo-showreel-*.mp4) are flat too: each becomes the same kind of
# 4 s test-pattern clip at the width and height it already has, so those stay true.
# The stored duration stays the fixture's 2 s; the web reads it from the element.
# Needs ffmpeg and ffprobe.
# Usage: sh make-loops.sh <qa dir>
set -e

if [ -z "$1" ] || [ ! -d "$1" ]; then
  echo "Usage: sh make-loops.sh <qa dir>" >&2
  exit 2
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "make-loops.sh needs ffmpeg and ffprobe, which are not installed (brew install ffmpeg)." >&2
  exit 1
fi

cd "$1"
count=0
for loop in videos/demo-previewloop-*.mp4; do
  [ -e "$loop" ] || continue
  n=$(basename "$loop" | sed -E 's/demo-previewloop-([0-9]+)-.*/\1/')
  ffmpeg -v error -y -f lavfi -i "testsrc2=size=1280x720:rate=25" -t 4 \
    -vf "hue=h=$((n * 47 % 360))" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$loop.new.mp4"
  mv "$loop.new.mp4" "$loop"
  echo "ok $loop (hue $((n * 47 % 360)))"
  count=$((count + 1))
done
if [ "$count" -eq 0 ]; then
  echo "make-loops.sh: no videos/demo-previewloop-*.mp4 in $1; was the dev seed run there?" >&2
  exit 1
fi

count=0
for reel in videos/demo-showreel-*.mp4; do
  [ -e "$reel" ] || continue
  size=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$reel")
  ffmpeg -v error -y -f lavfi -i "testsrc2=size=$size:rate=25" -t 4 \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$reel.new.mp4"
  mv "$reel.new.mp4" "$reel"
  echo "ok $reel ($size)"
  count=$((count + 1))
done
if [ "$count" -lt 2 ]; then
  echo "make-loops.sh: expected 2 videos/demo-showreel-*.mp4 in $1, found $count; was the dev seed run there?" >&2
  exit 1
fi
