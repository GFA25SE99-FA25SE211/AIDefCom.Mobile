// API Configuration
export const API_CONFIG = {
  // API production endpoint
  BASE_URL: "https://aidefcomapi.azurewebsites.net/api",
  TIMEOUT: 10000,
};

// Voice authentication service
export const VOICE_AUTH_CONFIG = {
  BASE_URL:
    "https://fastapi-service.happyforest-7c6ec975.southeastasia.azurecontainerapps.io",
  REGISTRATION_PATH: (userId: string) => `/voice/users/${userId}/enroll`,
  AUTH_PATH: (userId: string) => `/voice/users/${userId}/verify`,
  REQUIRED_SAMPLES: 3, // Registration requires 3 samples
  PROMPTS: [
    "Xin chào, tôi là {Dán tên người nói vào}. Hiện tại tôi đang thực hiện đoạn thu âm mẫu đầu tiên để cung cấp dữ liệu cho hệ thống AIDefCom nhằm phân tích và xác thực giọng nói. Tôi sẽ cố gắng duy trì tốc độ nói ổn định và phát âm rõ ràng để hạn chế sai số trong quá trình xử lý. Không gian xung quanh tôi tương đối yên tĩnh, nên hy vọng chất lượng âm thanh sẽ đủ tốt cho hệ thống học và nhận dạng đúng giọng của tôi trong những lần sử dụng tiếp theo.",
    "Đây là đoạn thu âm mẫu thứ hai để hỗ trợ AIDefCom xây dựng mô hình nhận diện giọng nói chính xác hơn. Tôi đang nói ở tốc độ tự nhiên, không quá nhanh, không quá chậm. Mục tiêu của đoạn này là tạo ra dữ liệu có tính ổn định và dễ phân tích. Trong thực tế, giọng nói có thể thay đổi tùy theo ngữ cảnh, cảm xúc hay môi trường, vì vậy bản thu này giúp hệ thống có thêm thông tin để nhận dạng tôi trong nhiều tình huống khác nhau.",
    "Đây là bản thu mẫu thứ ba dành cho quá trình huấn luyện và xác thực của AIDefCom. Tôi đang nói với giọng bình thường giống như khi trao đổi công việc hằng ngày. Nếu hệ thống nhận diện tốt, sau này những thao tác đăng nhập, phê duyệt hay xác minh danh tính của tôi sẽ trở nên nhanh chóng và thuận tiện hơn. Tôi hy vọng đoạn thu này có đủ độ dài và sự rõ ràng để hỗ trợ hệ thống cải thiện độ chính xác.",
  ],
};

// Response Codes từ API
export const RESPONSE_CODES = {
  SUCCESS: '200',
  CREATED: '201',
  BAD_REQUEST: '400',
  UNAUTHORIZED: '401',
  NOT_FOUND: '404',
  INTERNAL_ERROR: '500',
};

// Role constants
export const USER_ROLES = {
  STUDENT: 'Student',
  LECTURER: 'Lecturer',
  ADMINISTRATOR: 'Administrator',
  CHAIR: 'Chair',
  SECRETARY: 'Secretary',
  MEMBER: 'Member',
  MODERATOR: 'Moderator',
};

// Storage Keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER_ID: 'userId',
  USER_DATA: 'user',
};