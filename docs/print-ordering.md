# Ordering a physical print

Lumiphane can send a generated lithophane to **Treatstock** so the visitor pays Treatstock for a print and the app owner earns Treatstock's affiliate reward. The STL is built in the browser. The Treatstock private key stays on the server.

Checked October 16, 2026.

## Why Treatstock

| Requirement | Treatstock |
| --- | --- |
| Owner gets paid | Yes. Affiliate reward on completed, non-refunded orders. API orders are included. |
| Model can be passed from a web app | Yes. `POST /api/v2/printable-packs` accepts STL, PLY, and 3MF and returns a checkout URL. |
| Lithophanes | Yes. FDM and resin are both in the price API. Their own minimum-price example is white PLA. |

The customer pays Treatstock. Lumiphane does not take a card payment and does not become the merchant of record.

### How the owner gets paid

Treatstock publishes two descriptions of the same program, and they do not state one exact percentage:

- Affiliate landing page: Treatstock charges a service fee on each order and **shares half of that fee** with the affiliate, including later orders from the same customer. <https://www.treatstock.com/l/affiliates>
- Help center: reward of **up to 5% of the order**, only if the order is not canceled or refunded. <https://www.treatstock.com/help/article/114-become-an-affiliate>
- Changelog (December 2, 2021): all users can share an affiliate link and earn a **50% recurring commission**. The page does not say 50% of what. <https://www.treatstock.com/about/what-is-new>

Read together with the landing page, the 50% figure is half of Treatstock's service fee, and the help center caps that at up to 5% of the order. Confirm the live rate with Treatstock when you request the key. This integration does not promise a specific dollar amount.

Attribution:

- Official API readme: "If you engage visitors to place orders via our API, you will get an affiliate reward for each completed order." <https://github.com/Treatstock/apiv2>
- Cookie referrals are tracked for up to six months. If the customer later orders through a different affiliate in that session, the last affiliate gets the reward. <https://www.treatstock.com/help/article/85-referral-tracker>

Payouts are withdrawn from the Treatstock Earnings page:

- PayPal, or a bank transfer for amounts over $500. <https://www.treatstock.com/help/article/208-how-do-i-withdraw-my-earnings-from-treatstock>
- Withdrawal requests are processed within 10 business days. <https://www.treatstock.com/help/article/161-when-i-will-receive-my-payout>

## What the owner must do

1. Create a Treatstock account. On <https://www.treatstock.com/> use **Sign Up** (top right), or open <https://www.treatstock.com/user/signup>. Enter an email and password, or use Google or Facebook. Confirm the email before the account is fully active. <https://www.treatstock.com/help/article/19-how-do-i-sign-up-for-an-account>
2. Ask Treatstock for an API v2 **private key** on that account. Email **support@treatstock.com**. The official client says the private key is issued by that address: <https://github.com/Treatstock/apiv2>. Point them at the partner page <https://www.treatstock.com/help/article/113-become-an-api-partner> and the API docs <https://www.treatstock.com/help/article/83-api-documentation>. Say that Lumiphane will upload customer STLs and send the customer to the returned checkout URL, and that those orders should earn the affiliate reward.
3. Enroll the same account in the affiliate program so the Earnings cabinet is open. Use <https://www.treatstock.com/site/contact?subject=Join%20Affiliate%20Program> (linked from the affiliate help category) and the program overview at <https://www.treatstock.com/l/affiliates>. There is no separate affiliate ID to paste into Lumiphane. The private key is the credential that attributes API orders. A public referral-link query parameter is not documented (see "What was not verified").
4. Put the private key in the server environment, not in the client bundle:

   ```bash
   TREATSTOCK_PRIVATE_KEY="the-private-key-from-treatstock"
   TREATSTOCK_DEFAULT_COUNTRY="US"
   ```

   `TREATSTOCK_DEFAULT_COUNTRY` is an ISO 3166-1 alpha-2 code used for quotes when the visitor's IP is private. Copy the names from `.env.example`. Do not prefix the key with `VITE_`.
5. Run the app with the API process:
   - Development: `npm run dev` mounts `POST /api/print-order` inside Vite and reads `.env`.
   - Production: `npm run build` then `npm start` (`tsx server/index.ts`). That process serves `dist/` and the print API on `PORT` (default 3000).
