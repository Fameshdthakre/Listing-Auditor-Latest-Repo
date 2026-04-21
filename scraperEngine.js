
// scraperEngine.js - Core Scraping Utilities & Data Processing

export const marketplaceData = {
    'Amazon.com': { root: 'https://www.amazon.com/dp/', en: '?language=en_US', native: '?language=en_US', suffix: '?language=en_US' },
    'Amazon.ca': { root: 'https://www.amazon.ca/dp/', en: '?language=en_CA', native: '?language=en_CA', suffix: '?language=en_CA' },
    'Amazon.co.uk': { root: 'https://www.amazon.co.uk/dp/', en: '?currency=USD', native: '?currency=GBP', suffix: '?currency=USD' },
    'Amazon.de': { root: 'https://www.amazon.de/dp/', en: '?language=en_GB', native: '?language=de_DE', suffix: '?language=en_GB' },
    'Amazon.fr': { root: 'https://www.amazon.fr/dp/', en: '?language=en_GB', native: '?language=fr_FR', suffix: '?language=en_GB' },
    'Amazon.it': { root: 'https://www.amazon.it/dp/', en: '?language=en_GB', native: '?language=it_IT', suffix: '?language=en_GB' },
    'Amazon.es': { root: 'https://www.amazon.es/dp/', en: '?language=en_GB', native: '?language=es_ES', suffix: '?language=en_GB' },
    'Amazon.nl': { root: 'https://www.amazon.nl/dp/', en: '?language=en_GB', native: '?language=nl_NL', suffix: '?language=en_GB' },
    'Amazon.se': { root: 'https://www.amazon.se/dp/', en: '?language=en_GB', native: '?language=sv_SE', suffix: '?language=en_GB' },
    'Amazon.com.be': { root: 'https://www.amazon.com.be/dp/', en: '?language=en_GB', native: '?language=fr_BE', suffix: '?language=en_GB' },
    'Amazon.com.au': { root: 'https://www.amazon.com.au/dp/', en: '?currency=AUD', native: '?currency=AUD', suffix: '?currency=AUD' },
    'Amazon.sg': { root: 'https://www.amazon.sg/dp/', en: '?currency=SGD', native: '?currency=SGD', suffix: '?currency=SGD' },
    'Amazon.ae': { root: 'https://www.amazon.ae/dp/', en: '?language=en_AE', native: '?language=ar_AE', suffix: '?language=en_AE' },
    'Amazon.sa': { root: 'https://www.amazon.sa/dp/', en: '?language=en_AE', native: '?language=ar_AE', suffix: '?language=en_AE' },
    'Amazon.eg': { root: 'https://www.amazon.eg/dp/', en: '?language=en_AE', native: '?language=ar_AE', suffix: '?language=en_AE' },
    'Amazon.in': { root: 'https://www.amazon.in/dp/', en: '?language=en_IN', native: '?language=hi_IN', suffix: '?language=en_IN' },
    'Amazon.co.jp': { root: 'https://www.amazon.co.jp/dp/', en: '?language=en_US', native: '?language=ja_JP', suffix: '?language=en_US' },
    'Amazon.com.mx': { root: 'https://www.amazon.com.mx/dp/', en: '?language=en_US', native: '?language=es_MX', suffix: '?language=en_US' },
    'Amazon.com.tr': { root: 'https://www.amazon.com.tr/dp/', en: '?language=en_US', native: '?language=tr_TR', suffix: '?language=en_US' }
};

