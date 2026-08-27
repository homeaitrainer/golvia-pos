function buildWhatsAppLink(phone, message) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '60' + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

module.exports = { buildWhatsAppLink };
