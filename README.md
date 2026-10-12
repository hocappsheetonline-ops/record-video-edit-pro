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

Mở một dự án và bấm **Chỉnh sửa**. Giao diện bố trí giống phần mềm dựng phim chuyên nghiệp (CapCut, Premiere):

- **Bên trái — Thư viện**: Meme · Âm thanh · Văn bản · Nhãn dán · Hiệu ứng · Chuyển cảnh · Phụ đề · AI. Bấm một mục để thêm tại đầu phát.
- **Giữa — Xem trước**: bấm vào chữ, sticker, video meme hoặc **webcam** để chọn; kéo để dời, kéo góc để đổi cỡ, kéo nút tròn để xoay. Thanh điều khiển: về đầu, lùi/tới 1 khung hình, phát/dừng, tới cuối, đổi tỉ lệ khung, toàn màn hình.
- **Bên phải — Thuộc tính**: chọn một mục thì hiện thuộc tính của mục đó; không chọn gì thì hiện cài đặt chung (Khung hình, Webcam, Con trỏ, Chuyển động, Zoom, Âm lượng).
- **Dưới — Timeline**: thanh công cụ (hoàn tác, tách, xóa trái/phải, xóa, thêm zoom), phóng to/thu nhỏ timeline (hoặc Ctrl + lăn chuột), kéo mép trên để đổi chiều cao. Các khối trùng giờ tự xếp thành nhiều hàng con.
- **Xuất** ở góc trên bên phải.

Tính năng:

