# Lumora — Lộ trình v0.4 → v1.0: clone trình chỉnh sửa CapCut

Tài liệu này là **hướng dẫn thi công cho A.I** (Claude Code hoặc tương đương) làm từng bước. Mỗi bước là một bản phát hành riêng, có đủ: mục tiêu, thiết kế giao diện, mô hình dữ liệu, cách làm ở từng tầng, test bắt buộc và tiêu chí nghiệm thu. Làm **đúng thứ tự**, xong bước nào phát hành bước đó.

---

## 0. Cách làm việc (đọc trước khi bắt đầu bất kỳ bước nào)

### 0.1 Quy trình bắt buộc cho mỗi bước

1. Đọc `README.md`, `PLAN.md`, tài liệu này và mục **1. Hiện trạng** để biết code nằm ở đâu.
2. Làm trên nhánh được giao (hiện tại: `claude/peaceful-hopper-tpbpf2`). Không tạo pull request nếu không được yêu cầu.
3. Viết code theo đúng quy ước mục 0.2. **Mọi tính năng phải có test** (mục 0.3).
4. Trước khi commit: `pnpm -s check` (format + lint + typecheck + unit test) phải xanh, rồi chạy **toàn bộ E2E**:
   ```bash
   cd apps/desktop && xvfb-run -a -s "-screen 0 1920x1080x24" npx playwright test --reporter=line
   ```
5. Cập nhật `README.md` (mục tính năng), cập nhật cả hai file ngôn ngữ `vi.ts` và `en.ts`.
6. Tăng `version` trong `apps/desktop/package.json` theo số ghi ở từng bước, commit với thông điệp rõ ràng (tiếng Anh, có chân trang Co-Authored-By theo hướng dẫn của phiên; **không ghi tên model** vào commit, code hay tài liệu).
7. Push, rồi phát hành: dispatch workflow `release.yml` trên nhánh (qua GitHub API / MCP `actions_run_trigger`), **kiểm tra `head_sha` của run đúng commit vừa push**, chờ run xong và xác nhận release có đủ 3 file: `latest.yml`, `Lumora-Setup-x.y.z.exe`, `.blockmap`. Không push tag thủ công (bị chặn 403).
8. Báo cáo cho người dùng **bằng tiếng Việt**, ngắn gọn: làm được gì, test thế nào, phiên bản nào.

### 0.2 Quy ước code

- Monorepo pnpm: `packages/core` (logic thuần, không phụ thuộc Electron/DOM), `apps/desktop` (Electron 44 + electron-vite + React 19 + Tailwind v4 + zustand + i18next).
- Logic tính toán (bố cục, thời gian, parse, nội suy, xử lý điểm ảnh) đặt ở `packages/core` để test không cần trình duyệt.
- Comment bằng **tiếng Việt**, giải thích "vì sao" chứ không lặp lại code.
- Mọi dữ liệu đọc từ file/IPC/mạng phải qua hàm `parse…()` kiểm tra kiểu và kẹp giá trị; dữ liệu sai thì về mặc định, không ném lỗi làm hỏng dự án.
- Tên file trong dự án chỉ được dạng `^[\w.-]+$` (chống đường dẫn `..`). Mọi file tải/nhập vào đều chép vào thư mục dự án (`asset-*.ext`) để chia sẻ `.lumorapack` vẫn đủ.
- Lỗi IPC dùng mã ngắn (`image_unsupported`, `video_unreadable`, `audio_unreadable`, `net_offline`, `key_missing`, `key_invalid`, `quota`…) và giao diện dịch qua i18n `…errors.<code>`; `generic` cho mã lạ.
- API key lưu trong `SecretStore` (đã có cho ElevenLabs, Anthropic), nhập ở trang Cài đặt, bị che trong log.
- Xem trước và xuất phải **dùng chung hàm vẽ** (`computeScene` + `drawScene`) để "thấy sao xuất vậy".
- Không đóng gói nội dung có bản quyền (meme, nhạc, font không phải OFL). Chỉ bundle font giấy phép OFL/Apache, model AI giấy phép Apache/BSD, ghi rõ nguồn trong `THIRD_PARTY.md`.

### 0.3 Test bắt buộc (4 tầng)

| Tầng     | Công cụ                                      | Yêu cầu                                                                                                                                                                                                     |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core     | vitest                                       | Mọi hàm mới có test; parse có test giá trị sai.                                                                                                                                                             |
| main     | vitest, **FFmpeg thật**                      | Mọi lệnh FFmpeg mới phải chạy thật trên file tổng hợp (lavfi) và đo kết quả (volumedetect, signalstats, probe).                                                                                             |
| renderer | vitest + Testing Library, `test/fake-api.ts` | Mọi panel/nút mới có test tương tác; cập nhật `fake-api.ts` khi thêm API.                                                                                                                                   |
| E2E      | Playwright + app thật dưới xvfb              | Mỗi bước có ít nhất 1–2 bài E2E đi hết luồng: thao tác UI → xuất video → đo pixel/âm thanh bằng FFmpeg. Dịch vụ mạng được **mock bằng HTTP server cục bộ** (xem `e2e/mock-ai.ts`), không gọi Internet thật. |

Giữ nguyên các `data-testid` đã có (xem danh sách trong `e2e/*.spec.ts`); đổi tên thì phải sửa test tương ứng. Thêm `data-testid` cho mọi phần tử tương tác mới.

### 0.4 Tiêu chí hoàn thành chung của một bước

- `pnpm -s check` xanh, toàn bộ E2E xanh (hiện 27 bài), không có `console.error` trong app khi chạy E2E (`errors` phải rỗng).
- Tính năng hoạt động ở cả xem trước và video xuất; hoạt động với dự án cũ (parse tương thích ngược).
- Có i18n vi/en, README cập nhật, release lên GitHub thành công.

---

## 1. Hiện trạng v0.3.0 (bản đồ code)

