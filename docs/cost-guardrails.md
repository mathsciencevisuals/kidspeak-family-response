# Cost Guardrails

KidSpeak should stay within a low-cost MVP profile until usage proves the need for heavier infrastructure.

## Environment Limits

- `MAX_AUDIO_DURATION_SECONDS`: default `300`; reject or trim longer audio.
- `MAX_AUDIO_FILE_MB`: default `25`; reject larger uploads before storage or transcription.
- `DAILY_ANALYSIS_LIMIT_PER_FAMILY`: default `20`; stop expensive analysis when exceeded.
- `DAILY_THERAPIST_EXPORT_LIMIT`: default `20`; limit therapist summary/export generation.
- `DAILY_AI_PERSONALIZATION_LIMIT`: default `10`; limit user-triggered AI personalization.
- `DAILY_AI_COST_LIMIT_SOFT`: default `5`; soft alert threshold for daily AI spend.
- `DISABLE_REAL_AI`: default `true`; blocks paid AI calls in MVP/local mode.
- `USE_MOCK_TRANSCRIPTION`: default `true`; avoids transcription cost during development.
- `USE_GEMINI_ANALYSIS`: default `false`; Gemini is opt-in.
- `AUDIO_RETENTION_DAYS`: default `7`; used by Cloud Storage lifecycle deletion.
- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`.

## Runtime Rules

- Cloud Run min instances must stay `0`.
- CPU should be allocated only during request unless background workers are introduced.
- Memory starts at `512Mi`.
- Concurrency should remain enabled.
- Do not use always-on VMs, Kubernetes, Cloud SQL, or BigQuery in MVP.
- Use Firestore first for session, consent, metrics, audit, and cache records.
- Use Cloud Storage only for temporary audio and lifecycle delete raw audio.
- Cache AI analysis results by session, language, model, prompt version, and safety policy version.
- Do not call AI on page load.
- Run the rule-first pipeline before Gemini: safety classifier, rule-based parent/child patterns, then optional Gemini only for personalized scripts, therapist summaries, complex interpretation, or multilingual nuance.
- Hash transcript + situation type + child age range + analysis version before AI work and reuse cached output when present.

## Admin Dashboard

Route: `/admin/cost`

The current dashboard shows placeholders for:

- Sessions processed today.
- Total audio minutes processed.
- AI calls today.
- Failed jobs.
- Estimated cost.
- Families over daily limit.

The API endpoint is `GET /api/admin/cost`. It is admin-only when `REQUIRE_AUTH=true`.

User-triggered personalization endpoint:

- `POST /api/sessions/:id/ai/personalize`
- Purposes: `deeper_insight`, `parent_script`, `therapist_summary`
- Responses include cache badge, generated time, analysis version, and admin-only regenerate capability.

## Logging

Structured request logs include:

- request id
- user id
- user role
- session id
- route and status
- request duration
- analysis duration
- estimated AI tokens
- estimated audio seconds
- likely AI-call flag

Keep Cloud Logging retention short for MVP, for example 7 to 14 days.
