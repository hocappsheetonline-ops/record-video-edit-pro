# Lumora

Phần mềm desktop cho Windows để quay màn hình, tự động zoom theo chuột, chỉnh sửa video và livestream, có tích hợp AI (phụ đề bằng ElevenLabs, tự biên tập bằng Claude).
Lấy cảm hứng từ Screen Studio, FocuSee, CursorClip và StreamYard.

Kế hoạch đầy đủ nằm trong [PLAN.md](PLAN.md).

## Tình trạng

| Giai đoạn | Nội dung                                                              | Trạng thái   |
| --------- | --------------------------------------------------------------------- | ------------ |
| 0         | Khung app, Cài đặt (API key, ngôn ngữ, giao diện), CI tự build `.exe` | ✅ Xong      |
| 1         | Quay màn hình, webcam, micro                                          | ⏳ Tiếp theo |
| 2         | Trình chỉnh sửa, auto-zoom                                            |              |
| 3         | AI: phụ đề, tự biên tập                                               |              |
| 4         | Livestream                                                            |              |

## Tải bản cài về chạy thử (không cần cài gì thêm)

1. Vào tab **Actions** của repo trên GitHub và chọn lần chạy **CI** mới nhất có dấu ✅.
2. Kéo xuống mục **Artifacts** và tải **Lumora-Setup-windows** về.
3. Giải nén rồi chạy `Lumora-Setup-x.y.z.exe`.
4. Nếu Windows hiện "Windows protected your PC", bấm **More info** rồi **Run anyway**. Cảnh báo này xuất hiện vì app chưa được ký số.

## Quay video

1. Mở tab **Quay** và chọn **Toàn màn hình**, **Một vùng** hoặc **Cửa sổ**.
2. Chọn webcam, micro, bật **Thu âm thanh máy tính** nếu cần, rồi bấm **Bắt đầu quay**.
3. Cửa sổ Lumora thu nhỏ lại, chỉ còn một thanh điều khiển nhỏ ở đầu màn hình. Thanh này không bị quay vào video.
4. Phím tắt: **Ctrl+Shift+R** để dừng và lưu, **Ctrl+Shift+P** để tạm dừng hoặc quay tiếp.
5. Quay xong, dự án tự mở ra để xem lại. Các dự án được lưu trong `Videos\Lumora`; bạn đổi được thư mục này trong `settings.json`.

Cách app quay:

- **Toàn màn hình và một vùng**: dùng FFmpeg (`ddagrab`, dự phòng `gdigrab`). App tự dò bộ mã hóa phần cứng theo thứ tự NVENC, AMF, QSV, cuối cùng là x264 chạy bằng CPU. **Con trỏ chuột không bị quay vào video**, để đến Giai đoạn 2 vẽ lại con trỏ mượt hơn.
- **Cửa sổ**: dùng bộ quay của Electron. Cách này không ẩn được con trỏ.
- **Chuột và bàn phím** được ghi vào `events.jsonl` để làm tự động zoom. App **không lưu ký tự bạn gõ**, chỉ ghi lại là có gõ phím và các phím tắt như Ctrl+C.
- Mỗi lần tạm dừng tạo ra một **đoạn** (segment) mới. Mỗi nguồn (màn hình, webcam, micro, âm thanh máy) là một file riêng.

## Chỉnh sửa và xuất video

Mở một dự án và bấm **Chỉnh sửa**:

