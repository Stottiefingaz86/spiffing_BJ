export interface PaytableRow {
  id: string
  symbol: string
  label: string
  description?: string
  x3: string
  x4: string
  x5: string
}

/** Generic demo paytable — replace per game integration. */
export const DEMO_PAYTABLE: PaytableRow[] = [
  {
    id: 'wild',
    symbol: 'W',
    label: 'Wild',
    description: 'Substitutes for all symbols except scatter.',
    x3: '—',
    x4: '—',
    x5: '—',
  },
  {
    id: 'high-1',
    symbol: 'A',
    label: 'High 1',
    x3: '5',
    x4: '25',
    x5: '100',
  },
  {
    id: 'high-2',
    symbol: 'B',
    label: 'High 2',
    x3: '4',
    x4: '20',
    x5: '80',
  },
  {
    id: 'high-3',
    symbol: 'C',
    label: 'High 3',
    x3: '3',
    x4: '15',
    x5: '60',
  },
  {
    id: 'high-4',
    symbol: 'D',
    label: 'High 4',
    x3: '2',
    x4: '10',
    x5: '40',
  },
]

export const DEFAULT_PAYTABLE_NOTE =
  'Line wins: payout amounts × your line bet (same rules as the reels).'
