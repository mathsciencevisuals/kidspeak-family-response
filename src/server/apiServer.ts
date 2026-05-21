import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { URL } from "node:url";
import { z, ZodError } from "zod";
import { Sprint1Repository } from "../repositories/sprint1Repository";
import { AdminRepository } from "../repositories/adminRepository";
import { createSprint1StorageAdapter, getStorageProvider } from "../repositories/storageAdapter";
import {
  conversationNodeSchema,
  conversationTurnSchema,
  createConsentRecordSchema,
  createSessionSchema,
  createTherapistNoteSchema,
  recommendationSchema,
  saveAudioUploadSchema,
  saveLanguagePreferenceSchema,
  saveSessionMetricSchema,
  saveTranscriptUploadSchema,
} from "../types/sprint1";
import { hasSpeakerTags, normalizeTranscript } from "../services/transcriptNormalizer";
import { bilingualRecommendation } from "../localisation/languages";
import { analyzeChildSelfCoaching } from "../services/childCoaching";
import { analyzeMultilingualTranscript } from "../services/multilingualNlp";
import { analyzeParentCoaching, createParentPracticePlan } from "../services/parentCoaching";
import {
  assignedPracticeInputSchema,
  createAssignedPracticeRecord,
  createExportSummary,
  createProfessionalNoteRecord,
  createTherapistAuditEvent,
  professionalNoteInputSchema,
} from "../services/therapistDashboard";
import { assessSafetyRisk } from "../services/safetyRiskClassifier";
import {
  createPrivacyAuditEvent,
  createPrivacyExportBundle,
  deleteSessionPayloadSchema,
  exportDataPayloadSchema,
  privacyConsentPayloadSchema,
} from "../services/privacyControls";
import { estimateUsage, getCostDashboardSnapshot } from "../services/costGuardrails";
import { AnalysisCache, ANALYSIS_VERSION, cacheMetadata, createInputHash } from "../services/ai/analysis-cache";
import { AiCostLogger, estimateAiCost } from "../services/ai/cost-logger";
import { RateLimiter } from "../services/ai/rate-limiter";
import { generateLongitudinalInsights } from "../services/longitudinalIntelligence";
import { parentAnalysisPrompt } from "../prompts/parent-analysis";
import { childCoachingPrompt } from "../prompts/child-coaching";
import { therapistSummaryPrompt } from "../prompts/therapist-summary";
import { riskReviewPrompt } from "../prompts/risk-review";
import {
  analyzeLiveCoachChunk,
  getLiveCoachSettings,
  liveCoachChunkPayloadSchema,
  liveCoachSimulatePayloadSchema,
  simulateLiveCoach,
} from "../services/liveCoach";

const port = Number(process.env.PORT ?? 8080);
const storageProvider = getStorageProvider();
const storage = await createSprint1StorageAdapter();
const repository = new Sprint1Repository(storage);
const adminRepository = new AdminRepository(storage);
const analysisCache = new AnalysisCache(storage);
const aiCostLogger = new AiCostLogger(storage);
const rateLimiter = new RateLimiter(storage);
const distDir = join(process.cwd(), "dist");
const requireAuth = process.env.REQUIRE_AUTH === "true" || process.env.NODE_ENV === "production";

const turnsPayloadSchema = z.object({
  turns: z.array(conversationTurnSchema.omit({ sessionId: true }).extend({ sessionId: z.string().optional() })),
});

const nodesPayloadSchema = z.object({
  nodes: z.array(conversationNodeSchema.omit({ sessionId: true }).extend({ sessionId: z.string().optional() })),
});

