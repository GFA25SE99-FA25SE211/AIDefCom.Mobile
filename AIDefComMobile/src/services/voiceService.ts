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

  const isWav = audioUri.toLowerCase().endsWith('.wav');
  const fileName = isWav ? "voice-sample.wav" : "voice-sample.m4a";
  const mimeType = isWav ? "audio/wav" : "audio/m4a";

  formData.append("audio_file", {
    uri: audioUri,
    name: fileName,
    type: mimeType,
  } as any);

  return formData;
};

const handleResponse = async (response: Response, fallbackMessage: string) => {
  const status = response.status;
  const url = response.url;

  let json: any = null;
  let rawText: string = "";

  try {
    rawText = await response.text();
    if (rawText) {
      try {
        json = JSON.parse(rawText);
      } catch {
      }
    }
  } catch {
  }

  
  if (!response.ok) {
    if (status === 400 && json) {
      if (!json.error) {
      if (json.enrollment_count !== undefined || json.completed !== undefined || json.id) {
        console.log("⚠️ Backend returned 400 but response looks like success (missing success field)", json);
        json.type = json.type || "enrollment";
        json.success = true;
        json.user_id = json.user_id || json.id;
        json.min_required = json.min_required || 3;
        json.is_complete = json.is_complete !== undefined ? json.is_complete : json.completed;
        console.log("✅ Normalized response as success", json);
        return json as VoiceResponse;
        }
      }
      
      const errorMsg = json.error || json.message || "";
      if (
        errorMsg.includes("Maximum enrollment limit") ||
        errorMsg.includes("Already have 3 samples") ||
        (json.enrollment_count >= 3 && json.completed === true)
      ) {
        console.log("✅ User already has 3 samples - treating as success", json);
        return {
          type: "enrollment",
          success: true,
          user_id: json.user_id || json.id,
          enrollment_count: json.enrollment_count || 3,
          min_required: json.min_required || 3,
          is_complete: true,
          completed: true,
          message: json.message || "Already have 3 voice samples",
        } as VoiceResponse;
      }
    }

    let errorMessage = fallbackMessage;

    if (json) {
      if (status === 422 && json.detail) {
        const details = Array.isArray(json.detail) 
          ? json.detail.map((d: any) => d.msg || d.message).join(", ")
          : JSON.stringify(json.detail);
        errorMessage = `Validation error: ${details}`;
      } else {
        errorMessage = json.error || json.message || json.detail || errorMessage;
      }
    } else if (rawText) {
      errorMessage = rawText;
    }

    if (status === 502) {
      errorMessage = "Backend service không khả dụng (Bad Gateway). Vui lòng thử lại sau.";
    } else if (status === 503) {
      errorMessage = "Backend service đang tạm thời không khả dụng. Vui lòng thử lại sau.";
    } else if (status === 504) {
      errorMessage = "Backend service timeout. Vui lòng thử lại sau.";
    }

    console.error("Voice service error", {
      url,
      status,
      body: json || rawText,
      errorMessage,
    });

    throw new Error(errorMessage);
  }

  if (json) {
    if (!json.type) {
      json.type = "enrollment";
    }
    if (!("success" in json)) {
      json.success = true;
    }
    if (json.id && !json.user_id) {
      json.user_id = json.id;
    }
    if (json.completed !== undefined && json.is_complete === undefined) {
      json.is_complete = json.completed;
    }
    if (!json.min_required) {
      json.min_required = 3;
    }
    
    console.log("✅ Voice service response", { url, status, body: json });
    return json as VoiceResponse;
  }

  console.log("Voice service response (no JSON body)", { url, status });
  return { success: true };
};

