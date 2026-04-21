
// auditorEngine.js - Audit Logic & Comparison Strategy

/**
 * Main entry point for running the audit comparison.
 * @param {Object} liveData - Data scraped from the live PDP (attributes, images, etc.)
 * @param {Object} sourceData - Data from the user's Catalogue/Template (expected values)
 * @return {Object} auditReport - Detailed breakdown of pass/fail for each criteria
 */
export const auditVisuals = async (targetImagesBase64, liveImageUrls, deepInsight = false) => {
    try {
        const response = await fetch('https://us-central1-your-project.cloudfunctions.net/visualAuditCompare', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                targetImages: targetImagesBase64,
                liveImages: liveImageUrls,
                deepInsight: deepInsight
            })
        });

        if (!response.ok) {
            throw new Error(`Visual Audit API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data; // Expected to contain visual diff insights or similarity scores
    } catch (e) {
        console.error("AI Visual Audit failed:", e);
        return { error: e.message, passed: false };
    }
};

export const runAuditComparison = async (liveData, sourceData, customRules = [], visualData = null, auditOptions = {}) => {
    const report = {
        score: 0,
        totalChecks: 0,
        results: {}
    };

    if (!liveData || !sourceData) return report;

    // Normalize Data for Comparison
    const live = normalizeLiveData(liveData);
    const source = normalizeSourceData(sourceData);

    // 1. Content Audit
    report.results.content = auditContent(live, source, auditOptions);

    // 2. Growth Audit
    report.results.growth = auditGrowth(live, source);

    // 3. Image Audit
    report.results.images = auditImages(live, source);

    // 4. Video Audit
    report.results.video = auditVideo(live, source);

    // 5. Brand Story Audit
    report.results.brandStory = auditBrandStory(live, source);

    // 6. A+ Content Audit
    report.results.aplus = auditAplus(live, source);

    // 7. Comparison Chart Audit
    report.results.comparison = auditComparison(live, source);

    // 8. Variation Audit
    report.results.variation = auditVariation(live, source);

    // 9. BuyBox Audit
    report.results.buybox = auditBuyBox(live, source);

    // 10. Delivery Audit
    report.results.delivery = auditDelivery(live, source);
    
    // 11. Dynamic Custom Rules Audit
    report.results.customRules = auditCustomRules(live, source, customRules);

    // 12. Visual Audit (Phase 2 AI Integration & 2-Step Deterministic Matching)
    if (visualData && visualData.targetImagesBase64 && visualData.liveImageUrls) {
        const targetImages = visualData.targetImagesBase64;
        const liveImagesUrls = visualData.liveImageUrls;

        let allMatchedDeterministically = false;

        // Step 1 (Deterministic): If targetImages are URLs (e.g. from catalogue parsing) and not base64 files
        // and we are NOT using deep insight, we can check for strict URL matches.
        if (!visualData.deepInsight) {
            // targetImages could be a mix, or all URLs.
            // If they are JSON parsed strings of variants {variant: 'MAIN', large: 'url'}
            // or just pure URLs.

            // Check if every target image strictly matches a live image URL
            let parsedTargets = [];
            try {
                // If it's a string, try to parse
                parsedTargets = (typeof targetImages === 'string') ? parseList(targetImages) : targetImages;
            } catch(e) {
                 parsedTargets = targetImages;
            }

            if (Array.isArray(parsedTargets) && parsedTargets.length > 0) {
                 allMatchedDeterministically = parsedTargets.every(target => {
                     // Check if target is Base64
                     if (typeof target === 'string' && target.startsWith('data:image')) {
                         return false; // Can't deterministic match base64
                     }

                     let targetUrlToMatch = null;
                     if (typeof target === 'object' && target !== null) {
                         targetUrlToMatch = target.large || target.hiRes || target.url;
                     } else if (typeof target === 'string' && target.startsWith('http')) {
                         targetUrlToMatch = target;
                     }

                     if (targetUrlToMatch) {
                         return liveImagesUrls.includes(targetUrlToMatch);
                     }
                     return false;
                 });
            }
        }

        let visualResult = { passed: true };
        let visualNote = "Exact URL match (AI Skipped)";

        if (allMatchedDeterministically) {
            // Step 1 Success: Skip AI call
             visualResult = { passed: true, similarity: 1.0, details: "Matched deterministically by URL" };
        } else {
            // Step 2 (AI Fallback or Deep Insight active)
            visualResult = await auditVisuals(targetImages, liveImagesUrls, visualData.deepInsight);
            visualNote = visualResult.error ? `Error: ${visualResult.error}` : "AI Visual comparison complete";
        }

        report.results.visuals = {
            status: 'completed',
            passed: visualResult.passed !== false,
            details: [
                {
                    label: "AI Visual Audit",
                    passed: visualResult.passed !== false,
                    note: visualNote,
                    analysis: visualResult
                }
            ]
        };
    } else {
        report.results.visuals = { passed: true, status: 'skipped' };
    }

    // Calculate Final Score (Simple percentage for now)
    let passed = 0;
    let total = 0;
    Object.values(report.results).forEach(cat => {
        if (cat.status !== 'skipped') {
            total++;
            if (cat.passed) passed++;
        }
    });
    report.score = total > 0 ? Math.round((passed / total) * 100) : 0;
    report.totalChecks = total;

    return report;
};

// --- AUDIT REQUIREMENTS MAPPING ---
// Used by UI to auto-disable checkboxes based on available catalogue columns.
export const AUDIT_REQUIREMENTS = {
    'content': ['Source Title', 'Source Bullets', 'Source Description', 'Brand'], // ONE of these required
    'growth': ['Reference Rating', 'Reference Reviews', 'Reference BSR'],
    'images': ['Approved Images JSON'],
    'video': ['Approved Video Titles', 'Video Count'], 
    'brandStory': ['Approved Brand Story Preview Link'],
    'aplus': ['Approved A+ Module Preview Link'],
    'comparison': ['Approved Comparison Module Preview Link', 'Approved Comparison ASINs'],
    'variation': ['Approved Variation Theme', 'Approved Variation Family', 'Approved Variation Count', 'Parent ASIN'],
    'buybox': ['Approved Price', 'Approved ShipsFrom', 'Approved SoldBy'],
    'delivery': ['Expected Delivery Days']
};

// --- Helpers ---

// Levenshtein Distance implementation
const levenshteinDistance = (s1, s2) => {
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;

    let matrix = Array(s1.length + 1).fill(null).map(() => Array(s2.length + 1).fill(null));

    for (let i = 0; i <= s1.length; i++) {
        matrix[i][0] = i;
    }
    for (let j = 0; j <= s2.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= s1.length; i++) {
        for (let j = 1; j <= s2.length; j++) {
            let cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1, // deletion
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[s1.length][s2.length];
};

// Calculate Similarity (0 to 1) based on Levenshtein Distance
const calculateSimilarity = (s1, s2) => {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const distance = levenshteinDistance(s1, s2);
    return (maxLen - distance) / maxLen;
};


const normalizeText = (text) => text ? String(text).toLowerCase().replace(/\s+/g, ' ').trim() : "";

// Smart Normalize: Removes symbols, punctuation, and stop words.
// Stop words: a, an, the, and, or, but, is, of, for, with, in, at, to, on
const STOP_WORDS_REGEX = /\b(a|an|the|and|or|but|is|of|for|with|in|at|to|on)\b/g;

const smartNormalize = (text) => {
    if (!text) return "";
    let str = String(text).toLowerCase();
    
    // 1. Remove Symbols/Punctuation (keep alphanumeric and spaces)
    // We replace them with space to avoid merging words like "one,two" -> "onetwo"
    str = str.replace(/[^a-z0-9\s]/g, ' '); 

    // 2. Collapse Whitespace
    str = str.replace(/\s+/g, ' ').trim();

    // 3. Remove Stop Words (Whole word match)
    str = str.replace(STOP_WORDS_REGEX, '');

    // 4. Collapse Whitespace again after removal
    return str.replace(/\s+/g, ' ').trim();
};

const evaluateStringMatch = (expected, actual, options = {}) => {
    const opts = {
        tolerance: 0.95,
        ignoreCase: true,
        ignoreWhitespaceAndPunctuation: true,
        matchStrictness: 'fuzzy', // 'exact', 'fuzzy', 'semantic'
        ...options
    };

    if (!expected && !actual) return { passed: true, score: 1.0, requiresSemanticCheck: false };
    if (!expected || !actual) return { passed: false, score: 0.0, requiresSemanticCheck: false };

    let s1 = String(expected);
    let s2 = String(actual);

    if (opts.ignoreCase) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
    }

    if (opts.ignoreWhitespaceAndPunctuation) {
        s1 = smartNormalize(s1);
        s2 = smartNormalize(s2);
    } else {
        s1 = s1.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        s2 = s2.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    }

    if (opts.matchStrictness === 'exact') {
        const passed = (s1 === s2);
        return {
            passed: passed,
            score: passed ? 1.0 : 0.0,
            normalizedExpected: s1,
            normalizedActual: s2,
            requiresSemanticCheck: false
        };
    }

    const score = calculateSimilarity(s1, s2);
    let passed = score >= opts.tolerance;
    let requiresSemanticCheck = false;

    if (!passed && opts.matchStrictness === 'semantic') {
        // AI Fallback requested
        requiresSemanticCheck = true;
    }

    return {
        passed: passed,
        score: score,
        normalizedExpected: s1,
        normalizedActual: s2,
        requiresSemanticCheck: requiresSemanticCheck
    };
};

export const parseList = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    try {
        // Try parsing JSON array
        if (input.startsWith('[') && input.endsWith(']')) {
            return JSON.parse(input.replace(/'/g, '"')); // Handle single quotes common in user input
        }
    } catch(e) {}
    // Fallback: Split by comma or pipe
    return input.split(/[|,]/).map(s => s.trim()).filter(Boolean);
};

// Specific Bullet Parser: Strictly splits by | or newline, ignoring commas
const parseBullets = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    // Split by pipe OR newline
    return input.split(/[|\n\r]+/).map(s => s.trim()).filter(Boolean);
};

const parsePrice = (priceStr) => {
    if (!priceStr || priceStr === 'none') return null;
    // Remove non-numeric chars except period and comma
    const clean = String(priceStr).replace(/[^0-9.,]/g, '');
    // Handle comma as decimal separator if used (e.g. 19,99) -> 19.99
    // Simple heuristic: if last separator is comma, replace with dot.
    const normalized = clean.replace(/,/g, '.'); 
    const val = parseFloat(normalized);
    return isNaN(val) ? null : val;
};

// Extract Image ID (e.g. 81q+... from 81q+...jpg)
const extractImageId = (url) => {
    if (!url || url === 'none') return null;
    const match = url.match(/\/([A-Za-z0-9\+\-]+)\.(?:jpg|png|jpeg|webp)/i);
    return match ? match[1] : null;
};

// Convert "Feb 19", "Tomorrow 10 AM - 3 PM", "Today" to a Date object (Midnight)
const parseAmazonDate = (dateStr) => {
    if (!dateStr || dateStr === 'none') return null;
    const now = new Date();
    now.setHours(0,0,0,0); // normalize now to midnight
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const lower = String(dateStr).toLowerCase().trim();

    // 1. "Today" case (with time ranges like "Today 2 PM - 6 PM")
    if (lower.startsWith('today')) {
        return new Date(now);
    }

    // 2. "Tomorrow" case (e.g. "Tomorrow 10 AM - 3 PM", "Tomorrow, February 18")
    // Note: "Tomorrow, February 18" is redundant but handled correctly by adding 1 day.
    if (lower.startsWith('tomorrow')) {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        return d;
    }

    // 3. Explicit Date (e.g. "Friday, February 20", "Thursday, February 19")
    // Regex to capture Month Name and Day
    // Matches: "February 20", "Feb 20"
    const dateRegex = /([A-Za-z]+)\s+(\d{1,2})/;
    const match = dateStr.match(dateRegex);

    if (match) {
        const monthName = match[1];
        const day = parseInt(match[2]);

        // Construct candidate date
        // JS Date parse handles month names well
        const tryStr = `${monthName} ${day}, ${currentYear}`;
        let d = new Date(tryStr);
        d.setHours(0,0,0,0);

        if (!isNaN(d.getTime())) {
            // Year Rollover Logic:
            // If parsed date is significantly in the past (e.g. parsed "Jan 2" when today is "Dec 20"), assume next year.
            // If parsed date is significantly in future (unlikely for delivery), keep current year.
            // "Significantly past" -> If month is earlier than current month?
            // Simple check: If today is late in year (Oct+) and target month is early (Jan/Feb), add 1 year.
            // OR: If result < now - 30 days? Amazon dates are future dates.
            // If the date is *before* today, it must be next year (unless delivery was yesterday? Unlikely for "Promise").
            // Exception: Timezone issues?
            
            // Logic: If result is *before* today (allowing small margin), assume next year.
            // But if "Friday, Feb 20" and today is Feb 17, it is fine.
            // If "Jan 2" and today is Dec 25, result < today.
            
            if (d < now) {
                // Check if adding year makes sense
                const nextYearDate = new Date(d);
                nextYearDate.setFullYear(currentYear + 1);
                // If today is Dec and date is Jan, assume next year
                if (currentMonth >= 9 && d.getMonth() <= 2) {
                     return nextYearDate;
                }
                // Otherwise, it might be a date in the past (late delivery?), keep as is?
                // Or user provided "Feb 20" but today is "Mar 1"? (Unlikely for scraped promise).
                return d;
            }
            return d;
        }
    }

    return null;
};

const normalizeLiveData = (data) => {
    return {
        ...data,
        normTitle: normalizeText(data.metaTitle),
        normBullets: normalizeText(data.bullets),
        normDesc: normalizeText(data.description),
        rating: parseFloat(data.rating) || 0,
        reviews: parseInt(data.reviews) || 0,
        bsr: data.bsr || "",
        images: data.data || [], // Array of image objects from scraping
        videoCount: parseInt(data.videoCount) || 0,
        variationCount: parseInt(data.variationCount) || 0,
        // Ensure lists are arrays
        variationFamily: parseList(data.variationFamily),
        comparisonAsins: parseList(data.comparisonAsins),
        aPlusImgs: data.aPlusImgs || [],
        brandStoryImgs: data.brandStoryImgs || [],
        videos: data.videos || []
    };
};

const normalizeSourceData = (data) => {
    // If sourceData comes from CSV/Excel, keys might vary. We try to standardize here.
    // The scraperEngine.js parseAuditType2Csv already maps keys to 'comparisonData' keys.
    // But direct catalogue items might have different keys.

    // We assume data is the `comparisonData` object or the item root.
    // Let's create a safe accessor.
    // Added specific lookups for CamelCase keys from User Template (XLSX Import)
    const get = (k) => {
        // 1. Direct match (internal)
        if (data[k]) return data[k];
        // 2. Expected prefix (internal)
        if (data['expected_' + k]) return data['expected_' + k];
        // 3. User Template Variants
        // Standard User Template prefixes: "Source", "Reference", "Approved", "Expected"
        const variants = ['Reference', 'Approved', 'Expected', 'Source'];
        // Try precise keys first
        for (let v of variants) {
            // Space
            if (data[`${v} ${k}`]) return data[`${v} ${k}`]; // "Reference Rating"
            // No Space (CamelCase)
            // Capitalize k for CamelCase (e.g. rating -> Rating)
            const capK = k.charAt(0).toUpperCase() + k.slice(1);
            if (data[`${v}${capK}`]) return data[`${v}${capK}`]; // "ReferenceRating"
        }
        
        // Special Case Mappings for specific user columns that don't follow simple pattern
        if (k === 'bsr') return data['ReferenceBSR'] || data['Reference BSR'];
        if (k === 'images') return data['ApprovedImagesJSON'] || data['Approved Images JSON'];
        if (k === 'videoTitles') return data['ApprovedVideoTitles'] || data['Approved Video Titles'];
        if (k === 'brandStory') return data['ApprovedBrandStoryPreviewLink'] || data['Approved Brand Story Preview Link'];
        if (k === 'aplus') return data['ApprovedA+ModulePreviewLink'] || data['Approved A+ Module Preview Link'];
        if (k === 'comparisonLink') return data['ApprovedComparisonModulePreviewLink'] || data['Approved Comparison Module Preview Link'];
        if (k === 'comparison') return data['ApprovedComparisonASINs'] || data['Approved Comparison ASINs'];
        if (k === 'variationCount') return data['ApprovedVariationCount'] || data['Approved Variation Count']; // Not in list but good to have
        if (k === 'variationTheme') return data['ApprovedVariationTheme'] || data['Approved Variation Theme'];
        if (k === 'variationFamily') return data['ApprovedVariationFamily'] || data['Approved Variation Family'];
        if (k === 'price') return data['ApprovedPrice'] || data['Approved Price'];
        if (k === 'shipsFrom') return data['ApprovedShipsFrom'] || data['Approved ShipsFrom'];
        if (k === 'soldBy') return data['ApprovedSoldBy'] || data['Approved SoldBy'];
        if (k === 'seller') return data['ApprovedSeller'] || data['Approved Seller']; // Helper might map this if needed, or rely on soldBy mapping fallback

        if (k === 'deliveryDays') return data['ExpectedDeliveryDays'] || data['Expected Delivery Days'];
        if (k === 'title') return data['SourceTitle'] || data['Source Title'];
        if (k === 'bullets') return data['SourceBullets'] || data['Source Bullets'];
        if (k === 'description') return data['SourceDescription'] || data['Source Description'];
        if (k === 'brand') return data['Brand']; // Direct match usually
        if (k === 'parentAsin') return data['ParentASIN'] || data['Parent ASIN']; // Map 'parentAsin' (engine key)

        return null;
    };

    // Check if we have portal images attached from dual-scrape
    // The background logic attaches them to `comparisonData.expected_images`
    // which `get('images')` should pick up if `expected_images` is present.
    // BUT: background attaches them as an ARRAY of objects.
    // `parseList` handles arrays gracefully.

    // Call get() with canonical keys to trigger the special mapping logic
    return {
        title: get('title'),
        bullets: get('bullets'),
        description: get('description'),
        brand: get('brand'),

        rating: get('rating'),
        reviews: get('reviews'),
        bsr: get('bsr'),

        images: get('images'),
        videoCount: get('videoCount'), // Maps to 'Video Count' or 'video_count' if passed
        videoTitles: get('videoTitles'),

        brandStory: get('brandStory'),
        aplus: get('aplus'),

        comparison: get('comparison'),
        comparisonLink: get('comparisonLink'),

        variationCount: get('variationCount'),
        variationTheme: get('variationTheme'),
        variationFamily: get('variationFamily'),

        price: get('price'),
        shipsFrom: get('shipsFrom'),
        soldBy: get('soldBy'),
        seller: get('seller'), // Helper might map this if needed, or rely on soldBy mapping fallback

        deliveryDays: get('deliveryDays'),

        normTitle: normalizeText(get('title')),
        normBullets: normalizeText(get('bullets')),
        normDesc: normalizeText(get('description')),
        
        // Pass the raw original data down for custom rule lookups
        _rawOriginalData: data
    };
};

// --- Audit Functions (Refined for Type 2 Logic) ---

// --- Amazon TOS Enforcer ---
const BANNED_CLAIMS = [
    "number one", "number 1", "#1", "best seller", "bestselling",
    "bestseller", "top rated", "guaranteed", "100% money back",
    "fda approved" // (Often a violation unless highly specific context, usually requires registration vs approval)
];
const EMOJI_REGEX = /[\p{Extended_Pictographic}]/gu;

const checkTosViolations = (text) => {
    if (!text) return null;
    const violations = [];
    const lower = text.toLowerCase();
    BANNED_CLAIMS.forEach(claim => {
        if (lower.includes(claim.toLowerCase())) violations.push(`Banned Claim: "${claim}"`);
    });
    if (EMOJI_REGEX.test(text)) {
        violations.push("Emojis found (Violation of Amazon Style Guidelines)");
    }
    return violations.length > 0 ? violations.join(" | ") : null;
};

const appendTosWarning = (detailItem, actualText) => {
    const tosWarning = checkTosViolations(actualText);
    if (tosWarning) {
        detailItem.note = (detailItem.note || "") + ` ⚠️ TOS Warning: ${tosWarning}`;
        detailItem.requiresRemediation = true;
    }
};

const auditContent = (live, source, auditOptions = {}) => {
    const res = { passed: true, details: [] };
    let checks = 0;

    // 1. Title Audit (Smart Match)
    if (source.title) {
        checks++;
        const matchResult = evaluateStringMatch(source.title, live.metaTitle, {
            tolerance: 0.95,
            matchStrictness: auditOptions.matchStrictness
        });
        
        const detailItem = {
            label: "Title", 
            passed: matchResult.passed,
            expected: source.title, 
            actual: live.metaTitle,
            note: matchResult.passed ? `Match (Score: ${(matchResult.score*100).toFixed(1)}%)` : `Mismatch (Score: ${(matchResult.score*100).toFixed(1)}%)`,
            requiresSemanticCheck: matchResult.requiresSemanticCheck
        };
        appendTosWarning(detailItem, live.metaTitle);
        res.details.push(detailItem);
        if (!matchResult.passed && !matchResult.requiresSemanticCheck) res.passed = false;
    }

    // 2. Brand Audit (Exact Match Preserved)
    if (source.brand) {
        checks++;
        // Keep normalizeText (simple trim/lower) for Brand as requested "Brand... must be matched exactly"
        // But allowing case-insensitive trim is usually what "Exact" means in data entry.
        const match = normalizeText(live.brand).includes(normalizeText(source.brand));
        res.details.push({ label: "Brand", passed: match, expected: source.brand, actual: live.brand });
        if (!match) res.passed = false;
    }

    // 3. Bullets Audit (Granular Logic)
    if (source.bullets) {
        checks++;
        const srcBullets = parseBullets(source.bullets);
        const liveBullets = parseBullets(live.bullets); // Live bullets joined by ' | ' in content.js

        let foundCount = 0;
        let isReordered = false;
        let missing = [];
        let matchIndices = [];
        let matchedLiveIndices = new Set();

        // Check each Source Bullet
        srcBullets.forEach((srcRaw, index) => {
            if (!srcRaw || !srcRaw.trim()) return; // Skip empty bullets

            let bestMatchIdx = -1;
            let bestScore = -1;

            liveBullets.forEach((liveRaw, liveIdx) => {
                if (matchedLiveIndices.has(liveIdx)) return; // Skip already matched

                const matchResult = evaluateStringMatch(srcRaw, liveRaw, {
                    tolerance: 0.95,
                    matchStrictness: auditOptions.matchStrictness
                });
                if (matchResult.score > bestScore) {
                    bestScore = matchResult.score;
                    bestMatchIdx = liveIdx;
                }
            });

            if (bestScore >= 0.95 && bestMatchIdx !== -1) {
                foundCount++;
                matchIndices.push(bestMatchIdx);
                matchedLiveIndices.add(bestMatchIdx);
            } else {
                missing.push(index + 1); // 1-based index for report
            }
        });

        // Determine Status
        const allFound = (missing.length === 0);
        
        // Check Order: Indices must be sequential and ascending?
        // Actually, just strictly ascending is enough to say "Correct Order".
        // If matchIndices = [0, 1, 2] -> Ordered.
        // If matchIndices = [1, 0, 2] -> Reordered.
        // If matchIndices = [0, 2, 4] -> Ordered (gaps allowed if live has extra?)
        // Usually "Reordering" means sequence violation.
        if (allFound) {
            for (let i = 0; i < matchIndices.length - 1; i++) {
                if (matchIndices[i] > matchIndices[i+1]) {
                    isReordered = true;
                    break;
                }
            }
        }

        let statusMsg = "Matched";
        let finalPass = true;

        if (!allFound) {
            statusMsg = `Missing Bullets: #${missing.join(', #')}`;
            finalPass = false;
        } else if (isReordered) {
            statusMsg = "Passed (Reordered)"; 
        }

        // Calculate Extras (Live bullets not used in matchIndices)
        const extraIndices = liveBullets.map((_, i) => i).filter(i => !matchIndices.includes(i));
        const extraContent = extraIndices.map(i => liveBullets[i]);
        const missingContent = missing.map(i => srcBullets[i-1]); // missing contains 1-based indices

        const detailItem = {
            label: "Bullets", 
            passed: finalPass, 
            expected: `${srcBullets.length} Bullets`, 
            actual: `${foundCount} Found`,
            note: statusMsg,
            missing: missingContent,
            extra: extraContent
        };

        if (!finalPass && auditOptions.matchStrictness === 'semantic' && missingContent.length > 0) {
            // Need to run semantic match on missing vs extra bullets
            detailItem.requiresSemanticCheck = true;
            // Temporarily assume pass until semantic check proves otherwise, or leave as false and fix after check.
            // Leaving as false is safer. The batch check will flip it to true if semantic match works.
        }

        appendTosWarning(detailItem, live.bullets);
        res.details.push(detailItem);

        if (!finalPass && !detailItem.requiresSemanticCheck) res.passed = false;
    }

    // 4. Description Audit (Smart Contains)
    if (source.description) {
        checks++;
        const sNorm = smartNormalize(source.description);
        const lNorm = smartNormalize(live.description);
        
        let match = false;
        let note = "";
        let scoreStr = "";
        let requiresSemanticDesc = false;

        if (!sNorm) {
             match = true; // If source was just punctuation, ignore
             note = "Ignored (Empty Source)";
        } else {
            // Step 1: Aggressive normalisation includes
            if (lNorm.includes(sNorm)) {
                match = true;
                note = "Contains Match";
            } else {
                // Step 2: Compare lengths. If live is significantly longer, we cannot do a full fuzzy match
                // without heavily penalizing for length. The requirement is to run a fuzzy match comparing
                // expected against a substring of live of the same length (fuzzy contains), but for Phase 1
                // we'll run full fuzzy match at 0.85 tolerance as a fallback.
                const matchResult = evaluateStringMatch(source.description, live.description, {
                    tolerance: 0.85,
                    matchStrictness: auditOptions.matchStrictness
                });
                match = matchResult.passed;
                note = match ? "Fuzzy Match (Tolerance: 0.85)" : "Fuzzy Mismatch";
                scoreStr = ` (Score: ${(matchResult.score*100).toFixed(1)}%)`;
                if (matchResult.requiresSemanticCheck) {
                    note += " (Pending Semantic Check)";
                    requiresSemanticDesc = true;
                }
            }
        }

        const detailItem = {
            label: "Description", 
            passed: match, 
            expected: "Content Match", 
            actual: match ? "Found" : "Missing",
            note: note + scoreStr,
            requiresSemanticCheck: requiresSemanticDesc
        };
        appendTosWarning(detailItem, live.description);
        res.details.push(detailItem);

        if (!match && !requiresSemanticDesc) res.passed = false;
    }

    if (checks === 0) res.status = 'skipped';
    return res;
};

