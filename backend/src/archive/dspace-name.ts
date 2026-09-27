/** Normalize labels for DSpace ↔ Portal name matching (case/diacritics/space insensitive). */
export function normalizeDspaceLabel(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function labelsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeDspaceLabel(a);
  const right = normalizeDspaceLabel(b);
  return Boolean(left) && left === right;
}
