import fetch from 'node-fetch';

(async () => {
  try {
    const url = process.env.ORDER_URL || 'http://127.0.0.1:5001/api/public/orders';
    const body = {
      items: [{ id: 'm1', name: 'Test Item', qty: 1, price: 99 }],
      customerName: 'Test Customer',
      customerPhone: '09171234567'
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log('status', res.status);
    const data = await res.json().catch(() => null);
    console.log('response', data);
  } catch (err) {
    console.error('error', err.message || err);
    process.exit(1);
  }
})();
