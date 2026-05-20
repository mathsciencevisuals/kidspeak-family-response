import type { z } from "zod";
import { supportedLanguageSchema } from "../types/sprint1";

export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;
export type ScriptStyle = "formal" | "friendly" | "simple";

export type LanguageConfig = {
  languageCode: SupportedLanguage;
  displayName: string;
  parentTerm: string;
  childTerm: string;
  culturallySafeExamples: string[];
  scriptStyle: ScriptStyle;
};

export const languageConfigs: LanguageConfig[] = [
  {
    languageCode: "en-IN",
    displayName: "English India",
    parentTerm: "parent",
    childTerm: "child",
    culturallySafeExamples: [
      "I hear that this is hard. We still need a safe boundary.",
      "Let us pause and restart respectfully.",
    ],
    scriptStyle: "friendly",
  },
  {
    languageCode: "hi-IN",
    displayName: "Hindi India",
    parentTerm: "माता-पिता",
    childTerm: "बच्चा",
    culturallySafeExamples: [
      "मैं समझता/समझती हूं कि यह मुश्किल है। फिर भी हमें सुरक्षित सीमा रखनी है।",
      "चलो थोड़ा रुककर सम्मान से फिर शुरू करते हैं।",
    ],
    scriptStyle: "simple",
  },
  {
    languageCode: "te-IN",
    displayName: "Telugu India",
    parentTerm: "తల్లిదండ్రులు",
    childTerm: "పిల్ల",
    culturallySafeExamples: [
      "ఇది కష్టం అనిపిస్తోందని నేను అర్థం చేసుకుంటున్నాను. అయినా మనం సురక్షితమైన హద్దు పెట్టాలి.",
      "కొంచెం ఆగి గౌరవంగా మళ్లీ మొదలుపెడదాం.",
    ],
    scriptStyle: "simple",
  },
  {
    languageCode: "ta-IN",
    displayName: "Tamil India",
    parentTerm: "பெற்றோர்",
    childTerm: "குழந்தை",
    culturallySafeExamples: [
      "இது கடினமாக இருக்கிறது என்பதை நான் புரிந்துகொள்கிறேன். இருந்தாலும் பாதுகாப்பான எல்லை தேவை.",
      "சிறிது நேரம் நின்று மரியாதையுடன் மீண்டும் தொடங்கலாம்.",
    ],
    scriptStyle: "simple",
  },
];

export const uiDictionary: Record<SupportedLanguage, Record<string, string>> = {
  "en-IN": {
    recordNow: "Record Now",
    uploadVoiceFile: "Upload Voice File",
    pasteUploadTranscript: "Paste / Upload Transcript",
    child: "Child",
    situation: "Situation",
    conversationLanguage: "Conversation language",
    transcriptLanguage: "Transcript language",
    recommendationLanguage: "Recommendation language",
    uiLanguage: "UI language",
    childFriendlyLevel: "Child-friendly language level",
    consentReminder: "Everyone being recorded should know the recording is happening and why.",
    transcriptCostBenefit: "Uploading a transcript is faster and cheaper because AI does not need to transcribe audio.",
    runAnalysis: "Run Analysis",
  },
  "hi-IN": {
    recordNow: "अभी रिकॉर्ड करें",
    uploadVoiceFile: "वॉइस फ़ाइल अपलोड करें",
    pasteUploadTranscript: "ट्रांसक्रिप्ट पेस्ट / अपलोड करें",
    child: "बच्चा",
    situation: "स्थिति",
    conversationLanguage: "बातचीत की भाषा",
    transcriptLanguage: "ट्रांसक्रिप्ट भाषा",
    recommendationLanguage: "सुझाव भाषा",
    uiLanguage: "UI भाषा",
    childFriendlyLevel: "बच्चे के लिए सरल भाषा स्तर",
    consentReminder: "जिसकी रिकॉर्डिंग हो रही है, उसे रिकॉर्डिंग और उसका कारण पता होना चाहिए।",
    transcriptCostBenefit: "ट्रांसक्रिप्ट अपलोड करना तेज और सस्ता है क्योंकि AI को ऑडियो ट्रांसक्राइब नहीं करना पड़ता।",
    runAnalysis: "विश्लेषण चलाएं",
  },
  "te-IN": {
    recordNow: "ఇప్పుడే రికార్డ్ చేయండి",
    uploadVoiceFile: "వాయిస్ ఫైల్ అప్లోడ్ చేయండి",
    pasteUploadTranscript: "ట్రాన్స్క్రిప్ట్ పేస్ట్ / అప్లోడ్ చేయండి",
    child: "పిల్ల",
    situation: "పరిస్థితి",
    conversationLanguage: "సంభాషణ భాష",
    transcriptLanguage: "ట్రాన్స్క్రిప్ట్ భాష",
    recommendationLanguage: "సూచనల భాష",
    uiLanguage: "UI భాష",
    childFriendlyLevel: "పిల్లలకు సరళమైన భాష స్థాయి",
    consentReminder: "రికార్డ్ చేయబడుతున్న ప్రతి ఒక్కరికీ రికార్డింగ్ గురించి మరియు కారణం గురించి తెలియాలి.",
    transcriptCostBenefit: "ట్రాన్స్క్రిప్ట్ అప్లోడ్ చేస్తే AI ఆడియోను ట్రాన్స్క్రైబ్ చేయాల్సిన అవసరం లేదు కాబట్టి వేగంగా మరియు తక్కువ ఖర్చుతో ఉంటుంది.",
    runAnalysis: "విశ్లేషణ ప్రారంభించండి",
  },
  "ta-IN": {
    recordNow: "இப்போது பதிவு செய்",
    uploadVoiceFile: "குரல் கோப்பை பதிவேற்று",
    pasteUploadTranscript: "உரைநகலை ஒட்டு / பதிவேற்று",
    child: "குழந்தை",
    situation: "நிலைமை",
    conversationLanguage: "உரையாடல் மொழி",
    transcriptLanguage: "உரைநகல் மொழி",
    recommendationLanguage: "பரிந்துரை மொழி",
    uiLanguage: "UI மொழி",
    childFriendlyLevel: "குழந்தைக்கு எளிய மொழி நிலை",
    consentReminder: "பதிவு செய்யப்படுபவர்களுக்கு பதிவு நடக்கிறது என்பதும் ஏன் என்பதும் தெரிய வேண்டும்.",
    transcriptCostBenefit: "உரைநகலை பதிவேற்றுவது வேகமாகவும் குறைந்த செலவிலும் இருக்கும்; AI ஆடியோவை உரையாக மாற்ற தேவையில்லை.",
    runAnalysis: "ஆய்வை தொடங்கு",
  },
};

export function getLanguageConfig(languageCode: SupportedLanguage): LanguageConfig {
  return languageConfigs.find((language) => language.languageCode === languageCode) ?? languageConfigs[0];
}

export function getUiLabel(languageCode: SupportedLanguage, key: string): string {
  return uiDictionary[languageCode]?.[key] ?? uiDictionary["en-IN"][key] ?? key;
}

export function bilingualRecommendation(englishText: string, languageCode: SupportedLanguage): string {
  if (languageCode === "en-IN") {
    return englishText;
  }

  const config = getLanguageConfig(languageCode);
  return `${englishText}\n\n${config.displayName}: ${config.culturallySafeExamples[0]}`;
}
