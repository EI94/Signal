#!/usr/bin/env bash
set -euo pipefail

PROJECT=signal-ac219
REGION=europe-west12

echo "=== Signal Pipeline Upgrade — Deploy Script ==="
echo ""
echo "Prerequisiti:"
echo "  1. gcloud auth login (se credenziali scadute)"
echo "  2. Chiave API Gemini disponibile"
echo ""

# ────────────────────────────────────────────────
# Step 1: Crea secret Gemini in GCP (se non esiste)
# ────────────────────────────────────────────────
echo "── Step 1: Secret Gemini ──"
if gcloud secrets describe signal-staging-gemini-api-key --project=$PROJECT &>/dev/null; then
  echo "Secret 'signal-staging-gemini-api-key' esiste già."
else
  echo "Creazione secret 'signal-staging-gemini-api-key'..."
  read -rsp "Inserisci la Gemini API Key: " GEMINI_KEY
  echo ""
  echo -n "$GEMINI_KEY" | gcloud secrets create signal-staging-gemini-api-key \
    --project=$PROJECT \
    --replication-policy=automatic \
    --data-file=-
  echo "Secret creato."
fi

echo "Concedo accesso al SA intel..."
gcloud secrets add-iam-policy-binding signal-staging-gemini-api-key \
  --project=$PROJECT \
  --member="serviceAccount:signal-staging-intel@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo ""

# ────────────────────────────────────────────────
# Step 2: Build e Deploy signal-intel
# ────────────────────────────────────────────────
echo "── Step 2: Build + Deploy signal-intel ──"
cd "$(git rev-parse --show-toplevel)"

gcloud builds submit \
  --project=$PROJECT \
  --config=infra/docker/cloudbuild-intel.yaml \
  --quiet

INTEL_IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/signal-containers/signal-intel:staging"

gcloud run deploy signal-intel \
  --project=$PROJECT \
  --region=$REGION \
  --image="$INTEL_IMAGE" \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=3 \
  --set-secrets="INTEL_INTERNAL_SECRET=signal-staging-intel-internal-secret:latest,SIGNAL_RESEND_API_KEY=signal-staging-resend-api-key:latest,SIGNAL_GEMINI_API_KEY=signal-staging-gemini-api-key:latest" \
  --set-env-vars="^##^NODE_ENV=staging##FIREBASE_PROJECT_ID=${PROJECT}##SIGNAL_DEFAULT_WORKSPACE_ID=maire-workspace-v1##SIGNAL_INTEL_NORMALIZED_WRITES_ENABLED=true##SIGNAL_INTEL_EVENT_EXTRACTION_ENABLED=true##SIGNAL_INTEL_SIGNAL_PROMOTION_ENABLED=true##SIGNAL_ALERT_EVALUATION_ENABLED=true##SIGNAL_BRIEF_GENERATION_ENABLED=true##SIGNAL_RESEND_ENABLED=true##SIGNAL_RESEND_FROM_EMAIL=alerts@mail.signalfromtheworld.com##SIGNAL_RESEND_FROM_NAME=Signal##SIGNAL_GEMINI_ENABLED=true##SIGNAL_GEMINI_MODEL=gemini-2.0-flash##SIGNAL_GEMINI_MAX_CALLS_PER_RUN=50##SIGNAL_USAGE_METERING_ENABLED=true" \
  --service-account="signal-staging-intel@${PROJECT}.iam.gserviceaccount.com" \
  --quiet

INTEL_URL=$(gcloud run services describe signal-intel --project=$PROJECT --region=$REGION --format='value(status.url)')
echo "signal-intel deployed at: $INTEL_URL"

echo "Concedo roles/run.invoker a ingest SA su signal-intel..."
gcloud run services add-iam-policy-binding signal-intel \
  --project=$PROJECT \
  --region=$REGION \
  --member="serviceAccount:signal-staging-ingest@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --quiet

echo ""

# ────────────────────────────────────────────────
# Step 3: Build e Deploy signal-ingest con callout a intel
# ────────────────────────────────────────────────
echo "── Step 3: Build + Deploy signal-ingest ──"

gcloud builds submit \
  --project=$PROJECT \
  --config=infra/docker/cloudbuild-ingest.yaml \
  --quiet

