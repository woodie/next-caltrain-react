// Caltrain's own word on when a timetable takes effect, to suggest as the
// go-live date next to GTFS's feed_start_date.

export const PDF_PAGE = 'https://www.caltrain.com/schedules/pdfs'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

/**
 * The current weekday schedule's "Effective <Month D, YYYY>" date (as
 * YYYY-MM-DD) from the page's HTML: the first such line, since older
 * schedules are listed after it. Null if the page doesn't say.
 */
export function effectiveDate (html: string): string | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const m = /Weekday Schedule \(PDF\)\s*-\s*Effective ([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(text)
  if (!m) return null
  const month = MONTHS.indexOf(m[1])
  if (month === -1) return null
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

export async function fetchEffectiveDate (): Promise<string | null> {
  try {
    const response = await fetch(PDF_PAGE, { headers: { 'User-Agent': 'next-caltrain-react schedule check' } })
    return response.ok ? effectiveDate(await response.text()) : null
  } catch {
    return null
  }
}
