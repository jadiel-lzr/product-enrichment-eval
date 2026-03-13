#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

mkdir -p "$PROJECT_ROOT/public/data" "$PROJECT_ROOT/public/images"

cp "$PROJECT_ROOT/../data/"*.csv "$PROJECT_ROOT/public/data/" 2>/dev/null || echo "No CSVs found in ../data/"
cp -r "$PROJECT_ROOT/../data/images/"* "$PROJECT_ROOT/public/images/" 2>/dev/null || echo "No images found in ../data/images/"

echo "Data copied to public/"