- **Tự động zoom**: lần đầu mở, app gom các click chuột và đoạn gõ phím liên tục để tự tạo đoạn zoom. Khung nhìn đi theo con trỏ và chuyển vào/ra mượt. Trên timeline, kéo đoạn zoom để di chuyển, kéo mép để đổi độ dài; bấm vào đoạn zoom để chỉnh mức zoom và kiểu zoom.
- **Con trỏ** được vẽ lại từ dữ liệu chuột, làm mượt bằng mô phỏng lò xo. Có thể phóng to con trỏ, bật hiệu ứng khi click, và tự ẩn khi chuột đứng yên.
- **Khung hình**: chọn tỉ lệ 16:9, 9:16, 1:1, 4:3 hoặc giữ tỉ lệ gốc; nền trơn hoặc chuyển màu; lề, bo góc, bóng đổ.
- **Video dọc 9:16 (TikTok, Shorts, Reels)**: bấm **Dọc 9:16 tự động**. Video màn hình phủ kín khung dọc, phần thừa được cắt và khung nhìn tự đi theo con trỏ (giống Screen Studio). Webcam là bong bóng nổi hoặc **Chia đôi khung** (dải webcam ở trên/dưới).
- **Webcam đặt tự do**: kéo bong bóng webcam tới bất kỳ đâu trên khung xem trước (gần góc / giữa cạnh thì tự hít vào), kéo góc để đổi cỡ, hoặc dùng ô vị trí 9 điểm neo. Hình dạng tròn / bo góc / vuông, viền và màu viền. **Khung mặt**: phóng to mặt và dời khung cắt để mặt nằm giữa bong bóng.
- Mọi thay đổi hiện ngay trên khung xem trước, không cần bấm phát.
- **Chuyển động**: tốc độ con trỏ, tốc độ khung nhìn đi theo con trỏ, tốc độ zoom vào/ra — kéo về "Chậm" cho chuyển động mượt kiểu điện ảnh.
- **Làm đẹp mặt** (Webcam): bấm **Làm đẹp tự động** hoặc chỉnh mịn da, làm sáng, tông ấm. Áp dụng cả khi xuất và khi livestream.
- **Timeline kiểu CapCut**: mỗi clip có dải ảnh thu nhỏ của video ở trên và dạng sóng âm thanh ở dưới.
- **Kho meme online** (Thư viện → Meme → **Meme / Video / Ảnh**): tìm meme GIF / video ngắn trên **Tenor** và video, ảnh miễn phí trên **Pixabay** ngay trong app; rê chuột là phát thử, bấm để tải về **Thư viện của tôi** (dùng offline) và thêm vào video. Thư viện Nhãn dán có thêm **sticker động** nền trong suốt từ Tenor. Cần key miễn phí: Tenor dùng API key Google Cloud (bật "Tenor API" trong Google Cloud Console → Credentials → Create API key), Pixabay lấy ở pixabay.com/api/docs sau khi đăng ký. Nhập trong **Cài đặt → API key**.
- **Âm thanh meme**: 10 hiệu ứng meme tự tổng hợp (Bùm kiểu Vine, Còi thua, Rít đĩa, Còi hơi, Trống dồn, Ting tiền, Dế kêu, Boing, Vút lên, Tim đập) và **giọng đọc AI** (ElevenLabs): chọn giọng, bấm câu meme có sẵn ("Bruh", "Ối dồi ôi", "Hết cứu"…) hoặc gõ câu bất kỳ để thêm vào timeline. Câu đã đọc được lưu đệm, đọc lại không tốn credit.
- **Lọc tạp âm & giọng nói** (Cài đặt video → Âm lượng cho micro / âm thanh máy, hoặc chọn một đoạn âm thanh): **Lọc tạp âm** Nhẹ / Vừa (AI RNNoise, chạy offline, cho kết quả như nhau trên mọi máy) / Mạnh; **Tăng cường giọng nói** (bỏ ù, khử xì, nén cho giọng rõ đều); **Chuẩn hóa âm lượng** về -16 LUFS; **hiệu ứng giọng** Sóc chuột, Trầm, Robot, Vang, Radio, Loa; chỉnh **cao độ** ±12 bán cung. Xử lý chạy nền, xong thì khung xem trước tự phát bản đã xử lý; giữ nút **Gốc** để nghe lại bản gốc. Video xuất dùng đúng bản đã xử lý.
- **Lồng tiếng** (Thư viện → Âm thanh → Lồng tiếng): chọn micro, xem mức âm, bấm ghi (đếm ngược 3 giây, tùy chọn tắt tiếng bản gốc); video phát từ đầu phát trong lúc ghi, dừng lại là bản ghi nằm đúng chỗ trên hàng Âm thanh (màu cam).
- **Tách âm thanh** của video meme ra thành đoạn riêng để cắt / chỉnh / thêm hiệu ứng như nhạc. Nhạc nền hiện **vạch nhịp** (beat) trên timeline để cắt theo nhạc.
- **Clip video**: bảng thuộc tính chia tab **Video · Điều chỉnh · Âm thanh · Tốc độ** như CapCut — tắt tiếng hoặc chỉnh âm lượng micro / âm thanh máy riêng từng clip, tốc độ 0.25–8×.
- **Bộ lọc màu** (Thư viện → Bộ lọc): 11 mẫu (Điện ảnh, Cổ điển, Lạnh, Ấm, Đen trắng, Phai màu, Rực rỡ, Noir, Pastel, Xanh cam, Hoàng hôn) với độ mạnh. Không chọn gì thì áp dụng cho cả video; chọn một clip thì chỉ clip đó (nút **Dùng chung** để bỏ); chọn ảnh / video meme thì cho riêng lớp đó.
- **Điều chỉnh** (tab Điều chỉnh ở Cài đặt video hoặc của clip / ảnh): phơi sáng, độ sáng, tương phản, bão hòa, nhiệt độ màu, sắc độ, vùng sáng, vùng tối, độ nét, viền tối, hạt nhiễu.
- **Cắt · Lật · Xoay clip** (tab Video của clip): lật ngang / dọc, xoay 90°, cắt từng cạnh — khung hình tự theo tỉ lệ video sau khi xoay / cắt; con trỏ, zoom và vùng nhìn đi đúng theo.
- **Đóng băng khung hình** (nút ❄ trên thanh công cụ timeline): giữ khung đang xem 2 giây (chỉnh được 0.1–20 giây), không có tiếng, rồi video chạy tiếp đúng chỗ.
- **Lớp phủ nâng cao** (chọn chữ / nhãn dán / ảnh / video meme): **Hoạt ảnh** vào (12 kiểu: bật ra, mờ dần, trượt 4 hướng, phóng to, xoay, nảy, lật, nhòe, đánh chữ), ra (8 kiểu) và lặp (nhún, rung, nhịp, đung đưa, lơ lửng, nhấp nháy) với thời lượng riêng; **Keyframe** vị trí / cỡ / góc / độ mờ (bấm ◇ tại đầu phát, kéo lớp trên khung xem trước hoặc kéo thanh trượt là tự ghi keyframe; chọn kiểu chuyển Đều / Nhanh dần / Chậm dần / Mượt; hình thoi trên timeline để nhảy tới); **Độ mờ**, **chế độ hòa trộn** (Screen, Multiply, Overlay, Lighten, Darken, Difference, Add), **lật**; **Mặt nạ** cho ảnh / video (tròn, chữ nhật, trái tim, ngôi sao, tuyến tính, gương; viền mềm, đảo ngược).
- **Ô số cạnh mọi thanh trượt**: bấm vào để gõ số (Enter áp dụng, mũi tên lên / xuống tăng giảm, Shift để bước lớn), nút ↺ để về mặc định. Mọi nút chỉ có biểu tượng đều có chú thích khi rê chuột (kèm phím tắt).
- **Meme video** (Thư viện → Meme): **kéo thả** video meme (MP4, MOV, WEBM, MKV…) hoặc ảnh / GIF vào thư viện một lần, dùng lại ở mọi dự án. Video được chuẩn hóa sang MP4 (tối đa 1280px, 2 phút). Bấm để thêm vào timeline tại đầu phát — video **có tiếng** (chỉnh âm lượng), cắt đầu/cuối trên timeline, **Phủ kín khung** hoặc **Vừa khung**, và **Xóa phông** (phông xanh lá / xanh dương / đen / trắng, chỉnh độ mạnh) để chỉ giữ lại nhân vật. Lumora không kèm sẵn meme có bản quyền — hãy dùng video bạn có quyền sử dụng.
- **Nhạc nền & hiệu ứng âm thanh** (Thư viện → Âm thanh): **Thêm nhạc từ máy** (MP3, WAV, M4A, OGG, FLAC…) hoặc chọn hiệu ứng có sẵn (Vút, Bụp, Ting, Bùm, Ta-da, Vỗ tay, Buồn wah-wah, Bíp che từ…). Kéo để dời, kéo mép để cắt; chỉnh âm lượng, tăng dần/nhỏ dần, lặp lại. Hiệu ứng âm thanh do app tự tổng hợp nên không vướng bản quyền.
- **Chuyển cảnh** giữa hai clip: bấm nút ◆ ở chỗ nối trên timeline (hoặc Thư viện → Chuyển cảnh) → Mờ qua đen/trắng, Lóe sáng, Phóng to, Làm nhòe, Lướt ngang, Glitch; chỉnh thời gian; áp dụng cho tất cả chỗ nối.
- **Hiệu ứng hình**: Rung lắc, Glitch, VHS cổ, Đen trắng, Cổ điển, Viền tối, Làm mờ, Lóe theo nhịp, Nhún theo nhịp, Pháo giấy — thêm tại đầu phát, kéo trên hàng Hiệu ứng để dời/đổi độ dài, chỉnh độ mạnh.
- **Văn bản & nhãn dán**: mẫu chữ Meme (Impact viền đen), Tiêu đề, Bong bóng, Neon; 30 sticker emoji. Hiệu ứng xuất hiện: Bật ra, Nhún, Lắc, Mờ dần, Trượt vào.
- **Phím tắt**: Space phát/dừng · S tách · **A xóa phần bên trái đầu phát** · **D xóa phần bên phải đầu phát** · Delete xóa mục đang chọn · Esc bỏ chọn · Home/End về đầu/cuối · ←/→ lùi/tới 1 giây · Ctrl+Z / Ctrl+Y.
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
