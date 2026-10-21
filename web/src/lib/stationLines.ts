// "San Francisco / to Palo Alto": the "to" goes on whichever line keeps them balanced.
export function stationLines (origin: string, destination: string): [string, string] {
  return origin.length + 3 >= destination.length
    ? [origin, `to ${destination}`]
    : [`${origin} to`, destination]
}
