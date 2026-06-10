import { getBlocksByKeys, type CommerceBlock } from './commerce';

export type FooterLink = {
  label: string;
  href: string;
};

export type SiteChrome = {
  footerBrandName: string;
  footerPoweredByLabel: string;
  footerIcon: string;
  footerLinks: FooterLink[];
  footerCopyright: string;
};

const FOOTER_BLOCK_KEY = 'footer-content';

const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Cancellation & Refund Policy', href: '/cancellation-refund-policy' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Terms & Conditions', href: '/terms-conditions' },
  { label: 'Contact us', href: '/contact-us' },
];

const DEFAULT_SITE_CHROME: SiteChrome = {
  footerBrandName: '365 DEAL',
  footerPoweredByLabel: 'Powered by',
  footerIcon: '/favicon.ico',
  footerLinks: DEFAULT_FOOTER_LINKS,
  footerCopyright: '© 2025 ICE DOT 98 LIMITED. All Rights Reserved.',
};

export async function getSiteChrome(): Promise<SiteChrome> {
  try {
    const blocks = await getBlocksByKeys([FOOTER_BLOCK_KEY]);
    return normalizeSiteChrome(blocks[FOOTER_BLOCK_KEY]);
  } catch {
    return DEFAULT_SITE_CHROME;
  }
}

export function normalizeSiteChrome(block?: CommerceBlock): SiteChrome {
  const meta = recordValue(block?.meta) ?? {};
  const footer = recordValue(meta.footer) ?? meta;
  const footerLinks = normalizeFooterLinks(footer.links);

  return {
    footerBrandName:
      cleanText(footer.brandName) ??
      cleanText(footer.brand) ??
      cleanText(meta.title) ??
      DEFAULT_SITE_CHROME.footerBrandName,
    footerPoweredByLabel:
      cleanText(footer.poweredByLabel) ??
      cleanText(footer.label) ??
      DEFAULT_SITE_CHROME.footerPoweredByLabel,
    footerIcon: cleanText(footer.icon) ?? DEFAULT_SITE_CHROME.footerIcon,
    footerLinks: footerLinks.length
      ? footerLinks
      : DEFAULT_SITE_CHROME.footerLinks,
    footerCopyright:
      cleanText(footer.copyright) ??
      cleanText(block?.content) ??
      DEFAULT_SITE_CHROME.footerCopyright,
  };
}

function normalizeFooterLinks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => recordValue(item))
    .filter((link): link is Record<string, unknown> => Boolean(link))
    .map((link) => ({
      label: cleanText(link.label) ?? '',
      href: cleanText(link.href) ?? '',
    }))
    .filter((link) => link.label && link.href);
}

function recordValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim();
  return text ? text : undefined;
}
