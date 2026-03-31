import type { AcceptedLanguage } from "@dubbie/db";
import camb from "@dubbie/shared/clients/cambClient";

// CAMB AI uses numeric language IDs for translation APIs
// and BCP-47 codes for streaming TTS
const CAMB_LANGUAGE_IDS: Record<string, number> = {
  english: 1,
  mandarin: 139,
  spanish: 54,
  hindi: 81,
  korean: 94,
  arabic: 5,
  portuguese: 111,
  bengali: 14,
  russian: 117,
  japanese: 88,
  french: 76,
  german: 31,
  italian: 86,
  turkish: 130,
  vietnamese: 135,
  polish: 110,
  ukrainian: 131,
  dutch: 65,
  thai: 128,
  urdu: 133,
  indonesian: 85,
  punjabi: 112,
};

// BCP-47 codes for CAMB TTS streaming
export const CAMB_BCP47_CODES: Record<string, string> = {
  english: "en-us",
  mandarin: "zh-cn",
  spanish: "es-es",
  hindi: "hi-in",
  korean: "ko-kr",
  arabic: "ar-sa",
  portuguese: "pt-br",
  bengali: "bn-in",
  russian: "ru-ru",
  japanese: "ja-jp",
  french: "fr-fr",
  german: "de-de",
  italian: "it-it",
  turkish: "tr-tr",
  vietnamese: "vi-vn",
  polish: "pl-pl",
  ukrainian: "uk-ua",
  dutch: "nl-nl",
  thai: "th-th",
  urdu: "ur-pk",
  indonesian: "id-id",
  punjabi: "pa-in",
};

export function getCambLanguageId(language: AcceptedLanguage): number | null {
  return CAMB_LANGUAGE_IDS[language] ?? null;
}

export function getCambBcp47(language: AcceptedLanguage): string {
  return CAMB_BCP47_CODES[language] ?? "en-us";
}

const POLL_INTERVAL = 2000;
const MAX_POLLS = 150; // 5 minutes max

/**
 * Translate text and generate speech in the target language using CAMB AI's
 * Translated TTS API. This combines translation + TTS in a single API call.
 *
 * Returns the audio as an ArrayBuffer.
 */
export async function cambTranslatedTts({
  text,
  sourceLanguage,
  targetLanguage,
  voiceId = 147320,
}: {
  text: string;
  sourceLanguage: AcceptedLanguage;
  targetLanguage: AcceptedLanguage;
  voiceId?: number;
}): Promise<{ audio: ArrayBuffer; translatedText?: string }> {
  const sourceLangId = getCambLanguageId(sourceLanguage);
  const targetLangId = getCambLanguageId(targetLanguage);

  if (!sourceLangId || !targetLangId) {
    throw new Error(
      `Unsupported language pair for CAMB Translated TTS: ${sourceLanguage} -> ${targetLanguage}`
    );
  }

  // Step 1: Create the translated TTS task
  const { task_id } = await camb.translatedTts.createTranslatedTts({
    text,
    source_language: sourceLangId,
    target_language: targetLangId,
    voice_id: voiceId,
  });

  // Step 2: Poll for completion
  for (let i = 0; i < MAX_POLLS; i++) {
    const status = await camb.translatedTts.getTranslatedTtsTaskStatus({
      task_id,
    });

    if (status.status === "SUCCESS" && status.run_id) {
      // Get the audio file URL
      const result = await camb.textToSpeech.getTtsRunInfo({
        run_id: status.run_id,
        output_type: "file_url",
      });

      const outputUrl = typeof result === "string" ? result : result.output_url;
      const audioResponse = await fetch(outputUrl);
      const audioBuffer = await audioResponse.arrayBuffer();

      return { audio: audioBuffer };
    }

    if (status.status !== "SUCCESS" && status.status !== "PENDING") {
      throw new Error(
        `CAMB Translated TTS failed: ${status.exception_reason || "Unknown error"}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error("CAMB Translated TTS timed out");
}
