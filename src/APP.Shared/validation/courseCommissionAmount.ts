import { normalizeCommissionType } from '@shared/constants/amountTypes.constants';

export { normalizeCommissionType } from '@shared/constants/amountTypes.constants';

/** Display / staging amount from university commission + course tuition. */

function parseDecimal(raw: string | undefined): number | null {
  const t = (raw ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (!Number.isFinite(rounded)) return '';
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/**
 * PERCENTAGE → percent of tuition (empty tuition → empty; 0 tuition → 0).
 * AMOUNT → university commission amount as-is.
 */
export function courseCommissionAmount(opts: {
  commissionType?: string;
  commission?: string;
  tuitionFee?: string;
}): string {
  const type = normalizeCommissionType(opts.commissionType);
  const uniCommission = (opts.commission ?? '').trim();
  if (type === 'AMOUNT') return uniCommission;

  if (type === 'PERCENTAGE') {
    const tuitionRaw = (opts.tuitionFee ?? '').trim();
    if (!tuitionRaw) return '';
    const tuition = parseDecimal(tuitionRaw);
    const rate = parseDecimal(uniCommission);
    if (tuition === null || tuition === 0) return '0';
    if (rate === null) return '';
    return formatAmount((tuition * rate) / 100);
  }

  return uniCommission;
}
