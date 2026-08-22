#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DERIVED_DATA="${DERIVED_DATA:-$ROOT/DerivedData}"
SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone 17 Pro}"

cd "$ROOT"

command -v xcodegen >/dev/null 2>&1 || {
  echo "xcodegen is required (brew install xcodegen)." >&2
  exit 1
}

xcrun swift-format lint \
  --configuration .swift-format \
  --recursive DSHNative DSHNativeTests

xcodegen generate --spec project.yml

xcodebuild \
  -project DSHNative.xcodeproj \
  -scheme DSHNative \
  -configuration Debug \
  -destination "platform=iOS Simulator,name=$SIMULATOR_NAME,OS=latest" \
  -derivedDataPath "$DERIVED_DATA/simulator" \
  CODE_SIGNING_ALLOWED=NO \
  test

xcodebuild \
  -project DSHNative.xcodeproj \
  -scheme DSHNative \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA/device" \
  CODE_SIGNING_ALLOWED=NO \
  build