export const ZIP_DEFAULTS = {
    'Amazon.com': '20001',      // Washington DC, USA
    'Amazon.ca': 'K1P 1J1',     // Ottawa, Canada
    'Amazon.co.uk': 'SW1A 1AA', // London, UK
    'Amazon.de': '10117',       // Berlin, Germany
    'Amazon.fr': '75001',       // Paris, France
    'Amazon.it': '00118',       // Rome, Italy
    'Amazon.es': '28001',       // Madrid, Spain
    // 'Amazon.nl': '1012 JS',     // Disabled (Dropdown)
    'Amazon.se': '111 22',      // Stockholm, Sweden
    // 'Amazon.com.be': '1000',    // Disabled (Dropdown)
    'Amazon.com.au': '2000',    // Sydney, Australia
    'Amazon.sg': '048581',      // Singapore
    // 'Amazon.ae': '00000',       // Disabled (Dropdown)
    // 'Amazon.sa': '11564',       // Disabled (Dropdown)
    // 'Amazon.eg': '11511',       // Disabled (Dropdown)
    'Amazon.in': '110001',      // New Delhi
    'Amazon.co.jp': '100-0001', // Tokyo
    'Amazon.com.mx': '06000',   // Mexico City
    'Amazon.com.tr': '06420'    // Ankara
};

export const getVendorCentralDomain = (marketplace) => {
    const na = ['Amazon.com', 'Amazon.ca'];
    const eu = ['Amazon.co.uk', 'Amazon.de', 'Amazon.fr', 'Amazon.it', 'Amazon.es', 'Amazon.nl', 'Amazon.se', 'Amazon.com.be', 'Amazon.pl'];
    const au = ['Amazon.com.au'];

    if (na.includes(marketplace)) return 'vendorcentral.amazon.com';
    if (eu.includes(marketplace)) return 'vendorcentral.amazon.co.uk';
    if (au.includes(marketplace)) return 'vendorcentral.amazon.com.au';

    return 'vendorcentral.amazon.com'; // Default
};

export const getPortalDomain = (type, marketplace) => {
    const na = ['Amazon.com', 'Amazon.ca', 'Amazon.com.mx'];
    const eu = ['Amazon.co.uk', 'Amazon.de', 'Amazon.fr', 'Amazon.it', 'Amazon.es', 'Amazon.nl', 'Amazon.se', 'Amazon.com.be', 'Amazon.pl', 'Amazon.com.tr'];
    const au = ['Amazon.com.au', 'Amazon.sg'];
    // Seller Central might have more specific regional domains or unified ones.
    // VC uses .com for NA, .co.uk for EU usually.
    // SC often redirects to regional auth, but base domains:
    // NA: sellercentral.amazon.com
    // EU: sellercentral.amazon.co.uk (or .de etc, but unified login exists)
    // For scraping links, we should target the likely active session.

    if (type === 'vc') {
        if (na.includes(marketplace)) return 'vendorcentral.amazon.com';
        if (eu.includes(marketplace)) return 'vendorcentral.amazon.co.uk';
        if (au.includes(marketplace)) return 'vendorcentral.amazon.com.au';
        return 'vendorcentral.amazon.com';
    } else if (type === 'sc') {
        if (na.includes(marketplace)) return 'sellercentral.amazon.com';
        if (eu.includes(marketplace)) return 'sellercentral.amazon.co.uk'; 
        if (au.includes(marketplace)) return 'sellercentral.amazon.com.au';
        // Japan special case?
        if (marketplace === 'Amazon.co.jp') return 'sellercentral.amazon.co.jp';
        return 'sellercentral.amazon.com';
    }
    return '';
};

export const buildOrNormalizeUrl = (input, domain = 'Amazon.com', langPref = 'english') => {
    if (!input) return null;
    input = input.trim();
    if (!input) return null;

    const config = marketplaceData[domain] || marketplaceData['Amazon.com'];
    const langParam = (langPref === 'english') ? config.en : config.native;

    // 1. If Input is an ASIN (10 alphanumeric chars)
    if (/^[A-Z0-9]{10}$/.test(input)) {
        let root = config.root;
        if (!root.endsWith('/')) root += '/';
        return root + input + langParam;
    }

    // 2. If Input is a URL
    if (input.startsWith('http')) {
        // Basic cleaning: remove existing language/currency params if we want to enforce preference?
        // Current logic: append if missing.
        // For robustness, we might want to stripping existing params, but let's stick to the requested "create" logic.
        if (!input.includes(langParam)) {
            const separator = input.includes('?') ? '&' : '?';
            const cleanParam = separator === '&' ? langParam.replace('?', '') : langParam;
            return input + separator + cleanParam;
        }
        return input;
    }

    return null;
};