- **Tự động zoom**: lần đầu mở, app gom các click chuột và đoạn gõ phím liên tục để tự tạo đoạn zoom. Khung nhìn đi theo con trỏ và chuyển vào/ra mượt. Trên timeline, kéo đoạn zoom để di chuyển, kéo mép để đổi độ dài. Mức zoom và kiểu zoom (theo con trỏ hoặc cố định) chỉnh trong tab **Zoom**.
- **Con trỏ** được vẽ lại từ dữ liệu chuột, làm mượt bằng mô phỏng lò xo. Có thể phóng to con trỏ, bật hiệu ứng khi click, và tự ẩn khi chuột đứng yên.
- **Khung**: chọn tỉ lệ 16:9, 9:16, 1:1, 4:3 hoặc giữ tỉ lệ gốc; nền trơn hoặc chuyển màu; lề, bo góc, bóng đổ.
- **Webcam**: bong bóng tròn, bo góc hoặc vuông, chỉnh kích thước và góc đặt.
- **Timeline**: tách (phím S), xóa (Delete), đổi tốc độ từng đoạn, hoàn tác/làm lại (Ctrl+Z / Ctrl+Y). Bản chỉnh sửa được tự lưu vào `edit.json`.
- **Xuất**: MP4 (H.264 + AAC) hoặc GIF; 720p, 1080p, 1440p hoặc 4K; 30 hoặc 60 fps. File được lưu trong thư mục `exports` của dự án.

Phần xem trước và phần xuất dùng chung một hàm vẽ, nên video xuất ra giống hệt những gì bạn thấy khi chỉnh. Khi xuất, mediabunny/WebCodecs giải mã chính xác từng khung hình và mã hóa bằng card đồ họa nếu có. Sau đó FFmpeg cắt, đổi tốc độ và trộn âm thanh micro/máy theo đúng các đoạn đã cắt.

## Chạy từ mã nguồn

Cần cài: [Node.js 22 LTS](https://nodejs.org), [Git](https://git-scm.com) và pnpm (`npm install -g pnpm`).

```bash
pnpm install       # cài thư viện
pnpm dev           # mở app ở chế độ phát triển (tự tải lại khi sửa code)
pnpm package:win   # tạo bộ cài .exe trong apps/desktop/release/
```

## Kiểm thử tự động

```bash
pnpm check         # format + lint + typecheck + unit test + test giao diện
pnpm test:e2e      # build rồi mở app Electron thật và bấm thử bằng Playwright
```

Mỗi lần push, GitHub Actions chạy toàn bộ test trên Windows rồi mới build file `.exe`.

| Loại test                                             | Công cụ                  | Vị trí                                    |
| ----------------------------------------------------- | ------------------------ | ----------------------------------------- |
| Logic thuần (settings, API key)                       | Vitest                   | `packages/core/src/*.test.ts`             |
| Main process (lưu trữ, mã hóa key, IPC, kiểm tra key) | Vitest                   | `apps/desktop/src/main/*.test.ts`         |
| Giao diện React                                       | Vitest + Testing Library | `apps/desktop/src/renderer/**/*.test.tsx` |
| End-to-end (app Electron thật)                        | Playwright               | `apps/desktop/e2e/`                       |

## Cấu trúc

```
apps/desktop/          Ứng dụng Electron
  src/main/            Main process: cửa sổ, lưu settings, lưu API key đã mã hóa, IPC
  src/preload/         Cầu nối an toàn giữa main process và giao diện (window.lumora)
  src/renderer/        Giao diện React + Tailwind
  src/shared/          Kiểu dữ liệu dùng chung (kênh IPC)
  e2e/                 Test E2E bằng Playwright
  src/main/ffmpeg/     Dò phần cứng, tạo lệnh FFmpeg, chạy và dừng FFmpeg
  src/main/recording/  Phiên quay, bộ điều phối, ghi chuột/bàn phím, lập kế hoạch quay
  src/main/projects/   Đọc danh sách dự án, giao thức lumora-media:// (hỗ trợ tua video)
packages/core/         Logic thuần, không phụ thuộc Electron, dễ test
```

## Bảo mật API key

- Key được mã hóa bằng `safeStorage` của Electron (dùng DPAPI trên Windows) và lưu trong `%APPDATA%\Lumora\secrets.json`.
- Giao diện không bao giờ nhận lại key gốc, chỉ thấy dạng rút gọn như `sk-a••••••••1234`.
- Nút "Kiểm tra" gọi API thật nhưng không tốn credit: ElevenLabs gọi `GET /v1/user`, Claude gọi danh sách model.
