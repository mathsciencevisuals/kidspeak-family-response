# GCP Low-Cost Deployment Notes

## Overall Picture

KidSpeak should start as a low-cost, India-first family behavioural communication coach on managed GCP services:

- App and API on Cloud Run with scale-to-zero enabled.
- Firestore first for the database through `STORAGE_PROVIDER=firebase`.
- Firebase Auth for user identity and role enforcement.
- Secret Manager for secrets.
- Cloud Logging with limited retention.
- GCP Memorystore-compatible Redis remains an optional local/Sprint 1-compatible toggle when `STORAGE_PROVIDER=redis` and `REDIS_URL` are configured.
- In-memory Redis adapter for local development when credentials are missing.
- Cloud Storage for temporary audio and transcript files.
- Cloud Storage lifecycle rules to delete raw audio quickly.
- Rule-based analysis first, Gemini only when the cheaper path is insufficient.
- Cached AI outputs keyed by session version, language, and analysis prompt version.
- Optional Vertex AI / Gemini only when enabled.

The MVP should avoid always-on VMs, Kubernetes, BigQuery, Cloud SQL, and real-time audio streaming unless a concrete need appears.

## Sprint 10 Cloud Run Deployment

Created deployment artifacts:

- `Dockerfile`
- `cloudbuild.yaml`
- `deploy.sh`
- `.env.example`
- `docs/cost-guardrails.md`

Cloud Run settings:

- min instances: `0`
- memory: `512Mi`
- concurrency: `80`
- CPU: `1`
- CPU throttling enabled so CPU is allocated during request
- region configurable through Cloud Build substitution `_REGION`
- no Kubernetes, no VM, no Cloud SQL, no BigQuery

