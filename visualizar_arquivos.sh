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
Uso:
  ./visualizar_arquivos.sh
  ./visualizar_arquivos.sh --dir "/caminho"
  ./visualizar_arquivos.sh --preview "/caminho/arquivo.ext"
  ./visualizar_arquivos.sh --open "/caminho/arquivo.ext"

Opcoes:
  --dir       Lista arquivos do diretorio (max depth 3).
  --preview   Mostra preview rapido (texto) ou metadados (pdf/imagem/binario).
  --open      Abre o arquivo no app padrao do macOS.
  -h, --help  Mostra esta ajuda.

Exemplos:
  ./visualizar_arquivos.sh --dir "/Users/fabio/Desktop"
  ./visualizar_arquivos.sh --preview "/Users/fabio/Desktop/Enterprise_AI_Blueprint.pdf"
  ./visualizar_arquivos.sh --open "/Users/fabio/Desktop/KOSTAL_Enterprise_AI_Playbook_(2).pdf"
EOF
}

list_files() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "Diretorio nao encontrado: $dir" >&2
    exit 1
  fi

  echo "Listando arquivos em: $dir"
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
    echo "Arquivo nao encontrado: $file" >&2
    exit 1
  fi

  local ext="${file##*.}"
  ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"

  case "$ext" in
    txt|md|json|yaml|yml|py|js|ts|tsx|jsx|sh|toml|ini|csv|sql|html|css)
      echo "Preview textual (primeiras 120 linhas): $file"
      sed -n '1,120p' "$file"
      ;;
    pdf)
      echo "Metadados PDF: $file"
      if mdls -name kMDItemTitle -name kMDItemNumberOfPages -name kMDItemFSSize "$file" 2>/dev/null; then
        :
      else
        # Fallback for environments where Spotlight metadata is unavailable.
        stat -f "Tamanho: %z bytes | Modificado: %Sm" -t "%Y-%m-%d %H:%M:%S" "$file"
        local pages
        pages="$(strings "$file" | rg -o '/Count [0-9]+' | head -n 1 | awk '{print $2}' || true)"
        if [[ -n "${pages:-}" ]]; then
          echo "Paginas (estimado): $pages"
        fi
      fi
      echo
      echo "Dica: para abrir visualmente, use:"
      echo "  ./visualizar_arquivos.sh --open \"$file\""
      ;;
    png|jpg|jpeg|gif|webp|heic|svg)
      echo "Metadados de imagem: $file"
      mdls -name kMDItemPixelWidth -name kMDItemPixelHeight -name kMDItemFSSize "$file" 2>/dev/null || true
      echo
      echo "Dica: para abrir visualmente, use:"
      echo "  ./visualizar_arquivos.sh --open \"$file\""
      ;;
    *)
      echo "Tipo nao textual. Mostrando metadados basicos: $file"
      mdls -name kMDItemFSSize "$file" 2>/dev/null || true
      file "$file" || true
      ;;
  esac
}

open_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Arquivo nao encontrado: $file" >&2
    exit 1
  fi
  echo "Abrindo arquivo: $file"
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
      echo "Opcao invalida: $1" >&2
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
      echo "Informe um arquivo para --preview" >&2
      exit 1
    fi
    preview_file "$TARGET"
    ;;
  open)
    if [[ -z "$TARGET" ]]; then
      echo "Informe um arquivo para --open" >&2
      exit 1
    fi
    open_file "$TARGET"
    ;;
esac
