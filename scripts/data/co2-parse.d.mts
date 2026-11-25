export function parseAnnualCsv(text: string): { year: number; ppm: number; unc: number | null }[];
export function parseMonthlyCsv(text: string): { year: number; month: number; ppm: number }[];
