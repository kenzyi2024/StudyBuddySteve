#!/usr/bin/env bash
#
# Deploy Study Buddy Steve's backend to Google Cloud Run.
# Deploys the Python parser first, then the Node gateway (wired to the parser).
# The frontend deploys separately on Vercel — see DEPLOYMENT.md.
#
# Prereqs: gcloud CLI installed + `gcloud auth login`, a billing-enabled project,
# a MongoDB Atlas connection string, and (after Vercel) your frontend URL.
#
# Usage:
#   export PROJECT_ID=my-gcp-project
#   export MONGODB_URI='mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/study_buddy_steve'
#   export JWT_SECRET='some-long-random-string'
#   export FRONTEND_URL='https://study-buddy-steve.vercel.app'   # set/update after Vercel deploy
#   ./deploy-gcloud.sh
#
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${MONGODB_URI:?set MONGODB_URI}"
: "${JWT_SECRET:?set JWT_SECRET}"
: "${FRONTEND_URL:=https://example.vercel.app}"
REGION="${REGION:-us-central1}"

# Optional OAuth / LLM keys (leave empty to skip). Passed through if set.
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
MS_CLIENT_ID="${MS_CLIENT_ID:-}"
MS_CLIENT_SECRET="${MS_CLIENT_SECRET:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"

echo "▸ Using project $PROJECT_ID (region $REGION)"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "▸ Enabling required APIs…"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# --- 1. Python parser -------------------------------------------------
echo "▸ Deploying steve-parser…"
PARSER_ENV="PYTHONUNBUFFERED=1"
[ -n "$ANTHROPIC_API_KEY" ] && PARSER_ENV="$PARSER_ENV,ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
[ -n "$OPENAI_API_KEY" ] && PARSER_ENV="$PARSER_ENV,OPENAI_API_KEY=$OPENAI_API_KEY"

gcloud run deploy steve-parser \
  --source ./ai-parser \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 120 \
  --set-env-vars "$PARSER_ENV"

PARSER_URL="$(gcloud run services describe steve-parser --region "$REGION" --format 'value(status.url)')"
echo "  parser at: $PARSER_URL"

# --- 2. Node gateway --------------------------------------------------
echo "▸ Deploying steve-gateway…"
GW_ENV="NODE_ENV=production,PARSER_SERVICE_URL=$PARSER_URL,FRONTEND_URL=$FRONTEND_URL,MONGODB_URI=$MONGODB_URI,JWT_SECRET=$JWT_SECRET"
[ -n "$GOOGLE_CLIENT_ID" ] && GW_ENV="$GW_ENV,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
[ -n "$MS_CLIENT_ID" ] && GW_ENV="$GW_ENV,MS_CLIENT_ID=$MS_CLIENT_ID,MS_CLIENT_SECRET=$MS_CLIENT_SECRET"

gcloud run deploy steve-gateway \
  --source ./server \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "$GW_ENV"

GATEWAY_URL="$(gcloud run services describe steve-gateway --region "$REGION" --format 'value(status.url)')"

echo
echo "✅ Done."
echo "   Gateway: $GATEWAY_URL"
echo "   Parser:  $PARSER_URL"
echo
echo "Next:"
echo "  1. In Vercel, set  VITE_API_BASE = $GATEWAY_URL/api  and redeploy."
echo "  2. If OAuth: set redirect URIs to $GATEWAY_URL/api/oauth/<provider>/callback"
echo "     and add GOOGLE_REDIRECT_URI / MS_REDIRECT_URI to the gateway env."
echo "  3. Verify: curl $GATEWAY_URL/api/health   (expect \"store\":\"mongo\")"
