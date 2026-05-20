import { randomUUID } from "node:crypto";
import type { SupportedLanguage } from "../localisation/languages";
import type { ConversationTurn } from "../types/sprint1";

type ParsedLine = {
  speaker: ConversationTurn["speaker"];
  text: string;
  startTimeSec: number;
  endTimeSec: number;
};

const speakerPattern = /^(?:\[(?<range>[^\]]+)\]\s*)?(?<speaker>parent|child)\s*:\s*(?<text>.+)$/i;
const timestampPattern = /(?<start>\d{1,2}:\d{2})(?:\s*[-–]\s*(?<end>\d{1,2}:\d{2}))?/;

export function normalizeTranscript(
  rawText: string,
  sessionId = "pending_session",
  originalLanguage: SupportedLanguage = "en-IN",
): ConversationTurn[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedLines = lines.map(parseLine);
  return parsedLines.map((line, index) => ({
    id: `turn_${randomUUID()}`,
    sessionId,
    speaker: line.speaker,
    startTimeSec: line.startTimeSec,
    endTimeSec: line.endTimeSec || line.startTimeSec + 1,
    text: line.text,
    originalText: line.text,
    originalLanguage,
    emotionLabel: "",
    toneLabel: "",
    intentLabel: "",
    conversationAct: line.speaker === "unknown" ? "manual_review_needed" : "transcript_turn",
    escalationScore: 0,
    repairOpportunity: "",
    suggestedReframe:
      line.speaker === "unknown" && index === 0
        ? "Speaker was not clear. Ask parent to mark turns manually or opt into AI speaker inference."
        : "",
  }));
}

export function hasSpeakerTags(rawText: string): boolean {
  return rawText
    .split(/\r?\n/)
    .some((line) => /^(?:\[[^\]]+\]\s*)?(parent|child)\s*:/i.test(line.trim()));
}

function parseLine(line: string): ParsedLine {
  const speakerMatch = line.match(speakerPattern);
  if (speakerMatch?.groups) {
    const timestamps = parseTimestampRange(speakerMatch.groups.range ?? "");
    return {
      speaker: speakerMatch.groups.speaker.toLowerCase() as "parent" | "child",
      text: speakerMatch.groups.text.trim(),
      ...timestamps,
    };
  }

  const timestamps = parseTimestampRange(line);
  return {
    speaker: "unknown",
    text: line.replace(timestampPattern, "").trim(),
    ...timestamps,
  };
}

function parseTimestampRange(value: string): Pick<ParsedLine, "startTimeSec" | "endTimeSec"> {
  const match = value.match(timestampPattern);
  if (!match?.groups) {
    return { startTimeSec: 0, endTimeSec: 0 };
  }

  const startTimeSec = toSeconds(match.groups.start);
  const endTimeSec = match.groups.end ? toSeconds(match.groups.end) : startTimeSec;
  return { startTimeSec, endTimeSec };
}

function toSeconds(value: string): number {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + seconds;
}
