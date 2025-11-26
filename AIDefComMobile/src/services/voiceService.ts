import { VOICE_AUTH_CONFIG } from "../utils/constants";

export interface VoiceResponse {
  success: boolean;
  score?: number;
  message?: string;
  [key: string]: unknown;
}

interface VoiceRegistrationPayload {
  audioUri: string;
  sampleIndex: number;
  totalSamples: number;
  prompt: string;
  userId: string;
  token?: string | null;
}

const buildFormData = (
  audioUri: string,
  extraFields?: Record<string, string | number>
): FormData => {
  const formData = new FormData();

  formData.append("audio_file", {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - React Native FormData types require this shape
    uri: audioUri,
    name: "voice-sample.m4a",
    type: "audio/m4a",
  } as any);

  if (extraFields) {
    Object.entries(extraFields).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
  }

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
    sampleIndex,
    totalSamples,
    prompt,
    userId,
    token,
  }: VoiceRegistrationPayload): Promise<VoiceResponse> {
    const formData = buildFormData(audioUri, {
      sampleIndex,
      totalSamples,
      prompt,
    });

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

