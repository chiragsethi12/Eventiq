const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

export function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 'TBA';
  }

  return currencyFormatter.format(amount);
}
