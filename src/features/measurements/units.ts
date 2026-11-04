// Business lengths are mm. Existing quotation/actual dimension contracts remain metres.
function shift(value: number, places: number): number {
  const [coefficient, exponent = "0"] = value.toString().split("e");
  return Number(`${coefficient}e${Number(exponent) + places}`);
}
export const metresToMm = (value: number) => shift(value, 3);
export const mmToMetres = (value: number) => shift(value, -3);
