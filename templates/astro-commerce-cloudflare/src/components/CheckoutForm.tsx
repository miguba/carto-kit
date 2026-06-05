import {
  PayPalButtons,
  PayPalCardFieldsProvider,
  PayPalCVVField,
  PayPalExpiryField,
  PayPalNumberField,
  PayPalScriptProvider,
  usePayPalCardFields,
} from "@paypal/react-paypal-js";
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe,
  type StripeCardNumberElement,
  type StripeElementsOptions,
} from "@stripe/stripe-js";
import type { AddressAutofillRetrieveResponse } from "@mapbox/search-js-core";
import {
  BadgeCheck,
  Clock3,
  LockKeyhole,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  IMAGE_PRESETS,
  formatMoney,
  formatVariantName,
  optimizedImageUrl,
  productImages,
} from "@/lib/format";
import { MuiSelectField, MuiTextField } from "@/components/MuiField";
import type {
  ApiResponse,
  CreatePaymentResponse,
  Order,
  Product,
  ProductVariant,
} from "@/lib/types";

type Props = {
  product: Product;
  variant: ProductVariant;
  quantity: number;
  paypalClientId: string;
  paypalCardEnabled: boolean;
  stripePublishableKey: string;
  paymentConfigError: string;
  mapboxAccessToken: string;
  siteName: string;
};

type CheckoutState =
  | "editing"
  | "creating"
  | "ready"
  | "capturing"
  | "complete";
type PaymentMethod = "paypal" | "paypal-card" | "stripe";
type AddressAutofillComponentType = ComponentType<
  Record<string, unknown> & { children?: ReactNode }
>;

const emptyAddress = {
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
};

const emptyForm = {
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  ...emptyAddress,
};

type AddressFields = typeof emptyAddress;
type CheckoutFormFields = typeof emptyForm;

const checkoutFormStorageKey = "joys-box:checkout-form:v1";
const checkoutOfferCountdownSeconds = 6 * 60 + 29;
const checkoutOfferCountdownMs = checkoutOfferCountdownSeconds * 1000;
const paypalCardFieldStyle = {
  input: {
    height: "44px",
    padding: "0 12px",
    "font-size": "15px",
    "line-height": "44px",
  },
} as Record<string, Record<string, string>>;
const stripeCardElementOptions = {
  style: {
    base: {
      color: "#121316",
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: "15px",
      fontSmoothing: "antialiased",
      lineHeight: "42px",
      "::placeholder": {
        color: "#8b949e",
      },
    },
    invalid: {
      color: "#b42318",
    },
  },
  hidePostalCode: true,
};
function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ISO 3166-2 region code mappings for PayPal API compatibility.
// PayPal Orders v2 requires standardized admin_area_1 codes (e.g. "CA" not "California").
const regionCodeMap: Record<string, Record<string, string>> = {
  US: {
    Alabama: "AL",
    Alaska: "AK",
    Arizona: "AZ",
    Arkansas: "AR",
    California: "CA",
    Colorado: "CO",
    Connecticut: "CT",
    Delaware: "DE",
    Florida: "FL",
    Georgia: "GA",
    Hawaii: "HI",
    Idaho: "ID",
    Illinois: "IL",
    Indiana: "IN",
    Iowa: "IA",
    Kansas: "KS",
    Kentucky: "KY",
    Louisiana: "LA",
    Maine: "ME",
    Maryland: "MD",
    Massachusetts: "MA",
    Michigan: "MI",
    Minnesota: "MN",
    Mississippi: "MS",
    Missouri: "MO",
    Montana: "MT",
    Nebraska: "NE",
    Nevada: "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    Ohio: "OH",
    Oklahoma: "OK",
    Oregon: "OR",
    Pennsylvania: "PA",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    Tennessee: "TN",
    Texas: "TX",
    Utah: "UT",
    Vermont: "VT",
    Virginia: "VA",
    Washington: "WA",
    "West Virginia": "WV",
    Wisconsin: "WI",
    Wyoming: "WY",
    "District of Columbia": "DC",
  },
  CA: {
    Alberta: "AB",
    "British Columbia": "BC",
    Manitoba: "MB",
    "New Brunswick": "NB",
    "Newfoundland and Labrador": "NL",
    "Northwest Territories": "NT",
    "Nova Scotia": "NS",
    Nunavut: "NU",
    Ontario: "ON",
    "Prince Edward Island": "PE",
    Quebec: "QC",
    Saskatchewan: "SK",
    Yukon: "YT",
  },
  AU: {
    "Australian Capital Territory": "ACT",
    "New South Wales": "NSW",
    "Northern Territory": "NT",
    Queensland: "QLD",
    "South Australia": "SA",
    Tasmania: "TAS",
    Victoria: "VIC",
    "Western Australia": "WA",
  },
};

/** Convert a display region name to its ISO 3166-2 code for PayPal. */
function toRegionCode(countryCode: string, regionName: string): string {
  return regionCodeMap[countryCode]?.[regionName] || regionName;
}

