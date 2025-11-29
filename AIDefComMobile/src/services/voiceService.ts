import { VOICE_AUTH_CONFIG } from "../utils/constants";

export interface VoiceResponse {
  success?: boolean;
  type?: string;
  user_id?: string;
  enrollment_count?: number;
  min_required?: number;
  is_complete?: boolean;
  completed?: boolean;
  enrollment_status?: string;
  message?: string;
  error?: string;
  score?: number;
  [key: string]: unknown;
}

interface VoiceRegistrationPayload {
  audioUri: string;
  userId: string;
  token?: string | null;
}

const buildFormData = (audioUri: string): FormData => {
  const formData = new FormData();

  // Determine file type from URI
  const isWav = audioUri.toLowerCase().endsWith('.wav');
  const fileName = isWav ? "voice-sample.wav" : "voice-sample.m4a";
  const mimeType = isWav ? "audio/wav" : "audio/m4a";

  formData.append("audio_file", {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - React Native FormData types require this shape
    uri: audioUri,
    name: fileName,
    type: mimeType,
  } as any);

  return formData;
};

const handleResponse = async (response: Response, fallbackMessage: string) => {
  const status = response.status;
  const url = response.url;

  if (!response.ok) {
    let errorMessage = fallbackMessage;
    let rawBody: unknown = null;

    try {
      const text = await response.text();
      rawBody = text;
      try {
        const json = JSON.parse(text);
        rawBody = json;
        errorMessage =
          json?.message || json?.detail || json?.error || errorMessage;
      } catch {
        if (typeof text === "string" && text.trim().length > 0) {
          errorMessage = `${fallbackMessage}: ${text}`;
        }
      }
    } catch {
      // ignore parse errors
    }

    console.error("Voice service error", {
      url,
      status,
      body: rawBody,
    });

    throw new Error(errorMessage);
  }

  try {
    const json = (await response.json()) as VoiceResponse;
    console.log("Voice service response", { url, status, body: json });
    return json;
  } catch {
    console.log("Voice service response (no JSON body)", { url, status });
    return { success: true };
  }
};

export const voiceService = {
  async registerVoiceSample({
    audioUri,
    userId,
    token,
  }: VoiceRegistrationPayload): Promise<VoiceResponse> {
    // Backend chỉ cần audio_file, không cần sampleIndex, totalSamples, prompt
    const formData = buildFormData(audioUri);

    const response = await fetch(
      `${VOICE_AUTH_CONFIG.BASE_URL}${VOICE_AUTH_CONFIG.REGISTRATION_PATH(
        userId
      )}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      }
    );

    return handleResponse(response, "Voice registration failed");
  },

  async verifyVoiceSample(
    audioUri: string,
    userId: string,
    token?: string | null
  ) {
    const formData = buildFormData(audioUri);

    const response = await fetch(
      `${VOICE_AUTH_CONFIG.BASE_URL}${VOICE_AUTH_CONFIG.AUTH_PATH(userId)}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      }
    );

    return handleResponse(response, "Voice verification failed");
  },
};

