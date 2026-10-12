# Lumora

Phần mềm desktop cho Windows để quay màn hình, tự động zoom theo chuột, chỉnh sửa video và livestream, có tích hợp AI (phụ đề bằng ElevenLabs, tự biên tập bằng Claude).
Lấy cảm hứng từ Screen Studio, FocuSee, CursorClip và StreamYard.

Kế hoạch đầy đủ nằm trong [PLAN.md](PLAN.md).

## Tình trạng

| Giai đoạn | Nội dung                                                              | Trạng thái |
| --------- | --------------------------------------------------------------------- | ---------- |
| 0         | Khung app, Cài đặt (API key, ngôn ngữ, giao diện), CI tự build `.exe` | ✅ Xong    |
| 1         | Quay màn hình, webcam, micro                                          | ✅ Xong    |
| 2         | Trình chỉnh sửa, auto-zoom                                            | ✅ Xong    |
| 3         | AI: phụ đề, tự biên tập                                               | ✅ Xong    |
| 4         | Livestream (đa nền tảng, khách mời, bình luận, phụ đề trực tiếp)      | ✅ Xong    |
| 5         | Hoàn thiện: icon, tự cập nhật, nhật ký lỗi                            | ✅ Xong    |

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
- **Video dọc 9:16 (TikTok, Shorts, Reels)**: bấm **Dọc 9:16 tự động** ở tab **Khung**. Video màn hình phủ kín khung dọc, phần thừa được cắt và khung nhìn tự đi theo con trỏ (giống Screen Studio), các đoạn zoom vẫn giữ nguyên. Webcam nằm trong khung (bong bóng) hoặc thành một dải riêng ở trên/dưới (tab **Webcam** → **Bố cục** → **Dải riêng**). Tùy chọn **Lấp đầy khung** dùng được cho mọi tỉ lệ.
- **Webcam**: bong bóng tròn, bo góc hoặc vuông, chỉnh kích thước và góc đặt; hoặc dải webcam chiếm trọn chiều ngang.
- Mọi thay đổi hiện ngay trên khung xem trước, không cần bấm phát.
- **Chuyển động** (tab riêng): tốc độ con trỏ, tốc độ khung nhìn đi theo con trỏ, tốc độ zoom vào/ra — kéo về "Chậm" cho chuyển động mượt kiểu điện ảnh.
- **Làm đẹp mặt** (tab Webcam): bấm **Làm đẹp tự động** hoặc chỉnh mịn da, làm sáng, tông ấm. Áp dụng cả khi xuất và khi livestream (thanh trượt **Làm đẹp mặt** trong studio).
- **Timeline kiểu CapCut**: mỗi clip có dải ảnh thu nhỏ của video ở trên và dạng sóng âm thanh ở dưới.
- **Nhạc nền & hiệu ứng âm thanh** (tab Âm thanh): **Thêm nhạc từ máy** (MP3, WAV, M4A, OGG, FLAC…) hoặc chọn hiệu ứng có sẵn (Vút, Bụp, Ting, Bùm, Ta-da, Vỗ tay, Buồn wah-wah, Bíp che từ…). Mỗi đoạn có hàng riêng trên timeline: kéo để dời, kéo mép để cắt; chỉnh âm lượng, tăng dần/nhỏ dần, lặp lại. Hiệu ứng âm thanh do app tự tổng hợp nên không vướng bản quyền.
- **Chuyển tiếp** giữa hai clip: bấm nút ◆ ở chỗ nối trên timeline → chọn Mờ qua đen/trắng, Lóe sáng, Phóng to, Làm nhòe, Lướt ngang, Glitch; chỉnh thời gian; áp dụng cho tất cả chỗ nối.
- **Hiệu ứng hình** (tab Hiệu ứng): Rung lắc, Glitch, VHS cổ, Đen trắng, Cổ điển, Viền tối, Làm mờ, Lóe theo nhịp, Nhún theo nhịp, Pháo giấy — thêm tại đầu phát, kéo trên hàng Hiệu ứng để dời/đổi độ dài, chỉnh độ mạnh.
- **Chữ & sticker & meme** (tab Chữ & sticker): chữ kiểu Meme (Impact viền đen), Tiêu đề, Bong bóng, Neon; câu meme có sẵn ("Hết cứu", "Đỉnh nóc kịch trần", "Plot twist"…); 30 sticker emoji; ảnh/GIF động từ máy; **Thư viện meme của tôi** — thêm ảnh/GIF meme yêu thích một lần, dùng lại ở mọi dự án. Hiệu ứng xuất hiện: Bật ra, Nhún, Lắc, Mờ dần, Trượt vào. **Kéo trực tiếp trên khung xem trước** để đặt vị trí. Lumora không kèm sẵn ảnh meme có bản quyền — hãy dùng ảnh bạn có quyền sử dụng.
- **Phím tắt**: Space phát/dừng · S tách · **A xóa phần bên trái đầu phát** · **D xóa phần bên phải đầu phát** · Delete xóa clip · Ctrl+Z / Ctrl+Y.
- **Dạng sóng âm thanh** hiện ngay trong từng clip video trên timeline (micro + âm thanh máy), nên dễ thấy chỗ đang nói và chỗ im lặng để cắt.
- **Timeline**: tách (phím S), xóa (Delete), đổi tốc độ từng đoạn, hoàn tác/làm lại (Ctrl+Z / Ctrl+Y). Bản chỉnh sửa được tự lưu vào `edit.json`.
- **Xuất**: MP4 (H.264 + AAC) hoặc GIF; 720p, 1080p, 1440p hoặc 4K; 30 hoặc 60 fps. File được lưu trong thư mục `exports` của dự án.

