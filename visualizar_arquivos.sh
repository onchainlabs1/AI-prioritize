#!/usr/bin/env bash
set -euo pipefail

# Simple local file viewer helper:
# - list files
# - preview text/metadata
# - open files with default macOS app

DEFAULT_DIR="/Users/fabio/Desktop"
MAX_LIST=200

usage() {
  cat <<'EOF'
Usage:
  ./visualizar_arquivos.sh
  ./visualizar_arquivos.sh --dir "/path"
  ./visualizar_arquivos.sh --preview "/path/file.ext"
  ./visualizar_arquivos.sh --open "/path/file.ext"

Options:
  --dir       List files in a directory (max depth 3).
  --preview   Show quick preview (text) or metadata (pdf/image/binary).
  --open      Open file in the default macOS app.
  -h, --help  Show help.

Examples:
  ./visualizar_arquivos.sh --dir "/Users/fabio/Desktop"
  ./visualizar_arquivos.sh --preview "/Users/fabio/Desktop/Enterprise_AI_Blueprint.pdf"
  ./visualizar_arquivos.sh --open "/Users/fabio/Desktop/KOSTAL_Enterprise_AI_Playbook_(2).pdf"
EOF
}

list_files() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "Directory not found: $dir" >&2
    exit 1
  fi

  echo "Listing files in: $dir"
  find "$dir" -maxdepth 3 \( -type d -name "*.app" -prune \) -o -type f -print \
    | head -n "$MAX_LIST" \
    | awk '{
        cmd = "stat -f \"%z\" \"" $0 "\" 2>/dev/null";
        cmd | getline size;
        close(cmd);
        printf "%-12s %s\n", size " bytes", $0
      }'
}

preview_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "File not found: $file" >&2
    exit 1
  fi

  local ext="${file##*.}"
  ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"

  case "$ext" in
    txt|md|json|yaml|yml|py|js|ts|tsx|jsx|sh|toml|ini|csv|sql|html|css)
      echo "Text preview (first 120 lines): $file"
      sed -n '1,120p' "$file"
      ;;
    pdf)
      echo "PDF metadata: $file"
      if mdls -name kMDItemTitle -name kMDItemNumberOfPages -name kMDItemFSSize "$file" 2>/dev/null; then
        :
      else
        # Fallback for environments where Spotlight metadata is unavailable.
        stat -f "Size: %z bytes | Modified: %Sm" -t "%Y-%m-%d %H:%M:%S" "$file"
        local pages
        pages="$(strings "$file" | rg -o '/Count [0-9]+' | head -n 1 | awk '{print $2}' || true)"
        if [[ -n "${pages:-}" ]]; then
          echo "Estimated pages: $pages"
        fi
      fi
      echo
      echo "Tip: to open visually, use:"
      echo "  ./visualizar_arquivos.sh --open \"$file\""
      ;;
    png|jpg|jpeg|gif|webp|heic|svg)
      echo "Image metadata: $file"
      mdls -name kMDItemPixelWidth -name kMDItemPixelHeight -name kMDItemFSSize "$file" 2>/dev/null || true
      echo
      echo "Tip: to open visually, use:"
      echo "  ./visualizar_arquivos.sh --open \"$file\""
      ;;
    *)
      echo "Non-text type. Showing basic metadata: $file"
      mdls -name kMDItemFSSize "$file" 2>/dev/null || true
      file "$file" || true
      ;;
  esac
}

open_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "File not found: $file" >&2
    exit 1
  fi
  echo "Opening file: $file"
  open "$file"
}

DIR="$DEFAULT_DIR"
MODE="list"
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      DIR="${2:-}"
      shift 2
      ;;
    --preview)
      MODE="preview"
      TARGET="${2:-}"
      shift 2
      ;;
    --open)
      MODE="open"
      TARGET="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Invalid option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

case "$MODE" in
  list)
    list_files "$DIR"
    ;;
  preview)
    if [[ -z "$TARGET" ]]; then
      echo "Please provide a file for --preview" >&2
      exit 1
    fi
    preview_file "$TARGET"
    ;;
  open)
    if [[ -z "$TARGET" ]]; then
      echo "Please provide a file for --open" >&2
      exit 1
    fi
    open_file "$TARGET"
    ;;
esac
