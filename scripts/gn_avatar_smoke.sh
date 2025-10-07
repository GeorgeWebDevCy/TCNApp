#!/usr/bin/env bash

set -euo pipefail

# Smoke test for avatar upload endpoint:
# 1) Login: POST /wp-json/gn/v1/login (extract api_token)
# 2) Upload avatar: POST /wp-json/gn/v1/profile/avatar with multipart form-data
#    - Send Authorization and X-Authorization headers
#    - Also include token as form field and URL query param for hosts that strip headers
# 3) Verify: GET /wp/v2/users/me (print avatar_urls)
#
# Requirements: curl, jq (optional), file (optional for MIME detection)

BASE_URL=${BASE_URL:-"https://dominicb72.sg-host.com"}
USERNAME=""
PASSWORD=""
IMAGE_FILE=""
TOKEN=""
VERBOSE=0

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") -u <username_or_email> -p <password> \
    -f </path/to/image> [--base <https://site>] [-v]

  Or, if you already have a token:
  $(basename "$0") --token <api_token> -f </path/to/image> [--base <https://site>] [-v]

Environment overrides:
  BASE_URL   Default base URL (current: $BASE_URL)

Notes:
  - The script uses multiple token paths (header, form field, and query param)
    to survive hosts that strip Authorization on multipart requests.
  - Response body is printed; if jq is installed, it will be pretty-printed.
USAGE
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--username) USERNAME=${2:-}; shift 2;;
    -p|--password) PASSWORD=${2:-}; shift 2;;
    -f|--file)     IMAGE_FILE=${2:-}; shift 2;;
    --token)       TOKEN=${2:-}; shift 2;;
    --base)        BASE_URL=${2:-}; shift 2;;
    -v|--verbose)  VERBOSE=1; shift;;
    -h|--help)     usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$IMAGE_FILE" ]]; then
  echo "Error: image file is required." >&2
  usage
  exit 1
fi

if [[ ! -f "$IMAGE_FILE" ]]; then
  echo "Error: image file not found: $IMAGE_FILE" >&2
  exit 1
fi

# Ensure the image is readable; otherwise MIME detection and curl -F will fail.
if [[ ! -r "$IMAGE_FILE" ]]; then
  echo "Error: image file is not readable: $IMAGE_FILE" >&2
  echo "Fix by running: chmod u+r \"$IMAGE_FILE\" (or copy it to a readable path)." >&2
  exit 1
fi

need curl

JQ_AVAILABLE=1
if ! command -v jq >/dev/null 2>&1; then
  JQ_AVAILABLE=0
fi

# URL-encode helper that prefers jq/python but has a pure-bash fallback
url_encode() {
  local raw=$1
  # jq approach
  if [[ $JQ_AVAILABLE -eq 1 ]]; then
    printf '%s' "$raw" | jq -sRr @uri 2>/dev/null && return 0
  fi
  # python3 approach
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$raw" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip()))' 2>/dev/null && return 0
  fi
  # pure bash fallback
  local i c out=""
  local hex
  for (( i=0; i<${#raw}; i++ )); do
    c=${raw:i:1}
    case "$c" in
      [a-zA-Z0-9.~_-]) out+="$c" ;;
      ' ') out+='%20' ;;
      *) printf -v hex '%%%02X' "'${c}"; out+="$hex" ;;
    esac
  done
  printf '%s' "$out"
}

MIME="image/jpeg"
if command -v file >/dev/null 2>&1; then
  FILE_MIME=$(file --mime-type -b "$IMAGE_FILE" 2>/dev/null || true)
  # Validate the detected MIME; fall back if it looks suspicious
  if printf '%s' "$FILE_MIME" | grep -E '^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$' >/dev/null 2>&1; then
    MIME=$FILE_MIME
  else
    MIME="image/jpeg"
  fi
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

pretty_print() {
  if [[ $JQ_AVAILABLE -eq 1 ]]; then
    jq . 2>/dev/null || cat
  else
    cat
  fi
}

