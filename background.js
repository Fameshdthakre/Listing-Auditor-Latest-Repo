import { filterAmazonAODOffer, getPortalDomain, marketplaceData } from './scraperEngine.js';
import { userAgents } from './src/utils/userAgents.js';

// background.js - Robust Batch Processing (Current Window)

const activeProcessingTabs = new Set(); // Track active processing tabs
let cachedIsScanning = false; // In-memory cache for performance
const UA_RULE_ID = 5000;
const PROXY_AUTH_RULE_ID = 5001;

// --- Proxy State ---
let activeProxy = null;
let proxyConfig = null;

const INITIAL_STATE = {
  isScanning: false,
  mode: 'current', 
  urlsToProcess: [],
  results: [],
  processedCount: 0,
  settings: { disableImages: false },
  statusMessage: "Ready.",
  nextActionTime: null,
  targetWindowId: null,
  locationVerified: false,
  startTime: null,
  endTime: null,
  currentDomain: null,
  agentStatus: {
      action: "Idle",
      currentDomain: "-",
      nextDomain: "-",
      batchSize: 0,
      nextBatchIn: 0
  }
};

// --- Initialization ---

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
          .catch((error) => console.error("SidePanel Error:", error));
  }
});

// Initialize cache on script load (Service Worker startup)
chrome.storage.local.get(['scraperState', 'auditorState', 'proxyConfig'], (data) => {
    const s = data.scraperState?.isScanning;
    const a = data.auditorState?.isScanning;
    cachedIsScanning = s || a;
    if (data.proxyConfig && data.proxyConfig.enabled) {
        proxyConfig = data.proxyConfig;
    }

    // Always release control on startup/reload to prevent "Controlled by extension" badge persistence
    // The proxy will be re-applied only when a scan actually starts.
    clearProxy(); 
    removeUserAgentRule();
});

// Sync Cache
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        const s = changes.scraperState?.newValue?.isScanning;
        const a = changes.auditorState?.newValue?.isScanning;
        // If either changed, update cache. If one is true, cache is true.
        if (s !== undefined || a !== undefined) {
             // We need to fetch current values to be sure, or rely on change
             // Simplest: read both from storage again if complex, but here:
             // If change happened, use it. If not, assume false? No.
             // Just read strictly.
             chrome.storage.local.get(['scraperState', 'auditorState'], (d) => {
                 cachedIsScanning = (d.scraperState?.isScanning || d.auditorState?.isScanning);
             });
        }
        if (changes.proxyConfig) {
            proxyConfig = changes.proxyConfig.newValue;
        }
    }
});

// --- User Agent Rotation ---
async function setRandomUserAgent() {
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // Explicitly target Amazon domains based on manifest host permissions
    const amazonDomains = [
        "amazon.com", "amazon.ca", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.it", 
        "amazon.es", "amazon.nl", "amazon.se", "amazon.com.be", "amazon.com.au", "amazon.sg", 
        "amazon.ae", "amazon.sa", "amazon.eg", "amazon.in", "amazon.co.jp", "amazon.com.mx", 
        "amazon.com.tr", "vendorcentral.amazon.com", "vendorcentral.amazon.co.uk", 
        "vendorcentral.amazon.com.au"
    ];

    const rule = {
        id: UA_RULE_ID,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "User-Agent", operation: "set", value: randomUA }
            ]
        },
        condition: {
            requestDomains: amazonDomains,
            resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"]
        }
    };

    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [UA_RULE_ID],
            addRules: [rule]
        });
        // console.log("User Agent set to:", randomUA); // Debugging
    } catch (e) {
        console.error("Failed to set User Agent rule:", e);
    }
}

async function removeUserAgentRule() {
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [UA_RULE_ID]
        });
    } catch (e) {
        console.error("Failed to remove User Agent rule:", e);
    }
}

// --- Proxy Handling ---

async function setRandomProxy() {
    if (!proxyConfig || !proxyConfig.enabled || !proxyConfig.proxies || proxyConfig.proxies.length === 0) {
        // No proxy configured, use direct
        await clearProxy();
        return;
    }

    // Select random proxy
    const randomProxy = proxyConfig.proxies[Math.floor(Math.random() * proxyConfig.proxies.length)];
    activeProxy = randomProxy;

    // Remove old auth rule if exists
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [PROXY_AUTH_RULE_ID]
    });

    // If auth required, set DNR rule for Proxy-Authorization
    if (activeProxy.username && activeProxy.password) {
        const credentials = btoa(`${activeProxy.username}:${activeProxy.password}`);
        const authRule = {
            id: PROXY_AUTH_RULE_ID,
            priority: 1,
            action: {
                type: "modifyHeaders",
                requestHeaders: [
                    { header: "Proxy-Authorization", operation: "set", value: `Basic ${credentials}` }
                ]
            },
            condition: {
                urlFilter: "*", // Apply to all traffic to ensure handshake works
                resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "other"]
            }
        };

        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: [authRule]
            });
        } catch(e) {
            console.error("Failed to set Proxy Auth rule:", e);
        }
    }

    const config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: randomProxy.protocol || proxyConfig.protocol || "http",
                host: randomProxy.host,
                port: parseInt(randomProxy.port)
            },
            bypassList: ["<local>"]
        }
    };

    try {
        await new Promise((resolve, reject) => {
            chrome.proxy.settings.set(
                { value: config, scope: 'regular' },
                () => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve();
                }
            );
        });
        console.log(`Proxy set to: ${randomProxy.host}:${randomProxy.port}`);
    } catch (e) {
        console.error("Failed to set proxy:", e);

    }
}

async function clearProxy() {
    activeProxy = null;
    try {
        await new Promise((resolve) => {
            chrome.proxy.settings.clear({ scope: 'regular' }, resolve);
        });
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [PROXY_AUTH_RULE_ID]
        });
        console.log("Proxy cleared (Direct connection restored).");
    } catch (e) {
        console.error("Failed to clear proxy:", e);
    }
}

