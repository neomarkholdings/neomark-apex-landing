#!/usr/bin/env bash
# Cloud Agent install phase for the Neomark Apex repo.
# Idempotent: safe to re-run against cached or partially prepared state.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# System libraries required to compile/run the Samurai Tauri v2 desktop shell
# (WebKitGTK, GTK3, appindicator, rsvg) and to run its Rust backend tests.
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev

# Samurai frontend dependencies (Vite 7 + React 19 + Tailwind v4).
cd "$repo_root/samurai"
npm ci
