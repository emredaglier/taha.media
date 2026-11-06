#!/bin/sh
# Regenerates the small MP4 fixtures used by video.int.test.ts. Needs ffmpeg with libx264/libx265.
# Output is committed; nobody needs to run this unless a fixture changes.
set -e
cd "$(dirname "$0")"
v() { # name size seconds fps extra...
  n=$1; s=$2; d=$3; r=$4; shift 4
  ffmpeg -y -loglevel error -f lavfi -i "color=c=0x7a5c3e:s=$s:r=$r:d=$d" "$@" \
    -an -pix_fmt yuv420p -movflags +faststart "$n"
}
v loop-ok.mp4 640x360 2 10 -c:v libx264 -g 10
v portrait.mp4 360x640 2 10 -c:v libx264 -g 10
v long-12s.mp4 160x90 12 1 -c:v libx264 -g 12
v long-35s.mp4 160x90 35 1 -c:v libx264 -g 35
v long-200s.mp4 160x90 200 1 -c:v libx264 -g 200
v hd-1080.mp4 1920x1080 1 1 -c:v libx264
v uhd-1440.mp4 2560x1440 1 1 -c:v libx264
v hevc.mp4 320x180 1 5 -c:v libx265 -tag:v hvc1
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x7a5c3e:s=640x360:r=10:d=2" \
  -f lavfi -i "sine=frequency=440:duration=2" -c:v libx264 -g 10 -c:a aac -b:a 32k \
  -pix_fmt yuv420p -movflags +faststart with-audio.mp4
