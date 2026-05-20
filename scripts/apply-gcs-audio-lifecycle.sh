#!/usr/bin/env bash
set -euo pipefail

: "${AUDIO_BUCKET_NAME:?Set AUDIO_BUCKET_NAME to the Cloud Storage bucket name.}"
: "${AUDIO_RETENTION_DAYS:=7}"

cat > /tmp/kidspeak-audio-lifecycle.json <<JSON
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": ${AUDIO_RETENTION_DAYS},
        "matchesPrefix": ["raw-audio/"]
      }
    }
  ]
}
JSON

echo "Placeholder lifecycle config written to /tmp/kidspeak-audio-lifecycle.json"
echo "Apply with:"
echo "gcloud storage buckets update gs://${AUDIO_BUCKET_NAME} --lifecycle-file=/tmp/kidspeak-audio-lifecycle.json"
