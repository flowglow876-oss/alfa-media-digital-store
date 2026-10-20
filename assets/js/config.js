/**
 * Alfa Media Digital Store - Configuration File
 * 
 * Edit this single file to change pricing, copy, endpoints, and guide details.
 * No build tools required.
 */

export const STORE_CONFIG = {
  // Brand & Store Identity
  STORE_NAME: 'Alfa Media Digital Store',
  PRODUCT_ID: 'online-business-blueprint-7',
  PRODUCT_NAME: 'Online Business Blueprint Bundle – 7 PDF Guides',
  TAGLINE: 'Actionable frameworks, practical playbooks, zero income hype.',
  PRICE_INR: 399,
  ORIGINAL_VALUE_INR: 2999,
  CURRENCY: '₹',
  FORMAT: 'Instant PDF Download (Searchable, Printable)',
  DELIVERY_METHOD: 'Secure download unlock on verified payment, with an optional emailed link to your order page',

  // Backend API Endpoints (Leave empty until your backend is deployed)
  // See /docs/BACKEND_CONTRACT.md for the API contract
  // Payment mode: 'qr' = show the UPI QR card on Buy Now (manual confirmation by the owner).
  //               'phonepe' = PhonePe gateway checkout (needs approved merchant account + backend, see docs/PHONEPE_SETUP.md).
  PAYMENT_MODE: 'qr',
  QR_IMAGE_URL: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792473660/IMG-20261020-WA0000.jpg',
  PAYEE_NAME: 'Manoj',   // must match the name shown in the customer's UPI app after scanning
  UPI_ID: '',            // optional: e.g. 'name@bank' (shown under the QR if filled)

  // Same-origin Cloudflare Pages Functions (see functions/api/*). Change only if you host the API elsewhere.
  CHECKOUT_ENDPOINT: '/api/create-checkout',
  ORDER_STATUS_ENDPOINT: '/api/order-status',
  SEND_LINK_ENDPOINT: '/api/send-link',
  QR_ORDER_ENDPOINT: '/api/qr-order',
  SUBMIT_PROOF_ENDPOINT: '/api/submit-proof',

  // Support & Contact
  SUPPORT_EMAIL: 'alfamediaautomations@gmail.com',
  WHATSAPP_NUMBER: '+919876543210',
  WHATSAPP_DISPLAY: '+91 98765 43210',
  SUPPORT_HOURS: 'Mon – Sat: 9:00 AM – 7:00 PM IST',
  RESPONSE_SLA: 'Replies within 12 business hours',

  // Social & External Links
  SOCIAL: {
    TWITTER: 'https://twitter.com/alfamediastore',
    YOUTUBE: 'https://youtube.com/@alfamediastore',
    INSTAGRAM: 'https://instagram.com/alfamediastore',
    TELEGRAM: 'https://t.me/alfamediastore'
  },

  // Topic Strip Under Hero
  TOPICS: [
    { label: 'AI UGC Ads', icon: 'zap' },
    { label: 'Digital Products', icon: 'package' },
    { label: 'Website Selling', icon: 'globe' },
    { label: 'Clipping Business', icon: 'scissors' },
    { label: 'Discord & Cloud', icon: 'message-circle' },
    { label: 'AI Affiliates', icon: 'cpu' },
    { label: 'Influencer Ops', icon: 'megaphone' }
  ],

  // Hero Asset (3D 7-Guide PDF Bundle Mockup)
  HERO_IMAGE: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792463746/file_00000000359081f4aa7ac89c7cb432ef.png',

  // The 7 Complete PDF Guides
  GUIDES: [
    {
      id: 'guide-01',
      number: '01',
      title: 'AI UGC Ads & Agency Blueprint',
      tag: 'Agency & Production',
      summary: 'From Creative Concepts & Ad Scripts to Brand Deals, Retainers & Agency Growth.',
      image: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792464871/AI_UGC_Ads_Blueprint_Mockup_20261017090310_2.jpg',
      fallbackImage: '/assets/img/guide-01-ai-ugc.jpg',
      pages: 38,
      chapters: [
        'Creative Concepts & Hook Matrix: Scripting 3-second scroll stoppers with AI voices',
        'Batch Video Ad Production: Rendering 10 high-performing variations in under 60 minutes',
        'Brand Discovery & Outreach: Pitching e-commerce brands spending on unoptimized video',
        'Client Retainers & Contracts: Packaging monthly UGC deliveries for ₹25,000–₹60,000/mo'
      ]
    },
    {
      id: 'guide-02',
      number: '02',
      title: 'Digital Product Selling Blueprint',
      tag: 'Digital E-commerce',
      summary: 'From Product Research & AI Creation to Launch, Sales & Scaling.',
      image: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792464872/Digital_product_selling_blueprint_20261017090705_2.jpg',
      fallbackImage: '/assets/img/guide-02-digital-products.jpg',
      pages: 42,
      chapters: [
        'Product Research & Validation: Finding buyer search intent on Gumroad and niche vaults',
        'AI Creation Framework: Packaging actionable templates, SOPs & Notion workspaces',
        'Frictionless Checkout Architecture: Single-step mobile pages optimized for UPI conversion',
        'Automated Post-Purchase Delivery: Instant server-verified dispatch & email receipts'
      ]
    },
    {
      id: 'guide-03',
      number: '03',
      title: 'Website Selling Blueprint',
      tag: 'Site Flipping & Dev',
      summary: 'From Modern Website Builds to Client Outreach, Pricing & Profitable Projects.',
      image: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792464872/Website_selling_blueprint_book_m__20261017091704_2.jpg',
      fallbackImage: '/assets/img/guide-03-website-selling.jpg',
      pages: 36,
      chapters: [
        'Modern High-Speed Builds: Deploying static sites with sub-50ms TTFB on free global CDNs',
        'Commercial Niche Selection: Targeting low-competition, high-RPM search terms',
        'Pricing & Valuation Formulas: Calculating sustainable 24x–36x net profit multiples',
        'Client Outreach & Escrow SOP: Secure domain, database, and asset handover without dispute'
      ]
    },
    {
      id: 'guide-04',
      number: '04',
      title: 'Clipping Business Blueprint',
      tag: 'Content Repurposing',
      summary: 'From Short-Form Editing & Creator Partnerships to Clients & Monetization.',
      image: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792464872/Clipping_business_blueprint_book__20261017092022_2.jpg',
      fallbackImage: '/assets/img/guide-04-clipping-business.jpg',
      pages: 34,
      chapters: [
        'High-Retention Clip Mining: Locating emotionally charged and educational timestamp moments',
        'Kinetic Captioning & Pacing: Formatting vertical video hooks for Reels, Shorts & TikTok',
        'Creator Outreach Templates: Pitching podcasters and streamers with free sample batches',
        'Monetization & Retainer Deals: Revenue-share models and monthly clipping retainers'
      ]
    },
    {
      id: 'guide-05',
      number: '05',
      title: 'TeraBox & Discord Monetization Blueprint',
      tag: 'Community & File Vaults',
      summary: 'Digital Resource Delivery, Community Workflows & Legitimate Online Opportunities.',
      image: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792464872/Book_mockup_on_workspace_20261017092254_2.jpg',
      fallbackImage: '/assets/img/guide-05-terabox-discord.jpg',
      pages: 32,
      chapters: [
        'Private Community Architecture: Channel hierarchy, moderation bots, and rules configuration',
        'Automated Role Unlocks: Linking payment webhooks directly to Discord member tier access',
        'Digital Resource Delivery: Organizing secure cloud vaults and compliant download mirrors',
        'Community Retention: Structuring weekly drops, AMAs, and high-value digital asset vaults'
      ]
    },
    {
      id: 'guide-06',
      number: '06',
      title: 'AI Affiliate Marketing Blueprint',
      tag: 'Performance Marketing',
      summary: 'From Product Research & Content Creation to Traffic, Conversions & Commissions.',
      image: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792464873/AI_affiliate_marketing_book_mockup_20261017092436_2.jpg',
      fallbackImage: '/assets/img/guide-06-ai-affiliate.jpg',
      pages: 35,
      chapters: [
        'Recurring SaaS Affiliate Programs: Finding 30% monthly recurring software partner deals',
        'High-Intent Review Funnels: Building comparison tables that capture active software buyers',
        'Content Creation & Organic SEO: Ranking zero-volume, high-buyer-intent keyword clusters',
        'Bonus Stacking Strategy: Bundling companion checklists that double affiliate link clicks'
      ]
    },
    {
      id: 'guide-07',
      number: '07',
      title: 'Influencer Marketing Blueprint',
      tag: 'Partnerships & Outreach',
      summary: 'Creator Research · Brand Partnerships · Campaigns · Pricing & Growth.',
      image: 'https://res.cloudinary.com/lqffln9w/image/upload/v1792464872/Influencer_marketing_blueprint_b__20261017092753_2.jpg',
      fallbackImage: '/assets/img/guide-07-influencer-marketing.jpg',
      pages: 40,
      chapters: [
        'Micro-Creator Discovery: Auditing engagement authenticity vs bot-inflated follower metrics',
        'Outreach Email & DM Scripts: High-response proposals offering performance-based rev-share',
        'Partnership Contracts: Standard licensing agreements protecting content whitelisting rights',
        'Attribution & ROI Tracking: UTM structures, bespoke discount codes, and campaign metrics'
      ]
    }
  ],

  // Lightbox Preview Gallery (Tap to enlarge in high resolution)
  PREVIEW_IMAGES: [
    {
      id: 'preview-1',
      title: 'AI UGC Ad Prompt Matrix & Hook Engineering',
      guideName: 'Guide 01 · AI UGC Ads & Agency',
      src: '/assets/img/preview-ugc-hooks.svg',
      desc: 'Actionable prompt matrix, psychological hook triggers, and client outreach checklists.'
    },
    {
      id: 'preview-2',
      title: 'Digital Product Launch & UPI Checkout SOP',
      guideName: 'Guide 02 · Digital Product Selling',
      src: '/assets/img/preview-upi-launch.svg',
      desc: '3-stage sales architecture, frictionless mobile checkout formula, and delivery protocols.'
    },
    {
      id: 'preview-3',
      title: 'Website Due Diligence & Valuation Formula',
      guideName: 'Guide 03 · Website Selling',
      src: '/assets/img/preview-site-valuation.svg',
      desc: 'Industry standard profit multiples (24x-36x), audit steps, and escrow handover SOP.'
    }
  ],

  // Frequently Asked Questions
  FAQ: [
    {
      q: 'What will I receive?',
      a: 'You receive all 7 digital PDF guides in one complete bundle: AI UGC Ads & Agency, Digital Product Selling, Website Selling, Clipping Business, TeraBox & Discord Monetization, AI Affiliate Marketing, and Influencer Marketing (over 250 pages with actionable frameworks, SOPs, and checklists).'
    },
    {
      q: 'How will I download the files?',
      a: 'Pay ₹399 by scanning the UPI QR with any UPI app, then upload your payment screenshot. Once it is verified, your ZIP with all 7 PDFs downloads automatically and a Download button stays on screen. Save your order reference: opening your order page again gives a fresh download link.'
    },
    {
      q: 'When will I receive access?',
      a: 'Instant access. Your screenshot is checked automatically in a few seconds and, if everything matches (amount, receiver, UTR and time), your download unlocks right away. If a check fails you can pay again or upload a clearer screenshot, or contact support with your order reference.'
    },
    {
      q: 'Do I need a physical delivery address?',
      a: 'No. This is a 100% digital downloadable bundle. No physical parcel is shipped, and you will never be asked for a physical shipping address. All files are delivered instantly via PDF download.'
    },
    {
      q: 'How can I contact support?',
      a: 'You can email our customer support team directly at alfamediaautomations@gmail.com or message us on WhatsApp at +91 98765 43210. Our desk is active Monday through Saturday, 9:00 AM to 7:00 PM IST, and responds within 12 business hours.'
    },
    {
      q: 'What is the refund policy?',
      a: 'Because digital PDFs are delivered and unlocked instantly upon verified payment, all sales are final once files are downloaded. If you experience duplicate billing or an unresolvable technical download issue, contact alfamediaautomations@gmail.com within 48 hours for immediate assistance or refund.'
    }
  ]
};
