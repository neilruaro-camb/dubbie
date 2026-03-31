import { v4 as uuidv4 } from "uuid";
import { AcceptedLanguage, prisma, type Project, type Segment, type Track } from "@dubbie/db";
import { translateSentences } from "@dubbie/shared/services/translateSentences";
import { updateProjectStatus } from "../updateProjectStatus";
import { getDefaultVoiceForLanguage } from "@dubbie/shared/languages";
import { uploadAudioArrayToStorage } from "@dubbie/shared/services/firebaseUploads";
import { generateAudio } from "@dubbie/shared/services/generateAudio";
import { getAudioDuration } from "@dubbie/shared/utils/getAudioDuration";
import { ALL_VOICES } from "@dubbie/shared/voices";
import { getCambBcp47, cambTranslatedTts } from "@dubbie/shared/services/cambTranslatedTts";
import { appendToJsonFile } from "../../appendToJsonFile";

export async function createTranslatedTrack(projectId: string): Promise<string> {
  updateProjectStatus(projectId, "TRANSLATING");
  const project = await getProject(projectId);
  const originalTrack = await getOriginalTrack(projectId);

  const isCambVoice = project.defaultVoiceProvider === "camb";

  if (isCambVoice) {
    // CAMB Translated TTS: translate + generate speech in one call per segment
    const cambVoiceId = await resolveCambVoiceId(project.defaultVoiceName);
    const originalSegments = originalTrack.segments;

    await deleteExistingTrackIfExists(projectId, project.targetLanguage);

    // Create segments with original text (will be replaced with translated text after TTS)
    const placeholderSegments = originalSegments.map((segment) => ({
      id: uuidv4(),
      index: segment.index,
      startTime: segment.startTime,
      endTime: segment.endTime,
      text: segment.text, // original text, will be spoken in target language by CAMB
      audioUrl: null,
      voiceName: project.defaultVoiceName,
      voiceProvider: "camb",
      createdAt: new Date(),
      updatedAt: new Date(),
      trackId: "",
    }));

    const translatedTrack = await createTrackWithSegments(
      projectId,
      project.targetLanguage,
      placeholderSegments
    );

    updateProjectStatus(projectId, "AUDIO_PROCESSING");
    await generateCambTranslatedSpeech(
      translatedTrack,
      originalSegments,
      project.originalLanguage || "english",
      project.targetLanguage,
      cambVoiceId
    );
    updateProjectStatus(projectId, "COMPLETED");
    return translatedTrack.id;
  }

  // Standard path: translate via LLM, then generate audio
  const translatedSegments = await translateSegments(
    originalTrack.segments,
    project.targetLanguage
  );
  appendToJsonFile("test.json", "translated segments", translatedSegments);

  await deleteExistingTrackIfExists(projectId, project.targetLanguage);
  const translatedTrack = await createTrackWithSegments(
    projectId,
    project.targetLanguage,
    translatedSegments
  );
  updateProjectStatus(projectId, "AUDIO_PROCESSING");
  await generateSpeechForAllSegments(translatedTrack, translatedSegments);
  updateProjectStatus(projectId, "COMPLETED");
  return translatedTrack.id;
}

/* ⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️⏺️ */
/* functions below aren't really meant to be used in other functions */
/* broken apart simply for readability, not composability per-se*/

async function getProject(projectId: string): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  return project;
}

async function getOriginalTrack(projectId: string) {
  const originalTrack = await prisma.track.findFirst({
    where: { projectId, language: "original" },
    include: { segments: true },
  });
  if (!originalTrack) throw new Error("Original track not found");
  return originalTrack;
}

async function translateSegments(
  originalSegments: Segment[],
  targetLanguage: AcceptedLanguage
): Promise<Segment[]> {
  const sentencesToTranslate = originalSegments.map((segment) => segment.text);
  const translatedSentences = await translateSentences({
    sentences: sentencesToTranslate,
    targetLanguage,
  });

  return originalSegments.map((segment, index) => ({
    id: uuidv4(),
    index: segment.index,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: translatedSentences[index],
    audioUrl: null,
    voiceName: segment.voiceName,
    voiceProvider: segment.voiceProvider,
    createdAt: new Date(),
    updatedAt: new Date(),
    trackId: "", // This will be updated when creating the track
  }));
}

async function deleteExistingTrackIfExists(
  projectId: string,
  targetLanguage: AcceptedLanguage
): Promise<void> {
  const trackExists = await prisma.track.findFirst({
    where: { projectId, language: targetLanguage },
  });

  if (trackExists) {
    await prisma.segment.deleteMany({ where: { trackId: trackExists.id } });
    await prisma.track.delete({ where: { id: trackExists.id } });
  }
}

async function createTrackWithSegments(
  projectId: string,
  targetLanguage: AcceptedLanguage,
  segments: Segment[]
) {
  const translatedTrack = await prisma.track.create({
    data: { projectId, language: targetLanguage },
  });

  await Promise.all(
    segments.map((segment) =>
      prisma.segment.create({
        data: {
          ...segment,
          trackId: translatedTrack.id,
        },
      })
    )
  );

  return translatedTrack;
}