const calculateGrowth = (label, expectedRaw, actualRaw, isFloat = false) => {
    const exp = isFloat ? parseFloat(expectedRaw) : parseInt(expectedRaw);
    const act = isFloat ? parseFloat(actualRaw) : parseInt(actualRaw);
    
    if (isNaN(exp) || isNaN(act)) {
        return { label, passed: false, expected: expectedRaw, actual: actualRaw, note: "Parse Error" };
    }

    const diff = act - exp;
    const pct = exp > 0 ? (diff / exp) * 100 : 0;
    
    let status = "Stagnant";
    const diffStr = isFloat ? diff.toFixed(1) : diff;
    
    if (diff > 0) status = `Grown (+${diffStr}, +${pct.toFixed(0)}%)`;
    else if (diff < 0) status = `Fallen (${diffStr}, ${pct.toFixed(0)}%)`;

    // Pass if grown or stagnant (diff >= 0)
    return {
        label,
        passed: (diff >= 0),
        expected: expectedRaw,
        actual: act,
        note: status
    };
};

const auditGrowth = (live, source) => {
    const res = { passed: true, details: [] };
    let checks = 0;

    if (source.rating) {
        checks++;
        const result = calculateGrowth("Rating", source.rating, live.rating, true);
        res.details.push(result);
        if (!result.passed) res.passed = false;
    }

    if (source.reviews) {
        checks++;
        const result = calculateGrowth("Reviews", source.reviews, live.reviews, false);
        res.details.push(result);
        if (!result.passed) res.passed = false;
    }

    if (checks === 0) res.status = 'skipped';
    return res;
};

