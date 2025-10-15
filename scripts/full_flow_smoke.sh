#!/usr/bin/env bash

set -euo pipefail

BASE_URL=${BASE_URL:-"https://dominicb72.sg-host.com"}
USERNAME=""
PASSWORD=""
VERBOSE=1
VENDOR_ID=""
MEMBER_ID=""
QR_TOKEN=""
GROSS_AMOUNT=""
DISCOUNT_AMOUNT=""
NET_AMOUNT=""
CURRENCY=""
LOG_MESSAGE="Smoke test event from full_flow_smoke.sh"

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") -u <username_or_email> -p <password> [options]

Required:
  -u, --username    WordPress username or email that can call the API
  -p, --password    Password for the account above

Optional:
      --base <url>         Override the default base URL (${BASE_URL})
      --vendor-id <id>     WordPress vendor user ID used for discount flows
      --member-id <id>     Member user ID used for discount transactions (falls back to lookup response)
      --qr-token <token>   Discount QR token to validate and redeem
      --gross <amount>     Gross amount for discount redemption
      --discount <amount>  Discount amount for redemption
      --net <amount>       Net amount for redemption (auto-calculated when gross & discount supplied)
      --currency <code>    Currency code for redemption (defaults to site currency)
      --log-message <msg>  Message posted to /wp-json/gn/v1/log during the run
  -v, --verbose            Print verbose request logs
  -h, --help               Show this help text

Examples:
  $(basename "$0") -u vendor@example.com -p 'Secret123' \\
    --base https://example.com --vendor-id 456 --qr-token 'abc123' \\
    --gross 250 --discount 25 --currency THB -v
USAGE
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--username) USERNAME=${2:-}; shift 2;;
    -p|--password) PASSWORD=${2:-}; shift 2;;
    --base)        BASE_URL=${2:-}; shift 2;;
    --vendor-id)   VENDOR_ID=${2:-}; shift 2;;
    --member-id)   MEMBER_ID=${2:-}; shift 2;;
    --qr-token)    QR_TOKEN=${2:-}; shift 2;;
    --gross)       GROSS_AMOUNT=${2:-}; shift 2;;
    --discount)    DISCOUNT_AMOUNT=${2:-}; shift 2;;
    --net)         NET_AMOUNT=${2:-}; shift 2;;
    --currency)    CURRENCY=${2:-}; shift 2;;
    --log-message) LOG_MESSAGE=${2:-}; shift 2;;
    -v|--verbose)  VERBOSE=1; shift;;
    -h|--help)     usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1;;
  esac
done

if [[ -z "$USERNAME" || -z "$PASSWORD" ]]; then
  echo "Error: username and password are required." >&2
  usage
  exit 1
fi

need curl

JQ_AVAILABLE=1
if ! command -v jq >/dev/null 2>&1; then
  JQ_AVAILABLE=0
  echo "Warning: jq not found. Responses will not be auto-parsed." >&2
fi

calc_net_amount() {
  if [[ -n "$NET_AMOUNT" ]]; then
    return 0
  fi

  if [[ -n "$GROSS_AMOUNT" && -n "$DISCOUNT_AMOUNT" ]]; then
    if command -v python3 >/dev/null 2>&1; then
      NET_AMOUNT=$(python3 - <<PY
from decimal import Decimal
print((Decimal("$GROSS_AMOUNT") - Decimal("$DISCOUNT_AMOUNT")).normalize())
PY
)
    else
      NET_AMOUNT=$(awk -v g="$GROSS_AMOUNT" -v d="$DISCOUNT_AMOUNT" 'BEGIN { printf("%.2f", g - d) }')
    fi
  fi
}

calc_net_amount

