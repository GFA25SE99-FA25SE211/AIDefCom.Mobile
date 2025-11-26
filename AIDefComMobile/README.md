# AIDefCom Mobile (Student App)

Mobile app for AIDefCom built with **Expo** and **React Native**.  
Main features:
- Student login (email + password, optional Google login)
- Voice registration (3 sample recordings) and voice authentication
- Dashboard with defense sessions fetched from the .NET backend

## 1. Requirements

- Node.js LTS (>= 18)
- Yarn or npm
- Expo CLI (`npx expo` is enough)
- iOS Simulator / Android Emulator / physical device with Expo Go

Backend services:
- .NET API: `https://aidefcomapi.azurewebsites.net/api`
- Voice API (FastAPI): `https://fastapi-service.happyforest-7c6ec975.southeastasia.azurecontainerapps.io`

## 2. Install & Run

From the `AIDefCom.Mobile/AIDefComMobile` folder:

```bash
# install deps
npm install

# run expo
npx expo start
```

Then:
- Press `i` to open iOS simulator, or  
- Press `a` for Android, or  
- Scan the QR code with **Expo Go** on your phone.

## 3. Login Flow

1. App always opens at the **Login** screen.  
2. After successful login:
   - Access token and user info are stored in `AsyncStorage`.
   - User is redirected to **Voice Registration** screen.
3. Voice Registration:
   - Student records **3 samples**.
   - Each sample is uploaded (after all 3 are recorded) to  
     `POST /voice/users/{user_id}/enroll` with field `audio_file`.
4. On successful registration the app navigates to the **Dashboard** which shows defense sessions from `/api/defense-sessions`.

## 4. Important Config Files

- `src/utils/constants.ts`
  - `API_CONFIG.BASE_URL` – .NET API base URL.
  - `VOICE_AUTH_CONFIG` – voice API base URL and paths.
- `src/config/google.ts`
  - Place Google OAuth client IDs via Expo `app.json` `extra` section if you want Google login.

## 5. Voice Service Notes

- The mobile app sends:
  - `POST /voice/users/{user_id}/enroll` with `multipart/form-data`:
    - `audio_file`: recorded `.m4a` file
    - `sampleIndex`, `totalSamples`, `prompt`
  - `POST /voice/users/{user_id}/verify` with `audio_file` only.
- `user_id` comes from JWT decoded in `authService.login` and must be recognized by the voice backend.

## 6. Scripts

From `package.json` (run with `npm run <script>`):

- `start` – `expo start`
- `android` – `expo start --android`
- `ios` – `expo start --ios`
- `web` – `expo start --web`

## 7. Troubleshooting

- **Login 500 / "Invalid email or password"** – check credentials and backend API logs.
- **Voice registration failed (User not found)** – make sure the `user_id` sent to voice API exists / is accepted by the FastAPI service.
- **Metro cache issues** – run `npx expo start -c`.

# AIDefCom Mobile App

Ứng dụng di động cho hệ thống quản lý hội đồng bảo vệ luận văn AI Defense Committee Management System.

## Tính năng chính

- Đăng nhập cho sinh viên
- Dashboard hiển thị thông tin cá nhân
- Xem thông tin phiên bảo vệ
- Quản lý báo cáo và điểm số
- Nhận thông báo

## Cấu trúc dự án

```
src/
├── components/         # Các component tái sử dụng
├── context/           # React Context (AuthContext)
├── navigation/        # Navigation setup
├── screens/          # Các màn hình chính
├── services/         # API services
├── types/            # TypeScript type definitions
└── utils/            # Utilities, constants, styles
```

## Cài đặt và chạy

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình API URL

Mở file `src/utils/constants.ts` và cập nhật `BASE_URL`:

```typescript
export const API_CONFIG = {
  BASE_URL: "http://192.168.1.100:5000/api", // Thay bằng IP của máy chạy API
  TIMEOUT: 10000,
};
```

**Lưu ý:**

- Nếu chạy API trên localhost, cần sử dụng IP thật của máy thay vì `localhost`
- Có thể tìm IP bằng lệnh `ipconfig` (Windows) hoặc `ifconfig` (Mac/Linux)

### 3. Chạy ứng dụng

#### Chạy trên iOS Simulator:

```bash
npm run ios
```

#### Chạy trên Android Emulator:

```bash
npm run android
```

#### Chạy trên Web:

```bash
npm run web
```

#### Sử dụng Expo Go:

```bash
npx expo start
```

Sau đó quét QR code bằng app Expo Go trên điện thoại.

## API Endpoints sử dụng

### Authentication

- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/logout` - Đăng xuất
- `POST /api/auth/refresh-token` - Làm mới token

## Chức năng đã triển khai

### ✅ Hoàn thành

- [x] Cấu trúc dự án cơ bản
- [x] Setup navigation với React Navigation
- [x] AuthContext để quản lý trạng thái đăng nhập
- [x] Màn hình đăng nhập với validation
- [x] Màn hình Dashboard cho sinh viên
- [x] API service với axios và interceptors
- [x] Token refresh tự động
- [x] Toast messages cho thông báo
- [x] TypeScript configuration
- [x] UI components với Material Icons

### 🚧 Đang phát triển

- [ ] Xem thông tin phiên bảo vệ
- [ ] Upload và quản lý báo cáo
- [ ] Xem điểm số
- [ ] Push notifications
- [ ] Offline support

## Cấu trúc API Response

Ứng dụng expect API response theo format:

```typescript
interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
}
```

## Troubleshooting

### 1. Metro bundler không khởi động được

```bash
npx expo start --clear
```

### 2. Lỗi TypeScript

```bash
npx tsc --noEmit
```

### 3. Không kết nối được API

- Kiểm tra IP address trong `src/utils/constants.ts`
- Đảm bảo API server đang chạy
- Kiểm tra firewall settings

### 4. Lỗi về dependencies

```bash
rm -rf node_modules package-lock.json
npm install
```

## Môi trường phát triển

- **Node.js**: >= 16.0.0
- **Expo CLI**: Latest
- **React Native**: Latest (via Expo)
- **TypeScript**: ^5.0.0

## Liên hệ

Nếu có vấn đề hoặc câu hỏi, vui lòng tạo issue hoặc liên hệ team phát triển.