const auditImages = (live, source) => {
    const res = { passed: true, details: [] };
    if (!source.images) return { passed: true, status: 'skipped' };

    // Source images can be a JSON string of objects OR a simple count (number/string)
    let expectedImages = [];
    let expectedCount = 0;

    if (!isNaN(source.images)) {
        expectedCount = parseInt(source.images);
    } else {
        expectedImages = parseList(source.images);
        expectedCount = expectedImages.length;
    }

    // 1. Check Count
    const countPass = live.images.length >= expectedCount;
    res.details.push({ label: "Image Count", passed: countPass, expected: expectedCount, actual: live.images.length });
    if (!countPass) res.passed = false;

    // 2. Check Content (URL ID Matching)
    const liveImages = live.images; // Array of {variant, hiRes...}
    const matchedLiveIndices = new Set();
    const missingImages = [];
    const matchedImages = [];

    // --- Optimization: Pre-compute Live Image Maps for O(1) Lookup ---
    const liveIdMap = new Map(); // ID -> Index
    const liveVariantMap = new Map(); // Variant -> Index

    liveImages.forEach((img, idx) => {
        const id = extractImageId(img.hiRes || img.large);
        if (id) liveIdMap.set(id, idx);
        if (img.variant) liveVariantMap.set(img.variant, idx);
    });

    if (expectedImages.length > 0) {
        expectedImages.forEach((exp, idx) => {
            let found = false;
            let note = "";
            let matchedIndex = -1;
            
            // Handle both Object ({hiRes: "url", variant: "MAIN"}) and String ("url") formats
            const isObj = (typeof exp === 'object');
            const url = isObj ? (exp.hiRes || exp.large) : exp;
            const variant = isObj ? exp.variant : null;
            const label = variant || `Check #${idx+1}`;

            // Try matching by ID first (Robust)
            if (url) {
                const expId = extractImageId(url);
                if (expId && liveIdMap.has(expId)) {
                    matchedIndex = liveIdMap.get(expId);
                    found = true;
                    note = "ID Match";
                }
            }

            // Fallback: Variant Name Match (Legacy)
            if (!found && variant && liveVariantMap.has(variant)) {
                matchedIndex = liveVariantMap.get(variant);
                found = true;
                note = "Variant Match Only";
            }

            if (found) {
                matchedLiveIndices.add(matchedIndex);
                matchedImages.push(url || variant || `Image #${idx+1}`);
            } else {
                missingImages.push(url || variant || `Image #${idx+1}`);
            }

            res.details.push({ 
                label: `Image ${label}`, 
                passed: found, 
                note: found ? note : "Missing"
            });
            if (!found) res.passed = false;
        });
    }

    // 3. Calculate Extras (Live images not matched)
    const extraImages = liveImages.filter((_, i) => !matchedLiveIndices.has(i)).map(img => img.hiRes || img.large);

    // 4. Check Duplicates
    const findDuplicates = (list) => {
        const ids = list.map(item => {
            const u = (typeof item === 'object') ? (item.hiRes || item.large) : item;
            return extractImageId(u);
        }).filter(Boolean);
        return ids.filter((item, index) => ids.indexOf(item) !== index);
    };

    res.analysis = {
        missing: missingImages,
        extra: extraImages,
        matches: matchedImages,
        duplicatesSource: findDuplicates(expectedImages),
        duplicatesLive: findDuplicates(liveImages)
    };

    return res;
};

