import type { APIRoute } from 'astro';
import { getCommerceConfigFromServer } from '@/lib/commerce';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const config = await getCommerceConfigFromServer();
    return json({ success: true, data: config });
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
  return error instanceof Error ? error.message : 'Unexpected commerce config error';
}

function getStatus(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return 500;
}
