import type { LumoraApi } from '../shared/ipc'

declare global {
  interface Window {
    lumora: LumoraApi
  }
}