const auditVideo = (live, source) => {
    const res = { passed: true, details: [] };
    let checks = 0;

    if (source.videoCount) {
        checks++;
        const exp = parseInt(source.videoCount);
        const pass = live.videoCount >= exp;
        res.details.push({ label: "Video Count", passed: pass, expected: exp, actual: live.videoCount });
        if (!pass) res.passed = false;
    }

    if (source.videoTitles) {
        checks++;
        // Strict Exact Match of ALL titles
        const expTitles = parseList(source.videoTitles).map(t => normalizeText(t));
        const liveTitles = live.videos.map(v => normalizeText(v.video_title || ""));

        // User requirement: "videos from the source video array are present in the PDP video array"
        // Implicitly means: For every expected title, is it there?
        expTitles.forEach(t => {
            const found = liveTitles.some(lt => lt === t);
            res.details.push({ label: `Video Found: "${t}"`, passed: found });
            if (!found) res.passed = false;
        });
    }

    if (checks === 0) res.status = 'skipped';
    return res;
};

// Helper for Deep Image Comparison (Draft vs Live)
const compareImageSets = (draftSet, liveSet, labelPrefix) => {
    const details = [];
    let allPassed = true;

    if (!draftSet || draftSet.length === 0) return { passed: true, details: [{ label: `${labelPrefix} Empty`, passed: true, note: "No Draft Images" }] };
    if (!liveSet || liveSet.length === 0) return { passed: false, details: [{ label: `${labelPrefix} Missing`, passed: false, note: "Live Section Missing" }] };

    // Create Map of Live Images for O(1) Lookup (Key: Image ID)
    const liveMap = new Map();
    liveSet.forEach(img => {
        // Handle both key formats (A+ uses a-plus-image, Brand Story uses brand-story-image)
        const url = img['brand-story-image'] || img['a-plus-image'] || img['a-plus-courosal-image'] || img['a-plus-carousel-image'];
        const alt = img['brand-story-alt-text'] || img['a-plus-alt-text'] || img['a-plus-courosal-alt-text'] || img['a-plus-carousel-alt-text'];
        const id = extractImageId(url);
        if (id) liveMap.set(id, alt || ""); 
    });

    draftSet.forEach((img, idx) => {
        const url = img['brand-story-image'] || img['a-plus-image'] || img['a-plus-courosal-image'] || img['a-plus-carousel-image'];
        const alt = img['brand-story-alt-text'] || img['a-plus-alt-text'] || img['a-plus-courosal-alt-text'] || img['a-plus-carousel-alt-text'];
        const id = extractImageId(url);
        
        const checkLabel = `${labelPrefix} #${idx + 1}`;

        if (!id) {
            details.push({ label: checkLabel, passed: false, note: "Invalid Draft URL" });
            allPassed = false;
            return;
        }

        if (liveMap.has(id)) {
            // Image ID Match found. Now check Alt Text.
            const liveAlt = liveMap.get(id);
            // Normalizing text for comparison (trim/lower)
            const normDraftAlt = normalizeText(alt);
            const normLiveAlt = normalizeText(liveAlt);
            
            if (normDraftAlt === normLiveAlt) {
                details.push({ label: checkLabel, passed: true, note: "Image & Alt Match" });
            } else {
                details.push({ label: checkLabel, passed: false, note: `Alt Mismatch (Exp: "${alt}", Act: "${liveAlt}")` });
                allPassed = false;
            }
        } else {
            details.push({ label: checkLabel, passed: false, note: "Image Missing Live" });
            allPassed = false;
        }
    });

    return { passed: allPassed, details };
};

