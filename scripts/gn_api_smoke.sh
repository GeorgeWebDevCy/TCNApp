#!/usr/bin/env bash

set -euo pipefail

# Simple smoke test for TCN/GN WordPress endpoints:
# 1) Login: POST /wp-json/gn/v1/login
# 2) Change password: POST /wp-json/gn/v1/change-password with Authorization: Bearer <token>
#
# Requirements: curl, jq (recommended). If jq is missing, the script will show the raw response

BASE_URL=${BASE_URL:-"https://dominicb72.sg-host.com"}
USERNAME=""
PASSWORD=""
CURR_PASS=""
NEW_PASS=""
VERBOSE=0

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") -u <username_or_email> -p <password> \
    --current <current_password> --new <new_password> [--base <https://site>] [-v]

Environment overrides:
  BASE_URL   Default base URL (current: $BASE_URL)

Examples:
  $(basename "$0") -u user@example.com -p 'OldPass123!' \
    --current 'OldPass123!' --new 'NewPass456!' --base https://example.com -v
USAGE
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--username) USERNAME=${2:-}; shift 2;;
    -p|--password) PASSWORD=${2:-}; shift 2;;
    --current)     CURR_PASS=${2:-}; shift 2;;
    --new)         NEW_PASS=${2:-}; shift 2;;
    --base)        BASE_URL=${2:-}; shift 2;;
    -v|--verbose)  VERBOSE=1; shift;;
    -h|--help)     usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$USERNAME" || -z "$PASSWORD" || -z "$CURR_PASS" || -z "$NEW_PASS" ]]; then
  echo "Error: username, password, current and new password are required." >&2
  usage
  exit 1
fi

need curl

JQ_AVAILABLE=1
if ! command -v jq >/dev/null 2>&1; then
  JQ_AVAILABLE=0
  echo "Warning: jq not found. Responses will not be auto-parsed." >&2
fi

api() {
  local method=$1
  local path=$2
  local body=${3:-}

  local url="${BASE_URL%/}${path}"
  local args=( -sS -w "\n__HTTP_STATUS:%{http_code}\n" --url "$url" )

  if [[ -n "$method" ]]; then
    args+=( --request "$method" )
  fi

  if [[ -n "$body" ]]; then
    args+=( -H "Content-Type: application/json" -d "$body" )
  fi

  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "\n=> $method $url" >&2
    if [[ -n "$body" ]]; then echo "   body: $body" >&2; fi
  fi

  curl "${args[@]}"
}

auth_api() {
  local token=$1
  local method=$2
  local path=$3
  local body=${4:-}

  local url="${BASE_URL%/}${path}"
  local args=( -sS -w "\n__HTTP_STATUS:%{http_code}\n" --url "$url" \
    -H "Authorization: Bearer $token" )

  if [[ -n "$method" ]]; then
    args+=( --request "$method" )
  fi

  if [[ -n "$body" ]]; then
    args+=( -H "Content-Type: application/json" -d "$body" )
  fi

  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "\n=> $method $url" >&2
    echo "   Authorization: Bearer $(printf "%s" "$token" | sed -E 's/(.{0,4}).*(.{0,4})/\1...\2/')" >&2
    if [[ -n "$body" ]]; then echo "   body: $body" >&2; fi
  fi

  curl "${args[@]}"
}

extract_status() {
  sed -n 's/^__HTTP_STATUS://p'
}

extract_body() {
  sed '/^__HTTP_STATUS:/d'
}

echo "Logging in at: ${BASE_URL}/wp-json/gn/v1/login" >&2
LOGIN_BODY=$(printf '{"username":"%s","password":"%s"}' "$USERNAME" "$PASSWORD")
RAW_LOGIN=$(api POST "/wp-json/gn/v1/login" "$LOGIN_BODY")
LOGIN_STATUS=$(printf "%s" "$RAW_LOGIN" | extract_status)
LOGIN_JSON=$(printf "%s" "$RAW_LOGIN" | extract_body)

if [[ ${VERBOSE} -eq 1 ]]; then
  echo "Login status: $LOGIN_STATUS" >&2
  echo "Login body: $LOGIN_JSON" >&2
fi

if [[ "$LOGIN_STATUS" -lt 200 || "$LOGIN_STATUS" -ge 300 ]]; then
  echo "Login failed with status $LOGIN_STATUS" >&2
  printf "%s\n" "$LOGIN_JSON"
  exit 2
fi

TOKEN=""
if [[ $JQ_AVAILABLE -eq 1 ]]; then
  TOKEN=$(printf "%s" "$LOGIN_JSON" | jq -r '(.api_token // .apiToken // .token // empty)')
else
  # naive fallback: try to grab api_token or token with grep/sed
  TOKEN=$(printf "%s" "$LOGIN_JSON" | sed -n 's/.*"api_token"\s*:\s*"\([^"]\+\)".*/\1/p')
  if [[ -z "$TOKEN" ]]; then
    TOKEN=$(printf "%s" "$LOGIN_JSON" | sed -n 's/.*"token"\s*:\s*"\([^"]\+\)".*/\1/p')
  fi
fi

if [[ -z "$TOKEN" ]]; then
  echo "Could not extract token from login response." >&2
  printf "%s\n" "$LOGIN_JSON"
  exit 3
fi

echo "Calling change-password as: ${USERNAME}" >&2
CHANGE_BODY=$(printf '{"current_password":"%s","password":"%s"}' "$CURR_PASS" "$NEW_PASS")
RAW_CHANGE=$(auth_api "$TOKEN" POST "/wp-json/gn/v1/change-password" "$CHANGE_BODY")
CHANGE_STATUS=$(printf "%s" "$RAW_CHANGE" | extract_status)
CHANGE_JSON=$(printf "%s" "$RAW_CHANGE" | extract_body)

echo "Change-password status: $CHANGE_STATUS" >&2
printf "%s\n" "$CHANGE_JSON"

if [[ "$CHANGE_STATUS" -ge 400 ]]; then
  echo "Change-password failed. Inspect the response above for server error details." >&2
  exit 4
fi

echo "Done." >&2

