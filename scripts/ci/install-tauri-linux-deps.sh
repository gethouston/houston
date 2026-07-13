#!/usr/bin/env bash
# Install Tauri 2 Linux system dependencies for TS-engine desktop artifacts.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  librsvg2-dev \
  libayatana-appindicator3-dev \
  patchelf \
  squashfs-tools \
  file \
  libssl-dev \
  build-essential \
  curl \
  wget
