#!/bin/bash
# X client started by kmp-backend.service (replaces the old ~/.xinitrc).
xset s off
xset -dpms
xset s noblank
unclutter -idle 3 -root &

cd "$(dirname "$(readlink -f "$0")")/.."
exec ./node_modules/.bin/electron --touch-events --disable-gpu-sandbox .
