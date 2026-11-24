#!/usr/bin/env bash
set -euo pipefail

API="https://grafana.com/api"
BODY_FILTER='if type == "object" and has("json") then .json = "<omitted>" else . end'

usage() {
  cat >&2 <<'EOF'
usage: probe.sh <command> [args]

Sends one request per call to grafana.com and prints the status, the rate
limit headers and the answer; ALL_HEADERS=1 prints every response header.
A write is never retried.

Reads, anonymous unless AUTH_READS=1:
  state <id>                               the listing, its revisions and its images
  list <org-slug>                          an organization's listings

Writes, with GRAFANA_COM_TOKEN:
  create <dashboard.json> [multipart|json] [org]
                                           POST /dashboards, a new listing
  revision <id> <dashboard.json> [multipart|json]
                                           POST /dashboards/<id>/revisions
  listing <id> <part>...                   POST /dashboards/<id> with exactly these parts:
                                             --text NAME VALUE
                                             --text-file NAME PATH
                                             --file NAME PATH
  delete <id>                              DELETE /dashboards/<id>, with CONFIRM_DELETE=<id>
EOF
  exit 2
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

call() {
  local auth=$1 method=$2 path=$3 filter=$4 status
  shift 4
  local -a args=(--silent --show-error --proto '=https' --connect-timeout 10 --max-time 120
    --request "$method" --dump-header "$tmp/headers" --output "$tmp/body" --write-out '%{http_code}')
  if [[ $auth == auth ]]; then
    if [[ -z ${GRAFANA_COM_TOKEN:-} ]]; then
      echo "GRAFANA_COM_TOKEN is not set; nothing was sent" >&2
      exit 1
    fi
    status=$(curl "${args[@]}" --config <(printf 'header = "Authorization: Bearer %s"\n' "$GRAFANA_COM_TOKEN") "$@" "$API$path") || true
  else
    status=$(curl "${args[@]}" "$@" "$API$path") || true
  fi
  echo "$method $path -> $status"
  if [[ ${ALL_HEADERS:-} == 1 ]]; then
    tr -d '\r' <"$tmp/headers"
  else
    grep -iE '^(x-)?(ratelimit|rate-limit|retry-after|request-id)' "$tmp/headers" | tr -d '\r' || true
  fi
  jq "$filter" "$tmp/body" 2>/dev/null || head -c 2000 "$tmp/body"
  echo
  [[ $status == 2* ]]
}

read_mode() {
  if [[ ${AUTH_READS:-} == 1 ]]; then echo auth; else echo anon; fi
}

post_dashboard() {
  local path=$1 file=$2 format=$3 org=${4:-}
  local -a parts=(--form "json=@$file;type=application/json")
  case $format in
    multipart)
      [[ -z $org ]] || parts+=(--form-string "org=$org")
      call auth POST "$path" "$BODY_FILTER" "${parts[@]}"
      ;;
    json)
      jq -n --rawfile dashboard "$file" --arg org "$org" '{json: $dashboard} + (if $org == "" then {} else {org: $org} end)' |
        call auth POST "$path" "$BODY_FILTER" --header 'Content-Type: application/json' --data-binary @-
      ;;
    *) usage ;;
  esac
}

cmd_state() {
  local mode
  mode=$(read_mode)
  call "$mode" GET "/dashboards/$1" 'del(.json) | .readme |= (tostring | "\(length) chars: \(.[0:80])")' || true
  call "$mode" GET "/dashboards/$1/revisions" '[.items[] | {revision, id, createdAt, description}]' || true
  call "$mode" GET "/dashboards/$1/images" '[.items[] | {id, filename, name, mainScreenshot, createdAt}]' || true
}

cmd_list() {
  call "$(read_mode)" GET "/dashboards?orgSlug=$1" '[.items[] | {id, name, slug, revision, statusCode, privacy, updatedAt}]'
}

cmd_listing() {
  local id=$1
  shift
  local -a parts=()
  while (($#)); do
    (($# >= 3)) || usage
    case $1 in
      --text) parts+=(--form-string "$2=$3") ;;
      --text-file) parts+=(--form-string "$2=$(<"$3")") ;;
      --file) parts+=(--form "$2=@$3") ;;
      *) usage ;;
    esac
    shift 3
  done
  ((${#parts[@]})) || usage
  call auth POST "/dashboards/$id" "$BODY_FILTER" "${parts[@]}"
}

cmd_delete() {
  if [[ ${CONFIRM_DELETE:-} != "$1" ]]; then
    echo "set CONFIRM_DELETE=$1 to delete listing $1; nothing was sent" >&2
    exit 1
  fi
  call auth DELETE "/dashboards/$1" "$BODY_FILTER"
}

(($#)) || usage
command=$1
shift
case $command in
  state)
    (($# == 1)) || usage
    cmd_state "$1"
    ;;
  list)
    (($# == 1)) || usage
    cmd_list "$1"
    ;;
  create)
    (($# >= 1 && $# <= 3)) || usage
    post_dashboard /dashboards "$1" "${2:-multipart}" "${3:-}"
    ;;
  revision)
    (($# >= 2 && $# <= 3)) || usage
    post_dashboard "/dashboards/$1/revisions" "$2" "${3:-multipart}"
    ;;
  listing)
    (($# >= 1)) || usage
    cmd_listing "$@"
    ;;
  delete)
    (($# == 1)) || usage
    cmd_delete "$1"
    ;;
  *) usage ;;
esac