const auditBrandStory = (live, source) => {
    const res = { passed: true, details: [] };
    
    // 1. Basic Check
    if (source.brandStory) {
        const hasIt = live.hasBrandStory === "YES";
        res.details.push({ label: "Has Brand Story", passed: hasIt });
        if (!hasIt) res.passed = false;

        // 2. Deep Audit (Draft vs Live)
        // live.attributes can contain merged draft data. auditorEngine receives normalized `live`.
        // We need to ensure normalizeLiveData passes through the merged draft data.
        // Assuming normalizeLiveData does: ...data (spread).
        if (live.draftBrandStoryData && Array.isArray(live.draftBrandStoryData)) {
             const deepResult = compareImageSets(live.draftBrandStoryData, live.brandStoryImgs, "BS Image");
             res.details.push(...deepResult.details);
             if (!deepResult.passed) res.passed = false;
        }
    } else {
        res.status = 'skipped';
    }
    return res;
};

const auditAplus = (live, source) => {
    const res = { passed: true, details: [] };
    if (source.aplus) {
        const hasIt = live.hasAplus === "YES";
        res.details.push({ label: "Has A+ Content", passed: hasIt });
        if (!hasIt) res.passed = false;

        // 2. Deep Audit (Draft vs Live)
        if (live.draftAplusData && Array.isArray(live.draftAplusData)) {
             // Combine Standard A+ and Carousel A+ for Live side if separated?
             // content.js separates them. But Draft might have them combined or separated.
             // We'll merge Live sets for a comprehensive lookup.
             const combinedLive = [...(live.aPlusImgs || []), ...(live.aPlusCarouselImgs || [])];
             
             // Merge Draft sets if we have both? The merge logic in sidepanel.js puts them in distinct keys.
             // We'll check draftAplusData (Standard) and draftAplusCarouselData (Carousel) if present.
             // But usually Draft Link is ONE page. content.js on Draft page will split them too.
             // merge logic in sidepanel: base.attributes.draftAplusData = ...aPlusImgs;
             // base.attributes.draftAplusCarouselData = ...aPlusCarouselImgs;
             
             const combinedDraft = [...(live.draftAplusData || []), ...(live.draftAplusCarouselData || [])];
             
             const deepResult = compareImageSets(combinedDraft, combinedLive, "A+ Image");
             res.details.push(...deepResult.details);
             if (!deepResult.passed) res.passed = false;
        }
    } else {
        res.status = 'skipped';
    }
    return res;
};

