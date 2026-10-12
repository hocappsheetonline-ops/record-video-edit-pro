# Lumora — Kế hoạch phát triển

Phần mềm desktop quay màn hình, tự động zoom theo chuột, chỉnh sửa video và livestream, có tích hợp AI.
Lấy cảm hứng từ **Screen Studio, FocuSee, CursorClip** (quay + chỉnh sửa) và **StreamYard** (livestream).

## 1. Yêu cầu đã chốt

| Hạng mục      | Quyết định                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Nền tảng      | **Windows trước** (máy phát triển và chạy thử chỉ có Windows). Code vẫn viết theo hướng đa nền tảng để thêm macOS sau |
| Tính năng MVP | Quay màn hình + webcam, auto-zoom theo chuột, trình chỉnh sửa video, livestream                                       |
| Livestream    | Làm giống StreamYard (đa nền tảng + mời khách), **nhưng làm sau khi xong quay và chỉnh sửa**                          |
| AI            | Phụ đề tự động (**ElevenLabs Speech-to-Text**) + AI tự biên tập (**Claude API**)                                      |
| Ngôn ngữ      | Giao diện và phụ đề **tiếng Việt + tiếng Anh**                                                                        |
| Mô hình       | Dùng cá nhân/nội bộ: người dùng tự nhập API key, chưa cần tài khoản hay thanh toán                                    |

## 2. Công nghệ

| Lớp                     | Công nghệ                                                                                                                                        | Lý do                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| App shell               | **Electron** + **TypeScript**                                                                                                                    | Có sẵn `desktopCapturer`, WebRTC, WebCodecs; sau này mở rộng sang macOS mà không phải viết lại |
| Giao diện               | **React** + **Vite** (electron-vite), **Tailwind**, **Zustand** (quản lý state)                                                                  | Phát triển nhanh, hệ sinh thái lớn                                                             |
| Hiển thị và hiệu ứng    | **PixiJS** (WebGL)                                                                                                                               | Ghép các lớp nền, video, webcam, con trỏ và zoom theo thời gian thực ở 60fps                   |
| Theo dõi chuột/phím     | **uiohook-napi**                                                                                                                                 | Hook toàn hệ thống: tọa độ chuột, click, phím, có timestamp                                    |
| Quay màn hình (Windows) | **FFmpeg `ddagrab`** (Desktop Duplication API, `draw_mouse=0`) + mã hóa phần cứng (NVENC / Intel QSV / AMD AMF), dự phòng bằng `desktopCapturer` | Quay mượt 60fps, tốn ít CPU, **ẩn được con trỏ** để vẽ lại con trỏ mượt hơn                    |
| Mã hóa/xuất video       | **WebCodecs** (dùng phần cứng) + **mp4-muxer**; **FFmpeg** (`ffmpeg-static`) để trộn âm thanh, xuất GIF, phát RTMP                               | Xuất nhanh, chất lượng cao                                                                     |
| Phụ đề                  | **ElevenLabs Scribe** (Speech-to-Text)                                                                                                           | Có timestamp từng từ, hỗ trợ tiếng Việt                                                        |
| AI biên tập             | **Claude API** (`@anthropic-ai/sdk`)                                                                                                             | Phát hiện từ thừa, đề xuất đoạn cắt, tạo tiêu đề, mô tả, chương, dịch phụ đề                   |
| Livestream khách mời    | **LiveKit** (WebRTC SFU, tự host bằng Docker hoặc LiveKit Cloud)                                                                                 | Mã nguồn mở, ổn định, có SDK cho web và Node                                                   |
| i18n                    | **i18next**                                                                                                                                      | Giao diện Việt/Anh                                                                             |
| Lưu API key             | `safeStorage` của Electron (dùng DPAPI trên Windows)                                                                                             | Key được mã hóa, không lưu dạng văn bản thường                                                 |
| Đóng gói                | **electron-builder** (bộ cài NSIS `.exe`) + **electron-updater** (phát hành qua GitHub Releases)                                                 | Tạo bộ cài và tự động cập nhật                                                                 |
| Kiểm thử                | **Vitest** (logic), **Playwright** (E2E Electron)                                                                                                |                                                                                                |

### Cấu trúc repo (monorepo pnpm)

