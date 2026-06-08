import {
  ArrowRight,
  BadgeCheck,
  Minus,
  Play,
  Plus,
  Timer,
  Truck,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  IMAGE_PRESETS,
  formatMoney,
  formatVariantName,
  imageSrcSet,
  normalizeImageUrl,
  optimizedImageUrl,
  productImages,
  productSellingPoints,
  productTrustSignals,
  productVideo,
} from "@/lib/format";
import { setCommerceMediaConfig, type CommerceMediaConfig } from "@/lib/config";
import type { Product } from "@/lib/types";

type Props = {
  product: Product;
  mediaConfig?: CommerceMediaConfig;
};

const OFFER_COUNTDOWN_SECONDS = 15 * 60;
const OFFER_COUNTDOWN_MS = OFFER_COUNTDOWN_SECONDS * 1000;
const MIN_DISPLAY_STOCK = 2;
const MAX_DISPLAY_STOCK = 9;

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function stableNumberSeed(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function displayStockForSku(
  productSlug: string,
  variant: Product["variants"][number],
) {
  if (variant.stock <= 0) {
    return 0;
  }

  const range = MAX_DISPLAY_STOCK - MIN_DISPLAY_STOCK + 1;
  const seed = stableNumberSeed(`${productSlug}:${variant.sku || variant.id}`);

  return MIN_DISPLAY_STOCK + (seed % range);
}

export default function ProductPurchasePanel({ product, mediaConfig }: Props) {
  setCommerceMediaConfig(mediaConfig);

  const firstAvailable =
    product.variants.find((variant) => variant.stock > 0) ??
    product.variants[0] ??
    null;
  const [selectedSku, setSelectedSku] = useState(firstAvailable?.sku ?? "");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const [mainMediaLoading, setMainMediaLoading] = useState(false);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(
    OFFER_COUNTDOWN_SECONDS,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const heroPreloadCache = useRef(new Set<string>());

  const selectedVariant =
    product.variants.find((variant) => variant.sku === selectedSku) ?? null;
  const images = useMemo(
    () => productImages(product, selectedVariant),
    [product, selectedVariant],
  );
  const video = productVideo(product);
  const trust = productTrustSignals(product);
  const offerCountdownStorageKey = useMemo(
    () => `joys-box:offer-countdown:${product.slug}`,
    [product.slug],
  );
  const mediaItems = useMemo(
    () => [
      ...(video
        ? [{ type: "video" as const, src: video, poster: images[0] }]
        : []),
      ...images.map((image) => ({ type: "image" as const, src: image })),
    ],
    [images, video],
  );
  const sellingPoints = productSellingPoints(product)
    .map((point) => point.trim())
    .filter(Boolean);
  const activeMedia = mediaItems[activeImage] ?? mediaItems[0];
  const activeMediaKey = activeMedia
    ? `${activeMedia.type}-${activeMedia.src}`
    : "empty";
  const activeVideoPoster =
    activeMedia?.type === "video" && activeMedia.poster
      ? optimizedImageUrl(activeMedia.poster, IMAGE_PRESETS.hero)
      : "";
  const hasMedia = mediaItems.length > 0;
  const hasDiscount =
    selectedVariant?.compareAtPrice &&
    selectedVariant.compareAtPrice > selectedVariant.price;
  const savings = hasDiscount
    ? selectedVariant.compareAtPrice! - selectedVariant.price
    : 0;
  const displayStockLimit = selectedVariant
    ? displayStockForSku(product.slug, selectedVariant)
    : 0;
  const totalDisplayStock = product.variants.reduce(
    (total, variant) => total + displayStockForSku(product.slug, variant),
    0,
  );
  const canBuy = Boolean(
    selectedVariant &&
    selectedVariant.stock > 0 &&
    quantity >= 1 &&
    quantity <= displayStockLimit,
  );
  const subtotal = selectedVariant
    ? selectedVariant.price * quantity
    : product.minPrice;
  const stockText = selectedVariant
    ? totalDisplayStock > 0
      ? `${totalDisplayStock} available`
      : "Out of stock"
    : "Select option";
  const offerCountdown = formatCountdown(offerSecondsLeft);

  useEffect(() => {
    setActiveImage(0);
  }, [selectedSku, video]);

  useEffect(() => {
    const now = Date.now();
    let offerDeadline = now + OFFER_COUNTDOWN_MS;

    try {
      const storedDeadline = Number(
        window.localStorage.getItem(offerCountdownStorageKey),
      );

      if (Number.isFinite(storedDeadline) && storedDeadline > now) {
        offerDeadline = storedDeadline;
      } else {
        window.localStorage.setItem(
          offerCountdownStorageKey,
          String(offerDeadline),
        );
      }
    } catch {
      offerDeadline = now + OFFER_COUNTDOWN_MS;
    }

    function syncCountdown() {
      const nextSecondsLeft = Math.max(
        Math.ceil((offerDeadline - Date.now()) / 1000),
        0,
      );

      setOfferSecondsLeft(nextSecondsLeft);
    }

    syncCountdown();

    const intervalId = window.setInterval(() => {
      syncCountdown();
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [offerCountdownStorageKey]);

  useEffect(() => {
    setMainMediaLoading(activeMedia?.type === "image");
  }, [activeMedia?.type, activeMediaKey]);

  useEffect(() => {
    const videoElement = videoRef.current;
    setShouldLoadVideo(false);
    setIsVideoPlaying(false);

    if (!videoElement) {
      return;
    }

    videoElement.pause();
    videoElement.currentTime = 0;
  }, [activeImage, selectedSku]);

  useEffect(() => {
    const videoElement = videoRef.current;

    if (!shouldLoadVideo || !videoElement) {
      return;
    }

    setVideoDisplaySize();
    videoElement.play().catch(() => undefined);
  }, [shouldLoadVideo, activeMediaKey]);

  function playActiveVideo() {
    const videoElement = videoRef.current;

    setShouldLoadVideo(true);

    if (videoElement) {
      setVideoDisplaySize();
      videoElement.play().catch(() => undefined);
    }
  }

  function setVideoDisplaySize() {
    const videoElement = videoRef.current;

    if (
      !videoElement ||
      !videoElement.videoWidth ||
      !videoElement.videoHeight
    ) {
      return;
    }

    const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
    videoElement.style.setProperty(
      "--video-display-width",
      `${Math.round(videoElement.videoWidth / pixelRatio)}px`,
    );
    videoElement.style.setProperty(
      "--video-display-height",
      `${Math.round(videoElement.videoHeight / pixelRatio)}px`,
    );
  }

  function clampQuantity(nextQuantity: number, variant = selectedVariant) {
    if (!Number.isFinite(nextQuantity)) {
      return 1;
    }

    const maxQuantity =
      variant && variant.stock > 0
        ? displayStockForSku(product.slug, variant)
        : 1;

    return Math.min(Math.max(Math.trunc(nextQuantity), 1), maxQuantity);
  }

  function chooseVariant(sku: string) {
    const variant = product.variants.find((item) => item.sku === sku);
    if (!variant || variant.stock <= 0) {
      return;
    }

    setSelectedSku(variant.sku);
    setError("");
    setQuantity((current) => clampQuantity(current, variant));
  }

  function variantBadge(variant: Product["variants"][number]) {
    return (
      variant.decoration?.txts?.[0] ??
      (variant.compareAtPrice ? "Limited offer" : "Product option")
    );
  }

  function stockLabel(variant: Product["variants"][number]) {
    if (variant.stock <= 0) {
      return "Out of stock";
    }

    return `${displayStockForSku(product.slug, variant)} in stock`;
  }

  function preloadHeroImage(src: string | undefined) {
    if (!src) {
      return;
    }

    const url = optimizedImageUrl(src, IMAGE_PRESETS.hero);
    if (heroPreloadCache.current.has(url)) {
      return;
    }

    heroPreloadCache.current.add(url);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  }

  function chooseMedia(index: number) {
    if (index === activeImage) {
      return;
    }

    setMainMediaLoading(mediaItems[index]?.type === "image");
    setActiveImage(index);
  }

  function placeholderStyle(src: string | undefined, enabled = true) {
    if (!enabled || !src) {
      return undefined;
    }

    return {
      "--image-placeholder": `url("${optimizedImageUrl(src, IMAGE_PRESETS.tiny)}")`,
    } as CSSProperties;
  }

  function thumbnailLoading(index: number) {
    return index < 5 ? "eager" : "lazy";
  }

  function thumbnailFetchPriority(index: number) {
    return index < 5 ? "auto" : "low";
  }

  function optionImageLoading(active: boolean) {
    return active ? "eager" : "lazy";
  }

  function optionImageFetchPriority(active: boolean) {
    return active ? "auto" : "low";
  }

  function buyNow() {
    if (!selectedVariant) {
      setError("Please choose a product option before checkout.");
      return;
    }

    if (selectedVariant.stock <= 0) {
      setError("This product option is currently unavailable.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Please choose a valid quantity.");
      return;
    }

    if (quantity > displayStockLimit) {
      setError(`Only ${displayStockLimit} available for this option.`);
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
      <section className="hero-section" id="buy">
        <div
          className={[
            "container hero-grid",
            hasMedia ? "" : "no-media",
            sellingPoints.length ? "" : "no-copy",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="mobile-product-heading">
            <div className="mb-1">
              <span className="font-bold text-green-700">
                <Truck
                  className=" align-middle mr-1"
                  size={20}
                  strokeWidth={3}
                  aria-hidden="true"
                />
                Fast delivery: 3 business days
              </span>
            </div>

            <h1 className="purchase-title">{product.title}</h1>
            <div
              className="purchase-trust-row"
              aria-label={`${trust.rating} stars, ${trust.soldText}`}
            >
              <span aria-hidden="true">★★★★★</span>
              <strong>{trust.rating}</strong>
              <em>{trust.soldText}</em>
            </div>
          </div>

          {sellingPoints.length ? (
            <div className="hero-copy">
              <p className="eyebrow">About this item</p>
              <div className="grid gap-2.5 mt-3">
                {sellingPoints.map((point) => (
                  <span
                    className="flex items-center gap-2.5 text-sm font-bold text-muted"
                    key={point}
                  >
                    <BadgeCheck
                      size={16}
                      className="flex-shrink-0 text-success"
                    />
                    {point}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {hasMedia ? (
            <div className="product-media" aria-label="Product media gallery">
              <div
                className={[
                  "product-hero-frame",
                  "image-placeholder-frame",
                  mainMediaLoading ? "is-loading" : "",
                  activeMedia?.type === "video" ? "video-stage" : "",
                  activeMedia?.type === "video" && !isVideoPlaying
                    ? "poster-stage"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={placeholderStyle(
                  activeMedia?.type === "video"
                    ? activeMedia.poster
                    : activeMedia?.src,
                )}
              >
                {activeMedia?.type === "video" ? (
                  <>
                    <video
                      aria-label={`${product.title} product video`}
                      className={
                        activeVideoPoster && !isVideoPlaying
                          ? "waiting-for-play"
                          : ""
                      }
                      controls
                      onLoadedMetadata={setVideoDisplaySize}
                      onPause={() => setIsVideoPlaying(false)}
                      onPlay={() => setIsVideoPlaying(true)}
                      playsInline
                      poster={activeVideoPoster}
                      preload="none"
                      ref={videoRef}
                    >
                      {shouldLoadVideo ? (
                        <source src={activeMedia.src} />
                      ) : null}
                    </video>
                    {activeVideoPoster && !isVideoPlaying ? (
                      <img
                        alt=""
                        className="product-video-poster"
                        decoding="async"
                        src={activeVideoPoster}
                      />
                    ) : null}
                    {!isVideoPlaying ? (
                      <button
                        aria-label="Play product video"
                        className="product-video-play"
                        onClick={playActiveVideo}
                        type="button"
                      >
                        <span aria-hidden="true">
                          <Play
                            size={34}
                            fill="currentColor"
                            strokeWidth={2.75}
                          />
                        </span>
                        <b>Play video</b>
                      </button>
                    ) : null}
                  </>
                ) : activeMedia ? (
                  <img
                    key={activeMediaKey}
                    className="product-main-image"
                    src={optimizedImageUrl(activeMedia.src, IMAGE_PRESETS.hero)}
                    srcSet={imageSrcSet(activeMedia.src, [640, 960, 1200], {
                      quality: IMAGE_PRESETS.hero.quality,
                    })}
                    sizes="(min-width: 981px) 54vw, 100vw"
                    alt={product.title}
                    decoding="async"
                    fetchPriority="high"
                    onError={() => setMainMediaLoading(false)}
                    onLoad={() => setMainMediaLoading(false)}
                  />
                ) : null}
              </div>
              {mediaItems.length > 1 ? (
                <div
                  className="product-thumbs"
                  aria-label="Product media thumbnails"
                >
                  {mediaItems.map((item, index) => (
                    <button
                      aria-label={`View product ${item.type} ${index + 1}`}
                      aria-pressed={activeImage === index}
                      className={[
                        "product-thumb",
                        "image-placeholder-frame",
                        item.type,
                        activeImage === index ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={`${item.type}-${item.src}`}
                      onClick={() => chooseMedia(index)}
                      onFocus={() =>
                        preloadHeroImage(
                          item.type === "video" ? item.poster : item.src,
                        )
                      }
                      onMouseEnter={() =>
                        preloadHeroImage(
                          item.type === "video" ? item.poster : item.src,
                        )
                      }
                      style={placeholderStyle(
                        item.type === "video" ? item.poster : item.src,
                        false,
                      )}
                      type="button"
                    >
                      {item.type === "video" ? (
                        <>
                          {item.poster ? (
                            <img
                              src={optimizedImageUrl(
                                item.poster,
                                IMAGE_PRESETS.thumb,
                              )}
                              alt=""
                              loading={thumbnailLoading(index)}
                              decoding="async"
                              fetchPriority={thumbnailFetchPriority(index)}
                            />
                          ) : (
                            <span aria-hidden="true">Video</span>
                          )}
                          <b aria-hidden="true">Play</b>
                        </>
                      ) : (
                        <img
                          src={optimizedImageUrl(item.src, IMAGE_PRESETS.thumb)}
                          alt=""
                          loading={thumbnailLoading(index)}
                          decoding="async"
                          fetchPriority={thumbnailFetchPriority(index)}
                        />
                      )}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <aside className="purchase-panel" aria-label="Purchase panel">
            <div className="purchase-title-block">
              <div className="mb-1">
                <span className="font-bold text-green-700">
                  <Truck
                    className=" align-middle mr-1"
                    size={20}
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                  Fast delivery: 3 business days
                </span>
              </div>

              <h1 className="purchase-title">{product.title}</h1>
              <div
                className="purchase-trust-row"
                aria-label={`${trust.rating} stars, ${trust.soldText}`}
              >
                <span aria-hidden="true">★★★★★</span>
                <strong>{trust.rating}</strong>
                <em>{trust.soldText}</em>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <span className="text-sm font-extrabold text-muted">
                Availability
              </span>
              <strong
                className={`text-sm font-black ${selectedVariant?.stock === 0 ? "text-danger" : "text-success"}`}
              >
                {stockText}
              </strong>
            </div>
            <div className="offer-countdown" aria-live="polite">
              <span className="offer-countdown-label">
                <Timer size={17} strokeWidth={2.75} aria-hidden="true" />
                Offer ends in
              </span>
              <strong aria-label={`${offerCountdown} remaining`}>
                {offerCountdown}
              </strong>
            </div>
            <div className="price-row flex flex-wrap items-baseline gap-3 mb-5">
              <strong className="text-3xl font-black">
                {selectedVariant
                  ? formatMoney(selectedVariant.price, product.currency)
                  : formatMoney(product.minPrice, product.currency)}
              </strong>
              {hasDiscount ? (
                <span className="text-muted line-through font-bold">
                  {formatMoney(
                    selectedVariant!.compareAtPrice!,
                    product.currency,
                  )}
                </span>
              ) : null}
              {savings > 0 ? (
                <em className="price-row">
                  Save {formatMoney(savings, product.currency)}
                </em>
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
                  : "";

                return (
                  <button
                    aria-checked={active}
                    className={[
                      active ? "variant-card active" : "variant-card",
                      variantImage ? "has-visual" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={variant.stock <= 0}
                    key={variant.id}
                    onClick={() => chooseVariant(variant.sku)}
                    role="radio"
                    type="button"
                  >
                    <span className="variant-radio" aria-hidden="true" />
                    {variantImage ? (
                      <span
                        className="variant-visual image-placeholder-frame"
                        aria-hidden="true"
                        style={placeholderStyle(variantImage, false)}
                      >
                        <img
                          src={optimizedImageUrl(
                            variantImage,
                            IMAGE_PRESETS.thumb,
                          )}
                          alt=""
                          loading={optionImageLoading(active)}
                          decoding="async"
                          fetchPriority={optionImageFetchPriority(active)}
                        />
                      </span>
                    ) : null}
                    <span className="variant-content grid gap-1.5">
                      <span className="variant-topline flex items-center justify-between gap-2">
                        <em>{variantBadge(variant)}</em>
                        <b className={variant.stock <= 0 ? "sold-out" : ""}>
                          {stockLabel(variant)}
                        </b>
                      </span>
                      <span className="variant-title">
                        {formatVariantName(variant)}
                      </span>
                      <span className="variant-price-row flex items-baseline gap-2">
                        {variant.compareAtPrice &&
                        variant.compareAtPrice > variant.price ? (
                          <del>
                            {formatMoney(
                              variant.compareAtPrice,
                              product.currency,
                            )}
                          </del>
                        ) : null}
                        <strong>
                          {formatMoney(variant.price, product.currency)}
                        </strong>
                      </span>
                      {variantDiscount > 0 ? (
                        <small>
                          You save{" "}
                          {formatMoney(variantDiscount, product.currency)}
                        </small>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4 mt-5">
              <span className="font-extrabold text-muted">Quantity</span>
              <div className="stepper" aria-label="Quantity selector">
                <button
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => {
                    setError("");
                    setQuantity((current) => clampQuantity(current - 1));
                  }}
                  type="button"
                >
                  <Minus size={16} />
                </button>
                <input
                  aria-label="Quantity"
                  max={displayStockLimit > 0 ? displayStockLimit : 1}
                  min="1"
                  onChange={(event) => {
                    setError("");
                    setQuantity(clampQuantity(Number(event.target.value)));
                  }}
                  type="number"
                  value={quantity}
                />
                <button
                  aria-label="Increase quantity"
                  disabled={
                    displayStockLimit <= 0 || quantity >= displayStockLimit
                  }
                  onClick={() => {
                    setError("");
                    setQuantity((current) => clampQuantity(current + 1));
                  }}
                  type="button"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {selectedVariant ? (
              <p className="mt-3 text-sm text-muted">
                Selected: {formatVariantName(selectedVariant)} · SKU{" "}
                {selectedVariant.sku}
              </p>
            ) : null}
            <div
              className="flex items-baseline justify-between gap-4 mt-4 pt-4 border-t border-line"
              aria-label="Purchase summary"
            >
              <span className="font-extrabold text-muted">Subtotal</span>
              <strong className="text-xl font-black">
                {formatMoney(subtotal, product.currency)}
              </strong>
            </div>
            {error ? <p className="form-error mt-3">{error}</p> : null}

            <button
              className="buy-button mt-5 text-base"
              disabled={!canBuy}
              onClick={buyNow}
              type="button"
            >
              {selectedVariant?.stock === 0 ? "Sold Out" : "Buy Now"}{" "}
              <ArrowRight size={18} />
            </button>
            <p className="mt-3 text-center text-sm text-muted leading-snug">
              Contact, delivery, and secure payment are confirmed on the next
              step.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
