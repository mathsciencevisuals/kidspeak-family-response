import type {
  FamilyTrendSnapshot,
  LanguagePreference,
  LiveCoachNudge,
  Session,
  SessionMetric,
  TranscriptUpload,
  TrendInsight,
} from "../types/domain";
import { collectionRef, type FirestoreClient } from "./firestoreTypes";

type RepoModel =
  | TranscriptUpload
  | SessionMetric
  | FamilyTrendSnapshot
  | LanguagePreference
  | LiveCoachNudge
  | TrendInsight
  | Session;

const transcriptUploads = collectionRef<TranscriptUpload & Record<string, unknown>>("transcriptUploads");
const sessionMetrics = collectionRef<SessionMetric & Record<string, unknown>>("sessionMetrics");
const familyTrendSnapshots = collectionRef<FamilyTrendSnapshot & Record<string, unknown>>("familyTrendSnapshots");
const languagePreferences = collectionRef<LanguagePreference & Record<string, unknown>>("languagePreferences");
const liveCoachNudges = collectionRef<LiveCoachNudge & Record<string, unknown>>("liveCoachNudges");
const trendInsights = collectionRef<TrendInsight & Record<string, unknown>>("trendInsights");
const sessions = collectionRef<Session & Record<string, unknown>>("sessions");

export class FamilyResponseRepository {
  constructor(private readonly firestore: FirestoreClient) {}

  listSessions(familyId: string): Promise<Session[]> {
    return this.listByFamily(sessions, familyId);
  }

  saveSession(session: Session): Promise<void> {
    return this.firestore.set(sessions, session.id, session);
  }

  listTranscriptUploads(familyId: string): Promise<TranscriptUpload[]> {
    return this.listByFamily(transcriptUploads, familyId);
  }

  saveTranscriptUpload(upload: TranscriptUpload): Promise<void> {
    return this.firestore.set(transcriptUploads, upload.id, upload);
  }

  listSessionMetrics(familyId: string): Promise<SessionMetric[]> {
    return this.listByFamily(sessionMetrics, familyId);
  }

  saveSessionMetric(metric: SessionMetric): Promise<void> {
    return this.firestore.set(sessionMetrics, metric.sessionId, metric);
  }

  listTrendSnapshots(familyId: string): Promise<FamilyTrendSnapshot[]> {
    return this.listByFamily(familyTrendSnapshots, familyId);
  }

  saveTrendSnapshot(snapshot: FamilyTrendSnapshot): Promise<void> {
    return this.firestore.set(familyTrendSnapshots, snapshot.id, snapshot);
  }

  getLanguagePreference(familyId: string): Promise<LanguagePreference | null> {
    return this.firestore.get(languagePreferences, familyId);
  }

  saveLanguagePreference(preference: LanguagePreference): Promise<void> {
    return this.firestore.set(languagePreferences, preference.familyId, preference);
  }

  listLiveCoachNudges(familyId: string): Promise<LiveCoachNudge[]> {
    return this.listByFamily(liveCoachNudges, familyId);
  }

  saveLiveCoachNudge(nudge: LiveCoachNudge): Promise<void> {
    return this.firestore.set(liveCoachNudges, nudge.id, nudge);
  }

  listTrendInsights(familyId: string): Promise<TrendInsight[]> {
    return this.listByFamily(trendInsights, familyId);
  }

  saveTrendInsight(insight: TrendInsight): Promise<void> {
    return this.firestore.set(trendInsights, insight.id, insight);
  }

  private listByFamily<T extends RepoModel & Record<string, unknown>>(
    collection: { name: string },
    familyId: string,
  ): Promise<T[]> {
    return this.firestore.query(collection, "familyId", "==", familyId);
  }
}