Phần xem trước và phần xuất dùng chung một hàm vẽ, nên video xuất ra giống hệt những gì bạn thấy khi chỉnh. Khi xuất, mediabunny/WebCodecs giải mã chính xác từng khung hình và mã hóa bằng card đồ họa nếu có. Sau đó FFmpeg cắt, đổi tốc độ và trộn âm thanh micro/máy theo đúng các đoạn đã cắt.

## AI

Trước tiên, nhập API key **ElevenLabs** và **Claude** trong **Cài đặt**. Sau đó, trong trình chỉnh sửa:

- **Phụ đề** (ElevenLabs Scribe v2): nhận dạng tiếng Việt, tiếng Anh hoặc tự nhận diện ngôn ngữ, có thời gian từng từ.
  - Có hai kiểu: tô sáng từ đang nói (giống TikTok) hoặc hiện cả dòng; đặt ở trên hoặc dưới; chỉnh cỡ chữ.
  - Sửa được nội dung từng dòng.
  - Lưu ra SRT/VTT hoặc in thẳng vào video khi xuất.
  - Dịch Việt ↔ Anh bằng Claude.
- **AI** (Claude):
  - Tìm từ đệm, câu nói lặp và khoảng lặng dài. Bạn duyệt danh sách rồi mới áp dụng.
  - Chỉnh video bằng văn bản: chọn các từ muốn bỏ, phần video tương ứng sẽ bị cắt.
  - Tạo 3 gợi ý tiêu đề, mô tả, hashtag và chương YouTube. Thời gian các chương được tính theo video đã cắt.

Mọi lệnh gọi Claude dùng model `claude-opus-5-5` kèm structured outputs (kết quả JSON đúng schema). Các lệnh này cũng bật `fallbacks: "default"`: khi bộ lọc an toàn từ chối một yêu cầu, máy chủ Anthropic tự chạy lại yêu cầu đó trên một model dự phòng phù hợp.

## Livestream

Mở tab **Livestream**. Studio vẽ cảnh 30 khung hình/giây (720p hoặc 1080p), FFmpeg mã hóa một lần rồi phát **cùng lúc** tới mọi kênh đã bật.

- **Kênh phát**: YouTube, Facebook, TikTok, Twitch hoặc RTMP tùy chỉnh. Stream key được mã hóa như API key (`live-secrets.json`), không nằm trong file cấu hình và không hiện lại trên giao diện. Mỗi kênh hiện trạng thái riêng (đang kết nối, đang phát, lỗi); một kênh lỗi không làm dừng các kênh khác.
- **Studio**: bố cục một người, lưới, màn hình kèm người, PiP; chia sẻ màn hình hoặc cửa sổ; banner; tên hiển thị trên từng người.
- **Khách mời**: bấm **Mở phòng khách mời**, gửi link cho khách. Khách mở bằng trình duyệt, không cần cài gì, vào **hậu trường** trước, rồi host đưa lên hoặc xuống sóng hay mời ra. Hình và tiếng đi thẳng giữa hai máy qua WebRTC. Khách nghe mọi người trừ chính mình (mix-minus) và xem được hình chương trình.
  - Khách cùng mạng nội bộ dùng link IP (cổng 47800).
  - Khách ở xa: tạo một đường hầm (ví dụ `cloudflared tunnel --url http://localhost:47800`) rồi dán địa chỉ công khai vào **Cài đặt → Địa chỉ công khai**.