// --- Event Listeners ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_SCAN') {
    startScan(request.payload).then(() => sendResponse({ status: 'started' }));
    return true;
  } 
  else if (request.action === 'STOP_SCAN') {
    stopScan().then(() => sendResponse({ status: 'stopped' }));
    return true;
  }
  else if (request.action === 'CLEAR_DATA') {
    clearData(request.mode).then(() => sendResponse({ status: 'cleared' }));
    return true;
  }
  else if (request.action === 'LOG_ERROR') {

      return true;
  }
  else if (request.action === 'PROXY_CONFIG_UPDATED') {
      // Reload config from storage
      chrome.storage.local.get(['proxyConfig'], (data) => {
          if (data.proxyConfig) {
              proxyConfig = data.proxyConfig;
              console.log("Proxy config reloaded.");
          } else {
              proxyConfig = null;
              clearProxy(); // If cleared, disable immediately
          }
      });
      return true;
  }
  else if (request.action === 'ACTION_START_RPA') {
      const payload = request.payload;
      const asin = payload.asin;

      // Store the payload so the content script can retrieve it later
      chrome.storage.local.set({ rpaPayload: payload }, () => {
          // Construct the Seller Central Inventory Edit URL for the given ASIN.
          // Note: Seller Central URLs can vary by region. We default to the US.
          const scUrl = `https://sellercentral.amazon.com/inventory/edit?asin=${asin}`;
          chrome.tabs.create({ url: scUrl }, (tab) => {
              sendResponse({ status: 'rpa_started', tabId: tab.id });
          });
      });

      return true;
  }
});

// Global Map for Observer Resolvers
const pageReadyResolvers = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'PAGE_READY_SIGNAL' && sender.tab) {
        const resolve = pageReadyResolvers.get(sender.tab.id);
        if (resolve) {
            resolve(message.payload);
            // We delete from map in the resolver function to avoid race conditions,
            // but deleting here is also fine as long as we handle it.
            // Ideally, let the resolver handle cleanup.
        }
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Check both states
  const data = await chrome.storage.local.get(['scraperState', 'auditorState']);
  
  if (data.scraperState && data.scraperState.isScanning) {
      if (alarm.name === 'QUEUE_PROCESS' || alarm.name === 'WATCHDOG') {
          // If watchdog triggered, maybe we are stuck. Force a run.
          if (alarm.name === 'WATCHDOG') console.log("Watchdog triggered for Scraper. Running processBatch to ensure we are not stuck.");
          await processBatch(data.scraperState, 'scraperState');
      }
  } else if (data.auditorState && data.auditorState.isScanning) {
      if (alarm.name === 'QUEUE_PROCESS' || alarm.name === 'WATCHDOG') {
          if (alarm.name === 'WATCHDOG') console.log("Watchdog triggered for Auditor. Running processBatch to ensure we are not stuck.");
          await processBatch(data.auditorState, 'auditorState');
      }
  }
});

// --- Core Functions ---

async function startScan(payload) {
  const { urls, mode, settings, targetWindowId } = payload;
  cachedIsScanning = true; // Immediate update
  
  // Check UA Rotation Setting
  const data = await chrome.storage.local.get(['uaRotationEnabled']);
  const uaEnabled = data.uaRotationEnabled === true; // Default false if undefined

  // Set Random User Agent at start if enabled
  if (uaEnabled) {
      await setRandomUserAgent();
  } else {
      await removeUserAgentRule(); // Ensure clean state
  }

  // Set Initial Proxy if configured
  if (proxyConfig && proxyConfig.enabled) {
      await setRandomProxy();
  } else {
      await clearProxy(); // Ensure clean state
  }

  const stateKey = (mode === 'catalogue') ? 'auditorState' : 'scraperState';

  // --- AUDITOR MODE LOGIC ---
  if (mode === 'catalogue') {
      // Determine if we need dual scraping (Portal + Live)
      const usePortal = (settings.imageSource === 'vc' || settings.imageSource === 'sc');
      
      if (usePortal) {
          // New Logic: Dual Scrape via auditSingleAsin pipeline
          // We convert the input list to a format processed by the standard batch loop
          // But with a flag to fetch the secondary URL
          
          // Get Catalogue Default Domain for URL construction
          const catDef = settings.catalogueDefaults || {};
          let baseUrlRoot = "https://www.amazon.com/dp/";
          let langSuffix = "";

          if (catDef.marketplace) {
              const host = catDef.marketplace.toLowerCase();
              baseUrlRoot = `https://www.${host}/dp/`;
              
              // Apply Language Suffix if English requested (default is true/english)
              if (catDef.langPref === 'english') {
                  // Find suffix match
                  // Normalize keys: Amazon.com -> amazon.com
                  const key = Object.keys(marketplaceData).find(k => k.toLowerCase() === host);
                  if (key) langSuffix = marketplaceData[key].suffix;
              }
          }

          const expandedUrls = urls.map(u => {
              const asin = (typeof u === 'string') ? getAsinFromUrl(u) : (u.id || getAsinFromUrl(u.url));
              // Preserve original object structure if possible
              const item = (typeof u === 'object') ? { ...u } : { url: u };
              
              if (!item.url && asin !== 'none') {
                  item.url = `${baseUrlRoot}${asin}${langSuffix}`; // Use Catalogue Default URL + Lang
              }
              
              item.asin = asin;
              item.fetchPortalImages = true;
              item.portalType = settings.imageSource; // 'vc' or 'sc'
              
              return item;
          });

          const newState = {
            ...INITIAL_STATE,
            isScanning: true,
            mode,
            urlsToProcess: expandedUrls,
            settings,
            processedCount: 0,
            statusMessage: "Initializing Portal Auditor...",
            targetWindowId,
            startTime: Date.now(),
            endTime: null
          };
          
          await chrome.storage.local.set({ [stateKey]: newState });
          createAlarm('QUEUE_PROCESS', 100);
          chrome.alarms.create('WATCHDOG', { periodInMinutes: 1 });
          return;

      } else {
          // Catalogue Mode (Excel Source)
          const catDef = settings.catalogueDefaults || {};
          let baseUrlRoot = "https://www.amazon.com/dp/";
          let langSuffix = "";

          if (catDef.marketplace) {
              const host = catDef.marketplace.toLowerCase();
              baseUrlRoot = `https://www.${host}/dp/`;
              
              if (catDef.langPref === 'english') {
                  const key = Object.keys(marketplaceData).find(k => k.toLowerCase() === host);
                  if (key) langSuffix = marketplaceData[key].suffix;
              }
          }

          const processedUrls = urls.map(u => {
              // Ensure URL exists if only ASIN provided
              if (!u.url && u.id && u.id !== 'none') {
                  return { ...u, url: `${baseUrlRoot}${u.id}${langSuffix}` };
              }
              return u;
          });
          
          const newState = {
            ...INITIAL_STATE,
            isScanning: true,
            mode,
            urlsToProcess: processedUrls, // These objects have comparisonData
            settings,
            processedCount: 0,
            statusMessage: "Initializing Catalogue Audit...",
            targetWindowId,
            startTime: Date.now(),
            endTime: null
          };
          await chrome.storage.local.set({ [stateKey]: newState });
          createAlarm('QUEUE_PROCESS', 100);
          chrome.alarms.create('WATCHDOG', { periodInMinutes: 1 });
          return;
      }
  }

  // --- STANDARD SCRAPER LOGIC ---

  const newState = {
    ...INITIAL_STATE,
    isScanning: true,
    mode,
    urlsToProcess: urls,
    settings,
    processedCount: 0,
    statusMessage: "Initializing...",
    targetWindowId,
    startTime: Date.now(),
    endTime: null
  };

  await chrome.storage.local.set({ [stateKey]: newState });

  // DNR Logic (Simplified: Enable/Disable Rules based on settings)
  if (settings.disableImages) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: ["ruleset_1"]
      });
  } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
          disableRulesetIds: ["ruleset_1"]
      });
  }

  // Set initial alarms
  createAlarm('QUEUE_PROCESS', 100);
  chrome.alarms.create('WATCHDOG', { periodInMinutes: 1 });
}

