export const vi = {
  nav: {
    record: 'Quay',
    projects: 'Dự án',
    editor: 'Chỉnh sửa',
    live: 'Livestream',
    settings: 'Cài đặt',
  },
  record: {
    title: 'Quay màn hình',
    description: 'Quay màn hình, webcam và micro. Con trỏ chuột được ghi lại để tự động zoom.',
  },
  projects: {
    title: 'Dự án',
    description: 'Các video bạn đã quay sẽ hiện ở đây.',
    empty: 'Chưa có dự án nào. Bấm "Quay" để bắt đầu.',
  },
  editor: {
    title: 'Trình chỉnh sửa',
    description: 'Tự động zoom, con trỏ mượt, nền, webcam, timeline và xuất video.',
  },
  live: {
    title: 'Livestream',
    description: 'Phát lên YouTube, Facebook, TikTok cùng lúc và mời khách qua link.',
  },
  comingSoon: 'Sắp ra mắt ({{phase}})',
  phase: 'Giai đoạn',
  settings: {
    title: 'Cài đặt',
    general: 'Chung',
    language: 'Ngôn ngữ',
    theme: 'Giao diện',
    themes: { system: 'Theo hệ thống', dark: 'Tối', light: 'Sáng' },
    apiKeys: 'API key',
    apiKeysHint:
      'Key được mã hóa và chỉ lưu trên máy này. Lumora dùng key để tạo phụ đề và tự biên tập video.',
    encryptionUnavailable: 'Máy này không hỗ trợ mã hóa nên không thể lưu API key an toàn.',
    about: 'Thông tin',
    version: 'Phiên bản {{version}}',
  },
  keys: {
    elevenlabs: { name: 'ElevenLabs', purpose: 'Chuyển giọng nói thành phụ đề' },
    anthropic: { name: 'Claude (Anthropic)', purpose: 'AI tự biên tập, tạo tiêu đề và chương' },
    getKey: 'Lấy key',
    notSet: 'Chưa nhập',
    saved: 'Đã lưu: {{masked}}',
    placeholder: 'Dán API key vào đây',
    save: 'Lưu',
    test: 'Kiểm tra',
    remove: 'Xóa',
    testing: 'Đang kiểm tra…',
    valid: 'Key hợp lệ',
    savedOk: 'Đã lưu key',
    removedOk: 'Đã xóa key',
    errors: {
      empty: 'Bạn chưa nhập key',
      whitespace: 'Key không được chứa khoảng trắng',
      too_short: 'Key quá ngắn, có thể bạn dán thiếu',
      wrong_prefix: 'Key Claude phải bắt đầu bằng "sk-ant-"',
      invalid: 'Key không đúng hoặc đã bị thu hồi',
      network: 'Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại',
      unknown: 'Không kiểm tra được key: {{message}}',
      saveFailed: 'Không lưu được key: {{message}}',
    },
  },
}

export type Messages = typeof vi
