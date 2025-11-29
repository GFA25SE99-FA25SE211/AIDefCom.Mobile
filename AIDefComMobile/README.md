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
```

### Cách 1: Dùng Expo Go (Đơn giản nhất - Khuyến nghị cho test nhanh)

```bash
# Chạy với Expo Go (cùng mạng WiFi)
npm run start:expo-go

# Hoặc với tunnel mode (nếu khác mạng WiFi)
npm run start:expo-go:tunnel
```

Sau đó quét QR code bằng **Expo Go** app trên điện thoại.

**Lưu ý**: Expo Go có một số hạn chế với native modules, nhưng đủ để test hầu hết tính năng.

### Cách 2: Development Build (Đầy đủ tính năng)

```bash
# Chạy development build (cần build app trước)
npm start

# Build cho Android
npm run android

# Build cho iOS  
npm run ios
```

Sau khi build xong, mở app đã build và kết nối với Metro bundler.

### Các tùy chọn khác:

```bash
npm run start:tunnel    # Dùng tunnel mode (hoạt động từ xa)
npm run start:lan        # Dùng LAN mode (cùng mạng WiFi)
npm run start:localhost  # Chỉ localhost (cho emulator)
```

### Xử lý lỗi QR code không nhận diện được

1. **Dùng Expo Go mode**: Chạy `npm run start:expo-go` thay vì `npm start`
2. **Kiểm tra cùng mạng WiFi**: Đảm bảo máy tính và điện thoại cùng mạng WiFi
3. **Dùng Tunnel mode**: 
   ```bash
   npm run start:expo-go:tunnel
   ```
   (cần đăng nhập Expo account: `npx expo login`)
4. **Kiểm tra firewall**: Tắt firewall tạm thời hoặc cho phép Node.js qua firewall
5. **Nhập URL thủ công**: Trong Expo Go, chọn "Enter URL manually" và nhập URL hiển thị trong terminal
6. **Clear cache**: Chạy `npx expo start -c --config app.expo-go.json` để clear cache
7. **Cài Expo Go**: Đảm bảo đã cài Expo Go app từ App Store (iOS) hoặc Play Store (Android)

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
- **QR code không nhận diện**: 
  - Thử `npm run start:tunnel` (cần đăng nhập Expo)
  - Đảm bảo cùng mạng WiFi với thiết bị
  - Kiểm tra firewall/antivirus
- **Không kết nối API**: Kiểm tra `BASE_URL` trong `constants.ts`
- **Voice registration failed**: Đảm bảo `user_id` được voice service chấp nhận
- **Microphone không hoạt động**: Kiểm tra permissions trong Settings của thiết bị
