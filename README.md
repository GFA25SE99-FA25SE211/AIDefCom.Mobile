# AIDefCom Mobile

Ứng dụng di động cho hệ thống quản lý hội đồng bảo vệ luận văn, dành cho sinh viên.

## Giới thiệu

AIDefCom Mobile là ứng dụng React Native được xây dựng với Expo, cho phép sinh viên:
- Đăng nhập bằng email/password hoặc Google
- Đăng ký giọng nói (3 mẫu) để xác thực
- Xem danh sách phiên bảo vệ của mình
- Quản lý thông tin cá nhân và báo cáo

## Yêu cầu

- Node.js >= 18
- npm hoặc yarn
- Expo Go app (cho thiết bị thật) hoặc iOS Simulator / Android Emulator

## Cài đặt và chạy

```bash
# Cài đặt dependencies
npm install

# Chạy ứng dụng
npx expo start
```

Sau đó:
- Nhấn `i` để mở iOS Simulator
- Nhấn `a` để mở Android Emulator
- Quét QR code bằng Expo Go trên điện thoại

## Cấu hình

### API Backend

File `src/utils/constants.ts`:
- `API_CONFIG.BASE_URL`: URL của .NET API (mặc định: `https://aidefcomapi.azurewebsites.net/api`)
- `VOICE_AUTH_CONFIG`: URL của Voice API (FastAPI)

### Google Login (tùy chọn)

Thêm Google OAuth Client IDs vào `app.json` trong phần `extra`:
```json
{
  "extra": {
    "googleWebClientId": "...",
    "googleIosClientId": "...",
    "googleAndroidClientId": "..."
  }
}
```

## Luồng sử dụng

1. **Đăng nhập**: Mở app → Nhập email/password hoặc đăng nhập Google
2. **Đăng ký giọng nói**: Thu âm 3 mẫu theo hướng dẫn
3. **Dashboard**: Xem danh sách phiên bảo vệ sau khi đăng ký voice thành công

## Xử lý lỗi thường gặp

- **Metro cache lỗi**: Chạy `npx expo start -c`
- **Không kết nối API**: Kiểm tra `BASE_URL` trong `constants.ts`
- **Voice registration failed**: Đảm bảo `user_id` được voice service chấp nhận