Deploy manually:

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=us-central1,_SERVICE=kidspeak-family-response,_ARTIFACT_REPO=kidspeak
gcloud run deploy kidspeak-family-response --region us-central1 --image us-central1-docker.pkg.dev/PROJECT_ID/kidspeak/kidspeak-family-response:TAG
```

Deploy with script:

```bash
PROJECT_ID=your-project REGION=us-central1 SERVICE_NAME=kidspeak-family-response ./deploy.sh
```

Set Cloud Logging retention:

```bash
gcloud logging buckets update _Default --location=global --retention-days=7
```

## Production Safety

- Require auth for session routes when `REQUIRE_AUTH=true` or `NODE_ENV=production`.
- Verify consent before audio upload/transcription.
- Verify user role before therapist and admin access.
- Never expose raw GCS paths to the frontend; return opaque upload ids or signed server actions instead.
- Keep Firebase Auth verification server-side. The current middleware accepts deployment headers as a placeholder until Firebase Admin token verification is wired.

## Sprint 0 Scope

Sprint 0 should prove the product workflow before investing in expensive infrastructure:

- Upload audio already captured by mobile recorder apps.
- Paste or upload transcripts from Google Recorder, Samsung Recorder, iPhone transcription, WhatsApp voice transcription, or manual notes.
- Prefer transcript upload whenever possible to reduce transcription cost.
- Store Sprint 1 session records, transcript turns, graph nodes, recommendations, consent records, therapist notes, session metrics, trend snapshots, language preferences, and transcript uploads through the storage adapter.
- Show session history and longitudinal trends from Firestore data.
- Keep live coaching disabled by default and represented as a future placeholder.

## Storage And Retention

- Store raw audio in a dedicated Cloud Storage bucket path such as `raw-audio/{familyId}/{uploadId}`.
- Attach lifecycle deletion rules for raw audio, targeting a short retention window such as 24 hours.
- Store transcript text and derived coaching outputs separately from raw audio.
- Keep an audit field for consent status and upload source.

## Compute And AI

- Use Cloud Run scale-to-zero for API handlers and analysis workers.
- Do not call AI on page load.
- Do not transcribe if a transcript is uploaded.
- Run deterministic checks first for consent, transcript quality, missing language, trigger count, and high-risk review markers.
- Call Gemini only after rule-based analysis identifies the specific coaching output needed.
- Cache AI outputs and reuse them until the session transcript, language, prompt version, or safety policy version changes.
- Use static UI dictionaries for localisation. Do not translate every page with AI on every load.
- Use AI translation only for final coaching scripts when static or bilingual output is not enough, and cache translated scripts.

## Cost Guardrail Environment

- `MAX_AUDIO_DURATION_SECONDS`
- `MAX_AUDIO_FILE_MB`
- `DAILY_ANALYSIS_LIMIT_PER_FAMILY`
- `DAILY_THERAPIST_EXPORT_LIMIT`
- `DAILY_AI_PERSONALIZATION_LIMIT`
- `DAILY_AI_COST_LIMIT_SOFT`
- `DISABLE_REAL_AI`
- `USE_MOCK_TRANSCRIPTION`
- `USE_GEMINI_ANALYSIS`
- `AUDIO_RETENTION_DAYS`
- `LOG_LEVEL`

## Sprint 11 AI Usage Optimization

- Create an `AnalysisJob` for transcription, risk, graph, recommendation, and summary work.
- Hash transcript + situation type + child age range + analysis version before AI work.
- Reuse cached output before any paid provider call.
- Run safety rules and parent/child rule-based analysis first.
- Gemini remains optional and should be used only for personalized scripts, therapist summaries, complex pattern interpretation, or multilingual nuance.
- Personalization is user-triggered through explicit buttons and `POST /api/sessions/:id/ai/personalize`.
- Rate limits cover daily family analysis, therapist export, and AI personalization, with admin override.
- AI cost logs include model, input size, output size, duration, session id, user id, provider, purpose, and estimated cost.

## Sprint 12 History And Trends

- `/history` reads session summaries and `SessionMetric` records from Firestore.
- `/history/trends` reads `FamilyTrendSnapshot` and recent `SessionMetric` records from Firestore.
- The longitudinal intelligence engine generates parent, child, family, and therapist progress insights deterministically from stored `SessionMetric[]`.
- API routes: `GET /api/history/trends`, `POST /api/history/generate-trend-snapshot`, and `GET /api/children/:id/trend-insights`.
- Keep trend charts simple in MVP; BigQuery is not needed until analytics scale requires it.
- Use growth language: escalation rate dropped, repair attempts increased, validation improved, child regulation improved.
- Do not use parent/child blame labels, disorder labels, or diagnosis language.

## Sprint 15 Experimental Live Coach

- `/live-coach` is experimental and disabled by default.
- Simulation mode is the default and uses typed transcript lines with rule-based nudges.
- Delayed live audio chunk analysis is disabled unless `LIVE_COACH_AUDIO_ENABLED=true`.
- Chunk duration is configured with `LIVE_COACH_CHUNK_SECONDS`, default 15 seconds.
- Architecture for future real-time: browser audio chunks, WebSocket or Server-Sent Events, Cloud Run service, rule-based fast classifier first, optional cached deeper suggestions.
- No continuous storage unless the user opts in.
- No hidden recording, no child surveillance, no diagnosis.
- If a high-risk phrase appears, stop live coaching and route to safety guidance.
- Avoid sub-2-second LLM dependency in MVP because of cost and reliability.

## Sprint 1 Storage Toggle

Environment variables:

- `STORAGE_PROVIDER=firebase`: Cloud Run production path using Firestore REST and the Cloud Run service account metadata token.
- `STORAGE_PROVIDER=redis`: optional Redis/Memorystore path.
- `STORAGE_PROVIDER=memory`: local-only in-memory adapter.
- `REDIS_URL`: required for real Redis; omitted means Redis mode falls back to memory locally.

Grant the Cloud Run service account Firestore access, for example `roles/datastore.user`. Use `STORAGE_PROVIDER=memory` for local smoke tests unless Application Default Credentials are added later.

## Sprint 1 Redis Key Shape

- `session:{sessionId}`
- `family:{familyId}:sessions`
- `session:{sessionId}:turns`
- `session:{sessionId}:nodes`
- `session:{sessionId}:recommendations`
- `session:{sessionId}:metrics`
- `family:{familyId}:child:{childId}:history`
- `familyTrendSnapshot:{snapshotId}`
- `family:{familyId}:child:{childId}:trend:{periodType}:latest`
- `languagePreference:{preferenceId}`
- `family:{familyId}:user:{userId}:languagePreference`
- `transcriptUpload:{uploadId}`
- `session:{sessionId}:transcriptUploads`
- `consent:{consentId}`
- `family:{familyId}:consents`
- `therapistNote:{noteId}`
- `session:{sessionId}:therapistNotes`
- `professionalNote:{noteId}`
- `session:{sessionId}:professionalNotes`
- `assignedPractice:{practiceId}`
- `session:{sessionId}:assignedPractice`
- `therapistAudit:{eventId}`
- `session:{sessionId}:therapistAudit`
- `family:{familyId}:therapistAudit`
- `therapistExportSummary:{summaryId}`
- `session:{sessionId}:exportSummaries`
- `session:{sessionId}:riskAssessment`
- `privacyAudit:{eventId}`
- `family:{familyId}:privacyAudit`
- `session:{sessionId}:privacyAudit`
- `privacyExport:{exportId}`
- `family:{familyId}:privacyExports`

Avoid storing large transcript blobs inside `session:{sessionId}`. Store turns separately and keep each turn focused on observations and coaching signals. Use the same separation when Firebase is enabled later.

Trend snapshots should compare communication improvement, not label a parent or child. Use growth language such as escalation rate decreased, repair attempts increased, validation improved, and child clarity improved.

## Sprint 2 Intake Flow

Routes:

- `/record`: select child, situation, language, show consent reminder, record a 2-5 minute guided conversation, upload audio to Cloud Storage, create session.
- `/upload-audio`: select child, situation, language, upload mobile recorder audio, validate MIME type, duration, and file size, store raw audio in Cloud Storage, create or update session with `transcriptStatus=uploaded`.
- `/upload-transcript`: paste transcript, optionally upload `.txt/.docx/.pdf` later, detect `Parent:` and `Child:` tags, save `TranscriptUpload`, create `ConversationTurn` records, mark `transcriptStatus=transcribed`, and allow immediate analysis.

Low-cost controls:

- Supported audio MIME types: `audio/webm`, `audio/wav`, `audio/mp3`, `audio/mpeg`, `audio/mp4`, `audio/m4a`.
- Audio max duration defaults to 5 minutes through `AUDIO_MAX_DURATION_SECONDS=300`.
- Audio max file size is configurable with `AUDIO_MAX_FILE_SIZE_BYTES`.
- Raw audio deletion is controlled by Cloud Storage lifecycle deletion and `AUDIO_RETENTION_DAYS`.
- Rule-based transcript parsing runs before any AI. Speaker inference remains opt-in, not default.

## Sprint 4 Multilingual NLP

Supported transcript analysis languages:

- `en-IN`
- `hi-IN`
- `te-IN`
- `ta-IN`

The MVP uses static multilingual phrase dictionaries for rule-based detection before Gemini. For non-English transcripts, preserve the original text in UI and store optional English meaning for analysis only. Graph nodes should expose original utterance, translated meaning, detected pattern, coaching recommendation in the selected language, original language, and confidence.

Do not over-interpret local or cultural phrases. If confidence is low, mark `Needs human review` and route the case to therapist/professional review rather than forcing a conclusion.

## Sprint 5 Parent Coaching Cost Controls

- Generate parent scripts with deterministic templates first.
- Use the formula: Observe -> Validate -> Boundary -> Small Next Step.
- Do not call Gemini during page load.
- Call Gemini only when the parent explicitly clicks `Generate personalized script`.
- Cache personalized scripts by session, language, and prompt version. When Firebase is enabled, store this cache in Firestore to avoid repeated AI cost.
- If safety language suggests severe aggression, intimidation, abuse, self-harm threats, or violence, show professional review guidance instead of normal coaching alone.

## Sprint 6 Kid Self-Coaching Cost Controls

- Build the kid self-coaching screen from existing transcript turns and rule-based analysis data.
- Do not call AI on page load.
- Store child reflections as compact session-scoped records.
- Keep language positive and skill-based: paused, named my feeling, asked for help, listened, repaired.
- Avoid shame, diagnosis, or defect language.

## Sprint 7 Therapist Dashboard Cost Controls

- Build professional dashboards from stored session, turn, graph, recommendation, metric, and cached analysis records.
- Use Firestore-compatible aggregation first for family summary screens; do not add BigQuery until session volume justifies it.
- Do not call Gemini on therapist dashboard load.
- Store professional notes, assigned practice, export summaries, and therapist audit events as compact session-scoped records.
- Require `therapist_share` consent and assigned-family access before exposing professional review data.
- Export summaries should include observed patterns, coaching suggestions, practice plan, and a clear non-diagnosis disclaimer.

## Sprint 8 Safety Risk Classifier Cost Controls

- Run rule-based safety pre-checks before parent, child, graph, or LLM analysis.
- Store the session-scoped `RiskAssessment` securely and keep normal coaching from becoming the primary result when risk is high or critical.
- Use optional Gemini safety analysis only when uncertainty is high and the feature is explicitly enabled.
- Do not gamify high-risk events.
- Use professional review routing and immediate adult support language without claiming that AI confirms abuse, self-harm, or violence.

## Sprint 9 Privacy, Consent, And Retention Controls

- Raw audio must not remain in Cloud Storage indefinitely.
- Default MVP retention is delete after analysis or 7 days maximum.
- Use a GCS lifecycle rule for `raw-audio/` objects controlled by `AUDIO_RETENTION_DAYS`.
- Placeholder script: `scripts/apply-gcs-audio-lifecycle.sh`.
- Do not keep duplicate transcripts. If a parent chooses summary-only retention, delete transcript turns and keep compressed summaries.
- Avoid BigQuery and long-term logs in MVP. Keep audit logs compact and family-scoped.
- Data exports include session summaries, transcript, recommendations, and only therapist notes visible to parent.
- Privacy safety boundaries: no hidden recording, no ads based on child behaviour, and no selling or sharing child behavioural data.

Lifecycle placeholder:

```bash
AUDIO_BUCKET_NAME=kidspeak-audio AUDIO_RETENTION_DAYS=7 scripts/apply-gcs-audio-lifecycle.sh
```

## Earlier Firestore Collections

- `transcriptUploads`
- `sessionMetrics`
- `familyTrendSnapshots`
- `languagePreferences`
- `liveCoachNudges`
- `trendInsights`
- `sessions`

Each collection should include `familyId`, `createdAt` or `updatedAt`, and enough source metadata to explain whether the session came from recording, audio upload, or transcript upload.

## Safety Guardrails

- Product copy must avoid medical diagnosis claims.
- Use terms such as communication patterns, emotional signals, coaching opportunities, and professional review.
- Require consent before capture, upload, transcription, or analysis.
- Avoid hidden recording and child surveillance patterns.
- Route high-risk content to professional review instead of automated coaching.
- Localised coaching must avoid harsh judgement and must not make family hierarchy or obedience the only goal. It should focus on respectful communication, emotional regulation, safety, and boundaries.

## Sprint 3 Language Support

Initial languages:

- English India: `en-IN`
- Hindi India: `hi-IN`
- Telugu India: `te-IN`
- Tamil India: `ta-IN`

Language fields:

- `ConversationSession.language`: selected conversation language and transcription `languageCode`.
- `TranscriptUpload`: transcript language is tracked separately through language preferences and upload flow metadata.
- `LanguagePreference.uiLanguage`: static UI dictionary selection.
- `LanguagePreference.transcriptLanguage`: default transcript language.
- `LanguagePreference.recommendationLanguage`: coaching output language.
- `LanguagePreference.childFriendlyLanguageLevel`: early reader, preteen, teen, or plain family language.
