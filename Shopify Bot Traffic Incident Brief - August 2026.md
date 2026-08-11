# Shopify Plus Support Escalation: Automated Bot Traffic on CityLocs

**Store:** CityLocs  
**Public domain:** citylocs.com  
**Shopify plan:** Shopify Plus  
**Incident start:** August 5, 2026, with a major escalation beginning August 8, 2026  
**Status:** Active as of August 10, 2026

## Message to Shopify Plus Support

Hello Shopify Plus Support,

We need this case escalated to the appropriate security, bot-mitigation, or network team. CityLocs is experiencing sustained automated catalog-scraping traffic that Shopify Analytics itself classifies as bot sessions. The traffic is materially distorting our storefront session and conversion reporting.

### Observed traffic

| Date | Human sessions | Bot sessions | Total sessions | Bot share |
|---|---:|---:|---:|---:|
| August 5 | 3,150 | 1,941 | 5,091 | 38.1% |
| August 6 | 3,025 | 1,491 | 4,516 | 33.0% |
| August 7 | 3,235 | 947 | 4,182 | 22.6% |
| August 8 | 3,371 | 7,034 | 10,405 | 67.6% |
| August 9 | 3,744 | 11,568 | 15,312 | 75.5% |
| August 10* | 2,286 | 8,673 | 10,959 | 79.1% |

\*August 10 was still in progress when the detailed report was generated. A separately exported daily totals report showed 10,895 sessions at an earlier refresh, so minor differences are attributable to report refresh timing.

The normal August 1–4 bot volume was approximately 375–549 sessions per day. Bot volume rose on August 5 and then increased dramatically on August 8.

### Traffic signature visible in Shopify Analytics

- Approximately 16,645 bot sessions were attributed to Ashburn, Virginia during August 1–10.
- Approximately 16,555 bot sessions combined Ashburn with a Direct/None referrer.
- Bot traffic was overwhelmingly classified as desktop: approximately 32,296 sessions.
- The traffic accessed the homepage, collections, and a broad distribution of individual product pages.
- Most targeted product pages produced zero cart additions and zero reached-checkout sessions.
- This pattern is consistent with systematic automated catalog crawling rather than normal customer browsing.

We understand that displayed geolocation alone is not sufficient for a safe blocking rule. Shopify has access to edge-level information that merchants do not, including source networks, request rates, user-agent or client fingerprints, and request paths. Please investigate the underlying traffic signature rather than broadly blocking all Ashburn or desktop traffic.

## Requested actions

Please:

1. Confirm that the traffic Shopify Analytics labels as bots is reaching the storefront through a common source network, client fingerprint, user agent, request pattern, or other identifiable signature.
2. Apply or tune Shopify's edge-level WAF, bot-management, managed-challenge, or rate-limiting controls to mitigate this scraper before it generates storefront sessions, if possible.
3. Confirm whether the traffic affected storefront availability, latency, legitimate customer sessions, checkout, or Shopify platform resources.
4. Advise whether any Shopify-native controls are available to this Shopify Plus store for persistent catalog-scraping traffic. We understand that scheduled Shopify Plus checkout bot protection serves a different use case.
5. Explain whether Shopify can prevent or exclude this recognized traffic from conversion reporting automatically, beyond our use of the `Human or bot session = Human` report filter.

## Clarification requested regarding Cloudflare

Shopify guidance suggested using Cloudflare. Before making DNS or proxy changes, we need the exact supported implementation in writing.

Shopify's published domain troubleshooting documentation states that merchant-controlled Cloudflare proxy configurations, including orange-cloud proxying and Orange-to-Orange, are unsupported and can interfere with SSL provisioning, resiliency, and Shopify bot-detection accuracy:

https://help.shopify.com/en/manual/domains/troubleshoot-issues-with-domains

Please clarify:

1. Are you specifically instructing CityLocs to enable Cloudflare's orange-cloud proxy for `citylocs.com` and/or `www.citylocs.com`?
2. Is a supported Shopify/Cloudflare Enterprise or Orange-to-Orange arrangement being offered for this store?
3. Which exact DNS records should be proxied and which must remain DNS-only?
4. Which Cloudflare WAF, rate-limit, managed-challenge, or bot-management rules do you recommend for this traffic signature?
5. What allowances are required for Shopify checkout, Shop Pay, verified search crawlers, advertising crawlers, social previews, apps, webhooks, and SSL certificate issuance?
6. Will Shopify continue to support storefront availability, SSL, checkout, and bot detection under the proposed configuration?
7. What is the recommended rollback procedure if the configuration affects storefront connectivity or conversion?

We will not enable an unsupported proxy configuration without clarification. If Shopify is recommending only Cloudflare DNS hosting with the records set to DNS-only, please explain how that configuration would mitigate storefront bot traffic, because Cloudflare security rules would not proxy those requests.

## Attached Shopify Analytics exports

1. `Sessions over time - 2026-08-01 - 2026-08-10.csv` — human versus bot sessions by day
2. `Sessions by location - 2026-08-01 - 2026-08-10.csv` — bot sessions by country, region, and city
3. `Sessions by referrer - 2026-08-01 - 2026-08-10.csv` — bot sessions by referrer and city
4. `Sessions by landing page - 2026-08-01 - 2026-08-10.csv` — bot sessions and commerce activity by landing page
5. `Sessions by device type - 2026-08-01 - 2026-08-10.csv` — bot sessions by device classification

Please provide a case number and confirm escalation to the appropriate technical team. This is an active incident, and bot traffic represented approximately 80% of measured storefront sessions at the latest report refresh.

Thank you,

CityLocs

