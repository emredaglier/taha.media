#!/usr/bin/env bash
# Applies and re-checks the Cloudflare zone settings and cache rules for taha.media (ADR-0004, 0007).
# Every setting and its reason is in infra/cloudflare/README.md.
#
# Usage:
#   infra/cloudflare/settings.sh            show a plan; make no changes (default)
#   infra/cloudflare/settings.sh --apply    apply the planned changes
#
# Needs bash, curl and jq, plus these environment variables (never commit them):
#   CLOUDFLARE_API_TOKEN    scoped token, permissions listed in infra/cloudflare/README.md
#   CLOUDFLARE_ZONE_ID      zone id of taha.media
#   CLOUDFLARE_ACCOUNT_ID   account id (Web Analytics lives at account level)
# Optional overrides: MAIN_DOMAIN, CDN_HOST, CLOUDFLARE_API_BASE (tests point it at a mock).
#
# The script only reads in plan mode, and a second --apply right after the first plans nothing.

set -euo pipefail

MAIN_DOMAIN="${MAIN_DOMAIN:-taha.media}"
CDN_HOST="${CDN_HOST:-cdn.taha.media}"
API_BASE="${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}"

APPLY=0
CHANGES=0
BODY_FILE=""

die() {
  echo "error: $*" >&2
  exit 1
}

cleanup() {
  [ -n "$BODY_FILE" ] && rm -f "$BODY_FILE"
  return 0
}
trap cleanup EXIT

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --plan) APPLY=0 ;;
    -h | --help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown argument: $arg (use --apply or nothing)" ;;
  esac
done

for var in CLOUDFLARE_API_TOKEN CLOUDFLARE_ZONE_ID CLOUDFLARE_ACCOUNT_ID; do
  [ -n "${!var:-}" ] || die "$var is not set"
done
command -v curl >/dev/null || die "curl is required"
command -v jq >/dev/null || die "jq is required"

BODY_FILE="$(mktemp)"
ZONE="/zones/$CLOUDFLARE_ZONE_ID"
ACCOUNT="/accounts/$CLOUDFLARE_ACCOUNT_ID"

# api METHOD PATH [JSON_BODY]
# Prints the response JSON. Exits on any non-2xx, except a 404 on GET, which prints "null",
# and a 403 on GET when ALLOW_403 is set, which also prints "null".
api() {
  local method="$1" path="$2" body="${3:-}" status
  local args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method"
    -H 'Content-Type: application/json' --config -)
  [ -n "$body" ] && args+=(--data "$body")
  # The token goes in on stdin so it stays out of argv.
  status="$(printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" | curl "${args[@]}" "$API_BASE$path")" || die "request failed: $method $path"
  if [ "$method" = GET ] && [ "$status" = 404 ]; then
    echo null
    return 0
  fi
  if [ "$method" = GET ] && [ "$status" = 403 ] && [ -n "${ALLOW_403:-}" ]; then
    echo null
    return 0
  fi
  case "$status" in
    2??) cat "$BODY_FILE" ;;
    *) die "$method $path returned HTTP $status: $(jq -c '.errors // .' "$BODY_FILE" 2>/dev/null || cat "$BODY_FILE")" ;;
  esac
}

# change DESCRIPTION METHOD PATH JSON_BODY
# Records a pending change; sends it only with --apply.
change() {
  local desc="$1" method="$2" path="$3" body="$4"
  CHANGES=$((CHANGES + 1))
  if [ "$APPLY" = 1 ]; then
    api "$method" "$path" "$body" >/dev/null
    echo "APPLIED  $desc"
  else
    echo "PLAN     $desc"
  fi
}

ok() {
  echo "ok       $1"
}

# --- Zone settings (ADR-0004) -------------------------------------------------------------

ensure_zone_setting() {
  local id="$1" want="$2" have
  have="$(api GET "$ZONE/settings/$id" | jq -r '.result.value')"
  if [ "$have" = "$want" ]; then
    ok "zone setting $id = $want"
  else
    change "zone setting $id: $have -> $want" PATCH "$ZONE/settings/$id" \
      "$(jq -nc --arg v "$want" '{value: $v}')"
  fi
}

ensure_bot_fight_mode_off() {
  local have
  have="$(api GET "$ZONE/bot_management" | jq -r '.result.fight_mode')"
  if [ "$have" = false ]; then
    ok "Bot Fight Mode off"
  else
    change "Bot Fight Mode: on -> off" PUT "$ZONE/bot_management" '{"fight_mode":false}'
  fi
}