async function generateSpeechForAllSegments(
  translatedTrack: Track,
  translatedSegments: Segment[]
): Promise<void> {
  const CONCURRENCY_LIMIT = 10;
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 1000;
  const REQUEST_INTERVAL = 200; // 100 ms interval to ensure at most 10 requests per second
  console.log("Audio generation process started");

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const retryWithDelay = async (
    fn: () => Promise<void>,
    retries: number,
    delayTime: number
  ): Promise<void> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await fn();
        return;
      } catch (error) {
        if (attempt < retries) {
          await delay(delayTime * 2 ** attempt);
        } else {
          throw error;
        }
      }
    }
  };

  const processSegment = async (segment: Segment) => {
    await retryWithDelay(
      () => generateAudioWithRetry(segment, translatedTrack),
      MAX_RETRIES,
      RETRY_DELAY
    );
  };

  const queue: Promise<void>[] = [];
  for (const segment of translatedSegments) {
    const task = processSegment(segment);
    queue.push(task);

    if (queue.length >= CONCURRENCY_LIMIT) {
      await Promise.race(queue);
      queue.splice(
        queue.findIndex((p) => p === task),
        1
      );
    }

    // Introduce delay to throttle requests
    await delay(REQUEST_INTERVAL);
  }

  await Promise.all(queue);
  console.log("Audio generation process completed");
}

async function resolveCambVoiceId(voiceName: string): Promise<number> {
  try {
    const camb = (await import("@dubbie/shared/clients/cambClient")).default;
    const voices = await camb.voiceCloning.listVoices();
    const match = voices.find(
      (v): v is { id: number; voice_name: string } =>
        typeof v === "object" && v !== null && "voice_name" in v && v.voice_name === voiceName
    );
    if (match) return match.id;
  } catch (error) {
    console.warn("Could not fetch CAMB voices, using default voice ID");
  }
  return 147320; // fallback default
}

async function generateCambTranslatedSpeech(
  translatedTrack: Track,
  originalSegments: Segment[],
  sourceLanguage: AcceptedLanguage,
  targetLanguage: AcceptedLanguage,
  voiceId: number
): Promise<void> {
  const CONCURRENCY_LIMIT = 5;
  const REQUEST_INTERVAL = 500;
  console.log("CAMB Translated TTS generation started");

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const processSegment = async (segment: Segment) => {
    const text = segment.text;
    if (!text) return;

    const { audio } = await cambTranslatedTts({
      text,
      sourceLanguage,
      targetLanguage,
      voiceId,
    });

    const audioUint8Array = new Uint8Array(audio);
    const url = await uploadAudioArrayToStorage(audioUint8Array, "generatedAudioClips");
    const audioDuration = await getAudioDuration(audioUint8Array);
    const endTime = segment.startTime + audioDuration;

    // Find the corresponding translated track segment by index
    const trackSegment = await prisma.segment.findFirst({
      where: { trackId: translatedTrack.id, index: segment.index },
    });

    if (trackSegment) {
      await prisma.segment.update({
        where: { id: trackSegment.id },
        data: { audioUrl: url, endTime },
      });
    }

    console.log(`Generated CAMB translated audio for segment index ${segment.index}`);
  };

  const queue: Promise<void>[] = [];
  for (const segment of originalSegments) {
    const task = processSegment(segment);
    queue.push(task);

    if (queue.length >= CONCURRENCY_LIMIT) {
      await Promise.race(queue);
      queue.splice(queue.findIndex((p) => p === task), 1);
    }
    await delay(REQUEST_INTERVAL);
  }

  await Promise.all(queue);
  console.log("CAMB Translated TTS generation completed");
}

async function generateAudioWithRetry(
  translatedSegment: Segment,
  translatedTrack: Track
): Promise<void> {
  const text = translatedSegment.text;
  if (!text) return;

  const language = translatedTrack.language;
  console.log(
    `Finding voice for segment with voiceName: ${translatedSegment.voiceName} and language: ${language}`
  );

  const voice =
    ALL_VOICES.find((v) => {
      const match = v.name === translatedSegment.voiceName;
      console.log(`Checking voice: ${v.name}, Match: ${match}`);
      return match;
    }) ||
    getDefaultVoiceForLanguage(language) ||
    ALL_VOICES[0];

  if (!voice) {
    console.log(
      `No specific voice found for voiceName: ${translatedSegment.voiceName}. Using default voice.`
    );
  } else {
    console.log(`Selected voice: ${voice.name}`);
  }

  const cambLanguage = voice.provider === "camb" ? getCambBcp47(language) : undefined;
  const audio = await generateAudio({ text, voice, language: cambLanguage });
  if (!audio) return;

  const audioUint8Array = new Uint8Array(audio);
  const url = await uploadAudioArrayToStorage(audioUint8Array, "generatedAudioClips");

  const audioDuration = await getAudioDuration(audioUint8Array);
  const endTime = translatedSegment.startTime + audioDuration;

  await prisma.segment.update({
    where: { id: translatedSegment.id },
    data: { audioUrl: url, endTime: endTime },
  });
  console.log(`Generated audio for segment ${translatedSegment.id}`);
}
