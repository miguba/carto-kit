import type { APIRoute } from 'astro';
import { createPayment } from '@/lib/commerce';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const provider = body.provider === 'stripe' ? 'stripe' : 'paypal';
    const payment = await createPayment(String(body.orderNo || ''), provider, body.fundingSource);
    return json({ success: true, data: payment });
  } catch (error) {
    return json({ success: false, data: getErrorMessage(error) }, getStatus(error));
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected payment error';
}

function getStatus(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return 500;
}
