#!/bin/bash
#
# encode_silent.sh
# Usage: ./encode_silent.sh /path/to/videos
#
# This script recursively finds all .mp4 files under the specified directory
# and re-encodes them with H.264 baseline (level 3.0), no audio track, and
# faststart for web streaming compatibility. Each output is named *_encoded.mp4
# in the same folder as the original.
#
# IMPORTANT:
#  - Uses -print0 and a null-delimited read to handle special characters.
#  - Ensures any existing spaces, parentheses, etc. in filenames are handled.

if [ -z "$1" ]; then
  echo "Usage: $0 <directory>"
  exit 1
fi

SOURCE_DIR="$1"

# Find all .mp4 files (case-insensitive) in SOURCE_DIR and handle special chars
find "$SOURCE_DIR" -type f \( -iname '*.mp4' \) -print0 | while IFS= read -r -d '' file; do
  
  # Construct an output filename by appending _encoded before .mp4
  # e.g., color_video_04_15_skip.mp4 -> color_video_04_15_skip_encoded.mp4
  output="${file%.*}_encoded.mp4"

  echo "Re-encoding (no audio): $file"
  echo "Output: $output"

  # (Optional) Debug: check if the file is accessible
  # ls -l "$file"

  # Run FFmpeg to remove audio and use baseline H.264 + faststart
  ffmpeg -y -i "$file" \
    -c:v libx264 \
    -profile:v baseline \
    -level 3.0 \
    -pix_fmt yuv420p \
    -movflags +faststart \
    -an \
    "$output"

  if [ $? -eq 0 ]; then
    echo "Successfully encoded to: $output"
  else
    echo "Error encoding $file"
  fi

  echo "--------------------------------------------------"
done