6. Reload. **Order a print** appears beside Export only when the key is set and is not a placeholder. An empty key hides the button. Export is unchanged.
7. After customers pay Treatstock and the orders are not refunded, withdraw from the Earnings page (step "How the owner gets paid").

Treatstock also documents a **public-upload-key** that can upload models but cannot read other users' files. Lumiphane uses the private key on the server so the key never ships to the browser. Do not put either key in frontend code.

## What the button does

1. The browser builds the same binary STL as **Export → Standard STL**. Units are millimeters.
2. It `POST`s the bytes to `/api/print-order`.
3. The server uploads the file to `https://www.treatstock.com/api/v2/printable-packs` with the private key, sets `scaleUnit=mm`, and asks for white PLA prices.
4. The response checkout URL is opened by the customer. Treatstock's link is valid for **24 hours**. If a white PLA (or, failing that, white resin) offer is ready, that offer's URL is used so the cart starts on a lithophane-suitable material. Otherwise the generic model link is used and the customer picks white PLA or white resin on Treatstock.
5. The customer pays Treatstock, enters a shipping address, and chooses a manufacturer. Lumiphane never sees the card.

Treatstock accepts STL, PLY, and 3MF. 3MF uploads are limited to 5 MB on their site, which is smaller than a fine lithophane, so this flow always sends STL. <https://www.treatstock.com/help/article/37-what-types-of-files-are-supported-for-3d-printing>

The server accepts an STL up to 160 MB. That covers a master-quality flat panel and the default cylinder. Larger shapes (a maximum-size master cylinder) ask the visitor to switch to a lower quality tier.

The model note asks for solid (100%) infill. Infill is still chosen in the Treatstock widget; a hollow lithophane will not show the photo.

If `TREATSTOCK_PRIVATE_KEY` is missing, shorter than 8 characters, or a placeholder, `GET /api/print-order/status` returns `enabled: false` and both Order buttons stay hidden. `POST /api/print-order` returns 503 with the same explanation. A Treatstock or network failure is shown in the order dialog. Export keeps working.

## Alternatives

### Sculpteo

Still a possible backup, not the best fit for this app.

- Affiliation contract is published and pays **5% of the amount the customer pays, excluding VAT**, by monthly wire. The affiliate identifies with an Affiliate ID and password that must stay private. Promotion through Google Ads or Bing Ads is a breach. <https://www.sculpteo.com/en/terms-affiliate-en/>
- A 2016 write-up of their signup says: create an account, accept the contract, email **affiliate@sculpteo.com** with username, site URL, and a description, then they send an Associate ID. That form was not found on the current site. <https://3dprint.com/132320/sculpteo-affiliate-program/>
- Their current API is for partners who **pay Sculpteo** for the prints ("You only pay for the 3D printing services you use"). <https://www.sculpteo.com/en/services/api-services/>
- No current public document shows an affiliate-ID query parameter on a programmatic STL upload URL. An older article described 7% when a display API was combined with affiliation; the live contract says 5%.

Sculpteo is stronger in SLS and resin than in consumer white-PLA FDM, which is the usual lithophane process.

### Slant 3D

Good FDM farm and a real STL API, but the owner pays Slant.

- API: upload STL, estimate, draft an order, then commit it. Slant bills the API account when the order is processed. <https://www.slant3d.com/api> and <https://slant3dapi.com/documentation/introduction>
- Keys come from <https://slant3dapi.com> after a payment method is added. Markup means Lumiphane must charge the customer (for example with Stripe) before committing the draft.
- Public notes limit STL parts to about 220 mm, which is smaller than Lumiphane's largest cylinder.
- No affiliate commission. This is a reseller/wholesale API.

### Craftcloud (All3DP)

Useful price-comparison API, no cash commission for an app owner.

