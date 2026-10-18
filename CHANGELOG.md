# Nhật ký thay đổi

Các phiên bản Lumora (bản cài Windows ở trang Releases của kho mã; app tự cập nhật).

## 1.13.0

- **Chỉnh sửa video bằng văn bản (kiểu Descript)** (Thư viện → **Lời thoại**): lời thoại hiện thành chữ (nhận dạng nếu chưa có), **xóa chữ nào thì đoạn video + tiếng tương ứng bị cắt**. Bấm một từ để đưa đầu phát tới đó; Shift+bấm hoặc bôi đen để chọn nhiều từ rồi bấm **Delete** (hoặc nút Cắt chữ đã chọn). Phần đã cắt hiện **gạch ngang**, bấm để khôi phục (có ô ẩn / hiện phần đã cắt); mọi bước đều hoàn tác được. Hợp cho video hướng dẫn kiểu quay màn hình + nói.
- **Từ đệm và khoảng lặng hiện ngay trong văn bản**: "ờ", "à", "ừm", "ơ", "hừm", um / uh / erm… được **tô vàng**; khoảng nghỉ dài hơn 0,7 giây hiện thành ô **⋯ 1,5 s** bấm để rút ngắn (chừa lại 0,35 giây cho tự nhiên). Hai nút một chạm: **Bỏ mọi từ đệm (N)** và **Rút ngắn mọi khoảng lặng (N)**; dòng thống kê số từ / từ đệm / khoảng lặng còn lại cập nhật theo timeline. Ô **Cắt theo cụm từ**: gõ câu cần bỏ, các từ khớp được tô hồng, **Cắt mọi lần**.
- **Lệnh `cutText` cho Đạo diễn AI / trợ lý**: AI trích đúng câu từ lời thoại ("cắt câu “hôm nay mình demo”", "bỏ đoạn nói lạc đề", "remove the sentence …") và app cắt đúng đoạn video đó (mọi lần xuất hiện hoặc chỉ lần đầu), nhận dạng lời thoại trước nếu chưa có; không thấy câu đó thì báo bỏ qua. Bộ hiểu từ khóa (không có AI) nhận câu trích trong ngoặc kép sau "cắt / bỏ / xóa".

## 1.13.0

- **Phụ đề kiểu app Captions** (Thư viện → Phụ đề → AI kiểu Captions): **Thêm emoji (AI)** — Claude / Ollama chọn một emoji hợp nghĩa cho từng dòng, hiện cuối dòng và nảy nhẹ khi dòng vừa hiện; **Tô từ khóa (AI)** — chọn 1–3 từ quan trọng mỗi dòng (số, tên sản phẩm, hành động) và tô bằng **màu từ khóa** riêng (ô màu mới cạnh màu chữ / màu nhấn, mỗi mẫu có màu sẵn). Emoji và từ khóa lưu theo dòng, giữ khi đổi mẫu / tách / gộp dòng, bỏ bằng một nút; không có AI thì chọn theo từ điển tiếng Việt / tiếng Anh có sẵn.
- **Lồng tiếng AI** (cùng mục; lệnh `dub` cho Đạo diễn AI, từ khóa "lồng tiếng sang tiếng Anh", "thuyết minh tiếng Nhật, giữ giọng gốc"): dịch lời thoại (khi chọn ngôn ngữ khác), đọc từng dòng bằng giọng AI (ElevenLabs hoặc Piper trên máy) **đúng thời điểm dòng trên video xuất**, câu dài hơn chỗ trống tới dòng sau thì đọc lại nhanh hơn tới 1,2× rồi cắt tối đa 15 %; micro gốc tắt (hoặc giữ nhỏ 15 % khi "giữ tiếng gốc"), các đoạn đọc nằm ở hàng Âm thanh (kiểu lồng tiếng, nhạc vẫn tự giảm), phụ đề đổi sang ngôn ngữ lồng tiếng. Cả bản lồng tiếng là một bước hoàn tác.
- **6 mẫu phụ đề động mới** (tổng 14): **Máy chữ** (gõ dần từng ký tự theo lời, phông Roboto Mono), **Lượn sóng**, **Trượt lên** (dòng mờ dần vào, từ chưa nói mờ), **Bóng đổ** (chữ poster Anton bóng cứng, nảy từ đang nói), **Chuyển màu** (chữ chuyển từ màu chữ sang màu nhấn), **Truyện tranh** (Bangers, viền dày, nảy từ đang nói). Xem trước và video xuất vẽ chung một mã nên giống hệt nhau.
- **Đạo diễn AI** hiểu thêm `captionsEmoji`, `captionsKeywords`, `dub {language, keepOriginal, voiceName}`; công thức TikTok / Shorts tự tô từ khóa; sổ tay dựng gợi ý mẫu Bóng đổ / Truyện tranh + từ khóa cho video dọc. Phần lời nhắc tĩnh (được cache) chỉ thêm mô tả lệnh, không có nội dung riêng của video.

