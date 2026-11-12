#!/bin/sh
# QA only (#55): the dev seed's Preview loops are one flat brown fixture (loop-ok.mp4), so every
# playing card looks the same. Replace each QA loop file with a 4 s, 1280x720 clip of its Work's
# poster: a slow push-in and a sweeping white bar, so playing, freezing and resuming are visible.
# The two Showreel files (videos/demo-showreel-*.mp4) are flat too: each becomes a 4 s test-pattern
# clip with a sweeping bar, at the size it already has (landscape and portrait), so metadata stays true.
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
  poster=""
  for candidate in images/demo-"$n"-*-1280x853.webp; do
    [ -e "$candidate" ] && poster=$candidate
    break
  done
  if [ -z "$poster" ]; then
    echo "make-loops.sh: no poster images/demo-$n-*-1280x853.webp for $loop; was the dev seed run in $1?" >&2
    exit 1
  fi
  ffmpeg -v error -y -loop 1 -framerate 25 -i "$poster" -t 4 \
    -vf "crop=1280:720,zoompan=z='1+0.0012*on':d=1:s=1280x720:fps=25,drawbox=x='mod(t*320\,1280)':y=0:w=28:h=ih:color=white@0.85:t=fill" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$loop.new.mp4"
  mv "$loop.new.mp4" "$loop"
  echo "ok $loop <- $poster"
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
  w=${size%x*}
  ffmpeg -v error -y -f lavfi -i "testsrc2=size=$size:rate=25" -t 4 \
    -vf "drawbox=x='mod(t*$w/4\,$w)':y=0:w=$w/40:h=ih:color=white@0.85:t=fill" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$reel.new.mp4"
  mv "$reel.new.mp4" "$reel"
  echo "ok $reel ($size)"
  count=$((count + 1))
done
if [ "$count" -eq 0 ]; then
  echo "make-loops.sh: no videos/demo-showreel-*.mp4 in $1; was the dev seed run there?" >&2
  exit 1
fi
