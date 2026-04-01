(async function() {
  try {
    const storageData = await chrome.storage.local.get("customRules");
    const cachedCustomRules = storageData.customRules || [];


    window.la_extractCustomRule = (rule, currentAsin) => {
        let extractedValue = "none";
        const { method, selector, attribute, multiple, processing, regexPattern, regexReplace } = rule.extraction;
        if (!selector) return "none";

        // Dynamic Variable
        const finalSelectors = selector.replace(/{ASIN}/g, currentAsin).split('\n').map(s => s.trim()).filter(Boolean);

        let rawResult = [];

        for (const sel of finalSelectors) {
            try {
                if (method === 'css') {
                    if (multiple) {
                        const els = document.querySelectorAll(sel);
                        if (els.length > 0) {
                            rawResult = Array.from(els).map(el => {
                                if (attribute === 'text') return el.textContent.trim();
                                else if (attribute === 'innerHTML') return el.innerHTML.trim();
                                else return el.getAttribute(attribute) || "none";
                            });
                            break;
                        }
                    } else {
                        const el = document.querySelector(sel);
                        if (el) {
                            if (attribute === 'text') rawResult = [el.textContent.trim()];
                            else if (attribute === 'innerHTML') rawResult = [el.innerHTML.trim()];
                            else rawResult = [el.getAttribute(attribute) || "none"];
                            break;
                        }
                    }
                } 
                else if (method === 'xpath') {
                    if (multiple) {
                        const result = document.evaluate(sel, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        if (result.snapshotLength > 0) {
                            for (let i=0; i<result.snapshotLength; i++) {
                                const el = result.snapshotItem(i);
                                if (attribute === 'text') rawResult.push(el.textContent.trim());
                                else if (attribute === 'innerHTML') rawResult.push(el.innerHTML.trim());
                                else rawResult.push(el.getAttribute(attribute) || "none");
                            }
                            break;
                        }
                    } else {
                        const result = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        const el = result.singleNodeValue;
                        if (el) {
                            if (attribute === 'text') rawResult = [el.textContent.trim()];
                            else if (attribute === 'innerHTML') rawResult = [el.innerHTML.trim()];
                            else rawResult = [el.getAttribute(attribute) || "none"];
                            break;
                        }
                    }
                }
            } catch (err) {
                console.warn(`LA: Fallback selector failed: ${sel}`, err);
            }
        }

        if (rawResult.length === 0) return "none";

        // Post Processing
        let processedResult = rawResult.map(val => {
            if (val === "none") return val;
            let pVal = val;
            if (processing === 'numbers_only') {
                pVal = pVal.replace(/[^0-9.,-]/g, '');
            } else if (processing === 'remove_line_breaks') {
                pVal = pVal.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
            } else if (processing === 'regex_replace' && regexPattern) {
                try {
                    const regex = new RegExp(regexPattern, 'g');
                    pVal = pVal.replace(regex, regexReplace || '');
                } catch(e) { console.error("Regex error", e); }
            }
            return pVal;
        });

        if (multiple) {
            return JSON.stringify(processedResult);
        } else {
            return processedResult[0];
        }
    };

    if (!window.__LA_CUSTOM_TEST_LISTENER) {
        window.__LA_CUSTOM_TEST_LISTENER = true;
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'TEST_CUSTOM_RULE') {
                try {
                    // Extract ASIN from URL
                    let currentAsin = "none";
                    const match = window.location.href.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
                    if (match) currentAsin = match[1];

                    const result = window.la_extractCustomRule(request.payload.rule, currentAsin);
                    sendResponse({ data: result });
                } catch(e) {
                    sendResponse({ error: e.message });
                }
                return true;
            }
        });
    }

    // --- 0. Helper Functions ---
    const cleanImageUrl = (url) => {
      if (!url || url === "none") return "none";
      // Filter out common placeholders
      if (url.includes('transparent-pixel') || url.includes('grey-pixel') || url.includes('loader')) return "none";
      return url.replace(/\._[A-Z0-9,._-]+(\.[a-z]+)$/i, '$1');
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const waitForEl = (selector, timeout = 3000) => {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    // --- Vendor Central Scraper Function ---
    const scrapeVendorCentral = async () => {
        const url = window.location.href;
        const result = { isVC: true, url };

        try {
            // 1. Image Manage Page
            if (url.includes("/imaging/manage")) {
                result.type = "images";
                result.images = [];
                result.data = []; // For Auditor compatibility

                // Method A: Legacy Selector
                const group = document.querySelector('div[class*="imageGroup"]');
                if (group) {
                    const containers = group.children;
                    for (let div of containers) {
                        const img = div.querySelector('img');
                        if (img) {
                            const imgObj = {
                                variant: img.alt || "none",
                                src: img.src || "none",
                                large: cleanImageUrl(img.src)
                            };
                            result.images.push(imgObj);
                            result.data.push(imgObj);
                        }
                    }
                }

                // Method B: Modern Selector (from Auditor/Scraper)
                if (result.data.length === 0) {
                     const selector = 'div[data-testid*="image-wrapper"] > img[class*="variantImage"]';
                     const images = document.querySelectorAll(selector);
                     images.forEach(img => {
                        const imgObj = {
                            variant: img.alt || "none",
                            src: img.src || "none",
                            large: cleanImageUrl(img.src)
                        };
                        result.images.push(imgObj);
                        result.data.push(imgObj);
                     });
                }

                // Metadata
                const h3TitleEl = document.querySelector('h3[id="title"]');
                result.title = h3TitleEl ? h3TitleEl.innerText.trim() : document.title;
                const urlParams = new URLSearchParams(window.location.search);
                result.asin = urlParams.get('asins') || "none";
            }

            // 2. Catalog Edit Page
            else if (url.includes("/abis/listing/edit")) {
                result.type = "catalog";

                const getValue = (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return "none";
                    // Check standard value, then attribute, then shadow root if needed
                    if (el.value) return el.value;
                    if (el.getAttribute('value')) return el.getAttribute('value');
                    return "none";
                };

                // Item Name
                result.item_name = getValue('kat-textarea[name="item_name-0-value"]');

                // Description
                result.product_description = getValue('kat-textarea[name="rtip_product_description-0-value"]');

                // List Price
                result.list_price = getValue('kat-input[name="list_price-0-value"]');

                // Bullet Points (All found)
                result.bullet_points = [];
                const bullets = document.querySelectorAll('kat-textarea[name*="bullet_point"]');
                bullets.forEach(b => {
                    const val = b.value || b.getAttribute('value');
                    if (val) result.bullet_points.push(val);
                });
            }

            return result;

        } catch (e) {
            return { error: e.toString() };
        }
    };

    const extractJsonArray = (str, startSearchIndex) => {
        const openBracketIndex = str.indexOf('[', startSearchIndex);
        if (openBracketIndex === -1) return null;
        let bracketCount = 0;
        let endIndex = -1;
        let started = false;
        for (let i = openBracketIndex; i < str.length; i++) {
            const char = str[i];
            if (char === '[') { if (!started) started = true; bracketCount++; } 
            else if (char === ']') { bracketCount--; }
            if (started && bracketCount === 0) { endIndex = i + 1; break; }
        }
        return endIndex !== -1 ? str.substring(openBracketIndex, endIndex) : null;
    };

    const extractJsonObject = (str, startSearchIndex) => {
        const openBraceIndex = str.indexOf('{', startSearchIndex);
        if (openBraceIndex === -1) return null;
        let braceCount = 0;
        let endIndex = -1;
        let started = false;
        for (let i = openBraceIndex; i < str.length; i++) {
            const char = str[i];
            if (char === '{') { if (!started) started = true; braceCount++; }
            else if (char === '}') { braceCount--; }
            if (started && braceCount === 0) { endIndex = i + 1; break; }
        }
        return endIndex !== -1 ? str.substring(openBraceIndex, endIndex) : null;
    };

    // --- AOD Scroll & Extract Function (Phase 3 & 4) ---
    const performAODScroll = async (expectedOffers, containerElement = null) => {
        try {
            let container = containerElement || document.getElementById('all-offers-display-scroller');
            if (!container) {
                console.log("AOD Scroll: Container not found.");
                return [];
            }

            const totalOffers = expectedOffers;
            const maxAttempts = totalOffers ? (Math.ceil(totalOffers / 10) + 1) : 1;
            let attempt = 0;
            let lastOfferCount = 0;
            let stuckCounter = 0;

            // --- Phase 3: Dynamic Loading Logic ---
            // Loop runs based on calculated attempts required to fetch all offers
            // Optimization: Cache selector and query efficiently
            const offerSelector = '#aod-offer-list div[id="aod-offer"]';
            
            if (expectedOffers > 0 && expectedOffers <= 10) {
                console.log("AOD: <= 10 offers. Doing single scroll to bottom.");
                if (container) container.scrollTop = container.scrollHeight;
                await sleep(2000);
            } else {
                while (attempt < maxAttempts) {
                    attempt++;
                    // Optimization: Count only, don't fetch Nodes if not needed immediately
                    // However, querySelectorAll returns a NodeList, length is cheap. 
                    // We need the *last* element for scrolling, so we query once.
                    const allOffers = document.querySelectorAll(offerSelector);
                    const currentCount = allOffers.length;
                    
                    console.log(`AOD Attempt: ${attempt}/${maxAttempts} - Loaded: ${currentCount}/${totalOffers || '?'}`);

                    // Comparison A (Count Matched)
                    if (totalOffers !== 0 && currentCount >= totalOffers) {
                        console.log("AOD Match: All offers loaded.");
                        break; 
                    }

                    // Comparison B (Count Mismatched) -> Focus on Last Offer & Wait
                    if (currentCount > 0) {
                        const lastOffer = allOffers[currentCount - 1]; // Direct access from cached NodeList
                        
                        // 1. Focus on the last element (Trigger Lazy Load)
                        lastOffer.scrollIntoView({ behavior: "smooth", block: "center" });
                        await sleep(3000); // Reduced from 5000 to 3000 for speed

                        // 2. Click "See more offers" button
                        let seeMoreAODBtn = document.querySelector('a[id="aod-retail-show-more-offers"]');
                        if (seeMoreAODBtn) {
                            console.log("AOD: 'See more AOD offers' button found, clicking...");
                            seeMoreAODBtn.click();
                            await sleep(1500); // Wait for new offers to load
                            seeMoreAODBtn = document.querySelector('a[id="aod-retail-show-more-offers"]');
                            if (seeMoreAODBtn) {
                                console.log("AOD: 'See more AOD offers' button still found, retrying click...");
                                seeMoreAODBtn.click();
                                await sleep(1500); // Wait for new offers to load
                            }
                        }

                        // 2. Double Nudge (Double Scroll Strategy) - Essential for AOD
                        if(container) {
                            container.scrollTop += 500;
                            await sleep(1500); 
                            container.scrollTop += 500;
                            await sleep(1500); 
                        }
                    } else {
                        // Fallback if no offers found yet (Container not populated?)
                        if(container) container.scrollTop = container.scrollHeight;
                        await sleep(2000);
                    }

                    // Check for Stuck State
                    // We re-query only length for check to be safe
                    const newCount = document.querySelectorAll(offerSelector).length;
                    if (newCount === lastOfferCount) {
                        stuckCounter++;
                    } else {
                        stuckCounter = 0;
                    }
                    lastOfferCount = newCount;

                    if (stuckCounter >= 3) {
                        console.log("AOD Warning: Stuck loading offers. Exiting loop.");
                        break;
                    }
                }
            }
            

            // --- Phase 4: Extraction & Verification ---
            console.log("AOD Extraction: Starting...");
            let offers = [];
            let extractionAttempts = 0;
            const MAX_EXTRACTION_RETRIES = 3;

            while (extractionAttempts < MAX_EXTRACTION_RETRIES) {
                extractionAttempts++;
                offers = []; // Reset for this attempt

                // Select ONLY the list of other offers (exclude pinned offer)
                const offerCards = document.querySelectorAll('#aod-offer-list div[id="aod-offer"]');
                const foundCount = offerCards.length;

                console.log(`AOD Extract Attempt ${extractionAttempts}: Found ${foundCount} / Expected ${totalOffers}`);

                offerCards.forEach(card => {
                    try {
                        const priceEl = card.querySelector('span[id*="aod-price"] > div > span[class*="aok-offscreen"]');
                        const price = priceEl ? priceEl.textContent.trim() : "none";

                        // Capture AOD Base Price (RRP/Strikethrough)
                        let aodBasePrice = "none";
                        const aodBasePriceEl = card.querySelector('span[id*="aod-price"] > div[class*="centralizedApexBasisPriceCSS"]');
                        if (aodBasePriceEl) {
                            const innerSpan = aodBasePriceEl.querySelector('span[class*="a-price"] > span[class="a-offscreen"]');
                            if (innerSpan) aodBasePrice = innerSpan.textContent.trim();
                        }

                        const shipsFromEl = card.querySelector('div[id="aod-offer-shipsFrom"] .a-col-right .a-size-small');
                        const shipsFrom = shipsFromEl ? shipsFromEl.textContent.trim() : "none";

                        const soldByEl = card.querySelector('div[id="aod-offer-soldBy"] .a-col-right .a-size-small');
                        const soldBy = soldByEl ? soldByEl.textContent.trim() : "none";

                        // Rating & Reviews
                        const ratingEl = card.querySelector('div[id="aod-offer-seller-rating"] > i[class*="aod-seller-rating"] > span');
                        const rating = ratingEl ? ratingEl.textContent.trim() : "none";

                        const reviewsEl = card.querySelector('div[id="aod-offer-seller-rating"] > span[id*="seller-rating-count"] > span');
                        const reviews = reviewsEl ? reviewsEl.textContent.trim() : "none";

                        let sellerDeliveryTime = "none";
                        const sellerDeliveryPromise = card.querySelector('span[data-csa-c-type="element"][data-csa-c-content-id="DEXUnifiedCXPDM"]');
                        if (sellerDeliveryPromise) {
                            sellerDeliveryTime = sellerDeliveryPromise.getAttribute('data-csa-c-delivery-time') || "none";
                        }

                        // Capture aod offers data
                        offers.push({ price, aodBasePrice, shipsFrom, soldBy, rating, reviews, sellerDeliveryTime });

                    } catch(e) {}
                });

                // Validation Check
                if (totalOffers !== 0 && foundCount >= totalOffers) {
                    console.log("AOD Validation: Count Matched. Success.");
                    break;
                } else if (extractionAttempts < MAX_EXTRACTION_RETRIES) {
                    console.log("AOD Validation: Mismatch. Retrying...");
                    container.scrollTop += 100; // Small nudge to trigger any stuck render
                    await sleep(2000); // Wait for DOM to settle
                }
            }

            return offers;

        } catch (e) {
            console.error("AOD Scraping Error", e);
            chrome.runtime.sendMessage({ action: 'LOG_ERROR', error: e.toString(), url: window.location.href, context: 'AOD_SCRAPER' }).catch(()=>{});
            return [];
        }
    };

    // --- 1. Determine Mode (VC or Amazon) ---
    if (window.location.hostname.includes("vendorcentral.amazon") || window.location.hostname.includes("sellercentral")) {
        return await scrapeVendorCentral();
    }

    // --- 1.5. Alert/Interstitial Page Handling (Unattended Mode) ---
    const alertElement = document.querySelector('html.a-no-js');
    if (alertElement) {
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
            const retryKey = 'alert_retry_' + window.location.href;
            let retries = parseInt(sessionStorage.getItem(retryKey) || '0', 10);
            if (retries < 5) {
                sessionStorage.setItem(retryKey, (retries + 1).toString());
                submitBtn.click();
                return { found: false, error: "INTERSTITIAL_REDIRECT", url: window.location.href, status: "RETRYING" };
            } else {
                return { found: true, error: "INTERSTITIAL_FAILED", url: window.location.href, title: "Alert Page Stuck" };
            }
        }
    }

    // --- 1.6. "Continue Shopping" / Age Gate Handling ---
    const continueBtn = document.querySelector('span[Class="a-button a-button-primary a-span12"] > span[Class="a-button-inner"] > button[Class="a-button-text"][Type="submit"]') ||
                        document.querySelector('input[type="submit"][value="Continue"]') ||
                        document.querySelector('#continue-shopping') ||
                        document.querySelector('input[aria-labelledby="continue-announce"]') ||
                        document.querySelector('span[data-action="continue-action"]');

    if (continueBtn && document.title.includes("Warning")) {
         const retryKey = 'continue_retry_' + window.location.href;
         let retries = parseInt(sessionStorage.getItem(retryKey) || '0', 10);
         if (retries < 5) {
             sessionStorage.setItem(retryKey, (retries + 1).toString());
             continueBtn.click();
             return { found: false, error: "CONTINUE_CLICKED", url: window.location.href, status: "RETRYING" };
         } else {
             return { found: true, error: "CONTINUE_FAILED_LOOP", url: window.location.href, title: "Continue Shopping Loop" };
         }
    }

    // --- 2. Robust Page Detection ---
    if (document.title.includes("Robot Check") || document.querySelector("form[action*='/errors/validateCaptcha']")) {
      return { found: true, error: "CAPTCHA_DETECTED", url: window.location.href, title: "Captcha Block" };
    }
    
    if (document.title.includes("Page Not Found") || 
        document.querySelector("img[alt*='Dogs of Amazon']") || 
        document.querySelector('a[href*="cs_404_logo"]') ||
        document.querySelector('img[src*="kailey-kitty"]') ||
        document.querySelector('img[id="d"][src*="error"]')) {
      return { found: true, error: "PAGE_NOT_FOUND_404", url: window.location.href, title: "Page Not Found" };
    }

    const waitForReady = async () => {
        const maxWait = 10000;
        const interval = 100;
        let elapsed = 0;
        while (elapsed < maxWait) {
            if (document.querySelector('#productTitle') ||
                document.querySelector('#wayfinding-breadcrumbs_container') ||
                document.querySelector('#dp-container') ||
                document.title.includes("Page Not Found") ||
                document.title.includes("Robot Check")) {
                return true;
            }
            await sleep(interval);
            elapsed += interval;
        }
        return false;
    };

    await waitForReady();

    // --- 2.6 Human-Like Scrolling (Lazy Load Trigger) ---
    try {
        const scrollHeight = document.body.scrollHeight;
        const viewHeight = window.innerHeight;
        
        // 1. General Scroll
        window.scrollTo(0, viewHeight);
        await sleep(500);
        
        // 2. Targeted A+ Content Scroll (Critical for Lazy Loading)
        const aplusContainer = document.querySelector('#aplus') || document.querySelector('#aplus_feature_div');
        if (aplusContainer) {
            aplusContainer.scrollIntoView({ block: 'center' });
            await sleep(1500); // Give time for images to swap from data-src
        }

        // 3. Continue General Scroll
        window.scrollTo(0, scrollHeight);
        await sleep(1500); 
        window.scrollTo(0, 0);
        await sleep(500);
    } catch(e) {
        console.log("Human Scroll Error:", e);
    }

    // --- 2.7. Check for AOD Mode request ---
    let aodData = [];
    let aodTotalOfferCount = "none";
    let needsAODScroll = false;
    
    if (window.SHOULD_SCRAPE_AOD) {
        // Check if the AOD ingress link exists on the page before queueing for sequential focus.
        // This prevents wasting time focusing tabs that don't even have offers.
        let hasIngress = document.querySelector('span[data-action="show-all-offers-display"] > a[id="aod-ingress-link"]') || 
                         document.querySelector('span[data-action="show-all-offers-display"] > span[id="buybox-see-all-buying-choices"]');
                         
        if (hasIngress) {
            console.log("AOD: Ingress link found. Flagging for sequential focus queue.");
            needsAODScroll = true;
        } else {
            console.log("AOD: No ingress link found. Skipping AOD for this product.");
        }
    }

    // --- 3. Extract Attributes using Mega GoldMine Strategy ---

    // 3.0 Helper: Extract Mega GoldMine from Scripts
    const extractMegaGoldMine = () => {
        const mega = {
            twister: null, // GoldMine 1 (Modern)
            legacy: null,  // GoldMine 2 (Fallback)
            images: null,  // Image Block
            videos: [],    // Video Data
            meta: {},      // Loose Meta (price, title, etc)
            variationData: {} // Accumulated Variation Data
        };

        const scripts = document.querySelectorAll('script');

        // Pre-define regexes outside loop for performance (Nitpick addressed)
        const videoRegex = /"holderId"\s*:\s*"holder([^"]+)"/g;
        const priceRegex = /"priceAmount"\s*:\s*([\d.]+)/;
        const mediaAsinRegex = /"mediaAsin"\s*:\s*"([^"]+)"/;
        const parentAsinRegex = /"parentAsin"\s*:\s*"([^"]+)"/;
        // Regex removed for variationValues, asinMap, and displayLabels - using robust extractor
        const brandRegex = /rhapsodyARIngressViewModel\s*=\s*\{[\s\S]*?brand\s*:\s*["']([^"']+)["']/;
        const jsonImagesRegex = /\[\s*\{"hiRes":.*?"variant":.*?\}\]/s;
        const dimensionsRegex = /"dimensions"\s*:\s*(\[[^\]]*\])/;

        for (let script of scripts) {
            const content = script.textContent || "";
            if (!content) continue;

            // 1. Twister Data (GoldMine 1)
            // Modified to accumulate data even if the main block was already found but incomplete
            if (content.includes("twister-js-init-dpx-data") && content.includes("dataToReturn")) {
                const match = content.match(/var\s+dataToReturn\s*=\s*(\{[\s\S]*?\});/);
                if (match && match[1]) {
                    const block = match[1];
                    const gm1 = mega.twister || {}; // Use existing or new
                    const getVal = (keyRegex) => { const m = block.match(keyRegex); return m ? m[1] : null; };

                    if(!gm1.parentAsin) gm1.parentAsin = getVal(/parentAsin\s*:\s*["']([^"']+)["']/);
                    if(!gm1.currentAsin) gm1.currentAsin = getVal(/currentAsin\s*:\s*["']([^"']+)["']/);
                    if(!gm1.num_total_variations) gm1.num_total_variations = getVal(/num_total_variations\s*:\s*(\d+)/);

                    if(!gm1.dimensions) {
                        const dimMatch = block.match(/dimensions\s*:\s*\[(.*?)\]/);
                        if (dimMatch) gm1.dimensions = dimMatch[1].replace(/["']/g, '').split(',').map(s => s.trim()).filter(s => s);
                    }

                    // Accumulate Details using Robust Extractor
                    if(!gm1.rawFamilyDetails) {
                        const keyIndex = block.indexOf('"dimensionValuesDisplayData"');
                        if (keyIndex !== -1) {
                            const extracted = extractJsonObject(block, keyIndex);
                            if (extracted) gm1.rawFamilyDetails = extracted;
                        } else {
                            // Fallback for unquoted keys in loose blocks
                            const looseIndex = block.indexOf('dimensionValuesDisplayData');
                            if (looseIndex !== -1) {
                                const extracted = extractJsonObject(block, looseIndex);
                                if (extracted) gm1.rawFamilyDetails = extracted;
                            }
                        }
                    }

                    if(!gm1.rawAsinMap) {
                        const keyIndex = block.indexOf('"dimensionToAsinMap"');
                        if (keyIndex !== -1) {
                            const extracted = extractJsonObject(block, keyIndex);
                            if (extracted) {
                                gm1.rawAsinMap = extracted;
                                const asinKeys = extracted.match(/[A-Z0-9]{10}/g);
                                if (asinKeys) gm1.familyAsins = [...new Set(asinKeys)];
                            }
                        } else {
                             const looseIndex = block.indexOf('dimensionToAsinMap');
                             if (looseIndex !== -1) {
                                 const extracted = extractJsonObject(block, looseIndex);
                                 if (extracted) {
                                     gm1.rawAsinMap = extracted;
                                     const asinKeys = extracted.match(/[A-Z0-9]{10}/g);
                                     if (asinKeys) gm1.familyAsins = [...new Set(asinKeys)];
                                 }
                             }
                        }
                        
                        // Fallback extraction if map completely missing but details found
                        if (!gm1.rawAsinMap && gm1.rawFamilyDetails && !gm1.familyAsins) {
                             const asinKeys = gm1.rawFamilyDetails.match(/[A-Z0-9]{10}/g);
                             if (asinKeys) gm1.familyAsins = [...new Set(asinKeys)];
                        }
                    }

                    if(!gm1.variationTheme) {
                        const keyIndex = block.indexOf('variationDisplayLabels'); // Usually matches quoted or unquoted
                        if (keyIndex !== -1) {
                            const extracted = extractJsonObject(block, keyIndex);
                            if (extracted) {
                                const labels = [];
                                const labelRegex = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g;
                                let l;
                                while ((l = labelRegex.exec(extracted)) !== null) labels.push(l[2]);
                                if (labels.length > 0) gm1.variationTheme = labels.join(", ");
                            }
                        }
                    }
                    mega.twister = gm1;
                }
            }

            // 2. Legacy Data (GoldMine 2)
            if (!mega.legacy && content.length > 500 && content.includes('jQuery.parseJSON') && (content.includes('colorToAsin') || content.includes('mediaAsin'))) {
                const match = content.match(/jQuery\.parseJSON\(\s*'([\s\S]*?)'\s*\)/);
                if (match && match[1]) {
                    let jsonStr = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
                    try { mega.legacy = JSON.parse(jsonStr); }
                    catch(jsonErr) { try { mega.legacy = JSON.parse(match[1]); } catch(e){} }
                }
            }

            // 3. Image Block
            if (!mega.images && content.includes("colorImages") && content.includes("initial")) {
                let anchorIndex = content.indexOf("'colorImages'");
                if (anchorIndex === -1) anchorIndex = content.indexOf('"colorImages"');
                if (anchorIndex !== -1) {
                    let initialLabelIndex = content.indexOf("'initial'", anchorIndex);
                    if (initialLabelIndex === -1) initialLabelIndex = content.indexOf('"initial"', anchorIndex);
                    if (initialLabelIndex !== -1) {
                        const rawArray = extractJsonArray(content, initialLabelIndex);
                        if (rawArray) {
                            try {
                                const parsedImages = JSON.parse(rawArray);
                                if (Array.isArray(parsedImages)) {
                                    mega.images = parsedImages.map(img => ({
                                        variant: img.variant || "MAIN",
                                        hiRes: cleanImageUrl(img.hiRes),
                                        large: cleanImageUrl(img.large),
                                        thumb: cleanImageUrl(img.thumb)
                                    }));
                                }
                            } catch (e) { console.log("ImageBlock JSON Parse Error", e); }
                        }
                    }
                }
            }

            // 4. Video Data (Regex extraction from scripts)
            // Combined with holderId search to avoid multiple passes
            const vMatches = content.matchAll(videoRegex);
            for (const match of vMatches) {
                if (!mega.videos.includes(match[1])) mega.videos.push(match[1]);
            }

            // 5. Loose Meta (Price, Title, etc in other scripts)
            if (!mega.meta.price) {
                const match = content.match(priceRegex);
                if (match) mega.meta.price = match[1];
            }
            if (!mega.meta.mediaAsin) {
                const match = content.match(mediaAsinRegex);
                if (match) mega.meta.mediaAsin = match[1];
            }
            if (!mega.meta.parentAsin) {
                const match = content.match(parentAsinRegex);
                if (match) mega.meta.parentAsin = match[1];
            }
            if (!mega.meta.variationValues) {
                const keyIndex = content.indexOf('"dimensionValuesDisplayData"');
                if (keyIndex !== -1) {
                    const extracted = extractJsonObject(content, keyIndex);
                    if (extracted) mega.meta.variationValues = extracted;
                }
            }
            if (!mega.meta.brand) {
                const match = content.match(brandRegex);
                if (match) mega.meta.brand = match[1];
            }
            if (!mega.meta.fallbackImages) {
                const match = content.match(jsonImagesRegex);
                if (match) {
                    try {
                        const rawData = JSON.parse(match[0]);
                        mega.meta.fallbackImages = rawData.map(item => ({ variant: item.variant || "none", hiRes: cleanImageUrl(item.hiRes), large: cleanImageUrl(item.large) }));
                    } catch (e) {}
                }
            }
            if (!mega.meta.dimensions) {
                const match = content.match(dimensionsRegex);
                if (match) mega.meta.dimensions = match[1];
            }
            if (!mega.meta.asinMap) {
                const keyIndex = content.indexOf('"dimensionToAsinMap"');
                if (keyIndex !== -1) {
                    const extracted = extractJsonObject(content, keyIndex);
                    if (extracted) mega.meta.asinMap = extracted;
                }
            }
            if (!mega.meta.displayLabels) {
                const keyIndex = content.indexOf('"variationDisplayLabels"');
                if (keyIndex !== -1) {
                    const extracted = extractJsonObject(content, keyIndex);
                    if (extracted) mega.meta.displayLabels = extracted;
                }
            }
        }
        return mega;
    };

    const mega = extractMegaGoldMine();
    const gm1 = mega.twister; // GoldMine 1 (Modern)
    const gm2 = mega.legacy;  // GoldMine 2 (Legacy)

    // --- 3.1 Data Population (Refactored Sections) ---
    // REMOVED pageHTML serialization for performance

    // === SECTION: IDENTITY (ASINs, Title, Brand) ===
    let mediaAsin = "none", parentAsin = "none", metaTitle = "";

    // Priority: GM1 > GM2 > Script Meta > DOM
    if (gm1 && gm1.currentAsin) mediaAsin = gm1.currentAsin;
    else if (gm2 && gm2.mediaAsin) mediaAsin = gm2.mediaAsin;
    else if (mega.meta.mediaAsin) mediaAsin = mega.meta.mediaAsin;
    else {
        const el = document.querySelector('input[name="ASIN"], input[id="ASIN"]');
        if (el) mediaAsin = el.value;
    }

    if (gm1 && gm1.parentAsin) parentAsin = gm1.parentAsin;
    else if (gm2 && gm2.parentAsin) parentAsin = gm2.parentAsin;
    else if (mega.meta.parentAsin) parentAsin = mega.meta.parentAsin;
    else {
        const el = document.querySelector('input[name="parentASIN"], input[id="parentASIN"]');
        if (el) parentAsin = el.value;
    }

    if (gm2 && gm2.title) {
        metaTitle = gm2.title;
        const txt = document.createElement("textarea"); txt.innerHTML = metaTitle; metaTitle = txt.value.replace(/\\/g, "");
    } else {
        const el = document.querySelector('meta[name="title"]');
        metaTitle = el ? el.getAttribute("content") : document.title;
    }

    const brandEl = document.querySelector('a[id="bylineInfo"]') || document.querySelector('div[id="bylineInfo"]');
    let brand = "none";
    if (brandEl) {
        brand = brandEl.textContent.trim();
        const prefixesToRemove = [/^Visit the\s+/i, /\s+Store$/i, /^Brand\s*:\s*/i, /^Marque\s*:\s*/i, /^Marke\s*:\s*/i, /^Marca\s*:\s*/i];
        prefixesToRemove.forEach(regex => { brand = brand.replace(regex, ''); });
        brand = brand.trim();
    } else if (mega.meta.brand) {
        brand = mega.meta.brand.trim();
    }

    // URL vs Page ASIN Check (Moved Up for Variation Logic)
    let queryAsinFromUrl = "none";
    try {
        const urlMatch = window.location.href.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
        if (urlMatch) queryAsinFromUrl = urlMatch[1].toUpperCase();
    } catch(e) {}

    // === SECTION: MEDIA (Images, Videos) ===
    let items = [];
    // Priority: Mega Images > GM2 ColorImages > DOM Fallback
    if (mega.images) {
        items = mega.images;
    } else if (gm2 && gm2.colorImages) {
        Object.keys(gm2.colorImages).forEach(variantName => {
            const imgs = gm2.colorImages[variantName] || [];
            imgs.forEach(img => {
                items.push({ variant: variantName, hiRes: cleanImageUrl(img.hiRes), large: cleanImageUrl(img.large) });
            });
        });
    } else if (mega.meta.fallbackImages) {
        items = mega.meta.fallbackImages;
    }

    let videos = [];
    const hostname = window.location.hostname;
    const domain = hostname.replace(/^www\.amazon\./, '');

    // Priority: GM2 Videos > Mega Regex Videos > DOM
    if (gm2 && gm2.videos) {
        videos = gm2.videos.filter(v => v.groupType === "IB_G1").map(v => ({
            "video_title": v.title,
            "video_url": `https://www.amazon.${domain}/vdp/${v.mediaObjectId}`
        }));
    } else {
        const videoSet = new Set(mega.videos || []); // Start with script matches

        // Add DOM matches
        const videoElements = document.querySelectorAll('div[data-role="video-player"]');
        if(videoElements.length > 0) {
             videoElements.forEach(el => {
                 const json = el.getAttribute("data-video-url");
                 if(json) videoSet.add(json);
             });
        }

        // Video holders already collected in extractMegaGoldMine
        videos = Array.from(videoSet).map(id => ({
            "video_title": "Video",
            "video_url": id.startsWith('http') ? id : `https://www.amazon.${domain}/vdp/${id}`
        }));
    }
    const videoCount = videos.length;
    const hasVideo = videoCount > 0 ? "YES" : "NO";


    // === SECTION: VARIATIONS ===
    let variationExists = "NO", variationTheme = "none", variationCount = "none", variationFamily = "none";
    let variationFamilyDetails = "none", variationFamilyAsinsMap = "none";
    let queryASIN_variation_theme = "none";

    // Priority: GM2 (Legacy) > GM1 (Twister) > DOM/Meta
    if (gm2 && gm2.colorToAsin) {
        const keys = Object.keys(gm2.colorToAsin);
        if (keys.length > 0) {
            variationExists = "YES";
            variationCount = keys.length.toString();
            const asinList = Object.values(gm2.colorToAsin).map(v => v.asin).sort();
            variationFamily = asinList;

            // Enrich with GM1 details
            if (gm1 && gm1.rawAsinMap) {
                variationFamilyAsinsMap = gm1.rawAsinMap.replace(/\s+/g, ' ');
            } else {
                variationFamilyAsinsMap = variationFamily; // fallback to JSON list
            }

            if (gm2.visualDimensions && gm2.visualDimensions.length > 0) {
                variationTheme = `[${gm2.visualDimensions.join(", ")}]`;
            }

            if (gm1 && gm1.rawFamilyDetails) {
                variationFamilyDetails = gm1.rawFamilyDetails;
            }
        }
    } else if (gm1 && gm1.num_total_variations) {
        variationExists = parseInt(gm1.num_total_variations) > 0 ? "YES" : "NO";
        variationCount = gm1.num_total_variations;

        const vThemeVal = gm1.variationTheme || (gm1.dimensions ? gm1.dimensions.join(", ") : "none");
        variationTheme = vThemeVal !== "none" ? `[${vThemeVal}]` : "none";

        if (gm1.familyAsins) variationFamily = gm1.familyAsins.sort();
        if (gm1.rawAsinMap) variationFamilyAsinsMap = gm1.rawAsinMap.replace(/\s+/g, ' ');
        else variationFamilyAsinsMap = variationFamily; // fallback to JSON list

        if (gm1.rawFamilyDetails) variationFamilyDetails = gm1.rawFamilyDetails;
    } else {
        // Fallback to Meta/DOM
        const dimVal = mega.meta.dimensions;
        variationExists = dimVal ? "YES" : "NO";
        variationTheme = dimVal || "none";

        if (mega.meta.variationValues) {
             variationFamilyDetails = mega.meta.variationValues;
             // Try to extract ASINs
             try {
                  const familyObj = JSON.parse(variationFamilyDetails);
                  const sortedKeys = Object.keys(familyObj).sort();
                  variationFamily = sortedKeys;
                  variationFamilyAsinsMap = variationFamily;
                  variationCount = sortedKeys.length.toString();
             } catch(e) {}
        }
    }

    // Final Fallback: Whole Page Search for Variation Details if still missing
    if (variationFamilyDetails === "none" && mega.meta.variationValues) {
        variationFamilyDetails = mega.meta.variationValues;
        // If family map is also missing, try to reconstruct from details keys
        if (variationFamilyAsinsMap === "none") {
            try {
                const keys = Object.keys(JSON.parse(variationFamilyDetails)).sort();
                variationFamily = keys;
                variationFamilyAsinsMap = variationFamily;
                variationCount = keys.length.toString();
                variationExists = "YES";
            } catch(e) {}
        }
    }
    
    if (variationFamilyAsinsMap === "none" && mega.meta.asinMap) {
        variationFamilyAsinsMap = mega.meta.asinMap;
        try {
            const mapObj = JSON.parse(variationFamilyAsinsMap);
            const asinValues = [...new Set(Object.values(mapObj))].sort();
            variationFamily = asinValues;
            variationCount = asinValues.length.toString();
            variationExists = "YES";
        } catch(e) {}
    }

    if (variationTheme === "none" && mega.meta.displayLabels) {
        try {
            const labelBlock = mega.meta.displayLabels;
            const labels = [];
            // Simple regex extract to avoid full JSON parse issues if nested
            const labelRegex = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g;
            let l;
            while ((l = labelRegex.exec(labelBlock)) !== null) labels.push(l[2]);
            if (labels.length > 0) variationTheme = `[${labels.join(", ")}]`;
        } catch(e) {}
    }

    // New Requirement: variation_family must be extracted from variationFamilyDetails directly
    if (variationFamilyDetails !== "none") {
        try {
            let detailsObj = null;
            if (typeof variationFamilyDetails === 'object') {
                detailsObj = variationFamilyDetails;
            } else {
                detailsObj = JSON.parse(variationFamilyDetails);
            }
            if (detailsObj) {
                const keys = Object.keys(detailsObj).filter(k => /^[A-Z0-9]{10}$/.test(k)).sort();
                if (keys.length > 0) {
                    variationFamily = keys;
                    // Optional: update count if they match
                    variationCount = keys.length.toString();
                }
            }
        } catch(e) {}
    }

    // New Attributes Logic: Query ASIN check
    // We need the *Query ASIN*. If user provided one via URL/Input, we check against that.
    // But content.js runs in isolation. It only knows 'queryAsinFromUrl' or 'mediaAsin'.
    // If we are scraping bulk, the URL usually contains the query ASIN.
    // If redirected, mediaAsin might differ.
    // Use queryAsinFromUrl as the primary "Query ASIN", fallback to mediaAsin.
    
    const targetAsin = (queryAsinFromUrl !== "none") ? queryAsinFromUrl : mediaAsin;

    // 1. queryASIN_variation_theme
    // Extract from variationFamilyDetails (dimensionValuesDisplayData)
    // Structure: {"ASIN1":["Color","Size"], "ASIN2":...}
    if (variationExists === "YES" && targetAsin !== "none" && variationFamilyDetails !== "none") {
        try {
            // It might be a string literal of a JSON object from regex match
            let detailsObj = null;
            if (typeof variationFamilyDetails === 'object') detailsObj = variationFamilyDetails;
            else {
                 // Try parsing. It might be partial JSON string from regex capture group.
                 // Ensure valid JSON format if it was captured as {key:val...}
                 // scraperEngine regex capture was: (\{[\s\S]*?\})
                 detailsObj = JSON.parse(variationFamilyDetails);
            }

            if (detailsObj && detailsObj[targetAsin]) {
                const val = detailsObj[targetAsin];
                // Value might be array ["Color", "Size"] or single value
                if (Array.isArray(val)) {
                    queryASIN_variation_theme = `[${val.join(", ")}]`;
                } else {
                    queryASIN_variation_theme = String(val);
                }
            }
        } catch(e) {
            // Parsing might fail if the regex capture was loose or malformed
            // console.log("Theme extraction error", e);
        }
    }

    // === SECTION: PRICING & STOCK ===
    let soldBy = "none", shipsFrom = "none";

    const fulfillerInfo = document.querySelector('div[data-csa-c-slot-id="odf-feature-text-desktop-fulfiller-info"] > div[class*="offer-display-feature-text"]');
    const merchantInfo = document.querySelector('div[data-csa-c-slot-id="odf-feature-text-desktop-merchant-info"] > div[class*="offer-display-feature-text"]');

    if (fulfillerInfo && merchantInfo) {
        shipsFrom = fulfillerInfo.textContent.trim() || "none";
        soldBy = merchantInfo.textContent.trim() || "none";
    } else if (!fulfillerInfo && merchantInfo) {
        shipsFrom = merchantInfo.textContent.trim() || "none";
        soldBy = merchantInfo.textContent.trim() || "none";
    }

    let displayPrice = "none";
    // 1. Primary Method (Hidden Input in BuyBox)
    const displayPriceEl = document.querySelector('div[id="qualifiedBuybox"] > div > form > input[name="items[0.base][customerVisiblePrice][amount]"]') || document.querySelector('form > input[name="items[0.base][customerVisiblePrice][displayString]"]');
    if (displayPriceEl) {
        displayPrice = displayPriceEl.value;
    }

    // 2. Fallback Methods
    if (displayPrice === "none") {
        const priceEl = document.querySelector('.a-price .a-offscreen') || document.querySelector('#priceblock_ourprice') || document.querySelector('#priceblock_dealprice');
        if (priceEl) {
            const txt = priceEl.textContent.trim();
            const num = txt.replace(/[^0-9.,]/g, '');
            if (num) displayPrice = num;
        }
    }

    if (displayPrice === "none" && mega.meta.price) {
        displayPrice = mega.meta.price;
    }

    // Basis Price (RRP/Strikethrough)
    let basisPrice = "none";
    try {
        const basisEl = document.querySelector('span[class*="basisPrice"] > span[class*="a-price"] > span[class="a-offscreen"]');
        if (basisEl) {
            basisPrice = basisEl.textContent.trim().replace(/[^0-9.,]/g, '');
        }
    } catch(e) {}

    let stockStatus = "In Stock";
    const oosDiv = document.querySelector('div[id="outOfStockBuyBox_feature_div"]');
    const outOfStockDiv = document.getElementById("outOfStock");
    const fodCxBox = document.getElementById("fod-cx-box");

    if (queryAsinFromUrl !== "none" && mediaAsin !== "none" && queryAsinFromUrl !== mediaAsin) {
        stockStatus = "ASIN Redirected";
    }
    else if (outOfStockDiv) {
        stockStatus = "Out Of Stock";
    }
    else if (fodCxBox) {
        const statusSpan = fodCxBox.querySelector('div > span > span');
        stockStatus = statusSpan ? statusSpan.textContent.trim() : "In Stock";
    }
    else if (oosDiv) {
        stockStatus = "Out Of Stock";
    }
    else if (soldBy === "none") {
        const noFeaturedDiv = document.querySelector('div[id="a-popover-fod-cx-learnMore-popover-fodApi"]');
        const availabilitySpan = document.querySelector('#availability span');

        if (noFeaturedDiv) {
            const textSpan = noFeaturedDiv.querySelector('span.a-text-bold');
            stockStatus = textSpan ? textSpan.textContent.trim() : "No featured offers available";
        }
        else if (availabilitySpan) {
            const availText = availabilitySpan.textContent.trim().toLowerCase();
            const oosKeywords = ["currently unavailable", "out of stock", "unavailable", "actualmente no disponible", "non disponible", "nicht verfügbar", "non disponibile", "niet beschikbaar"];
            if (oosKeywords.some(kw => availText.includes(kw))) stockStatus = "Out Of Stock";
        }
        else {
            stockStatus = "Currently Unavailable";
        }
    }

    // === SECTION: CONTENT (Bullets, Desc, A+) ===
    let bulletNodes = document.querySelectorAll('div[id="pqv-feature-bullets"] > ul > li');
    if (bulletNodes.length === 0) { bulletNodes = document.querySelectorAll('#feature-bullets li span.a-list-item, div[id*="productFactsDesktopExpander"] > div > ul > li > span[class*="a-list-item"]'); }
    const bulletsList = Array.from(bulletNodes).map(el => el.textContent.trim()).filter(text => text.length > 0);
    const bullets = bulletsList.join(" | ");
    const bulletCount = bulletsList.length;

    const descriptionEl = document.querySelector('div[id="productDescription"]') || document.querySelector('div[id="pqv-description"]');
    let description = "none";
    if (descriptionEl) {
        const clone = descriptionEl.cloneNode(true);
        const heading = clone.querySelector('h2'); if (heading) heading.remove();
        description = clone.textContent.trim();
        
        // Check if hidden source
        if (descriptionEl.id === "pqv-description") {
            description = "[HIDDEN] " + description;
        }
    }
    const descLen = description !== "none" ? description.length : 0;

    // Helper to safely get the best image URL from an img element or its fallback
    const extractAplusImage = (img) => {
        let url = img.getAttribute('data-src') || img.src || "none";
        url = cleanImageUrl(url);
        
        // If image is still a pixel/placeholder, check if there's a parent wrapper or noscript fallback
        if (url === "none") {
            const parent = img.closest('div');
            if (parent) {
                // Try looking for a background image
                const bgImage = parent.style.backgroundImage;
                if (bgImage && bgImage !== 'none') {
                    const bgMatch = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
                    if (bgMatch && bgMatch[1]) url = cleanImageUrl(bgMatch[1]);
                }
            }
            
            // Try noscript fallback if present (Amazon sometimes puts real img inside noscript for A+)
            if (url === "none") {
                 const container = img.closest('[data-cel-widget]');
                 if (container) {
                     const noscript = container.querySelector('noscript');
                     if (noscript) {
                         const match = noscript.textContent.match(/src=["'](.*?)["']/);
                         if (match && match[1]) url = cleanImageUrl(match[1]);
                     }
                 }
            }
        }
        return url;
    };

    // --- Brand Story Images ---
    const brandStorySelectors = document.querySelectorAll('div[data-cel-widget*="aplus-brand-story"] img, div[cel_widget_id*="aplus-brand-story"] img, div[id*="aplusBrandStory"] img, #aplusBrandStory_feature_div img');
    let brandStoryImgs = Array.from(brandStorySelectors).map(img => ({
        "brand-story-image": extractAplusImage(img),
        "brand-story-alt-text": img.getAttribute('alt') || "none"
    }));
    // Filter out placeholders and duplicates
    brandStoryImgs = brandStoryImgs.filter(i => i["brand-story-image"] !== "none");
    const seenBrandStory = new Set();
    brandStoryImgs = brandStoryImgs.filter(i => {
        if (seenBrandStory.has(i["brand-story-image"])) return false;
        seenBrandStory.add(i["brand-story-image"]);
        return true;
    });

    // --- Basic A+ Images ---
    const aPlusSelectors = document.querySelectorAll('div[data-cel-widget*="aplus-3p-module"] img, div[cel_widget_id*="aplus-3p-module"] img, div[data-cel-widget*="aplus-launchpad"] img, div[cel_widget_id*="aplus-launchpad"] img, div[data-cel-widget*="aplus-premium-module"] img, div[cel_widget_id*="aplus-premium-module"] img, div[data-cel-widget*="aplus-module"] img, div[cel_widget_id*="aplus-module"] img');
    let aPlusImgs = Array.from(aPlusSelectors).map(img => ({
        "a-plus-image": extractAplusImage(img),
        "a-plus-alt-text": img.getAttribute('alt') || "none"
    }));
    // Filter out placeholders and duplicates
    aPlusImgs = aPlusImgs.filter(i => i["a-plus-image"] !== "none" && !i["a-plus-image"].includes("brand-story"));
    const seenAPlus = new Set();
    aPlusImgs = aPlusImgs.filter(i => {
        if (seenAPlus.has(i["a-plus-image"])) return false;
        seenAPlus.add(i["a-plus-image"]);
        return true;
    });

    // --- Carousel A+ Images ---
    const aPlusCarouselSelectors = document.querySelectorAll('div[data-cel-widget*="aplus-carousel-card"] img, div[cel_widget_id*="aplus-carousel-card"] img, div[class*="aplus-carousel"] img');
    let aPlusCarouselImgs = Array.from(aPlusCarouselSelectors).map(img => ({
        "a-plus-carousel-image": extractAplusImage(img),
        "a-plus-carousel-alt-text": img.getAttribute('alt') || "none"
    }));
    aPlusCarouselImgs = aPlusCarouselImgs.filter(i => i["a-plus-carousel-image"] !== "none");
    const seenAPlusCarousel = new Set();
    aPlusCarouselImgs = aPlusCarouselImgs.filter(i => {
        if (seenAPlusCarousel.has(i["a-plus-carousel-image"])) return false;
        seenAPlusCarousel.add(i["a-plus-carousel-image"]);
        return true;
    });

    const hasAplus = (aPlusImgs.length > 0 || aPlusCarouselImgs.length > 0) ? "YES" : "NO";
    
    // Updated Brand Story Presence Check
    const hasBrandStory = (brandStoryImgs.length > 0) ? "YES" : "NO";
    
    // Categories
    let categories = "none";
    try {
        const breadcrumbs = document.querySelectorAll('div[data-cel-widget="wayfinding-breadcrumbs_feature_div"] > ul > li, div[id="wayfinding-breadcrumbs_feature_div"] > ul > li');
        if (breadcrumbs && breadcrumbs.length > 0) {
            categories = Array.from(breadcrumbs).map(el => el.textContent.trim()).join(' ');
        }
    } catch(e) {}

    const hasBullets = bullets.length > 5 ? "YES" : "NO";
    let hasDescription = (description !== "none" && descLen > 5) ? "YES" : "NO";
    if (hasDescription === "YES" && description.startsWith("[HIDDEN]")) {
        hasDescription = "YES [HIDDEN]";
    }

    // === SECTION: DELIVERY ===
    let freeDeliveryDate = "none", paidDeliveryDate = "none", primeOrFastestDeliveryDate = "none";
    const primaryDEX = document.querySelector('span[data-csa-c-type="element"][data-csa-c-content-id="DEXUnifiedCXPDM"]');
    if (primaryDEX) {
        const price = primaryDEX.getAttribute('data-csa-c-delivery-price');
        const time = primaryDEX.getAttribute('data-csa-c-delivery-time');
        if (price && time) {
            if (/\d/.test(price)) { paidDeliveryDate = `${price} - ${time}`; }
            else { freeDeliveryDate = time; }
        }
    }
    const secondaryDEX = document.querySelector('span[data-csa-c-type="element"][data-csa-c-content-id="DEXUnifiedCXSDM"]');
    if (secondaryDEX) { const time = secondaryDEX.getAttribute('data-csa-c-delivery-time'); if (time) primeOrFastestDeliveryDate = time; }


    // === SECTION: SOCIAL (Rating, Reviews, BSR) ===
    const ratingEl = document.querySelector('a[class*="mvt-cm-cr-review-stars"] > span');
    const ratingRaw = ratingEl ? ratingEl.textContent.trim() : "none";
    const ratingVal = ratingRaw !== "none" ? parseFloat(ratingRaw.split(" ")[0].replace(/,/g, ".").replace(",", ".")) : 0;

    const reviewEl = document.querySelector('span[data-hook="total-review-count"]') || document.querySelector('span[id="acrCustomerReviewText"]');
    let reviewCount = "none";
    if (reviewEl) {
        const text = reviewEl.textContent.trim();
        const num = text.replace(/[^0-9]/g, '');
        if (num) reviewCount = num;
    }

    let bsr = "none";
    try {
        let bsrParts = [];
        const cleanBsrText = (text) => text ? text.replace(/\(.*?See Top 100.*?\)/i, '').replace(/\(\s*\)/g, '').replace(/^:\s*/, '').replace(/\s+/g, ' ').trim() : "";

        // 1. Primary Strategy (User's Precise Selector)
        const bsrLink = document.querySelector('ul[class*="a-unordered-list"] a[href*="/gp/bestsellers"]');
        
        if (bsrLink) {
            // Find the parent UL
            const parentUl = bsrLink.closest('ul[class*="a-unordered-list"]');
            if (parentUl) {
                // Get all LI children of this UL
                const allLis = parentUl.querySelectorAll('li');
                
                allLis.forEach(li => {
                    const rawText = li.innerText || "";
                    // Only process this LI if it looks like a rank (has a '#' or contains the bestseller link)
                    if (rawText.includes('#') || li.querySelector('a[href*="/gp/bestsellers"]')) {
                        // Clean up the text: remove "Best Sellers Rank:" label
                        const textWithoutLabel = rawText.replace(/Best Sellers Rank:\s*/i, '');
                        
                        // The LI might contain inner elements that split onto multiple lines
                        const lines = textWithoutLabel.split('\n');
                        lines.forEach(line => {
                            let cleaned = cleanBsrText(line);
                            if (cleaned && !cleaned.toLowerCase().includes("see top 100") && cleaned.length > 2 && !bsrParts.includes(cleaned)) {
                                bsrParts.push(cleaned);
                            }
                        });
                    }
                });
            }
        }

        // 2. Original Strategy: prodDetTable with /gp/bestsellers (Fallback)
        if (bsrParts.length === 0) {
            const bsrTable = document.querySelector('table[class*="prodDetTable"]');
            if (bsrTable) {
                const listContainer = bsrTable.querySelector('ul');
                if (listContainer) {
                    const hasBestsellersLink = listContainer.querySelector('a[href*="/gp/bestsellers"]');
                    if (hasBestsellersLink) {
                        listContainer.querySelectorAll('li').forEach(li => {
                            let t = cleanBsrText(li.textContent);
                            if (t) bsrParts.push(t);
                        });
                    }
                }
            }
        }

        // 3. Original Strategy: Text Label (Fallback)
        if (bsrParts.length === 0) {
            const rankLabel = Array.from(document.querySelectorAll('span.a-text-bold')).find(el => el.textContent.includes('Best Sellers Rank'));
            if (rankLabel) {
                const container = rankLabel.closest('li');
                if (container) {
                    const wrapper = container.querySelector('span.a-list-item') || container;
                    let mainText = "";
                    wrapper.childNodes.forEach(node => { if (node.nodeType === 1 && (node.classList.contains('a-text-bold') || node.nodeName === 'UL')) return; if (node.nodeType === 3) mainText += node.textContent; });
                    let cleanedMain = cleanBsrText(mainText); if (cleanedMain) bsrParts.push(cleanedMain);
                    const subList = wrapper.querySelector('ul'); if (subList) subList.querySelectorAll('li').forEach(li => { let t = cleanBsrText(li.textContent); if(t) bsrParts.push(t); });
                }
            }
        }
        
        if (bsrParts.length > 0) bsr = bsrParts.join(" | ");
    } catch(e) {}


    // --- Comparison Chart Extraction (Updated Cases) ---
    let comparisonAsins = [];
    let hasComparisonChart = "No";
    let presentASINinCompChart = "No";

    try {
        // Helper to extract ASIN from Link Element
        const extract = (links) => {
            links.forEach(link => {
                const href = link.getAttribute('href');
                const match = href.match(/\/dp\/([A-Z0-9]{10})/);
                if (match && !comparisonAsins.includes(match[1])) comparisonAsins.push(match[1]);
            });
        };

        // Case 1: A+ Premium Module 6 (Updated Selector with wildcard)
        const case1Container = document.querySelector('div[data-cel-widget*="aplus-premium-module-6-three-column-comparison"] > div[class*="aplus-container"]');
        if (case1Container) {
            hasComparisonChart = "Yes";
            const links = case1Container.querySelectorAll('div > table > tbody > tr > th > a[href*="/dp/"]');
            extract(links);
        }

        // Case 2: UCC Widget
        if (hasComparisonChart === "No") {
            const case2Container = document.querySelector('div[class="ucc-v2-widget"] > table[class*="ucc-v2-widget__table"]');
            if (case2Container) {
                hasComparisonChart = "Yes";
                // Adjusted selector based on description: table > tbody > tr > td > div > div > a.image-container
                const links = case2Container.querySelectorAll('tbody > tr > td > div > div > a[class*="image-container"][href*="/dp/"]');
                extract(links);
            }
        }

        // Case 3: Legacy Fallback (HLCX / APM)
        if (hasComparisonChart === "No") {
            const compTable = document.querySelector('table#HLCXComparisonTable') || document.querySelector('table[class*="apm-tablemodule-table"]');
            if (compTable) {
                hasComparisonChart = "Yes";
                const imageRow = compTable.querySelector('tr.comparison_table_image_row') || compTable.querySelector('tr.apm-tablemodule-imagerows');
                if (imageRow) {
                    const links = imageRow.querySelectorAll('a[href*="/dp/"]');
                    extract(links);
                }
                if (comparisonAsins.length === 0) {
                    const inputs = compTable.querySelectorAll('input[name="asin"]');
                    inputs.forEach(inp => { if(inp.value && !comparisonAsins.includes(inp.value)) comparisonAsins.push(inp.value); });
                }
            }
        }

        // Check if current mediaAsin is present in the comparison list
        if (mediaAsin !== "none" && comparisonAsins.includes(mediaAsin)) {
            const idx = comparisonAsins.indexOf(mediaAsin) + 1;
            presentASINinCompChart = `Yes (${idx})`;
        }

    } catch(e) { console.log("Comparison Extraction Error", e); }

    // --- Dynamic Size Chart ---
    let hasSizeChart = "No";
    if (document.querySelector('div[id="fit-sizechartv2-0"]')) {
        hasSizeChart = "Yes";
    }

    // --- Delivery Location (Address) ---
    let deliveryLocation = "none";
    try {
        const locEl = document.querySelector('#glow-ingress-line2');
        if (locEl) deliveryLocation = locEl.textContent.trim();
    } catch(e) {}

    // --- Enhanced LQS Calculation ---
    let score = 0;
    const imageCount = items.length;
    const marketplace = window.location.hostname.replace(/^www\./, '');
    let breakdown = [];

    if (metaTitle && metaTitle.length >= 80 && metaTitle.length <= 200) { 
        score += 10; breakdown.push({ label: "Title Length (80-200)", score: 10, pass: true });
    } else { breakdown.push({ label: "Title Length (Rec: 80-200)", score: 0, pass: false }); }

    if (imageCount >= 7) {
        score += 15; breakdown.push({ label: "Images (7+)", score: 15, pass: true });
    } else { breakdown.push({ label: `Images Found: ${imageCount} (Rec: 7+)`, score: 0, pass: false }); }

    if (bulletCount >= 5) {
        score += 15; breakdown.push({ label: "Bullet Points (5+)", score: 15, pass: true });
    } else { breakdown.push({ label: `Bullet Points: ${bulletCount} (Rec: 5)`, score: 0, pass: false }); }

    if (descLen >= 100) {
        score += 5; breakdown.push({ label: "Description Length (100+ chars)", score: 5, pass: true });
    } else { breakdown.push({ label: "Description too short", score: 0, pass: false }); }

    if (videoCount > 0) {
        score += 15; breakdown.push({ label: "Video Content", score: 15, pass: true });
    } else { breakdown.push({ label: "Missing Video", score: 0, pass: false }); }

    if (aPlusImgs.length > 0) {
        score += 20; breakdown.push({ label: "A+ Content", score: 20, pass: true });
    } else { breakdown.push({ label: "Missing A+ Content", score: 0, pass: false }); }

    if (ratingVal >= 4.0) {
        score += 10; breakdown.push({ label: "Rating (4.0+)", score: 10, pass: true });
    } else { breakdown.push({ label: `Rating: ${ratingVal} (Rec: 4.0+)`, score: 0, pass: false }); }

    if (reviewCount > 15) {
        score += 10; breakdown.push({ label: "Review Count (15+)", score: 10, pass: true });
    } else { breakdown.push({ label: `Reviews: ${reviewCount} (Rec: 15+)`, score: 0, pass: false }); }

    const lqs = score + "/100";

    // Message listener for sequential AOD scrolling
    // Must be inside IIFE to access performAODScroll, and placed BEFORE the return statement
    if (!window.AOD_LISTENER_ADDED) {
        window.AOD_LISTENER_ADDED = true;
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'PERFORM_AOD_SCROLL') {
                console.log(`Received request to perform AOD scrape (now focused).`);
                
                // Use a self-executing async function to handle the promise inside the listener
                (async () => {

                    try {
                        // 1. Click Ingress
                        console.log("AOD: Clicking ingress link...");
                        let ingressBtn = document.querySelector('span[data-action="show-all-offers-display"] > a[id="aod-ingress-link"]');
                        let fallbackIngressBtn = document.querySelector('span[data-action="show-all-offers-display"] > span[id="buybox-see-all-buying-choices"] a');

                        if (ingressBtn) {
                            ingressBtn.click();
                            await sleep(2000);
                            if (!document.getElementById('all-offers-display-scroller')) {
                                ingressBtn = document.querySelector('span[data-action="show-all-offers-display"] > a[id="aod-ingress-link"]');
                                if (ingressBtn) {
                                    console.log("AOD: Container not found, retrying ingress click...");
                                    ingressBtn.click();
                                    await sleep(2000);
                                }
                            }
                        } else if (fallbackIngressBtn) {
                            fallbackIngressBtn.click();
                            await sleep(1500);
                            if (!document.getElementById('all-offers-display-scroller')) {
                                fallbackIngressBtn = document.querySelector('span[data-action="show-all-offers-display"] > span[id="buybox-see-all-buying-choices"] a');
                                if (fallbackIngressBtn) {
                                    console.log("AOD: Container not found, retrying fallback ingress click...");
                                    fallbackIngressBtn.click();
                                    await sleep(2000);
                                }
                            }
                        } else {
                            console.error("AOD Ingress button not found!");
                            sendResponse({ success: false, data: [], totalOffers: 0 });
                            return;
                        }

                        // 2. Click "See more offers" button
                        let seeMoreBtn = document.querySelector('button[data-csa-c-content-id="aod-oas-see-more-offer-desktop"]');
                        if (seeMoreBtn) {
                            console.log("AOD: 'See more offers' button found, clicking...");
                            seeMoreBtn.click();
                            await sleep(2000); // Wait for new offers to load
                            seeMoreBtn = document.querySelector('button[data-csa-c-content-id="aod-oas-see-more-offer-desktop"]');
                            if (seeMoreBtn) {
                                console.log("AOD: 'See more offers' button still found, retrying click...");
                                seeMoreBtn.click();
                                await sleep(2000); // Wait for new offers to load
                            }
                        }

                        // 3. Get Container
                        let container = document.getElementById('all-offers-display-scroller');
                        if (!container) {
                            await sleep(2000);
                            container = document.getElementById('all-offers-display-scroller');
                        }

                        if (!container) {
                            console.error("AOD container not found after clicking!");
                            sendResponse({ success: false, data: [], totalOffers: 0 });
                            return;
                        }

                        // Wait for AOD panel contents to load via AJAX before querying count
                        console.log("AOD: Waiting for container contents to load...");
                        await sleep(3000);

                        // 4. Get Total Offers
                        const totalOffersInput = document.querySelector('div[id="aod-offer-list"] > input[id="aod-total-offer-count"]');
                        const totalOffers = totalOffersInput ? parseInt(totalOffersInput.value, 10) : null;
                        
                        console.log(`AOD: Expected ${totalOffers || '?'} offers.`);

                        // 5. Scroll logic (handled in performAODScroll now updated for both <=10 and >10)
                        const offers = await performAODScroll(totalOffers, container);
                        sendResponse({ success: true, data: offers, totalOffers: totalOffers });
                    } catch (error) {
                        console.error("Error during AOD processing:", error);
                        sendResponse({ success: false, data: [], totalOffers: 0 });
                    }
                })();

                return true; // Indicates we will send a response asynchronously
            }
        });
    }


    // --- 4. Dynamic Custom Extraction ---
    const customAttributes = {};
    try {
        for (const rule of cachedCustomRules) {
            if (!rule.isActive) continue;
            try {
                customAttributes[rule.id] = window.la_extractCustomRule(rule, mediaAsin || parentAsin || "none");
            } catch(ruleErr) {
                console.error(`Error extracting rule ${rule.name}:`, ruleErr);
                customAttributes[rule.id] = "Error";
            }
        }
    } catch(e) {
        console.error("Custom Rule Engine Error:", e);
    }


    return {
      found: true,
      url: window.location.href,
      title: document.title, 
      attributes: {
        marketplace, brand, metaTitle, mediaAsin, parentAsin, displayPrice, basisPrice, stockStatus, shipsFrom, soldBy,
        rating: ratingVal, reviews: reviewCount, bsr,
        freeDeliveryDate, paidDeliveryDate, primeOrFastestDeliveryDate,
        bulletsCount: bulletCount,
        bullets, description,
        variationExists, variationTheme, variationCount, variationFamily,
        queryASIN_variation_theme,
        brandStoryImgs, aPlusImgs, aPlusCarouselImgs, videos,
        categories, hasAplus, hasBrandStory, hasVideo, hasBullets, hasDescription,
        hasSizeChart, hasComparisonChart, presentASINinCompChart,
        lqs, lqsDetails: breakdown,
        videoCount, deliveryLocation,
        aodData, aodTotalOfferCount,
        needsAODScroll,
        comparisonAsins,
        variationFamilyDetails,
        variationFamilyAsinsMap,
        customAttributes
      },
      data: items
    };

  } catch (e) {
    console.error("Extraction error:", e);
    chrome.runtime.sendMessage({ action: 'LOG_ERROR', error: e.toString(), url: window.location.href, context: 'MAIN_SCRAPER' }).catch(()=>{});
    return { found: false, error: e.toString(), url: window.location.href };
  }
})();
