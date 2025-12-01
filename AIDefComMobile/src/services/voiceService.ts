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

  // Read response body first
  let json: any = null;
  let rawText: string = "";

  try {
    rawText = await response.text();
    if (rawText) {
      try {
        json = JSON.parse(rawText);
      } catch {
        // Not JSON, keep as text
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Backend trả về format:
  // Success (200 hoặc 400 nếu thiếu success field): 
  //   { id, name, enrollment_status, enrollment_count, completed, message, ... }
  // Error (400/422/500): { error } hoặc { detail }
  
  // Kiểm tra lỗi - nhưng cần xử lý trường hợp backend trả về 400 nhưng không có error
  if (!response.ok) {
    // Đặc biệt xử lý status 400: có thể là success nếu không có error field
    if (status === 400 && json && !json.error) {
      // Backend có thể trả về 400 vì thiếu success field, nhưng thực ra là success
      // Kiểm tra các field chỉ có trong success response
      if (json.enrollment_count !== undefined || json.completed !== undefined || json.id) {
        console.log("⚠️ Backend returned 400 but response looks like success (missing success field)", json);
        // Coi như success, normalize response
        json.type = json.type || "enrollment";
        json.success = true;
        json.user_id = json.user_id || json.id;
        json.min_required = json.min_required || 3;
        json.is_complete = json.is_complete !== undefined ? json.is_complete : json.completed;
        console.log("✅ Normalized response as success", json);
        return json as VoiceResponse;
      }
    }

    let errorMessage = fallbackMessage;

    // Parse error từ response
    if (json) {
      // FastAPI validation error (422)
      if (status === 422 && json.detail) {
        const details = Array.isArray(json.detail) 
          ? json.detail.map((d: any) => d.msg || d.message).join(", ")
          : JSON.stringify(json.detail);
        errorMessage = `Validation error: ${details}`;
      } else {
        // Other errors
        errorMessage = json.error || json.message || json.detail || errorMessage;
      }
    } else if (rawText) {
      errorMessage = rawText;
    }

    // Cải thiện error message cho các status codes phổ biến
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

  // Success case (200) - backend trả về format:
  // { id, name, enrollment_status, enrollment_count, completed, message, ... }
  // Hoặc theo Swagger: { type, success, user_id, enrollment_count, min_required, is_complete, message }
  if (json) {
    // Normalize response để đảm bảo có đủ các field cần thiết
    if (!json.type) {
      json.type = "enrollment";
    }
    if (!("success" in json)) {
      json.success = true;
    }
    // Map id -> user_id nếu cần
    if (json.id && !json.user_id) {
      json.user_id = json.id;
    }
    // Map completed -> is_complete nếu cần
    if (json.completed !== undefined && json.is_complete === undefined) {
      json.is_complete = json.completed;
    }
    // Đảm bảo có min_required
    if (!json.min_required) {
      json.min_required = 3;
    }
    
    console.log("✅ Voice service response", { url, status, body: json });
    return json as VoiceResponse;
  }

  // No JSON body but status is OK
  console.log("Voice service response (no JSON body)", { url, status });
  return { success: true };
};

export const voiceService = {
  async registerVoiceSample({
    audioUri,
    userId,
    token,
  }: VoiceRegistrationPayload): Promise<VoiceResponse> {
    // Backend endpoint: POST /voice/users/{user_id}/enroll
    // Request: multipart/form-data với audio_file (WAV/MP3/FLAC, max 10MB)
    // Response 200: { type, success, user_id, enrollment_count, min_required, is_complete, message }
    const formData = buildFormData(audioUri);

    const url = `${VOICE_AUTH_CONFIG.BASE_URL}${VOICE_AUTH_CONFIG.REGISTRATION_PATH(
      userId
    )}`;

    // Retry logic for 5xx errors (service unavailable/cold start/bad gateway)
    let lastError: Error | null = null;
    const maxRetries = 5;
    const baseRetryDelay = 3000; // 3 seconds base delay

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

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

        // Retry for 5xx errors (502, 503, 504) - backend might be cold starting
        const isRetryableError = 
          response.status === 502 || // Bad Gateway
          response.status === 503 || // Service Unavailable
          response.status === 504;    // Gateway Timeout

        if (isRetryableError && attempt < maxRetries - 1) {
          const delay = baseRetryDelay * (attempt + 1); // Exponential backoff: 3s, 6s, 9s, 12s, 15s
          console.log(
            `⚠️ Service error (${response.status}), retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Process response (200 success hoặc 400/422/500 error)
        return handleResponse(response, "Voice registration failed");
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a timeout error
        const isTimeoutError = 
          error.name === "AbortError" ||
          error.message?.includes("timeout") ||
          error.message?.includes("aborted");

        // If connection/network error and not last attempt, retry
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

        // If not connection error or last attempt, throw immediately
        throw error;
      }
    }

    // If all retries failed
    if (lastError) {
      throw lastError;
    }

    throw new Error("Voice registration failed after retries");
  },

  /**
   * Verify voice sample against enrolled samples
   * Backend endpoint: POST /voice/users/{user_id}/verify
   * 
   * IMPORTANT: This uses the VERIFY API, NOT the enroll API
   * - Enroll API: POST /voice/users/{user_id}/enroll (used in registerVoiceSample)
   * - Verify API: POST /voice/users/{user_id}/verify (used here)
   * 
   * Request: multipart/form-data với audio_file
   * Response 200: { type: "verify", success, verified, claimed_id, match, score, message }
   * 
   * Requirements:
   * - User must have at least 3 enrolled samples
   * - Returns similarity score for verification
   */
  async verifyVoiceSample(
    audioUri: string,
    userId: string,
    token?: string | null
  ) {
    const formData = buildFormData(audioUri);

    // Use AUTH_PATH (verify endpoint), NOT REGISTRATION_PATH (enroll endpoint)
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

    // Retry logic for network issues (max 3 attempts)
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Create new AbortController for each attempt
      const controller = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        if (attempt > 0) {
          const backoffDelay = 500 * attempt; // 500ms, 1000ms, 1500ms
          console.log(`🔄 Retry attempt ${attempt + 1}/${MAX_ATTEMPTS} after ${backoffDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }

        // Set timeout for this attempt
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

        // Clear timeout on success
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Enrollment status response received in ${duration}ms (attempt ${attempt + 1}), status: ${response.status}`);

        // If AIServer returns 404 (no profile), treat as not enrolled
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

        // For successful response, parse JSON directly (faster than handleResponse)
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

        // For other errors, log and use generic handler
        console.error("❌ Enrollment status check failed:", {
          status: response.status,
          statusText: response.statusText,
        });
        return handleResponse(response, "Failed to get enrollment status");
      } catch (fetchError: any) {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        lastError = fetchError;
        
        // Check if it's an abort/timeout error
        const isAbortError =
          fetchError.name === "AbortError" ||
          fetchError.name === "DOMException" ||
          fetchError.message?.includes("aborted") ||
          fetchError.message?.includes("timeout");
        
        // Check if it's a network error
        const isNetworkError =
          fetchError.message?.includes("network") ||
          fetchError.message?.includes("fetch") ||
          fetchError.message?.includes("Failed to fetch") ||
          fetchError.message?.includes("Network request failed");
        
        if (isAbortError) {
          console.warn(`⏰ Attempt ${attempt + 1} timed out or aborted`);
          // If not last attempt, continue to retry
          if (attempt < MAX_ATTEMPTS - 1) {
            continue;
          }
          // Last attempt failed, break to return default
          break;
        }
        
        if (isNetworkError && attempt < MAX_ATTEMPTS - 1) {
          console.warn(`⚠️ Network error on attempt ${attempt + 1}, will retry...`);
          continue;
        }
        
        // If not network/abort error or last attempt, throw
        throw fetchError;
      }
    }
    
    // If all retries failed (timeout/network), return not enrolled (fail fast)
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