const auditComparison = (live, source) => {
    const res = { passed: true, details: [] };
    if (!source.comparison) return { passed: true, status: 'skipped' };

    const expAsins = parseList(source.comparison);
    if (expAsins.length === 0) return { passed: true, status: 'skipped' };

    const liveAsins = live.comparisonAsins || [];

    expAsins.forEach(asin => {
        const found = liveAsins.includes(asin);
        res.details.push({ label: `Comparison ASIN ${asin}`, passed: found });
        if (!found) res.passed = false;
    });

    return res;
};

const auditVariation = (live, source) => {
    const res = { passed: true, details: [] };
    let checks = 0;

    if (source.variationCount) {
        checks++;
        const exp = parseInt(source.variationCount);
        const pass = live.variationCount === exp; 
        res.details.push({ label: "Variation Count", passed: pass, expected: exp, actual: live.variationCount });
        if (!pass) res.passed = false;
    }

    if (source.variationTheme) {
        checks++;
        const exp = String(source.variationTheme).trim();
        const act = String(live.variationTheme).trim();
        const pass = (exp === act); // Exact match per request
        res.details.push({
            label: "Variation Theme",
            passed: pass,
            expected: source.variationTheme,
            actual: live.variationTheme,
            note: pass ? "Matched" : "Theme Violation"
        });
        if (!pass) res.passed = false;
    }

    if (source.variationFamily) {
        checks++;
        const expFamily = parseList(source.variationFamily);
        const liveFamily = live.variationFamily || [];

        // Check if all expected are present
        const missing = expFamily.filter(asin => !liveFamily.includes(asin));
        const passed = missing.length === 0;

        res.details.push({ 
            label: "Family Integrity", 
            passed: passed, 
            expected: source.variationFamily,
            actual: live.variationFamily,
            note: passed ? "All Present" : `Broken/Orphaned Variation: ${missing.join(', ')}`
        });
        if (!passed) res.passed = false;
    }

    if (checks === 0) res.status = 'skipped';
    return res;
};