async function stopScan() {
  cachedIsScanning = false; // Immediate update
  await chrome.alarms.clearAll();

  // Remove UA Rule
  await removeUserAgentRule();
  
  // Clear Proxy (Important!)
  await clearProxy();

  // Aggressively close all active tabs
  if (activeProcessingTabs.size > 0) {
      const tabsToClose = Array.from(activeProcessingTabs);
      // Execute without blocking to guarantee we exit immediately
      chrome.tabs.remove(tabsToClose).catch(() => {});
      activeProcessingTabs.clear();
  }
  
  // Resolve any pending page ready resolvers so they don't block
  for (let [tabId, resolver] of pageReadyResolvers.entries()) {
      resolver({ error: "scan_stopped" });
  }
  pageReadyResolvers.clear();

  const data = await chrome.storage.local.get(['scraperState', 'auditorState']);
  
  // Stop both just in case
  const update = {};
  if (data.scraperState && data.scraperState.isScanning) {
      data.scraperState.isScanning = false;
      data.scraperState.statusMessage = "Stopped by user.";
      data.scraperState.endTime = Date.now();
      update.scraperState = data.scraperState;
  }
  if (data.auditorState && data.auditorState.isScanning) {
      data.auditorState.isScanning = false;
      data.auditorState.statusMessage = "Stopped by user.";
      data.auditorState.endTime = Date.now();
      update.auditorState = data.auditorState;
  }

  if (Object.keys(update).length > 0) {
      await chrome.storage.local.set(update);
  }

  // Reset DNR rules if unsure (safest is to disable blocking if no scan running)
  await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: ["ruleset_1"]
  });
}

async function clearData(mode) {
  cachedIsScanning = false;
  // Ensure UA rule is removed
  await removeUserAgentRule();
  // Ensure Proxy is cleared
  await clearProxy();

  // Determine key based on mode: 'bulk' -> scraperState, 'catalogue' -> auditorState
  // Or if passed explicitly 'scraper' / 'auditor' (from UI mega mode value)
  // UI passes 'scraper' or 'auditor' from MEGA_MODE variable
  
  const stateKey = (mode === 'auditor' || mode === 'catalogue') ? 'auditorState' : 'scraperState';
  
  const data = await chrome.storage.local.get(stateKey);
  let currentState = data[stateKey] || { ...INITIAL_STATE };

  const clearedState = {
    ...currentState,
    isScanning: false,
    urlsToProcess: [],
    results: [],
    processedCount: 0,
    statusMessage: "Results cleared. Ready.",
    nextActionTime: null,
    startTime: null,
    endTime: null
  };

  await chrome.storage.local.set({ [stateKey]: clearedState });
}

function getAsinFromUrl(url) {
    if(!url) return "none";
    const match = url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : "none";
}

// --- BATCH PROCESSOR ---

async function isScanActive() {
    return cachedIsScanning;
}

// Ensure we don't start a new batch if one is already processing
let isBatchProcessing = false;

