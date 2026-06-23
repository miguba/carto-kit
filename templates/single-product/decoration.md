# Carto Blocks

This template can use Carto Blocks for page composition content. Missing,
empty, or partially invalid text/list fields fall back to the template defaults.
Marketing images are opt-in when a Block exists.

## Home Content Block

The home page marketing content can be customized with one Carto Block. Create a
Block with key `home-content` and type `page`.

Use this single Block to manage:

- The home page SEO title, description, canonical path, and social image.
- The hero banner image above the purchase panel.
- The offer headline above the purchase options.
- The product description section.
- The FAQ section.
- The customer review section.

Preferred format. Structured fields belong in frontmatter so Carto can parse them
into Block meta. The Markdown body is rendered as the Description section,
which is intentionally unstructured so it can contain rich text and images.
When `home-content` exists, product gallery/detail images are not automatically
inserted after Description. The hero banner only appears when `hero.image` is
defined. Add any desired Description images directly in the Markdown body.

```md
---
title: Home Content
kind: home-content
seo:
  title: Microsoft Office 365 | 365 Deal
  description: >-
    Microsoft Office 365 5 devices license with secure checkout, instant
    digital delivery, and multi-year subscription options.
  canonicalPath: /
  ogImage: /ms365-logo.png
hero:
  image: /path/to/promo-banner.jpg
  alt: Microsoft 365 spring sale banner
offer:
  headline: Don't Miss Limited Offer!
description:
  title: DESCRIPTION
faqs:
  title: Frequently Asked Questions
  items:
    - question: Is this a personal Microsoft account?
      answer: >-
        Yes - you will receive a personal Microsoft account (email + password).
        You can change the password to make the account fully personal and
        secure.
reviews:
  title: Customer Reviews
  items:
    - name: Emily S.
      place: Dallas, TX
      date: May 22, 2026
      avatar: /comments/a1.jpg
      text: >-
        I paid almost $99.99 last year for the same license from Microsoft. This
        time I paid $59.99 for 3 years! Everything works perfectly and
        activation was smooth.
---

Your Microsoft 365 Personal account with up to 5 devices.

Included applications: Word, Excel, PowerPoint, OneNote, Outlook, OneDrive,
Teams and more.

![Microsoft 365 benefits](/path/to/benefits.jpg)
```

JSON with the same shape is supported for structured fields, but use Markdown
frontmatter when the Description body needs rich text or images.

Supported `seo` fields:

- `title`: HTML title plus Open Graph/Twitter title.
- `description`: meta description plus Open Graph/Twitter description.
- `canonicalPath`: canonical URL path, for example `/`.
- `ogImage`: Open Graph/Twitter image. Use a full URL or a media path.
- `ogType`: optional Open Graph type. Defaults to `website`.
- `noindex`: optional boolean robots control. Defaults to `false`.

## Footer Content Block

The shared footer can be customized with a Block keyed `footer-content`.

Preferred format:

```md
---
title: 365 DEAL
kind: footer-content
footer:
  brandName: 365 DEAL
  poweredByLabel: Powered by
  icon: /favicon.ico
  links:
    - label: Home
      href: /
    - label: Cancellation & Refund Policy
      href: /cancellation-refund-policy
    - label: Privacy Policy
      href: /privacy-policy
    - label: Terms & Conditions
      href: /terms-conditions
    - label: Contact us
      href: /contact-us
  copyright: © 2025 ICE DOT 98 LIMITED. All Rights Reserved.
---
```

For a compact Block, the same fields can be placed directly at the frontmatter
top level. If `footer.copyright` is missing, the Markdown body is used as the
copyright line.

## Policy Page Blocks

The footer policy/support links are static routes in the template, but their
page content can be maintained in Carto with Blocks. If a matching Block is
missing, the template uses the default Markdown files in
`src/content/policies/`.

Create one Block for each page you want to override:

| Page | Block key | Type |
| --- | --- | --- |
| `/cancellation-refund-policy` | `cancellation-refund-policy` | `policy` |
| `/privacy-policy` | `privacy-policy` | `policy` |
| `/terms-conditions` | `terms-conditions` | `policy` |
| `/contact-us` | `contact-us` | `policy` |

Preferred format:

```md
---
type: policy
eyebrow: Privacy
title: Privacy Policy
intro: This policy explains what information we collect and how we use it.
updated: May 20, 2026
seo:
  title: Privacy Policy
  description: Learn how this store collects, uses, and protects customer information.
aside:
  title: Questions about your data?
  text: Contact support for privacy, correction, or deletion requests.
contactMethods:
  - label: Privacy requests
    value: support@example.com
    href: mailto:support@example.com
  - label: General support
    value: support@example.com
    href: mailto:support@example.com
---

## Information We Collect

We collect information needed to process orders, provide support, and improve
the storefront.

- Contact details such as name, email, and phone number.
- Order details such as purchased product, quantity, and payment status.

## Your Choices

You may ask us to access, correct, or delete certain personal information where
applicable law allows.
```

Supported frontmatter fields:

- `eyebrow`: Small label above the page title. Defaults to `Policy`.
- `title`: Visible page title and fallback SEO title.
- `intro`: Intro paragraph in the hero section.
- `updated`: Optional last-updated label. If omitted and the Carto Block has
  `updatedAt`, the template formats `updatedAt`.
- `seo.title`: HTML title before the site name.
- `seo.description`: Meta description and Open Graph/Twitter description.
- `aside.title`: Title in the customer-care aside card.
- `aside.text`: Description in the customer-care aside card.
- `contactMethods`: The contact rows in the customer-care aside card. Each item
  supports `label`, `value`, and optional `href`.

For local template defaults, `{{siteName}}` and `{{supportEmail}}` can be used
inside frontmatter strings. They are replaced with values from the Carto commerce
config. Carto-authored Blocks can either use literal values or the same
placeholders.

The old flat fields `seoTitle`, `seoDescription`, `asideTitle`, and `asideText`
are still accepted for compatibility, but new Blocks should use the nested
`seo` and `aside` objects.

The Markdown body is rendered as the main page content. Level-two headings
(`## Heading`) become the "On this page" navigation entries, and unordered or
ordered lists render with visible markers.