const auditBuyBox = (live, source) => {
    const res = { passed: true, details: [] };
    let checks = 0;

    if (source.price) {
        checks++;
        // Numeric Delta check
        const exp = parsePrice(source.price);
        const act = parsePrice(live.displayPrice);
        
        if (exp !== null && act !== null) {
            const diff = act - exp;
            let note = "Match";
            let pass = true; // "Must be same as in source" -> Strict equality? 
            // "If price is raised or fallen (by how much)" -> Implies reporting delta.
            
            if (diff > 0) { 
                note = `Raised by ${diff.toFixed(2)}`;
                pass = false; // Mismatch
            } else if (diff < 0) { 
                note = `Fallen by ${Math.abs(diff).toFixed(2)}`;
                pass = false; // Mismatch
            }
            
            res.details.push({ label: "Price", passed: pass, expected: source.price, actual: live.displayPrice, note: note });
            if (!pass) res.passed = false;
        } else {
            // String fallback
            const pass = (String(live.displayPrice).trim() === String(source.price).trim());
            res.details.push({ label: "Price", passed: pass, expected: source.price, actual: live.displayPrice });
            if (!pass) res.passed = false;
        }
    }

    if (source.soldBy || source.seller) {
        checks++;
        // Exact Containment/Match
        const exp = String(source.soldBy || source.seller).trim();
        const act = String(live.soldBy).trim();
        const pass = act.includes(exp) || exp.includes(act);
        res.details.push({ label: "Sold By", passed: pass, expected: source.soldBy || source.seller, actual: live.soldBy });
        if (!pass) res.passed = false;
    }

    if (source.shipsFrom) {
        checks++;
        const exp = normalizeText(source.shipsFrom);
        const act = normalizeText(live.shipsFrom);
        const pass = act.includes(exp);
        res.details.push({ label: "Ships From", passed: pass, expected: source.shipsFrom, actual: live.shipsFrom });
        if (!pass) res.passed = false;
    }

    if (checks === 0) res.status = 'skipped';
    return res;
};