## 1.12.2

- **Sửa lỗi kéo chọn hàng loạt trên timeline.** Khung kéo chọn trước đây chỉ nhận lớp phủ, hiệu ứng và âm thanh, nên kéo bao qua các clip trong hàng cắt hay các đoạn zoom không chọn được gì và không xóa được. Giờ khung chọn bao cả **clip và đoạn zoom** (hàng clip không có chỗ trống nên bắt đầu kéo ngay từ một clip cũng được), **Ctrl+click** thêm / bỏ từng clip hoặc zoom khỏi nhóm, menu chuột phải lên mục đang trong nhóm giữ nguyên nhóm, và **Delete / Shift+Delete / nút Xóa** xóa cả nhóm trong một bước hoàn tác (luôn giữ lại ít nhất một clip). Ctrl+A vẫn như cũ.

## 1.12.1

- **Sửa lỗi mất hình (đen màn hình) ở mỗi đoạn cắt.** Lệnh "thêm chuyển cảnh" (trợ lý từ khóa, Đạo diễn AI, công thức TikTok / Shorts, nút trong Thư viện) trước đây đặt chuyển cảnh — mặc định là Mờ qua đen 600 ms — ở **mọi** chỗ nối, kể cả hàng chục chỗ cắt khoảng lặng và chỗ tách clip tại chỗ, nên video cứ vài giây lại tối đen một nhịp. Giờ chuyển cảnh chỉ đặt ở **chỗ đổi cảnh**: giữa hai đoạn quay khác nhau hoặc nơi bỏ đi một đoạn dài (từ 3 giây); chỗ cắt lặng, cắt từ thừa, tách tại chỗ hay khung đứng yên thì hình vẫn liền nên cắt thẳng. Muốn đặt ở mọi chỗ nối thì nói rõ ("chuyển cảnh zoom ở mọi chỗ nối", Đạo diễn AI dùng `transitions {all: true}`) hoặc bấm **Đặt ở cả … chỗ nối** trong Thư viện → Chuyển cảnh, cạnh nút mới **Đặt ở … chỗ đổi cảnh**. Không có chỗ đổi cảnh thì lệnh báo bỏ qua thay vì bôi đen cả video. Chuyển cảnh đã đặt trong dự án cũ không tự đổi: bấm **Xóa chuyển cảnh** (hoặc nói "bỏ chuyển cảnh") rồi đặt lại.

## 1.12.0

- **Tự dựng một nút** (Thư viện → AI → Tự dựng một nút): quay xong, chọn định dạng (tự chọn / YouTube / TikTok-Shorts / Vlog / Tối giản) rồi bấm **Tự dựng ngay**. App đọc lời thoại (nhận dạng nếu chưa có) và thao tác chuột, gọi AI **đúng một lần** để lập kế hoạch dựng chuyên nghiệp theo sổ tay (hook, cắt lặng / từ thừa, zoom đúng lúc, phụ đề, nhạc nền, thẻ kết), áp dụng, rồi **tự rà soát theo sổ tay mà không tốn token** (khung đúng định dạng, phụ đề, nhạc tự giảm khi nói, hook, thẻ kết, giọng sạch) và lấp chỗ thiếu. Không có AI (thiếu key Claude / Ollama tắt) thì dựng theo công thức có sẵn, hook lấy từ câu nói đầu. Cả bản dựng là một bước hoàn tác.
- **Tiết kiệm token**: lời nhắc Đạo diễn AI tách làm hai khối — phần tĩnh (vai trò, tập lệnh, sổ tay; ≈ 3 000 token, giống hệt nhau giữa mọi lần gọi) gắn `cache_control` để Claude **cache** (từ lần thứ hai chỉ trả ≈ 10 % giá), phần động chỉ còn ngữ cảnh của video; tự dựng không gửi hội thoại cũ; chọn đoạn hay cho shorts chạy với effort thấp.
- **AI tự tìm nhạc nền miễn phí bản quyền** (lệnh `findMusic` cho Đạo diễn AI, từ khóa "tự tìm nhạc nền vui"): tìm trên **Jamendo** theo tâm trạng + nhịp, **chỉ lấy bài Creative Commons cho phép dùng thương mại** (loại NC) và cho tải về, ưu tiên không lời và dài tương đương video, tải vào kho nhạc kèm **dòng ghi nguồn** ("Tên bài" by Nghệ sĩ — CC BY 3.0, Jamendo) hiện sau khi dựng với nút sao chép để dán vào mô tả video. Cần **key Jamendo** (Client ID miễn phí ở devportal.jamendo.com, nhập ở Cài đặt → API key); không có key thì dùng kho nhạc của bạn. Hai video liền nhau không trùng bài.
- **Chèn tư liệu (b-roll)** (lệnh `broll`): AI chọn thời điểm lời thoại nói chung chung, app tìm video stock trên **Pixabay**, tải về và phủ kín khung trong 3–6 giây, không tiếng (cần key Pixabay). Tự dựng có ô bật / tắt.
- **Chia video dài thành 2–3 video ngắn hay nhất** (`shorts` chế độ `highlights`; "chia video này ra làm 2-3 video short"): AI đọc lời thoại, chọn các đoạn trọn ý 15–90 giây có kết quả rõ, mỗi đoạn thành một dự án riêng **dọc 9:16**, **phụ đề TikTok**, **hook** do AI viết hiện 2,5 giây đầu, tên dự án theo tên đoạn. Tự dựng có ô "Tách thêm N video ngắn hay nhất".

