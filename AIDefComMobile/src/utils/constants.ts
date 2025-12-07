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
    "Xin chào, tôi là {Tên người nói}. Đây là đoạn thu mẫu để hỗ trợ hệ thống AIDefCom, một nền tảng AI được thiết kế giúp số hóa và tối ưu hóa toàn bộ quy trình chấm điểm và ghi biên bản bảo vệ khóa luận. Hệ thống sử dụng giọng nói của tôi để cải thiện khả năng tương tác và hỗ trợ hội đồng trong các phiên bảo vệ sau này.",
    "Tôi đang thu âm đoạn mẫu để AIDefCom xây dựng hồ sơ nhận diện giọng nói của tôi. Trong khoảng thời gian này, tôi sẽ nói với tốc độ ổn định và phát âm rõ ràng để hệ thống thu thập dữ liệu chất lượng cao. Các bản thu giúp AI nhận dạng chính xác hơn khi tôi đặt câu hỏi, ghi chú hoặc thực hiện các thao tác khác trong buổi bảo vệ.",
    "Đây là bản thu mẫu cho AIDefCom theo đúng yêu cầu về bảo mật và quyền riêng tư. Tôi xác nhận rằng giọng nói của tôi được sử dụng phục vụ cho mục đích học thuật và sẽ được lưu trữ, mã hóa và xử lý theo các chính sách bảo vệ dữ liệu tương tự chuẩn GDPR. Tôi đồng ý cung cấp dữ liệu để hệ thống nhận diện thuận tiện và an toàn hơn.",
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
