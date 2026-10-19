/** Tiêu đề trang cỡ lớn (kiểu "large title" của Apple) với mô tả ngắn bên dưới. */
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
    </header>
  )
}