## 1.11.0

- **Thư viện hiệu ứng 27 kiểu, chia 5 nhóm** (Thư viện → Hiệu ứng): thêm 17 hiệu ứng mới kiểu CapCut — **Chuyển động**: Phóng nhấn, Nhảy nhún, Gương đối xứng; **Glitch & retro**: Tách màu RGB, Khảm ô, Hạt phim; **Màu sắc**: Đảo màu, Hai tông màu, Tông ấm, Tông lạnh; **Ánh sáng & khung**: Nhấp nháy nhanh, Tỏa sáng, Lọt sáng, Đèn rọi, Dải điện ảnh; **Hạt bay**: Lấp lánh, Tuyết rơi. Mọi hiệu ứng tính theo thời gian trên cùng một canvas nên tua tới đâu cũng đúng và **video xuất giống hệt xem trước**.
- **Thư viện chuyển cảnh 21 kiểu, chia 4 nhóm** (Thư viện → Chuyển cảnh hoặc nút ◆ ở chỗ nối): thêm 14 chuyển cảnh mới — Lọt sáng, Thu nhỏ, Lia máy (whip pan), Xoay, Lướt phải / lên / xuống, Rung lắc, Kéo rèm, Vòng tròn (iris), Rèm sáo, Ép dẹt, Lật thẻ, Khảm ô. Ô trong thư viện có biểu tượng và đánh dấu kiểu đang dùng; **Áp dụng cho tất cả chỗ nối** dùng đúng kiểu và thời gian đang chọn thay vì luôn là Mờ qua đen.
- **Đạo diễn AI chọn hiệu ứng theo ý nghĩa**: lời nhắc hệ thống có **danh mục hiệu ứng và chuyển cảnh** (tên, trông thế nào, dùng khi nào: zoomPunch / flash khi lộ kết quả, confetti / sparkle khi thành công, bw / vintage cho hồi tưởng, spotlight để tập trung một chỗ; fadeBlack / wipe cho đổi phần, zoom / whip cho short-form, slide* cho bước tiếp / trước, flip cho trước – sau, iris để tập trung) kèm gợi ý độ dài. Bộ hiểu từ khóa (không có AI) nhận tên tiếng Việt / tiếng Anh của mọi hiệu ứng và chuyển cảnh mới ("hiệu ứng lấp lánh", "chuyển cảnh lia máy", "lướt sang phải"…); hiệu ứng màu trùng tên bộ lọc chỉ nhận khi câu có chữ "hiệu ứng".

## 1.9.1

- **Sửa tiếng thu bị giật và rè.** Chromium đóng dấu từng gói âm thanh của MediaRecorder theo giờ thu thật, nên khi micro / loopback khựng hoặc máy bận mã hóa video, mốc thời gian bị hụt: phát lên nghe giật và tiếng lệch dần so với hình. Khi lưu bản quay, track micro và âm thanh máy (và bản lồng tiếng) được chuẩn hóa mốc thời gian (`aresample async`: điền im lặng đúng chỗ hụt, giữ nguyên độ dài) rồi mã hóa lại Opus 48 kHz. Micro giờ **thu thô** (tắt khử vang, lọc ồn và tự chỉnh gain của Chromium, 48 kHz mono) vì ba bộ lọc đó làm tiếng rè, bập bùng và nuốt đầu câu, còn khử vang không có tác dụng với âm thanh máy; lọc tạp âm làm sau bằng RNNoise trong trình chỉnh sửa (Âm thanh → Lọc tạp âm) sạch hơn. Livestream vẫn bật xử lý giọng để khử vang tiếng loa. Trang Quay thả micro / webcam xem trước trong lúc đang quay để không có hai luồng cùng mở một thiết bị.
- **Xuất video không còn rè / tách ở điểm cắt.** Sau khi trộn mic + tiếng máy + nhạc có bộ chặn đỉnh (limiter, có bù độ trễ) nên tổng vượt 0 dB không còn bị cắt ngọn; mỗi mảnh âm thanh được vuốt 5 ms hai đầu nên điểm cắt, đổi tốc độ, mép đoạn nhạc không còn tiếng "tách"; mọi nguồn được đưa về 48 kHz trước khi trộn.
- **Xem trước**: clip có đường cong tốc độ không đặt lại tốc độ phát mỗi khung hình nữa (làm tròn bậc 0,02) nên hết lạo xạo khi phát đoạn đổi tốc độ.