# Step 1: Login (if token not provided)
if [[ -z "$TOKEN" ]]; then
  if [[ -z "$USERNAME" || -z "$PASSWORD" ]]; then
    echo "Error: username and password required if no token provided." >&2
    usage
    exit 1
  fi

  echo "Logging in at: ${BASE_URL}/wp-json/gn/v1/login" >&2
  LOGIN_BODY=$(printf '{"username":"%s","password":"%s"}' "$USERNAME" "$PASSWORD")
  RAW_LOGIN=$(api POST "/wp-json/gn/v1/login" "$LOGIN_BODY")
  LOGIN_STATUS=$(printf "%s" "$RAW_LOGIN" | extract_status)
  LOGIN_JSON=$(printf "%s" "$RAW_LOGIN" | extract_body)

  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "Login status: $LOGIN_STATUS" >&2
    echo "Login body:" >&2
    printf "%s\n" "$LOGIN_JSON" | pretty_print >&2
  fi

  if [[ "$LOGIN_STATUS" -lt 200 || "$LOGIN_STATUS" -ge 300 ]]; then
    echo "Login failed with status $LOGIN_STATUS" >&2
    printf "%s\n" "$LOGIN_JSON" | pretty_print
    exit 2
  fi

  if [[ $JQ_AVAILABLE -eq 1 ]]; then
    TOKEN=$(printf "%s" "$LOGIN_JSON" | jq -r '(.api_token // .apiToken // .token // empty)')
  else
    TOKEN=$(printf "%s" "$LOGIN_JSON" | sed -n 's/.*"api_token"\s*:\s*"\([^"]\+\)".*/\1/p')
    if [[ -z "$TOKEN" ]]; then
      TOKEN=$(printf "%s" "$LOGIN_JSON" | sed -n 's/.*"apiToken"\s*:\s*"\([^"]\+\)".*/\1/p')
    fi
    if [[ -z "$TOKEN" ]]; then
      TOKEN=$(printf "%s" "$LOGIN_JSON" | sed -n 's/.*"token"\s*:\s*"\([^"]\+\)".*/\1/p')
    fi
  fi

  if [[ -z "$TOKEN" ]]; then
    echo "Could not extract token from login response." >&2
    printf "%s\n" "$LOGIN_JSON" | pretty_print
    exit 3
  fi
fi

SHORT_TOKEN=$(printf "%s" "$TOKEN" | sed -E 's/(.{0,4}).*(.{0,4})/\1...\2/')
echo "Using token: $SHORT_TOKEN" >&2

# Step 2: Upload avatar
UPLOAD_PATH="/wp-json/gn/v1/profile/avatar"
JOIN_CHAR='?'
[[ "$UPLOAD_PATH" == *"?"* ]] && JOIN_CHAR='&'
ENC_TOKEN=$(url_encode "$TOKEN")
UPLOAD_URL="${BASE_URL%/}${UPLOAD_PATH}${JOIN_CHAR}token=${ENC_TOKEN}"

if [[ ${VERBOSE} -eq 1 ]]; then
  echo "\n=> POST $UPLOAD_URL" >&2
  echo "   Headers: Authorization: Bearer $SHORT_TOKEN; X-Authorization: Bearer $SHORT_TOKEN" >&2
  echo "   File: $IMAGE_FILE (MIME: $MIME)" >&2
fi

RAW_UPLOAD=$(curl -sS -w "\n__HTTP_STATUS:%{http_code}\n" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" \
  --form-string "token=$TOKEN" \
  -F "avatar=@${IMAGE_FILE};type=${MIME}" \
  "$UPLOAD_URL")

UPLOAD_STATUS=$(printf "%s" "$RAW_UPLOAD" | extract_status)
UPLOAD_BODY=$(printf "%s" "$RAW_UPLOAD" | extract_body)

echo "Upload status: $UPLOAD_STATUS" >&2
printf "%s\n" "$UPLOAD_BODY" | pretty_print

if [[ "$UPLOAD_STATUS" -lt 200 || "$UPLOAD_STATUS" -ge 300 ]]; then
  echo "Avatar upload failed. Inspect the response above for details." >&2
  exit 4
fi

# Step 3: Verify avatar. Try WP core endpoint first, then plugin fallback.
VERIFY1_URL="${BASE_URL%/}/wp-json/wp/v2/users/me"
if [[ ${VERBOSE} -eq 1 ]]; then
  echo "\n=> GET $VERIFY1_URL" >&2
fi
RAW_ME=$(curl -sS -w "\n__HTTP_STATUS:%{http_code}\n" -X GET \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" \
  "$VERIFY1_URL")
ME_STATUS=$(printf "%s" "$RAW_ME" | extract_status)
ME_BODY=$(printf "%s" "$RAW_ME" | extract_body)

if [[ "$ME_STATUS" -ge 400 ]]; then
  VERIFY2_URL="${BASE_URL%/}/wp-json/gn/v1/me"
  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "\n=> GET $VERIFY2_URL (fallback)" >&2
  fi
  RAW_ME=$(curl -sS -w "\n__HTTP_STATUS:%{http_code}\n" -X GET \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    "$VERIFY2_URL")
  ME_STATUS=$(printf "%s" "$RAW_ME" | extract_status)
  ME_BODY=$(printf "%s" "$RAW_ME" | extract_body)
fi

echo "Verify status: $ME_STATUS" >&2
if [[ $JQ_AVAILABLE -eq 1 ]]; then
  # Try both WP core shape and plugin shape
  AVATAR96=$(printf "%s" "$ME_BODY" | jq -r '(.avatar_urls // .user.avatar_urls) | .["96"] // .["48"] // .full // empty' 2>/dev/null || true)
else
  AVATAR96=""
fi

if [[ -n "$AVATAR96" ]]; then
  echo "Resolved avatar URL: $AVATAR96" >&2
fi

printf "%s\n" "$ME_BODY" | pretty_print

echo "Done." >&2