async function processBatch(state, stateKey) {
    if (!state.isScanning) return;
    if (!(await isScanActive())) return;
    if (isBatchProcessing) {
        console.log("processBatch called but a batch is already processing. Exiting.");
        return;
    }

    isBatchProcessing = true;

    // Check UA Rotation Setting
    const data = await chrome.storage.local.get(['uaRotationEnabled']);
    const uaEnabled = data.uaRotationEnabled === true;

    // Rotate User Agent for this batch
    if (uaEnabled) {
        await setRandomUserAgent();
    }

    // Rotate Proxy for this batch (if configured)
    if (proxyConfig && proxyConfig.enabled) {
        await setRandomProxy();
    }

    const total = state.urlsToProcess.length;
    const startIdx = state.processedCount;

    // Check if finished
    if (startIdx >= total) {
        await finishScan(state, stateKey);
        return;
    }

    // --- Determine Batch Size & Mono-Domain Constraint ---
    // Look ahead to find max batch size that shares the same domain
    let tentativeBatchSize = 5;
    if (state.settings && state.settings.batchMode === 'fixed') {
        tentativeBatchSize = state.settings.batchSize;
    } else {
        const maxBatch = state.settings.batchSize || 5;
        const minBatch = Math.max(1, Math.floor(maxBatch / 2)); // Dynamic min based on user size
        tentativeBatchSize = Math.floor(Math.random() * (maxBatch - minBatch + 1)) + minBatch;
    }
    
    // Get Domain of the FIRST item in the batch
    const getDomain = (item) => {
        const u = (typeof item === 'string') ? item : (item.url || item);
        try {
            const hostname = new URL(u).hostname;
            // Return root domain (e.g. amazon.com, amazon.co.uk)
            return hostname.replace(/^www\./, '');
        } catch(e) { return null; }
    };

    const batchStartDomain = getDomain(state.urlsToProcess[startIdx]);
    
    let actualBatchSize = 0;
    for (let i = 0; i < tentativeBatchSize; i++) {
        if (startIdx + i >= total) break;
        const itemDomain = getDomain(state.urlsToProcess[startIdx + i]);
        if (itemDomain !== batchStartDomain) break; // Stop if domain changes
        actualBatchSize++;
    }

    const endIdx = startIdx + actualBatchSize;
    const chunk = state.urlsToProcess.slice(startIdx, endIdx);

    // --- Domain Switching & Location Setup ---
    // If current domain in state differs from this batch's domain, run setup
    // We try to match "Amazon.com" format from settings map keys if possible, or just use hostname
    // Settings keys are like "Amazon.com", hostname is "amazon.com".
    
    // Normalize hostname to Key format (Capitalize first letter)
    let domainKey = batchStartDomain; 
    if (domainKey && domainKey.startsWith('amazon')) {
        domainKey = domainKey.charAt(0).toUpperCase() + domainKey.slice(1);
    }

    // Lookahead for Next Domain
    let nextDomain = "-";
    if (endIdx < total) {
        const nextItemStart = state.urlsToProcess[endIdx];
        const nextD = getDomain(nextItemStart);
        if (nextD) {
            nextDomain = nextD.startsWith('amazon') ? nextD.charAt(0).toUpperCase() + nextD.slice(1) : nextD;
        }
    }

    // Update Agent Status
    state.agentStatus = {
        action: "Preparing Batch",
        currentDomain: domainKey || "Amazon.com",
        nextDomain: nextDomain,
        batchSize: chunk.length,
        nextBatchIn: 0
    };

    // Use Catalogue Default if available
    let enforcedZip = null;
    if (state.mode === 'catalogue' && state.settings.catalogueDefaults) {
        const def = state.settings.catalogueDefaults;
        let defMarket = def.marketplace || "";
        if (defMarket.startsWith("www.")) defMarket = defMarket.substring(4);
        if (defMarket.length > 0) defMarket = defMarket.charAt(0).toUpperCase() + defMarket.slice(1);
        
        if (domainKey === defMarket) {
            enforcedZip = def.zipcode;
        }
    }

    if (domainKey && state.currentDomain !== domainKey) {
        // Domain Changed!
        state.currentDomain = domainKey;
        
        // Find Zip for this domain
        const zipMap = state.settings.domainZipMap || {};
        const targetZip = enforcedZip || zipMap[domainKey] || state.settings.zipcode; // Fallback to global if map fails

        if (targetZip) {
            state.statusMessage = `Switching to ${domainKey}...`;
            state.agentStatus.action = `Setting Location for ${domainKey}`;
            await chrome.storage.local.set({ [stateKey]: state });

            // Run Setup
            const setupSuccess = await processLocationSetup(state, domainKey, targetZip);
            if (setupSuccess) {
                state.statusMessage = `Location set for ${domainKey}.`;
            } else {
                state.statusMessage = `Location setup failed for ${domainKey}.`;
            }
            await chrome.storage.local.set({ [stateKey]: state });
            
            // Do not return here. Let it fall through to process the batch immediately.
        } else {
            // No zip for this domain, just update state and proceed
            await chrome.storage.local.set({ [stateKey]: state });
        }
    }

    state.statusMessage = `Processing ${startIdx + 1} - ${endIdx} of ${total}`;
    state.agentStatus.action = "Scraping Batch...";
    await chrome.storage.local.set({ [stateKey]: state });

    // Issue 3: Reduced Blocking Wait (Dynamic)
    // Reduce wait to 1-3s for better throughput
    const waitA = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
    await new Promise(r => setTimeout(r, waitA));

    if (!(await isScanActive())) return;

    // Track tabs created in this specific batch to ensure they are all closed
    const batchTabIds = [];

    // Helper to create tabs and track them for cleanup
    const trackCreateTab = async (url) => {
        try {
            const createProps = { url: url, active: false };
            if (state.targetWindowId) createProps.windowId = state.targetWindowId;
            
            const tab = await chrome.tabs.create(createProps);
            if (tab) {
                batchTabIds.push(tab.id);
                activeProcessingTabs.add(tab.id); // Add to global set
            }
            return tab;
        } catch (e) {
            console.error("Tab Create Error:", e);
            // Self-Healing: If window is missing/closed, create a new window
            if (e.message.includes("No window with id") || e.message.includes("Invalid window")) {
                try {
                    console.log("Recovering from closed window...");
                    const win = await chrome.windows.create({ url: url, focused: false });
                    if (win && win.tabs.length > 0) {
                        // Update state with new window ID for next tabs
                        state.targetWindowId = win.id;
                        await chrome.storage.local.set({ [stateKey]: state });

                        const newTab = win.tabs[0];
                        batchTabIds.push(newTab.id);
                        return newTab;
                    }
                } catch(recErr) {
                    console.error("Recovery Failed:", recErr);

                }
            }
            return null;
        }
    };

    try {
        // Parallel execution of the current batch
        // We map the chunk items to auditSingleAsin promises
        if (!(await isScanActive())) return;
        const chunkPromises = chunk.map(item => auditSingleAsin(item, state, trackCreateTab));
        const chunkResults = await Promise.all(chunkPromises);

        if (!(await isScanActive())) return;

        // --- SEQUENTIAL AOD SCROLL PHASE ---
        for (const res of chunkResults) {
            if (res && res.needsAODScroll && res.tabId) {
                try {
                    console.log(`Starting sequential AOD scroll for tab ${res.tabId}`);
                    // Activate Tab
                    await chrome.tabs.update(res.tabId, { active: true });
                    const tabData = await chrome.tabs.get(res.tabId);
                    if (tabData && tabData.windowId) {
                        await chrome.windows.update(tabData.windowId, { focused: true, state: "maximized" });
                        // Brief wait to allow the OS/browser to physically bring the window to the foreground
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    // Send Message & Wait for Scroll to finish
                    const scrollResponse = await new Promise((resolve) => {
                        const expected = res.attributes ? parseInt(res.attributes.aodTotalOfferCount) || 0 : 0;
                        chrome.tabs.sendMessage(res.tabId, { action: 'PERFORM_AOD_SCROLL', expectedOffers: expected }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.log("AOD Sequential Scroll messaging error:", chrome.runtime.lastError.message);
                                resolve({ success: false, data: [] });
                            } else {
                                resolve(response || { success: false, data: [] });
                            }
                        });
                    });

                    if (scrollResponse.success && scrollResponse.data) {
                        // Merge the scrolled AOD data back into the result
                        if (res.attributes) {
                            res.attributes.aodData = scrollResponse.data;
                            res.attributes.aodTotalOfferCount = scrollResponse.totalOffers !== undefined ? scrollResponse.totalOffers : "none";

                            // --- AOD Amazon Filter Logic (Moved here because aodData is now populated) ---
                            if (state.settings && state.settings.scrapeAOD && res.attributes.aodData) {
                                const url = res.url || "";
                                const domainMatch = url.match(/amazon\.([a-z\.]+)\//);
                                const domain = domainMatch ? domainMatch[1] : "com";
                                let marketplace = res.attributes.marketplace || "Amazon.com";
                                if (marketplace.startsWith("www.")) marketplace = marketplace.substring(4); 

                                if (marketplace.length > 0) {
                                    marketplace = marketplace.charAt(0).toUpperCase() + marketplace.slice(1);
                                }

                                const amazonOffer = filterAmazonAODOffer(res.attributes.aodData, marketplace);

                                if (amazonOffer) {
                                    res.attributes.AOD_amazon_price = amazonOffer.price;
                                    res.attributes.AOD_amazon_basePrice = amazonOffer.aodBasePrice || "none";
                                    res.attributes.AOD_amazon_shipsFrom = amazonOffer.shipsFrom;
                                    res.attributes.AOD_amazon_soldBy = amazonOffer.soldBy;
                                    res.attributes.AOD_amazon_deliveryDate = amazonOffer.sellerDeliveryTime;
                                } else {
                                    res.attributes.AOD_amazon_price = "none";
                                    res.attributes.AOD_amazon_basePrice = "none";
                                    res.attributes.AOD_amazon_shipsFrom = "none";
                                    res.attributes.AOD_amazon_soldBy = "none";
                                    res.attributes.AOD_amazon_deliveryDate = "none";
                                }
                            }
                        }
                    }

                    console.log(`Finished sequential AOD scroll for tab ${res.tabId}`);
                } catch (scrollErr) {
                    console.error("AOD Sequential Scroll execution error", scrollErr);
                } finally {
                    // We can now close this tab safely
                    chrome.tabs.remove(res.tabId).catch(() => {});
                    activeProcessingTabs.delete(res.tabId);
                }
            }
        }

        if (!(await isScanActive())) return;

        // Clean up tabId and needsAODScroll flags before saving
        for (const res of chunkResults) {
            if (res) {
                delete res.tabId;
                delete res.needsAODScroll;
                if (res.attributes) delete res.attributes.needsAODScroll;
            }
        }

        // Wait B: Random wait after processing/grabbing data (1-3s)
        // If last batch, skip wait (Task Requirement)
        if (endIdx < total) {
            const waitB = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
            await new Promise(r => setTimeout(r, waitB));
        }

        if (!(await isScanActive())) return;

        // Update State with Results
        state.results.push(...chunkResults);
        state.processedCount += chunkResults.length;

        await chrome.storage.local.set({ [stateKey]: state });

    } catch (err) {
        console.error("Batch Error:", err);

    } finally {
        // MANDATORY CLEANUP: Close any tabs from this batch that might still be open
        if (batchTabIds.length > 0) {
            try {
                const currentTabs = await chrome.tabs.query({}); // Get all tabs to check existence
                const existingIds = batchTabIds.filter(id => currentTabs.some(t => t.id === id));
                if (existingIds.length > 0) {
                    await chrome.tabs.remove(existingIds).catch(() => {});
                    existingIds.forEach(id => activeProcessingTabs.delete(id)); // Remove from global set
                }
            } catch (e) {
                // Tabs might already be closed, which is fine
            }
        }

        // Check if finished immediately
        if (state.isScanning) {
             if (state.processedCount >= state.urlsToProcess.length) {
                 await finishScan(state, stateKey);
             } else {
                 // Schedule next batch with configured Delay or Random Delay (2-5s) to improve throughput
                 let nextDelay = 0;
                 if (state.settings && state.settings.batchWait) {
                     const maxDelayMs = state.settings.batchWait * 1000;
                     if (state.settings.batchMode === 'fixed') {
                         nextDelay = maxDelayMs; // Fixed exact wait
                     } else {
                         // Random mode: anywhere from half wait to max wait to appear human
                         const minDelayMs = Math.max(2000, Math.floor(maxDelayMs / 2));
                         nextDelay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
                     }
                 } else {
                     nextDelay = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000; // Fallback
                 }

                 
                 // Update Agent Status for Wait
                 state.agentStatus.action = "Waiting for next batch...";
                 state.agentStatus.nextBatchIn = Date.now() + nextDelay;
                 state.nextActionTime = Date.now() + nextDelay; // Legacy field sync
                 await chrome.storage.local.set({ [stateKey]: state });

                 createAlarm('QUEUE_PROCESS', nextDelay);
             }
        }
        
        isBatchProcessing = false;
    }
}