## 1.9.0

- **Đạo diễn AI dựng video như biên tập viên chuyên nghiệp**: lời nhắc hệ thống có **sổ tay dựng YouTube / TikTok** rút từ cách làm của các kênh hướng dẫn và short-form (hook 3–5 giây đầu nói thẳng kết quả, đổi hình mỗi 10–20 giây bằng zoom / chữ / mũi tên / hiệu ứng, cắt khoảng lặng > 0,5 giây và từ thừa, tua nhanh đoạn chờ, zoom đúng lúc lời thoại nhắc tới chi tiết nhỏ và giữ qua lúc bấm, phụ đề ngắn 2–3 từ cho video dọc / cả dòng cho hướng dẫn, giọng sạch khoảng −14 LUFS và nhạc nền nhỏ tự giảm khi nói, hiệu ứng âm thanh tiết chế, che thông tin riêng tư, thẻ kết CTA 3–5 giây cuối, thứ tự lệnh chuẩn). AI còn nhận **lời thoại có mốc thời gian trên video xuất**, **thời điểm bấm chuột** và **tóm tắt bản dựng hiện tại** để đặt chữ, zoom, mốc đúng chỗ và không làm trùng.
- **Bốn công thức dựng một chạm** (`recipe`): **YouTube** (hướng dẫn dài 16:9: cắt lặng / từ thừa, giọng sạch, zoom theo chuột mượt, hiện phím tắt, phụ đề hộp, nhạc nhỏ tự giảm, mốc chương), **TikTok / Shorts** (dọc 9:16, nhịp nhanh, phụ đề TikTok to, chuyển cảnh zoom ngắn, nhạc tự giảm), **Vlog** (phụ đề karaoke, tông ấm, nhạc nhẹ) và **Tối giản**. Lệnh nêu rõ trong cùng kế hoạch thắng lệnh của công thức; bộ hiểu từ khóa (không có AI) nhận "dựng kiểu YouTube", "video TikTok hoàn chỉnh", "kiểu vlog", "tối giản". Ba nút gợi ý mới trong bảng AI.
- **Bảy lệnh mới cho AI**: hiệu ứng tại một thời điểm (`effectAt`), đổi tốc độ một đoạn (`speedRange`: tua nhanh phần chờ / chậm lại chỗ quan trọng), đường cong tốc độ kiểu CapCut cho clip (`speedCurve`), chuyển cảnh tại một chỗ nối (`transitionAt`), kiểu chữ phụ đề (`captionsLook`: phông, màu, màu nhấn, in hoa, số từ, tô từng từ / cả dòng), **thẻ kết luôn bám cuối video** (`outro`, đúng chỗ dù đã cắt lặng); `transitions` nhận độ dài và `export` nhận nâng cao chất lượng HD.

## 1.8.0

- **Che vùng riêng tư** (Thư viện → Hiệu ứng → Che vùng riêng tư): thêm vùng **Làm mờ** hoặc **Khảm ô (mosaic)** lên video như CapCut để giấu mật khẩu, email, tên người; kéo trên khung xem trước để đặt, kéo góc để đổi cả chiều rộng lẫn chiều cao, chỉnh độ mạnh, dùng **keyframe** để vùng che đi theo cửa sổ. Xuất giống hệt xem trước.
- **Tự giảm nhạc khi có lời** (Cài đặt video → Âm lượng → Nhạc nền): nhạc nền tự nhỏ lại (mức chỉnh được, mặc định 30 %) khi micro có tiếng hoặc ở các đoạn lồng tiếng, to lại khi im lặng — audio ducking như CapCut / Descript / Camtasia. Khoảng có lời lấy từ dạng sóng bản quay nên không cần AI; xem trước và video xuất giảm như nhau.
- **Hiện phím tắt đã bấm** (Cài đặt video → Con trỏ): phím tắt (Ctrl+C, Alt+Tab, Win+Shift+S…) hiện thành viên thuốc dưới khung hình rồi mờ dần, như Screen Studio / Camtasia; chỉ hiện phím tắt, không ghi chữ bạn gõ (bản quay vốn không lưu).
- **Chụp khung hình** (nút ảnh cạnh Toàn màn hình dưới khung xem trước): lưu khung đang xem thành PNG trong thư mục `exports` của dự án, có nút mở thư mục — như "Snapshot" của CapCut, tiện làm ảnh bìa / thumbnail.
- **Đạo diễn AI** hiểu thêm ba lệnh: che vùng (`blur`: làm mờ / khảm ô tại vị trí và thời điểm), tự giảm nhạc khi có lời (`duck`) và hiện phím tắt (`cursor.showKeys`); bộ hiểu từ khóa (không có AI) cũng nhận "hiện phím tắt", "giảm nhạc khi nói", "khảm vùng…".