api() {
  local method=$1
  local path=$2
  local body=""
  shift 2

  if [[ $# -gt 0 && $1 != -* ]]; then
    body=$1
    shift
  fi

  local extra_headers=()
  if [[ $# -gt 0 ]]; then
    extra_headers=("$@")
  fi

  local url="${BASE_URL%/}${path}"
  local args=( -sS -w "\n__HTTP_STATUS:%{http_code}\n" --url "$url" )

  # Explicitly set the HTTP method only when required.  Relying on "-X" caused
  # some curl versions to treat the method name as a hostname ("GET") when the
  # option parsing became confused, which surfaced as "Could not resolve host:
  # GET" errors.  Using the long form "--request" keeps the association
  # unambiguous across environments.
  if [[ -n "$method" ]]; then
    args+=( --request "$method" )
  fi

  if [[ -n "$body" ]]; then
    args+=( -H "Content-Type: application/json" -d "$body" )
  fi

  if [[ ${#extra_headers[@]} -gt 0 ]]; then
    args+=( "${extra_headers[@]}" )
  fi

  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "\n=> $method $url" >&2
    if [[ -n "$body" ]]; then echo "   body: $body" >&2; fi
    if [[ ${#extra_headers[@]} -gt 0 ]]; then
      printf '   headers:\n' >&2
      printf '     %s\n' "${extra_headers[@]}" >&2
    fi
  fi

  curl "${args[@]}"
}

extract_status() {
  sed -n 's/^__HTTP_STATUS://p'
}

extract_body() {
  sed '/^__HTTP_STATUS:/d'
}

log_response() {
  local step=$1
  local response=$2
  local pretty="$response"

  if [[ -n "$response" ]]; then
    if [[ $JQ_AVAILABLE -eq 1 ]]; then
      if pretty=$(printf '%s' "$response" | jq '.' 2>/dev/null); then
        :
      else
        pretty="$response"
      fi
    fi
    printf '\nResponse (%s):\n%s\n' "$step" "$pretty" >&2
  else
    printf '\nResponse (%s): <empty body>\n' "$step" >&2
  fi
}

assert_success() {
  local status=$1
  local step=$2
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "Step failed ($step) with HTTP status $status" >&2
    return 1
  fi
}

TOKEN=""
USER_ID=""
ACCOUNT_TYPE=""

step_login() {
  echo "\n[1/8] Authenticating user..." >&2
  local body=""

  # When an email address is supplied, mirror the mobile app behaviour by
  # sending it under the `email` key and leaving `username` blank.
  if [[ "$USERNAME" == *"@"* ]]; then
    body=$(printf '{"username":"","email":"%s","password":"%s"}' "$USERNAME" "$PASSWORD")
  else
    body=$(printf '{"username":"%s","password":"%s"}' "$USERNAME" "$PASSWORD")
  fi
  local raw
  raw=$(api POST "/wp-json/gn/v1/login" "$body")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)

  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "Login response: $response" >&2
  fi

  assert_success "$status" "login" || { printf "%s\n" "$response"; exit 2; }
  log_response "login" "$response"

  # Try to extract a reusable API token from common fields.
  # Accept top-level or nested under `data` and fall back to extracting
  # from token_login_url when present.
  if [[ $JQ_AVAILABLE -eq 1 ]]; then
    # Prefer explicit API token fields
    TOKEN=$(printf "%s" "$response" | jq -r '(.api_token // .apiToken // .data?.api_token // .data?.apiToken // empty)')
    # Fallback: some servers continue to place the token in `token`
    if [[ -z "$TOKEN" ]]; then
      TOKEN=$(printf "%s" "$response" | jq -r '(.token // .data?.token // empty)')
    fi

    # Extract user metadata when available (supports nested data.user)
    USER_ID=$(printf "%s" "$response" | jq -r '(.user?.id // .data?.user?.id // .data?.id // .ID // .user_id // empty)')
    ACCOUNT_TYPE=$(printf "%s" "$response" | jq -r '(.user?.account_type // .data?.user?.account_type // .data?.account_type // .account_type // empty)')

    # If we still have no token, try to derive it from a URL
    if [[ -z "$TOKEN" ]]; then
      TOKEN_LOGIN_URL=$(printf "%s" "$response" | jq -r '(.token_login_url // .tokenLoginUrl // .redirect // .data?.token_login_url // .data?.tokenLoginUrl // .data?.redirect // empty)')
      if [[ -n "$TOKEN_LOGIN_URL" && "$TOKEN_LOGIN_URL" != "null" ]]; then
        # Extract common query parameter keys that may hold the bearer token
        # Prefer login_token when present; next try api_token; finally try token
        # (which may be a short-lived hand-off and thus too short)
        TOKEN=$(python3 - <<PY 2>/dev/null || true
from urllib.parse import urlparse, parse_qs
import sys
u = urlparse(sys.stdin.read().strip())
q = parse_qs(u.query)
candidate_keys = [
  'login_token', 'api_token', 'jwt', 'jwt_token', 'access_token', 'auth_token', 'bearer', 'token'
]
for key in candidate_keys:
    v = q.get(key, [])
    if v:
        t = v[0].strip()
        if t:
            print(t)
            break
PY
      <<<'"$TOKEN_LOGIN_URL"')
        # Basic length heuristic to avoid short one-time hand-off tokens
        if [[ -n "$TOKEN" && ${#TOKEN} -lt 16 ]]; then
          TOKEN=""
        fi
      fi
    fi
  else
    # Fallback: regex extraction for API token fields
    TOKEN=$(printf "%s" "$response" | sed -n 's/.*"api_token"\s*:\s*"\([^"]\+\)".*/\1/p')
    if [[ -z "$TOKEN" ]]; then
      TOKEN=$(printf "%s" "$response" | sed -n 's/.*"apiToken"\s*:\s*"\([^"]\+\)".*/\1/p')
    fi
    if [[ -z "$TOKEN" ]]; then
      TOKEN=$(printf "%s" "$response" | sed -n 's/.*"token"\s*:\s*"\([^"]\+\)".*/\1/p')
    fi

    USER_ID=$(printf "%s" "$response" | sed -n 's/.*"id"\s*:\s*\([0-9]\+\).*/\1/p' | head -n1)
    ACCOUNT_TYPE=$(printf "%s" "$response" | sed -n 's/.*"account_type"\s*:\s*"\([^"]\+\)".*/\1/p' | head -n1)

    if [[ -z "$TOKEN" ]]; then
      TOKEN_LOGIN_URL=$(printf "%s" "$response" | sed -n 's/.*"\(token_login_url\|tokenLoginUrl\|redirect\)"\s*:\s*"\([^"]\+\)".*/\2/p' | head -n1)
      if [[ -n "$TOKEN_LOGIN_URL" ]]; then
        # Try to pull token-like values from the URL
        TOKEN=$(printf '%s' "$TOKEN_LOGIN_URL" | sed -n 's/.*[?&]\(login_token\|api_token\|jwt\|jwt_token\|access_token\|auth_token\|bearer\|token\)=\([^&#]*\).*/\2/p' | head -n1)
        if [[ -n "$TOKEN" && ${#TOKEN} -lt 16 ]]; then
          TOKEN=""
        fi
      fi
    fi
  fi

  if [[ -z "$TOKEN" ]]; then
    echo "Unable to extract reusable WordPress API token from login response." >&2
    printf "%s\n" "$response"
    exit 3
  fi

  echo "Authenticated as user_id=${USER_ID:-unknown} account_type=${ACCOUNT_TYPE:-unknown}" >&2

  if [[ -n "$USER_ID" ]]; then
    case "$ACCOUNT_TYPE" in
      vendor*)
        if [[ -z "$VENDOR_ID" ]]; then
          VENDOR_ID="$USER_ID"
          echo "Defaulting vendor_id to $VENDOR_ID from login context" >&2
        fi
        ;;
      member*|customer*)
        if [[ -z "$MEMBER_ID" ]]; then
          MEMBER_ID="$USER_ID"
          echo "Defaulting member_id to $MEMBER_ID from login context" >&2
        fi
        ;;
    esac
  fi
}

step_profile() {
  echo "\n[2/8] Fetching profile (/wp-json/gn/v1/me)..." >&2
  local raw
  raw=$(api GET "/wp-json/gn/v1/me" "" -H "Authorization: Bearer $TOKEN")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)

  assert_success "$status" "profile" || { printf "%s\n" "$response"; exit 4; }
  log_response "profile" "$response"

  if [[ -z "$MEMBER_ID" ]]; then
    if [[ $JQ_AVAILABLE -eq 1 ]]; then
      MEMBER_ID=$(printf "%s" "$response" | jq -r '(.id // .ID // empty)')
    else
      MEMBER_ID=$(printf "%s" "$response" | sed -n 's/.*"id"\s*:\s*\([0-9]\+\).*/\1/p' | head -n1)
    fi
  fi

  echo "Profile retrieved for member_id=${MEMBER_ID:-unknown}" >&2
}

step_vendor_tiers() {
  echo "\n[3/8] Retrieving vendor tiers..." >&2
  local raw
  raw=$(api GET "/wp-json/gn/v1/vendors/tiers")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)

  assert_success "$status" "vendors/tiers" || { printf "%s\n" "$response"; exit 5; }
  log_response "vendors/tiers" "$response"
  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "Vendor tiers: $response" >&2
  fi
}

step_membership_plans() {
  echo "\n[4/8] Fetching membership plans..." >&2
  local raw
  raw=$(api GET "/wp-json/gn/v1/memberships/plans")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)
  assert_success "$status" "memberships/plans" || { printf "%s\n" "$response"; exit 6; }
  log_response "memberships/plans" "$response"
  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "Membership plans: $response" >&2
  fi
}

step_activity_log() {
  echo "\n[5/8] Posting activity log heartbeat..." >&2
  local body
  body=$(printf '{"message":"%s"}' "${LOG_MESSAGE}")
  local raw
  raw=$(api POST "/wp-json/gn/v1/log" "$body" -H "Authorization: Bearer $TOKEN")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)
  assert_success "$status" "activity log" || { printf "%s\n" "$response"; exit 7; }
  log_response "activity log" "$response"
}

step_discount_lookup() {
  if [[ -z "$QR_TOKEN" || -z "$VENDOR_ID" ]]; then
    echo "\n[6/8] Skipping discount lookup (qr-token or vendor-id not provided)." >&2
    return
  fi

  echo "\n[6/8] Validating discount token..." >&2
  local body
  body=$(printf '{"qr_token":"%s","vendor_id":%s}' "$QR_TOKEN" "$VENDOR_ID")
  local raw
  raw=$(api POST "/wp-json/gn/v1/discounts/lookup" "$body" -H "Authorization: Bearer $TOKEN")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)
  assert_success "$status" "discount lookup" || { printf "%s\n" "$response"; exit 8; }
  log_response "discount lookup" "$response"

  if [[ -z "$MEMBER_ID" ]]; then
    if [[ $JQ_AVAILABLE -eq 1 ]]; then
      MEMBER_ID=$(printf "%s" "$response" | jq -r '(.member?.id // empty)')
    else
      MEMBER_ID=$(printf "%s" "$response" | sed -n 's/.*"member"[^{]*{[^}]*"id"\s*:\s*\([0-9]\+\).*/\1/p' | head -n1)
    fi
    if [[ -n "$MEMBER_ID" ]]; then
      echo "Captured member_id=$MEMBER_ID from lookup response" >&2
    fi
  fi
}

step_discount_transaction() {
  if [[ -z "$QR_TOKEN" || -z "$VENDOR_ID" || -z "$MEMBER_ID" || -z "$GROSS_AMOUNT" || -z "$DISCOUNT_AMOUNT" ]]; then
    echo "\n[7/8] Skipping discount transaction (missing qr-token, vendor-id, member-id, gross, or discount)." >&2
    return
  fi

  calc_net_amount

  if [[ -z "$NET_AMOUNT" ]]; then
    echo "Net amount could not be determined; provide --net explicitly." >&2
    return
  fi

  echo "\n[7/8] Recording discount transaction..." >&2
  local currency_line=""
  if [[ -n "$CURRENCY" ]]; then
    currency_line=$(printf ',\n  "currency": "%s"' "$CURRENCY")
  fi

  local payload
  payload=$(printf '{\n  "qr_token": "%s",\n  "member_id": %s,\n  "vendor_id": %s,\n  "gross_amount": %s,\n  "discount_amount": %s,\n  "net_amount": %s%s\n}\n' \
    "$QR_TOKEN" "$MEMBER_ID" "$VENDOR_ID" "$GROSS_AMOUNT" "$DISCOUNT_AMOUNT" "$NET_AMOUNT" "$currency_line")

  local raw
  raw=$(api POST "/wp-json/gn/v1/discounts/transactions" "$payload" -H "Authorization: Bearer $TOKEN")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)
  assert_success "$status" "discount transaction" || { printf "%s\n" "$response"; exit 9; }
  log_response "discount transaction" "$response"
}

step_discount_history() {
  echo "\n[8/8] Retrieving discount history (member scope)..." >&2
  local path="/wp-json/gn/v1/discounts/history"
  if [[ -n "$VENDOR_ID" && ( -z "$MEMBER_ID" || "$ACCOUNT_TYPE" == vendor* ) ]]; then
    path+="?scope=vendor"
  else
    path+="?scope=member"
  fi
  local raw
  raw=$(api GET "$path" "" -H "Authorization: Bearer $TOKEN")
  local status
  status=$(printf "%s" "$raw" | extract_status)
  local response
  response=$(printf "%s" "$raw" | extract_body)
  assert_success "$status" "discount history" || { printf "%s\n" "$response"; exit 10; }
  log_response "discount history" "$response"
  if [[ ${VERBOSE} -eq 1 ]]; then
    echo "Discount history: $response" >&2
  fi
}

step_login
step_profile
step_vendor_tiers
step_membership_plans
step_activity_log
step_discount_lookup
step_discount_transaction
step_discount_history

echo "\nAll flow checks completed successfully." >&2
