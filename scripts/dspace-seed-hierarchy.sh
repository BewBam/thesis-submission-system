#!/usr/bin/env bash
# Seed DSpace hierarchy for Thesis Portal mapping:
#   root -> faculty (sub) -> semester (sub-sub) -> period (collection)
#
# Auto-login (recommended):
#   export DSPACE_BASE_URL="http://localhost:8080/server"
#   export DSPACE_USER="admin@mail.com"
#   export DSPACE_PASSWORD="123456789"
#   export DSPACE_ROOT_NAME="Truong Dai hoc Bach Khoa TPHCM"
#   # optional: export DSPACE_PARENT_COMMUNITY_ID="<uuid>"
#   bash scripts/dspace-seed-hierarchy.sh
#
# Or tokens:
#   export DSPACE_BEARER="..."
#   export DSPACE_XSRF="..."
#
# Keep in sync with dspace-seed-hierarchy.ps1

set -euo pipefail

BASE_URL="${DSPACE_BASE_URL:-http://localhost:8080/server}"
BASE_URL="${BASE_URL%/}"
USER_EMAIL="${DSPACE_USER:-}"
PASSWORD="${DSPACE_PASSWORD:-}"
BEARER="${DSPACE_BEARER:-}"
XSRF="${DSPACE_XSRF:-}"
PARENT_ID="${DSPACE_PARENT_COMMUNITY_ID:-}"
ROOT_NAME="${DSPACE_ROOT_NAME:-Truong Dai hoc Bach Khoa TPHCM}"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

extract_id() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.id // .uuid // empty'
  else
    python -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or d.get("uuid") or "")'
  fi
}

