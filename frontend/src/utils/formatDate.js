export function formatDate(value, options = {}) {
  if (!value) {
    return 'Date TBA';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date TBA';
  }

  return new Intl.DateTimeFormat('en-IN', options).format(date);
}