## 1.7.0

- **Đạo diễn AI điều khiển hầu hết tính năng chỉnh sửa**: ngoài cắt / phụ đề / zoom / nhạc / bộ lọc / xuất, AI (Claude hoặc Ollama) giờ ra được lệnh cho **timeline** (cắt một đoạn theo thời gian, đóng băng khung hình, lật, xoay), **âm thanh** (âm lượng micro / máy / nhạc / hiệu ứng, tắt tiếng, hiệu ứng giọng, nhạc tăng giảm dần, chèn hiệu ứng âm thanh), **zoom** (đặt mức zoom cho tất cả, thêm đoạn zoom tại thời điểm, tốc độ khung nhìn), **khung hình** (lề, bo góc, bóng, nền màu / chuyển màu, phủ kín), **con trỏ** và **webcam** (ẩn / hiện, hình dạng, cỡ, góc, bố cục, làm đẹp, xóa phông), **lớp nổi** (chữ theo mẫu, nhãn dán emoji, mũi tên / vòng tròn… tại vị trí), **điều chỉnh màu** từng thông số, **phụ đề** (vị trí trên / dưới, cỡ chữ, dịch hoặc song ngữ), **điểm đánh dấu** và **mốc chương** từ lời thoại, ẩn / tắt tiếng / khóa hàng timeline, **xóa sạch** một loại mục (zoom, hiệu ứng, nhạc, phụ đề, bộ lọc… hoặc khôi phục bản quay đầy đủ), **chia thành video ngắn**, và xuất kèm số khung hình / giây.
- Bộ hiểu từ khóa (khi không có AI) biết thêm: mức zoom ("zoom 2.5x"), bỏ nhạc / zoom / hiệu ứng / phụ đề / bộ lọc, tắt tiếng mic / máy, lật, xoay, ẩn / hiện webcam và con trỏ, phụ đề trên / dưới, dịch phụ đề sang ngôn ngữ khác, tạo chương, chia video ngắn.

## 1.6.0

- **Tất cả đoạn zoom** (tab Zoom): đặt một mức zoom cố định cho mọi đoạn, đổi kiểu zoom cho tất cả; nút **Áp dụng mức này cho tất cả** khi đang chọn một đoạn; menu chuột phải trên đoạn zoom.
- **Chỉnh zoom bằng Claude** (mục AI): mô tả cách muốn zoom hoặc chọn gợi ý sẵn, xem trước danh sách đề xuất rồi áp dụng.
- **Phụ đề**: **Tìm và thay thế** (phân biệt hoa thường, cả từ, cả trong bản dịch; tìm được cả phụ đề để dấu ở dạng tách rời, ký tự `$` trong chuỗi thay được giữ nguyên, thay cả dòng bằng rỗng thì bỏ dòng) và **Sửa phụ đề bằng Claude** (sửa chính tả & dấu câu, hoặc theo yêu cầu).

## 1.5.1

- **Biết AI đang làm gì**: huy hiệu trạng thái AI trên thanh tiêu đề trình chỉnh sửa và thanh trạng thái ở đầu bảng AI cho biết đang dùng gì (Ollama + model nào / Claude / whisper.cpp + Piper / ElevenLabs), sẵn sàng chưa (lý do cụ thể nếu chưa, kèm nút **Thiết lập** mở đúng mục), và việc AI nào đang chạy được bao lâu (tiến độ, hủy được). Tự kiểm tra lại khi đổi cài đặt hoặc key.
- **Bảng AI gọn hơn**: bốn nút làm ngay (**Tự động biên tập**, **Thêm phụ đề**, **Cắt lặng & từ thừa**, **Tiêu đề & mô tả**) ở trên, Đạo diễn AI ngay dưới; các công cụ ít dùng (tự biên tập tùy chọn, video ngắn, duyệt từng đoạn cắt) thu gọn trong "Công cụ khác".
- **Thiết lập AI trên máy một chạm** (Cài đặt → AI trên máy): một thẻ với danh sách kiểm tra 6 bước (Ollama, model, whisper.cpp, model Whisper, Piper, giọng) và nút **Thiết lập tất cả** tự làm các bước còn thiếu theo thứ tự với một thanh tiến độ, xong thì tự bật; hai công tắc đơn giản; chi tiết (model khác, địa chỉ Ollama, đo tốc độ) nằm trong "Nâng cao".

## 1.5.0