// --- Single Item Audit Logic ---

async function auditSingleAsin(item, state, trackCreateTab) {
    // Determine URL and Metadata
    let url = (typeof item === 'string') ? item : (item.url || item);
    let isVC = false;
    let comparisonData = null;
    let itemId = null;
    let originalItem = item;

    if (typeof item === 'object') {
        if (item.type === 'vc') isVC = true;
        // Legacy Vendor Logic
        else if (state.mode === 'vendor' && item.asin && item.sku && item.vendorCode) {
            isVC = true;
            url = `https://vendorcentral.amazon.com/abis/listing/edit?sku=${item.sku}&asin=${item.asin}&vendorCode=${item.vendorCode}`;
        }
        comparisonData = item.comparisonData;
        itemId = item.id;
    }

    // Check if stopped before creating tab
    if (!(await isScanActive())) return { error: "scan_stopped", url: url };

    // 1. Create Tab
    const tab = await trackCreateTab(url);
    if (!tab) return { error: "tab_create_failed", url: url };

    try {
        if (!(await isScanActive())) { chrome.tabs.remove(tab.id).catch(()=>{}); return { error: "scan_stopped", url: url }; }

        // 2. Wait for Load
        // SMART WAIT IMPLEMENTATION
        if (!isVC) {
            const readySignal = await waitForPageReady(tab.id);
            if (readySignal.status === 'timeout') {
                console.warn(`SmartWait Timeout for ${url}`);
            } else if (readySignal.status === 'error') {
                if (readySignal.type === 'CAPTCHA') return { error: "CAPTCHA_DETECTED", url: url };
                if (readySignal.type === '404') return { error: "PAGE_NOT_FOUND_404", url: url };
            }
        } else {
            // Legacy Logic for Vendor Central
            await waitForTabLoad(tab.id);
            const waitC = Math.floor(Math.random() * (10000 - 3000 + 1)) + 3000;
            await new Promise(r => setTimeout(r, waitC));
        }

        if (!(await isScanActive())) { chrome.tabs.remove(tab.id).catch(()=>{}); return { error: "scan_stopped", url: url }; }

        // 3. Inject Flags (AOD, etc) if needed
        if (state.settings && state.settings.scrapeAOD && !isVC) {
            const strategy = state.settings.aodStrategy || 'all';
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (strat) => {
                    window.SHOULD_SCRAPE_AOD = true;
                    window.AOD_STRATEGY = strat;
                },
                args: [strategy]
            }).catch(() => {}); // Ignore error if injection fails (e.g. closed tab)
        }

        if (!(await isScanActive())) { chrome.tabs.remove(tab.id).catch(()=>{}); return { error: "scan_stopped", url: url }; }

        // 4. Extract Data
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Wait D: Post-extraction settlement (1-2s)
        await new Promise(r => setTimeout(r, 3000));

        // We DO NOT close the tab here if AOD needs scrolling
        // It will be closed later by the batch cleanup if it needed AOD scrolling
        let needsAODScroll = false;
        if (result && result.result && result.result.attributes && result.result.attributes.needsAODScroll) {
            needsAODScroll = true;
        }

        if (!needsAODScroll) {
            chrome.tabs.remove(tab.id).catch(() => {}); 
            activeProcessingTabs.delete(tab.id);
        }

        if (result && result.result) {
            const res = result.result;

            if (res.error === "CAPTCHA_DETECTED") {
                if (needsAODScroll) {
                    chrome.tabs.remove(tab.id).catch(() => {}); 
                    activeProcessingTabs.delete(tab.id);
                }
                return { error: "CAPTCHA_DETECTED", url: url };
            }

            // Attach Metadata
            res.isVC = isVC;
            res.comparisonData = comparisonData;
            res.id = itemId;
            res.tabId = tab.id; // Store tabId for AOD scroll phase
            res.needsAODScroll = needsAODScroll; // Flag for AOD sequential scroll

            if (isVC) {
                if (originalItem && originalItem.asin && !originalItem.id) {
                    res.vcData = originalItem;
                }
            } else {
                res.queryASIN = getAsinFromUrl(url);
                if (originalItem.expected) res.expected = originalItem.expected;

                // --- PORTAL IMAGE FETCH (VC/SC) ---
                if (originalItem.fetchPortalImages && originalItem.portalType && originalItem.asin) {
                    try {
                        const marketplace = res.attributes.marketplace || "Amazon.com";
                        // Get correct domain for VC/SC
                        const portalDomain = getPortalDomain(originalItem.portalType, marketplace);
                        let portalUrl = "";
                        
                        if (originalItem.portalType === 'vc') {
                            portalUrl = `https://${portalDomain}/imaging/manage?asins=${originalItem.asin}`;
                        } else {
                            portalUrl = `https://${portalDomain}/imaging/manage?asins=${originalItem.asin}`;
                        }

                        // Open Secondary Tab
                        const pTab = await trackCreateTab(portalUrl);
                        await waitForTabLoad(pTab.id);
                        await new Promise(r => setTimeout(r, 3000)); // Wait for render

                        // Extract Images using content.js (it has VC scraping logic)
                        const [pResult] = await chrome.scripting.executeScript({
                            target: { tabId: pTab.id },
                            files: ['content.js']
                        });

                        await chrome.tabs.remove(pTab.id).catch(()=>{});
                        activeProcessingTabs.delete(pTab.id);

                        if (pResult && pResult.result && pResult.result.images) {
                            // Attach these images as the "Source" for comparison
                            if (!res.comparisonData) res.comparisonData = {};
                            res.comparisonData.expected_images = pResult.result.images; // Array of objects
                        } else {
                            console.warn("Portal Image Fetch Failed or Empty", portalUrl);
                        }

                    } catch(portalErr) {
                        console.error("Portal Fetch Error", portalErr);
                    }
                }

            }

            if (res.error && !res.url) res.url = url;

            // Log Page Not Found errors
            if (res.error === "PAGE_NOT_FOUND_404") {
                console.log("Background detected 404 for:", url);

            }

            return res;
        }

        return { error: "no_result", url: url, queryASIN: getAsinFromUrl(url) };

    } catch (e) {
        // Attempt to close tab if crash occurred

        chrome.tabs.remove(tab.id).catch(() => {}); 
        activeProcessingTabs.delete(tab.id); // Remove from global set
        return { error: "extraction_crash", url: url, details: e.toString() };
    }
}

