import { useEffect, useRef } from 'react'
import type { Project } from '@lumora/core'
import { PreviewEngine } from './preview'

export function PreviewCanvas({ project, folder }: { project: Project; folder: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new PreviewEngine(canvas, project, folder)
    return () => engine.dispose()
  }, [project, folder])

  return (
    <canvas
      ref={canvasRef}
      data-testid="editor-canvas"
      className="max-h-full max-w-full rounded-lg bg-black object-contain shadow-2xl"
    />
  )
}
