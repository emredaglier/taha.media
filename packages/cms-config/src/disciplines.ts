/**
 * The fixed list of Disciplines (GLOSSARY). The values are also the public `?disiplin=` filter
 * values, so they never change once published. Pure data, no Payload imports, so `web` can use it.
 */
export const DISCIPLINES = ['kurgu', 'motion', 'grafik'] as const

export type Discipline = (typeof DISCIPLINES)[number]

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  kurgu: 'Kurgu',
  motion: 'Motion',
  grafik: 'Grafik',
}