export const voiceService = {
  async registerVoiceSample({
    audioUri,
    userId,
    token,
  }: VoiceRegistrationPayload): Promise<VoiceResponse> {
    const formData = buildFormData(audioUri);

    const url = `${VOICE_AUTH_CONFIG.BASE_URL}${VOICE_AUTH_CONFIG.REGISTRATION_PATH(
      userId
    )}`;

    let lastError: Error | null = null;
    const maxRetries = 5;
    const baseRetryDelay = 3000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const isRetryableError = 
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;

        if (isRetryableError && attempt < maxRetries - 1) {
          const delay = baseRetryDelay * (attempt + 1);
          console.log(
            `⚠️ Service error (${response.status}), retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        return handleResponse(response, "Voice registration failed");
      } catch (error: any) {
        lastError = error;
        
        const isTimeoutError = 
          error.name === "AbortError" ||
          error.message?.includes("timeout") ||
          error.message?.includes("aborted");

        const isConnectionError =
          error.message?.includes("Connection refused") ||
          error.message?.includes("network") ||
          error.message?.includes("fetch") ||
          error.message?.includes("upstream connect error") ||
          error.message?.includes("Failed to fetch") ||
          error.message?.includes("Network request failed") ||
          isTimeoutError;

        if (isConnectionError && attempt < maxRetries - 1) {
          const delay = baseRetryDelay * (attempt + 1);
          const errorType = isTimeoutError ? "Timeout" : "Connection";
          console.log(
            `⚠️ ${errorType} error, retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("Voice registration failed after retries");
  },

  async verifyVoiceSample(
    audioUri: string,
    userId: string,
    token?: string | null
  ) {
    const formData = buildFormData(audioUri);

    const verifyUrl = `${VOICE_AUTH_CONFIG.BASE_URL}${VOICE_AUTH_CONFIG.AUTH_PATH(userId)}`;
    
    console.log("🔐 Verifying voice sample using VERIFY API:", verifyUrl);

    const response = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
    });

    return handleResponse(response, "Voice verification failed");
  },

  async getEnrollmentStatus(
    userId: string,
    token?: string | null
  ): Promise<VoiceResponse> {
    const url = `${VOICE_AUTH_CONFIG.BASE_URL}/voice/users/${userId}/enrollment-status`;

    console.log("🔍 Checking enrollment status for user:", userId);
    console.log("📡 API URL:", url);

    const startTime = Date.now();
    const TIMEOUT_MS = 10000; // 10 seconds per attempt (reduced for faster fail)
    const MAX_ATTEMPTS = 3;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        if (attempt > 0) {
          const backoffDelay = 500 * attempt;
          console.log(`🔄 Retry attempt ${attempt + 1}/${MAX_ATTEMPTS} after ${backoffDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }

        timeoutId = setTimeout(() => {
          console.warn(`⏰ Attempt ${attempt + 1} timeout after ${TIMEOUT_MS}ms`);
          controller.abort();
        }, TIMEOUT_MS);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Enrollment status response received in ${duration}ms (attempt ${attempt + 1}), status: ${response.status}`);

        if (!response.ok && response.status === 404) {
          console.log("ℹ️ User not found (404) - treating as not enrolled");
          return {
            user_id: userId,
            enrollment_status: "not_enrolled",
            enrollment_count: 0,
            min_required: 3,
            is_complete: false,
            success: true,
            message: "User not enrolled",
          };
        }

        if (response.ok) {
          const json = await response.json();
          console.log("📊 Enrollment status:", {
            enrollment_count: json.enrollment_count,
            enrollment_status: json.enrollment_status,
            is_complete: json.is_complete,
          });
          return {
            ...json,
            success: true,
          } as VoiceResponse;
        }

        console.error("❌ Enrollment status check failed:", {
          status: response.status,
          statusText: response.statusText,
        });
        return handleResponse(response, "Failed to get enrollment status");
      } catch (fetchError: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        lastError = fetchError;
        
        const isAbortError =
          fetchError.name === "AbortError" ||
          fetchError.name === "DOMException" ||
          fetchError.message?.includes("aborted") ||
          fetchError.message?.includes("timeout");
        
        const isNetworkError =
          fetchError.message?.includes("network") ||
          fetchError.message?.includes("fetch") ||
          fetchError.message?.includes("Failed to fetch") ||
          fetchError.message?.includes("Network request failed");
        
        if (isAbortError) {
          console.warn(`⏰ Attempt ${attempt + 1} timed out or aborted`);
          if (attempt < MAX_ATTEMPTS - 1) {
            continue;
          }
          break;
        }
        
        if (isNetworkError && attempt < MAX_ATTEMPTS - 1) {
          console.warn(`⚠️ Network error on attempt ${attempt + 1}, will retry...`);
          continue;
        }
        
        throw fetchError;
      }
    }
    
    const totalDuration = Date.now() - startTime;
    console.warn(`⚠️ All ${MAX_ATTEMPTS} attempts failed after ${totalDuration}ms - defaulting to not enrolled`);
    console.error("❌ Last error:", {
      name: lastError?.name,
      message: lastError?.message,
    });
    
    return {
      user_id: userId,
      enrollment_status: "not_enrolled",
      enrollment_count: 0,
      min_required: 3,
      is_complete: false,
      success: true,
      message: "Network/timeout error - assuming not enrolled",
    };
  },
};