- **Giọng nói cục bộ, miễn phí** (Cài đặt → Giọng nói cục bộ): cài **whisper.cpp** và **Piper** ngay trong app (tải bộ chạy chính thức, giải nén, tải model / giọng với thanh tiến độ, xóa được). Khi bật, **phụ đề** (nhận dạng từng từ, tự nhận ngôn ngữ), cắt khoảng lặng / từ thừa theo lời thoại và **giọng đọc AI** (câu meme, kịch bản, "Đọc chữ này") chạy hoàn toàn trên máy, không cần key ElevenLabs; tắt thì dùng ElevenLabs như cũ. Model Whisper: small, medium-q5_0, large-v3-turbo-q5_0 (khuyên dùng cho tiếng Việt), large-v3-turbo. Giọng Piper: tiếng Việt (vais1000, 25hours, vivos) và tiếng Anh (lessac, amy, alan). Câu đã đọc vẫn được lưu đệm dùng chung.
- Cùng với AI cục bộ (Ollama) ở 1.3.0, toàn bộ tính năng AI của Lumora giờ chạy được trên máy mà không tốn phí.

## 1.4.0

- **Đạo diễn AI** (Thư viện → AI, thay cho Trợ lý AI): nói bạn muốn video thế nào, AI viết lại thành **kế hoạch** (cắt khoảng lặng / từ thừa, tự zoom, phụ đề và kiểu phụ đề, làm sạch âm thanh, tiêu đề, bộ lọc, tốc độ, khung hình, **hiệu ứng**, **chuyển cảnh**, **nhạc nền từ kho nhạc**, **xuất video** theo độ phân giải / định dạng, **chỉnh theo mẫu dự án khác**) rồi tự làm hết trong một bước hoàn tác; có yêu cầu xuất thì mở hộp thoại xuất và bắt đầu xuất luôn.
- **Hỏi lại khi thiếu thông tin**: AI hỏi tối đa hai câu (ví dụ kho nhạc trống, hay "làm cho hay" chưa rõ) và chờ bạn trả lời ngay trong cuộc trò chuyện; bật **Hỏi lại trước khi làm** để luôn xem kế hoạch rồi mới duyệt.
- **Lịch sử và trí nhớ**: mỗi dự án giữ lịch sử trò chuyện (AI nhớ ngữ cảnh lượt trước); câu "từ nay…" / "luôn…" được ghi thành **quy tắc lâu dài** (xem, quên được); app **học thói quen** từ cách bạn chỉnh (mẫu phụ đề, bộ lọc, khung hình, chuyển cảnh, hiệu ứng, âm lượng nhạc) và tự áp dụng khi lệnh không nói rõ.
- **Xem thử trước khi thêm** (như CapCut): rê chuột lên **hiệu ứng**, **bộ lọc**, **chuyển cảnh**, **meme / ảnh / GIF / video** trong kho, **nhãn dán**, **mẫu chữ** hay **kho online** là khung xem trước phát thử ngay một đoạn ngắn (lặp lại) mà chưa thêm gì vào dự án; bỏ chuột ra là trở lại chỗ cũ, bấm mới thêm thật. Nhạc trong kho có nút **▶ Nghe thử**.
- **Kéo giãn khung** như CapCut: kéo vạch giữa thư viện / khung xem trước / bảng thuộc tính và vạch trên timeline để đổi cỡ (nhớ cho lần sau; bấm đúp để về mặc định; mũi tên bàn phím khi vạch có tiêu điểm).
- Chạy được bằng **AI cục bộ (Ollama)**, Claude, hoặc chỉ từ khóa khi không có AI (huy hiệu ở góc cho biết đang dùng gì).
- AI cục bộ ổn định hơn: tự tách JSON khi model trả kèm chữ, thử lại một lần khi lỗi, cỡ ngữ cảnh theo độ dài lời thoại, giữ model nóng 15 phút, tìm từ thừa theo từng đoạn cho lời thoại dài, nút **Đo tốc độ** và gợi ý model theo máy.

## 1.3.1

- **Cài Ollama và tải model ngay trong app** (Cài đặt → AI cục bộ): nút **Cài Ollama** tự tải bộ cài chính thức rồi mở, nút **Tải model** tải model về Ollama với thanh tiến độ (không cần gõ lệnh). Ba bước ngay tại chỗ: Cài Ollama → Kiểm tra kết nối → Tải model.

## 1.3.0

