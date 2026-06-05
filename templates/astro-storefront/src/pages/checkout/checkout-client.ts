import { loadScript } from "@paypal/paypal-js";
import { loadStripe } from "@stripe/stripe-js";

interface CheckoutConfig {
  apiBaseUrl: string;
  siteDomain: string;
  product: {
    id: string;
    slug: string;
    title: string;
  };
  payments: {
    paypal?: {
      enabled: boolean;
      clientId?: string;
      mode?: string;
    };
    stripe?: {
      enabled: boolean;
      publishableKey?: string;
      mode?: string;
    };
  };
}

const form = document.querySelector<HTMLFormElement>("#checkout-form");
const statusEl = document.querySelector<HTMLElement>("#payment-status");
const configEl = document.querySelector<HTMLScriptElement>("#checkout-config");

if (form && statusEl && configEl?.textContent) {
  const config = JSON.parse(configEl.textContent) as CheckoutConfig;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitCheckout(form, statusEl, config);
  });
}

async function submitCheckout(form: HTMLFormElement, statusEl: HTMLElement, config: CheckoutConfig): Promise<void> {
  const formData = new FormData(form);
  const provider = String(formData.get("provider") || "");
  if (provider !== "paypal" && provider !== "stripe") {
    setStatus(statusEl, "Choose an available payment provider.", true);
    return;
  }

  const payload = {
    productId: config.product.id,
    productSlug: config.product.slug,
    quantity: Number(formData.get("quantity") || 1),
    provider,
    customer: {
      email: String(formData.get("email") || ""),
      name: String(formData.get("name") || ""),
      phone: String(formData.get("phone") || "")
    }
  };

  setStatus(statusEl, "Creating order...");
  const order = await postJson(`${config.apiBaseUrl}/api/commerce/orders`, payload, config.siteDomain);
  const orderId = readString(order, ["id", "orderId", "data.id", "data.orderId"]);
  const orderNumber = readString(order, ["orderNumber", "data.orderNumber"]) || orderId;

  setStatus(statusEl, "Creating payment...");
  const payment = await postJson(`${config.apiBaseUrl}/api/commerce/payments`, {
    orderId,
    provider
  }, config.siteDomain);

  if (provider === "stripe") {
    await handleStripe(payment, config, orderNumber, statusEl);
  } else {
    await handlePayPal(payment, config, orderId, orderNumber, statusEl);
  }
}

async function handleStripe(payment: unknown, config: CheckoutConfig, orderNumber: string, statusEl: HTMLElement): Promise<void> {
  const publishableKey = config.payments.stripe?.publishableKey;
  if (!publishableKey) {
    setStatus(statusEl, "Stripe publishable key is missing from EMS public payment config.", true);
    return;
  }

  const clientSecret = readString(payment, ["clientSecret", "data.clientSecret", "payment.clientSecret"]);
  if (!clientSecret) {
    setStatus(statusEl, "EMS did not return a Stripe client secret for this payment.", true);
    return;
  }

  const stripe = await loadStripe(publishableKey);
  if (!stripe) {
    setStatus(statusEl, "Unable to initialize Stripe.", true);
    return;
  }

  const result = await stripe.confirmPayment({
    clientSecret,
    confirmParams: {
      return_url: `${window.location.origin}/checkout/success?order=${encodeURIComponent(orderNumber)}`
    }
  });

  if (result.error) {
    setStatus(statusEl, result.error.message || "Stripe payment failed.", true);
    return;
  }

  setStatus(statusEl, `Payment started for order ${orderNumber}.`);
}

async function handlePayPal(payment: unknown, config: CheckoutConfig, orderId: string, orderNumber: string, statusEl: HTMLElement): Promise<void> {
  const clientId = config.payments.paypal?.clientId;
  if (!clientId) {
    setStatus(statusEl, "PayPal client ID is missing from EMS public payment config.", true);
    return;
  }

  const paypalOrderId = readString(payment, ["paypalOrderId", "providerOrderId", "data.paypalOrderId", "data.providerOrderId"]);
  if (!paypalOrderId) {
    setStatus(statusEl, "EMS did not return a PayPal order ID for this payment.", true);
    return;
  }

  const paypal = await loadScript({ clientId, intent: "capture" });
  const buttons = document.querySelector("#paypal-buttons");
  if (!paypal?.Buttons || !buttons) {
    setStatus(statusEl, "Unable to initialize PayPal.", true);
    return;
  }

  buttons.innerHTML = "";
  paypal.Buttons({
    createOrder: () => paypalOrderId,
    onApprove: async () => {
      setStatus(statusEl, "Verifying payment...");
      await postJson(`${config.apiBaseUrl}/api/commerce/payments/capture`, {
        orderId,
        provider: "paypal",
        providerOrderId: paypalOrderId
      }, config.siteDomain);
      window.location.href = `/checkout/success?order=${encodeURIComponent(orderNumber)}`;
    },
    onError: () => setStatus(statusEl, "PayPal payment failed.", true)
  }).render(buttons);
  setStatus(statusEl, "Use the PayPal button to complete payment.");
}

async function postJson(url: string, body: unknown, siteDomain: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ems-site-domain": siteDomain
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`EMS request failed: ${response.status}${detail ? ` - ${detail}` : ""}`);
  }

  return response.json();
}

function readString(value: unknown, paths: string[]): string {
  for (const path of paths) {
    const result = path.split(".").reduce<unknown>((current, key) => {
      if (current && typeof current === "object" && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, value);
    if (typeof result === "string" && result) return result;
  }
  return "";
}

function setStatus(element: HTMLElement, message: string, isError = false): void {
  element.textContent = message;
  element.dataset.state = isError ? "error" : "info";
}
