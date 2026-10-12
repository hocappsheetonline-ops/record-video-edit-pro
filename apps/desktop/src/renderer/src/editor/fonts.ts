import beVietnamRegular from '../assets/fonts/BeVietnamPro-Regular.ttf?url'
import beVietnamBold from '../assets/fonts/BeVietnamPro-Bold.ttf?url'
import beVietnamBlack from '../assets/fonts/BeVietnamPro-Black.ttf?url'
import interVf from '../assets/fonts/Inter-VF.ttf?url'
import montserratVf from '../assets/fonts/Montserrat-VF.ttf?url'
import oswaldVf from '../assets/fonts/Oswald-VF.ttf?url'
import anton from '../assets/fonts/Anton-Regular.ttf?url'
import bangers from '../assets/fonts/Bangers-Regular.ttf?url'
import lobster from '../assets/fonts/Lobster-Regular.ttf?url'
import pacifico from '../assets/fonts/Pacifico-Regular.ttf?url'
import robotoMonoVf from '../assets/fonts/RobotoMono-VF.ttf?url'
import playfairVf from '../assets/fonts/PlayfairDisplay-VF.ttf?url'

/** Phông đi kèm (OFL): tên CSS, file, độ đậm (một số hay khoảng của phông biến thiên). */
const FACES: { family: string; url: string; weight: string }[] = [
  { family: 'Be Vietnam Pro', url: beVietnamRegular, weight: '400' },
  { family: 'Be Vietnam Pro', url: beVietnamBold, weight: '700' },
  { family: 'Be Vietnam Pro', url: beVietnamBlack, weight: '900' },
  { family: 'Inter', url: interVf, weight: '100 900' },
  { family: 'Montserrat', url: montserratVf, weight: '100 900' },
  { family: 'Oswald', url: oswaldVf, weight: '200 700' },
  { family: 'Anton', url: anton, weight: '400' },
  { family: 'Bangers', url: bangers, weight: '400' },
  { family: 'Lobster', url: lobster, weight: '400' },
  { family: 'Pacifico', url: pacifico, weight: '400' },
  { family: 'Roboto Mono', url: robotoMonoVf, weight: '100 700' },
  { family: 'Playfair Display', url: playfairVf, weight: '400 900' },
]

let loading: Promise<void> | null = null

/**
 * Nạp tất cả phông đi kèm vào trang (dùng cho canvas xem trước, canvas xuất video và ô xem mẫu).
 * Gọi nhiều lần chỉ nạp một lần. Lỗi nạp một phông không chặn các phông khác.
 */
export function loadFonts(): Promise<void> {
  if (loading) return loading
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    loading = Promise.resolve()
    return loading
  }
  loading = Promise.all(
    FACES.map(async ({ family, url, weight }) => {
      try {
        const face = new FontFace(family, `url("${url}")`, { weight, style: 'normal' })
        document.fonts.add(await face.load())
      } catch (error) {
        console.warn('font failed', family, error)
      }
    }),
  ).then(() => undefined)
  return loading
}