```
apps/
  desktop/          # Ứng dụng Electron (main + preload + renderer React)
  guest-web/        # (Giai đoạn 4) Trang web cho khách tham gia livestream
packages/
  core/             # Mô hình dự án/timeline, thuật toán auto-zoom, làm mượt con trỏ (logic thuần, dễ test)
  renderer/         # (Giai đoạn 2) Bộ ghép hình PixiJS, dùng chung cho xem trước, xuất video và livestream
  ai/               # (Giai đoạn 3) Client ElevenLabs + Claude, prompt, phân tích kết quả
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

### Giai đoạn 0: Nền móng ✅ Đã xong

- Monorepo pnpm, electron-vite, React, TypeScript, Tailwind, ESLint/Prettier.
- Khung giao diện: màn hình Quay, Dự án, Chỉnh sửa, Livestream (đang để chỗ trống) và Cài đặt (hoạt động đầy đủ).
- Cài đặt: chọn ngôn ngữ Việt/Anh, giao diện Sáng/Tối/Theo hệ thống. Nhập, kiểm tra, lưu và xóa API key ElevenLabs và Claude; key được mã hóa bằng DPAPI.
- Test tự động: unit test (Vitest), test giao diện (Testing Library), test E2E mở app Electron thật (Playwright).
- CI trên GitHub Actions (`windows-latest`): chạy toàn bộ test, sau đó build bộ cài `.exe`.

### Giai đoạn 1: Quay màn hình ✅ Đã xong

- Chọn nguồn quay: toàn màn hình, một vùng (lớp phủ để kéo chọn) hoặc một cửa sổ. Hỗ trợ nhiều màn hình và DPI 125%/150%.
- FFmpeg `ddagrab` với `draw_mouse=0` (dự phòng `gdigrab`). App tự dò NVENC, AMF, QSV, cuối cùng là x264, và tự ghép đúng màn hình DXGI.
- Không dùng được FFmpeg thì chuyển sang bộ quay của Electron (con trỏ nằm sẵn trong video).
- Webcam, micro và âm thanh hệ thống (loopback của Windows), mỗi nguồn một file riêng, ghi theo từng phần mỗi giây.
- `events.jsonl`: chuột, click, cuộn và phím tắt, ghi bằng uiohook. Ký tự gõ thường không được lưu. Nếu không cài được hook thì chỉ ghi vị trí chuột.
- Thanh điều khiển nổi (đếm ngược, đồng hồ, tạm dừng, dừng, hủy) không bị quay vào video. Phím tắt Ctrl+Shift+R và Ctrl+Shift+P.
- Tạm dừng tạo đoạn (segment) mới. `project.json` được lưu sau mỗi đoạn để không mất dữ liệu nếu app bị tắt đột ngột.
- Trang Dự án: danh sách kèm ảnh thu nhỏ, trình phát đồng bộ các track (tua được), mở thư mục, xóa (chuyển vào Thùng rác).

### Giai đoạn 2: Trình chỉnh sửa và auto-zoom ✅ Đã xong

- Mô hình chỉnh sửa (`edit.json`): clip trên "thời gian nguồn" (các đoạn quay nối liền), tách/xóa/đổi tốc độ, hoàn tác/làm lại, tự lưu.
- Tự động zoom: gom click và lúc gõ phím liên tục thành cụm; khung nhìn đi theo con trỏ (được làm mượt thêm), chuyển cảnh mượt; kéo trên timeline để chỉnh.
- Con trỏ vẽ lại, làm mượt bằng lò xo giảm chấn tới hạn (tính sẵn nên tua tới đâu cũng như nhau); hiệu ứng click; tự ẩn khi chuột đứng yên.
- Khung: các tỉ lệ khung hình, nền trơn/chuyển màu, lề, bo góc, bóng đổ. Bong bóng webcam.
- Xem trước bằng thẻ video kết hợp canvas. Xuất bằng mediabunny (WebCodecs) qua cùng hàm vẽ, rồi FFmpeg trộn âm thanh theo clip; hỗ trợ MP4 và GIF.

### Giai đoạn 3: AI ✅ Đã xong

- Phụ đề: trộn âm thanh micro (hoặc âm thanh máy) theo thời gian nguồn, gửi lên ElevenLabs Scribe v2 và nhận thời gian từng từ. Câu được chia thành dòng (tối đa 42 ký tự, 4 giây, ngắt ở cuối câu hoặc khi dừng).
- Kiểu tô sáng từng từ hoặc cả dòng; sửa dòng; xuất SRT/VTT theo timeline đã cắt (bỏ các từ đã cắt); in phụ đề vào video khi xuất; dịch Việt ↔ Anh.
- Claude (`claude-opus-5-5`, structured outputs, `fallbacks: "default"`):
  - gợi ý cắt từ đệm và câu nói lặp (kết hợp phần tự tìm từ đệm và khoảng lặng), duyệt trước khi áp dụng;
  - tạo tiêu đề, mô tả, hashtag và chương.
- Chỉnh video bằng văn bản: chọn từ để cắt.
- Test E2E chạy với máy chủ giả lập ElevenLabs và Anthropic: kiểm tra request gửi đi và kết quả trên video (SRT, độ dài video, phụ đề in trong khung hình).

### Giai đoạn 4: Livestream giống StreamYard (~6–8 tuần)

- **4a. Phát đa nền tảng:** bộ ghép cảnh (màn hình, webcam, banner, logo, lớp chữ) được mã hóa bằng FFmpeg và phát RTMP **đồng thời** lên YouTube, Facebook, TikTok hoặc bất kỳ server RTMP nào. Lưu một bản ghi cục bộ.
- **4b. Studio và cảnh:** các bố cục (một người, chia đôi, lưới, chia sẻ màn hình kèm webcam), chuyển cảnh, banner chạy chữ, lower-third (thanh tên ở mép dưới).
- **4c. Mời khách:** server LiveKit; khách vào qua **link trên trình duyệt** (`apps/guest-web`), không cần cài app. Có phòng chờ (backstage), host đưa khách lên hoặc xuống sóng, tắt mic khách, khách chia sẻ màn hình.
- **4d. Bình luận:** gộp chat từ YouTube và Facebook, hiển thị bình luận lên màn hình phát.
- **4e. AI cho livestream:** phụ đề trực tiếp (ElevenLabs realtime STT), tự tạo bản tóm tắt và clip ngắn sau buổi live.

### Giai đoạn 5: Hoàn thiện và phát hành

- Ký số Windows (tùy chọn): không ký thì app vẫn chạy, chỉ hiện cảnh báo SmartScreen "Windows protected your PC" khi cài lần đầu. Bấm "More info" → "Run anyway" là cài được. Dùng cá nhân thì không cần ký.
- Tự động cập nhật, báo lỗi (Sentry, tùy chọn), tối ưu hiệu năng trên máy cấu hình yếu.

## 4. Cài đặt trên máy Windows

**Chỉ để dùng app:** tải file cài `.exe` từ GitHub Actions/Releases về và chạy. Không cần cài thêm gì.

**Để chạy code trực tiếp trên máy (chế độ phát triển):**

- Windows 10 (bản 2004 trở lên) hoặc Windows 11, 64-bit
- **Node.js 20 LTS** trở lên (https://nodejs.org) và **pnpm** (`npm install -g pnpm`)
- **Git for Windows** (https://git-scm.com)
- **Visual Studio Build Tools** (workload "Desktop development with C++") và **Python 3**, chỉ cần khi native module không có bản build sẵn
- FFmpeg được đóng gói sẵn qua `ffmpeg-static`, không cần cài riêng
- API key: **ElevenLabs** và **Anthropic (Claude)**, nhập trong mục Cài đặt của app
- (Giai đoạn 4) **Docker** nếu tự host LiveKit, hoặc dùng tài khoản LiveKit Cloud

> Lưu ý: app quay màn hình phải được **chạy và test trên máy Windows thật** của bạn. Môi trường cloud chỉ dùng để viết code, chạy unit test và build.

Cấu hình máy khuyến nghị để quay 1080p/60fps: CPU 4 nhân trở lên, RAM 8GB trở lên, card đồ họa có bộ mã hóa phần cứng (NVIDIA GTX 10xx trở lên, Intel thế hệ 7 trở lên hoặc AMD RX 400 trở lên).

## 5. Rủi ro và cách xử lý

| Rủi ro                                                                       | Cách xử lý                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ddagrab` không chạy trên một số máy (Remote Desktop, driver card đồ họa cũ) | Dự phòng bằng `gdigrab` hoặc `desktopCapturer` của Electron                                                                 |
| Lệch tọa độ chuột khi màn hình bật DPI scaling hoặc có nhiều màn hình        | Quy đổi tọa độ theo DPI của từng màn hình; viết test riêng cho phần này                                                     |
| Phần mềm diệt virus chặn hook chuột/bàn phím toàn hệ thống                   | Hướng dẫn thêm app vào danh sách ngoại lệ; app chỉ ghi sự kiện khi đang quay                                                |
| Chưa có máy Mac để test                                                      | Giữ phần riêng cho từng hệ điều hành tách biệt; thêm macOS khi có máy (hoặc build thử trên runner macOS của GitHub Actions) |
| Xuất 4K/60fps chậm trên máy yếu                                              | Ưu tiên WebCodecs dùng phần cứng; fallback sang FFmpeg; có hàng đợi xuất chạy nền                                           |
| Độ chính xác phụ đề tiếng Việt                                               | Cho chỉnh sửa transcript; dùng Claude để sửa chính tả và dấu câu                                                            |
| Livestream có khách khá phức tạp và tốn chi phí server                       | Làm sau cùng; bắt đầu với LiveKit Cloud (có gói miễn phí) rồi mới tự host                                                   |

## 6. Bước tiếp theo

Bắt đầu **Giai đoạn 4**: livestream giống StreamYard.