- **Bình luận**: đọc chat YouTube (API key YouTube Data v3 + ID video) và bình luận Facebook (Page access token + ID video). Bấm **Hiện lên sóng** để đưa một bình luận lên khung hình.
- **Phụ đề trực tiếp**: cứ 5 giây, micro được gửi tới ElevenLabs và chữ hiện ở đầu khung hình.
- **Ghi lại trong máy** (bật sẵn): kết thúc buổi live, bản ghi `live.mkv` thành một dự án. Bạn mở dự án đó để chỉnh sửa, làm phụ đề và tạo chương bằng AI như video quay thường.

Nếu FFmpeg dừng giữa chừng (mất mạng, sai key) hoặc mọi kênh đều lỗi mà không ghi trong máy, buổi phát tự kết thúc và app báo lỗi.

## Chia sẻ dự án để người khác cùng chỉnh sửa

1. Mở dự án ở trang **Dự án** → **Chia sẻ** → **Gói đầy đủ**: tạo một file `.lumorapack` (video + bản chỉnh sửa). Gửi file qua Google Drive, Zalo, USB…
2. Người nhận bấm **Nhập dự án được chia sẻ** ở trang **Dự án**, rồi mở ra chỉnh sửa trên máy họ.
3. Gửi qua lại sau đó chỉ cần **Chỉ bản chỉnh sửa** (vài KB, không kèm video). Nhập gói này thì dự án được cập nhật theo bản chỉnh sửa mới; bản cũ được sao lưu (`edit.backup-….json`) trong thư mục dự án.

Màu chủ đạo của app đổi được trong **Cài đặt** (mặc định xanh dương).

## Cập nhật và nhật ký lỗi

- **Tự cập nhật**: bản đã cài tự kiểm tra GitHub Releases khoảng 10 giây sau khi mở và cứ 4 giờ một lần, rồi tải bản mới ở nền. Tải xong, một thanh báo hiện ở đầu app: bấm **Khởi động lại để cập nhật**, hoặc bỏ qua thì bản mới tự cài khi bạn thoát app. Kiểm tra bằng tay ở **Cài đặt → Thông tin**.
- **Nhật ký lỗi**: `%APPDATA%\Lumora\logs\main.log` (tối đa 5 MB, giữ thêm một bản cũ `main.old.log`). Bấm **Mở thư mục nhật ký lỗi** trong **Cài đặt → Thông tin**. API key, token và stream key được che trước khi ghi.

## Phát hành bản mới

1. Tăng `version` trong `apps/desktop/package.json` (ví dụ `0.2.0`) rồi commit.
2. Vào tab **Actions** → **Release** → **Run workflow** (workflow tự tạo tag `v0.2.0` sau khi test qua), hoặc tự push tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. Workflow **Release** chạy toàn bộ test, build bộ cài và đăng lên **GitHub Releases**. Các máy đã cài sẽ tự nhận bản mới.

## Chạy từ mã nguồn

Cần cài: [Node.js 22 LTS](https://nodejs.org), [Git](https://git-scm.com) và pnpm (`npm install -g pnpm`).

```bash
pnpm install       # cài thư viện
pnpm dev           # mở app ở chế độ phát triển (tự tải lại khi sửa code)
pnpm package:win   # tạo bộ cài .exe trong apps/desktop/release/
python3 apps/desktop/scripts/make-icon.py   # vẽ lại icon (cần Pillow) nếu muốn đổi
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

Test E2E của livestream dùng FFmpeg làm máy chủ RTMP thật, mở một trình duyệt Chromium làm khách mời (webcam và micro giả) và dựng máy chủ giả lập YouTube và ElevenLabs.

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
  src/main/export/     Ghi file xuất, trộn âm thanh, tạo GIF
  src/main/ai/         ElevenLabs (phụ đề) và Claude (cắt, tiêu đề, chương, dịch)
  src/main/logger.ts   Nhật ký lỗi (che thông tin bí mật)
  src/main/updater.ts  Tự cập nhật từ GitHub Releases
  src/main/live/       Phát RTMP, máy chủ báo hiệu + trang khách mời, bình luận, phụ đề trực tiếp
  src/renderer/src/editor/  Trình chỉnh sửa: timeline, xem trước, xuất video
  src/renderer/src/live/    Studio livestream: ghép cảnh, trộn âm thanh, WebRTC với khách
packages/core/         Logic thuần, không phụ thuộc Electron, dễ test
```

## Bảo mật API key

- Key được mã hóa bằng `safeStorage` của Electron (dùng DPAPI trên Windows) và lưu trong `%APPDATA%\Lumora\secrets.json`.
- Giao diện không bao giờ nhận lại key gốc, chỉ thấy dạng rút gọn như `sk-a••••••••1234`.
- Nút "Kiểm tra" gọi API thật nhưng không tốn credit: ElevenLabs gọi `GET /v1/user`, Claude gọi danh sách model.