const recommendationsPayloadSchema = z.object({
  recommendations: z.array(recommendationSchema.omit({ sessionId: true }).extend({ sessionId: z.string().optional() })),
});
const sessionMetricsPayloadSchema = z.object({
  metrics: z.array(saveSessionMetricSchema),
});
const trendSnapshotPayloadSchema = z.object({
  familyId: z.string().min(1),
  childId: z.string().min(1),
  periodType: z.enum(["weekly", "monthly"]),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
const transcriptUploadPayloadSchema = saveTranscriptUploadSchema.omit({ normalizedText: true }).extend({
  normalizedText: z.string().optional(),
});
const translateRecommendationPayloadSchema = z.object({
  englishText: z.string().min(1),
  coachingLanguage: z.enum(["en-IN", "hi-IN", "te-IN", "ta-IN"]),
});
const multilingualAnalysisPayloadSchema = z.object({
  languageCode: z.enum(["en-IN", "hi-IN", "te-IN", "ta-IN"]),
  coachingLanguage: z.enum(["en-IN", "hi-IN", "te-IN", "ta-IN"]),
});
const mockAudioTranscriptionPayloadSchema = z.object({
  languageCode: z.enum(["en-IN", "hi-IN", "te-IN", "ta-IN"]).default("en-IN"),
  sampleTranscript: z.string().min(1).optional(),
});
const parentPracticePlanPayloadSchema = z.object({
  coachingLanguage: z.enum(["en-IN", "hi-IN", "te-IN", "ta-IN"]).default("en-IN"),
});
const childReflectionPayloadSchema = z.object({
  whatHappened: z.string().min(1),
  whatIFelt: z.string().min(1),
  whatISaid: z.string().min(1),
  biggerOrSmaller: z.enum(["bigger", "smaller", "not_sure"]),
  nextTime: z.string().min(1),
});
const aiPersonalizationPayloadSchema = z.object({
  purpose: z.enum(["deeper_insight", "parent_script", "therapist_summary"]),
  familyId: z.string().min(1),
  childAgeRange: z.string().default("9-12"),
  adminOverride: z.boolean().optional(),
});
const gtmPlanPayloadSchema = z.object({
  market: z.string().default("India"),
  segment: z.string().optional(),
});

createServer(async (request, response) => {
  const startedAt = performance.now();
  const context = requestContext(request);
  try {
    if (!authorizeRequest(request, context)) {
      return json(response, 401, { error: "Authentication required" });
    }
    await route(request, response);
  } catch (error) {
    handleError(response, error, context);
  } finally {
    logRequest(request, response, context, startedAt);
  }
}).listen(port, () => {
  console.log(`KidSpeak Sprint 1 API listening on http://localhost:${port} using ${storageProvider} storage`);
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const sessionId = matchSessionChildRoute(path);

  if (method === "GET" && path === "/healthz") {
    return json(response, 200, { ok: true, storageProvider });
  }

  if (method === "GET" && path === "/api/admin/cost") {
    return json(response, 200, getCostDashboardSnapshot());
  }

  if (method === "GET" && path === "/api/admin/users") {
    const users = await adminRepository.listUsers();
    return json(response, 200, { users, count: users.length, firestoreCollection: "admin_users" });
  }

  if (method === "GET" && /^\/api\/admin\/users\/[^/]+$/.test(path)) {
    const userId = path.split("/").at(-1)!;
    const user = await adminRepository.getUser(userId);
    return user ? json(response, 200, user) : json(response, 404, { error: "User not found" });
  }

  if (method === "PATCH" && /^\/api\/admin\/users\/[^/]+\/role$/.test(path)) {
    const userId = path.split("/")[4];
    const body = z.object({ role: z.string().min(1) }).parse(await readJson(request));
    const updated = await adminRepository.updateUserRole(userId, body.role);
    return updated ? json(response, 200, updated) : json(response, 404, { error: "User not found" });
  }

  if (method === "POST" && /^\/api\/admin\/users\/[^/]+\/suspend$/.test(path)) {
    const userId = path.split("/")[4];
    const suspended = await adminRepository.suspendUser(userId);
    return suspended ? json(response, 200, suspended) : json(response, 404, { error: "User not found" });
  }

  if (method === "GET" && path === "/api/admin/families") {
    const families = await adminRepository.listFamilies();
    return json(response, 200, { families, count: families.length, firestoreCollection: "admin_families" });
  }

  if (method === "GET" && /^\/api\/admin\/families\/[^/]+$/.test(path)) {
    const familyId = path.split("/").at(-1)!;
    const family = await adminRepository.getFamily(familyId);
    return family ? json(response, 200, family) : json(response, 404, { error: "Family not found" });
  }

  if (method === "GET" && path === "/api/admin/therapists") {
    const therapists = await adminRepository.listTherapists();
    return json(response, 200, { therapists, count: therapists.length, firestoreCollection: "admin_therapists" });
  }

  if (method === "GET" && /^\/api\/admin\/therapists\/[^/]+$/.test(path)) {
    const therapistId = path.split("/").at(-1)!;
    const therapist = await adminRepository.getTherapist(therapistId);
    return therapist ? json(response, 200, therapist) : json(response, 404, { error: "Therapist not found" });
  }

  if (method === "POST" && path === "/api/admin/break-glass") {
    const body = z.object({
      reason: z.string().min(10),
      resourceType: z.enum(["user", "family", "session", "audit_log"]),
      resourceId: z.string().min(1),
    }).parse(await readJson(request));
    const actorUserId = request.headers["x-user-id"]?.toString() ?? "anonymous";
    const actorRole = request.headers["x-user-role"]?.toString() ?? "unknown";
    const event = await adminRepository.recordBreakGlassEvent(
      actorUserId,
      actorRole,
      body.reason,
      body.resourceType,
      body.resourceId,
      "hashed-ip",
    );
    return json(response, 201, event);
  }

  if (method === "GET" && path === "/api/admin/break-glass") {
    const events = await adminRepository.listBreakGlassEvents();
    return json(response, 200, { events, count: events.length });
  }

  if (method === "POST" && path === "/api/admin/language-phrases") {
    const body = await readJson(request) as Record<string, unknown>;
    await storage.setJson(`admin:language-phrase:${String(body.id ?? Date.now())}`, body);
    return json(response, 200, { ok: true, ...body });
  }

  if (method === "POST" && path === "/api/admin/safety-rules") {
    const body = await readJson(request) as Record<string, unknown>;
    await storage.setJson(`admin:safety-rule:${String(body.id ?? Date.now())}`, body);
    return json(response, 200, { ok: true, ...body });
  }

  if (method === "POST" && path === "/api/admin/consent-templates") {
    const body = await readJson(request) as Record<string, unknown>;
    await storage.setJson(`admin:consent-template:${String(body.id ?? Date.now())}`, body);
    return json(response, 200, { ok: true, ...body });
  }

  if (method === "POST" && path === "/api/admin/cost-limits") {
    const body = await readJson(request) as Record<string, unknown>;
    await storage.setJson("admin:cost-limits", body);
    return json(response, 200, { ok: true, ...body });
  }

  if (method === "POST" && path === "/api/privacy/retention-settings") {
    const body = await readJson(request) as Record<string, unknown>;
    const familyId = String(body.familyId ?? "family-demo-1");
    await storage.setJson(`privacy:retention:${familyId}`, body);
    return json(response, 200, { ok: true, ...body });
  }

  if (method === "POST" && path === "/api/strategy/generate-gtm-plan") {
    const body = gtmPlanPayloadSchema.parse(await readJson(request));
    const inputHash = createInputHash({
      transcript: `gtm-plan:${body.market}:${body.segment ?? "all"}`,
      situationType: "custom",
      childAgeRange: "strategy",
    });
    const cached = await analysisCache.get<Record<string, unknown>>("summary", inputHash);
    if (cached) {
      return json(response, 200, {
        ...cached.output,
        cacheHit: true,
        cachedBadge: "cached",
        generatedAt: cached.generatedAt,
        analysisVersion: cached.analysisVersion,
      });
    }
    const output = {
      title: "Market hypothesis GTM plan",
      market: body.market,
      segment: body.segment ?? "multi-segment",
      plan: [
        "Validate urban parent pain points through interviews before paid acquisition.",
        "Pilot with child psychologists and parenting coaches using consented transcript upload.",
        "Use school counselor and edtech partnerships only after safety and consent workflows are proven.",
      ],
      aiUsed: false,
      note: "Placeholder deterministic plan. No AI call was made.",
    };
    const entry = await analysisCache.set({
      sessionId: "strategy",
      jobType: "summary",
      inputHash,
      provider: "mock",
      output,
    });
    return json(response, 201, {
      ...output,
      cacheHit: false,
      cachedBadge: "generated",
      generatedAt: entry.generatedAt,
      analysisVersion: entry.analysisVersion,
    });
  }

  if (method === "GET" && path === "/api/live-coach/settings") {
    return json(response, 200, getLiveCoachSettings());
  }

  if (method === "POST" && path === "/api/live-coach/simulate") {
    const body = liveCoachSimulatePayloadSchema.parse(await readJson(request));
    return json(response, 200, simulateLiveCoach(body));
  }

  if (method === "POST" && path === "/api/live-coach/chunk-analysis") {
    const body = liveCoachChunkPayloadSchema.parse(await readJson(request));
    return json(response, 200, analyzeLiveCoachChunk(body));
  }

  if (method === "POST" && path === "/api/family-profile") {
    const body = await readJson(request) as Record<string, unknown>;
    const familyId = String(body.familyId ?? "family-demo-1");
    await storage.setJson(`family:profile:${familyId}`, body);
    return json(response, 200, { ok: true, familyId, ...body });
  }

  if (method === "GET" && /^\/api\/family-profile\/[^/]+$/.test(path)) {
    const familyId = path.split("/").at(-1)!;
    const profile = await storage.getJson<Record<string, unknown>>(`family:profile:${familyId}`);
    if (!profile) return json(response, 404, { error: "Family profile not found" });
    return json(response, 200, profile);
  }

  if (method === "POST" && path === "/api/sessions") {
    const body = await readJson(request);
    const created = await repository.createSession(createSessionSchema.parse(body));
    return json(response, 201, created);
  }

  if (method === "GET" && path === "/api/sessions") {
    const familyId = url.searchParams.get("familyId");
    if (!familyId) {
      return json(response, 400, { error: "familyId query parameter is required" });
    }
    const sessions = await repository.listSessionsByFamily(familyId);
    return json(response, 200, sessions);
  }

  if (method === "GET" && /^\/api\/sessions\/[^/]+$/.test(path) && !sessionId) {
    const id = path.split("/").at(-1);
    if (!id) {
      return json(response, 404, { error: "Session not found" });
    }
    const session = await repository.getSession(id);
    return session ? json(response, 200, session) : json(response, 404, { error: "Session not found" });
  }

  if (method === "POST" && sessionId?.childRoute === "turns") {
    const body = turnsPayloadSchema.parse(await readJson(request));
    const turns = await repository.saveTranscriptTurns(sessionId.id, body.turns);
    return json(response, 200, turns);
  }

  if (method === "GET" && sessionId?.childRoute === "turns") {
    const turns = await repository.getTranscriptTurns(sessionId.id);
    return json(response, 200, turns);
  }

  if (method === "POST" && sessionId?.childRoute === "nodes") {
    const body = nodesPayloadSchema.parse(await readJson(request));
    const nodes = await repository.saveConversationNodes(sessionId.id, body.nodes);
    return json(response, 200, nodes);
  }

  if (method === "GET" && sessionId?.childRoute === "nodes") {
    const nodes = await repository.getConversationNodes(sessionId.id);
    return json(response, 200, nodes);
  }

  if (method === "POST" && sessionId?.childRoute === "recommendations") {
    const body = recommendationsPayloadSchema.parse(await readJson(request));
    const recommendations = await repository.saveRecommendations(sessionId.id, body.recommendations);
    return json(response, 200, recommendations);
  }

  const parentAnalysisSessionId = matchNestedSessionRoute(path, "parent-analysis");
  if (method === "GET" && parentAnalysisSessionId) {
    const session = await repository.getSession(parentAnalysisSessionId);
    const turns = await repository.getTranscriptTurns(parentAnalysisSessionId);
    const inputHash = createInputHash({
      transcript: turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
      situationType: session?.situationType ?? "custom",
      childAgeRange: "9-12:parent",
    });
    const cachedEntry = await analysisCache.get<Record<string, unknown>>("recommendation", inputHash);
    if (cachedEntry) {
      return json(response, 200, {
        ...cachedEntry.output,
        cacheHit: true,
        cachedBadge: "cached",
        generatedAt: cachedEntry.generatedAt,
        analysisVersion: cachedEntry.analysisVersion,
        regenerateAllowed: false,
      });
    }

    const rate = await rateLimiter.checkAndIncrement({
      familyId: session?.familyId ?? "unknown-family",
      purpose: "family_analysis",
      adminOverride: requestContext(request).userRole === "admin",
    });
    if (!rate.allowed) {
      return json(response, 429, { error: "Daily family analysis limit reached", rate });
    }
    const job = await analysisCache.createJob({
      sessionId: parentAnalysisSessionId,
      jobType: "recommendation",
      provider: "rule_based",
      inputHash,
    });
    const analysis = analyzeParentCoaching(parentAnalysisSessionId, turns);
    const saved = await repository.saveParentAnalysis(analysis);
    const cacheEntry = await analysisCache.set({
      sessionId: parentAnalysisSessionId,
      jobType: "recommendation",
      inputHash,
      provider: "rule_based",
      output: saved,
    });
    await analysisCache.completeJob(job, cacheEntry.key);
    return json(response, 200, {
      ...saved,
      cacheHit: false,
      cachedBadge: "generated",
      generatedAt: cacheEntry.generatedAt,
      analysisVersion: ANALYSIS_VERSION,
      regenerateAllowed: requestContext(request).userRole === "admin",
    });
  }

  const parentPracticeSessionId = matchNestedSessionRoute(path, "parent-practice-plan");
  if (method === "POST" && parentPracticeSessionId) {
    parentPracticePlanPayloadSchema.parse(await readJson(request));
    const plan = await repository.saveParentPracticePlan(parentPracticeSessionId, createParentPracticePlan());
    return json(response, 201, {
      sessionId: parentPracticeSessionId,
      practicePlan: plan,
      generatedBy: "rule_based",
      cacheable: true,
      geminiUsed: false,
    });
  }

  const childAnalysisSessionId = matchNestedSessionRoute(path, "child-analysis");
  if (method === "GET" && childAnalysisSessionId) {
    const session = await repository.getSession(childAnalysisSessionId);
    const turns = await repository.getTranscriptTurns(childAnalysisSessionId);
    const inputHash = createInputHash({
      transcript: turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
      situationType: session?.situationType ?? "custom",
      childAgeRange: "9-12:child",
    });
    const cachedEntry = await analysisCache.get<Record<string, unknown>>("recommendation", inputHash);
    if (cachedEntry) {
      return json(response, 200, {
        ...cachedEntry.output,
        cacheHit: true,
        cachedBadge: "cached",
        generatedAt: cachedEntry.generatedAt,
        analysisVersion: cachedEntry.analysisVersion,
        regenerateAllowed: false,
      });
    }
    const rate = await rateLimiter.checkAndIncrement({
      familyId: session?.familyId ?? "unknown-family",
      purpose: "family_analysis",
      adminOverride: requestContext(request).userRole === "admin",
    });
    if (!rate.allowed) {
      return json(response, 429, { error: "Daily family analysis limit reached", rate });
    }
    const job = await analysisCache.createJob({
      sessionId: childAnalysisSessionId,
      jobType: "recommendation",
      provider: "rule_based",
      inputHash,
    });
    const analysis = analyzeChildSelfCoaching(childAnalysisSessionId, turns);
    const saved = await repository.saveChildAnalysis(analysis);
    const cacheEntry = await analysisCache.set({
      sessionId: childAnalysisSessionId,
      jobType: "recommendation",
      inputHash,
      provider: "rule_based",
      output: saved,
    });
    await analysisCache.completeJob(job, cacheEntry.key);
    return json(response, 200, {
      ...saved,
      cacheHit: false,
      cachedBadge: "generated",
      generatedAt: cacheEntry.generatedAt,
      analysisVersion: ANALYSIS_VERSION,
      regenerateAllowed: requestContext(request).userRole === "admin",
    });
  }

  const childReflectionSessionId = matchNestedSessionRoute(path, "child-reflection");
  if (method === "POST" && childReflectionSessionId) {
    const reflection = childReflectionPayloadSchema.parse(await readJson(request));
    const saved = await repository.saveChildReflection(childReflectionSessionId, reflection);
    return json(response, 201, {
      sessionId: childReflectionSessionId,
      reflection: saved,
      aiUsed: false,
      cacheable: true,
    });
  }

  const analysisSessionId = matchNestedSessionRoute(path, "analysis/run");
  if (method === "POST" && analysisSessionId) {
    const body = multilingualAnalysisPayloadSchema.parse(await readJson(request));
    const turns = await repository.getTranscriptTurns(analysisSessionId);
    const session = await repository.getSession(analysisSessionId);
    const inputHash = createInputHash({
      transcript: turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
      situationType: session?.situationType ?? "custom",
      childAgeRange: "9-12:graph",
    });
    const cachedEntry = await analysisCache.get<Record<string, unknown>>("graph", inputHash);
    if (cachedEntry) {
      return json(response, 200, {
        ...cachedEntry.output,
        cacheHit: true,
        cachedBadge: "cached",
        generatedAt: cachedEntry.generatedAt,
        analysisVersion: cachedEntry.analysisVersion,
        regenerateAllowed: false,
      });
    }
    const rate = await rateLimiter.checkAndIncrement({
      familyId: session?.familyId ?? "unknown-family",
      purpose: "family_analysis",
      adminOverride: requestContext(request).userRole === "admin",
    });
    if (!rate.allowed) {
      return json(response, 429, { error: "Daily family analysis limit reached", rate });
    }
    const job = await analysisCache.createJob({
      sessionId: analysisSessionId,
      jobType: "graph",
      provider: "rule_based",
      inputHash,
    });
    const analysis = analyzeMultilingualTranscript(turns, body.languageCode, body.coachingLanguage);
    const nodes = await repository.saveConversationNodes(analysisSessionId, analysis.nodes);
    if (session) {
      await repository.savePrivacyAuditEvent(
        createPrivacyAuditEvent({
          familyId: session.familyId,
          sessionId: analysisSessionId,
          eventType: "analysis_run",
          actorUserId: session.createdByUserId,
          details: "Rule-based multilingual analysis run.",
        }),
      );
    }
    const output = {
      ...analysis,
      nodes,
      humanReviewRecommended: analysis.confidence === "low",
      aiInferenceUsed: false,
    };
    const cacheEntry = await analysisCache.set({
      sessionId: analysisSessionId,
      jobType: "graph",
      inputHash,
      provider: "rule_based",
      output,
    });
    await analysisCache.completeJob(job, cacheEntry.key);
    return json(response, 200, {
      ...output,
      cacheHit: false,
      cachedBadge: "generated",
      generatedAt: cacheEntry.generatedAt,
      analysisVersion: ANALYSIS_VERSION,
      regenerateAllowed: requestContext(request).userRole === "admin",
    });
  }

  const riskAssessmentSessionId = matchNestedSessionRoute(path, "risk-assessment");
  if (riskAssessmentSessionId && method === "POST") {
    const body = z.object({
      geminiSafetyAnalysisEnabled: z.boolean().optional(),
    }).parse(await readJson(request));
    const turns = await repository.getTranscriptTurns(riskAssessmentSessionId);
    const session = await repository.getSession(riskAssessmentSessionId);
    const inputHash = createInputHash({
      transcript: turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
      situationType: session?.situationType ?? "custom",
      childAgeRange: "9-12:risk",
    });
    const cachedEntry = await analysisCache.get("risk", inputHash);
    if (cachedEntry) {
      return json(response, 200, {
        assessment: cachedEntry.output,
        ...cacheMetadata(cachedEntry),
        cachedBadge: "cached",
        normalCoachingPrimary: !(cachedEntry.output as { blockNormalCoaching?: boolean }).blockNormalCoaching,
      });
    }
    const job = await analysisCache.createJob({
      sessionId: riskAssessmentSessionId,
      jobType: "risk",
      provider: "rule_based",
      inputHash,
    });
    const assessment = await repository.saveRiskAssessment(
      assessSafetyRisk(riskAssessmentSessionId, turns, {
        geminiSafetyAnalysisEnabled: body.geminiSafetyAnalysisEnabled,
      }),
    );
    const cacheEntry = await analysisCache.set({
      sessionId: riskAssessmentSessionId,
      jobType: "risk",
      inputHash,
      provider: "rule_based",
      output: assessment,
    });
    await analysisCache.completeJob(job, cacheEntry.key);
    return json(response, 201, {
      assessment,
      cacheHit: false,
      cachedBadge: "generated",
      generatedAt: cacheEntry.generatedAt,
      analysisVersion: ANALYSIS_VERSION,
      normalCoachingPrimary: !assessment.blockNormalCoaching,
      message:
        assessment.blockNormalCoaching
          ? "This conversation contains concerning language that may require immediate adult or professional attention."
          : "Normal coaching can continue with routine safety reminders.",
    });
  }

  const personalizationSessionId = matchNestedSessionRoute(path, "ai/personalize");
  if (method === "POST" && personalizationSessionId) {
    const started = performance.now();
    const body = aiPersonalizationPayloadSchema.parse(await readJson(request));
    const context = requestContext(request);
    const session = await repository.getSession(personalizationSessionId);
    const turns = await repository.getTranscriptTurns(personalizationSessionId);
    const transcript = turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n");
    const inputHash = createInputHash({
      transcript,
      situationType: session?.situationType ?? "custom",
      childAgeRange: `${body.childAgeRange}:${body.purpose}`,
    });
    const jobType = body.purpose === "therapist_summary" ? "summary" : "recommendation";
    const cachedEntry = await analysisCache.get<{ text: string; purpose: string }>(jobType, inputHash);
    if (cachedEntry) {
      return json(response, 200, {
        ...cachedEntry.output,
        cacheHit: true,
        cachedBadge: "cached",
        generatedAt: cachedEntry.generatedAt,
        analysisVersion: cachedEntry.analysisVersion,
        regenerateAllowed: context.userRole === "admin",
      });
    }
    const rate = await rateLimiter.checkAndIncrement({
      familyId: body.familyId,
      purpose: "ai_personalization",
      adminOverride: body.adminOverride || context.userRole === "admin",
    });
    if (!rate.allowed) {
      return json(response, 429, { error: "Daily AI personalization limit reached", rate });
    }
    const provider = process.env.DISABLE_REAL_AI === "false" && process.env.USE_GEMINI_ANALYSIS === "true" ? "gemini" : "mock";
    const job = await analysisCache.createJob({
      sessionId: personalizationSessionId,
      jobType,
      provider,
      inputHash,
      estimatedCost: provider === "gemini" ? 0.001 : 0,
    });
    const prompt = promptForPurpose(body.purpose);
    const output = {
      purpose: body.purpose,
      text: personalizedOutput(body.purpose, provider),
      provider,
      promptPreview: prompt.slice(0, 120),
    };
    const cacheEntry = await analysisCache.set({
      sessionId: personalizationSessionId,
      jobType,
      inputHash,
      provider,
      output,
    });
    await analysisCache.completeJob(job, cacheEntry.key);
    const durationMs = Math.round(performance.now() - started);
    const inputSize = transcript.length + prompt.length;
    const outputSize = output.text.length;
    await aiCostLogger.save({
      model: provider === "gemini" ? (process.env.GEMINI_MODEL ?? "gemini-1.5-flash") : "mock-personalization",
      inputSize,
      outputSize,
      durationMs,
      sessionId: personalizationSessionId,
      userId: context.userId,
      purpose: body.purpose,
      provider,
      estimatedCost: estimateAiCost({ provider, inputSize, outputSize }),
    });
    return json(response, 201, {
      ...output,
      cacheHit: false,
      cachedBadge: "generated",
      generatedAt: cacheEntry.generatedAt,
      analysisVersion: ANALYSIS_VERSION,
      regenerateAllowed: context.userRole === "admin",
      rate,
    });
  }

  if (riskAssessmentSessionId && method === "GET") {
    const assessment = await repository.getRiskAssessment(riskAssessmentSessionId);
    return assessment ? json(response, 200, assessment) : json(response, 404, { error: "Risk assessment not found" });
  }

  if (method === "POST" && path === "/api/consent") {
    const body = await readJson(request);
    if (typeof body === "object" && body !== null && "revokeConsentId" in body) {
      const revoked = await repository.revokeConsent(String(body.revokeConsentId));
      return revoked ? json(response, 200, revoked) : json(response, 404, { error: "Consent record not found" });
    }
    const consent = await repository.createConsentRecord(createConsentRecordSchema.parse(body));
    return json(response, 201, consent);
  }

  if (method === "GET" && path === "/api/privacy/consents") {
    const familyId = url.searchParams.get("familyId") ?? "family-demo-1";
    const consents = await repository.listConsentsByFamily(familyId);
    return json(response, 200, consents);
  }

  if (method === "POST" && path === "/api/privacy/consents") {
    const body = privacyConsentPayloadSchema.parse(await readJson(request));
    const consent = await repository.createConsentRecord(body);
    await repository.savePrivacyAuditEvent(
      createPrivacyAuditEvent({
        familyId: consent.familyId,
        eventType: "consent_granted",
        actorUserId: consent.parentUserId,
        details: `${consent.consentType} consent granted.`,
      }),
    );
    return json(response, 201, consent);
  }

  const privacyConsentId = matchPrivacyConsentRoute(path);
  if (method === "DELETE" && privacyConsentId) {
    const revoked = await repository.revokeConsent(privacyConsentId);
    if (!revoked) {
      return json(response, 404, { error: "Consent record not found" });
    }
    await repository.savePrivacyAuditEvent(
      createPrivacyAuditEvent({
        familyId: revoked.familyId,
        eventType: "consent_revoked",
        actorUserId: revoked.parentUserId,
        details: `${revoked.consentType} consent revoked.`,
      }),
    );
    return json(response, 200, revoked);
  }

  if (method === "POST" && path === "/api/privacy/delete-session") {
    const body = deleteSessionPayloadSchema.parse(await readJson(request));
    const deleted = await repository.deleteSessionData(body.sessionId, body.familyId);
    await repository.savePrivacyAuditEvent(
      createPrivacyAuditEvent({
        familyId: body.familyId,
        sessionId: body.sessionId,
        eventType: "data_deleted",
        details: `${body.deleteMode} deletion requested.`,
      }),
    );
    return json(response, 200, {
      ...deleted,
      deleteMode: body.deleteMode,
      rawAudioDeletionRequired: true,
    });
  }

  if (method === "POST" && path === "/api/privacy/export-data") {
    const body = exportDataPayloadSchema.parse(await readJson(request));
    const bundle = await repository.savePrivacyExportBundle(createPrivacyExportBundle(body));
    await repository.savePrivacyAuditEvent(
      createPrivacyAuditEvent({
        familyId: body.familyId,
        sessionId: body.sessionId,
        eventType: "data_exported",
        details: `Export requested for ${body.exportTypes.join(", ")}.`,
      }),
    );
    return json(response, 201, bundle);
  }

  if (method === "GET" && path === "/api/audit-logs") {
    const familyId = url.searchParams.get("familyId") ?? "family-demo-1";
    const events = await repository.listPrivacyAuditEvents(familyId);
    return json(response, 200, events);
  }

  if (method === "POST" && path === "/api/therapist-notes") {
    const note = await repository.createTherapistNote(createTherapistNoteSchema.parse(await readJson(request)));
    return json(response, 201, note);
  }

  if (method === "GET" && path === "/api/therapist/families") {
    return json(response, 200, await buildTherapistHome());
  }

  const therapistFamilySummaryId = matchTherapistFamilySummaryRoute(path);
  if (method === "GET" && therapistFamilySummaryId) {
    return json(response, 200, await buildTherapistFamilySummary(therapistFamilySummaryId));
  }

  const therapistSessionRoute = matchTherapistSessionRoute(path);
  if (therapistSessionRoute && method === "GET" && !therapistSessionRoute.childRoute) {
    const review = await buildTherapistSessionReview(therapistSessionRoute.id);
    await repository.saveTherapistAuditEvent(
      createTherapistAuditEvent("therapist_opened_session", "user_therapist_1", "Therapist opened session review.", {
        familyId: review.session.familyId,
        sessionId: review.session.id,
      }),
    );
    await repository.savePrivacyAuditEvent(
      createPrivacyAuditEvent({
        familyId: review.session.familyId,
        sessionId: review.session.id,
        eventType: "therapist_viewed",
        actorUserId: "user_therapist_1",
        details: "Therapist opened session review.",
      }),
    );
    return json(response, 200, review);
  }

  if (therapistSessionRoute && method === "POST" && therapistSessionRoute.childRoute === "notes") {
    const input = professionalNoteInputSchema.parse(await readJson(request));
    const note = await repository.saveProfessionalNote(createProfessionalNoteRecord(therapistSessionRoute.id, input));
    await repository.saveTherapistAuditEvent(
      createTherapistAuditEvent("therapist_added_note", input.therapistUserId, "Therapist added a professional note.", {
        sessionId: therapistSessionRoute.id,
      }),
    );
    return json(response, 201, {
      note,
      diagnosisStored: false,
      language: "observation_and_coaching",
    });
  }

  if (therapistSessionRoute && method === "POST" && therapistSessionRoute.childRoute === "assign-practice") {
    const input = assignedPracticeInputSchema.parse(await readJson(request));
    const practice = await repository.saveAssignedPractice(createAssignedPracticeRecord(therapistSessionRoute.id, input));
    return json(response, 201, {
      practice,
      aiUsed: false,
      source: "therapist_assigned_home_practice",
    });
  }

  if (therapistSessionRoute && method === "POST" && therapistSessionRoute.childRoute === "export-summary") {
    const summary = await repository.saveExportSummary(createExportSummary(therapistSessionRoute.id));
    await repository.saveTherapistAuditEvent(
      createTherapistAuditEvent("therapist_exported_summary", "user_therapist_1", "Therapist exported printable summary.", {
        sessionId: therapistSessionRoute.id,
      }),
    );
    return json(response, 201, {
      summary,
      printable: true,
      diagnosisStored: false,
    });
  }

  if (method === "POST" && path === "/api/session-metrics") {
    const body = sessionMetricsPayloadSchema.parse(await readJson(request));
    const metrics = await repository.saveSessionMetrics(body.metrics);
    return json(response, 201, metrics);
  }

  if (method === "GET" && path === "/api/history") {
    const familyId = url.searchParams.get("familyId");
    const childId = url.searchParams.get("childId");
    if (!familyId || !childId) {
      return json(response, 400, { error: "familyId and childId query parameters are required" });
    }
    const history = await repository.getSessionHistoryByChild(familyId, childId);
    return json(response, 200, history);
  }

  if (method === "GET" && path === "/api/history/trends") {
    const familyId = url.searchParams.get("familyId");
    const childId = url.searchParams.get("childId");
    if (!familyId || !childId) {
      return json(response, 400, { error: "familyId and childId query parameters are required" });
    }
    const metrics = await repository.getSessionHistoryByChild(familyId, childId);
    return json(response, 200, {
      familyId,
      childId,
      metrics,
      insights: generateLongitudinalInsights(metrics, { familyId, childId }),
      aiUsed: false,
    });
  }

  if (method === "POST" && path === "/api/history/generate-trend-snapshot") {
    const body = trendSnapshotPayloadSchema.parse(await readJson(request));
    const snapshot = await repository.generateTrendSnapshot(
      body.familyId,
      body.childId,
      body.periodType,
      body.periodStart,
      body.periodEnd,
    );
    const metrics = await repository.getSessionHistoryByChild(body.familyId, body.childId);
    return json(response, 201, {
      snapshot,
      insights: generateLongitudinalInsights(metrics, {
        familyId: body.familyId,
        childId: body.childId,
        period: `${body.periodStart.slice(0, 10)} to ${body.periodEnd.slice(0, 10)}`,
      }),
      aiUsed: false,
    });
  }

  const childTrendInsightsId = matchChildTrendInsightsRoute(path);
  if (method === "GET" && childTrendInsightsId) {
    const familyId = url.searchParams.get("familyId");
    if (!familyId) {
      return json(response, 400, { error: "familyId query parameter is required" });
    }
    const metrics = await repository.getSessionHistoryByChild(familyId, childTrendInsightsId);
    return json(response, 200, generateLongitudinalInsights(metrics, { familyId, childId: childTrendInsightsId }));
  }

  if (method === "GET" && path === "/api/trends") {
    const familyId = url.searchParams.get("familyId");
    const childId = url.searchParams.get("childId");
    const periodType = url.searchParams.get("periodType");
    if (!familyId || !childId || (periodType !== "weekly" && periodType !== "monthly")) {
      return json(response, 400, { error: "familyId, childId, and periodType=weekly|monthly are required" });
    }
    const snapshot = await repository.getFamilyTrendSnapshot(familyId, childId, periodType);
    return snapshot ? json(response, 200, snapshot) : json(response, 404, { error: "Trend snapshot not found" });
  }

  if (method === "POST" && path === "/api/trends/generate") {
    const body = trendSnapshotPayloadSchema.parse(await readJson(request));
    const snapshot = await repository.generateTrendSnapshot(
      body.familyId,
      body.childId,
      body.periodType,
      body.periodStart,
      body.periodEnd,
    );
    return json(response, 201, snapshot);
  }

  if (method === "POST" && path === "/api/language-preferences") {
    const preference = await repository.saveLanguagePreference(saveLanguagePreferenceSchema.parse(await readJson(request)));
    return json(response, 201, preference);
  }

  if (method === "POST" && path === "/api/recommendations/localise") {
    const body = translateRecommendationPayloadSchema.parse(await readJson(request));
    return json(response, 200, {
      coachingLanguage: body.coachingLanguage,
      text: bilingualRecommendation(body.englishText, body.coachingLanguage),
      aiTranslationUsed: false,
      cacheable: true,
    });
  }

  if (method === "POST" && path === "/api/transcript-uploads") {
    const upload = await repository.saveTranscriptUpload(saveTranscriptUploadSchema.parse(await readJson(request)));
    return json(response, 201, upload);
  }

  const audioUploadSessionId = matchNestedSessionRoute(path, "audio/upload");
  if (method === "POST" && audioUploadSessionId) {
    const session = await repository.getSession(audioUploadSessionId);
    const recordingConsented = session
      ? await hasGrantedConsent(session.familyId, session.childId, "recording")
      : process.env.NODE_ENV !== "production";
    if (!recordingConsented) {
      return json(response, 403, { error: "Recording consent is required before transcription or audio upload." });
    }
    const requestBody = await readJsonObject(request);
    const upload = await repository.saveAudioUpload(
      saveAudioUploadSchema.parse({
        ...requestBody,
        sessionId: audioUploadSessionId,
      }),
    );
    if (session) {
      await repository.savePrivacyAuditEvent(
        createPrivacyAuditEvent({
          familyId: session.familyId,
          sessionId: audioUploadSessionId,
          eventType: "audio_uploaded",
          actorUserId: session.createdByUserId,
          details: `Audio uploaded with ${upload.retentionDays} day retention.`,
        }),
      );
    }
    const { storagePath: _storagePath, ...publicUpload } = upload;
    return json(response, 201, {
      ...publicUpload,
      storagePathExposed: false,
    });
  }

  const mockAudioTranscriptionSessionId = matchNestedSessionRoute(path, "audio/mock-transcribe");
  if (method === "POST" && mockAudioTranscriptionSessionId) {
    const body = mockAudioTranscriptionPayloadSchema.parse(await readJson(request));
    const transcript = body.sampleTranscript ?? [
      "Parent: Please start with the first question.",
      "Child: I do not know how to start.",
      "Parent: Let us do one question together.",
    ].join("\n");
    const turns = normalizeTranscript(transcript, mockAudioTranscriptionSessionId, body.languageCode);
    const savedTurns = await repository.saveTranscriptTurns(mockAudioTranscriptionSessionId, turns);
    return json(response, 201, {
      turns: savedTurns,
      provider: "mock",
      transcriptionSkipped: false,
      nextAction: "Run Analysis",
    });
  }

  const transcriptUploadSessionId = matchNestedSessionRoute(path, "transcript/upload");
  if (method === "POST" && transcriptUploadSessionId) {
    const requestBody = await readJsonObject(request);
    const body = transcriptUploadPayloadSchema.parse({
      ...requestBody,
      sessionId: transcriptUploadSessionId,
    });
    const normalizedText = body.normalizedText ?? body.rawText.trim();
    const turns = normalizeTranscript(normalizedText, transcriptUploadSessionId, body.transcriptLanguage);
    const upload = await repository.saveTranscriptUpload({
      ...body,
      normalizedText,
    });
    const savedTurns = await repository.saveTranscriptTurns(transcriptUploadSessionId, turns);
    return json(response, 201, {
      upload,
      turns: savedTurns,
      speakerTagsDetected: hasSpeakerTags(body.rawText),
      transcriptionSkipped: true,
      nextAction: savedTurns.some((turn) => turn.speaker === "unknown")
        ? "Mark unknown speakers manually or explicitly opt into AI speaker inference."
        : "Run Analysis",
    });
  }

  const transcriptNormalizeSessionId = matchNestedSessionRoute(path, "transcript/normalize");
  if (method === "POST" && transcriptNormalizeSessionId) {
    const body = z.object({
      rawText: z.string().min(1),
      languageCode: z.enum(["en-IN", "hi-IN", "te-IN", "ta-IN"]).optional(),
    }).parse(await readJson(request));
    const languageCode = body.languageCode ?? "en-IN";
    const turns = normalizeTranscript(body.rawText, transcriptNormalizeSessionId, languageCode);
    return json(response, 200, {
      turns,
      speakerTagsDetected: hasSpeakerTags(body.rawText),
      aiInferenceUsed: false,
    });
  }

  const processingStatusSessionId = matchNestedSessionRoute(path, "processing-status");
  if (method === "GET" && processingStatusSessionId) {
    const status = await repository.getProcessingStatus(processingStatusSessionId);
    return status ? json(response, 200, status) : json(response, 404, { error: "Session not found" });
  }

  if (method === "GET" && !path.startsWith("/api/")) {
    return serveStaticApp(path, response);
  }

  return json(response, 404, { error: "Route not found" });
}

async function hasGrantedConsent(
  familyId: string,
  childId: string,
  consentType: "recording" | "therapist_share" | "data_retention" | "research_opt_in",
): Promise<boolean> {
  const consents = await repository.listConsentsByFamily(familyId);
  return consents.some((consent) => (
    consent.childId === childId && consent.consentType === consentType && consent.status === "granted"
  ));
}

function matchSessionChildRoute(path: string): { id: string; childRoute: "turns" | "nodes" | "recommendations" } | null {
  const match = path.match(/^\/api\/sessions\/([^/]+)\/(turns|nodes|recommendations)$/);
  if (!match) {
    return null;
  }

  return {
    id: decodeURIComponent(match[1]),
    childRoute: match[2] as "turns" | "nodes" | "recommendations",
  };
}

function matchNestedSessionRoute(path: string, childRoute: string): string | null {
  const escaped = childRoute.replace("/", "\\/");
  const match = path.match(new RegExp(`^/api/sessions/([^/]+)/${escaped}$`));
  return match ? decodeURIComponent(match[1]) : null;
}

function matchTherapistFamilySummaryRoute(path: string): string | null {
  const match = path.match(/^\/api\/therapist\/families\/([^/]+)\/summary$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function matchTherapistSessionRoute(path: string): { id: string; childRoute?: "notes" | "assign-practice" | "export-summary" } | null {
  const match = path.match(/^\/api\/therapist\/sessions\/([^/]+)(?:\/(notes|assign-practice|export-summary))?$/);
  if (!match) {
    return null;
  }

  return {
    id: decodeURIComponent(match[1]),
    childRoute: match[2] as "notes" | "assign-practice" | "export-summary" | undefined,
  };
}

function matchPrivacyConsentRoute(path: string): string | null {
  const match = path.match(/^\/api\/privacy\/consents\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function matchChildTrendInsightsRoute(path: string): string | null {
  const match = path.match(/^\/api\/children\/([^/]+)\/trend-insights$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function promptForPurpose(purpose: "deeper_insight" | "parent_script" | "therapist_summary"): string {
  if (purpose === "therapist_summary") {
    return therapistSummaryPrompt;
  }
  if (purpose === "parent_script") {
    return parentAnalysisPrompt;
  }
  return `${parentAnalysisPrompt}\n\n${childCoachingPrompt}\n\n${riskReviewPrompt}`;
}

function personalizedOutput(
  purpose: "deeper_insight" | "parent_script" | "therapist_summary",
  provider: "mock" | "gemini",
): string {
  const prefix = provider === "gemini" ? "Gemini-generated" : "Mock low-cost";
  if (purpose === "parent_script") {
    return `${prefix} parent script: I see this is hard to start. I understand you feel stuck. We still need one small homework step. Let us choose the first question together.`;
  }
  if (purpose === "therapist_summary") {
    return `${prefix} therapist summary: observed correction-before-connection, child frustration signals, and a repair opportunity. This is a professional review support summary, not a diagnosis.`;
  }
  return `${prefix} deeper insight: the conversation appears to improve when validation comes before correction and the next step is small and concrete.`;
}

async function buildTherapistHome() {
  const sessions = (await repository.listSessionsByFamily("family-demo-1"))
    .concat(await repository.listSessionsByFamily("family-demo-2"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const familyIds = Array.from(new Set(sessions.map((session) => session.familyId)));
  const assignedFamilies = await Promise.all(familyIds.map((familyId) => buildAssignedFamily(familyId, sessions.filter((session) => session.familyId === familyId))));
  const recentSessions = await Promise.all(sessions.slice(0, 5).map((session) => buildTherapistSessionCard(session)));

  return {
    assignedFamilies,
    recentSessions,
    highRiskSessions: recentSessions.filter((session) => session.riskLevel === "high" || session.riskLevel === "critical"),
    pendingReviewSessions: recentSessions.filter((session) => session.status === "pending_review"),
  };
}

async function buildTherapistFamilySummary(familyId: string) {
  const sessions = (await repository.listSessionsByFamily(familyId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const assignedFamily = await buildAssignedFamily(familyId, sessions);
  const childId = sessions[0]?.childId ?? "child_demo_1";
  const metrics = await repository.getSessionHistoryByChild(familyId, childId);
  const topTriggers = metrics.flatMap((metric) => metric.triggerTags).slice(0, 5);
  const parentAnalyses = await Promise.all(sessions.map((session) => repository.getParentAnalysis(session.id)));
  const childAnalyses = await Promise.all(sessions.map((session) => repository.getChildAnalysis(session.id)));
  const risks = await Promise.all(sessions.map((session) => repository.getRiskAssessment(session.id)));
  const assignedPractice = await Promise.all(sessions.map((session) => repository.listAssignedPractice(session.id)));

  return {
    familyId,
    familyName: familyNameFor(familyId),
    childName: childNameFor(childId),
    therapistShareConsentGranted: true,
    assignedTherapistUserId: "user_therapist_1",
    topTriggers: topTriggers.length > 0 ? Array.from(new Set(topTriggers)).slice(0, 5) : ["Transcript analysis available"],
    parentResponseTrends: parentAnalyses.flatMap((analysis) => analysis?.patterns ?? []).slice(0, 3).map((pattern) => `${pattern} observed in recent sessions.`),
    childResponseTrends: childAnalyses.flatMap((analysis) => analysis?.feelings ?? []).slice(0, 3).map((feeling) => `Child showed ${feeling} and needed regulation support.`),
    repairScoreTrend: metrics.map((metric) => metric.repairScore).slice(-4),
    escalationTrend: metrics.map((metric) => metric.parentEscalationScore).slice(-4),
    safetyRiskEvents: risks.filter((risk): risk is NonNullable<typeof risk> => Boolean(risk)).map((risk) => risk.recommendedAction),
    homePracticeCompletion: assignedPractice.flat().length > 0 ? 100 : 0,
    cachedSummary: parentAnalyses.find(Boolean)?.script ?? "Observed communication patterns are available from stored session analyses.",
  };
}

async function buildTherapistSessionReview(sessionId: string) {
  const session = await repository.getSession(sessionId);
  if (!session) {
    throw new Error("Therapist session not found");
  }

  const [turns, nodes, parentAnalysis, childAnalysis, riskAssessment, professionalNotes, assignedPractice] = await Promise.all([
    repository.getTranscriptTurns(sessionId),
    repository.getConversationNodes(sessionId),
    repository.getParentAnalysis(sessionId),
    repository.getChildAnalysis(sessionId),
    repository.getRiskAssessment(sessionId),
    repository.listProfessionalNotes(sessionId),
    repository.listAssignedPractice(sessionId),
  ]);

  const sessionCard = await buildTherapistSessionCard(session);

  return {
    session: sessionCard,
    consentRequired: "therapist_share" as const,
    accessGranted: true,
    transcriptTimeline: turns.map((turn) => ({
      speaker: turn.speaker,
      time: secondsToClock(turn.startTimeSec),
      text: turn.text,
      emotionalSignal: turn.emotionLabel || turn.toneLabel || turn.intentLabel,
    })),
    conversationGraph: nodes.map((node) => ({
      nodeType: node.nodeType,
      label: node.title,
      detectedPattern: node.detectedPattern ?? node.description,
      confidence: node.analysisConfidence ?? "low",
    })),
    parentCoachingObservations: parentAnalysis?.patterns.map((pattern) => `${pattern} observed in session.`) ?? ["Parent analysis not generated yet."],
    childCopingSignals: childAnalysis?.feelings.map((feeling) => `Child showed ${feeling}.`) ?? ["Child analysis not generated yet."],
    riskFlags: riskAssessment ? [riskAssessment.recommendedAction] : ["No critical risk flag in stored analysis."],
    cachedProfessionalSummary: parentAnalysis?.script ?? "Stored analysis available for therapist review.",
    professionalNotes,
    assignedPractice,
  };
}

async function buildAssignedFamily(familyId: string, sessions: Array<Awaited<ReturnType<typeof repository.getSession>> extends infer T ? T extends null ? never : T : never>) {
  const childId = sessions[0]?.childId ?? "child_demo_1";
  const risks = await Promise.all(sessions.map((session) => repository.getRiskAssessment(session.id)));
  return {
    id: familyId,
    name: familyNameFor(familyId),
    childName: childNameFor(childId),
    assignedTherapistUserId: "user_therapist_1",
    therapistShareConsentGranted: true,
    recentSessionCount: sessions.length,
    pendingReviewCount: sessions.filter((session) => session.transcriptStatus !== "analyzed").length,
    highRiskCount: risks.filter((risk) => risk?.riskLevel === "high" || risk?.riskLevel === "critical").length,
    lastSessionAt: sessions[0]?.createdAt ?? new Date().toISOString(),
  };
}

async function buildTherapistSessionCard(session: Awaited<ReturnType<typeof repository.getSession>> extends infer T ? T extends null ? never : T : never) {
  const [risk, parentAnalysis] = await Promise.all([
    repository.getRiskAssessment(session.id),
    repository.getParentAnalysis(session.id),
  ]);
  return {
    id: session.id,
    familyId: session.familyId,
    familyName: familyNameFor(session.familyId),
    childName: childNameFor(session.childId),
    date: session.createdAt.slice(0, 10),
    situation: session.situationType.replaceAll("_", " "),
    language: session.language,
    riskLevel: risk?.riskLevel ?? session.riskLevel,
    status: session.transcriptStatus === "analyzed" ? "reviewed" : "pending_review",
    summary: parentAnalysis?.patterns.length
      ? `Stored analysis shows ${parentAnalysis.patterns.join(", ")}.`
      : session.overallPattern,
  };
}

function familyNameFor(familyId: string): string {
  if (familyId === "family-demo-1") {
    return "Rao Family";
  }
  if (familyId === "family-demo-2") {
    return "Iyer Family";
  }
  return familyId;
}

function childNameFor(childId: string): string {
  if (childId === "child_demo_1") {
    return "Aarav";
  }
  if (childId === "child_demo_2") {
    return "Mira";
  }
  return childId;
}

function secondsToClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readJson(request);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("JSON body must be an object");
  }

  return body as Record<string, unknown>;
}

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function requestContext(request: IncomingMessage): {
  requestId: string;
  userId: string;
  userRole: string;
  sessionId?: string;
} {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const sessionMatch = url.pathname.match(/^\/api\/(?:sessions|therapist\/sessions)\/([^/]+)/);
  return {
    requestId: request.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
    userId: request.headers["x-user-id"]?.toString() ?? "anonymous",
    userRole: request.headers["x-user-role"]?.toString() ?? "parent",
    sessionId: sessionMatch ? decodeURIComponent(sessionMatch[1]) : undefined,
  };
}

function authorizeRequest(
  request: IncomingMessage,
  context: ReturnType<typeof requestContext>,
): boolean {
  if (!requireAuth) {
    return true;
  }

  const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  if (path === "/healthz" || (!path.startsWith("/api/") && request.method === "GET")) {
    return true;
  }
  if (!request.headers.authorization && context.userId === "anonymous") {
    return false;
  }
  if (path.startsWith("/api/therapist/") && !["therapist", "psychologist", "admin"].includes(context.userRole)) {
    return false;
  }
  if (path.startsWith("/api/admin/") && !["admin", "super_admin", "clinical_admin"].includes(context.userRole)) {
    return false;
  }
  return true;
}

function logRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ReturnType<typeof requestContext>,
  startedAt: number,
): void {
  const durationMs = Math.round(performance.now() - startedAt);
  const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  const usage = estimateUsage({ path, method: request.method ?? "GET", durationMs });
  console.log(JSON.stringify({
    severity: response.statusCode >= 500 ? "ERROR" : response.statusCode >= 400 ? "WARNING" : "INFO",
    message: "request",
    requestId: context.requestId,
    userId: context.userId,
    userRole: context.userRole,
    sessionId: context.sessionId,
    method: request.method,
    path,
    statusCode: response.statusCode,
    durationMs,
    analysisDurationMs: usage.analysisDurationMs,
    estimatedAiTokens: usage.estimatedAiTokens,
    estimatedAudioSeconds: usage.estimatedAudioSeconds,
    aiCallLikely: usage.aiCallLikely,
  }));
}

async function serveStaticApp(path: string, response: ServerResponse): Promise<void> {
  const safePath = normalize(path).replace(/^(\.\.[/\\])+/, "");
  const target = safePath === "/" ? join(distDir, "index.html") : join(distDir, safePath);
  const filePath = existsSync(target) && !target.endsWith("/") ? target : join(distDir, "index.html");
  if (!filePath.startsWith(distDir)) {
    return json(response, 403, { error: "Forbidden" });
  }
  const contentType = contentTypeFor(filePath);
  response.writeHead(200, { "content-type": contentType });
  createReadStream(filePath).pipe(response);
}

function contentTypeFor(filePath: string): string {
  const extension = extname(filePath);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function handleError(response: ServerResponse, error: unknown, context?: ReturnType<typeof requestContext>): void {
  if (error instanceof ZodError) {
    return json(response, 400, {
      error: "Validation failed",
      issues: error.issues,
    });
  }

  if (error instanceof SyntaxError) {
    return json(response, 400, { error: "Invalid JSON body" });
  }

  if (error instanceof Error) {
    console.error(JSON.stringify({
      severity: "ERROR",
      message: "request_error",
      requestId: context?.requestId,
      userId: context?.userId,
      sessionId: context?.sessionId,
      error: error.message,
      stack: process.env.LOG_LEVEL === "debug" ? error.stack : undefined,
    }));
    return json(response, 400, { error: error.message });
  }

  console.error(error);
  return json(response, 500, { error: "Internal server error" });
}
