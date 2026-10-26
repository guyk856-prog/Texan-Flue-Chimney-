// Monetary arithmetic is exclusively BigInt integer/rational arithmetic.
// Decimal quantities cross the boundary as strings, never binary floats.
export const MAX_CENTS = 2147483647n;
export function cents(value: bigint): number {
  if (value < 0n || value > MAX_CENTS)
    throw new Error("Amount must be between 0 and 2147483647 cents.");
  return Number(value);
}
export function halfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n)
    throw new Error("Invalid nonnegative rational.");
  return (numerator + denominator / 2n) / denominator;
}
export function quantityHundredths(quantity: string): bigint {
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(quantity))
    throw new Error(
      "Quantity must be a decimal string with at most two decimal places.",
    );
  const [whole, fraction = ""] = quantity.split(".");
  const q = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (q <= 0n) throw new Error("Quantity must be positive.");
  return q;
}
function integer(n: number): bigint {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("Money and rates must be nonnegative integers.");
  return BigInt(n);
}
export type MoneyLine = {
  quantity: string;
  unitPriceCents: number;
  discountCents: number;
  taxable: boolean;
};
export function lineTotal(line: MoneyLine): number {
  const gross = halfUp(
    quantityHundredths(line.quantity) * integer(line.unitPriceCents),
    100n,
  );
  const discount = integer(line.discountCents);
  if (discount > gross) throw new Error("Line discount exceeds line amount.");
  return cents(gross - discount);
}
export function documentTotals(
  lines: MoneyLine[],
  options: {
    discountCents: number;
    depositRequestCents: number;
    taxEnabled: boolean;
    feeEnabled: boolean;
    taxRateBasisPoints: number;
    feeRateBasisPoints: number;
  },
) {
  const lineTotals = lines.map(lineTotal);
  const subtotal = lineTotals.reduce((sum, n) => sum + BigInt(n), 0n);
  const discount = integer(options.discountCents);
  if (discount > subtotal)
    throw new Error("Document discount exceeds subtotal.");
  const net = subtotal - discount;
  const taxable = lines.reduce(
    (sum, line, i) => sum + (line.taxable ? BigInt(lineTotals[i]) : 0n),
    0n,
  );
  const taxableDiscount =
    subtotal === 0n ? 0n : halfUp(discount * taxable, subtotal);
  const tax = options.taxEnabled
    ? halfUp(
        (taxable - taxableDiscount) * integer(options.taxRateBasisPoints),
        10000n,
      )
    : 0n;
  const fee = options.feeEnabled
    ? halfUp(net * integer(options.feeRateBasisPoints), 10000n)
    : 0n;
  const total = net + tax + fee;
  if (integer(options.depositRequestCents) > total)
    throw new Error("Deposit request exceeds total.");
  return {
    subtotalCents: cents(subtotal),
    discountCents: cents(discount),
    taxCents: cents(tax),
    feeCents: cents(fee),
    totalCents: cents(total),
    depositRequestCents: cents(integer(options.depositRequestCents)),
  };
}
export function formatCents(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid cents.");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}