- Refer a Friend pays the referrer a **10% discount code**, and the friend gets 10% off the first order. Credits are not cash. <https://blog.craftcloud3d.com/why-create-an-account-at-craftcloud/>
- "Become a partner" is a manufacturer application, not an affiliate program. <https://craftcloud3d.com/en/become-a-partner>
- Third parties upload models and redirect to a configuration URL (older Ruby client: <https://github.com/cults/all3dp>; Craftcloud v5 upload/quote/order flow described by Kiln: <https://www.kiln3d.com/blog/craftcloud-live>). Those orders are paid to Craftcloud by the buyer or by the API caller. No public revenue share for the referring app was found.

### JLC3DP

Coupons, not cash, and the ordering API is explicitly not a distribution partnership.

- Referral program: a **$5 coupon** when a new user registers and a **$10 coupon** after their first valid order. Coupons are spent on JLC services. <https://jlc3dp.com/promotions/referral> and <https://jlc3dp.com/help/article/referral-program-terms>
- Ordering API (STL, 3MF, and others) is for companies that import parts and meet a monthly volume. The same page says JLC3DP has **no distribution partnership** and forbids using the JLC name on the partner site. Apply via **support@jlcpcb.com**. <https://jlc3dp.com/help/article/jlc3dp-api>

White resin and PLA are a good lithophane match, but the owner would be reselling and paying JLC.

### Shapeways

Not usable as a consumer referral.

- The company went through bankruptcy in July 2024. The Eindhoven team relaunched it as a **B2B** manufacturer. The old marketplace was not restored. <https://www.shapeways.com/presscorner/shapeways-comes-home-to-trusted-management-and-founding-visionaries>
- A developer site still describes model upload, and API access is free while the caller pays for prints. <https://developers.shapeways.com/>
- The FlexOffers affiliate listing says the program is **not currently offered**. <https://www.flexoffers.com/affiliate-programs/shapeways-affiliate-program/>

### i.materialise

The consumer print shop this referral program pointed at has closed.

- Their partnership page described a referral share of revenue for apps that send models, plus a separate white-label API where the partner is billed. <https://imaterialise.helpjuice.com/general/partnerships> (that URL returned HTTP 402 on October 16, 2026; the same text was still indexed). The percentage was not published.
- i.materialise stopped quotes and orders on **October 31, 2025**. Accounts were read-only until **March 31, 2026**. <https://onsite.helpjuice.com/en_US/my-imaterialise-account>
- Materialise OnSite replaced it. API credentials are issued after emailing **onsite@materialise.com** with subject "API". Placing an order through the API requires **invoice payment on the partner account**. <https://onsite.helpjuice.com/api-connection/summary-api-documentation>

### Xometry

No current cash affiliate program for sending customers.

- The US "Refer and Earn $50" program ended **August 1, 2024**. Replacement credits are not redeemable for cash. <https://www.xometry.com/referral-program-faq/>
- Europe and the UK have an X-Points rewards program for customers who refer friends. Points are spent on future Xometry orders. <https://xometry.eu/en/rewards-terms/>
- The Partner Network is for **manufacturing suppliers** who receive job offers. <https://www.xometry.com/capabilities/community/>
- The instant-quote API is a buyer or partner integration. It does not pay a commission to a lithophane app.

## What was not verified

- The exact live commission (5% of the order versus half of Treatstock's fee). Both figures are on official pages. Ask support when you request the key.
- A self-serve screen that shows the private key. The API readme says to email support@treatstock.com. No dashboard URL for minting a key was published.
- The query parameter on a public "share this affiliate link" URL. The December 2021 changelog says "visit this page" to create the link, but that sentence has no href. This app does not invent a `?ref=` parameter. Attribution is the API key on the upload.
- A live paid order. This environment has no Treatstock partner key. On October 16, 2026, `POST https://www.treatstock.com/api/v2/printable-packs` from this network accepted a small STL and then sent no HTTP response within 20 seconds (the public site itself returned HTTP 200). Checkout, white-PLA availability for a real mesh, and payout timing were not executed. The app treats that hang as "Treatstock could not be reached" after 20 seconds.
- Whether a quote is ready in the first few seconds. If Treatstock answers `not_calculated_yet`, the app retries briefly and otherwise opens the generic 24-hour model link.
- Sculpteo's current signup form (the contract page is live; the email steps are from 2016).
- Whether Craftcloud's v5 API is open to a new app without a private agreement.
- The i.materialise referral percentage, and the partnership help page itself (HTTP 402 on the day this was written).