function waitForTabLoad(tabId, timeoutMs = 300000) {
    return new Promise((resolve) => {
        let isResolved = false;
        
        const cleanup = () => {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.onRemoved.removeListener(removeListener);
                clearInterval(checkInterval);
            }
        };

        const timeout = setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);

        const listener = (tid, changeInfo, tab) => {
            if (tid === tabId && changeInfo.status === 'complete') {
                cleanup();
                resolve();
            }
        };
        
        const removeListener = (tid) => {
            if (tid === tabId) {
                cleanup();
                resolve({ error: "tab_closed" });
            }
        };

        // Aggressively check scan status
        const checkInterval = setInterval(() => {
            if (!cachedIsScanning) {
                cleanup();
                resolve({ error: "scan_stopped" });
            }
        }, 500);

        chrome.tabs.onUpdated.addListener(listener);
        chrome.tabs.onRemoved.addListener(removeListener);
    });
}

function waitForPageReady(tabId) {
    return new Promise((resolve) => {
        let isResolved = false;

        // Helper to cleanup and resolve
        const safeResolve = (val) => {
            if (!isResolved) {
                isResolved = true;
                pageReadyResolvers.delete(tabId);
                chrome.tabs.onUpdated.removeListener(injectorListener);
                chrome.tabs.onRemoved.removeListener(removeListener);
                clearInterval(checkInterval);
                clearTimeout(timeout);
                resolve(val);
            }
        };

        // 1. Setup Timeout (Matches Observer 30s + safety buffer)
        // Increased to 300s (5 mins) to ensure we don't kill tabs while AOD is still scrolling
        const timeout = setTimeout(() => {
            safeResolve({ status: 'timeout' });
        }, 300000);

        // 2. Register Global Resolver
        pageReadyResolvers.set(tabId, safeResolve);

        // 3. Injector Strategy
        const inject = () => {
             chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['observer.js']
            }).catch(() => {
                // If injection fails, it might be due to host permissions or tab closed.
                // We rely on retries via onUpdated or timeout.
            });
        };

        const injectorListener = (tid, changeInfo, tab) => {
            if (tid === tabId) {
                // Inject on loading (earliest interaction) AND complete (fallback)
                if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
                    inject();
                }
            }
        };

        const removeListener = (tid) => {
            if (tid === tabId) safeResolve({ error: "tab_closed" });
        };
        
        const checkInterval = setInterval(() => {
            if (!cachedIsScanning) safeResolve({ error: "scan_stopped" });
        }, 500);

        chrome.tabs.onUpdated.addListener(injectorListener);
        chrome.tabs.onRemoved.addListener(removeListener);

        // Try immediately
        inject();
    });
}

