import type { APIRoute } from 'astro';
import { getCachedProduct } from '@/lib/commerce';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const product = await getCachedProduct(String(params.slug || ''), {
      refresh: url.searchParams.get('___refresh___') === '1',
    });
    return json({ success: true, data: product });
  } catch (error) {
    return json(
      { success: false, data: getErrorMessage(error) },
      getStatus(error),
    );
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
  return error instanceof Error ? error.message : 'Unexpected product error';
}

function getStatus(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status;
  }

  return 500;
}
