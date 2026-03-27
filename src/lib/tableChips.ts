/** Shared chip denominations for Pixi table + shell (cents, label, Pixi fill colors). */
export const TABLE_CHIP_DENOMS = [
  { cents: 100, label: '1', fill: 0xe5e7eb, ring: 0x9ca3af },
  { cents: 500, label: '5', fill: 0x22c55e, ring: 0x14532d },
  { cents: 2500, label: '25', fill: 0xeab308, ring: 0x713f12 },
  { cents: 10000, label: '100', fill: 0xa855f7, ring: 0x581c87 },
  { cents: 50000, label: '500', fill: 0xf43f5e, ring: 0x881337 },
] as const;
