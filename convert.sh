#!/bin/bash
input="$1"
output="${input%.*}.flac"  # Fixed pattern to remove only file extension
ffmpeg -i "$input" "$output"
rm "$input"