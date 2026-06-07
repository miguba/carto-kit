import { useEffect, useMemo, useState } from 'react';
import CheckoutForm from '@/components/CheckoutForm';
import type { ApiResponse, Product } from '@/lib/types';

type Props = {
  slug: string;
  sku: string;
  quantity: number;
  mapboxAccessToken: string;
  paypalClientIdFallback: string;
};

type CommerceConfigResponse = {
  payments: {
    paypal: {
      enabled: boolean;
      mode: 'sandbox' | 'live';
      clientId: string;
    };
  };
};

export default function CheckoutLoader({
  slug,
  sku,
  quantity,
  mapboxAccessToken,
  paypalClientIdFallback,
}: Props) {
  const [product, setProduct] = useState<Product | null>(null);
  const [paypalClientId, setPaypalClientId] = useState(paypalClientIdFallback);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(
    !slug || !sku || !Number.isInteger(quantity) || quantity < 1,
  );

  const variant = useMemo(
    () =>
      product?.variants.find((item) => item.sku === sku) ??
      product?.variants.find(
        (item) => normalizeSku(item.sku) === normalizeSku(sku),
      ) ??
      null,
    [product, sku],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCheckout() {
      if (!slug || !sku || !Number.isInteger(quantity) || quantity < 1) {
        setError('Missing or invalid checkout selection.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [config, loadedProduct] = await Promise.all([
          getCommerce<CommerceConfigResponse>(
            '/api/commerce/config',
          ),
          getCommerce<Product>(
            `/api/commerce/products/${encodeURIComponent(slug)}`,
          ),
        ]);

        if (cancelled) return;
        setPaypalClientId(
          config.payments.paypal.clientId || paypalClientIdFallback,
        );
        if (loadedProduct) setProduct(loadedProduct);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load checkout.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCheckout();

    return () => {
      cancelled = true;
    };
  }, [paypalClientIdFallback, quantity, sku, slug]);

  if (loading) {
    return (
      <section className="grid min-h-[62vh] place-items-center px-4 py-12">
        <div className="max-w-[620px] rounded-brand border border-line bg-white p-8 shadow-soft-card">
          <p className="mb-3.5 mt-0 text-[0.78rem] font-extrabold uppercase tracking-[0.08em] text-brand">
            Secure Checkout
          </p>
          <h1 className="mb-3 mt-0 text-[clamp(2rem,7vw,4rem)] leading-none">
            Loading checkout...
          </h1>
          <p className="text-muted leading-relaxed">
            Preparing product details and payment configuration.
          </p>
        </div>
      </section>
    );
  }

  if (error || !product || !variant) {
    return (
      <section className="grid min-h-[62vh] place-items-center px-4 py-12">
        <div className="max-w-[620px] rounded-brand border border-line bg-white p-8 shadow-soft-card">
          <p className="mb-3.5 mt-0 text-[0.78rem] font-extrabold uppercase tracking-[0.08em] text-brand">
            Checkout Unavailable
          </p>
          <h1 className="mb-3 mt-0 text-[clamp(2rem,7vw,4rem)] leading-none">
            Checkout is temporarily unavailable.
          </h1>
          <p className="text-muted leading-relaxed">
            Please return to the product page and try again in a moment. If the
            issue continues, contact support and we will help you complete your
            order.
          </p>
          {import.meta.env.DEV && (error || (!product && slug) || !variant) ? (
            <p className="text-muted leading-relaxed">
              Development detail:{' '}
              {error ||
                (!product
                  ? `Unable to load product "${slug}".`
                  : `SKU "${sku}" is not available for this product.`)}
            </p>
          ) : null}
          {product && sku ? (
            <p className="text-muted leading-relaxed">Selected SKU: {sku}</p>
          ) : null}
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-brand bg-brand px-[18px] font-extrabold text-white no-underline shadow-[0_16px_40px_rgba(35,100,232,0.26)] hover:bg-brand-strong"
            href="/"
          >
            Return to Store
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="">
      <div className="mx-auto w-[min(1160px,calc(100%-32px))]">
        <CheckoutForm
          product={product}
          variant={variant}
          quantity={quantity}
          paypalClientId={paypalClientId}
          mapboxAccessToken={mapboxAccessToken}
        />
      </div>
    </section>
  );
}

async function getCommerce<T>(path: string) {
  const response = await fetch(path);
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(
      typeof payload.data === 'string' ? payload.data : 'Request failed.',
    );
  }

  return payload.data;
}

function normalizeSku(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
