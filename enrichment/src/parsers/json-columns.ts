export const JSON_COLUMNS = ['gtin', 'sizes', 'errors', 'images', 'image_flags'] as const

export function parseJsonColumns(
  row: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...row }

  for (const column of JSON_COLUMNS) {
    const raw = row[column]
    if (raw === undefined || raw === '') {
      result[column] = []
      continue
    }

    try {
      result[column] = JSON.parse(raw)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to parse JSON column "${column}": ${message}. Raw value: ${raw.slice(0, 100)}`,
      )
    }
  }

  return result
}
