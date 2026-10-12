import type { LumoraApi } from '@shared/ipc'

/** Truy cập API của main process. Tách ra một hàm để test có thể thay bằng bản giả. */
export function lumora(): LumoraApi {
  return window.lumora
}