export const csvLineParser = (str) => {
    const arr = [];
    let quote = false;
    let col = '';
    for (let c of str) {
        if (c === '"') { quote = !quote; }
        else if (c === ',' && !quote) { arr.push(col.trim()); col = ''; }
        else { col += c; }
    }
    arr.push(col.trim());
    return arr;
};

// Safe JSON parser helper
const safeParseList = (val) => {
    if (!val) return null;
    // 1. Try standard JSON
    try {
        return JSON.parse(val);
    } catch(e) {}
    
    // 2. Try quoted JSON fix (replace single quotes with double)
    try {
        if ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}'))) {
            return JSON.parse(val.replace(/'/g, '"'));
        }
    } catch(e) {}

    // 3. Fallback: Split by comma if looks like list
    if (val.includes(',')) {
        return val.split(',').map(s => s.trim());
    }

    // 4. Return as-is (single string)
    return val;
};

export const parseAuditType2Csv = (lines) => {
    const headers = csvLineParser(lines[0]).map(h => h.toLowerCase().replace(/['"]+/g, '').trim());
    const required = ['item_name', 'bullet_point', 'product_description', 'videos', 'aplus_image_modules', 'brand_story_images'];

    // Determine if this is likely a Type 2 Audit
    const hasComparisonData = required.some(r => headers.includes(r));
    const asinIndex = headers.findIndex(h => h === 'asin' || h === 'url' || h === 'query_asin');

    if (asinIndex === -1) return null; // Must have ASIN/URL

    const structuredData = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = csvLineParser(lines[i]);
        if (!cols[asinIndex]) continue;

        const rowData = {
            url: cols[asinIndex].replace(/['"]+/g, ''),
            auditType: hasComparisonData ? 'type2' : 'type1',
            comparisonData: {}
        };

        if (hasComparisonData) {
            required.forEach(field => {
                const idx = headers.indexOf(field);
                if (idx !== -1) {
                    let val = cols[idx];
                    // Attempt to parse JSON/Array strings like "[link1, link2]"
                    if (val && (val.startsWith('[') || val.includes(',')) && (field.includes('videos') || field.includes('images'))) {
                        const parsed = safeParseList(val);
                        if (parsed) rowData.comparisonData[field] = parsed;
                        else rowData.comparisonData[field] = val;
                    } else {
                        rowData.comparisonData[field] = val;
                    }
                }
            });
        }
        structuredData.push(rowData);
    }
    return structuredData;
};

export const cleanAmazonUrl = (url) => { if (!url || url === 'none') return null; return url.replace(/\._[A-Z0-9,._-]+\./i, '.'); };

export const cleanField = (text) => {
    if (text === null || text === undefined || text === 'none') return '"none"';
    if (typeof text === 'object') return `"${JSON.stringify(text).replace(/"/g, '""')}"`;
    return `"${String(text).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
};

// Export Helpers & Strict Column Definitions

// 1. Scraping Mode Columns (Strict)
export const SCRAPING_COLUMNS = [
    'marketplace', 'deliveryLocation', 'lqs', 'lqsDetails', 'queryASIN', 'mediaAsin', 'url',
    'brand', 'metaTitle', 'categories', 'hasBullets', 'bullets', 'bulletsCount', 'hasDescription', 'description',
    'stockStatus', 'displayPrice', 'basisPrice', 'IsBuyBoxOwner', 'shipsFrom', 'soldBy',
    'freeDeliveryDate', 'primeOrFastestDeliveryDate', 'paidDeliveryDate',
    'rating', 'reviews', 'bsr',
    'imgVariantCount', 'imgVariantDetails', 'hasAplus', 'aPlusImgs', 'aPlusCarouselImgs', 'hasBrandStory', 'brandStoryImgs', 'hasVideo', 'videos', 'videoCount',
    'hasSizeChart', 'hasComparisonChart', 'presentASINinCompChart',
    'parentAsin', 'variationExists', 'queryASIN_variation_theme', 'variationFamily', 'variationCount', 'variationTheme', 'variationFamilyDetails', 'variationFamilyAsinsMap', 'comparisonAsins',
    'aodBasePrice', 'aodTotalOfferCount', 'AOD_amazon_price', 'AOD_amazon_basePrice', 'AOD_amazon_shipsFrom', 'AOD_amazon_soldBy', 'AOD_amazon_deliveryDate'
];

// 2. Audit Mode Columns (Superset including booleans and counts)
export const AUDIT_COLUMNS = [
    ...SCRAPING_COLUMNS,
    // Add new Auditor fields
    'Status', 'Audit Note',
    'Matches on Amazon PDP', 'Missing on Amazon PDP', 'Extra on Amazon PDP',
    'PDP Self-Duplicated', 'VC Self-Duplicated',
    'VC Images Count', 'PDP Images Count', 'VC PageURL'
];

export const MASTER_COLUMNS = [
  // 1. Product Identity & Metadata (Always Included)
  { key: 'status', header: 'status' },
  { key: 'lqs', header: 'listing_quality_score' },
  { key: 'lqsDetails', header: 'lqs_breakdown' },
  { key: 'marketplace', header: 'marketplace' },
  { key: 'deliveryLocation', header: 'delivery_location' },
  { key: 'queryASIN', header: 'query_asin' },
  { key: 'mediaAsin', header: 'page_asin' },
  { key: 'url', header: 'page_url' },
  { key: 'brand', header: 'brand' },
  { key: 'metaTitle', header: 'item_name' },

  // 2. Offer, Price & Delivery
  { key: 'stockStatus', header: 'stock_status' },
  { key: 'displayPrice', header: 'list_price' },
  { key: 'basisPrice', header: 'base_price' },
  { key: 'IsBuyBoxOwner', header: 'is_amazon_owner' },
  { key: 'shipsFrom', header: 'ships_from' },
  { key: 'soldBy', header: 'sold_by' },
  { key: 'primeOrFastestDeliveryDate', header: 'prime_fastest_delivery_date' },
  { key: 'freeDeliveryDate', header: 'free_delivery_date' },
  { key: 'paidDeliveryDate', header: 'paid_delivery_date' },
  // AOD
  { key: 'aodTotalOfferCount', header: 'aod_offers_count' },
  { key: 'AOD_amazon_price', header: 'aod_amazon_price' },
  { key: 'AOD_amazon_basePrice', header: 'aod_amazon_base_price' },
  { key: 'aodBasePrice', header: 'aod_base_price' }, // Added raw field per plan, though mostly used via AOD_amazon
  { key: 'AOD_amazon_shipsFrom', header: 'aod_amazon_ships_from' },
  { key: 'AOD_amazon_soldBy', header: 'aod_amazon_sold_by' },
  { key: 'AOD_amazon_deliveryDate', header: 'aod_amazon_delivery_date' },

  // 3. Content & Quality
  { key: 'categories', header: 'categories' },
  { key: 'hasBullets', header: 'has_bullet_point' },
  { key: 'bulletsCount', header: 'bullet_point_count' },
  { key: 'bullets', header: 'bullet_point' },
  { key: 'hasDescription', header: 'has_product_description' },
  { key: 'description', header: 'product_description' },
  { key: 'imgVariantCount', header: 'product_image_count' },
  { key: 'imgVariantDetails', header: 'product_image_details' },
  { key: 'hasVideo', header: 'has_video' },
  { key: 'videoCount', header: 'videos_count' },
  { key: 'videos', header: 'videos' },
  { key: 'hasAplus', header: 'has_aplus_modules' },
  { key: 'aPlusImgs', header: 'aplus_image_modules' },
  { key: 'aPlusCarouselImgs', header: 'aplus_carousel_modules' },
  { key: 'hasBrandStory', header: 'has_brand_story' },
  { key: 'brandStoryImgs', header: 'brand_story_images' },
  { key: 'hasSizeChart', header: 'has_size_chart' },
  { key: 'hasComparisonChart', header: 'has_comparison_chart' },
  { key: 'presentASINinCompChart', header: 'asin_in_comparison_chart' },
  { key: 'comparisonAsins', header: 'comparison_asins' },

  // 4. Variations
  { key: 'parentAsin', header: 'parent_asin' },
  { key: 'variationExists', header: 'has_variation' },
  { key: 'queryASIN_variation_theme', header: 'queryASIN_variation_theme' },
  { key: 'variationTheme', header: 'variation_theme' },
  { key: 'variationCount', header: 'variation_family_count' },
  { key: 'variationFamily', header: 'variation_family' },
  { key: 'variationFamilyAsinsMap', header: 'variation_family_asins_map' },
  { key: 'variationFamilyDetails', header: 'variation_family_details' },

  // 5. Performance & Social
  { key: 'rating', header: 'rating' },
  { key: 'reviews', header: 'reviews' },
  { key: 'bsr', header: 'best_sellers_rank' },

  // Auditor Specific (Legacy/Extra)
  { key: 'Status', header: 'audit_status' },
  { key: 'Audit Note', header: 'audit_note' },
  { key: 'Matches on Amazon PDP', header: 'matches_on_pdp' },
  { key: 'Missing on Amazon PDP', header: 'missing_on_pdp' },
  { key: 'Extra on Amazon PDP', header: 'extra_on_pdp' },
  { key: 'PDP Self-Duplicated', header: 'pdp_duplicates' },
  { key: 'VC Self-Duplicated', header: 'vc_duplicates' },
  { key: 'VC Images Count', header: 'vc_image_count' },
  { key: 'PDP Images Count', header: 'pdp_image_count' },
  { key: 'VC PageURL', header: 'vc_url' }
];

export const forcedFields = [
    'marketplace', 'brand', 'queryASIN', 'mediaAsin', 'metaTitle', 'url', 'deliveryLocation', 'stockStatus'
];
export const fieldConfig = {
  'lqs': { type: 'attr' },
  'lqsDetails': { type: 'attr' },
  'marketplace': { type: 'attr' },
  'categories': { type: 'attr' },
  'queryASIN': { type: 'root' },
  'deliveryLocation': { type: 'attr' },
  'brand': { type: 'attr' },
  'metaTitle': { type: 'attr' },
  'mediaAsin': { type: 'attr' },
  'parentAsin': { type: 'attr' },
  'displayPrice': { type: 'attr' },
  'stockStatus': { type: 'attr' },
  'IsBuyBoxOwner': { type: 'calc' },
  'shipsFrom': { type: 'attr' },
  'soldBy': { type: 'attr' },
  'rating': { type: 'attr' },
  'reviews': { type: 'attr', isCount: true },
  'bsr': { type: 'attr' },
  'freeDeliveryDate': { type: 'attr' },
  'paidDeliveryDate': { type: 'attr' },
  'primeOrFastestDeliveryDate': { type: 'attr' },
  'hasBullets': { type: 'attr' },
  'bulletsCount': { type: 'attr', isCount: true },
  'bullets': { type: 'attr' },
  'hasDescription': { type: 'attr' },
  'description': { type: 'attr' },
  'basisPrice': { type: 'attr' },
  'hasSizeChart': { type: 'attr' },
  'hasComparisonChart': { type: 'attr' },
  'presentASINinCompChart': { type: 'attr' },
  'variationExists': { type: 'attr' },
  'queryASIN_variation_theme': { type: 'attr' },
  'variationTheme': { type: 'attr' },
  'variationCount': { type: 'attr', isCount: true },
  'variationFamily': { type: 'attr' },
  'variationFamilyDetails': { type: 'attr' },
  'variationFamilyAsinsMap': { type: 'attr' },
  'comparisonAsins': { type: 'attr' },
  'hasBrandStory': { type: 'attr' },
  'brandStoryImgs': { type: 'attr' },
  'hasAplus': { type: 'attr' },
  'aPlusImgs': { type: 'attr' },
  'aPlusCarouselImgs': { type: 'attr' },
  'hasVideo': { type: 'attr' },
  'videoCount': { type: 'attr', isCount: true },
  'videos': { type: 'attr' },
  'imgVariantCount': { type: 'calc', isCount: true },
  'imgVariantDetails': { type: 'calc' },
  'url': { type: 'root' },
  'Status': { type: 'root' },
  'Audit Note': { type: 'root' },
  'Matches on Amazon PDP': { type: 'root' },
  'Missing on Amazon PDP': { type: 'root' },
  'Extra on Amazon PDP': { type: 'root' },
  'PDP Self-Duplicated': { type: 'root' },
  'VC Self-Duplicated': { type: 'root' },
  'VC Images Count': { type: 'root', isCount: true },
  'PDP Images Count': { type: 'root', isCount: true },
  'VC PageURL': { type: 'root' },
  'aodTotalOfferCount': { type: 'attr', isCount: true },
  'AOD_amazon_price': { type: 'attr' },
  'AOD_amazon_basePrice': { type: 'attr' },
  'AOD_amazon_shipsFrom': { type: 'attr' },
  'AOD_amazon_soldBy': { type: 'attr' },
  'AOD_amazon_deliveryDate': { type: 'attr' }
};

/**
 * Filter AOD offers for strictly Amazon offers with valid delivery.
 * @param {Array} aodData - Array of offer objects
 * @param {String} marketplaceDomain - e.g. "Amazon.com", "Amazon.co.uk"
 * @returns {Object|null} - The first valid Amazon offer or null
 */
export const filterAmazonAODOffer = (aodData, marketplaceDomain) => {
    if (!aodData || !Array.isArray(aodData) || aodData.length === 0) return null;

    // Normalize inputs for case-insensitive matching
    const targetDomain = marketplaceDomain ? marketplaceDomain.toLowerCase() : ''; // e.g. "amazon.com"
    
    for (const offer of aodData) {
        if (!offer.soldBy || offer.soldBy === 'none') continue;
        if (!offer.shipsFrom || offer.shipsFrom === 'none') continue;

        const seller = offer.soldBy.trim().toLowerCase();
        const shipper = offer.shipsFrom.trim().toLowerCase();

        const isAmazonSeller = seller === 'amazon' || (targetDomain && seller === targetDomain);
        const isAmazonShipper = shipper === 'amazon' || (targetDomain && shipper === targetDomain);

        if (isAmazonSeller && isAmazonShipper) {
            return offer;
        }
    }
    return null;
};

// --- Template Definitions for Dynamic Generation ---
export const AUDIT_TEMPLATE_CONFIG = {
    'auditContent': {
        name: "Content Audit",
        columns: ["QueryASIN", "Source Title", "Brand", "Source Bullets", "Source Description"]
    },
    'auditGrowth': {
        name: "Growth Audit",
        columns: ["QueryASIN", "Reference Rating", "Reference Reviews", "Reference BSR"]
    },
    'auditImage': {
        name: "Image Audit",
        columns: ["QueryASIN", "Approved Images JSON"]
    },
    'auditVideo': {
        name: "Video Audit",
        columns: ["QueryASIN", "Approved Video Titles"]
    },
    'auditBrandStory': {
        name: "Brand Story Audit",
        columns: ["QueryASIN", "Approved Brand Story Preview Link"]
    },
    'auditAplus': {
        name: "A+ Content Audit",
        columns: ["QueryASIN", "Approved A+ Module Preview Link"]
    },
    'auditComparison': {
        name: "Comparison Chart Audit",
        columns: ["QueryASIN", "Approved Comparison Module Preview Link", "Approved Comparison ASINs"]
    },
    'auditVariation': {
        name: "Variation Audit",
        columns: ["QueryASIN", "Parent ASIN", "Approved Variation Theme", "Approved Variation Family"]
    },
    'auditBuyBox': {
        name: "Buy Box Audit",
        columns: ["QueryASIN", "Approved Price", "Approved ShipsFrom", "Approved SoldBy"]
    },
    'auditDelivery': {
        name: "Delivery Promise Audit",
        columns: ["QueryASIN", "Approved ShipsFrom", "Approved SoldBy", "Expected Delivery Days"]
    }
};

// --- Standardized Column Renames (SSOT) ---
export const COLUMN_RENAMES = {
    "Marketplace": "MarketPlace",
    "Zipcode": "ZipCode",
    "Source Title": "SourceTitle",
    "Source Bullets": "SourceBullets",
    "Source Description": "SourceDescription",
    "Reference Rating": "ReferenceRating",
    "Reference Reviews": "ReferenceReviews",
    "Reference BSR": "ReferenceBSR",
    "Approved Images JSON": "ApprovedImagesJSON",
    "Approved Video Titles": "ApprovedVideoTitles",
    "Approved Brand Story Preview Link": "ApprovedBrandStoryPreviewLink",
    "Approved A+ Module Preview Link": "ApprovedA+ModulePreviewLink",
    "Approved Comparison Module Preview Link": "ApprovedComparisonModulePreviewLink",
    "Approved Comparison ASINs": "ApprovedComparisonASINs",
    "Parent ASIN": "ParentASIN",
    "Approved Variation Theme": "ApprovedVariationTheme",
    "Approved Variation Family": "ApprovedVariationFamily",
    "Approved Price": "ApprovedPrice",
    "Approved ShipsFrom": "ApprovedShipsFrom",
    "Approved SoldBy": "ApprovedSoldBy",
    "Expected Delivery Days": "ExpectedDeliveryDays"
};

// --- Sample Data for Template Generation ---
export const COLUMN_SAMPLES = {
    "QueryASIN": "B0ABC12345",
    "Marketplace": "Amazon.com",
    "Source Title": "My Product Title",
    "Approved Title": "My Product Title",
    "Brand": "My Brand",
    "Approved Brand": "My Brand",
    "Source Bullets": "Bullet1 | Bullet2 | Bullet3",
    "Approved Bullets": "Bullet1 | Bullet2 | Bullet3",
    "Source Description": "This is a product description.",
    "Approved Description": "This is a product description.",
    "Reference Rating": "4.5",
    "Reference Reviews": "1000",
    "Reference BSR": "#342 in Category1 | #18 in Category2",
    "Approved Images JSON": '[{"variant":"MAIN","hiRes":"https://image1.jpg","large":"https://image1.jpg"},{"variant":"PT01","hiRes":"https://image2.jpg","large":"https://image2.jpg"}]',
    "Approved Video Titles": "Title1 | Title2",
    "Approved Brand Story Preview Link": "https://amazon.com/brand-story-preview",
    "Approved A+ Module Preview Link": "https://amazon.com/aplus-preview",
    "Approved Comparison Module Preview Link": "https://amazon.com/comparison-preview",
    "Comparison Module Link": "https://amazon.com/comparison-preview",
    "Approved Comparison ASINs": "[B001234567, B009876543]",
    "Parent ASIN": "B0PARENT12",
    "Approved Variation Theme": "[Variation Theme1, Variation Theme2]",
    "Approved Variation Family": "[B0CHILD001, B0CHILD002]",
    "Approved Price": "29.99",
    "Approved ShipsFrom": "Amazon",
    "Approved SoldBy": "Amazon.com Services LLC",
    "Approved Seller": "Amazon.com",
    "Expected Delivery Days": "2",
    "Max Delivery Days": "2"
};
