#!/bin/sh
set -eu

cat > /usr/share/nginx/html/env.js <<EOF
window.__APP_CONFIG__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL:-}",
  VITE_LIVEKIT_URL: "${VITE_LIVEKIT_URL:-}",
  VITE_LIVEKIT_AGENT_MODE: "${VITE_LIVEKIT_AGENT_MODE:-}",
  VITE_TUTOR_CALL_SECONDS: "${VITE_TUTOR_CALL_SECONDS:-}"
};
EOF
