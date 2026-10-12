# Record Video Edit Pro — Kế hoạch phát triển

Phần mềm desktop quay màn hình, tự động zoom theo chuột, chỉnh sửa video và livestream, có tích hợp AI.
Lấy cảm hứng từ **Screen Studio, FocuSee, CursorClip** (quay + chỉnh sửa) và **StreamYard** (livestream).

## 1. Yêu cầu đã chốt

| Hạng mục | Quyết định |
|---|---|
| Nền tảng | Desktop **Windows + macOS** |
| Tính năng MVP | Quay màn hình + webcam, auto-zoom theo chuột, trình chỉnh sửa video, livestream |
| Livestream | Làm giống StreamYard (đa nền tảng + mời khách), **nhưng làm sau khi xong quay và chỉnh sửa** |
| AI | Phụ đề tự động (**ElevenLabs Speech-to-Text**) + AI tự biên tập (**Claude API**) |
| Ngôn ngữ | Giao diện và phụ đề **tiếng Việt + tiếng Anh** |
| Mô hình | Dùng cá nhân/nội bộ: người dùng tự nhập API key, chưa cần tài khoản hay thanh toán |

## 2. Công nghệ

| Lớp | Công nghệ | Lý do |
|---|---|---|
| App shell | **Electron** + **TypeScript** | Có sẵn `desktopCapturer`, WebRTC, WebCodecs; chạy được trên cả Windows lẫn macOS từ cùng một bộ code |
| Giao diện | **React** + **Vite** (electron-vite), **Tailwind**, **Zustand** (quản lý state) | Phát triển nhanh, hệ sinh thái lớn |
| Hiển thị và hiệu ứng | **PixiJS** (WebGL) | Ghép các lớp nền, video, webcam, con trỏ và zoom theo thời gian thực ở 60fps |
| Theo dõi chuột/phím | **uiohook-napi** | Hook toàn hệ thống: tọa độ chuột, click, phím, có timestamp |
| Mã hóa/xuất video | **WebCodecs** (dùng phần cứng) + **mp4-muxer**; **FFmpeg** (`ffmpeg-static`) để trộn âm thanh, xuất GIF, phát RTMP | Xuất nhanh, chất lượng cao |
| Phụ đề | **ElevenLabs Scribe** (Speech-to-Text) | Có timestamp từng từ, hỗ trợ tiếng Việt |
| AI biên tập | **Claude API** (`@anthropic-ai/sdk`) | Phát hiện từ thừa, đề xuất đoạn cắt, tạo tiêu đề, mô tả, chương, dịch phụ đề |
| Livestream khách mời | **LiveKit** (WebRTC SFU, tự host bằng Docker hoặc LiveKit Cloud) | Mã nguồn mở, ổn định, có SDK cho web và Node |
| i18n | **i18next** | Giao diện Việt/Anh |
| Lưu API key | `safeStorage` của Electron (Keychain trên macOS, DPAPI trên Windows) | Key được mã hóa, không lưu dạng văn bản thường |
| Đóng gói | **electron-builder** + **electron-updater** (phát hành qua GitHub Releases) | Tạo bộ cài `.exe`/`.dmg` và tự động cập nhật |
| Kiểm thử | **Vitest** (logic), **Playwright** (E2E Electron) | |

### Cấu trúc repo (monorepo pnpm)

```
apps/
  desktop/          # Ứng dụng Electron (main + preload + renderer React)
  guest-web/        # (Giai đoạn 4) Trang web cho khách tham gia livestream
packages/
  core/             # Mô hình dự án/timeline, thuật toán auto-zoom, làm mượt con trỏ (logic thuần, dễ test)
  renderer/         # Bộ ghép hình PixiJS, dùng chung cho xem trước, xuất video và livestream
  ai/               # Client ElevenLabs + Claude, prompt, phân tích kết quả
  ui/               # Component giao diện dùng chung
```

