import {
  PayPalButtons,
  PayPalCardFieldsProvider,
  PayPalCVVField,
  PayPalExpiryField,
  PayPalNameField,
  PayPalNumberField,
  PayPalScriptProvider,
  usePayPalCardFields,
} from '@paypal/react-paypal-js';
import {
  AlertCircle,
  BadgeCheck,
  CreditCard,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Truck,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { formatMoney, formatVariantName, productImages } from '@/lib/format';
import type {
  ApiResponse,
  CreatePaymentResponse,
  Order,
  Product,
  ProductVariant,
} from '@/lib/types';

type Props = {
  product: Product;
  variant: ProductVariant;
  quantity: number;
  paypalClientId: string;
  mapboxAccessToken: string;
};

type CheckoutState =
  | 'editing'
  | 'creating'
  | 'ready'
  | 'capturing'
  | 'complete';
type PaymentMethod = 'paypal' | 'paypal-card';
type AddressAutofillComponentType = ComponentType<
  Record<string, unknown> & { children?: ReactNode }
>;
type AddressAutofillRetrieveResponse = {
  features?: Array<{
    properties?: {
      address_line1?: string;
      full_address?: string;
      address_level1?: string;
      address_level2?: string;
      address_level3?: string;
      postcode?: string;
      country_code?: string;
      metadata?: {
        iso_3166_1?: string;
      };
    };
  }>;
};

const emptyForm = {
  email: '',
  phone: '',
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  billingAddress1: '',
  billingAddress2: '',
  billingCity: '',
  billingState: '',
  billingPostalCode: '',
  billingCountry: 'US',
};

type CheckoutFormFields = typeof emptyForm;
type FieldErrors = Partial<Record<keyof CheckoutFormFields, string>>;

const requiredFields: Array<{
  field: keyof CheckoutFormFields;
  label: string;
}> = [
  { field: 'email', label: 'Email Address' },
  { field: 'firstName', label: 'First Name' },
  { field: 'lastName', label: 'Last Name' },
  { field: 'address1', label: 'Street Address' },
  { field: 'country', label: 'Country' },
  { field: 'state', label: 'State' },
  { field: 'city', label: 'City' },
  { field: 'postalCode', label: 'Zip' },
];
const billingRequiredFields: Array<{
  field: keyof CheckoutFormFields;
  label: string;
}> = [
  { field: 'billingAddress1', label: 'Billing Street Address' },
  { field: 'billingCountry', label: 'Billing Country' },
  { field: 'billingState', label: 'Billing State' },
  { field: 'billingCity', label: 'Billing City' },
  { field: 'billingPostalCode', label: 'Billing Zip' },
];

const checkoutFormStorageKey = '365-deal:checkout-form:v1';
const checkoutOfferDurationSeconds = 7 * 60 + 30;
const paypalCardFieldStyle = {
  input: {
    height: '44px',
    padding: '0 12px',
    'font-family': 'Retina, Helvetica, Arial, sans-serif',
    'font-size': '15px',
    'line-height': '44px',
  },
} as Record<string, Record<string, string>>;

const requiredMarkClass = 'text-danger';
const labelClass =
  'flex flex-wrap gap-x-1 gap-y-2 text-[0.86rem] font-bold leading-tight text-[#556174] [&_em]:not-italic [&_em]:font-semibold [&_em]:text-[#7a8495] [&_input]:min-h-11 [&_input]:w-full [&_input]:flex-[0_0_100%] [&_input]:rounded-brand [&_input]:border [&_input]:border-[#d6dce7] [&_input]:bg-white [&_input]:px-3.5 [&_input]:text-[0.92rem] [&_input]:font-semibold [&_input]:text-slate-700 [&_input]:outline-none [&_input]:transition [&_input:focus]:border-brand/55 [&_input:focus]:shadow-[0_0_0_3px_rgba(35,100,232,0.12)] [&_input::placeholder]:font-medium [&_input::placeholder]:text-[#8b95a6] [&_select]:min-h-11 [&_select]:w-full [&_select]:flex-[0_0_100%] [&_select]:appearance-none [&_select]:rounded-brand [&_select]:border [&_select]:border-[#d6dce7] [&_select]:bg-white [&_select]:bg-[linear-gradient(45deg,transparent_50%,#9aa3b3_50%),linear-gradient(135deg,#9aa3b3_50%,transparent_50%)] [&_select]:bg-[length:6px_6px] [&_select]:bg-[position:calc(100%-18px)_18px,calc(100%-13px)_18px] [&_select]:bg-no-repeat [&_select]:px-3.5 [&_select]:text-[0.92rem] [&_select]:font-semibold [&_select]:text-slate-700 [&_select]:outline-none [&_select]:transition [&_select:focus]:border-brand/55 [&_select:focus]:shadow-[0_0_0_3px_rgba(35,100,232,0.12)]';
const invalidLabelClass =
  'text-rose-800 [&_input]:border-red-400 [&_input]:bg-red-50/30 [&_input]:shadow-[0_0_0_3px_rgba(248,113,113,0.11)] [&_input:focus]:border-red-600 [&_input:focus]:shadow-[0_0_0_3px_rgba(220,38,38,0.14)] [&_select]:border-red-400 [&_select]:bg-red-50/30 [&_select]:shadow-[0_0_0_3px_rgba(248,113,113,0.11)] [&_select:focus]:border-red-600 [&_select:focus]:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]';
const fieldClass = (invalid?: boolean, extra = '') =>
  `${labelClass} ${invalid ? invalidLabelClass : ''} ${extra}`.trim();
const fieldErrorClass =
  'flex-[0_0_100%] text-[0.78rem] font-bold leading-snug text-danger';
const formGridTwoClass =
  'grid grid-cols-2 gap-x-5 gap-y-3.5 max-[760px]:grid-cols-1';
const panelClass = 'border border-line/95 bg-white p-[clamp(22px,3vw,32px)]';
const summaryRowClass =
  'flex justify-between gap-4 border-t border-line bg-white py-[13px]';
const cardLogoClass =
  'h-5 w-auto rounded-[3px] shadow-sm transition hover:-translate-y-0.5';

const countries = [
  {
    code: 'US',
    name: 'United States',
    regions: [
      'Alabama',
      'Alaska',
      'Arizona',
      'Arkansas',
      'California',
      'Colorado',
      'Connecticut',
      'Delaware',
      'Florida',
      'Georgia',
      'Hawaii',
      'Idaho',
      'Illinois',
      'Indiana',
      'Iowa',
      'Kansas',
      'Kentucky',
      'Louisiana',
      'Maine',
      'Maryland',
      'Massachusetts',
      'Michigan',
      'Minnesota',
      'Mississippi',
      'Missouri',
      'Montana',
      'Nebraska',
      'Nevada',
      'New Hampshire',
      'New Jersey',
      'New Mexico',
      'New York',
      'North Carolina',
      'North Dakota',
      'Ohio',
      'Oklahoma',
      'Oregon',
      'Pennsylvania',
      'Rhode Island',
      'South Carolina',
      'South Dakota',
      'Tennessee',
      'Texas',
      'Utah',
      'Vermont',
      'Virginia',
      'Washington',
      'West Virginia',
      'Wisconsin',
      'Wyoming',
      'District of Columbia',
    ],
  },
  {
    code: 'CA',
    name: 'Canada',
    regions: [
      'Alberta',
      'British Columbia',
      'Manitoba',
      'New Brunswick',
      'Newfoundland and Labrador',
      'Northwest Territories',
      'Nova Scotia',
      'Nunavut',
      'Ontario',
      'Prince Edward Island',
      'Quebec',
      'Saskatchewan',
      'Yukon',
    ],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    regions: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  },
  {
    code: 'AU',
    name: 'Australia',
    regions: [
      'Australian Capital Territory',
      'New South Wales',
      'Northern Territory',
      'Queensland',
      'South Australia',
      'Tasmania',
      'Victoria',
      'Western Australia',
    ],
  },
  {
    code: 'SG',
    name: 'Singapore',
    regions: [
      'Central Region',
      'East Region',
      'North Region',
      'North-East Region',
      'West Region',
    ],
  },
  {
    code: 'HK',
    name: 'Hong Kong',
    regions: ['Hong Kong Island', 'Kowloon', 'New Territories'],
  },
  {
    code: 'CN',
    name: 'China',
    regions: [
      'Anhui',
      'Beijing',
      'Chongqing',
      'Fujian',
      'Gansu',
      'Guangdong',
      'Guangxi',
      'Guizhou',
      'Hainan',
      'Hebei',
      'Heilongjiang',
      'Henan',
      'Hubei',
      'Hunan',
      'Inner Mongolia',
      'Jiangsu',
      'Jiangxi',
      'Jilin',
      'Liaoning',
      'Ningxia',
      'Qinghai',
      'Shaanxi',
      'Shandong',
      'Shanghai',
      'Shanxi',
      'Sichuan',
      'Tianjin',
      'Tibet',
      'Xinjiang',
      'Yunnan',
      'Zhejiang',
    ],
  },
] as const;

export default function CheckoutForm({
  product,
  variant,
  quantity,
  paypalClientId,
  mapboxAccessToken,
}: Props) {
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<CheckoutState>('editing');
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<CreatePaymentResponse | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('paypal-card');
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [billingAddressAsShippingAddress, setBillingAddressAsShippingAddress] =
    useState(true);
  const [cardFieldsEligible, setCardFieldsEligible] = useState(false);
  const [AddressAutofillComponent, setAddressAutofillComponent] =
    useState<AddressAutofillComponentType | null>(null);
  const [hasRestoredForm, setHasRestoredForm] = useState(false);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(
    checkoutOfferDurationSeconds,
  );

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
  const selectedCountry =
    countries.find((country) => country.code === form.country) ?? countries[0];
  const regionOptions = selectedCountry.regions;
  const selectedBillingCountry =
    countries.find((country) => country.code === form.billingCountry) ??
    countries[0];
  const billingRegionOptions = selectedBillingCountry.regions;
  const offerTime = `${String(Math.floor(offerSecondsLeft / 60)).padStart(2, '0')}:${String(offerSecondsLeft % 60).padStart(2, '0')}`;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setOfferSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    try {
      const savedForm = window.localStorage.getItem(checkoutFormStorageKey);

      if (savedForm) {
        setForm(mergeStoredForm(JSON.parse(savedForm)));
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

    window.localStorage.setItem(checkoutFormStorageKey, JSON.stringify(form));
  }, [form, hasRestoredForm]);

  useEffect(() => {
    if (!mapboxAccessToken) {
      return undefined;
    }

    let mounted = true;

    import('@mapbox/search-js-react')
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

  function updateField(field: keyof CheckoutFormFields, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) {
      setError('');
    }
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateCountry(value: string) {
    setForm((current) => ({
      ...current,
      country: value,
      state: '',
    }));
    if (fieldErrors.country || fieldErrors.state) {
      setError('');
    }
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.country;
      delete next.state;
      return next;
    });
  }

  function updateBillingCountry(value: string) {
    setForm((current) => ({
      ...current,
      billingCountry: value,
      billingState: '',
    }));
    if (fieldErrors.billingCountry || fieldErrors.billingState) {
      setError('');
    }
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.billingCountry;
      delete next.billingState;
      return next;
    });
  }

  function updateBillingAddressAsShippingAddress(value: boolean) {
    setBillingAddressAsShippingAddress(value);
    setOrder(null);
    setPayment(null);
    setState('editing');
    setError('');

    if (value) {
      setFieldErrors((current) => {
        const next = { ...current };
        billingRequiredFields.forEach(({ field }) => {
          delete next[field];
        });
        return next;
      });
    }
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
      properties.address_level1 || '',
    );

    setForm((current) => ({
      ...current,
      address1:
        properties.address_line1 || properties.full_address || current.address1,
      city:
        properties.address_level2 || properties.address_level3 || current.city,
      postalCode: properties.postcode || current.postalCode,
      country: country.code,
      state: matchedRegion || '',
    }));
    setError('');
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.address1;
      delete next.city;
      delete next.postalCode;
      delete next.country;
      delete next.state;
      return next;
    });
  }

  function scrollToFirstError() {
    window.setTimeout(() => {
      const firstInvalidField = document.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );

      firstInvalidField?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      firstInvalidField?.focus({ preventScroll: true });
    }, 0);
  }

  function validateDetails() {
    if (!acceptedTerms) {
      setError('Please agree to the terms before paying.');
      return false;
    }

    const nextFieldErrors: FieldErrors = {};

    requiredFields.forEach(({ field, label }) => {
      if (!form[field].trim()) {
        nextFieldErrors[field] = `${label} is required.`;
      }
    });

    if (!billingAddressAsShippingAddress) {
      billingRequiredFields.forEach(({ field, label }) => {
        if (!form[field].trim()) {
          nextFieldErrors[field] = `${label} is required.`;
        }
      });
    }

    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      nextFieldErrors.email = 'Enter a valid email address.';
    }

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      setError(
        'Please complete the highlighted checkout details before paying.',
      );
      scrollToFirstError();
      return false;
    }

    return true;
  }

  async function preparePayment(fundingSource: PaymentMethod) {
    if (payment?.providerOrderId) {
      return payment.providerOrderId;
    }

    if (!validateDetails()) {
      throw new Error('Please complete the checkout details first.');
    }

    setError('');
    setFieldErrors({});
    setState('creating');

    try {
      const createdOrder = await postCommerce<Order>(
        '/api/orders',
        {
          origin: window.location.origin,
          customer: {
            email: form.email,
            phone: form.phone.trim() || 'Not provided',
            firstName: form.firstName,
            lastName: form.lastName,
          },
          billingAddress: billingAddressAsShippingAddress
            ? {
                address1: form.address1,
                address2: form.address2,
                city: form.city,
                state: form.state,
                postalCode: form.postalCode,
                country: form.country,
              }
            : {
                address1: form.billingAddress1,
                address2: form.billingAddress2,
                city: form.billingCity,
                state: form.billingState,
                postalCode: form.billingPostalCode,
                country: form.billingCountry,
              },
          billingAddressAsShippingAddress,
          shippingAddress: {
            address1: form.address1,
            address2: form.address2,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: form.country,
          },
          items: [
            {
              productSlug: product.slug,
              sku: variant.sku,
              quantity,
            },
          ],
        },
      );

      const createdPayment = await postCommerce<CreatePaymentResponse>(
        '/api/payments/create',
        {
          orderNo: createdOrder.orderNo,
          provider: 'paypal',
          fundingSource,
        },
      );

      setOrder(createdOrder);
      setPayment(createdPayment);
      setState('ready');
      return createdPayment.providerOrderId;
    } catch (caught) {
      setState('editing');
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to prepare checkout.',
      );
      throw caught;
    }
  }

  async function capture(providerOrderId: string) {
    if (!order) {
      throw new Error('Order is not ready yet.');
    }

    setError('');
    setState('capturing');

    try {
      const capturedOrder = await postCommerce<Order>(
        '/api/payments/capture',
        {
          orderNo: order.orderNo,
          provider: 'paypal',
          providerOrderId,
        },
      );
      setState('complete');
      window.location.href = `/orders/${encodeURIComponent(capturedOrder.orderNo)}?status=paid`;
    } catch (caught) {
      setState('ready');
      setError(
        caught instanceof Error ? caught.message : 'Payment capture failed.',
      );
    }
  }

  return (
    <div className="grid">
      <a
        className="relative left-1/2 ml-[-50vw] block w-screen bg-[#0b77ad] px-4 py-2 text-center text-base leading-tight text-white no-underline"
        href="/#buy"
      >
        Claim Your Flash Deal - Up To 50% Off Today!
      </a>
      <div
        className="grid justify-items-center gap-[27px] pt-[31px] text-center"
        aria-label="Checkout confidence"
      >
        <a className="inline-block no-underline" href="/">
          <img
            className="block h-auto w-[min(244px,66vw)]"
            src="/ms365-logo.png"
            alt="365 Deal"
          />
        </a>
        <div
          className="flex w-fit max-w-[calc(100vw-40px)] items-center justify-center gap-2 py-[17px] pb-[18px] text-xl leading-tight text-[#222]"
          aria-label="Checkout offer reminder"
        >
          <TriangleAlert
            className="shrink-0 text-[#f6c000] [stroke:#1f2937] [stroke-width:1.7]"
            size={20}
            fill="currentColor"
          />
          <strong className="font-black text-[#df1b1b]">Flash Deal</strong>
          <span>Expires In:</span>
          <b className="text-[#df1b1b]">{offerTime}</b>
        </div>
      </div>

      <div className="mt-0.5 grid grid-cols-[minmax(0,1.25fr)_minmax(360px,0.95fr)] items-start gap-8 max-[980px]:grid-cols-1">
        <form
          className="border border-line/95 bg-white p-[clamp(22px,4vw,34px)]"
          id="checkout-details-form"
          onSubmit={(event) => {
            event.preventDefault();
            preparePayment(paymentMethod).catch(() => undefined);
          }}
        >
          <div className="mb-7">
            <h1 className="m-0 font-serif text-[clamp(1.65rem,3vw,2.25rem)] leading-[1.08]">
              Shipping Details
            </h1>
          </div>

          <fieldset
            className="m-0 grid min-w-0 gap-5 border-0 p-0"
            disabled={state !== 'editing'}
          >
            <label className={fieldClass(Boolean(fieldErrors.email))}>
              Email Address{' '}
              <span className={requiredMarkClass} aria-hidden="true">
                *
              </span>
              <input
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                aria-invalid={fieldErrors.email ? 'true' : undefined}
                autoComplete="email"
                placeholder="Email Address"
                required
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
              />
              {fieldErrors.email ? (
                <small className={fieldErrorClass} id="email-error">
                  {fieldErrors.email}
                </small>
              ) : null}
            </label>
            <div className={formGridTwoClass}>
              <label className={fieldClass(Boolean(fieldErrors.firstName))}>
                First Name{' '}
                <span className={requiredMarkClass} aria-hidden="true">
                  *
                </span>
                <input
                  aria-describedby={
                    fieldErrors.firstName ? 'first-name-error' : undefined
                  }
                  aria-invalid={fieldErrors.firstName ? 'true' : undefined}
                  autoComplete="given-name"
                  placeholder="First Name"
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    updateField('firstName', event.target.value)
                  }
                />
                {fieldErrors.firstName ? (
                  <small className={fieldErrorClass} id="first-name-error">
                    {fieldErrors.firstName}
                  </small>
                ) : null}
              </label>
              <label className={fieldClass(Boolean(fieldErrors.lastName))}>
                Last Name{' '}
                <span className={requiredMarkClass} aria-hidden="true">
                  *
                </span>
                <input
                  aria-describedby={
                    fieldErrors.lastName ? 'last-name-error' : undefined
                  }
                  aria-invalid={fieldErrors.lastName ? 'true' : undefined}
                  autoComplete="family-name"
                  placeholder="Last Name"
                  required
                  value={form.lastName}
                  onChange={(event) =>
                    updateField('lastName', event.target.value)
                  }
                />
                {fieldErrors.lastName ? (
                  <small className={fieldErrorClass} id="last-name-error">
                    {fieldErrors.lastName}
                  </small>
                ) : null}
              </label>
            </div>
            <label className={fieldClass()}>
              Phone <em>(optional)</em>
              <input
                autoComplete="tel"
                placeholder="Phone Number"
                type="tel"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
              />
            </label>

            <label
              className={fieldClass(
                Boolean(fieldErrors.address1),
                'relative z-[5] [&_mapbox-address-autofill]:w-full [&_mapbox-address-autofill]:flex-[0_0_100%]',
              )}
            >
              Street Address{' '}
              <span className={requiredMarkClass} aria-hidden="true">
                *
              </span>
              {mapboxAccessToken && AddressAutofillComponent ? (
                <AddressAutofillComponent
                  accessToken={mapboxAccessToken}
                  browserAutofillEnabled
                  onRetrieve={applyMapboxAddress}
                  options={{
                    country: form.country,
                    language: 'en',
                    limit: 5,
                  }}
                  popoverOptions={{
                    offset: 6,
                    placement: 'bottom-start',
                  }}
                  theme={{
                    variables: {
                      borderRadius: '8px',
                      colorPrimary: '#2364e8',
                      colorText: '#121316',
                      colorBackground: '#ffffff',
                    },
                  }}
                >
                  <input
                    aria-describedby={
                      fieldErrors.address1 ? 'address1-error' : undefined
                    }
                    aria-invalid={fieldErrors.address1 ? 'true' : undefined}
                    autoComplete="address-line1"
                    placeholder="Street Address"
                    required
                    value={form.address1}
                    onChange={(event) =>
                      updateField('address1', event.target.value)
                    }
                  />
                </AddressAutofillComponent>
              ) : (
                <input
                  aria-describedby={
                    fieldErrors.address1 ? 'address1-error' : undefined
                  }
                  aria-invalid={fieldErrors.address1 ? 'true' : undefined}
                  autoComplete="address-line1"
                  placeholder="Street Address"
                  required
                  value={form.address1}
                  onChange={(event) =>
                    updateField('address1', event.target.value)
                  }
                />
              )}
              {fieldErrors.address1 ? (
                <small className={fieldErrorClass} id="address1-error">
                  {fieldErrors.address1}
                </small>
              ) : null}
            </label>
            <label className={fieldClass()}>
              Apartment, suite, unit, etc. <em>(optional)</em>
              <input
                autoComplete="address-line2"
                placeholder="Apartment, suite, unit, etc."
                value={form.address2}
                onChange={(event) =>
                  updateField('address2', event.target.value)
                }
              />
            </label>
            <div className={formGridTwoClass}>
              <label className={fieldClass(Boolean(fieldErrors.country))}>
                Country{' '}
                <span className={requiredMarkClass} aria-hidden="true">
                  *
                </span>
                <select
                  aria-describedby={
                    fieldErrors.country ? 'country-error' : undefined
                  }
                  aria-invalid={fieldErrors.country ? 'true' : undefined}
                  autoComplete="country"
                  required
                  value={form.country}
                  onChange={(event) => updateCountry(event.target.value)}
                >
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.country ? (
                  <small className={fieldErrorClass} id="country-error">
                    {fieldErrors.country}
                  </small>
                ) : null}
              </label>
              <label className={fieldClass(Boolean(fieldErrors.state))}>
                State{' '}
                <span className={requiredMarkClass} aria-hidden="true">
                  *
                </span>
                {regionOptions.length ? (
                  <select
                    aria-describedby={
                      fieldErrors.state ? 'state-error' : undefined
                    }
                    aria-invalid={fieldErrors.state ? 'true' : undefined}
                    autoComplete="address-level1"
                    required
                    value={form.state}
                    onChange={(event) =>
                      updateField('state', event.target.value)
                    }
                  >
                    <option value="">Region</option>
                    {regionOptions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-describedby={
                      fieldErrors.state ? 'state-error' : undefined
                    }
                    aria-invalid={fieldErrors.state ? 'true' : undefined}
                    autoComplete="address-level1"
                    placeholder="Region"
                    required
                    value={form.state}
                    onChange={(event) =>
                      updateField('state', event.target.value)
                    }
                  />
                )}
                {fieldErrors.state ? (
                  <small className={fieldErrorClass} id="state-error">
                    {fieldErrors.state}
                  </small>
                ) : null}
              </label>
            </div>
            <div className={formGridTwoClass}>
              <label className={fieldClass(Boolean(fieldErrors.city))}>
                City{' '}
                <span className={requiredMarkClass} aria-hidden="true">
                  *
                </span>
                <input
                  aria-describedby={fieldErrors.city ? 'city-error' : undefined}
                  aria-invalid={fieldErrors.city ? 'true' : undefined}
                  autoComplete="address-level2"
                  placeholder="City"
                  required
                  value={form.city}
                  onChange={(event) => updateField('city', event.target.value)}
                />
                {fieldErrors.city ? (
                  <small className={fieldErrorClass} id="city-error">
                    {fieldErrors.city}
                  </small>
                ) : null}
              </label>
              <label className={fieldClass(Boolean(fieldErrors.postalCode))}>
                Zip{' '}
                <span className={requiredMarkClass} aria-hidden="true">
                  *
                </span>
                <input
                  aria-describedby={
                    fieldErrors.postalCode ? 'postal-code-error' : undefined
                  }
                  aria-invalid={fieldErrors.postalCode ? 'true' : undefined}
                  autoComplete="postal-code"
                  placeholder="Zip"
                  required
                  value={form.postalCode}
                  onChange={(event) =>
                    updateField('postalCode', event.target.value)
                  }
                />
                {fieldErrors.postalCode ? (
                  <small className={fieldErrorClass} id="postal-code-error">
                    {fieldErrors.postalCode}
                  </small>
                ) : null}
              </label>
            </div>

            <div className="border-t border-line pt-5">
              <label className="flex items-start gap-3 text-[0.9rem] font-extrabold leading-snug text-ink">
                <input
                  className="mt-0.5 h-4 min-w-4 accent-brand"
                  type="checkbox"
                  checked={billingAddressAsShippingAddress}
                  onChange={(event) =>
                    updateBillingAddressAsShippingAddress(event.target.checked)
                  }
                />
                <span>Billing address is the same as shipping address</span>
              </label>
            </div>

            {!billingAddressAsShippingAddress ? (
              <div className="grid gap-5 border-t border-line pt-5">
                <h2 className="m-0 font-serif text-[clamp(1.25rem,2vw,1.55rem)] leading-[1.1]">
                  Billing Address
                </h2>
                <label
                  className={fieldClass(Boolean(fieldErrors.billingAddress1))}
                >
                  Street Address{' '}
                  <span className={requiredMarkClass} aria-hidden="true">
                    *
                  </span>
                  <input
                    aria-describedby={
                      fieldErrors.billingAddress1
                        ? 'billing-address1-error'
                        : undefined
                    }
                    aria-invalid={
                      fieldErrors.billingAddress1 ? 'true' : undefined
                    }
                    autoComplete="billing address-line1"
                    placeholder="Street Address"
                    required
                    value={form.billingAddress1}
                    onChange={(event) =>
                      updateField('billingAddress1', event.target.value)
                    }
                  />
                  {fieldErrors.billingAddress1 ? (
                    <small
                      className={fieldErrorClass}
                      id="billing-address1-error"
                    >
                      {fieldErrors.billingAddress1}
                    </small>
                  ) : null}
                </label>
                <label className={fieldClass()}>
                  Apartment, suite, unit, etc. <em>(optional)</em>
                  <input
                    autoComplete="billing address-line2"
                    placeholder="Apartment, suite, unit, etc."
                    value={form.billingAddress2}
                    onChange={(event) =>
                      updateField('billingAddress2', event.target.value)
                    }
                  />
                </label>
                <div className={formGridTwoClass}>
                  <label
                    className={fieldClass(Boolean(fieldErrors.billingCountry))}
                  >
                    Country{' '}
                    <span className={requiredMarkClass} aria-hidden="true">
                      *
                    </span>
                    <select
                      aria-describedby={
                        fieldErrors.billingCountry
                          ? 'billing-country-error'
                          : undefined
                      }
                      aria-invalid={
                        fieldErrors.billingCountry ? 'true' : undefined
                      }
                      autoComplete="billing country"
                      required
                      value={form.billingCountry}
                      onChange={(event) =>
                        updateBillingCountry(event.target.value)
                      }
                    >
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.billingCountry ? (
                      <small
                        className={fieldErrorClass}
                        id="billing-country-error"
                      >
                        {fieldErrors.billingCountry}
                      </small>
                    ) : null}
                  </label>
                  <label
                    className={fieldClass(Boolean(fieldErrors.billingState))}
                  >
                    State{' '}
                    <span className={requiredMarkClass} aria-hidden="true">
                      *
                    </span>
                    {billingRegionOptions.length ? (
                      <select
                        aria-describedby={
                          fieldErrors.billingState
                            ? 'billing-state-error'
                            : undefined
                        }
                        aria-invalid={
                          fieldErrors.billingState ? 'true' : undefined
                        }
                        autoComplete="billing address-level1"
                        required
                        value={form.billingState}
                        onChange={(event) =>
                          updateField('billingState', event.target.value)
                        }
                      >
                        <option value="">Region</option>
                        {billingRegionOptions.map((region) => (
                          <option key={region} value={region}>
                            {region}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-describedby={
                          fieldErrors.billingState
                            ? 'billing-state-error'
                            : undefined
                        }
                        aria-invalid={
                          fieldErrors.billingState ? 'true' : undefined
                        }
                        autoComplete="billing address-level1"
                        placeholder="Region"
                        required
                        value={form.billingState}
                        onChange={(event) =>
                          updateField('billingState', event.target.value)
                        }
                      />
                    )}
                    {fieldErrors.billingState ? (
                      <small
                        className={fieldErrorClass}
                        id="billing-state-error"
                      >
                        {fieldErrors.billingState}
                      </small>
                    ) : null}
                  </label>
                </div>
                <div className={formGridTwoClass}>
                  <label
                    className={fieldClass(Boolean(fieldErrors.billingCity))}
                  >
                    City{' '}
                    <span className={requiredMarkClass} aria-hidden="true">
                      *
                    </span>
                    <input
                      aria-describedby={
                        fieldErrors.billingCity
                          ? 'billing-city-error'
                          : undefined
                      }
                      aria-invalid={
                        fieldErrors.billingCity ? 'true' : undefined
                      }
                      autoComplete="billing address-level2"
                      placeholder="City"
                      required
                      value={form.billingCity}
                      onChange={(event) =>
                        updateField('billingCity', event.target.value)
                      }
                    />
                    {fieldErrors.billingCity ? (
                      <small
                        className={fieldErrorClass}
                        id="billing-city-error"
                      >
                        {fieldErrors.billingCity}
                      </small>
                    ) : null}
                  </label>
                  <label
                    className={fieldClass(
                      Boolean(fieldErrors.billingPostalCode),
                    )}
                  >
                    Zip{' '}
                    <span className={requiredMarkClass} aria-hidden="true">
                      *
                    </span>
                    <input
                      aria-describedby={
                        fieldErrors.billingPostalCode
                          ? 'billing-postal-code-error'
                          : undefined
                      }
                      aria-invalid={
                        fieldErrors.billingPostalCode ? 'true' : undefined
                      }
                      autoComplete="billing postal-code"
                      placeholder="Zip"
                      required
                      value={form.billingPostalCode}
                      onChange={(event) =>
                        updateField('billingPostalCode', event.target.value)
                      }
                    />
                    {fieldErrors.billingPostalCode ? (
                      <small
                        className={fieldErrorClass}
                        id="billing-postal-code-error"
                      >
                        {fieldErrors.billingPostalCode}
                      </small>
                    ) : null}
                  </label>
                </div>
              </div>
            ) : null}
          </fieldset>
        </form>

        <aside className="sticky top-[92px] grid gap-3.5 max-[980px]:static">
          <section className={panelClass}>
            <p className="mb-3 mt-0 text-[0.78rem] font-extrabold uppercase tracking-[0.08em] text-brand">
              Your order
            </p>
            <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-4">
              <div
                className="grid h-[78px] w-[78px] place-items-center overflow-hidden bg-[#f1f3f7]"
                aria-hidden="true"
              >
                {productImage ? (
                  <img
                    className="h-full w-full object-cover"
                    src={productImage}
                    alt=""
                  />
                ) : (
                  <span className="font-serif text-3xl font-black text-brand">
                    W
                  </span>
                )}
              </div>
              <div>
                <h2 className="mb-[7px] mt-0 font-serif text-[1.34rem] leading-[1.14]">
                  {product.title}
                </h2>
                <p className="m-0 leading-[1.55] text-muted">
                  {formatVariantName(variant)}
                </p>
                <small className="mt-[5px] block text-[0.78rem] font-black text-[#8a94a6]">
                  SKU {variant.sku}
                </small>
              </div>
            </div>
            {discountPercent ? (
              <div className="mt-[22px] flex items-baseline justify-between gap-4 border-t border-line pt-[18px]">
                <strong className="text-lg uppercase text-success">
                  Save {discountPercent}%
                </strong>
                <span className="flex flex-wrap justify-end gap-2 font-black text-danger">
                  <del className="text-brand decoration-danger decoration-2">
                    {formatMoney(compareTotal || 0, product.currency)}
                  </del>
                  {formatMoney(lineTotal, product.currency)}
                </span>
              </div>
            ) : null}
            <dl className="mt-5 grid overflow-hidden">
              <div className={summaryRowClass}>
                <dt className="font-extrabold text-muted">Quantity</dt>
                <dd className="m-0 text-right">{quantity}</dd>
              </div>
              <div className={summaryRowClass}>
                <dt className="font-extrabold text-muted">Subtotal</dt>
                <dd className="m-0 text-right">
                  {formatMoney(lineTotal, product.currency)}
                </dd>
              </div>
              <div className={summaryRowClass}>
                <dt className="font-extrabold text-muted">Shipping</dt>
                <dd className="m-0 text-right">
                  {formatMoney(0, product.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line bg-white py-[13px] text-[1.24rem] font-black text-ink">
                <dt>Total</dt>
                <dd className="m-0 text-right">
                  {formatMoney(lineTotal, product.currency)}
                </dd>
              </div>
            </dl>

            <div
              className="mt-[22px] grid gap-2.5 text-[0.88rem] font-extrabold text-[#667085]"
              aria-label="Checkout benefits"
            >
              <span className="flex items-center gap-[9px]">
                <ShieldCheck className="text-success" size={17} /> PayPal
                protected checkout
              </span>
              <span className="flex items-center gap-[9px]">
                <Truck className="text-success" size={17} /> Digital delivery by
                email
              </span>
              <span className="flex items-center gap-[9px]">
                <BadgeCheck className="text-success" size={17} /> Satisfaction
                support
              </span>
            </div>
          </section>

          <section className={panelClass}>
            <div className="mb-[18px] flex items-center justify-between gap-3">
              <h2 className="m-0">Payment</h2>
              <LockKeyhole className="text-brand" size={18} />
            </div>

            {paypalClientId ? (
              <PayPalScriptProvider
                options={{
                  clientId: paypalClientId,
                  components: 'buttons,card-fields',
                  currency: product.currency,
                  disableFunding: 'paylater',
                  enableFunding: 'card',
                  intent: 'capture',
                }}
              >
                <div>
                  <div className="mb-[18px] flex items-center justify-between gap-3 text-base font-extrabold text-ink">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-grid h-[19px] w-[19px] flex-none place-items-center rounded-full border-[6px] border-brand bg-white"
                        aria-hidden="true"
                      />
                      <div className="grid gap-[3px]">
                        <strong>Credit / Debit Card</strong>
                        <small className="text-[0.78rem] font-bold leading-tight text-[#667085]">
                          Encrypted card payment by PayPal
                        </small>
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap items-center justify-end gap-[5px]"
                      aria-label="Accepted card types"
                    >
                      <VisaLogo />
                      <MastercardLogo />
                      <AmexLogo />
                    </div>
                  </div>

                  {cardFieldsEligible ? (
                    <PayPalCardFieldsProvider
                      createOrder={async () => {
                        setPaymentMethod('paypal-card');
                        return preparePayment('paypal-card');
                      }}
                      onApprove={async (data) => {
                        await capture(
                          String(
                            data.orderID || payment?.providerOrderId || '',
                          ),
                        );
                      }}
                      onError={(caught) => {
                        setState(
                          payment?.providerOrderId ? 'ready' : 'editing',
                        );
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : 'PayPal card payment could not be completed.',
                        );
                      }}
                    >
                      <div className="grid gap-0.5">
                        <div className="grid min-w-0">
                          <div className="min-h-[46px] overflow-hidden bg-transparent p-0 [&_iframe]:block [&_iframe]:min-h-[46px]">
                            <PayPalNameField
                              placeholder="Full name on card"
                              style={paypalCardFieldStyle}
                            />
                          </div>
                        </div>
                        <div className="grid min-w-0">
                          <div className="min-h-[46px] overflow-hidden bg-transparent p-0 [&_iframe]:block [&_iframe]:min-h-[46px]">
                            <PayPalNumberField
                              placeholder="0000 0000 0000 0000"
                              style={paypalCardFieldStyle}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-[1fr_0.72fr] gap-0.5 max-[760px]:grid-cols-1">
                          <div className="grid min-w-0">
                            <div className="min-h-[46px] overflow-hidden bg-transparent p-0 [&_iframe]:block [&_iframe]:min-h-[46px]">
                              <PayPalExpiryField
                                placeholder="MM / YY"
                                style={paypalCardFieldStyle}
                              />
                            </div>
                          </div>
                          <div className="grid min-w-0">
                            <div className="min-h-[46px] overflow-hidden bg-transparent p-0 [&_iframe]:block [&_iframe]:min-h-[46px]">
                              <PayPalCVVField
                                placeholder="•••"
                                style={paypalCardFieldStyle}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <PayPalCardSubmitButton
                        disabled={
                          state === 'creating' ||
                          state === 'capturing' ||
                          !acceptedTerms
                        }
                        onBeforeSubmit={validateDetails}
                      />
                      <p className="mt-5 flex items-center justify-center gap-[7px] text-[0.78rem] font-bold leading-snug text-[#667085]">
                        <LockKeyhole
                          className="shrink-0 text-success"
                          size={14}
                        />
                        Your card details are handled inside PayPal secure
                        fields.
                      </p>
                    </PayPalCardFieldsProvider>
                  ) : (
                    <div className="paypal-card-fallback-simple">
                      <p>
                        Secure credit card checkout is processed through PayPal.{' '}
                        <strong>No PayPal account is required</strong> — simply
                        click the PayPal button below to pay with your Credit or
                        Debit Card.
                      </p>
                    </div>
                  )}

                  {/* 隐藏探测组件，静默挂载以改变 cardFieldsEligible 状态 */}
                  <div style={{ display: 'none' }} aria-hidden="true">
                    <PayPalCardFieldsProvider
                      createOrder={async () => ''}
                      onApprove={async () => {}}
                      onError={() => {}}
                    >
                      <PayPalCardFieldsReady
                        onReady={() => setCardFieldsEligible(true)}
                      />
                    </PayPalCardFieldsProvider>
                  </div>
                </div>

                <div className="my-[22px] mb-[18px] flex items-center text-center text-[0.86rem] font-extrabold uppercase tracking-[0.05em] text-[#667085] before:mr-4 before:flex-1 before:border-b before:border-line before:content-[''] after:ml-4 after:flex-1 after:border-b after:border-line after:content-['']">
                  <span>OR</span>
                </div>

                <div className="mt-2.5">
                  <PayPalButtons
                    disabled={
                      state === 'creating' ||
                      state === 'capturing' ||
                      !acceptedTerms
                    }
                    fundingSource="paypal"
                    createOrder={async () => {
                      setPaymentMethod('paypal');
                      return preparePayment('paypal');
                    }}
                    onApprove={async (data) => {
                      await capture(
                        String(data.orderID || payment?.providerOrderId || ''),
                      );
                    }}
                    onError={(caught) => {
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : 'PayPal could not complete approval.',
                      );
                    }}
                    style={{
                      layout: 'vertical',
                      shape: 'rect',
                      label: 'pay',
                    }}
                  />
                </div>
              </PayPalScriptProvider>
            ) : (
              <p className="flex items-start gap-2 rounded-brand border border-red-200 bg-red-50 p-3 text-sm font-bold leading-snug text-red-900">
                PayPal configuration is unavailable. Please check the
                /api/commerce/config API before taking payments.
              </p>
            )}

            <div className="mt-6 flex justify-center">
              <img
                className="h-auto w-full max-w-[430px]"
                src="/secure-checkout.png"
                alt="Guaranteed safe checkout"
                loading="lazy"
              />
            </div>

            <label className="mt-[22px] flex items-start gap-[9px] pt-0.5 text-[0.84rem] leading-snug text-muted">
              <input
                className="mt-0.5 h-4 min-w-4 accent-brand"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                I agree to the{' '}
                <a
                  className="font-extrabold text-brand no-underline"
                  href="/terms-conditions"
                >
                  Terms
                </a>{' '}
                and{' '}
                <a
                  className="font-extrabold text-brand no-underline"
                  href="/privacy-policy"
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            {error ? (
              <p
                className="flex items-start gap-2 rounded-brand border border-red-200 bg-red-50 p-3 text-sm font-bold leading-snug text-red-900"
                role="alert"
              >
                <AlertCircle size={17} aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : null}

            {state === 'ready' ||
            state === 'capturing' ||
            state === 'complete' ? (
              <div className="mt-3.5 flex items-center justify-between gap-3 rounded-brand border border-line bg-white p-3 text-muted max-[760px]:grid">
                <LockKeyhole size={18} />
                <span className="flex-1 leading-snug">
                  Order {order?.orderNo} is ready for{' '}
                  {paymentMethod === 'paypal-card'
                    ? 'card payment'
                    : 'PayPal approval'}
                  .
                </span>
                <button
                  className="inline-flex items-center gap-[7px] border-0 bg-transparent font-black text-brand"
                  onClick={() => {
                    setOrder(null);
                    setPayment(null);
                    setState('editing');
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

function PayPalCardSubmitButton({
  disabled,
  onBeforeSubmit,
}: {
  disabled: boolean;
  onBeforeSubmit: () => boolean;
}) {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = useState(false);

  async function submitCard() {
    if (!onBeforeSubmit() || typeof cardFieldsForm?.submit !== 'function') {
      return;
    }

    setSubmitting(true);
    try {
      await cardFieldsForm.submit();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      className="mt-4 inline-flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-[7px] border-0 bg-brand px-[18px] font-extrabold text-white shadow-[0_14px_26px_rgba(35,100,232,0.22)] transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-[#9aa3b3]"
      disabled={disabled || submitting}
      onClick={submitCard}
      type="button"
    >
      <CreditCard size={18} />
      {submitting ? 'Processing card...' : 'Pay with Card'}
    </button>
  );
}

function matchRegion(regions: readonly string[], value: string) {
  const normalizedValue = normalizeRegion(value);

  if (!normalizedValue) {
    return '';
  }

  return (
    regions.find((region) => normalizeRegion(region) === normalizedValue) ??
    regions.find(
      (region) =>
        normalizeRegion(region).includes(normalizedValue) ||
        normalizedValue.includes(normalizeRegion(region)),
    ) ??
    ''
  );
}

function normalizeRegion(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mergeStoredForm(value: unknown): CheckoutFormFields {
  if (!value || typeof value !== 'object') {
    return emptyForm;
  }

  const stored = value as Partial<Record<keyof CheckoutFormFields, unknown>>;
  const country =
    typeof stored.country === 'string' &&
    countries.some((item) => item.code === stored.country)
      ? stored.country
      : emptyForm.country;
  const billingCountry =
    typeof stored.billingCountry === 'string' &&
    countries.some((item) => item.code === stored.billingCountry)
      ? stored.billingCountry
      : emptyForm.billingCountry;

  return {
    email: typeof stored.email === 'string' ? stored.email : emptyForm.email,
    phone: typeof stored.phone === 'string' ? stored.phone : emptyForm.phone,
    firstName:
      typeof stored.firstName === 'string'
        ? stored.firstName
        : emptyForm.firstName,
    lastName:
      typeof stored.lastName === 'string'
        ? stored.lastName
        : emptyForm.lastName,
    address1:
      typeof stored.address1 === 'string'
        ? stored.address1
        : emptyForm.address1,
    address2:
      typeof stored.address2 === 'string'
        ? stored.address2
        : emptyForm.address2,
    city: typeof stored.city === 'string' ? stored.city : emptyForm.city,
    state: typeof stored.state === 'string' ? stored.state : emptyForm.state,
    postalCode:
      typeof stored.postalCode === 'string'
        ? stored.postalCode
        : emptyForm.postalCode,
    country,
    billingAddress1:
      typeof stored.billingAddress1 === 'string'
        ? stored.billingAddress1
        : emptyForm.billingAddress1,
    billingAddress2:
      typeof stored.billingAddress2 === 'string'
        ? stored.billingAddress2
        : emptyForm.billingAddress2,
    billingCity:
      typeof stored.billingCity === 'string'
        ? stored.billingCity
        : emptyForm.billingCity,
    billingState:
      typeof stored.billingState === 'string'
        ? stored.billingState
        : emptyForm.billingState,
    billingPostalCode:
      typeof stored.billingPostalCode === 'string'
        ? stored.billingPostalCode
        : emptyForm.billingPostalCode,
    billingCountry,
  };
}

async function postCommerce<T>(
  path: string,
  body: unknown,
) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(
      typeof payload.data === 'string' ? payload.data : 'Request failed.',
    );
  }

  return payload.data;
}

// ==========================================
// Trust Badges and Secure Payment Icons SVGs
// ==========================================

const VisaLogo = () => (
  <svg className={cardLogoClass} viewBox="0 0 36 24" fill="none">
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
  <svg className={cardLogoClass} viewBox="0 0 36 24" fill="none">
    <rect x="0" y="0" width="36" height="24" rx="2" fill="#231f20" />
    <circle cx="14.5" cy="12" r="6.5" fill="#eb001b" />
    <circle cx="21.5" cy="12" r="6.5" fill="#f79e1b" fillOpacity="0.85" />
  </svg>
);

const AmexLogo = () => (
  <svg className={cardLogoClass} viewBox="0 0 36 24" fill="none">
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