header_value() {
  # usage: header_value <headers-file> <Header-Name>
  local file="$1" name="$2"
  awk -v n="$(echo "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { IGNORECASE=1 }
    {
      line=$0
      sub(/\r$/, "", line)
      split(line, a, ":")
      key=a[1]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (tolower(key)==n) {
        val=substr(line, index(line,":")+1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
        print val
        exit
      }
    }
  ' "$file"
}

dspace_login() {
  echo "Auto-login to DSpace as ${USER_EMAIL} ..." >&2
  local csrf_headers login_headers
  csrf_headers="$(mktemp)"
  login_headers="$(mktemp)"

  curl -sS -D "$csrf_headers" -o /dev/null -c "$COOKIE_JAR" \
    "${BASE_URL}/api/security/csrf"

  XSRF="$(header_value "$csrf_headers" "DSPACE-XSRF-TOKEN")"
  if [[ -z "$XSRF" ]]; then
    XSRF="$(awk -F'\t' '$6=="DSPACE-XSRF-COOKIE"{print $7; exit}' "$COOKIE_JAR" 2>/dev/null || true)"
  fi
  if [[ -z "$XSRF" ]]; then
    echo "CSRF OK but no DSPACE-XSRF-TOKEN" >&2
    rm -f "$csrf_headers" "$login_headers"
    exit 1
  fi

  curl -sS -D "$login_headers" -o /dev/null -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X POST "${BASE_URL}/api/authn/login" \
    -H "X-XSRF-TOKEN: ${XSRF}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Accept: application/json" \
    --data-urlencode "user=${USER_EMAIL}" \
    --data-urlencode "password=${PASSWORD}"

  local auth
  auth="$(header_value "$login_headers" "Authorization")"
  if [[ "$auth" =~ [Bb]earer[[:space:]]+(.+) ]]; then
    BEARER="${BASH_REMATCH[1]}"
  else
    BEARER="$auth"
  fi
  BEARER="$(echo "$BEARER" | tr -d '\r')"

  local xsrf_after
  xsrf_after="$(header_value "$login_headers" "DSPACE-XSRF-TOKEN")"
  if [[ -z "$xsrf_after" ]]; then
    xsrf_after="$(awk -F'\t' '$6=="DSPACE-XSRF-COOKIE"{print $7; exit}' "$COOKIE_JAR" 2>/dev/null || true)"
  fi
  if [[ -n "$xsrf_after" ]]; then
    XSRF="$xsrf_after"
  fi

  rm -f "$csrf_headers" "$login_headers"

  if [[ -z "$BEARER" ]]; then
    echo "Login OK but Authorization Bearer missing" >&2
    exit 1
  fi
  echo "  Login OK" >&2
}

if [[ -z "$BEARER" || -z "$XSRF" ]]; then
  if [[ -z "$USER_EMAIL" || -z "$PASSWORD" ]]; then
    echo "Missing credentials. Set DSPACE_USER/DSPACE_PASSWORD (auto-login) or DSPACE_BEARER/DSPACE_XSRF." >&2
    exit 1
  fi
  dspace_login
fi

refresh_auth_headers() {
  auth_headers=(-H "Authorization: Bearer ${BEARER}" \
    -H "Accept: application/json" \
    -H "X-XSRF-TOKEN: ${XSRF}" \
    -H "Cookie: DSPACE-XSRF-COOKIE=${XSRF}")
}
refresh_auth_headers

# ASCII names (sync-by-name ignores diacritics) — keep identical to .ps1
SEMESTER_NAME="Hoc ky 1 - 2025"
PERIOD_NAME="Dot nop HK1/2025"
declare -a FACULTIES=(
  "KHOA KY THUAT XAY DUNG"
  "KHOA KY THUAT DIA CHAT VA DAU KHI"
  "KHOA KHOA HOC UNG DUNG"
  "KHOA CO KHI"
  "KHOA CONG NGHE VAT LIEU"
  "KHOA KY THUAT GIAO THONG"
  "KHOA KHOA HOC VA KY THUAT MAY TINH"
  "KHOA KY THUAT HOA HOC"
  "KHOA QUAN LY CONG NGHIEP"
  "KHOA MOI TRUONG VA TAI NGUYEN"
  "KHOA DIEN - DIEN TU"
)

meta_body() {
  local name="$1"
  python - "$name" <<'PY'
import json, sys
name = sys.argv[1]
print(json.dumps({
  "name": name,
  "metadata": {
    "dc.title": [{"value": name, "language": None, "authority": None, "confidence": -1}]
  }
}))
PY
}

dspace_post() {
  local path="$1"
  local body="$2"
  local content_type="${3:-application/json}"
  echo "POST ${path}" >&2
  refresh_auth_headers
  local tmp_headers tmp_body http_code
  tmp_headers="$(mktemp)"
  tmp_body="$(mktemp)"
  http_code="$(curl -sS -o "$tmp_body" -w "%{http_code}" -D "$tmp_headers" \
    -X POST "${BASE_URL}${path}" \
    "${auth_headers[@]}" \
    -H "Content-Type: ${content_type}" \
    --data-binary "$body")"
  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "ERROR ${http_code} : $(cat "$tmp_body")" >&2
    rm -f "$tmp_headers" "$tmp_body"
    return 1
  fi
  # Refresh XSRF if rotated
  local maybe_xsrf
  maybe_xsrf="$(header_value "$tmp_headers" "DSPACE-XSRF-TOKEN")"
  if [[ -n "$maybe_xsrf" ]]; then
    XSRF="$maybe_xsrf"
  fi
  cat "$tmp_body"
  rm -f "$tmp_headers" "$tmp_body"
}

create_community() {
  local body id
  body="$(meta_body "$1")"
  id="$(dspace_post "/api/core/communities" "$body" | extract_id)"
  echo "$id"
}

# RestContract: POST /api/core/communities?parent=<uuid>
# https://github.com/DSpace/RestContract/blob/main/communities.md
create_subcommunity() {
  local parent="$1"
  local name="$2"
  local body id
  body="$(meta_body "$name")"
  id="$(dspace_post "/api/core/communities?parent=${parent}" "$body" | extract_id)"
  if [[ -z "$id" ]]; then
    echo "Subcommunity create returned no id for: ${name}" >&2
    exit 1
  fi
  echo "$id"
}

# RestContract: POST /api/core/collections?parent=<uuid>
create_collection() {
  local parent="$1"
  local name="$2"
  local body id
  body="$(meta_body "$name")"
  id="$(dspace_post "/api/core/collections?parent=${parent}" "$body" | extract_id)"
  if [[ -z "$id" ]]; then
    echo "Collection create returned no id for: ${name}" >&2
    exit 1
  fi
  echo "$id"
}

echo "DSpace base: ${BASE_URL}"

if [[ -n "$PARENT_ID" ]]; then
  ROOT_ID="$PARENT_ID"
  echo "Using existing parent/root: ${ROOT_ID}"
else
  ROOT_ID="$(create_community "$ROOT_NAME")"
  echo "Created root: ${ROOT_NAME} => ${ROOT_ID}"
fi

if [[ -z "$ROOT_ID" ]]; then
  echo "Failed to resolve root community id" >&2
  exit 1
fi

OUT_DIR="$(cd "$(dirname "$0")" && pwd)/out"
mkdir -p "$OUT_DIR"
OUT_FILE="${OUT_DIR}/dspace-seed-$(date +%Y%m%d-%H%M%S).tsv"
echo -e "level\tname\tid\tparent_id" > "$OUT_FILE"
echo -e "root\t${ROOT_NAME}\t${ROOT_ID}\t" >> "$OUT_FILE"

for faculty_name in "${FACULTIES[@]}"; do
  faculty_id="$(create_subcommunity "$ROOT_ID" "$faculty_name")"
  echo "  Faculty: ${faculty_name} => ${faculty_id}"
  echo -e "faculty\t${faculty_name}\t${faculty_id}\t${ROOT_ID}" >> "$OUT_FILE"

  semester_id="$(create_subcommunity "$faculty_id" "$SEMESTER_NAME")"
  echo "    Semester: ${SEMESTER_NAME} => ${semester_id}"
  echo -e "semester\t${SEMESTER_NAME}\t${semester_id}\t${faculty_id}" >> "$OUT_FILE"

  collection_id="$(create_collection "$semester_id" "$PERIOD_NAME")"
  echo "      Period: ${PERIOD_NAME} => ${collection_id}"
  echo -e "period\t${PERIOD_NAME}\t${collection_id}\t${semester_id}" >> "$OUT_FILE"
done

echo
echo "Done. Root community id (set as dspace_root_community_id):"
echo "${ROOT_ID}"
echo "TSV report: ${OUT_FILE}"
echo "Next: Sync from DSpace root (name match ignores Vietnamese diacritics)."