async function finishScan(state, stateKey) {
  state.isScanning = false;
  cachedIsScanning = false;
  state.statusMessage = "Scan complete.";
  state.nextActionTime = null;
  state.locationVerified = false; // Reset for next time
  state.endTime = Date.now();

  // Remove UA rule when finished
  await removeUserAgentRule();
  // Clear Proxy
  await clearProxy();

  await chrome.storage.local.set({ [stateKey]: state });

  // Notify frontend to update Catalogue status if applicable
  try {
      chrome.runtime.sendMessage({
          action: 'SCAN_COMPLETE',
          mode: state.mode,
          results: state.results
      }).catch(() => {}); // Ignore if no listener (e.g. sidepanel closed)
  } catch(e) {}

  if (state.settings.disableImages) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ["ruleset_1"]
    });
  }
}

function createAlarm(name, delayMs) {
  chrome.alarms.create(name, { when: Date.now() + delayMs });
}

async function processLocationSetup(state, domainKey, targetZip) {
    if (!targetZip) return true;

    // Construct Root URL for the specific domain
    let rootUrl = `https://www.${domainKey.toLowerCase()}/`; 
    
    let tab = null;
    try {
        const createProps = { url: rootUrl, active: false };
        if (state.targetWindowId) createProps.windowId = state.targetWindowId;
        tab = await chrome.tabs.create(createProps);

        // Reduced timeout for Location Setup (45s) to prevent "Opening batch stuck"
        await waitForTabLoad(tab.id, 45000);
        await new Promise(r => setTimeout(r, 3000)); // Wait for render

        // Inject Location Setter with Timeout wrapper to prevent hanging
        const injectPromise = chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: setLocation,
            args: [targetZip]
        });

        // Hard timeout on the location setup script (40 seconds max)
        const timeoutPromise = new Promise((resolve, reject) => {
            setTimeout(() => { reject(new Error("setLocation script timed out")); }, 40000);
        });

        let result = null;
        try {
            const results = await Promise.race([injectPromise, timeoutPromise]);
            result = results && results[0];
        } catch (injectionError) {
            console.error("Location script injection or timeout error:", injectionError);
        }

        // Remove extra wait so the first batch starts immediately

        await chrome.tabs.remove(tab.id).catch(()=>{});
        return true;

    } catch(e) {
        console.error("Location Setup Error:", e);

        if (tab) await chrome.tabs.remove(tab.id).catch(()=>{});
        return false;
    }
}