- **Bố cục giống CapCut**: thanh tiêu đề chứa tên dự án và nút **Xuất**, nút cửa sổ kiểu Windows (thu nhỏ, phóng to, đóng) ở góc phải (macOS dùng nút hệ thống); hàng mục thư viện ngang với biểu tượng kèm nhãn; cột mục con bên trái (Của tôi / Video / Ảnh; Hiệu ứng / Meme / Nhạc / YouTube / Lồng tiếng / Kịch bản); bảng thuộc tính tab chữ; thanh "Xem trước"; timeline có nút **+** (mở thư viện) và **micro** (lồng tiếng); bảng màu xám than và màu nhấn xanh ngọc kiểu CapCut (đổi được trong Cài đặt).
- **Trợ lý AI** (Thư viện → AI): mô tả bằng lời ("cắt khoảng lặng, thêm phụ đề, bộ lọc điện ảnh, làm video dọc 9:16, tốc độ 1.5x, cắt 5 giây đầu…"), Claude hiểu thành các bước và app làm ngay; không có key thì hiểu theo từ khóa tiếng Việt / tiếng Anh. Hoàn tác một lần.
- **Chia nhỏ video thành video ngắn**: theo chương AI hoặc mỗi 60 / 90 / 120 giây, mỗi đoạn thành một dự án riêng (khung dọc 9:16 tuỳ chọn) để xuất cho TikTok, Shorts, Reels.
- **Nâng cao chất lượng (HD)** khi xuất: giảm nhiễu và làm nét.
- **AI cục bộ (Ollama)** (Cài đặt → AI cục bộ): bật để Trợ lý AI, cắt từ thừa / câu lặp, tóm tắt (tiêu đề, mô tả, chương) và dịch phụ đề chạy bằng model mở trên máy (qwen2.5, llama3.2, gemma3…), miễn phí, không cần key Claude và không gửi dữ liệu ra ngoài. Có nút kiểm tra kết nối và chọn model đã tải.
- Biểu tượng Hiệu ứng mới (ngôi sao đơn), bo góc vừa phải hơn, thẻ lọc vuông góc.

## 1.2.0

- **Cửa sổ không viền kiểu macOS**: thanh tiêu đề tự vẽ với nút đèn giao thông (đóng / thu nhỏ / phóng to), kéo để dời, bấm đúp để phóng to; trên macOS dùng nút hệ thống.
- **AI tự biên tập** (Thư viện → AI): một bấm cắt khoảng lặng (theo lời thoại, hoặc theo dạng sóng khi không có key nhận dạng), bỏ từ thừa / câu lặp (Claude, hoặc danh sách từ đệm có sẵn), tự zoom theo chuột, thêm phụ đề, làm sạch âm thanh (lọc tạp âm, tăng cường giọng, chuẩn hóa) và tiêu đề mở đầu; chọn từng bước, xem kết quả từng bước; hoàn tác một lần để quay lại.
- **Nhạc nền từ Thư viện âm thanh YouTube** (Thư viện → Âm thanh → YouTube): mở Thư viện âm thanh (YouTube Studio, nhạc miễn phí bản quyền), bài vừa tải về tự hiện trong app, một bấm để đưa vào **kho nhạc của tôi** và đặt lên timeline; kho nhạc dùng lại ở mọi dự án, nhận cả file nhạc trên máy (chọn hoặc kéo thả), có tìm kiếm.

## 1.1.0

- **Giao diện phong cách Apple** (macOS / Liquid Glass): chữ hệ thống, xám trung tính và màu hệ thống của Apple cho cả giao diện tối lẫn sáng; bo góc đồng tâm lớn; nút viên thuốc, segmented control, công tắc và thanh trượt kiểu macOS; sidebar, thanh công cụ, thanh phát, menu chuột phải, chú thích, thông báo và hộp thoại là **kính mờ** (blur + bán trong suốt); thanh cuộn mảnh; tiêu đề trang cỡ lớn.
- **Màu chủ đạo** đổi sang bộ màu hệ thống macOS (xanh dương, tím, hồng, đỏ, cam, vàng, xanh lá, than chì); mặc định xanh dương Apple.
- Cài đặt mới **Giảm trong suốt**: thanh công cụ, menu và hộp thoại dùng màu đặc thay vì kính mờ (nhẹ hơn cho máy yếu).

## 1.0.1

- **Bỏ kho meme Tenor**: Google đã khai tử Tenor API ngày 30/6/2026 nên app không còn ô key Tenor, nguồn Meme và Sticker động; kho **Pixabay** (video, ảnh miễn phí) giữ nguyên. Meme đã tải trước đó vẫn nằm trong thư viện của bạn.
- Mục **Meme** đổi thành **Phương tiện** như CapCut: nút **Nhập video** (chọn video trên máy để chỉnh sửa, nối vào hàng Video làm clip chính) và **Nhập ảnh** (ảnh / GIF vào thư viện của tôi).
- **Dạng sóng âm thanh giống CapCut**: vùng tô liền, đối xứng qua trục giữa và được làm mượt thay vì các cột rời; dải sóng trong clip video nền tối với sóng xanh nhạt; đoạn âm thanh là khối màu đặc với sóng trắng.
- **Giao diện giống CapCut hơn**: cột mục thư viện có biểu tượng kèm nhãn; bảng màu tối chuyển sang xám than trung tính (không ám xanh).

## 1.0.0

