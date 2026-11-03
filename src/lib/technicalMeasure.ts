// Comparison/display precision, not a manufacturing tolerance. Never use this to
// rewrite source values or monetary amounts. Decimal digits + BigInt avoid binary rounding.
export type TechnicalScale = 3 | 6;
export function normalizeTechnicalMeasure(value: string | number, scale: TechnicalScale): string {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) throw new RangeError("Invalid technical measure");
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 308) throw new RangeError("Invalid technical exponent");
  const coefficient = BigInt(match[2] + fraction);
  const shift = scale + exponent - fraction.length;
  let units: bigint;
  if (shift >= 0) units = coefficient * BigInt(10) ** BigInt(shift);
  else {
    const divisor = BigInt(10) ** BigInt(-shift);
    units = coefficient / divisor + (coefficient % divisor * BigInt(2) >= divisor ? BigInt(1) : BigInt(0));
  }
  const digits = units.toString().padStart(scale + 1, "0");
  const decimal = digits.slice(-scale).replace(/0+$/, "");
  return (match[1] === "-" && units !== BigInt(0) ? "-" : "") + digits.slice(0, -scale) + (decimal ? "." + decimal : "");
}
export function technicalMeasuresEqual(before: string | number, after: string | number, scale: TechnicalScale): boolean {
  return normalizeTechnicalMeasure(before, scale) === normalizeTechnicalMeasure(after, scale);
}
export function formatTechnicalValue(field: string, value: string | number): string {
  const name = field.toLowerCase();
  if (!["width", "height", "squaremeters"].includes(name)) return String(value);
  return normalizeTechnicalMeasure(value, name === "squaremeters" ? 6 : 3).replace(".", ",");
}
