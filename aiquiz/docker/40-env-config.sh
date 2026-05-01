#!/bin/sh
set -eu

cat > /usr/share/nginx/html/env.js <<EOF
window.__APP_CONFIG__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL:-}",
  VITE_LIVEKIT_URL: "${VITE_LIVEKIT_URL:-}",
  VITE_QUIZ_PASS_PERCENT: "${VITE_QUIZ_PASS_PERCENT:-90}"
};
EOF