- Hoàn tất lộ trình kiểu CapCut (ROADMAP Bước 1–6): giao diện biểu tượng, kho meme, âm thanh và lọc tạp âm, bộ lọc / keyframe / mặt nạ / xóa phông AI, chữ / phụ đề / giọng AI, timeline chuyên nghiệp, nhập video ngoài, việc nền, lịch sử, ổn định.
- Cài đặt trình chỉnh sửa có kiểm thử tự động đầu-cuối (mẫu TikTok, xem trước nhẹ); đo hiệu năng xem trước ghi trong README.
- 46 bài kiểm thử đầu-cuối chạy trên Windows (CI) và Linux, cả ở màn hình nhỏ 1024×768.
- Bản cài 0.9.0 và 0.9.1 không được phát hành (kiểm thử trên Windows phát hiện lỗi bố cục màn hình nhỏ); mọi thay đổi của hai bản đó có trong 1.0.0.

## 0.9.1

- **Ổn định**: phát hiện app tắt đột ngột khi đang chỉnh sửa (file khóa phiên) và báo đã mở lại bản tự lưu; lỗi của giao diện được ghi vào `main.log`; kiểm tra tự động không rò rỉ bộ nhớ khi mở / đóng trình chỉnh sửa nhiều lần.
- **Tỉ lệ xem trước** Vừa khung / 25–200 % (cuộn được khi phóng to).
- **Trợ năng**: viền nổi bật khi điều hướng bằng phím Tab.
- **Màn hình nhỏ** (1024×768): thanh điều khiển dưới khung xem trước tự xuống dòng thay vì bị bảng bên phải che, hai bảng bên hẹp lại.
- Nhật ký thay đổi này và hướng dẫn sử dụng có ảnh trong README.

## 0.9.0

- Nút **Việc đang làm** (xuất, nhập video, ghép bản quay, kịch bản AI, phụ đề) có tiến độ và hủy; thông báo khi xong. Xuất dùng bản chụp nên vẫn chỉnh sửa được trong lúc xuất.
- **Lịch sử chỉnh sửa** có tên từng bước, bấm để quay về / tới; chú thích nút Hoàn tác ghi rõ bước.
- **Đường gióng** chia ba và vùng an toàn TikTok; xem trước tự hạ xuống 540p khi máy chậm.
- **Hướng dẫn lần đầu** 5 bước, bảng **phím tắt** (phím ?).
- Đổi tên, nhân đôi dự án; **mẫu cho bản quay mới** (16:9, 9:16 TikTok, 1:1).

## 0.8.1

- **Nhập video từ máy làm clip chính**, **ghép bản quay khác** vào cuối.
- **Kéo thả** thẻ thư viện vào timeline; kéo file video / ảnh từ Explorer vào timeline.
- Ảnh khung hình khi rê chuột trên clip; **tách âm thanh clip chính**.

## 0.8.0

- **Chọn nhiều** (Ctrl/Shift+click, kéo khung, Ctrl+A), **sao chép / cắt / dán / nhân đôi**, **xóa dồn**, **hít dính**.
- Nút **ẩn / tắt tiếng / khóa** từng hàng timeline; **marker** và **chương YouTube**; **menu chuột phải**.

## 0.7.1

- **8 mẫu phụ đề** (Hộp tối, Karaoke, Viền đen, Nảy từng từ, Bật từng từ, Gạch chân, Neon, TikTok), phông, màu nhấn, số từ mỗi lần, vị trí.
- **Dịch phụ đề** 10 ngôn ngữ (thay thế hoặc song ngữ); tách / gộp dòng; hàng **Phụ đề** trên timeline.
- Tốc độ và độ ổn định của giọng AI.

## 0.7.0

- **24 mẫu chữ**, **10 phông tiếng Việt** đi kèm, viền / bóng / nền / chuyển màu, 5 hiệu ứng chữ.
- **Hình vẽ sẵn** (mũi tên, khoanh tròn, con trỏ…); **Đọc chữ này** và **kịch bản giọng AI**.

## 0.6.x

- 0.6.3: **Xóa phông AI** cho webcam (xóa / làm mờ / thay màu) và cho ảnh / video meme.
- 0.6.2: **đường cong tốc độ**, **phát ngược**, độ mờ clip.
- 0.6.1: **keyframe**, hoạt ảnh vào / ra / lặp, chế độ hòa trộn, mặt nạ.
- 0.6.0: **bộ lọc màu**, điều chỉnh, cắt / lật / xoay, **đóng băng khung hình**.

## 0.5.0

- **Lọc tạp âm AI** (RNNoise), tăng cường giọng, hiệu ứng giọng; **lồng tiếng**; tách âm thanh video meme; vạch nhịp nhạc.

## 0.4.0

- Giao diện chỉ dùng biểu tượng, **kho meme online** (Tenor, Pixabay), âm thanh meme, giọng đọc AI.

## 0.1 – 0.3

- Quay màn hình / webcam / micro, tự động zoom theo chuột, trình chỉnh sửa và xuất MP4 / GIF, phụ đề AI, tự biên tập bằng Claude, livestream nhiều nền tảng, chia sẻ dự án, nhạc nền, chuyển cảnh, hiệu ứng, chữ và sticker, video meme, bố cục kiểu CapCut.