**packages/core/src/edit/**: `edit-state.ts` (EditState, parse), `layout.ts` (tỉ lệ, cameraRect, placementAt), `reframe.ts` (fill 9:16, cameraCrop), `zoom.ts`, `cursor.ts`, `timeline.ts` (clip, split, trim), `audio-clips.ts`, `transitions.ts`, `effects.ts`, `overlays.ts` (text/emoji/image/video, dragOverlay, overlayAudioClips), `chroma.ts` (xóa phông trên RGBA), `beauty.ts`, `captions.ts`, `waveform.ts`, `filmstrip.ts`.

**apps/desktop/src/main/**: `index.ts` (khởi tạo, dialog, MemeLibrary, IPC), `ipc.ts` (handler + kiểm tra tham số), `ffmpeg/{runner,args,parse,binary}.ts`, `export/manager.ts` (ghép âm thanh bằng FFmpeg sau khi renderer dựng hình), `projects/{library,share,assets,images,waveform,filmstrip,media-protocol}.ts`, `ai/service.ts` (ElevenLabs STT, Claude), `updater.ts`, `logger.ts`, `secrets.ts`, `settings.ts`.

**apps/desktop/src/renderer/src/**:

- `pages/EditorPage.tsx`: khung trình chỉnh sửa (header + 3 cột + timeline + hộp thoại Xuất).
- `editor/MediaBrowser.tsx` (thư viện trái: media/audio/text/stickers/effects/transitions/captions/ai), `editor/PropertiesPanel.tsx` (bảng phải), `editor/ProjectProps.tsx` (cài đặt chung), `editor/ItemProps.tsx` (thuộc tính mục đang chọn), `editor/ui.tsx` (Section, SliderRow, Toggle, Segmented, nút), `editor/PreviewCanvas.tsx` (chọn/kéo/đổi cỡ/xoay trên khung), `editor/Timeline.tsx` + `{Audio,Effect,Overlay}Track.tsx` (hàng con tự xếp), `editor/store.ts` (zustand: edit, selection, undo/redo, hành động), `editor/{scene,draw,effects-draw,overlay-draw,overlay-images,preview,exporter}.ts`.
- `components/` (Sidebar thu gọn khi ở editor, UpdateBanner, CameraPreview, MicMeter…), `pages/SettingsPage.tsx`, `i18n/locales/{vi,en}.ts`, `test/fake-api.ts`.

**apps/desktop/src/shared/ipc.ts**: hợp đồng IPC (`LumoraApi`, kiểu dữ liệu), **preload/index.ts**: cầu nối.

**E2E** `apps/desktop/e2e/`: `fixtures.ts` (tạo dự án mẫu bằng FFmpeg: màn hình testsrc2, webcam testsrc, mic sine 440 Hz, sự kiện chuột), `helpers.ts` (launchApp, probeMedia), `mock-ai.ts` (mock ElevenLabs/Claude), các spec.

---

## 2. Thiết kế giao diện đích (áp dụng dần từ Bước 1, hoàn thiện ở Bước 6)

### 2.1 Bố cục màn hình chỉnh sửa (giống CapCut desktop)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Lumora] ‹ Dự án   Tên dự án            Đã lưu ✓   [Công việc ⟳] [Xuất ▾]    │  48px
├───────┬──────────────────────┬────────────────────────────┬──────────────────┤
│ Rail  │ Thư viện (nội dung)  │ Khung xem trước            │ Thuộc tính       │
│ 48px  │ 300–380px (kéo được) │ (co giãn)                  │ 320px (kéo được) │
│ icon  │                      │                            │ tab icon         │
│ only  │                      │   [canvas 16:9 / 9:16]     │                  │
│       │                      │                            │                  │
│       │                      ├────────────────────────────┤                  │
│       │                      │ 0:00.0 / 0:04.0  ⏮ ◀ ▶ ▶ ⏭  16:9 ▾ ⛶      │  44px
├───────┴──────────────────────┴────────────────────────────┴──────────────────┤
│ ═══ (kéo đổi chiều cao) ═══                                                   │
│ Thanh công cụ timeline: ↶ ↷ │ ✂ ⇤ ⇥ 🗑 │ 🧲 ⚑ │ ── zoom ── ⊕                │  40px
│ Đầu hàng 104px │ Thước thời gian                                              │
│ Hiệu ứng       │ ▭▭▭                                                          │
│ Lớp phủ        │ ▭▭▭▭▭  (nhiều hàng con khi trùng giờ)                        │
│ Zoom           │   ▭▭▭▭                                                       │
│ Video          │ [■■■■■ filmstrip + sóng ■■■■■] ◆ [■■■■]                      │
│ Âm thanh       │ ▭▭▭▭  ▭▭                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Thanh điều hướng app (Quay / Dự án / Chỉnh sửa / Livestream / Cài đặt) thu gọn thành cột icon 56px khi ở trình chỉnh sửa (đã có).
- Ba cột và timeline đều **kéo đổi kích thước** được, nhớ trong `localStorage` (`lumora.layout`).
- Tối thiểu hỗ trợ cửa sổ 1280×720; dưới 1366px rộng thì cột thư viện tự thu còn 280px.

### 2.2 Hệ thống thiết kế (design tokens) — `styles.css`

- Màu: giữ các biến `--lm-bg`, `--lm-surface`, `--lm-surface-2`, `--lm-border`, `--lm-text`, `--lm-muted`, `--lm-accent` (mặc định `#2563eb`), `--lm-accent-fg`, `--lm-success`, `--lm-danger`. Thêm `--lm-warning: #f59e0b`, `--lm-surface-3: #242433` (hover/active), `--lm-overlay: rgba(0,0,0,.6)` (nền hộp thoại).
- Màu hàng timeline: Video `accent`, Lớp phủ: chữ `amber-500`, nhãn dán `pink-500`, ảnh `teal-500`, video meme `violet-500`; Hiệu ứng `fuchsia-500`; Zoom `amber-400`; Âm thanh: nhạc `emerald-500`, SFX `sky-500`, lồng tiếng `orange-500`.
- Chữ: `Segoe UI Variable`/`Inter`; cỡ 11px (nhãn phụ), 12px (điều khiển), 13px (nội dung), 14px (tiêu đề panel), 11px chữ hoa cách chữ 0.05em cho tiêu đề mục (`Section`).
- Khoảng cách: lưới 4px; padding panel 16px; khoảng giữa các mục 12px; bo góc 6px (nút), 8px (thẻ), 12px (hộp thoại).
- Chuyển động: 150ms ease-out cho hover/active; 200ms cho mở/đóng panel; không animation khi `prefers-reduced-motion`.
- Icon: **lucide-react** duy nhất. Cỡ 16px trong nút, 18px tab, 20px rail. `strokeWidth` 1.75. Không dùng emoji làm icon chức năng (emoji chỉ là nội dung sticker).

### 2.3 Thành phần dùng chung (`editor/ui.tsx` + `components/`)

| Thành phần          | Yêu cầu                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Tooltip`           | Hiện sau 350ms rê chuột, vị trí tự lật khi sát mép, nội dung = nhãn + phím tắt (mờ). Dùng `aria-label` trên nút để test. Mọi nút chỉ-icon **bắt buộc** có tooltip. |
| `IconButton`        | 32×32, icon 16px, trạng thái hover/active/disabled/pressed (`aria-pressed`).                                                                                       |
| `Rail` / `IconTabs` | Cột/hàng tab chỉ icon, chỉ báo active bằng nền `accent/15` + icon màu accent (rail) hoặc gạch dưới 2px (tab ngang).                                                |
| `SliderRow`         | Nhãn + thanh trượt + **ô nhập số** (gõ Enter/mất focus mới áp dụng, mũi tên ±step, Shift ±10×), nút reset khi khác mặc định, nút keyframe ◇ (Bước 3).              |
| `Segmented`         | Nhóm chọn một; hỗ trợ icon-only với tooltip.                                                                                                                       |
| `Section`           | Tiêu đề chữ hoa nhỏ, có thể thu gọn (nhớ trạng thái), hành động bên phải.                                                                                          |
| `Dialog`            | Modal có tiêu đề, nút đóng, Esc để đóng, khóa phím tắt editor khi mở, focus trap.                                                                                  |
| `ContextMenu`       | Menu chuột phải cho clip/lớp/khoảng trống; mục có icon + phím tắt.                                                                                                 |
| `Toast`             | Góc dưới phải, tự ẩn 4s, loại info/success/error, có nút hành động (ví dụ "Mở thư mục").                                                                           |
| `JobsPopover`       | Danh sách công việc nền (tải meme, lọc tạp âm, TTS, xuất) với tiến độ và hủy.                                                                                      |
| `EmptyState`        | Icon + tiêu đề + mô tả + nút hành động.                                                                                                                            |
| `SearchBox`         | Ô tìm có icon, xóa nhanh, Enter để tìm, debounce 300ms.                                                                                                            |

### 2.4 Thư viện trái (rail icon-only, tooltip)

Thứ tự và icon: Media `Clapperboard` · Âm thanh `Music2` · Văn bản `Type` · Nhãn dán `Smile` · Hiệu ứng `Sparkles` · Bộ lọc `Palette` (Bước 3) · Chuyển cảnh `ArrowLeftRight` · Phụ đề `Captions` · AI `WandSparkles`.

Mỗi mục có: thanh phụ (segmented) chọn nguồn "Của tôi / Kho online", ô tìm kiếm, lưới thẻ (thumbnail tỉ lệ 16:9 hoặc vuông), **rê chuột là phát thử**, nút `+` khi hover để thêm tại đầu phát, **kéo thả thẻ vào timeline** (Bước 5). Thẻ có nhãn ngắn ở dưới (vẫn giữ nhãn cho nội dung, chỉ bỏ nhãn ở **icon chức năng**).

### 2.5 Bảng thuộc tính phải

- Không chọn gì → **Cài đặt video**: tab icon Khung `Frame` · Webcam `Video` · Con trỏ `MousePointer2` · Chuyển động `Move` · Zoom `ZoomIn` · Âm lượng `Volume2`.
- Chọn clip video → tab: Video `Film` · Âm thanh `AudioLines` · Tốc độ `Gauge` · Hoạt ảnh `Orbit` · Điều chỉnh `SlidersHorizontal`.
- Chọn lớp phủ (chữ/sticker/ảnh/video meme) → tab: Cơ bản `Move` (vị trí, cỡ, xoay, độ mờ, hòa trộn, lật) · Mặt nạ `Shapes` · Hoạt ảnh `Orbit` · Âm thanh (video) · Xóa phông `Scissors`/`Eraser` · Điều chỉnh.
- Chọn đoạn âm thanh → Cơ bản (âm lượng, fade, lặp) · Lọc tạp âm & giọng `AudioWaveform` · Tốc độ.
- Chọn chuyển cảnh / hiệu ứng / zoom: như hiện tại, dùng `Section`.
- Tiêu đề panel: tên mục + nút xóa `Trash2` + nút quay lại `ArrowLeft`.

### 2.6 Khung xem trước

- Nền `#050507`, canvas có bóng. Chọn mục: khung chọn màu accent, 4 nút góc đổi cỡ, nút tròn trên để xoay, **nút giữa cạnh** để co một chiều (cắt khung cho clip/ảnh).
- Thanh phát: timecode (mono, tabular), ⏮ ◀ ▶ ▶ ⏭, chọn tỉ lệ, nút lưới an toàn `Grid3x3` (Bước 6), toàn màn hình.
- Phím: Space phát, J/K/L tua lùi/dừng/tua tới (Bước 5), ←/→ 1 khung (Shift: 1 giây), Home/End.

### 2.7 Timeline

- Thanh công cụ: Hoàn tác/Làm lại · Tách `Scissors` · Xóa trái `ArrowLeftToLine` · Xóa phải `ArrowRightToLine` · Xóa `Trash2` · Hít dính `Magnet` (bật/tắt) · Đánh dấu `Flag` · Thêm zoom `Search` · Thu phóng (−, thanh trượt, +) · Vừa khung `Maximize`.
- Đầu hàng: icon + tên, nút ẩn `Eye`, tắt tiếng `Volume2`, khóa `Lock` (Bước 5).
- Thước: nhãn thời gian, vạch phụ; đầu phát trắng kéo được; vùng chọn (marquee) khi kéo trên chỗ trống (Bước 5).
- Khối: viền trắng khi chọn, tay nắm 6px hai mép, nhãn có icon loại, hình thoi keyframe ◇ (Bước 3), ◆ chuyển cảnh ở chỗ nối.
- Ctrl+lăn: thu phóng quanh con trỏ; Shift+lăn / lăn ngang: cuộn; Alt+kéo trên thước: xem trước nhanh.

### 2.8 Phím tắt đầy đủ (hiện ở hộp thoại `?` và tooltip)

| Phím                           | Hành động                                          |
| ------------------------------ | -------------------------------------------------- |
| Space                          | Phát / dừng                                        |
| J / K / L                      | Tua lùi / dừng / tua tới (nhấn nhiều lần tăng tốc) |
| ← / → (Shift)                  | Lùi/tới 1 khung (1 giây)                           |
| Home / End                     | Về đầu / cuối                                      |
| S                              | Tách tại đầu phát                                  |
| A / D                          | Xóa phần bên trái / phải đầu phát                  |
| Delete / Backspace             | Xóa mục đang chọn                                  |
| Shift+Delete                   | Xóa dồn (ripple)                                   |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Hoàn tác / làm lại                                 |
| Ctrl+C / Ctrl+V / Ctrl+D       | Sao chép / dán / nhân đôi                          |
| Ctrl+A                         | Chọn tất cả trên hàng đang chọn                    |
| M                              | Thêm đánh dấu                                      |
| N                              | Bật/tắt hít dính                                   |
| Ctrl+E                         | Mở hộp thoại Xuất                                  |
| Ctrl+K                         | Thêm keyframe cho thuộc tính đang rê               |
| Esc                            | Bỏ chọn / đóng hộp thoại                           |
| ?                              | Bảng phím tắt                                      |

---

## 3. Lộ trình chi tiết

### Bước 1 — v0.4.0: Giao diện icon chuyên nghiệp + kho nội dung online

**Mục tiêu**: bỏ chữ dưới icon chức năng, bảng thuộc tính chia tab kiểu CapCut, tìm và tải meme/stock ngay trong app, meme sound.

#### 1.1 Giao diện

- Tạo `components/Tooltip.tsx` (mục 2.3). Áp dụng cho: rail thư viện, tab bảng phải, thanh công cụ timeline, thanh phát, nút góc khung, nút trong thẻ.
- Rail thư viện thành 48px icon-only (`MediaBrowser.tsx`), tab bảng phải icon-only (`PropertiesPanel.tsx`), thanh công cụ timeline icon-only (nút "Tách" cũng chỉ icon).
- `SliderRow` thêm ô nhập số và nút reset về mặc định (truyền `defaultValue`).
- Bảng thuộc tính clip video chia tab: **Video** (tốc độ cố định, lật ngang/dọc, xoay 90°, độ mờ, tắt tiếng — các trường mới thuộc Bước 3 nhưng đặt sẵn tab; ở bước này tab Video chỉ có tốc độ + tách), **Âm thanh** (âm lượng clip: mic/system riêng cho clip này — thêm `Clip.audio?: { mic: number; system: number; muted: boolean }` ghi đè mức chung), **Tốc độ** (thanh trượt 0.25–8× + preset), còn Hoạt ảnh/Điều chỉnh hiện "Sắp có" và được điền ở Bước 3.
- Thanh điều hướng app: khi ở editor chỉ icon (đã có), thêm tooltip.
- Trang Cài đặt: thẻ **Kho nội dung** với 2 ô key: Tenor, Pixabay (dùng `ApiKeyCard` như ElevenLabs), nút kiểm tra key (gọi 1 request thử qua main), trạng thái ✓/✗. Thêm thẻ **Bộ nhớ đệm**: hiện dung lượng `userData/cache`, nút xóa.

#### 1.2 Kho online (main process)

- Thêm `main/content/online.ts`:
  ```ts
  export type OnlineKind = 'gif' | 'video' | 'image' | 'sticker'
  export interface OnlineItem {
    id: string
    source: 'tenor' | 'pixabay'
    kind: OnlineKind
    title: string
    thumbUrl: string
    previewUrl: string // mp4/gif nhỏ để phát thử
    downloadUrl: string
    width: number
    height: number
    durationMs: number
  }
  export interface OnlineSearch {
    items: OnlineItem[]
    next: string | null
    attribution: string
  }
  ```
- `main/content/tenor.ts`: `search({ q, kind: 'gif'|'sticker', next })` → `GET https://tenor.googleapis.com/v2/search?q=&key=&client_key=lumora&limit=24&pos=&media_filter=gif,tinygif,mp4,tinymp4&contentfilter=medium&locale=vi_VN` (`searchfilter=sticker` cho sticker trong suốt); `trending()` → `/v2/featured`. `downloadUrl` = `media_formats.mp4.url` (ưu tiên) hoặc `gif.url`. **Bắt buộc** hiện "Powered by Tenor" trong UI (điều khoản Tenor).
- `main/content/pixabay.ts`: video `GET https://pixabay.com/api/videos/?key=&q=&per_page=24&page=&safesearch=true` (dùng `videos.small.url` tải, `videos.tiny.url` phát thử, thumbnail từ `videos.tiny.thumbnail`); ảnh `GET https://pixabay.com/api/?key=&q=&image_type=photo&per_page=24` (`webformatURL` tải, `previewURL` thumb). Hiện "Ảnh/video từ Pixabay".
- Gọi mạng bằng `fetch` của Node trong main (renderer không gọi trực tiếp: CORS + giấu key). Timeout 15s, cache kết quả 10 phút theo `(source,q,next)`, lỗi mạng → `net_offline`, 401/403 → `key_invalid`, 429 → `quota`.
- Tải về: `download(item)` → tải vào `cache/dl-<id>.<ext>` rồi `MemeLibrary.add([path])` (đã chuẩn hóa video sang MP4, ảnh giữ nguyên, GIF giữ nguyên) và ghi thêm `origin: { source, id, url }` vào bản ghi meme; xóa file tạm. Tiến độ gửi qua event `jobs:progress`.
- IPC mới trong `shared/ipc.ts`: `onlineSearch(source, params)`, `onlineTrending(source, kind)`, `onlineDownload(item)`, `contentKeyCheck(name)`, `cacheSize()`, `cacheClear()`. Kiểm tra tham số ở `ipc.ts` (chuỗi, độ dài ≤ 100, kind thuộc danh sách).

#### 1.3 Kho online (renderer)

- Tab **Media**: segmented "Của tôi | Meme | Kho video | Ảnh". Ô tìm, chip gợi ý ("bruh", "green screen", "mèo", "cười", "khóc", "wow", "fail", "dance"). Lưới 2 cột, thẻ rê chuột là phát `previewUrl` (video muted loop; GIF dùng `<img>`); nút tải `Download` khi hover, thẻ đã tải có dấu ✓ và bấm là thêm vào timeline luôn; cuộn tới cuối tự tải trang tiếp (`next`). Chưa có key → `EmptyState` với nút "Nhập key trong Cài đặt".
- Tab **Nhãn dán**: thêm nguồn "Sticker Tenor" (GIF trong suốt), thêm vào dự án như ảnh GIF (`kind: 'image'`).
- Mọi thứ tải xong vào **Thư viện của tôi** (offline). Thẻ hiện nhãn nguồn nhỏ (Tenor/Pixabay).

#### 1.4 Meme sound

- Mở rộng `projects/assets.ts` SOUND_EFFECTS tự tổng hợp: `vineBoom` (sine 55 Hz + sub, decay 1.2s, thêm `aecho`), `failBuzzer` (sóng vuông 150 Hz 0.6s), `recordScratch` (noise + `asetrate` sweep), `airhorn` (sawtooth 440→392 Hz, 1.2s), `drumroll` (xung lặp 60ms, 2s, tăng dần), `cashRegister` (tiếng ting + click), `crickets` (chirp 4 kHz lặp), `boing` (sweep 300→1200→300 Hz), `swooshUp`, `heartbeat`. Mỗi cái test bằng FFmpeg thật (thời lượng và có âm).
- **Giọng meme (TTS)** trong tab Âm thanh, mục "Meme sound": 12 câu sẵn ("Bruh", "Ối dồi ôi", "Hết cứu", "Ủa alo", "Đỉnh nóc", "Wait for it", "Plot twist", "No way", "Bruh moment", "Oh no", "Let's go", "Chấm hết") + ô nhập câu tự do + chọn giọng (danh sách từ ElevenLabs `/v1/voices`, lọc 6 giọng sẵn). Gọi `/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128` với `model_id: eleven_multilingual_v2`; cache theo hash(text, voice) ở `userData/sounds`. Thêm vào timeline như SFX (`kind: 'sfx'`). Thêm ở `ai/service.ts` hàm `speak(text, voiceId)` + handler IPC `aiSpeak`. Cần key ElevenLabs; không có → `key_missing`.

#### 1.5 Test

- core: không đổi nhiều; parse `Clip.audio`.
- main: `content/tenor.test.ts`, `pixabay.test.ts` với `fetch` giả trả JSON mẫu (đặt file fixture JSON thật rút gọn), kiểm tra chuẩn hóa `OnlineItem`, mã lỗi 401/429/timeout; `download` thật từ HTTP server cục bộ phục vụ file MP4 tổng hợp → vào MemeLibrary với `origin`. SFX mới chạy FFmpeg thật. `aiSpeak` với mock server trả mp3 (dùng FFmpeg tạo) → file cache, gọi lần 2 không gọi mạng.
- renderer: Tooltip (hiện sau delay, có phím tắt), SliderRow nhập số/Enter/reset, MediaBrowser tìm kiếm → lưới → tải → "đã tải" → thêm; trạng thái không key; tab Settings key check.
- E2E (`e2e/content.spec.ts`): mock server Tenor + Pixabay (trả JSON trỏ tới file trên chính mock server), nhập key giả ở Cài đặt, tìm "bruh", tải, thêm vào timeline, xóa phông, xuất, kiểm tra pixel như test meme hiện có. Kiểm tra `aria-label` tồn tại trên mọi nút chỉ icon trong editor (duyệt DOM: mọi `button` không có text phải có `aria-label`).

**Nghiệm thu**: không còn chữ dưới icon chức năng; tooltip cho mọi icon; tìm/tải meme Tenor và video Pixabay hoạt động với key; meme sound bằng TTS; 10 SFX mới; E2E 29+ bài xanh. Phát hành **v0.4.0**.

---

### Bước 2 — v0.5.0: Âm thanh như CapCut

**Mục tiêu**: lọc tạp âm, tăng cường giọng, chuẩn hóa, đổi giọng, lồng tiếng, tách tiếng, tắt tiếng.

#### 2.1 Mô hình dữ liệu (`core/edit/audio-fx.ts`)

```ts
export const NOISE_LEVELS = ['off', 'light', 'medium', 'strong'] as const
export const VOICE_FX = ['none', 'chipmunk', 'deep', 'robot', 'echo', 'radio', 'megaphone'] as const
export interface AudioFx {
  noise: NoiseLevel // lọc tạp âm
  enhance: boolean // tăng cường giọng nói (lọc rù 80Hz, khử xì, nén nhẹ)
  normalize: boolean // loudnorm -16 LUFS
  voice: VoiceFx
  pitch: number // -12..12 bán cung (chỉ khi voice = none)
  fadeIn: number
  fadeOut: number // ms, cho track micro/system toàn dự án
}
export const DEFAULT_AUDIO_FX: AudioFx
export function parseAudioFx(v: unknown): AudioFx
export function audioFxKey(fx: AudioFx): string // hash ổn định để đặt tên cache
export function needsAiDenoise(fx: AudioFx): boolean // mức vừa / mạnh cần RNNoise
export function audioFxFilters(fx: AudioFx, aiDone: boolean): string[] // chuỗi bộ lọc FFmpeg
```

- `EditState.audio` thành `{ mic: number; system: number; micFx: AudioFx; systemFx: AudioFx }`; `AudioClip` và `Overlay` (video) thêm `fx: AudioFx` (bỏ fadeIn/fadeOut trùng lặp? **Không**: giữ fade của AudioClip, trong `AudioFx` của clip chỉ dùng noise/enhance/normalize/voice/pitch).
- `Clip.audio.muted` (đã thêm ở Bước 1): clip tắt tiếng → `planAudio` bỏ đoạn đó.

#### 2.2 Xử lý (main) — `main/audio/process.ts`

- Bộ lọc FFmpeg (đã xác nhận có trong `ffmpeg-static`):
  - noise light: `afftdn=nf=-25:nt=w`; medium: RNNoise; strong: RNNoise rồi `afftdn=nf=-20:nt=w`.
  - **Không dùng bộ lọc `arnndn` của FFmpeg**: nó đọc lố mảng trên stack (hàm `dct` đọc 24 phần tử của mảng 22), trên Windows rác có thể là NaN nên kết quả lọc ngẫu nhiên (đã đo: cùng file lúc -50 dB lúc -34 dB). Thay bằng RNNoise WebAssembly (`resources/rnnoise/rnnoise.wasm`, bản dựng của `@jitsi/rnnoise-wasm`) chạy ở worker thread trong `main/audio/denoise.ts`: FFmpeg giải mã ra PCM f32 mono 48 kHz → RNNoise từng khung 480 mẫu (bù trễ 1 khung) → FFmpeg mã hóa kèm các bộ lọc còn lại.
  - enhance: `highpass=f=80,deesser=i=0.4,acompressor=threshold=-18dB:ratio=3:attack=5:release=60:makeup=2`.
  - normalize: `loudnorm=I=-16:TP=-1.5:LRA=11`.
  - voice chipmunk: `rubberband=pitch=1.5`; deep: `rubberband=pitch=0.7`; robot: `afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75`; echo: `aecho=0.8:0.88:60:0.4`; radio: `highpass=f=300,lowpass=f=3000,acompressor=ratio=4,volume=1.5`; megaphone: `highpass=f=500,lowpass=f=2500,acrusher=bits=8:mix=0.3,volume=1.4`; pitch n bán cung: `rubberband=pitch=2^(n/12)`.
- `processAudio(projectDir, file, fx)` → ghi `cache/<file>-<audioFxKey>.m4a` (AAC 160k, 48 kHz) nếu chưa có; trả đường dẫn. Chạy trong hàng đợi (tối đa 2 song song), báo tiến độ qua `jobs:progress` (đọc `-progress pipe:1` của FFmpeg). Hủy được. File cache cũ hơn 30 ngày hoặc không còn dùng → `cacheClear` xóa.
- Xuất (`export/manager.ts`): với mỗi mảnh âm thanh, nếu track có `fx` khác mặc định → `path` = file đã xử lý (đợi xử lý xong trước khi ghép). `buildExportMuxArgs` không đổi.
- Xem trước (`editor/preview.ts`): track có fx khác mặc định → thẻ audio đổi `src` sang `lumora-media://projects/<folder>/cache/<file>` khi file sẵn sàng (media-protocol cho phép thư mục con `cache/`); chưa sẵn sàng thì phát bản gốc và panel hiện "Đang xử lý…". Nút **"Giữ để nghe bản gốc"** (pointerdown đổi về gốc, pointerup trả lại).

#### 2.3 Lồng tiếng (voice-over)

- Tab Âm thanh → mục **Lồng tiếng**: chọn micro (`mic-select`), đồng hồ mức (`MicMeter`), nút ghi `Mic` đỏ: đếm ngược 3s rồi ghi bằng `TrackRecorder` (MediaRecorder, `lib/media.ts`) **đồng thời phát timeline từ đầu phát** (tùy chọn tắt tiếng mic/system gốc khi ghi). Dừng → gửi chunk về main (`assets:add-voiceover`) → chuẩn hóa sang m4a → `AudioClip { kind: 'voice', name: 'Lồng tiếng 1' }` đặt tại điểm bắt đầu ghi, chọn ngay. Hàng âm thanh hiện màu cam.
- `SOUND_EFFECT`/`AudioClip.kind` thêm `'voice'`.

#### 2.4 Tách tiếng, tắt tiếng, beat

- Lớp video meme: nút **Tách tiếng** → tạo `AudioClip` từ cùng file (`offset = mediaOffset`, `duration = end-start`, `kind: 'sfx'`), đặt `overlay.hasAudio = false`. Nút **Tắt tiếng** (volume 0, icon loa gạch).
- Clip video chính: tab Âm thanh có `muted`, âm lượng mic/system riêng clip.
- **Nhịp nhạc**: `core/edit/beats.ts` `detectBeats(peaks, bucketMs, minGapMs = 250)` (ngưỡng động theo trung bình trượt) → nhạc nền hiện các vạch nhỏ trên khối; hít dính (Bước 5) dùng các vạch này. Test với dạng sóng tổng hợp có đỉnh đều.

#### 2.5 Giao diện

- Panel **Âm thanh** của mục đang chọn (clip/đoạn nhạc/video meme) và trong **Cài đặt video → Âm lượng** (cho micro & âm thanh máy toàn dự án):
  - Âm lượng (SliderRow + số), Tắt tiếng (Toggle).
  - Section **Lọc tạp âm**: Segmented Tắt/Nhẹ/Vừa/Mạnh, trạng thái "Đang xử lý…/Sẵn sàng", nút giữ để nghe bản gốc.
  - Section **Giọng nói**: Toggle Tăng cường giọng, Toggle Chuẩn hóa âm lượng, lưới 7 thẻ đổi giọng (icon + tên), thanh Cao độ −12..12.
  - Section **Fade**: vào/ra.
- Thư viện Âm thanh: segmented "Của tôi | Hiệu ứng | Meme sound | Lồng tiếng | Kho online (Bước sau)".

#### 2.6 Test

- core: `parseAudioFx`, `audioFxKey` ổn định, `audioFxFilter` đúng chuỗi cho từng tổ hợp; `detectBeats`.
- main (FFmpeg thật): tạo `sine 440 Hz + anoisesrc` → `noise: 'medium'` → đo `volumedetect` ở đoạn im lặng giảm ≥ 10 dB so với gốc, đoạn có giọng (sine) giữ ≥ −6 dB so với gốc; chipmunk: so loudness qua `bandpass=f=660:w=60` lớn hơn qua `bandpass=f=440:w=60`; normalize: mean_volume trong ±3 dB của −16; cache: gọi lần 2 không chạy FFmpeg (runner giả đếm lần gọi); hủy giữa chừng không để lại file `.part`.
- renderer: panel đổi fx → store, trạng thái xử lý qua event giả, nút nghe bản gốc; lồng tiếng với `MediaRecorder` giả (đã có mẫu trong test ghi hình).
- E2E (`e2e/audio.spec.ts`): fixture mic = sine + white noise; bật Lọc tạp âm "Vừa" + tắt system → xuất → đo đoạn im lặng giảm ≥ 10 dB; đổi giọng chipmunk → xuất → bandpass kiểm tra; lồng tiếng: giả `getUserMedia` bằng `--use-fake-device-for-media-stream` (helpers đã bật) ghi 2 giây → có khối cam trên timeline → xuất có tiếng ở đúng đoạn.

**Nghiệm thu**: lọc tạp âm/đổi giọng nghe được ở xem trước và có trong video xuất; lồng tiếng ghi được; E2E xanh. Phát hành **v0.5.0**.

---

### Bước 3 — v0.6.0: Hình ảnh & clip (bộ lọc, điều chỉnh, mặt nạ, keyframe, xóa phông AI)

#### 3.1 Bộ lọc & điều chỉnh (`core/edit/look.ts`)

```ts
export const FILTER_PRESETS = ['none','cinematic','vintage','cold','warm','bw','fade','vivid','noir','pastel','tealOrange','sunset'] as const
export interface Adjust { exposure; brightness; contrast; saturation; temperature; tint; sharpen; vignette; highlights; shadows; grain }  // mỗi cái -1..1 (grain, sharpen, vignette 0..1)
export interface Look { filter: FilterPreset; intensity: number; adjust: Adjust }
export const DEFAULT_LOOK, parseLook, lookCss(look): string   // chuỗi ctx.filter (brightness/contrast/saturate/sepia/hue-rotate)
export function lookLayers(look): { css: string; warm: number; cool: number; vignette: number; grain: number; sharpen: number }
```

- `EditState.look` (toàn video, áp cho vùng video màn hình + webcam) và `Clip.look?` (ghi đè theo clip), `Overlay.look?` (ảnh/video meme).
- Vẽ (`draw.ts`): `ctx.filter = lookCss` khi vẽ nguồn; nhiệt độ/tint bằng lớp màu phủ với `globalCompositeOperation = 'soft-light'` (ấm `#ff9a3c`, lạnh `#3c8cff`, tint xanh lá/hồng) alpha = |giá trị| × 0.35; vignette = gradient tròn đen; grain = noise texture 256×256 tạo một lần (seeded) vẽ lặp với alpha; sharpen = vẽ bản làm mờ với `difference` rồi cộng (`lighter`) theo hệ số — nếu chi phí cao thì chỉ bật khi `sharpen > 0`. Preset = bộ giá trị `Adjust` + sepia/hue cố định, `intensity` nội suy về 0.
- Thư viện tab **Bộ lọc** `Palette`: lưới thẻ có ảnh xem trước (vẽ khung hiện tại của video qua từng preset vào canvas nhỏ 160×90, cập nhật khi đầu phát dừng), bấm áp dụng cho toàn video (hoặc clip đang chọn), thanh cường độ.
- Panel **Điều chỉnh** (tab `SlidersHorizontal`): 11 SliderRow có số, nút reset từng dòng và reset tất cả, Toggle "Chỉ clip này".

#### 3.2 Thao tác clip (`core/edit/timeline.ts` + `clip-ops.ts`)

- `Clip` thêm: `flipH, flipV, rotate: 0|90|180|270, crop: {x,y,w,h} (0..1), opacity 0..1, reversed: boolean, freeze?: { at: number; durationMs: number }`.
- **Đảo ngược**: main `clip-ops.ts` `reverseMedia(projectDir, file)` → `cache/<file>-rev.mp4` (`-vf reverse -af areverse`, giới hạn 2 phút, cảnh báo nếu dài hơn). Clip `reversed` → preview/export dùng file đảo, thời gian nguồn `t' = duration - t`. Hàm core `clipMediaTime(clip, source)`.
- **Đóng băng khung**: nút trên clip đang chọn tại đầu phát → tách clip và chèn clip `freeze` 3 giây (chỉnh được) hiển thị một khung cố định; `outputToSource` trả `at` cố định; filmstrip hiện 1 ảnh lặp; âm thanh im lặng.
- **Đường cong tốc độ** (`core/edit/speed-curve.ts`): `Clip.speedCurve?: { preset: 'custom'|'montage'|'hero'|'bullet'|'jumpCut'|'flashIn'|'flashOut'; points: {t: 0..1, speed}[] }`; `curveSourceTime(curve, outputMs, sourceLen)` tích phân tuyến tính từng đoạn; `clipDuration` dùng tích phân. Panel Tốc độ: segmented "Cố định | Đường cong", đồ thị SVG kéo điểm (5 điểm), preset. Âm thanh khi đường cong: xuất theo `atempo` từng đoạn xấp xỉ (chia ≤ 10 đoạn) — ghi rõ xấp xỉ trong tooltip.
- Lật/xoay/cắt/độ mờ: trong `computeScene` → `content` + biến đổi; crop = thay đổi `view`; vẽ với `ctx.scale(-1,1)`/`rotate`. Khung xem trước: chế độ **Cắt** (nút `Crop`) hiện lưới và 8 tay nắm.

#### 3.3 Lớp phủ nâng cao (`core/edit/overlays.ts`, `keyframes.ts`)

- `Overlay` thêm: `opacity 0..1`, `blend: 'normal'|'screen'|'multiply'|'overlay'|'lighten'|'darken'|'difference'|'add'` (→ `globalCompositeOperation`), `flipH`, `mask: { shape: 'none'|'circle'|'rect'|'heart'|'star'|'linear'|'mirror'; scale; feather; rotation; invert; x; y }`, `anim: { in: {kind, ms}, out: {kind, ms}, loop: {kind} }` (thay `animation` đơn; parse tương thích: `animation` cũ → `in`), `keyframes: Keyframe[]`.
- `core/edit/keyframes.ts`: `Keyframe { t: ms (tương đối lớp); props: Partial<{x,y,size,rotation,opacity}>; ease: 'linear'|'easeIn'|'easeOut'|'easeInOut' }`; `valueAt(keyframes, prop, t, fallback)`; `toggleKeyframe(...)`, `moveKeyframe`. Kéo lớp trên khung khi đã có keyframe → tự ghi/cập nhật keyframe tại đầu phát.
- Mặt nạ vẽ: clip path (circle/rect/heart/star bằng Path2D), feather bằng `ctx.filter = blur()` trên scratch canvas rồi `destination-in`. Nhận kéo trên khung: tay nắm mặt nạ (vòng tròn nét đứt).
- Timeline: khối lớp phủ hiện hình thoi ◇ tại keyframe; bấm chọn, kéo dời, Delete xóa. Panel: nút ◇ cạnh từng SliderRow (sáng khi có keyframe tại đầu phát), nút "Xóa hết keyframe".
- Hoạt ảnh: thư viện 12 kiểu vào (pop, fade, slideL/R/U/D, zoomIn, spin, typewriter cho chữ, bounceIn, flipIn, blurIn), 8 kiểu ra, 6 lặp (bounce, shake, pulse, swing, float, flicker). Panel Hoạt ảnh: 3 hàng thẻ nhỏ có mini-preview CSS, thanh thời lượng.

#### 3.4 Xóa phông AI (webcam & video meme không phông xanh)

- Thư viện: `@mediapipe/tasks-vision` (Apache-2.0), model `selfie_segmenter.tflite` (Apache-2.0) đặt ở `resources/models/` và phục vụ qua `lumora-media://models/...`. WASM của MediaPipe copy vào `resources/mediapipe/`. Chạy trong Web Worker (`editor/segment.worker.ts`), nhận `ImageBitmap`, trả mask `Uint8Array` (w×h). Ở xem trước: tối đa 15 lần/giây, dùng lại mask gần nhất giữa hai lần; xuất: mỗi khung.
- `CameraStyle.background: { mode: 'none'|'remove'|'blur'|'color'|'image'; color; file; blur: number; edge: number }`; `Overlay` video/ảnh: `aiKey: boolean` (xóa phông AI thay cho chroma).
- Vẽ: mask → `destination-in` trên scratch; blur phông: vẽ nguồn mờ rồi vẽ người lên. Webcam phông trong suốt + bong bóng tròn vẫn có viền.
- Nếu không tải được model (thiếu WebGL/WASM) → thông báo `ai_bg_unavailable` và tự tắt.

#### 3.5 Test

- core: `lookCss`, preset × intensity, parse; `clipMediaTime` với reversed; freeze mapping; `curveSourceTime` (tổng thời lượng, đơn điệu); `valueAt` nội suy & ease; parse keyframes/mask/blend tương thích `animation` cũ.
- main: `reverseMedia` FFmpeg thật (khung đầu của file đảo = khung cuối của gốc, so pixel).
- renderer: panel Điều chỉnh → store; keyframe toggle; mặt nạ tay nắm; worker segment giả.
- E2E (`e2e/visual.spec.ts`): bộ lọc `bw` → SATAVG giảm > 50%; `warm` → VAVG tăng; lật ngang → pixel trái/phải đổi chỗ; đảo ngược → khung 0.2s của xuất ≈ khung cuối gốc; freeze 1s → 2 khung cách 0.5s giống nhau; keyframe x 0.2→0.8 trên 2s → vị trí ảnh ở 0.5s ≈ 35%; mặt nạ tròn → góc ảnh trong suốt (pixel nền); blend `screen` → vùng sáng hơn gốc. Xóa phông AI: E2E chỉ kiểm tra bật tùy chọn không lỗi và lưu; **kiểm tra thật trên Windows** với webcam (ghi vào README mục "kiểm tra thủ công").

**Nghiệm thu**: 12 bộ lọc, 11 điều chỉnh, lật/xoay/cắt/mờ/đảo/đóng băng/đường cong, mặt nạ, hòa trộn, keyframe, hoạt ảnh vào/ra/lặp, xóa phông AI. Phát hành **v0.6.0**.

---

### Bước 4 — v0.7.0: Văn bản, phụ đề, giọng đọc AI

#### 4.1 Chữ nâng cao (`core/edit/text-style.ts`)

- `Overlay` (text) thêm `font: string` (bundle OFL: Be Vietnam Pro, Inter, Montserrat, Oswald, Anton, Bangers, Lobster, Pacifico, Roboto Mono, Playfair Display — đặt ở `resources/fonts`, khai báo `@font-face` và `document.fonts.load()` trước khi vẽ/xuất), `weight`, `italic`, `align`, `lineHeight`, `letterSpacing`, `stroke: {width, color}`, `shadow: {blur, color, dx, dy}`, `background: {color, opacity, radius, padding}`, `gradient?: {from, to, angle}`, `textAnim: 'none'|'typewriter'|'wordPop'|'wave'|'glitch'|'slideWords'`.
- 24 **mẫu chữ** (`TEXT_TEMPLATES`) = preset các trường trên, có tên và thumbnail vẽ bằng canvas lúc chạy. `style` cũ (`meme/title/bubble/neon`) ánh xạ sang 4 mẫu đầu.
- Panel Văn bản: ô nội dung, chọn font (dropdown có preview), đậm/nghiêng/căn, màu/gradient, Section Viền, Bóng, Nền, Khoảng cách; Section Hoạt ảnh chữ.
- Vẽ: `overlay-draw.ts` tách `drawText` thành `text-draw.ts`; typewriter/wordPop dựa vào `local` ms và tách từ.

#### 4.2 Phụ đề

- `CaptionsState` thêm `template: 'karaoke'|'box'|'outline'|'bounceWord'|'popWord'|'underline'|'neon'|'tiktok'`, `font`, `color`, `highlightColor`, `maxWordsPerLine`, `position y 0..1`, `bilingual?: { lang; lines }`.
- Thư viện Phụ đề: lưới 8 mẫu có xem trước; nút **Tự động tạo** (đã có), **Dịch** (Claude: dịch từng dòng giữ thời gian, chọn ngôn ngữ đích; hiện song ngữ hoặc thay thế), **Chỉnh sửa** (danh sách dòng như hiện có, thêm gộp/tách dòng, kéo chỉnh thời gian trên timeline: hàng "Phụ đề" mới).

#### 4.3 Giọng đọc AI (TTS)

- `ai/service.ts` `speak()` (từ Bước 1) mở rộng: chọn giọng, tốc độ, độ ổn định; **Đọc chữ này** trên lớp văn bản → tạo AudioClip đặt đúng `start` của lớp; **Lời bình AI**: ô nhập kịch bản dài → chia câu → nhiều AudioClip nối tiếp; **Tạo phụ đề từ kịch bản** ngược lại.
- Kho giọng: cache danh sách giọng 1 ngày.

#### 4.4 Sticker động

- Tab Nhãn dán: nguồn Tenor sticker (Bước 1) + **sticker vẽ sẵn** không bản quyền tự tạo bằng SVG (mũi tên, vòng tròn, gạch chân, hộp nhấn mạnh, con trỏ, dấu tick/x, bong bóng thoại trống) có màu đổi được — `kind: 'shape'` với `shape` + `color`. Dùng nhiều cho video hướng dẫn phần mềm.

#### 4.5 Test

- core: parse text style/template, map style cũ; hoạt ảnh chữ (typewriter số ký tự theo thời gian); caption template parse; `shape` overlay.
- main: `speak` mock server; dịch mock Claude.
- renderer: panel chữ; font dropdown; phụ đề mẫu; TTS nút → audio clip.
- E2E (`e2e/text.spec.ts`): chữ viền đỏ nền đen → vùng chữ có pixel đỏ & đen; font Anton tải được (đo chiều rộng chữ khác Inter); typewriter: ở 0.2s ít chữ hơn 1.5s (so vùng sáng); phụ đề mẫu `box` xuất đúng vị trí; TTS mock → audio clip → xuất có tiếng đúng chỗ; sticker mũi tên màu đỏ → pixel.

**Nghiệm thu**: 24 mẫu chữ, 10 font Việt, viền/bóng/nền, 6 hoạt ảnh chữ, 8 mẫu phụ đề, dịch, TTS, sticker hình. Phát hành **v0.7.0**.

---

### Bước 5 — v0.8.0: Timeline chuyên nghiệp & nhập video ngoài

#### 5.1 Chọn nhiều, clipboard, hít dính (`core/edit/selection.ts`, `snap.ts`, `clipboard.ts`)

- `Selection` thành mảng `SelectedItem[]` (giữ API `select(one)` tương thích + `toggleSelect`, `selectMany`, `selectAll(kind)`). Marquee trên chỗ trống (vẽ hình chữ nhật, chọn các khối giao nhau). Shift+click chọn dải, Ctrl+click thêm/bớt.
- Clipboard nội bộ (zustand): copy/cut/paste/duplicate các lớp phủ, hiệu ứng, đoạn âm thanh, clip (clip dán = chèn sau đầu phát); dán giữ tương đối theo mục sớm nhất, đặt tại đầu phát.
- Hít dính: `snapTime(t, candidates, thresholdMs)` với ứng viên: đầu phát, mép clip, mép lớp khác, marker, beat; bật/tắt (`N`), đường kẻ dọc màu accent khi hít; `thresholdMs = 8px / pxPerMs`.
- Xóa dồn (`Shift+Delete`) cho lớp phủ/âm thanh: các mục bên phải cùng hàng dịch trái.

#### 5.2 Kéo thả từ thư viện

- Thẻ trong thư viện `draggable`, `dataTransfer.setData('application/x-lumora', JSON{kind, payload})`; timeline `onDragOver` hiện khối mờ đúng hàng và vị trí (hít dính), `onDrop` → thêm tại vị trí thả (hàng tương ứng loại: video meme → Lớp phủ, nhạc → Âm thanh, hiệu ứng → Hiệu ứng, chuyển cảnh → chỗ nối gần nhất). Thả lên khung xem trước → thêm tại đầu phát, vị trí nơi thả.
- Kéo thả **file từ ngoài** (Explorer) lên timeline/khung: video/ảnh/GIF → nhập vào dự án (chuẩn hóa) và thêm; nhạc → AudioClip.

#### 5.3 Đầu hàng & marker & hover

- Đầu hàng: ẩn (`Eye`), tắt tiếng (`Volume2`), khóa (`Lock`) → `EditState.tracks: { [kind]: { hidden, muted, locked } }`; ẩn → không vẽ/không xuất; khóa → không chọn/không kéo.
- Marker: `EditState.markers: {id, t, label, color}[]`; thêm bằng `M`, hiện cờ trên thước, kéo dời, đổi tên qua double-click, danh sách trong panel Cài đặt video → Marker; nhảy marker trước/sau `Shift+M`/`Ctrl+M`. Xuất chương (chapter) vào file `.txt` cho YouTube.
- Rê chuột trên clip video: tooltip ảnh thu nhỏ (từ filmstrip) + thời gian. Alt+kéo trên thước: xem trước nhanh.
- Tách âm thanh clip chính: "Tách âm thanh" → tạo AudioClip từ track mic/system phần clip đó (`file`, `offset`), clip `muted`.

#### 5.4 Nhập video ngoài làm clip chính & ghép dự án

- `Project.segments` thêm loại `kind: 'recording' | 'imported'`; `importMedia(file)` (main): chuẩn hóa sang MP4 H.264/AAC (tối đa 1080p/60fps, giữ tỉ lệ), tách âm thanh thành track `system` (`-vn` AAC) để `planAudio` dùng như cũ, không có `camera`/sự kiện chuột (cursor track rỗng cho đoạn đó, zoom theo con trỏ bỏ qua đoạn đó).
- Core: `sourceSegments` đã theo `startedAt/endedAt`; đoạn nhập có `startedAt = endedAt của đoạn trước`. `createDefaultEdit`/`initialClips` tạo clip cho đoạn mới (hàm `appendSegmentClips`).
- UI: thư viện Media → "Nhập video từ máy" (vào hàng Video), Dự án → "Ghép bản quay khác" (chọn dự án → copy segment + file). Waveform/filmstrip tạo thêm cho đoạn mới (đã theo segment).
- Thay đổi kích thước video khác nhau giữa các đoạn: `videoSize` theo từng đoạn (`SceneInput.video` lấy từ sample — exporter đã làm; preview lấy từ `videoWidth` của thẻ đang phát). Khung nền hiện khi tỉ lệ khác.

#### 5.5 Menu chuột phải

- Trên clip: Tách, Xóa, Xóa dồn, Sao chép, Dán, Nhân đôi, Đóng băng, Đảo ngược, Tách âm thanh, Tắt tiếng, Tốc độ…, Đổi màu nhãn.
- Trên lớp/âm thanh: Sao chép, Dán, Nhân đôi, Xóa, Đưa lên/xuống lớp (thứ tự vẽ = thứ tự mảng), Tách tiếng, Đổi tên.
- Chỗ trống: Dán, Thêm marker, Vừa khung, Chọn tất cả.

#### 5.6 Test

- core: selection toggle/range, clipboard dán tương đối, `snapTime`, ripple delete, markers parse, tracks state, `appendSegmentClips`, mapping với đoạn nhập.
- main: `importMedia` FFmpeg thật (webm → mp4, 4K → 1080p, tách audio), ghép dự án copy đúng file.
- renderer: marquee (fireEvent pointer), Ctrl+C/V, drop từ thư viện (DataTransfer giả), đầu hàng ẩn/khóa, menu chuột phải.
- E2E (`e2e/timeline.spec.ts`): kéo thẻ meme thả vào hàng Lớp phủ tại 2s → `start≈2000`; nhập MP4 ngoài → thêm clip → timecode tăng → xuất có khung của video ngoài ở cuối; marker + xuất chapter; ẩn hàng Hiệu ứng → video xuất không có hiệu ứng; Ctrl+C/V lớp chữ.

**Nghiệm thu**: thao tác timeline ngang CapCut (chọn nhiều, clipboard, hít dính, kéo thả, marker, khóa/ẩn, menu chuột phải), nhập video ngoài, ghép dự án. Phát hành **v0.8.0**.

---

### Bước 6 — v0.9.0 → v1.0.0: Hoàn thiện, hiệu năng, trải nghiệm

- **Công việc nền**: `JobsPopover` ở header (tải meme, lọc tạp âm, TTS, đảo ngược, nhập video, xuất) với tiến độ/hủy; `Toast` cho kết quả; xuất chạy nền vẫn chỉnh sửa được (khóa chỉnh sửa khi đang dựng hình hoặc dựng từ bản chụp `edit` — chọn cách 2: xuất dùng bản sao `edit` tại lúc bấm).
- **Hiệu năng**: xem trước tự hạ xuống 540p khi khung vẽ > 33ms trong 1 giây (hiện nhãn "Xem trước nhẹ"), nâng lại khi rảnh; decode video meme/overlay bằng `VideoFrame` cache; giới hạn 20 lớp cùng lúc; đo và ghi vào README: 1080p + 3 lớp + bộ lọc ≥ 30 fps trên máy tầm trung.
- **Lưới an toàn & thước**: nút lưới (1/3, an toàn TikTok: vùng bị UI che), tỉ lệ xem trước 25–200%.
- **Lịch sử**: panel Lịch sử (danh sách hành động, bấm để quay về), tên hành động trong undo tooltip ("Hoàn tác: Đổi cỡ webcam").
- **Dự án**: đổi tên, nhân đôi, thùng rác, thumbnail dự án từ frame 1s, mở gần đây ở trang Dự án, mẫu dự án (16:9 hướng dẫn, 9:16 TikTok, 1:1).
- **Onboarding**: lần đầu mở editor hiện 5 bước gợi ý (coach marks) có nút bỏ qua; hộp thoại `?` phím tắt.
- **Trợ năng**: điều hướng tab bằng phím, focus ring rõ, `aria-*` đầy đủ, tương phản ≥ 4.5:1, chế độ sáng được rà lại toàn bộ.
- **Cài đặt**: thư mục dự án, bộ nhớ đệm (dung lượng, dọn), chất lượng xem trước, ngôn ngữ, phím tắt tùy chỉnh (tùy chọn).
- **Ổn định**: khôi phục sau crash (edit.json autosave đã có + `.lock`), log lỗi renderer vào `main.log`, kiểm tra rò rỉ bộ nhớ (chạy 30 phút mở/đóng editor 50 lần trong E2E, heap không tăng > 30%).
- **Tài liệu**: README "Hướng dẫn sử dụng" có ảnh chụp từng vùng (tạo bằng E2E `page.screenshot`), `THIRD_PARTY.md` đầy đủ, `CHANGELOG.md`.
- **v1.0.0**: khi tất cả E2E (dự kiến ≥ 45 bài) xanh trên CI Windows, kiểm tra thủ công trên Windows (quay thật, webcam thật, xóa phông AI, cập nhật tự động từ v0.9 lên v1.0 thành công).

---

## 4. Phụ lục

### 4.1 Công thức FFmpeg đã xác nhận có trong `ffmpeg-static` 7.0

`afftdn, arnndn, anlmdn, loudnorm, speechnorm, deesser, compand, acompressor, agate, dynaudnorm, rubberband, asetrate, atempo, aecho, afftfilt, acrusher, highpass, lowpass, reverse, areverse, hflip, vflip, eq, curves, lut3d, unsharp, vibrance, colortemperature, vignette, minterpolate, tpad`.

Luôn thêm `-hide_banner -loglevel error -y`, ghi ra file `.part` rồi `rename`, timeout rõ ràng, `killSignal: 'SIGKILL'` (đã có trong runner). Với `apad` luôn dùng `whole_dur`. Sau `amix` luôn `asetpts=N/SR/TB` (lỗi mất tiếng đã gặp).

### 4.2 Dịch vụ online

| Dịch vụ                       | Dùng cho                     | Key                            | Ghi chú                                                                 |
| ----------------------------- | ---------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Tenor v2                      | meme GIF/MP4, sticker        | Google Cloud API key, miễn phí | Phải hiện "Powered by Tenor". `contentfilter=medium`.                   |
| Pixabay                       | video/ảnh stock              | miễn phí                       | Không cần ghi nguồn; không được tải hàng loạt; cache ≤ 24h.             |
| ElevenLabs                    | STT (đã có), TTS, giọng      | key người dùng                 | `eleven_multilingual_v2` cho tiếng Việt.                                |
| Anthropic                     | AI cắt, tóm tắt, dịch phụ đề | key người dùng                 | Model mặc định trong `ai/service.ts`.                                   |
| Freesound (tùy chọn, Bước 2+) | SFX CC0                      | key                            | Chỉ lọc `license:"Creative Commons 0"`, dùng `previews.preview-hq-mp3`. |

Mọi lời gọi mạng đi qua main process, có timeout, mã lỗi chuẩn, và **mock bằng HTTP server cục bộ** trong E2E (đặt URL gốc qua biến môi trường `LUMORA_TENOR_URL`, `LUMORA_PIXABAY_URL`, `LUMORA_ELEVENLABS_URL`, `LUMORA_ANTHROPIC_URL` như cách `mock-ai.ts` đang làm).

### 4.3 Tài nguyên bundle (ghi vào `THIRD_PARTY.md`)

- RNNoise WebAssembly `rnnoise.wasm` — RNNoise BSD-3-Clause, bản dựng Jitsi Apache-2.0.
- MediaPipe tasks-vision + `selfie_segmenter.tflite` — Apache-2.0.
- Font OFL: Be Vietnam Pro, Inter, Montserrat, Oswald, Anton, Bangers, Lobster, Pacifico, Roboto Mono, Playfair Display.
- lucide-react — ISC.

### 4.4 Rủi ro & cách xử lý

| Rủi ro                                     | Xử lý                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Key Tenor/Pixabay hết hạn mức              | Cache kết quả, báo `quota` rõ ràng, thư viện offline vẫn dùng được.                                                                           |
| `arnndn` chậm trên máy yếu                 | Chạy nền có tiến độ, cache theo hash, xem trước phát bản gốc tới khi xong.                                                                    |
| MediaPipe không chạy (WebGL tắt)           | Tự tắt tính năng, thông báo; không chặn xuất.                                                                                                 |
| Xuất chậm khi nhiều lớp + bộ lọc + mask    | Gộp lớp tĩnh vào scratch cache; đo trong E2E thời gian xuất 4s ≤ 60s.                                                                         |
| Thay đổi mô hình dữ liệu làm hỏng dự án cũ | Mọi trường mới có mặc định trong `parse…`; test "dự án v0.3 mở được" với fixture `edit.json` cũ lưu trong `packages/core/src/edit/fixtures/`. |
| Timeline nhiều hàng con làm cao quá        | Giới hạn 4 hàng con hiển thị, cuộn dọc trong vùng timeline.                                                                                   |

### 4.5 Mẫu báo cáo cuối mỗi bước (tiếng Việt)

```
Đã phát hành Lumora vX.Y.Z.
Mới:
- …
Sửa lỗi:
- …
Kiểm tra: core N test, main N test (FFmpeg thật), renderer N test, E2E N bài (xvfb), tất cả xanh. Release có đủ latest.yml / Setup.exe / blockmap.
Cần kiểm tra thủ công trên Windows: …
```
