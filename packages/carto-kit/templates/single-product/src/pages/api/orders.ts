import type { APIRoute } from 'astro';
import { createOrder } from '@/lib/commerce';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const origin = request.headers.get('origin') ?? new URL(request.url).origin;
    const order = await createOrder({
      ...body,
      origin: typeof body.origin === 'string' && body.origin.length >= 4 ? body.origin : origin,
    });
    return json({ success: true, data: order });
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
  return error instanceof Error ? error.message : 'Unexpected checkout error';
}

function getStatus(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return 500;
}
