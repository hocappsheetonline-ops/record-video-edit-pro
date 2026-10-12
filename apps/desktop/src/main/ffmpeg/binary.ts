import ffmpegStatic from 'ffmpeg-static'

/**
 * Đường dẫn tới ffmpeg đóng gói kèm app. Trong bản cài, file nằm ở `app.asar.unpacked`
 * vì không thể chạy file thực thi từ bên trong gói asar.
 */
export function ffmpegPath(): string {
  const path = ffmpegStatic as unknown as string | null
  if (!path) throw new Error('Không tìm thấy ffmpeg cho hệ điều hành này')
  return path.replace(`app.asar${pathSep()}`, `app.asar.unpacked${pathSep()}`)
}

function pathSep(): string {
  return process.platform === 'win32' ? '\\' : '/'
}
