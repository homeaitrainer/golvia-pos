function nextInvoiceNumber(db, dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const prefix = `INV-${year}-`;
  const row = db.prepare(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`
  ).get(`${prefix}%`);
  let next = 1;
  if (row) {
    const lastSeq = parseInt(row.invoice_number.slice(prefix.length), 10);
    next = lastSeq + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

module.exports = { nextInvoiceNumber };