# Web Analytics auto-injection off for every site; the frontend adds the script tag in code (ADR-0007).
ensure_analytics_auto_install_off() {
  local list sites tag host
  # Some tokens get a 403 here whatever Account permissions they hold. That must not stop the
  # rest of the plan: warn, and the owner turns it off in the dashboard (infra/cloudflare/README.md).
  list="$(ALLOW_403=1 api GET "$ACCOUNT/rum/site_info/list")"
  if [ "$list" = null ]; then
    echo "WARN     Web Analytics auto-injection: the token can't read the site list (HTTP 403); check it is off in the dashboard (Web Analytics > $MAIN_DOMAIN > Manage site)"
    return 0
  fi
  sites="$(jq -c '.result // [] | .[] | select(.auto_install == true)' <<<"$list")"
  if [ -z "$sites" ]; then
    ok "Web Analytics auto-injection off"
    return 0
  fi
  while IFS= read -r site; do
    tag="$(jq -r '.site_tag' <<<"$site")"
    host="$(jq -r '.host' <<<"$site")"
    change "Web Analytics auto-injection for $host: on -> off" PUT "$ACCOUNT/rum/site_info/$tag" \
      "$(jq -nc --arg h "$host" '{host: $h, auto_install: false}')"
  done <<<"$sites"
}

# --- Cache rules (ADR-0004, 0005) ---------------------------------------------------------
# Only the CDN host (R2 media and /_next/static releases) and /_next/static/ on the main domain
# are cached. Every other path on the main domain (HTML, RSC, API) bypasses the cache.
# Cache rules all apply when they match, and a later one overrides an earlier one, so the bypass
# rule excludes the static path instead of relying on order.
# This script owns the whole http_request_cache_settings phase: rules made by hand in the
# dashboard are replaced.

ensure_cache_rules() {
  local desired current
  desired="$(jq -nc --arg cdn "$CDN_HOST" --arg main "$MAIN_DOMAIN" '
    "http.host in {\"\($main)\" \"www.\($main)\"}" as $mainHost |
    "starts_with(http.request.uri.path, \"/_next/static/\")" as $static |
    [
    {
      description: "CDN host: cache, respect the origin immutable headers",
      expression: "(http.host eq \"\($cdn)\")",
      action: "set_cache_settings",
      action_parameters: {
        cache: true,
        edge_ttl: {mode: "respect_origin"},
        browser_ttl: {mode: "respect_origin"}
      },
      enabled: true
    },
    {
      description: "Main domain: cache only /_next/static, respect the origin immutable headers",
      expression: "(\($mainHost) and \($static))",
      action: "set_cache_settings",
      action_parameters: {
        cache: true,
        edge_ttl: {mode: "respect_origin"},
        browser_ttl: {mode: "respect_origin"}
      },
      enabled: true
    },
    {
      description: "Main domain: never cache HTML or RSC at the edge",
      expression: "(\($mainHost) and not \($static))",
      action: "set_cache_settings",
      action_parameters: {cache: false},
      enabled: true
    }
  ]')"
  # Compare only the fields we own: the API adds id, version, ref and last_updated.
  current="$(api GET "$ZONE/rulesets/phases/http_request_cache_settings/entrypoint" |
    jq -c '[(.result.rules // [])[] | {description, expression, action, action_parameters, enabled: (.enabled // true)}]')"
  if [ "$(jq -Sc . <<<"$desired")" = "$(jq -Sc . <<<"$current")" ]; then
    ok "cache rules (CDN host and /_next/static cached, everything else bypassed)"
  else
    change "cache rules: cache CDN host and /_next/static only, bypass the rest" PUT \
      "$ZONE/rulesets/phases/http_request_cache_settings/entrypoint" \
      "$(jq -nc --argjson r "$desired" '{rules: $r}')"
  fi
}

# --- Run ----------------------------------------------------------------------------------

if [ "$APPLY" = 1 ]; then
  echo "Applying Cloudflare settings for $MAIN_DOMAIN"
else
  echo "Plan for $MAIN_DOMAIN (no changes are made; pass --apply to apply)"
fi

ensure_zone_setting ssl strict
ensure_zone_setting rocket_loader off
ensure_zone_setting email_obfuscation off
ensure_zone_setting always_online off
ensure_bot_fight_mode_off
ensure_analytics_auto_install_off
ensure_cache_rules

if [ "$APPLY" = 1 ]; then
  echo "$CHANGES change(s) applied"
else
  echo "$CHANGES change(s) planned"
  [ "$CHANGES" -eq 0 ] || echo "Run with --apply to make them."
fi