INGEST_IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/signal-containers/signal-ingest:staging"

gcloud run deploy signal-ingest \
  --project=$PROJECT \
  --region=$REGION \
  --image="$INGEST_IMAGE" \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=3 \
  --set-secrets="INGEST_RUN_ONCE_SECRET=signal-staging-ingest-run-once-secret:latest,SIGNAL_INTEL_SECRET=signal-staging-intel-internal-secret:latest" \
  --set-env-vars="^##^NODE_ENV=staging##FIREBASE_PROJECT_ID=${PROJECT}##SIGNAL_DEFAULT_WORKSPACE_ID=maire-workspace-v1##SIGNAL_INGEST_PERSISTENCE_ENABLED=true##SIGNAL_PUBLISH_SOURCE_CONTENT_EVENTS_ENABLED=false##SIGNAL_PIPELINE_CALLOUT_ENABLED=true##SIGNAL_INTEL_BASE_URL=${INTEL_URL}##SIGNAL_USAGE_METERING_ENABLED=true" \
  --service-account="signal-staging-ingest@${PROJECT}.iam.gserviceaccount.com" \
  --quiet

INGEST_URL=$(gcloud run services describe signal-ingest --project=$PROJECT --region=$REGION --format='value(status.url)')
echo "signal-ingest deployed at: $INGEST_URL"
echo ""

# ────────────────────────────────────────────────
# Step 4: Crea Cloud Scheduler (ogni 2 ore)
# ────────────────────────────────────────────────
echo "── Step 4: Cloud Scheduler ──"

SCHEDULER_SA="signal-staging-scheduler@${PROJECT}.iam.gserviceaccount.com"

echo "Concedo roles/run.invoker al scheduler SA su signal-ingest..."
gcloud run services add-iam-policy-binding signal-ingest \
  --project=$PROJECT \
  --region=$REGION \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker" \
  --quiet

INGEST_SECRET=$(gcloud secrets versions access latest --secret=signal-staging-ingest-run-once-secret --project=$PROJECT 2>/dev/null || echo "")

if gcloud scheduler jobs describe signal-ingest-cycle --project=$PROJECT --location=$REGION &>/dev/null; then
  echo "Scheduler job 'signal-ingest-cycle' esiste già. Aggiorno..."
  gcloud scheduler jobs update http signal-ingest-cycle \
    --project=$PROJECT \
    --location=$REGION \
    --schedule="0 */2 * * *" \
    --uri="${INGEST_URL}/internal/run-once" \
    --http-method=POST \
    --headers="Content-Type=application/json,x-signal-ingest-secret=${INGEST_SECRET}" \
    --message-body='{}' \
    --oidc-service-account-email="$SCHEDULER_SA" \
    --oidc-token-audience="$INGEST_URL" \
    --quiet
else
  echo "Creazione scheduler job 'signal-ingest-cycle' (ogni 2 ore)..."
  gcloud scheduler jobs create http signal-ingest-cycle \
    --project=$PROJECT \
    --location=$REGION \
    --schedule="0 */2 * * *" \
    --uri="${INGEST_URL}/internal/run-once" \
    --http-method=POST \
    --headers="Content-Type=application/json,x-signal-ingest-secret=${INGEST_SECRET}" \
    --message-body='{}' \
    --oidc-service-account-email="$SCHEDULER_SA" \
    --oidc-token-audience="$INGEST_URL" \
    --quiet
fi

echo ""

# ────────────────────────────────────────────────
# Step 5: Test manuale — trigger un ciclo ingest
# ────────────────────────────────────────────────
echo "── Step 5: Test manuale ──"
echo "Triggero scheduler job manualmente..."
gcloud scheduler jobs run signal-ingest-cycle \
  --project=$PROJECT \
  --location=$REGION

echo ""
echo "=== Deploy completo! ==="
echo ""
echo "Prossimi passi:"
echo "  1. Controlla i log: gcloud run services logs read signal-ingest --project=$PROJECT --region=$REGION --limit=30"
echo "  2. Controlla i log intel: gcloud run services logs read signal-intel --project=$PROJECT --region=$REGION --limit=30"
echo "  3. Verifica i nuovi segnali in Firestore o nel frontend"
echo "  4. Il scheduler triggerera' automaticamente ogni 2 ore"
