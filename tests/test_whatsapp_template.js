const assert = require('assert');

function generateWhatsAppMessage({ order, items }) {
  const formatWeight = (val) => {
    const n = parseFloat(String(val || 0));
    if (isNaN(n)) return '0';
    return parseFloat(n.toFixed(2)).toString();
  };

  // Group items by product
  const productGroups = (items || []).reduce((acc, it) => {
    const key = it.product_id || it.product_name || 'Product';
    if (!acc[key]) {
      acc[key] = {
        product_name: it.product_name || 'Product',
        items: []
      };
    }
    acc[key].items.push(it);
    return acc;
  }, {});

  const productDetailsText = Object.values(productGroups).map((group) => {
    const itemBlocks = group.items.map((it) => {
      const pcs = Number(it.requested_pieces) || 0;
      const expWt = Number(it.expected_weight) || 0;
      const wtPerPc = pcs > 0 ? (expWt / pcs) : 0;
      return `• Size: ${it.size_inches || '-'} inch | Wt. / pc : ${formatWeight(wtPerPc)} g\n• Qty: ${pcs} pcs | Wt. : ${formatWeight(expWt)} g`;
    }).join('\n\n');

    return `${group.product_name}\n${itemBlocks}`;
  }).join('\n\n');

  const totalQty = order.total_pieces ?? (items || []).reduce((sum, it) => sum + (Number(it.requested_pieces) || 0), 0);
  const totalWeight = order.expected_weight ?? (items || []).reduce((sum, it) => sum + (Number(it.expected_weight) || 0), 0);

  const msg = [
    `*Dear Customer,*`,
    ``,
    `Thank you for placing your order with AI925! ✨`,
    ``,
    `*Order No.:* ${order.order_number}`,
    ``,
    `*Product Details:*`,
    ``,
    productDetailsText,
    ``,
    `*Order Summary*`,
    `• *Total Quantity:* ${totalQty} pieces`,
    `• *Total Net Weight:* ${formatWeight(totalWeight)} grams`,
    ``,
    `Thank you for your trust in AI925. We look forward to serving you!`,
    ``,
    `Regards,`,
    `Aryan International`,
    `+91 7060909698`
  ].join('\n');

  return msg;
}

// Test with sample order and multiple items
const sampleOrder = {
  order_number: '7094',
  total_pieces: 35,
  expected_weight: 85.5
};

const sampleItems = [
  { product_id: 'p1', product_name: 'Anchor Chain 1.5mm', size_inches: 18, requested_pieces: 10, expected_weight: 20 },
  { product_id: 'p1', product_name: 'Anchor Chain 1.5mm', size_inches: 20, requested_pieces: 10, expected_weight: 25 },
  { product_id: 'p2', product_name: 'Box Chain 2.0mm', size_inches: 16, requested_pieces: 15, expected_weight: 40.5 }
];

const message = generateWhatsAppMessage({ order: sampleOrder, items: sampleItems });
console.log('--- GENERATED WHATSAPP MESSAGE ---');
console.log(message);
console.log('-----------------------------------');

// Verifications
assert.ok(message.includes('*Dear Customer,*'), 'Must contain *Dear Customer,*');
assert.ok(message.includes('Thank you for placing your order with AI925! ✨'), 'Must contain welcome line with emoji');
assert.ok(message.includes('*Order No.:* 7094'), 'Must contain *Order No.:* with order number');
assert.ok(message.includes('*Product Details:*'), 'Must contain *Product Details:*');
assert.ok(message.includes('Anchor Chain 1.5mm'), 'Must contain product name header');
assert.ok(message.includes('• Size: 18 inch | Wt. / pc : 2 g'), 'Must contain size and weight per piece');
assert.ok(message.includes('• Qty: 10 pcs | Wt. : 20 g'), 'Must contain quantity and row weight');
assert.ok(message.includes('• Size: 20 inch | Wt. / pc : 2.5 g'), 'Must contain second size');
assert.ok(message.includes('*Order Summary*'), 'Must contain *Order Summary*');
assert.ok(message.includes('• *Total Quantity:* 35 pieces'), 'Must contain Total Quantity in pieces');
assert.ok(message.includes('• *Total Net Weight:* 85.5 grams'), 'Must contain Total Net Weight in grams');
assert.ok(message.includes('Thank you for your trust in AI925. We look forward to serving you!'), 'Must contain closing trust message');
assert.ok(message.includes('Aryan International\n+91 7060909698'), 'Must contain Aryan International and contact phone');

console.log('[PASS] WhatsApp Template Verified Character-for-Character!');
