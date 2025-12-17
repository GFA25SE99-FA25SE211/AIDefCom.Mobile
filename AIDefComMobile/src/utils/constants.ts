// API Configuration
export const API_CONFIG = {
  // API production endpoint
  BASE_URL: "https://aidefcomapi.azurewebsites.net/api",
  TIMEOUT: 10000,
};

// Voice authentication service
export const VOICE_AUTH_CONFIG = {
  BASE_URL:
    "https://ai-service.thankfultree-4b6bfec6.southeastasia.azurecontainerapps.io",
  REGISTRATION_PATH: (userId: string) => `/voice/users/${userId}/enroll`,
  AUTH_PATH: (userId: string) => `/voice/users/${userId}/verify`,
  REQUIRED_SAMPLES: 3, // Registration requires 3 samples
  PROMPTS: [
    "Hello, I am {Speaker Name}. This is a sample recording to support the AIDefCom system, an AI platform designed to digitize and optimize the entire scoring process and defense session record-keeping. The system uses my voice to improve interaction capabilities and assist the committee in future defense sessions.",
    "I am recording this sample for AIDefCom to build my voice recognition profile. During this time, I will speak at a steady pace and pronounce clearly so the system can collect high-quality data. These recordings help the AI recognize more accurately when I ask questions, take notes, or perform other operations during defense sessions.",
    "This is a sample recording for AIDefCom according to security and privacy requirements. I confirm that my voice is used for academic purposes and will be stored, encrypted, and processed according to GDPR-like data protection policies. I agree to provide data to make the system more convenient and secure for recognition.",
  ],
};

// Response Codes từ API
export const RESPONSE_CODES = {
  SUCCESS: "200",
  CREATED: "201",
  BAD_REQUEST: "400",
  UNAUTHORIZED: "401",
  NOT_FOUND: "404",
  INTERNAL_ERROR: "500",
};

// Role constants
export const USER_ROLES = {
  STUDENT: "Student",
  LECTURER: "Lecturer",
  ADMINISTRATOR: "Administrator",
  CHAIR: "Chair",
  SECRETARY: "Secretary",
  MEMBER: "Member",
  MODERATOR: "Moderator",
};

// Storage Keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
  USER_ID: "userId",
  USER_DATA: "user",
};
