const test = require('node:test');
const assert = require('node:assert');
const { buildWhatsAppLink } = require('../../src/services/whatsappService');

test('normalizes a Malaysian 0-prefixed number to country code 60 and encodes the message', () => {
  const link = buildWhatsAppLink('0123456789', 'Happy Birthday! Here is RM10 off.');
  assert.equal(link, 'https://wa.me/60123456789?text=Happy%20Birthday!%20Here%20is%20RM10%20off.');
});

test('leaves an already-60-prefixed number untouched', () => {
  const link = buildWhatsAppLink('60123456789', 'Hi');
  assert.equal(link, 'https://wa.me/60123456789?text=Hi');
});
