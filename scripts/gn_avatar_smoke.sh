#!/usr/bin/env bash

set -euo pipefail

# Smoke test for the profile avatar upload flow
# 1) Login via /wp-json/gn/v1/login
# 2) Upload avatar via /wp-json/gn/v1/profile/avatar with Authorization and X-Authorization headers
#
# Requirements: curl, jq (recommended)

BASE_URL=${BASE_URL:-"https://dominicb72.sg-host.com"}
USERNAME=""
PASSWORD=""
AVATAR_FILE=""
VERBOSE=0

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") -u <username_or_email> -p <password> -f </full/path/to/photo> [--base <https://site>] [-v]

Environment overrides:
  BASE_URL   Default base URL (current: $BASE_URL)

Examples:
  $(basename "$0") -u user@example.com -p 'Pass123!' -f /tmp/photo.jpg --base https://example.com -v
USAGE
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--username) USERNAME=${2:-}; shift 2;;
    -p|--password) PASSWORD=${2:-}; shift 2;;
    -f|--file)     AVATAR_FILE=${2:-}; shift 2;;
    --base)        BASE_URL=${2:-}; shift 2;;
    -v|--verbose)  VERBOSE=1; shift;;
    -h|--help)     usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$USERNAME" || -z "$PASSWORD" || -z "$AVATAR_FILE" ]]; then
  echo "Error: username, password, and file are required." >&2
  usage
  exit 1
fi

if [[ ! -f "$AVATAR_FILE" ]]; then
  echo "Error: file not found: $AVATAR_FILE" >&2
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
  local args=( -sS -w "\n__HTTP_STATUS:%{http_code}\n" -X "$method" "$url" )

  if [[ -n "$body" ]]; then
    args+=( -H 'Content-Type: application/json' -d "$body" )
  fi

  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "\n=> $method $url" >&2
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

AVATAR_URL="${BASE_URL%/}/wp-json/gn/v1/profile/avatar"

if [[ ${VERBOSE} -eq 1 ]]; then
  echo "\n=> POST $AVATAR_URL" >&2
  echo "   Authorization: Bearer $(printf "%s" "$TOKEN" | sed -E 's/(.{0,4}).*(.{0,4})/\1...\2/')" >&2
  echo "   X-Authorization: Bearer <same>" >&2
  echo "   file: $AVATAR_FILE" >&2
fi

# Perform multipart upload with both Authorization headers
RAW_AVATAR=$(curl -sS -w "\n__HTTP_STATUS:%{http_code}\n" \
  -X POST "$AVATAR_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Authorization: Bearer $TOKEN" \
  -F "avatar=@${AVATAR_FILE}")

AVATAR_STATUS=$(printf "%s" "$RAW_AVATAR" | extract_status)
AVATAR_BODY=$(printf "%s" "$RAW_AVATAR" | extract_body)

echo "Avatar upload status: $AVATAR_STATUS" >&2
printf "%s\n" "$AVATAR_BODY"

if [[ "$AVATAR_STATUS" -ge 400 ]]; then
  echo "Avatar upload failed. Inspect the response above for details." >&2
  exit 4
fi

echo "Done." >&2

