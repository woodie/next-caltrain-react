import { strFromU8, unzipSync } from 'fflate'

export type GtfsFiles = Record<string, string>
export type Row = Record<string, string>

export const GTFS_SOURCE = 'http://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip'

/** Downloads Caltrain's GTFS and returns its text files by name (e.g. "trips.txt"). */
export async function downloadGtfs (url: string = GTFS_SOURCE): Promise<GtfsFiles> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GTFS download failed: ${response.status} ${url}`)
  return unzipGtfs(new Uint8Array(await response.arrayBuffer()))
}

export function unzipGtfs (zip: Uint8Array): GtfsFiles {
  const files: GtfsFiles = {}
  for (const [path, bytes] of Object.entries(unzipSync(zip))) {
    const name = path.split('/').pop()!
    if (name.endsWith('.txt')) files[name] = strFromU8(bytes)
  }
  return files
}

/** A GTFS file's rows, keyed by its header. Handles quoted fields ("Trillium Solutions, Inc."). */
export function parseCsv (text: string): Row[] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++ } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      record.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      record.push(field); field = ''
      if (record.some((f) => f !== '')) records.push(record)
      record = []
    } else {
      field += c
    }
  }
  record.push(field)
  if (record.some((f) => f !== '')) records.push(record)

  const [header, ...rows] = records
  return rows.map((r) => Object.fromEntries(header.map((key, i) => [key.trim(), (r[i] ?? '').trim()])))
}
