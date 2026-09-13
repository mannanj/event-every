#!/usr/bin/env bash
# Provision the event-every Worker's secrets for the Cloudflare cutover.
#
# Values are piped straight from .env.local into `wrangler secret put` and are
# never echoed, so a shared terminal or a captured log does not leak them.
#
#   ./scripts/provision-cloudflare-secrets.sh          # show the plan, change nothing
#   ./scripts/provision-cloudflare-secrets.sh --apply  # write the secrets
#
# Review the OWNER_KEY_SOURCE mapping below before applying: the private
# provider path bills against whichever OpenRouter key it names.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
WORKER="event-every"
APPLY="${1:-}"

[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }

# The private provider path spends real money under this key. OPENROUTER_API_KEY
# is the app's existing production key; point this at the community or a
# dedicated key instead if owner spend should be accounted separately.
OWNER_KEY_SOURCE="OPENROUTER_API_KEY"

# Copied verbatim from .env.local.
COPIED=(
  AUTH_SECRET
  OPENROUTER_API_KEY
  OPENROUTER_BASE_URL
  OPENROUTER_MODEL
  OPENROUTER_SUMMARY_MODEL
  OPENROUTER_COMMUNITY_KEY
  RESEND_API_KEY
  RESEND_FROM
  KV_REST_API_URL
  KV_REST_API_TOKEN
  KV_REST_API_READ_ONLY_TOKEN
  WAITLIST_D1_PROXY_URL
  WAITLIST_D1_PROXY_SECRET
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_D1_DATABASE_ID
  DAILY_BUDGET_USD
)

# src/lib/d1.ts prefers the proxy Worker and only falls back to the REST API,
# so the account-wide D1 token stays unset unless the proxy is retired. Absent
# is the intended state here, not an oversight.
OPTIONAL=(
  CLOUDFLARE_D1_API_TOKEN
)

# C1 keys that have no Vercel equivalent. They key HMACs over state the
# Cloudflare deployment creates for itself, so a fresh random value is correct
# on first provision — but rotating one later invalidates the state it covers.
GENERATED=(
  IDENTITY_HMAC_CURRENT
  RESOLVER_CAPABILITY_HMAC
  PROVIDER_REQUEST_HMAC_CURRENT
)

read_env() {
  # Last assignment wins, matching dotenv, and surrounding quotes are stripped.
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

put() {
  if [[ "$APPLY" == "--apply" ]]; then
    printf '%s' "$2" | wrangler secret put "$1" --name "$WORKER" >/dev/null
    echo "  set      $1"
  else
    echo "  would set $1"
  fi
}

echo "Worker: $WORKER"
echo
echo "From $ENV_FILE:"
missing=()
for key in "${COPIED[@]}"; do
  value="$(read_env "$key")"
  if [[ -z "$value" ]]; then missing+=("$key"); echo "  MISSING  $key"; continue; fi
  put "$key" "$value"
done

echo
echo "Optional (skipped when unset):"
for key in "${OPTIONAL[@]}"; do
  value="$(read_env "$key")"
  if [[ -z "$value" ]]; then echo "  skipped  $key"; else put "$key" "$value"; fi
done

echo
echo "Generated (32 random bytes, hex):"
for key in "${GENERATED[@]}"; do
  put "$key" "$(openssl rand -hex 32)"
done

echo
echo "Owner provider key (from $OWNER_KEY_SOURCE):"
owner="$(read_env "$OWNER_KEY_SOURCE")"
if [[ -z "$owner" ]]; then
  echo "  MISSING  OPENROUTER_OWNER_KEY  (no $OWNER_KEY_SOURCE in $ENV_FILE)"
  missing+=("OPENROUTER_OWNER_KEY")
else
  put "OPENROUTER_OWNER_KEY" "$owner"
fi

# PROVIDER_REQUEST_HMAC_PREVIOUS and IDENTITY_HMAC_NEXT stay unset: the Worker
# treats an absent previous key as "not rotating", and setting an empty one
# would instead read as a misconfigured rotation pair.

echo
if (( ${#missing[@]} )); then
  echo "Incomplete — ${#missing[@]} missing: ${missing[*]}"
  exit 1
fi
[[ "$APPLY" == "--apply" ]] && echo "Done. Verify with: wrangler secret list --name $WORKER" || echo "Dry run. Re-run with --apply to write."