const auditDelivery = (live, source) => {
    const res = { passed: true, details: [] };
    
    if (source.deliveryDays) {
        const maxDays = parseInt(source.deliveryDays);
        if (!isNaN(maxDays)) {
            // Determine Live Date: Prime > Free > Paid
            // Note: content.js parses these into text. We need to parse text to Date.
            const liveDateStr = live.primeOrFastestDeliveryDate || live.freeDeliveryDate || live.paidDeliveryDate;
            const liveDate = parseAmazonDate(liveDateStr);
            
            if (liveDate) {
                const now = new Date();
                now.setHours(0,0,0,0);
                
                // Target Date
                const targetDate = new Date(now);
                targetDate.setDate(targetDate.getDate() + maxDays);
                
                // Diff Calculation
                // delay = live - target
                const diffTime = liveDate - targetDate;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let pass = true;
                let note = "On Time";
                
                if (diffDays > 0) {
                    pass = false;
                    note = `Delayed by ${diffDays} days`;
                }
                
                res.details.push({ 
                    label: "Delivery", 
                    passed: pass, 
                    expected: `< ${maxDays} days`, 
                    actual: liveDateStr, 
                    note: note 
                });
                if (!pass) res.passed = false;
            } else {
                // Parsing failed
                res.details.push({ label: "Delivery", passed: true, note: "Date Parse Error (Manual Check)", actual: liveDateStr });
            }
        } else {
             res.status = 'skipped';
        }
    } else {
        res.status = 'skipped';
    }
    return res;
};


// --- Custom Rules Audit Engine ---
const auditCustomRules = (live, source, rules) => {
    const res = { passed: true, details: [] };
    const customData = live.customAttributes || {};
    
    if (!rules || rules.length === 0 || Object.keys(customData).length === 0) {
        return { passed: true, status: 'skipped' };
    }

    let checks = 0;

    rules.forEach(rule => {
        if (!rule.isActive || !rule.audit || !rule.audit.enabled) return;

        const scrapedValue = customData[rule.id];
        // If it wasn't scraped, or was "none", handle gracefully
        
        // Find the expected value from the Source data.
        // Prioritize explicit column mapping, fallback to rule name.
        const expectedColumnName = (rule.audit && rule.audit.columnName) ? rule.audit.columnName : rule.name;
        const expectedValue = source._rawOriginalData ? source._rawOriginalData[expectedColumnName] : null;
        
        // If the user didn't provide this column in the CSV, skip the audit for this item.
        if (expectedValue === undefined || expectedValue === null) return;
        
        checks++;
        let passed = false;
        let note = "Mismatch";
        const op = rule.audit.operator;
        
        const actStr = String(scrapedValue || "");
        const expStr = String(expectedValue || "");

        try {
            switch(op) {
                case 'exact':
                    passed = (actStr.trim() === expStr.trim());
                    note = passed ? "Exact Match" : "Exact Mismatch";
                    break;
                case 'contains':
                    passed = actStr.toLowerCase().includes(expStr.toLowerCase());
                    note = passed ? "Contains Match" : "Does Not Contain";
                    break;
                case 'regex':
                    // The expected value from CSV is treated as the regex pattern
                    const regex = new RegExp(expStr, 'i');
                    passed = regex.test(actStr);
                    note = passed ? "Regex Match" : "Regex Failed";
                    break;
                case 'numeric_delta':
                    const actNum = parsePrice(actStr);
                    const expNum = parsePrice(expStr);
                    const deltaMax = rule.audit.options?.deltaMax || 0;
                    
                    if (actNum !== null && expNum !== null) {
                        const diff = Math.abs(actNum - expNum);
                        passed = (diff <= deltaMax);
                        note = passed ? `Within Delta (${diff})` : `Exceeds Delta (${diff} > ${deltaMax})`;
                    } else {
                        passed = false;
                        note = "Parse Error (Not Numeric)";
                    }
                    break;
                case 'exists':
                    passed = (scrapedValue !== "none" && scrapedValue !== "" && scrapedValue !== null);
                    note = passed ? "Element Found" : "Element Missing";
                    break;
                case 'does_not_exist':
                    passed = (scrapedValue === "none" || scrapedValue === "" || scrapedValue === null);
                    note = passed ? "Element Not Found (Good)" : "Element Found (Bad)";
                    break;
                default:
                    passed = false;
                    note = "Unknown Operator";
            }
        } catch(e) {
            passed = false;
            note = `Audit Error: ${e.message}`;
        }

        res.details.push({
            label: rule.name,
            passed: passed,
            expected: expectedValue,
            actual: scrapedValue,
            note: note
        });

        if (!passed) res.passed = false;
    });

    if (checks === 0) res.status = 'skipped';
    return res;
};
// auditorEngine.js - Semantic Batching API

/**
 * Handles batch API requests to the Semantic text comparison endpoint.
 * @param {Array} semanticQueue - Array of items needing semantic checks { rowRef, type, expected, actual, ... }
 * @param {Object} settings - Context settings
 */
export const batchSemanticAudit = async (semanticQueue, settings = {}) => {
    if (!semanticQueue || semanticQueue.length === 0) return [];

    // Construct Payload
    // Expected structure for Cloud Function:
    // { requests: [ { id: "item1_title", type: "title", expected: "...", actual: "..." }, ... ] }
    const payload = {
        requests: semanticQueue.map((item, idx) => ({
            id: `req_${idx}`, // Local correlation ID
            type: item.type,
            expected: item.expected,
            actual: item.actual
        }))
    };

    try {
        const response = await fetch('https://us-central1-your-project.cloudfunctions.net/semanticTextCompare', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Semantic API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        // data.results is expected to be an array of { id, passed, similarity, note }

        // Merge results back into the queue
        const resultsMap = {};
        if (data && data.results) {
             data.results.forEach(res => {
                 resultsMap[res.id] = res;
             });
        }

        return semanticQueue.map((item, idx) => {
             const aiResult = resultsMap[`req_${idx}`];
             if (aiResult) {
                 return { ...item, passed: aiResult.passed, note: aiResult.note, aiScore: aiResult.similarity };
             }
             return { ...item, passed: false, note: "AI Check Failed (No data)" };
        });

    } catch (e) {
        console.error("AI Semantic Audit failed:", e);
        // Fallback: Fail everything in the queue gracefully
        return semanticQueue.map(item => ({ ...item, passed: false, note: `AI Error: ${e.message}` }));
    }
};
