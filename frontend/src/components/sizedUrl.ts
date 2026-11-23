/**
 * Pictures at the size they show: a signed file URL asks the server for a smaller copy (`&w=`) when the picture is
 * drawn small (cards, lists, avatars), so a 1024 px portrait isn't downloaded for a 40 px face. The widths are the
 * server's (services/files.py: WIDTHS); larger than the biggest, the file itself.
 */
export const WIDTHS = [96, 192, 384, 768, 1536] as const
/** Round pictures in SVG (tokens on maps, graph nodes): rarely drawn past ~200 px, even zoomed in. */
export const TOKEN_WIDTH = 384

/** The width to ask for, for a picture drawn `cssWidth` px wide on this screen (null: the file itself). */
export function pickWidth(cssWidth: number, pixelRatio = 1): number | null {
  if (!(cssWidth > 0)) return null
  const needed = cssWidth * Math.min(2, Math.max(1, pixelRatio))
  return WIDTHS.find((w) => w >= needed) ?? null
}

/** A file URL at a width (other URLs, and no width: unchanged). */
export function sizedUrl(url: string, width: number | null): string {
  if (!width || !url.includes('/api/files/')) return url
  return `${url}${url.includes('?') ? '&' : '?'}w=${width}`
}