// This function is serialized and injected into the content page
async function setLocation(zip) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const domain = window.location.hostname;

    try {
        // --- NEW: Captcha / Continue Shopping Handler ---
        // Selector: form[action*="validateCaptcha"]
        const captchaForm = document.querySelector('form[action*="validateCaptcha"]');
        if (captchaForm) {
            console.log("Captcha Form Detected. Attempting bypass...");
            const submitBtn = captchaForm.querySelector('button, input[type="submit"], input[type="image"]');
            if (submitBtn) {
                // Click up to 5 times
                for (let i = 0; i < 5; i++) {
                    submitBtn.click();
                    await sleep(200); // Rapid clicks
                }
                // Force reload
                window.location.reload();
                // Return true to signal "handled" (though reload might kill script)
                // If script survives (unlikely), background will just timeout or see reload.
                return true; 
            }
        }

        // --- NEW: Cookie Consent Handler ---
        // Selector: input[id="sp-cc-accept"]
        const cookieAccept = document.querySelector('input[id="sp-cc-accept"]');
        if (cookieAccept) {
            console.log("Accepting Cookies...");
            cookieAccept.click();
            await sleep(1000); // Wait for potential reload or overlay close
        }

        // Task 1: Dismiss Toasters (PDP check)
        try {
            const toasterDismiss = document.querySelector('span[class*="glow-toaster-button-dismiss"] input') ||
                                   document.querySelector('input[data-action-type="DISMISS"][type="submit"]');
            if (toasterDismiss) {
                toasterDismiss.click();
                await sleep(500);
            }
        } catch(e) {}

        // 1. Check current location
        const currentLocEl = document.getElementById("nav-global-location-popover-link");
        if (currentLocEl && currentLocEl.innerText.includes(zip)) {
            return true; // Already set
        }

        // 2. Click Widget (Try multiple selectors including UK specific fallback)
        let widget = document.querySelector('input[data-action-type="SELECT_LOCATION"][type="submit"]'); // Priority Fallback
        if (!widget) widget = document.getElementById("glow-ingress-block");
        if (!widget) widget = document.getElementById("nav-global-location-popover-link"); 

        if (!widget) return false;
        widget.click();
        await sleep(2000);

        // --- DOMAIN SPECIFIC LOGIC ---

        // Task 4: Amazon.com.au Logic
        if (domain.includes(".com.au")) {
             const input = document.getElementById("GLUXPostalCodeWithCity_PostalCodeInput");
             if (input) {
                 input.value = zip;
                 input.dispatchEvent(new Event('input', { bubbles: true }));
                 input.dispatchEvent(new Event('keydown', { bubbles: true, keyCode: 13 })); // Trigger enter if needed
                 await sleep(1000);

                 // Select City
                 const cityDropdown = document.getElementById("GLUXPostalCodeWithCity_CityValue");
                 if (cityDropdown) {
                     cityDropdown.click();
                     await sleep(500);
                     // Select first city
                     const firstCity = document.querySelector('a[id="GLUXPostalCodeWithCity_DropdownList_0"]');
                     if (firstCity) {
                         firstCity.click();
                         await sleep(500);
                     }
                 }

                 // Apply
                 const applyBtn = document.getElementById("GLUXPostalCodeWithCity_ApplyButtonLabel")?.parentElement; // Span is label, button is parent usually or sibling
                 // Selector for click:
                 const realApplyBtn = document.querySelector('input[aria-labelledby="GLUXPostalCodeWithCity_ApplyButtonLabel"]');
                 if (realApplyBtn) realApplyBtn.click();
                 else if (applyBtn) applyBtn.click();

                 await sleep(2000);
                 return true; // Assume success/reload
             }
        }

        // General Logic for remaining domains

        // Step 2 (Task 3): Change button if appears (e.g. UK/EU sometimes shows 'Change' before input)
        const changeBtn = document.querySelector('a[id*="GLUXChangePostalCodeLink"]');
        if (changeBtn) {
            changeBtn.click();
            await sleep(1000);
        }

        // 3. Find Input
        // Standard ID: GLUXZipUpdateInput
        let input = document.getElementById("GLUXZipUpdateInput");

        // Canada / Split case check (e.g. GLUXZipUpdateInput_0, GLUXZipUpdateInput_1)
        const inputs = document.querySelectorAll('input[id*="GLUXZipUpdateInput"]');

        // 4. Type Zip
        if (input) {
            // Single Box Case
            input.value = zip;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (inputs.length >= 2) {
            // Split Box Case (e.g. Canada A1A 1A1)
            const parts = zip.split(' ');
            let part1 = parts[0] || "";
            let part2 = parts[1] || "";

            // If user provided no space but we need split (e.g. K1P1J1 -> K1P 1J1)
            if (parts.length === 1 && zip.length === 6) {
                part1 = zip.substring(0, 3);
                part2 = zip.substring(3);
            }

            const input0 = document.getElementById("GLUXZipUpdateInput_0") || inputs[0];
            const input1 = document.getElementById("GLUXZipUpdateInput_1") || inputs[1];

            if (input0) {
                input0.value = part1;
                input0.dispatchEvent(new Event('input', { bubbles: true }));
                input0.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (input1) {
                input1.value = part2;
                input1.dispatchEvent(new Event('input', { bubbles: true }));
                input1.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else if (inputs.length === 1) {
            // Fallback Single Box via selector
            inputs[0].value = zip;
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        }

        await sleep(500);

        // 5. Click Apply
        let applyBtn = document.querySelector('span[id="GLUXZipUpdate"] input[type="submit"]');

        if (!applyBtn) applyBtn = document.getElementById("GLUXZipUpdate");
        if (!applyBtn) applyBtn = document.querySelector('input[aria-labelledby="GLUXZipUpdate-announce"]');
        if (!applyBtn) applyBtn = document.querySelector('span[data-action="GLUXZipUpdate"]');

        if (applyBtn) {
            applyBtn.click();
            await sleep(2000);

            // Task 5: Continue / Done Handling
            const confirmCloses = document.querySelectorAll('input[id="GLUXConfirmClose"]');
            confirmCloses.forEach(btn => {
                if (btn.offsetParent !== null) btn.click(); // Only click visible
            });
            await sleep(500);

            // Try Done
            const doneBtn = document.querySelector('button[name="glowDoneButton"]');
            if (doneBtn) doneBtn.click();

            // Generic footer buttons fallbacks
            const continueBtnGeneric = document.querySelectorAll('.a-popover-footer button');
            if (continueBtnGeneric.length > 0) {
                for (let btn of continueBtnGeneric) {
                    if (btn.innerText.includes("Done") || btn.innerText.includes("Continue")) {
                        btn.click();
                        await sleep(500);
                    }
                }
            }

            return true;
        }

        return false;
    } catch(e) {
        console.error("SetLocation Script Error", e);
        return false;
    }
}
