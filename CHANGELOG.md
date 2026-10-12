# Nhật ký thay đổi

Các phiên bản Lumora (bản cài Windows ở trang Releases của kho mã; app tự cập nhật).

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
