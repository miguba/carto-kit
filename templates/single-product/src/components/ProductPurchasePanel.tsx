import { ArrowRight, BadgeCheck, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  formatMoney,
  formatVariantName,
  normalizeImageUrl,
  productImages,
  productVideo,
} from '@/lib/format';
import type { Product } from '@/lib/types';

type PurchaseProductItem = {
  key: string;
  label: string;
  product: Product;
};

type Props = {
  mode: 'single' | 'group';
  defaultKey: string;
  initialKey?: string;
  items: PurchaseProductItem[];
};

const panelWidth = 'mx-auto max-w-6xl';
const variantCardBase =
  'relative grid w-full grid-cols-[34px_minmax(0,1fr)] gap-3 border bg-white p-[21px_20px_22px] text-left text-ink transition disabled:cursor-not-allowed disabled:opacity-45 max-[760px]:grid-cols-[30px_minmax(0,1fr)] max-[760px]:p-[18px_16px]';

export default function ProductPurchasePanel({
  mode,
  defaultKey,
  initialKey = '',
  items,
}: Props) {
  const initialActiveKey = getInitialActiveKey(items, defaultKey, initialKey);
  const [activeKey, setActiveKey] = useState(initialActiveKey);
  const activeItem =
    items.find((item) => item.key === activeKey) ?? items[0] ?? null;
  const product = activeItem?.product ?? null;
  const firstAvailable = useMemo(
    () =>
      product?.variants.find((variant) => variant.stock > 0) ??
      product?.variants[0] ??
      null,
    [product],
  );
  const [selectedSku, setSelectedSku] = useState(firstAvailable?.sku ?? '');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);

  const selectedVariant =
    product?.variants.find((variant) => variant.sku === selectedSku) ?? null;
  const decoration = product?.decoration ?? product?.meta?.decoration ?? null;
  const decorationImages = useMemo(
    () =>
      new Set(
        (decoration?.pics ?? [])
          .map((image) => normalizeImageUrl(image))
          .filter(Boolean),
      ),
    [decoration],
  );
  const images = useMemo(
    () =>
      product
        ? productImages(product, selectedVariant).filter(
            (image) => !decorationImages.has(image),
          )
        : [],
    [decorationImages, product, selectedVariant],
  );
  const video = product ? productVideo(product) : '';
  const mediaItems = useMemo(
    () => [
      ...(video
        ? [{ type: 'video' as const, src: video, poster: images[0] }]
        : []),
      ...images.map((image) => ({ type: 'image' as const, src: image })),
    ],
    [images, video],
  );
  const sellingPoints = (
    product?.sellingPoints?.length
      ? product.sellingPoints
      : (product?.meta?.sellingPoints ?? [])
  )
    .map((point) => point.trim())
    .filter(Boolean);
  const activeMedia = mediaItems[activeImage] ?? mediaItems[0];
  const hasMedia = mediaItems.length > 0;
  const hasDiscount =
    selectedVariant?.compareAtPrice &&
    selectedVariant.compareAtPrice > selectedVariant.price;
  const savings = hasDiscount
    ? selectedVariant.compareAtPrice! - selectedVariant.price
    : 0;
  const stockLimit = selectedVariant?.stock ?? 0;
  const canBuy = Boolean(
    product &&
    selectedVariant &&
    selectedVariant.stock > 0 &&
    quantity >= 1 &&
    quantity <= selectedVariant.stock,
  );
  const subtotal = selectedVariant
    ? selectedVariant.price * quantity
    : (product?.minPrice ?? 0);
  const stockText = selectedVariant
    ? selectedVariant.stock > 0
      ? `${selectedVariant.stock} available`
      : 'Out of stock'
    : 'Select option';

  useEffect(() => {
    setSelectedSku(firstAvailable?.sku ?? '');
    setQuantity(1);
    setError('');
    setActiveImage(0);
  }, [firstAvailable, activeKey]);

  useEffect(() => {
    setActiveImage(0);
  }, [selectedSku, video]);

  useEffect(() => {
    if (mode !== 'group' || !activeItem) {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get('product') === activeItem.key) {
      return;
    }

    url.searchParams.set('product', activeItem.key);
    window.history.replaceState(
      {},
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [activeItem, mode]);

  if (!product || !activeItem) {
    return null;
  }

  function clampQuantity(nextQuantity: number, variant = selectedVariant) {
    if (!Number.isFinite(nextQuantity)) {
      return 1;
    }

    const maxQuantity = Math.max(variant?.stock ?? 1, 1);
    return Math.min(Math.max(Math.trunc(nextQuantity), 1), maxQuantity);
  }

  function chooseTab(key: string) {
    const nextItem = items.find((item) => item.key === key);
    if (!nextItem || nextItem.key === activeKey) {
      return;
    }

    setActiveKey(nextItem.key);
  }

  function chooseVariant(sku: string) {
    const variant = product?.variants.find((item) => item.sku === sku);
    if (!variant || variant.stock <= 0) {
      return;
    }

    setSelectedSku(variant.sku);
    setError('');
    setQuantity((current) => clampQuantity(current, variant));
  }

  function variantBadge(variant: Product['variants'][number]) {
    return (
      variant.decoration?.txts?.[0] ??
      (variant.compareAtPrice ? 'Limited offer' : 'Product option')
    );
  }

  function stockLabel(stock: number) {
    if (stock <= 0) {
      return 'Out of stock';
    }

    return `${stock} in stock`;
  }

  function buyNow() {
    if (!selectedVariant) {
      setError('Please choose a product option before checkout.');
      return;
    }

    if (selectedVariant.stock <= 0) {
      setError('This product option is currently unavailable.');
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Please choose a valid quantity.');
      return;
    }

    if (quantity > selectedVariant.stock) {
      setError(`Only ${selectedVariant.stock} available for this option.`);
      setQuantity(clampQuantity(quantity));
      return;
    }

    const params = new URLSearchParams({
      slug: product.slug,
      sku: selectedVariant.sku,
      quantity: String(quantity),
    });

    window.location.href = `/checkout?${params.toString()}`;
  }

  return (
    <>
      <section className="pb-7" id="buy">
        <div
          className={
            hasMedia
              ? `${panelWidth} grid grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)] items-start gap-x-6 gap-y-4 max-[760px]:grid-cols-1`
              : `${panelWidth} grid grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)] items-start gap-x-6 gap-y-4 max-[760px]:grid-cols-1`
          }
        >
          {decoration?.txts?.[0] ? (
            <p className="col-span-full mb-3 mt-5 justify-self-center font-serif text-center text-[clamp(1.42rem,3vw,1.95rem)] font-black leading-tight text-[#232323] max-[760px]:mb-3 max-[760px]:mt-5 max-[760px]:text-[1.15rem]">
              {decoration.txts[0]}
            </p>
          ) : null}

          {mode === 'group' && items.length > 1 ? (
            <div
              className="col-span-full grid rounded-[8px] bg-[#f0f2f5] p-1 max-[760px]:overflow-x-auto"
              role="tablist"
              aria-label="Product options"
              style={{
                gridTemplateColumns: `repeat(${items.length}, minmax(160px, 1fr))`,
              }}
            >
              {items.map((item) => {
                const active = item.key === activeItem.key;
                return (
                  <button
                    aria-controls={`purchase-panel-${item.key}`}
                    aria-selected={active}
                    className={[
                      'min-h-11 whitespace-nowrap rounded-[7px] px-4 text-center font-serif text-base font-medium text-[#667085] transition max-[760px]:text-sm',
                      active
                        ? 'bg-white text-[#334155] shadow-[0_1px_5px_rgba(15,23,42,0.16)]'
                        : 'hover:bg-white/65',
                    ].join(' ')}
                    id={`purchase-tab-${item.key}`}
                    key={item.key}
                    onClick={() => chooseTab(item.key)}
                    role="tab"
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div
            className="grid min-w-0 gap-4"
            id={`purchase-panel-${activeItem.key}`}
            role={mode === 'group' ? 'tabpanel' : undefined}
            aria-labelledby={
              mode === 'group' ? `purchase-tab-${activeItem.key}` : undefined
            }
          >
            {hasMedia ? (
              <div className="grid gap-2.5" aria-label="Product media gallery">
                <div className="grid aspect-square min-h-0 w-full place-items-center overflow-hidden bg-white">
                  {activeMedia?.type === 'video' ? (
                    <video
                      className="h-full w-full object-contain"
                      aria-label={`${product.title} product video`}
                      autoPlay
                      controls
                      loop
                      muted
                      playsInline
                      poster={activeMedia.poster}
                      preload="metadata"
                    >
                      <source src={activeMedia.src} />
                    </video>
                  ) : activeMedia ? (
                    <img
                      className="h-full w-full object-contain"
                      src={activeMedia.src}
                      alt={product.title}
                    />
                  ) : null}
                </div>
                {mediaItems.length > 1 ? (
                  <div
                    className="hidden gap-2.5 overflow-x-auto pt-0.5"
                    aria-label="Product media thumbnails"
                  >
                    {mediaItems.map((item, index) => (
                      <button
                        aria-label={`View product ${item.type} ${index + 1}`}
                        aria-pressed={activeImage === index}
                        className={[
                          'relative h-[70px] w-[70px] flex-none overflow-hidden border border-line bg-white p-[3px] opacity-70 transition hover:opacity-95',
                          activeImage === index
                            ? 'border-[#0067b8] opacity-100 shadow-[0_0_0_2px_rgba(0,103,184,0.12)]'
                            : '',
                        ].join(' ')}
                        key={`${item.type}-${item.src}`}
                        onClick={() => setActiveImage(index)}
                        type="button"
                      >
                        {item.type === 'video' ? (
                          <>
                            {item.poster ? (
                              <img
                                className="h-full w-full object-cover"
                                src={item.poster}
                                alt=""
                              />
                            ) : (
                              <span
                                className="grid h-full w-full place-items-center text-xs font-black text-brand"
                                aria-hidden="true"
                              >
                                Video
                              </span>
                            )}
                            <b
                              className="absolute bottom-1 right-1 rounded-full bg-ink/75 px-1.5 py-1 text-[0.58rem] uppercase leading-none text-white"
                              aria-hidden="true"
                            >
                              Play
                            </b>
                          </>
                        ) : (
                          <img
                            className="h-full w-full object-cover"
                            src={item.src}
                            alt=""
                          />
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-[360px] place-items-center bg-[#f7f9ff] p-8 text-center max-[760px]:min-h-[220px]">
                <div>
                  <span className="text-[clamp(3rem,7vw,5rem)] font-black text-[#0b67a3]">
                    365
                  </span>
                  <strong className="mt-2 block text-[clamp(1.4rem,3vw,2.2rem)] font-black text-[#111827]">
                    Microsoft 365
                  </strong>
                </div>
              </div>
            )}
            <h1 className="m-0 font-serif text-xl font-bold leading-[1.05] text-[#111827]">
              {product.title}
            </h1>
            {sellingPoints.length ? (
              <div className="grid gap-2.5">
                {sellingPoints.map((point) => (
                  <span
                    className="flex items-start gap-2 font-sans text-[0.98rem] font-extralight leading-[1.38] text-[#1f2937] max-[760px]:text-[0.9rem]"
                    key={point}
                  >
                    <BadgeCheck
                      className="mt-0.5 flex-none text-green-500"
                      size={16}
                    />
                    {point}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="min-w-0 self-start" aria-label="Purchase panel">
            <div className="hidden">
              <span>Selected item</span>
              <strong
                className={selectedVariant?.stock === 0 ? 'sold-out' : ''}
              >
                {stockText}
              </strong>
            </div>
            <div className="hidden">
              <strong>
                {selectedVariant
                  ? formatMoney(selectedVariant.price, product.currency)
                  : formatMoney(product.minPrice, product.currency)}
              </strong>
              {hasDiscount ? (
                <span>
                  {formatMoney(
                    selectedVariant!.compareAtPrice!,
                    product.currency,
                  )}
                </span>
              ) : null}
              {savings > 0 ? (
                <em>Save {formatMoney(savings, product.currency)}</em>
              ) : null}
            </div>

            <div
              className="grid gap-3"
              aria-label="Product variants"
              role="radiogroup"
            >
              {product.variants.map((variant) => {
                const active = variant.sku === selectedSku;
                const variantDiscount =
                  variant.compareAtPrice &&
                  variant.compareAtPrice > variant.price
                    ? variant.compareAtPrice - variant.price
                    : 0;
                const variantImage = variant.image
                  ? normalizeImageUrl(variant.image)
                  : '';

                return (
                  <button
                    aria-checked={active}
                    className={variantCardBase}
                    disabled={variant.stock <= 0}
                    key={variant.id}
                    onClick={() => chooseVariant(variant.sku)}
                    role="radio"
                    style={{
                      borderColor: active ? '#0b8ed3' : '#d8e2ec',
                      boxShadow: active ? '0 0 0 1px #0b8ed3' : 'none',
                    }}
                    type="button"
                  >
                    <span
                      className="grid place-items-center self-center rounded-full bg-white"
                      style={{
                        width: 27,
                        height: 27,
                        border: active
                          ? '3px solid #0b8ed3'
                          : '1.5px solid #111827',
                      }}
                      aria-hidden="true"
                    >
                      {active ? (
                        <span className="block h-2.5 w-2.5 rounded-full bg-[#0b8ed3]" />
                      ) : null}
                    </span>
                    {variantImage ? (
                      <span className="hidden" aria-hidden="true">
                        <img src={variantImage} alt="" />
                      </span>
                    ) : null}
                    <span className="grid min-w-0 gap-3">
                      <span className="flex items-center justify-between gap-3.5">
                        <em className="text-[0.88rem] font-black uppercase not-italic leading-tight text-[#667085] max-[760px]:text-[0.75rem]">
                          {variantBadge(variant)}
                        </em>
                        <b
                          className={
                            variant.stock <= 0
                              ? 'text-[0.9rem] font-black leading-tight text-danger max-[760px]:text-[0.75rem]'
                              : 'text-[0.9rem] font-black leading-tight text-[#008a2e] max-[760px]:text-[0.75rem]'
                          }
                        >
                          {stockLabel(variant.stock)}
                        </b>
                      </span>
                      <span className="break-words font-serif text-[1.45rem] font-black leading-tight text-[#232323] max-[760px]:text-[1.12rem]">
                        {formatVariantName(variant)}
                      </span>
                      <span className="flex flex-wrap items-baseline gap-3">
                        {variant.compareAtPrice &&
                        variant.compareAtPrice > variant.price ? (
                          <del className="text-[1.18rem] font-black text-[#0b67a3] decoration-[#ef3b2d] decoration-[3px] max-[760px]:text-base">
                            {formatMoney(
                              variant.compareAtPrice,
                              product.currency,
                            )}
                          </del>
                        ) : null}
                        <strong className="text-[1.45rem] font-black text-[#ef3b2d] max-[760px]:text-[1.18rem]">
                          {formatMoney(variant.price, product.currency)}
                        </strong>
                      </span>
                      {variantDiscount > 0 ? (
                        <small className="text-[0.95rem] font-medium text-[#667085] max-[760px]:text-sm">
                          Save {formatMoney(variantDiscount, product.currency)}{' '}
                          For You
                        </small>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="hidden">
              <span>Quantity</span>
              <div aria-label="Quantity selector">
                <button
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => {
                    setError('');
                    setQuantity((current) => clampQuantity(current - 1));
                  }}
                  type="button"
                >
                  <Minus size={16} />
                </button>
                <input
                  aria-label="Quantity"
                  max={stockLimit > 0 ? stockLimit : 1}
                  min="1"
                  onChange={(event) => {
                    setError('');
                    setQuantity(clampQuantity(Number(event.target.value)));
                  }}
                  type="number"
                  value={quantity}
                />
                <button
                  aria-label="Increase quantity"
                  disabled={stockLimit <= 0 || quantity >= stockLimit}
                  onClick={() => {
                    setError('');
                    setQuantity((current) => clampQuantity(current + 1));
                  }}
                  type="button"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {selectedVariant ? (
              <p className="hidden">
                Selected: {formatVariantName(selectedVariant)} · SKU{' '}
                {selectedVariant.sku}
              </p>
            ) : null}
            <div className="hidden" aria-label="Purchase summary">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal, product.currency)}</strong>
            </div>
            {error ? (
              <p className="mt-3.5 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2.5 font-bold leading-snug text-red-900">
                {error}
              </p>
            ) : null}

            <button
              className="mt-4 inline-flex min-h-[54px] w-full items-center justify-center gap-2.5 bg-[#0b67a3] px-5 text-base font-black text-white shadow-none hover:bg-[#084f7e] disabled:cursor-not-allowed disabled:bg-[#9aa3b3] disabled:opacity-80 max-[760px]:min-h-12"
              disabled={!canBuy}
              onClick={buyNow}
              type="button"
            >
              {selectedVariant?.stock === 0 ? 'Sold out' : 'Buy now'}{' '}
              <ArrowRight size={18} />
            </button>
            <div className="pt-5">
              <img
                className="mx-auto  w-[70%]"
                src="/secure-checkout.png"
                alt="Guaranteed safe checkout"
                loading="lazy"
              />
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function getInitialActiveKey(
  items: PurchaseProductItem[],
  defaultKey: string,
  initialKey: string,
) {
  const initialItem = items.find((item) => item.key === initialKey);
  if (initialItem) {
    return initialItem.key;
  }

  const defaultItem = items.find((item) => item.key === defaultKey);
  return defaultItem?.key ?? items[0]?.key ?? '';
}