const countries = [
  {
    code: "US",
    name: "United States",
    regions: [
      "Alabama",
      "Alaska",
      "Arizona",
      "Arkansas",
      "California",
      "Colorado",
      "Connecticut",
      "Delaware",
      "Florida",
      "Georgia",
      "Hawaii",
      "Idaho",
      "Illinois",
      "Indiana",
      "Iowa",
      "Kansas",
      "Kentucky",
      "Louisiana",
      "Maine",
      "Maryland",
      "Massachusetts",
      "Michigan",
      "Minnesota",
      "Mississippi",
      "Missouri",
      "Montana",
      "Nebraska",
      "Nevada",
      "New Hampshire",
      "New Jersey",
      "New Mexico",
      "New York",
      "North Carolina",
      "North Dakota",
      "Ohio",
      "Oklahoma",
      "Oregon",
      "Pennsylvania",
      "Rhode Island",
      "South Carolina",
      "South Dakota",
      "Tennessee",
      "Texas",
      "Utah",
      "Vermont",
      "Virginia",
      "Washington",
      "West Virginia",
      "Wisconsin",
      "Wyoming",
      "District of Columbia",
    ],
  },
  {
    code: "CA",
    name: "Canada",
    regions: [
      "Alberta",
      "British Columbia",
      "Manitoba",
      "New Brunswick",
      "Newfoundland and Labrador",
      "Northwest Territories",
      "Nova Scotia",
      "Nunavut",
      "Ontario",
      "Prince Edward Island",
      "Quebec",
      "Saskatchewan",
      "Yukon",
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    regions: ["England", "Scotland", "Wales", "Northern Ireland"],
  },
  {
    code: "AU",
    name: "Australia",
    regions: [
      "Australian Capital Territory",
      "New South Wales",
      "Northern Territory",
      "Queensland",
      "South Australia",
      "Tasmania",
      "Victoria",
      "Western Australia",
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    regions: [
      "Central Region",
      "East Region",
      "North Region",
      "North-East Region",
      "West Region",
    ],
  },
  {
    code: "HK",
    name: "Hong Kong",
    regions: ["Hong Kong Island", "Kowloon", "New Territories"],
  },
  {
    code: "CN",
    name: "China",
    regions: [
      "Anhui",
      "Beijing",
      "Chongqing",
      "Fujian",
      "Gansu",
      "Guangdong",
      "Guangxi",
      "Guizhou",
      "Hainan",
      "Hebei",
      "Heilongjiang",
      "Henan",
      "Hubei",
      "Hunan",
      "Inner Mongolia",
      "Jiangsu",
      "Jiangxi",
      "Jilin",
      "Liaoning",
      "Ningxia",
      "Qinghai",
      "Shaanxi",
      "Shandong",
      "Shanghai",
      "Shanxi",
      "Sichuan",
      "Tianjin",
      "Tibet",
      "Xinjiang",
      "Yunnan",
      "Zhejiang",
    ],
  },
] as const;

export default function CheckoutForm({
  product,
  variant,
  quantity,
  paypalClientId,
  paypalCardEnabled,
  stripePublishableKey,
  paymentConfigError,
  mapboxAccessToken,
  siteName,
}: Props) {
  const [form, setForm] = useState(emptyForm);
  const [billingForm, setBillingForm] = useState<AddressFields>(emptyAddress);
  const [billingAsShipping, setBillingAsShipping] = useState(true);
  const [state, setState] = useState<CheckoutState>("editing");
  const [error, setError] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<CreatePaymentResponse | null>(null);
  const canUsePayPalWallet = Boolean(paypalClientId);
  const canUsePayPalCard = Boolean(paypalClientId && paypalCardEnabled);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    stripePublishableKey
      ? "stripe"
      : canUsePayPalCard
        ? "paypal-card"
        : "paypal",
  );
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [stripeCardReady, setStripeCardReady] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [cardFieldsEligible, setCardFieldsEligible] = useState(false);
  const [AddressAutofillComponent, setAddressAutofillComponent] =
    useState<AddressAutofillComponentType | null>(null);
  const [hasRestoredForm, setHasRestoredForm] = useState(false);
  const [checkoutOfferSecondsLeft, setCheckoutOfferSecondsLeft] = useState(
    checkoutOfferCountdownSeconds,
  );

  const orderRef = useRef<Order | null>(null);
  const paymentRef = useRef<CreatePaymentResponse | null>(null);
  const stripeInstanceRef = useRef<Stripe | null>(null);
  const stripeCardRef = useRef<StripeCardNumberElement | null>(null);

  const lineTotal = useMemo(
    () => variant.price * quantity,
    [variant.price, quantity],
  );
  const compareTotal = useMemo(
    () => (variant.compareAtPrice ? variant.compareAtPrice * quantity : null),
    [quantity, variant.compareAtPrice],
  );
  const savings = compareTotal ? Math.max(0, compareTotal - lineTotal) : 0;
  const discountPercent =
    compareTotal && savings > 0
      ? Math.round((savings / compareTotal) * 100)
      : 0;
  const productImage = productImages(product, variant)[0] || null;
  const productImagePlaceholderStyle = productImage
    ? ({
        "--image-placeholder": `url("${optimizedImageUrl(productImage, IMAGE_PRESETS.tiny)}")`,
      } as CSSProperties)
    : undefined;
  const selectedCountry =
    countries.find((country) => country.code === form.country) ?? countries[0];
  const regionOptions = selectedCountry.regions;
  const billingCountry =
    countries.find((country) => country.code === billingForm.country) ??
    countries[0];
  const billingRegionOptions = billingCountry.regions;
  const checkoutOfferStorageKey = useMemo(
    () => `joys-box:checkout-offer-countdown:${product.slug}:${variant.sku}`,
    [product.slug, variant.sku],
  );
  const checkoutOfferCountdown = formatCountdown(checkoutOfferSecondsLeft);
  const customerName = `${form.firstName} ${form.lastName}`.trim();
  const stripePromise = useMemo(
    () => (stripePublishableKey ? loadStripe(stripePublishableKey) : null),
    [stripePublishableKey],
  );
  const stripeClientSecret =
    payment?.provider === "stripe" ? payment.clientSecret : undefined;
  const stripeOptions = useMemo<StripeElementsOptions>(
    () => ({
      appearance: {
        theme: "stripe",
        variables: {
          borderRadius: "7px",
          colorPrimary: "#4b5563",
          colorText: "#121316",
          colorDanger: "#b42318",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      },
    }),
    [],
  );
  const activeBillingAddress = billingAsShipping
    ? {
        address1: form.address1,
        address2: form.address2,
        city: form.city,
        state: toRegionCode(form.country, form.state),
        postalCode: form.postalCode,
        country: form.country,
      }
    : {
        address1: billingForm.address1,
        address2: billingForm.address2,
        city: billingForm.city,
        state: toRegionCode(billingForm.country, billingForm.state),
        postalCode: billingForm.postalCode,
        country: billingForm.country,
      };
  const detailsLocked =
    state === "creating" || state === "capturing" || state === "complete";
  const handleStripeReady = useCallback(
    (stripe: Stripe | null, card: StripeCardNumberElement | null) => {
      stripeInstanceRef.current = stripe;
      stripeCardRef.current = card;
      setStripeCardReady(Boolean(stripe && card));
    },
    [],
  );

  useEffect(() => {
    try {
      const savedForm = window.localStorage.getItem(checkoutFormStorageKey);

      if (savedForm) {
        const parsed = JSON.parse(savedForm);
        setForm(mergeStoredForm(parsed));

        if (parsed && typeof parsed === "object") {
          if (typeof parsed.billingAsShipping === "boolean") {
            setBillingAsShipping(parsed.billingAsShipping);
          }

          if (parsed.billingForm && typeof parsed.billingForm === "object") {
            setBillingForm(mergeStoredAddress(parsed.billingForm));
          }
        }
      }
    } catch {
      window.localStorage.removeItem(checkoutFormStorageKey);
    } finally {
      setHasRestoredForm(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredForm) {
      return;
    }

    window.localStorage.setItem(
      checkoutFormStorageKey,
      JSON.stringify({
        ...form,
        billingAsShipping,
        billingForm,
      }),
    );
  }, [form, billingAsShipping, billingForm, hasRestoredForm]);

  useEffect(() => {
    const now = Date.now();
    let offerDeadline = now + checkoutOfferCountdownMs;

    try {
      const storedDeadline = Number(
        window.localStorage.getItem(checkoutOfferStorageKey),
      );

      if (Number.isFinite(storedDeadline) && storedDeadline > now) {
        offerDeadline = storedDeadline;
      } else {
        window.localStorage.setItem(
          checkoutOfferStorageKey,
          String(offerDeadline),
        );
      }
    } catch {
      offerDeadline = now + checkoutOfferCountdownMs;
    }

    function syncCountdown() {
      setCheckoutOfferSecondsLeft(
        Math.max(Math.ceil((offerDeadline - Date.now()) / 1000), 0),
      );
    }

    syncCountdown();

    const intervalId = window.setInterval(syncCountdown, 1000);

    return () => window.clearInterval(intervalId);
  }, [checkoutOfferStorageKey]);

  useEffect(() => {
    if (!mapboxAccessToken) {
      return undefined;
    }

    let mounted = true;

    import("@mapbox/search-js-react")
      .then((module) => {
        if (mounted) {
          setAddressAutofillComponent(
            () =>
              module.AddressAutofill as unknown as AddressAutofillComponentType,
          );
        }
      })
      .catch(() => {
        if (mounted) {
          setAddressAutofillComponent(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, [mapboxAccessToken]);

  function clearPreparedPayment() {
    orderRef.current = null;
    paymentRef.current = null;
    setOrder(null);
    setPayment(null);
    setStripeCardReady(false);
  }

  function handleDetailsChange() {
    if (state === "ready" || orderRef.current || paymentRef.current) {
      clearPreparedPayment();
      setState("editing");
    }
  }

  function updateField(field: keyof typeof emptyForm, value: string) {
    handleDetailsChange();
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateBillingField(field: keyof AddressFields, value: string) {
    handleDetailsChange();
    setBillingForm((current) => ({ ...current, [field]: value }));
  }

  function updateCountry(value: string) {
    handleDetailsChange();
    setForm((current) => ({
      ...current,
      country: value,
      state: "",
    }));
  }

  function updateBillingCountry(value: string) {
    handleDetailsChange();
    setBillingForm((current) => ({
      ...current,
      country: value,
      state: "",
    }));
  }

  function applyMapboxAddress(response: AddressAutofillRetrieveResponse) {
    const feature = response.features?.[0];
    const properties = feature?.properties;

    if (!properties) {
      return;
    }

    const countryCode = (
      properties.country_code ||
      properties.metadata?.iso_3166_1 ||
      form.country
    ).toUpperCase();
    const country =
      countries.find((item) => item.code === countryCode) ?? selectedCountry;
    const matchedRegion = matchRegion(
      country.regions,
      properties.address_level1 || "",
    );

    handleDetailsChange();
    setForm((current) => ({
      ...current,
      address1:
        properties.address_line1 || properties.full_address || current.address1,
      city:
        properties.address_level2 || properties.address_level3 || current.city,
      postalCode: properties.postcode || current.postalCode,
      country: country.code,
      state: matchedRegion || "",
    }));
  }

  function applyMapboxBillingAddress(
    response: AddressAutofillRetrieveResponse,
  ) {
    const feature = response.features?.[0];
    const properties = feature?.properties;

    if (!properties) {
      return;
    }

    const countryCode = (
      properties.country_code ||
      properties.metadata?.iso_3166_1 ||
      billingForm.country
    ).toUpperCase();
    const country =
      countries.find((item) => item.code === countryCode) ?? billingCountry;
    const matchedRegion = matchRegion(
      country.regions,
      properties.address_level1 || "",
    );

    handleDetailsChange();
    setBillingForm((current) => ({
      ...current,
      address1:
        properties.address_line1 || properties.full_address || current.address1,
      city:
        properties.address_level2 || properties.address_level3 || current.city,
      postalCode: properties.postcode || current.postalCode,
      country: country.code,
      state: matchedRegion || "",
    }));
  }

  function validateDetails() {
    if (!acceptedTerms) {
      setError("Please agree to the terms before paying.");
      return false;
    }

    if (!form.country || (regionOptions.length > 0 && !form.state)) {
      setError("Please complete the shipping country and state / region.");
      document
        .getElementById(!form.country ? "checkout-country" : "checkout-state")
        ?.focus();
      return false;
    }

    if (
      !billingAsShipping &&
      (!billingForm.country ||
        (billingRegionOptions.length > 0 && !billingForm.state))
    ) {
      setError("Please complete the billing country and state / region.");
      document
        .getElementById(
          !billingForm.country ? "billing-country" : "billing-state",
        )
        ?.focus();
      return false;
    }

    const detailsForm = document.getElementById(
      "checkout-details-form",
    ) as HTMLFormElement | null;
    if (detailsForm && !detailsForm.reportValidity()) {
      setError("Please complete the billing details first.");
      return false;
    }

    return true;
  }

  async function preparePayment(method: PaymentMethod) {
    const provider = method === "stripe" ? "stripe" : "paypal";
    const fundingSource =
      method === "paypal-card"
        ? "card"
        : method === "paypal"
          ? "paypal"
          : undefined;

    if (
      payment?.providerOrderId &&
      payment.provider === provider &&
      (provider === "stripe" || payment.fundingSource === fundingSource)
    ) {
      return payment.providerOrderId;
    }

    if (!validateDetails()) {
      throw new Error("Please complete the checkout details first.");
    }

    setError("");
    setState("creating");

    try {
      const shippingAddress = {
        address1: form.address1,
        address2: form.address2,
        city: form.city,
        state: toRegionCode(form.country, form.state),
        postalCode: form.postalCode,
        country: form.country,
      };

      const billingAddress = billingAsShipping
        ? shippingAddress
        : {
            address1: billingForm.address1,
            address2: billingForm.address2,
            city: billingForm.city,
            state: toRegionCode(billingForm.country, billingForm.state),
            postalCode: billingForm.postalCode,
            country: billingForm.country,
          };

      const orderPayload: Record<string, unknown> = {
        origin: window.location.origin,
        customer: {
          email: form.email,
          phone: form.phone.trim(),
          firstName: form.firstName,
          lastName: form.lastName,
        },
        billingAddress,
        billingAddressAsShippingAddress: billingAsShipping,
        shippingAddress,
        items: [
          {
            productSlug: product.slug,
            sku: variant.sku,
            quantity,
          },
        ],
      };

      const createdOrder = await postLocal<Order>("/api/orders", orderPayload);

      const createdPayment = await postLocal<CreatePaymentResponse>(
        "/api/payments/create",
        {
          orderNo: createdOrder.orderNo,
          provider,
          fundingSource,
        },
      );

      orderRef.current = createdOrder;
      paymentRef.current = createdPayment;
      setOrder(createdOrder);
      setPayment(createdPayment);
      setState("ready");
      return createdPayment.providerOrderId;
    } catch (caught) {
      setState("editing");
      setError(friendlyError(caught));
      throw caught;
    }
  }

  async function capture(providerOrderId: string) {
    const currentOrder = orderRef.current;
    const currentPayment = paymentRef.current;
    if (!currentOrder) {
      throw new Error("Order is not ready yet.");
    }

    setError("");
    setState("capturing");

    try {
      const capturedOrder = await postLocal<Order>("/api/payments/capture", {
        orderNo: currentOrder.orderNo,
        provider: currentPayment?.provider ?? "paypal",
        providerOrderId,
      });

      if (capturedOrder.paymentStatus === "paid") {
        setState("complete");
        window.location.href = `/orders/${encodeURIComponent(capturedOrder.orderNo)}`;
      } else if (capturedOrder.paymentStatus === "failed") {
        // Payment failed — allow buyer to start over with a new payment
        orderRef.current = null;
        paymentRef.current = null;
        setOrder(null);
        setPayment(null);
        setState("editing");
        setError(
          "This payment method was declined. Please try a different card or payment option.",
        );
      } else {
        setState("ready");
        setError(
          `Payment is not confirmed. Current status: ${capturedOrder.paymentStatus}. Please retry or contact support.`,
        );
      }
    } catch (caught) {
      // If capture fails with an error, clear stale payment state so the
      // buyer can retry with a fresh provider order.
      orderRef.current = null;
      paymentRef.current = null;
      setOrder(null);
      setPayment(null);
      setState("editing");
      setError(friendlyError(caught));
    }
  }

  async function submitStripePayment() {
    if (
      !validateDetails() ||
      !stripeInstanceRef.current ||
      !stripeCardRef.current
    ) {
      return;
    }

    setStripeSubmitting(true);
    setError("");

    try {
      let clientSecret = stripeClientSecret;

      if (!clientSecret) {
        await preparePayment("stripe");
        const preparedPayment = paymentRef.current;

        if (preparedPayment?.provider === "stripe") {
          clientSecret = preparedPayment.clientSecret;
        }
      }

      if (!clientSecret) {
        throw new Error("Stripe did not return a payment client secret.");
      }

      const result = await stripeInstanceRef.current.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: stripeCardRef.current,
            billing_details: {
              address: {
                line1: activeBillingAddress.address1,
                line2: activeBillingAddress.address2 || undefined,
                city: activeBillingAddress.city,
                state: activeBillingAddress.state,
                postal_code: activeBillingAddress.postalCode,
                country: activeBillingAddress.country,
              },
              email: form.email,
              name: customerName,
              phone: form.phone.trim(),
            },
          },
        },
      );

      if (result.error) {
        throw new Error(result.error.message || "Stripe payment failed.");
      }

      const paymentIntentId = result.paymentIntent?.id;
      if (!paymentIntentId) {
        throw new Error("Stripe did not return a PaymentIntent id.");
      }

      await capture(paymentIntentId);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setStripeSubmitting(false);
    }
  }

  const orderSummaryPanel = (
    <section className="summary-panel checkout-order-panel rounded-brand">
      <p className="eyebrow">Your order</p>
      <div className="summary-product">
        <div
          className="summary-product-image image-placeholder-frame rounded-brand"
          aria-hidden="true"
          style={productImagePlaceholderStyle}
        >
          {productImage ? (
            <img
              src={optimizedImageUrl(productImage, IMAGE_PRESETS.thumb)}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span>W</span>
          )}
        </div>
        <div>
          <p>{formatVariantName(variant)}</p>
          <small>SKU {variant.sku}</small>
        </div>
      </div>
      {discountPercent ? (
        <div className="summary-savings">
          <strong>Save {discountPercent}%</strong>
          <span>
            <del>{formatMoney(compareTotal || 0, product.currency)}</del>
            {formatMoney(lineTotal, product.currency)}
          </span>
        </div>
      ) : null}
      <dl>
        <div>
          <dt>Quantity</dt>
          <dd>{quantity}</dd>
        </div>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(lineTotal, product.currency)}</dd>
        </div>
        <div>
          <dt>Shipping</dt>
          <dd>{formatMoney(0, product.currency)}</dd>
        </div>
        <div className="total">
          <dt>Total</dt>
          <dd>{formatMoney(lineTotal, product.currency)}</dd>
        </div>
      </dl>

      <div className="checkout-trust-points" aria-label="Checkout benefits">
        <span>
          <ShieldCheck size={17} /> Secure protected checkout
        </span>
        <span>
          <Truck size={17} /> Free standard shipping
        </span>
        <span>
          <BadgeCheck size={17} /> Satisfaction support
        </span>
      </div>
    </section>
  );
  const hasMultipleCardProviders = Boolean(
    stripePublishableKey && canUsePayPalCard,
  );
  const paymentControls = (
    <>
      <div className="payment-choice-box">
        {stripePublishableKey ? (
          <section
            className={
              paymentMethod === "stripe"
                ? "payment-choice is-active"
                : "payment-choice"
            }
          >
            <button
              className="payment-choice-header"
              type="button"
              aria-expanded={paymentMethod === "stripe"}
              onClick={() => setPaymentMethod("stripe")}
            >
              <span
                className={
                  paymentMethod === "stripe"
                    ? "payment-radio active"
                    : "payment-radio"
                }
                aria-hidden="true"
              />
              <strong>Credit/Debit Card</strong>
              {hasMultipleCardProviders ? (
                <span className="payment-provider-pill">Stripe</span>
              ) : null}
              <span
                className="payment-card-pills"
                aria-label="Accepted card types"
              >
                <VisaLogo />
                <MastercardLogo />
                <AmexLogo />
              </span>
            </button>

            <div
              className={
                paymentMethod === "stripe"
                  ? "payment-choice-body"
                  : "payment-choice-body payment-choice-body-hidden"
              }
              aria-hidden={paymentMethod !== "stripe"}
            >
              {stripePromise ? (
                <Elements
                  stripe={stripePromise}
                  options={stripeOptions}
                >
                  <StripeCardSection onReady={handleStripeReady} />
                </Elements>
              ) : (
                <div className="payment-unavailable-note">
                  <p>Secure card entry is unavailable.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {canUsePayPalCard && cardFieldsEligible ? (
          <section
            className={
              paymentMethod === "paypal-card"
                ? "payment-choice is-active"
                : "payment-choice"
            }
          >
            <button
              className="payment-choice-header"
              type="button"
              aria-expanded={paymentMethod === "paypal-card"}
              onClick={() => setPaymentMethod("paypal-card")}
            >
              <span
                className={
                  paymentMethod === "paypal-card"
                    ? "payment-radio active"
                    : "payment-radio"
                }
                aria-hidden="true"
              />
              <strong>Credit/Debit Card</strong>
              {hasMultipleCardProviders ? (
                <span className="payment-provider-pill">PayPal</span>
              ) : null}
              <span
                className="payment-card-pills"
                aria-label="Accepted card types"
              >
                <VisaLogo />
                <MastercardLogo />
                <AmexLogo />
              </span>
            </button>

            <div
              className={
                paymentMethod === "paypal-card"
                  ? "payment-choice-body"
                  : "payment-choice-body payment-choice-body-hidden"
              }
              aria-hidden={paymentMethod !== "paypal-card"}
            >
              <div className="card-fields-container">
                <div className="card-field-item card-number-item">
                  <div className="paypal-card-field card-number-field">
                    <PayPalNumberField
                      placeholder="1234 1234 1234 1234"
                      style={paypalCardFieldStyle}
                    />
                  </div>
                </div>

                <div className="card-field-split">
                  <div className="card-field-item">
                    <div className="paypal-card-field">
                      <PayPalExpiryField
                        placeholder="MM / YY"
                        style={paypalCardFieldStyle}
                      />
                    </div>
                  </div>
                  <div className="card-field-item">
                    <div className="paypal-card-field">
                      <PayPalCVVField
                        placeholder="CVC"
                        style={paypalCardFieldStyle}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {canUsePayPalWallet ? (
          <section
            className={
              paymentMethod === "paypal"
                ? "payment-choice is-active"
                : "payment-choice"
            }
          >
            <button
              className="payment-choice-header"
              type="button"
              aria-expanded={paymentMethod === "paypal"}
              onClick={() => setPaymentMethod("paypal")}
            >
              <span
                className={
                  paymentMethod === "paypal"
                    ? "payment-radio active"
                    : "payment-radio"
                }
                aria-hidden="true"
              />
              <PayPalWordmark />
            </button>

            <div
              className={
                paymentMethod === "paypal"
                  ? "payment-choice-body paypal-choice-body"
                  : "payment-choice-body paypal-choice-body payment-choice-body-hidden"
              }
              aria-hidden={paymentMethod !== "paypal"}
            >
              <div className="paypal-redirect-illustration" aria-hidden="true">
                <span />
              </div>
              <p className="paypal-redirect-copy">
                After clicking <strong>"COMPLETE PURCHASE"</strong>, you will
                be redirected to PayPal to complete your purchase securely.
              </p>
            </div>
          </section>
        ) : null}
      </div>

      <label className="payment-terms-copy pt-2">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.currentTarget.checked)}
        />
        <span>
          By clicking "Complete Purchase" below, you agree with our{" "}
          <a href="/terms-conditions">Terms of Service</a> and{" "}
          <a href="/privacy-policy">Privacy Policy</a>.
        </span>
      </label>

      <div className="payment-submit-stack">
        {stripePublishableKey ? (
          <div
            className={
              paymentMethod === "stripe"
                ? "payment-submit-panel is-active"
                : "payment-submit-panel"
            }
            aria-hidden={paymentMethod !== "stripe"}
          >
            <button
              className="buy-button mt-4"
              disabled={
                paymentMethod !== "stripe" ||
                state === "creating" ||
                state === "capturing" ||
                stripeSubmitting ||
                !stripeCardReady ||
                !acceptedTerms
              }
              onClick={() => {
                setPaymentMethod("stripe");
                submitStripePayment().catch(() => undefined);
              }}
              type="button"
            >
              <span>
                {stripeSubmitting
                  ? "PROCESSING..."
                  : state === "creating"
                    ? "PREPARING..."
                    : "COMPLETE PURCHASE"}
              </span>
              <span aria-hidden="true">→</span>
              <small>TRY IT RISK FREE! - 30 DAY MONEY BACK GUARANTEE!</small>
            </button>
          </div>
        ) : null}

        {canUsePayPalCard && cardFieldsEligible ? (
          <div
            className={
              paymentMethod === "paypal-card"
                ? "payment-submit-panel is-active"
                : "payment-submit-panel"
            }
            aria-hidden={paymentMethod !== "paypal-card"}
          >
            <PayPalCardSubmitButton
              disabled={
                paymentMethod !== "paypal-card" ||
                state === "creating" ||
                state === "capturing" ||
                !acceptedTerms
              }
              onBeforeSubmit={validateDetails}
              cardholderName={customerName}
              billing={activeBillingAddress}
            />
          </div>
        ) : null}

        {canUsePayPalWallet ? (
          <div
            className={
              paymentMethod === "paypal"
                ? "payment-submit-panel is-active"
                : "payment-submit-panel"
            }
            aria-hidden={paymentMethod !== "paypal"}
          >
            <PayPalWalletSubmitButton
              disabled={
                paymentMethod !== "paypal" ||
                state === "creating" ||
                state === "capturing" ||
                !acceptedTerms
              }
              createOrder={async () => {
                setPaymentMethod("paypal");
                return preparePayment("paypal");
              }}
              onApprove={async (providerOrderId) => {
                await capture(providerOrderId);
              }}
              onError={(caught) => {
                setError(friendlyError(caught));
              }}
            />
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="checkout-experience">
      <div className="checkout-brandbar" aria-label="Checkout confidence">
        <a className="checkout-brand mb-2" href="/">
          <img
            className="brand-mark"
            src="/logo-mark.svg"
            alt=""
            aria-hidden="true"
          />
          <span className="checkout-brand-copy">
            <strong>{siteName}</strong>
            <small>
              <ShieldCheck size={13} aria-hidden="true" />
              Secure checkout
            </small>
          </span>
        </a>
        <div
          className="checkout-timer"
          aria-label="Checkout offer reminder"
          aria-live="polite"
        >
          <span className="checkout-timer-icon" aria-hidden="true">
            <Clock3 size={16} />
          </span>
          <span className="checkout-timer-copy">
            <span className="checkout-timer-text">
              <strong>Flash offer</strong>
              <span>Reserved while you complete checkout</span>
            </span>
            <em aria-label={`${checkoutOfferCountdown} remaining`}>
              {checkoutOfferCountdown}
            </em>
          </span>
        </div>
      </div>

      <div className="checkout-grid">
        {orderSummaryPanel}

        <form
          className="checkout-form rounded-brand"
          id="checkout-details-form"
          onSubmit={(event) => {
            event.preventDefault();
            preparePayment(paymentMethod).catch(() => undefined);
          }}
        >
          <fieldset disabled={detailsLocked}>
            <h2 className="checkout-form-title">Contact information</h2>
            <MuiTextField
              label="Email address"
              required
              autoComplete="email"
              id="checkout-email"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
            <div className="form-grid two mobile-two">
              <MuiTextField
                label="First name"
                required
                autoComplete="given-name"
                id="checkout-first-name"
                value={form.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
              />
              <MuiTextField
                label="Last name"
                required
                autoComplete="family-name"
                id="checkout-last-name"
                value={form.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
              />
            </div>
            <MuiTextField
              label="Phone"
              required
              autoComplete="tel"
              id="checkout-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />

            <AddressFieldsSection
              address={form}
              addressAutofillComponent={AddressAutofillComponent}
              autocompletePrefix="shipping"
              idPrefix="checkout"
              mapboxAccessToken={mapboxAccessToken}
              onAutofillRetrieve={applyMapboxAddress}
              onCountryChange={updateCountry}
              onFieldChange={(field, value) => updateField(field, value)}
              regionOptions={regionOptions}
              title="Shipping address"
            />

            <label className="billing-as-shipping-row">
              <input
                type="checkbox"
                checked={billingAsShipping}
                onChange={(event) => {
                  handleDetailsChange();
                  setBillingAsShipping(event.target.checked);
                }}
                id="billing-as-shipping"
              />
              <span>Billing address same as shipping address</span>
            </label>

            {!billingAsShipping && (
              <div className="shipping-address-section">
                <AddressFieldsSection
                  address={billingForm}
                  addressAutofillComponent={AddressAutofillComponent}
                  autocompletePrefix="billing"
                  idPrefix="billing"
                  mapboxAccessToken={mapboxAccessToken}
                  onAutofillRetrieve={applyMapboxBillingAddress}
                  onCountryChange={updateBillingCountry}
                  onFieldChange={updateBillingField}
                  regionOptions={billingRegionOptions}
                  title="Billing address"
                />
              </div>
            )}
          </fieldset>
        </form>

        <aside className="order-summary">
          <section className="payment-panel rounded-brand">
            <div className="payment-panel-heading flex items-center justify-between gap-3 mb-5">
              <h2>Payment</h2>
              <LockKeyhole size={18} />
            </div>

            {error ? <p className="form-error mb-4">{error}</p> : null}

            {stripePublishableKey || paypalClientId ? (
              paypalClientId ? (
                <PayPalScriptProvider
                  options={{
                    clientId: paypalClientId,
                    components: canUsePayPalCard
                      ? "buttons,card-fields"
                      : "buttons",
                    currency: product.currency,
                    disableFunding: "paylater",
                    intent: "capture",
                    ...(canUsePayPalCard ? { enableFunding: "card" } : {}),
                  }}
                >
                  {canUsePayPalCard ? (
                    <>
                      <PayPalCardFieldsProvider
                        createOrder={async () => {
                          setPaymentMethod("paypal-card");
                          return preparePayment("paypal-card");
                        }}
                        onApprove={async (data) => {
                          await capture(
                            String(
                              data.orderID ||
                                paymentRef.current?.providerOrderId ||
                                "",
                            ),
                          );
                        }}
                        onError={(caught) => {
                          setState(
                            paymentRef.current?.providerOrderId
                              ? "ready"
                              : "editing",
                          );
                          setError(friendlyError(caught));
                        }}
                      >
                        {paymentControls}
                      </PayPalCardFieldsProvider>
                      <div style={{ display: "none" }} aria-hidden="true">
                        <PayPalCardFieldsProvider
                          createOrder={async () => ""}
                          onApprove={async () => {}}
                          onError={() => {}}
                        >
                          <PayPalCardFieldsReady
                            onReady={() => setCardFieldsEligible(true)}
                          />
                        </PayPalCardFieldsProvider>
                      </div>
                    </>
                  ) : (
                    paymentControls
                  )}
                </PayPalScriptProvider>
              ) : (
                paymentControls
              )
            ) : (
              <p className="form-error">
                {paymentConfigError ||
                  "Payment configuration is missing from /api/commerce/config."}
              </p>
            )}

            <TrustBadgesPanel />
            <WhyChooseUsPanel />

            {state === "ready" ||
            state === "capturing" ||
            state === "complete" ? (
              <div className="paypal-ready">
                <LockKeyhole size={18} />
                <span>
                  Order {order?.orderNo} is ready for{" "}
                  {paymentMethod === "stripe" ||
                  paymentMethod === "paypal-card"
                    ? "card payment"
                    : "payment approval"}
                  .
                </span>
                <button
                  onClick={() => {
                    clearPreparedPayment();
                    setState("editing");
                  }}
                  type="button"
                >
                  <RotateCcw size={16} /> Edit details
                </button>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function PayPalCardFieldsReady({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
}

function AddressFieldsSection({
  title,
  address,
  idPrefix,
  autocompletePrefix,
  regionOptions,
  mapboxAccessToken,
  addressAutofillComponent: AddressAutofillComponent,
  onAutofillRetrieve,
  onCountryChange,
  onFieldChange,
}: {
  title: string;
  address: AddressFields;
  idPrefix: string;
  autocompletePrefix: "shipping" | "billing";
  regionOptions: readonly string[];
  mapboxAccessToken: string;
  addressAutofillComponent: AddressAutofillComponentType | null;
  onAutofillRetrieve: (response: AddressAutofillRetrieveResponse) => void;
  onCountryChange: (value: string) => void;
  onFieldChange: (field: keyof AddressFields, value: string) => void;
}) {
  const address1Id = `${idPrefix}-address1`;
  const address2Id = `${idPrefix}-address2`;
  const countryId = `${idPrefix}-country`;
  const stateId = `${idPrefix}-state`;
  const cityId = `${idPrefix}-city`;
  const zipId = `${idPrefix}-zip`;

  const streetInput = (
    <input
      autoComplete={`${autocompletePrefix} address-line1`}
      id={address1Id}
      placeholder=" "
      required
      value={address.address1}
      onChange={(event) => onFieldChange("address1", event.target.value)}
    />
  );

  return (
    <>
      <h2 className="checkout-form-title">{title}</h2>
      <div
        className={`mui-field address-autocomplete${address.address1 ? " mui-filled" : ""}`}
      >
        {mapboxAccessToken && AddressAutofillComponent ? (
          <AddressAutofillComponent
            accessToken={mapboxAccessToken}
            browserAutofillEnabled
            onRetrieve={onAutofillRetrieve}
            options={{ country: address.country, language: "en", limit: 5 }}
            popoverOptions={{ offset: 6, placement: "bottom-start" }}
            theme={{
              variables: {
                borderRadius: "8px",
                colorPrimary: "#2364e8",
                colorText: "#121316",
                colorBackground: "#ffffff",
              },
            }}
          >
            {streetInput}
          </AddressAutofillComponent>
        ) : (
          streetInput
        )}
        <span className="mui-label">
          Street address
          <span className="mui-required" aria-hidden="true">
            {" "}
            *
          </span>
        </span>
      </div>
      <MuiTextField
        label="Apartment, suite, unit, etc."
        optional
        autoComplete={`${autocompletePrefix} address-line2`}
        id={address2Id}
        value={address.address2}
        onChange={(event) => onFieldChange("address2", event.target.value)}
      />
      <div className="form-grid two mobile-two">
        <MuiSelectField
          label="Country"
          required
          filled={!!address.country}
          autoComplete={`${autocompletePrefix} country`}
          id={countryId}
          value={address.country}
          onValueChange={onCountryChange}
          options={countries.map((country) => ({
            label: country.name,
            value: country.code,
          }))}
        />
        {regionOptions.length ? (
          <MuiSelectField
            label="State / region"
            required
            filled={!!address.state}
            autoComplete={`${autocompletePrefix} address-level1`}
            id={stateId}
            value={address.state}
            onValueChange={(value) => onFieldChange("state", value)}
            options={regionOptions.map((region) => ({
              label: region,
              value: region,
            }))}
            placeholder="State / region"
          />
        ) : (
          <div className={`mui-field${address.state ? " mui-filled" : ""}`}>
            <input
              autoComplete={`${autocompletePrefix} address-level1`}
              id={stateId}
              placeholder=" "
              required
              value={address.state}
              onChange={(event) => onFieldChange("state", event.target.value)}
            />
            <span className="mui-label">
              State / region
              <span className="mui-required" aria-hidden="true">
                {" "}
                *
              </span>
            </span>
          </div>
        )}
      </div>
      <div className="form-grid two mobile-two">
        <MuiTextField
          label="City"
          required
          autoComplete={`${autocompletePrefix} address-level2`}
          id={cityId}
          value={address.city}
          onChange={(event) => onFieldChange("city", event.target.value)}
        />
        <MuiTextField
          label="Zip / postal code"
          required
          autoComplete={`${autocompletePrefix} postal-code`}
          id={zipId}
          value={address.postalCode}
          onChange={(event) => onFieldChange("postalCode", event.target.value)}
        />
      </div>
    </>
  );
}

function StripeCardSection({
  onReady,
}: {
  onReady: (stripe: Stripe | null, card: StripeCardNumberElement | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    onReady(stripe, elements?.getElement(CardNumberElement) ?? null);

    return () => onReady(null, null);
  }, [elements, onReady, stripe]);

  return (
    <div className="card-fields-container">
      <div className="card-field-item card-number-item">
        <div className="stripe-card-field">
          <CardNumberElement
            options={{
              ...stripeCardElementOptions,
              placeholder: "1234 1234 1234 1234",
            }}
          />
        </div>
      </div>

      <div className="card-field-split">
        <div className="card-field-item">
          <div className="stripe-card-field">
            <CardExpiryElement
              options={{
                ...stripeCardElementOptions,
                placeholder: "MM / YY",
              }}
            />
          </div>
        </div>
        <div className="card-field-item">
          <div className="stripe-card-field">
            <CardCvcElement
              options={{
                ...stripeCardElementOptions,
                placeholder: "CVC",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PayPalCardSubmitButton({
  disabled,
  onBeforeSubmit,
  cardholderName,
  billing,
}: {
  disabled: boolean;
  onBeforeSubmit: () => boolean;
  cardholderName: string;
  billing: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}) {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = useState(false);

  async function submitCard() {
    if (!onBeforeSubmit() || typeof cardFieldsForm?.submit !== "function") {
      return;
    }

    setSubmitting(true);
    try {
      const submitFn = cardFieldsForm.submit as (
        options?: Record<string, unknown>,
      ) => Promise<void>;
      await submitFn({
        cardholderName,
        billingAddress: {
          address_line_1: billing.address1,
          address_line_2: billing.address2 || undefined,
          admin_area_2: billing.city,
          admin_area_1: billing.state,
          postal_code: billing.postalCode,
          country_code: billing.country,
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      className="buy-button mt-4"
      disabled={disabled || submitting}
      onClick={submitCard}
      type="button"
    >
      <span>{submitting ? "PROCESSING..." : "COMPLETE PURCHASE"}</span>
      <span aria-hidden="true">→</span>
      <small>TRY IT RISK FREE! - 30 DAY MONEY BACK GUARANTEE!</small>
    </button>
  );
}

function PayPalWalletSubmitButton({
  disabled,
  createOrder,
  onApprove,
  onError,
}: {
  disabled: boolean;
  createOrder: () => Promise<string>;
  onApprove: (providerOrderId: string) => Promise<void>;
  onError: (caught: unknown) => void;
}) {
  return (
    <div
      className={
        disabled ? "paypal-wallet-submit is-disabled" : "paypal-wallet-submit"
      }
    >
      <div className="paypal-wallet-hit-area" aria-hidden={disabled}>
        <PayPalButtons
          disabled={disabled}
          fundingSource="paypal"
          createOrder={createOrder}
          onApprove={async (data) => {
            await onApprove(String(data.orderID || ""));
          }}
          onError={onError}
          style={{
            height: 55,
            layout: "vertical",
            shape: "rect",
            label: "checkout",
            tagline: false,
          }}
        />
      </div>
      <button
        className="buy-button paypal-wallet-visual"
        disabled={disabled}
        type="button"
      >
        <span>COMPLETE PURCHASE</span>
        <span aria-hidden="true">→</span>
        <small>TRY IT RISK FREE! - 30 DAY MONEY BACK GUARANTEE!</small>
      </button>
    </div>
  );
}

function matchRegion(regions: readonly string[], value: string) {
  const normalizedValue = normalizeRegion(value);

  if (!normalizedValue) {
    return "";
  }

  return (
    regions.find((region) => normalizeRegion(region) === normalizedValue) ??
    regions.find(
      (region) =>
        normalizeRegion(region).includes(normalizedValue) ||
        normalizedValue.includes(normalizeRegion(region)),
    ) ??
    ""
  );
}

function normalizeRegion(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mergeStoredForm(value: unknown): CheckoutFormFields {
  if (!value || typeof value !== "object") {
    return emptyForm;
  }

  const stored = value as Partial<Record<keyof CheckoutFormFields, unknown>>;
  const country =
    typeof stored.country === "string" &&
    countries.some((item) => item.code === stored.country)
      ? stored.country
      : emptyForm.country;

  return {
    email: typeof stored.email === "string" ? stored.email : emptyForm.email,
    phone: typeof stored.phone === "string" ? stored.phone : emptyForm.phone,
    firstName:
      typeof stored.firstName === "string"
        ? stored.firstName
        : emptyForm.firstName,
    lastName:
      typeof stored.lastName === "string"
        ? stored.lastName
        : emptyForm.lastName,
    address1:
      typeof stored.address1 === "string"
        ? stored.address1
        : emptyForm.address1,
    address2:
      typeof stored.address2 === "string"
        ? stored.address2
        : emptyForm.address2,
    city: typeof stored.city === "string" ? stored.city : emptyForm.city,
    state: typeof stored.state === "string" ? stored.state : emptyForm.state,
    postalCode:
      typeof stored.postalCode === "string"
        ? stored.postalCode
        : emptyForm.postalCode,
    country,
  };
}

function mergeStoredAddress(value: unknown): AddressFields {
  if (!value || typeof value !== "object") {
    return emptyAddress;
  }

  const stored = value as Partial<Record<keyof AddressFields, unknown>>;
  const country =
    typeof stored.country === "string" &&
    countries.some((item) => item.code === stored.country)
      ? stored.country
      : emptyAddress.country;

  return {
    address1:
      typeof stored.address1 === "string"
        ? stored.address1
        : emptyAddress.address1,
    address2:
      typeof stored.address2 === "string"
        ? stored.address2
        : emptyAddress.address2,
    city: typeof stored.city === "string" ? stored.city : emptyAddress.city,
    state: typeof stored.state === "string" ? stored.state : emptyAddress.state,
    postalCode:
      typeof stored.postalCode === "string"
        ? stored.postalCode
        : emptyAddress.postalCode,
    country,
  };
}

async function postLocal<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(
      typeof payload.data === "string" ? payload.data : "Request failed.",
    );
  }

  return payload.data;
}

const paypalIssueMessages: Record<string, string> = {
  PAYER_CANNOT_PAY:
    "This payment method was declined. Please try a different card or payment option.",
  INSTRUMENT_DECLINED:
    "Your card was declined. Please try another card or contact your bank.",
  CARD_EXPIRED: "This card has expired. Please use a different card.",
  INSUFFICIENT_FUNDS:
    "Insufficient funds. Please try a different payment method.",
  TRANSACTION_REFUSED:
    "The transaction was refused. Please try again or use a different payment method.",
  INVALID_SECURITY_CODE:
    "Incorrect security code. Please check your CVV and try again.",
  ORDER_NOT_APPROVED: "The payment was not approved. Please try again.",
  DUPLICATE_INVOICE_ID:
    "This order has already been processed. Please check your order status.",
  NOT_SUPPORTED:
    "This payment configuration is temporarily unavailable. Please try a different payment method or contact support.",
};

function friendlyError(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : String(caught || "");

  // Match known PayPal issue keywords directly in the raw string
  // This catches cases where the backend passes the PayPal error as a flat string
  // rather than as structured JSON (e.g. "NOT_SUPPORTED: This field is not currently supported").
  for (const [issue, friendly] of Object.entries(paypalIssueMessages)) {
    if (raw.includes(issue)) {
      return friendly;
    }
  }

  // Try to extract PayPal issue from JSON in the message
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const issue = parsed?.details?.[0]?.issue;
      if (issue && paypalIssueMessages[issue]) {
        return paypalIssueMessages[issue];
      }
      // Fallback: use PayPal's human-readable description
      const description = parsed?.details?.[0]?.description;
      if (
        typeof description === "string" &&
        description.length > 0 &&
        description.length < 200
      ) {
        return description;
      }
    }
  } catch {
    // not JSON, continue
  }

  // If the message is too long or looks like raw JSON, replace with generic
  if (
    raw.length > 160 ||
    raw.includes('"name":') ||
    raw.includes('"debug_id":')
  ) {
    return "Something went wrong with the payment. Please try a different payment method or contact support.";
  }

  return raw || "An unexpected error occurred. Please try again.";
}

// ==========================================
// Secure Payment Icons
// ==========================================

const VisaLogo = () => (
  <svg
    className="payment-card-logo visa"
    viewBox="0 0 36 24"
    fill="none"
    style={{ height: "20px", width: "auto" }}
  >
    <rect x="0" y="0" width="36" height="24" rx="2" fill="#1a1f71" />
    <text
      x="18"
      y="15.5"
      fill="#ffffff"
      fontSize="8.5"
      fontWeight="900"
      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      textAnchor="middle"
      letterSpacing="0.8"
    >
      VISA
    </text>
  </svg>
);

const MastercardLogo = () => (
  <svg
    className="payment-card-logo mastercard"
    viewBox="0 0 36 24"
    fill="none"
    style={{ height: "20px", width: "auto" }}
  >
    <rect x="0" y="0" width="36" height="24" rx="2" fill="#231f20" />
    <circle cx="14.5" cy="12" r="6.5" fill="#eb001b" />
    <circle cx="21.5" cy="12" r="6.5" fill="#f79e1b" fillOpacity="0.85" />
  </svg>
);

const AmexLogo = () => (
  <svg
    className="payment-card-logo amex"
    viewBox="0 0 36 24"
    fill="none"
    style={{ height: "20px", width: "auto" }}
  >
    <rect x="0" y="0" width="36" height="24" rx="2" fill="#007bc1" />
    <text
      x="18"
      y="15"
      fill="#ffffff"
      fontSize="8"
      fontWeight="bold"
      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      textAnchor="middle"
      letterSpacing="0.4"
    >
      AMEX
    </text>
  </svg>
);

const PayPalWordmark = () => (
  <svg
    className="paypal-wordmark"
    viewBox="0 0 118 32"
    fill="none"
    role="img"
    aria-label="PayPal"
  >
    <path
      d="M15.4 5.2h8.4c4.5 0 7.2 2.5 6.7 6.4-.6 4.8-4.2 7.5-9.3 7.5h-2.5l-1.5 7.8h-5.4l3.6-21.7z"
      fill="#003087"
    />
    <path
      d="M19.8 10h3.2c1.5 0 2.3.8 2.1 2.1-.2 1.6-1.4 2.5-3.1 2.5h-3l.8-4.6z"
      fill="#fff"
    />
    <path
      d="M8.2 8.1h8.4c4.5 0 7.2 2.5 6.7 6.4-.6 4.8-4.2 7.5-9.3 7.5h-2.5L10 29.8H4.6L8.2 8.1z"
      fill="#0070BA"
    />
    <path
      d="M12.6 12.9h3.2c1.5 0 2.3.8 2.1 2.1-.2 1.6-1.4 2.5-3.1 2.5h-3l.8-4.6z"
      fill="#fff"
    />
    <text
      x="35"
      y="22"
      fill="#003087"
      fontSize="19"
      fontWeight="800"
      fontStyle="italic"
      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    >
      Pay
    </text>
    <text
      x="70"
      y="22"
      fill="#0070BA"
      fontSize="19"
      fontWeight="800"
      fontStyle="italic"
      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    >
      Pal
    </text>
  </svg>
);

function TrustBadgesPanel() {
  return (
    <div className="checkout-trust-badges" aria-label="Secure checkout badges">
      <span className="checkout-trust-badges-label">
        Guaranteed Safe Checkout
      </span>
      <img
        src="/trust-badges.webp"
        alt="Powered by Stripe, Mastercard, Visa, Discover, and American Express"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function WhyChooseUsPanel() {
  return (
    <section className="checkout-why-choose" aria-labelledby="why-choose-title">
      <h3 id="why-choose-title">Why Choose Us</h3>
      <div className="checkout-why-list">
        <article>
          <ShieldCheck size={34} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>30-Day Satisfaction &amp; Money Back Guarantee</strong>
            <p>
              If you're not satisfied with your product(s), we'll make it right!
            </p>
          </div>
        </article>
        <article>
          <PackageCheck size={34} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>Over 51,732 Happy Customers and Counting!</strong>
            <p>
              We ship quality products, FAST, it's just one of the reasons we
              have so many happy repeat customers!
            </p>
          </div>
        </article>
        <article>
          <LockKeyhole size={34} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>Shop With Confidence</strong>
            <p>
              Safe and Secure Guaranteed! All information is encrypted and
              transmitted without risk using a Secure Socket Layer (SSL)
              protocol.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