### Định dạng dự án (`*.rvproj` là một thư mục)

```
my-video.rvproj/
  project.json      # timeline, zoom, style, phụ đề, các thiết lập
  screen.webm       # quay màn hình (KHÔNG có con trỏ, để vẽ lại con trỏ mượt hơn)
  camera.webm       # webcam (track riêng)
  mic.webm          # micro (track riêng)
  system-audio.webm # âm thanh hệ thống (nếu có)
  events.jsonl      # sự kiện chuột/phím kèm timestamp
  transcript.json   # kết quả STT (từng từ + thời gian)
```

Mỗi nguồn được ghi thành **file riêng**. Nhờ vậy lúc chỉnh sửa có thể đổi vị trí webcam, zoom và kiểu con trỏ mà không phải quay lại.

## 3. Lộ trình

### Giai đoạn 0: Nền móng (~1 tuần)
- Dựng monorepo pnpm, electron-vite, React, TypeScript, ESLint/Prettier, Vitest.
- Khung giao diện: màn hình Quay, Trình chỉnh sửa, Thư viện dự án, Cài đặt (nhập API key ElevenLabs và Claude).
- i18n Việt/Anh.
- CI trên GitHub Actions: lint, test, build thử cho Windows và macOS.

### Giai đoạn 1: Quay màn hình (~2–3 tuần)
- Chọn nguồn quay: toàn màn hình, một cửa sổ hoặc một vùng tùy chọn.
- Webcam và micro (chọn thiết bị, xem trước), âm thanh hệ thống (Windows: loopback; macOS 13+: ScreenCaptureKit).
- Ẩn con trỏ hệ thống trong bản quay. Ghi tọa độ chuột, click và phím ra `events.jsonl`.
- Thanh điều khiển nổi (Bắt đầu, Tạm dừng, Dừng), đếm ngược, phím tắt toàn cục.
- Xin quyền trên macOS: Screen Recording, Accessibility, Camera, Microphone (có màn hình hướng dẫn).
- **Kết quả:** quay được, mở lại dự án và phát lại đồng bộ tất cả các track.

### Giai đoạn 2: Trình chỉnh sửa và auto-zoom (~4–6 tuần), phần cốt lõi giống Screen Studio
- **Auto-zoom:** gom các cụm click/gõ phím theo thời gian, tự tạo đoạn zoom với chuyển động mượt và thời lượng tối thiểu. Người dùng chỉnh được từng đoạn zoom trên timeline (mức zoom, tâm, thời gian).
- **Con trỏ:** làm mượt quỹ đạo bằng mô phỏng lò xo, phóng to con trỏ, hiệu ứng click (gợn sóng hoặc highlight), tự ẩn khi đứng yên.
- **Khung hình:** nền (màu, gradient, ảnh, làm mờ), padding, bo góc, đổ bóng, đổi tỉ lệ 16:9, 9:16, 1:1 và 4:3.
- **Webcam:** bong bóng tròn hoặc vuông, kéo thả vị trí, đổi bố cục theo từng đoạn.
- **Timeline:** cắt, tách, xóa đoạn, đổi tốc độ, các track zoom/phụ đề/âm thanh, hoàn tác/làm lại.
- **Xuất video:** MP4 (H.264/HEVC) với độ phân giải đến 4K, 30/60fps; GIF; preset cho YouTube và TikTok.

### Giai đoạn 3: AI (~2–3 tuần)
- **Phụ đề tự động:** gửi audio lên ElevenLabs STT, nhận lại từng từ kèm thời gian, tự chia câu. Có các kiểu hiển thị (từng từ nổi bật kiểu TikTok, hoặc dạng câu), chỉnh sửa nội dung phụ đề, xuất SRT/VTT hoặc in thẳng vào video.
- **AI tự biên tập (Claude):**
  - Phát hiện từ thừa ("ừm", "à", "uh", "um"), câu nói lặp và khoảng lặng dài, rồi **đề xuất đoạn cắt** để người dùng duyệt trước khi áp dụng.
  - Chỉnh video bằng cách sửa văn bản: xóa chữ trong transcript thì đoạn video tương ứng bị cắt.
  - Tạo tiêu đề, mô tả, hashtag và chương (YouTube chapters).
  - Dịch phụ đề Việt ↔ Anh.
