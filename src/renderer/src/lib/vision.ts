const VISION_MODELS = new Set([
  'deepseek-flash',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp'
])

/** Conservative guard: only models verified for image input may start screenshot questions. */
export function supportsVisionModel(model: string): boolean {
  return VISION_MODELS.has(model.trim().toLocaleLowerCase())
}