- Hiển thị ước tính chi phí API trước mỗi lần chạy.

### Giai đoạn 4: Livestream giống StreamYard (~6–8 tuần)
- **4a. Phát đa nền tảng:** bộ ghép cảnh (màn hình, webcam, banner, logo, lớp chữ) được mã hóa bằng FFmpeg và phát RTMP **đồng thời** lên YouTube, Facebook, TikTok hoặc bất kỳ server RTMP nào. Lưu một bản ghi cục bộ.
- **4b. Studio và cảnh:** các bố cục (một người, chia đôi, lưới, chia sẻ màn hình kèm webcam), chuyển cảnh, banner chạy chữ, lower-third (thanh tên ở mép dưới).
- **4c. Mời khách:** server LiveKit; khách vào qua **link trên trình duyệt** (`apps/guest-web`), không cần cài app. Có phòng chờ (backstage), host đưa khách lên hoặc xuống sóng, tắt mic khách, khách chia sẻ màn hình.
- **4d. Bình luận:** gộp chat từ YouTube và Facebook, hiển thị bình luận lên màn hình phát.
- **4e. AI cho livestream:** phụ đề trực tiếp (ElevenLabs realtime STT), tự tạo bản tóm tắt và clip ngắn sau buổi live.

### Giai đoạn 5: Hoàn thiện và phát hành
- Ký số (code signing): macOS cần Apple Developer ID và notarization; Windows có thể dùng chứng chỉ code signing.
- Tự động cập nhật, báo lỗi (Sentry, tùy chọn), tối ưu hiệu năng trên máy cấu hình yếu.

## 4. Cài đặt môi trường phát triển

Trên máy phát triển cần có:
- **Node.js 20+** và **pnpm 9+**
- **Git**
- macOS: **Xcode Command Line Tools** (để build native module `uiohook-napi`)
- Windows: **Visual Studio Build Tools** (workload "Desktop development with C++") và **Python 3**
- FFmpeg được đóng gói sẵn qua `ffmpeg-static`, không cần cài riêng
- API key: **ElevenLabs** và **Anthropic (Claude)**, nhập trong mục Cài đặt của app
- (Giai đoạn 4) **Docker** nếu tự host LiveKit, hoặc dùng tài khoản LiveKit Cloud

> Lưu ý: app quay màn hình phải được **chạy và test trên máy thật** (Windows/Mac). Môi trường cloud chỉ dùng để viết code, chạy unit test và build.

## 5. Rủi ro và cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Không ẩn được con trỏ khi quay trên một số bản Windows | Dùng Windows Graphics Capture API qua native addon, hoặc làm mờ/che con trỏ gốc khi ghép hình |
| Âm thanh hệ thống trên macOS cần quyền và API riêng | Dùng ScreenCaptureKit (macOS 13+). Bản macOS cũ hơn thì chỉ quay micro |
| Xuất 4K/60fps chậm trên máy yếu | Ưu tiên WebCodecs dùng phần cứng; fallback sang FFmpeg; có hàng đợi xuất chạy nền |
| Độ chính xác phụ đề tiếng Việt | Cho chỉnh sửa transcript; dùng Claude để sửa chính tả và dấu câu |
| Livestream có khách khá phức tạp và tốn chi phí server | Làm sau cùng; bắt đầu với LiveKit Cloud (có gói miễn phí) rồi mới tự host |

## 6. Bước tiếp theo

Bắt đầu **Giai đoạn 0**: dựng khung monorepo và app Electron chạy được, có màn hình Cài đặt để nhập API key.
