  import { MS_CLIENT_ID, MS_AUTH_URL, MS_SCOPES } from './config.js';

  // --- Feature: Word Diff Utility ---
  const escapeHtml = (unsafe) => {
      return (unsafe || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  };

  const generateWordDiffHtml = (expectedStr, actualStr) => {
      const eWords = (expectedStr || "").split(/\s+/).filter(Boolean);
      const aWords = (actualStr || "").split(/\s+/).filter(Boolean);

      // Basic LCS based diff (Simple O(N*M) implementation for words)
      const lcsMatrix = Array(eWords.length + 1).fill(null).map(() => Array(aWords.length + 1).fill(0));
      for (let i = 1; i <= eWords.length; i++) {
          for (let j = 1; j <= aWords.length; j++) {
              if (eWords[i - 1] === aWords[j - 1]) {
                  lcsMatrix[i][j] = lcsMatrix[i - 1][j - 1] + 1;
              } else {
                  lcsMatrix[i][j] = Math.max(lcsMatrix[i - 1][j], lcsMatrix[i][j - 1]);
              }
          }
      }

      let i = eWords.length;
      let j = aWords.length;
      const diffResult = [];

      while (i > 0 || j > 0) {
          if (i > 0 && j > 0 && eWords[i - 1] === aWords[j - 1]) {
              diffResult.push(`<span>${escapeHtml(eWords[i - 1])}</span>`);
              i--;
              j--;
          } else if (j > 0 && (i === 0 || lcsMatrix[i][j - 1] >= lcsMatrix[i - 1][j])) {
              diffResult.push(`<ins class="diff-ins">${escapeHtml(aWords[j - 1])}</ins>`);
              j--;
          } else if (i > 0 && (j === 0 || lcsMatrix[i][j - 1] < lcsMatrix[i - 1][j])) {
              diffResult.push(`<del class="diff-del">${escapeHtml(eWords[i - 1])}</del>`);
              i--;
          }
      }

      return diffResult.reverse().join(' ');
  };
  import {
      marketplaceData, ZIP_DEFAULTS, getVendorCentralDomain, buildOrNormalizeUrl,
      csvLineParser, parseAuditType2Csv, cleanAmazonUrl, cleanField,
      SCRAPING_COLUMNS, AUDIT_COLUMNS, MASTER_COLUMNS, forcedFields, fieldConfig,
      AUDIT_TEMPLATE_CONFIG, COLUMN_SAMPLES, COLUMN_RENAMES
  } from './scraperEngine.js';

  import { SheetManager } from './src/utils/SheetManager.js';
  
  import { runAuditComparison, AUDIT_REQUIREMENTS } from './auditorEngine.js';
  import { generateTemplate, validateUpload, fetchAiColumnMapping, sanitizeData } from './src/pipeline.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const scanBtn = document.getElementById('scanBtn');
  const stopBtn = document.getElementById('stopBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadXlsxBtn = document.getElementById('downloadXlsxBtn'); 
  const pushSheetBtn = document.getElementById('pushSheetBtn'); 
  const pushExcelBtn = document.getElementById('pushExcelBtn');
  const previewBtn = document.getElementById('previewBtn'); 
  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const statusDiv = document.getElementById('status');
  const progressCountDiv = document.getElementById('progressCount'); 
  const selectAllCheckbox = document.getElementById('selectAll');
  const auditSelectAll = document.getElementById('auditSelectAll');
  const downloadErrorsBtn = document.getElementById('downloadErrorsBtn');
  
  // Tabs & Sections
  const tabBulk = document.getElementById('tabBulk');
  const tabCatalogueSetup = document.getElementById('tabCatalogueSetup');

  const bulkSection = document.getElementById('bulkSection');
  const catalogueSection = document.getElementById('catalogueSection');
  
  const csvInput = document.getElementById('csvInput');
  const bulkInput = document.getElementById('bulkInput');
  const importCatalogueBtn = document.getElementById('importCatalogueBtn');
  // disableImagesInput removed, using radio group name="imgPref"
  const fileStatus = document.getElementById('fileStatus');

  // Catalogue Setup / Auditor Elements
  const catalogueInput = document.getElementById('catalogueInput');
  const downloadCatalogueTemplateBtn = document.getElementById('downloadCatalogueTemplateBtn');
  const triggerImportBtn = document.getElementById('triggerImportBtn');
  const catalogueImportStatus = document.getElementById('catalogueImportStatus');
  const exportCatalogueBtn = document.getElementById('exportCatalogueBtn');

  // Trigger File Input logic
  if (triggerImportBtn && catalogueInput) {
      triggerImportBtn.addEventListener('click', () => catalogueInput.click());
      catalogueInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          // Pipeline Step A: Validation
          try {
              catalogueImportStatus.textContent = "Validating file...";
              const rawData = await validateUpload(file);

              // Get current headers from the file
              const userHeaders = Object.keys(rawData[0] || {});

              // Get expected targets from MASTER_COLUMNS + active Custom Rules
              const systemTargets = [
                  ...MASTER_COLUMNS.map(c => c.key),
                  ...customRules.filter(r => r.isActive).map(r => r.name),
                  'Ignore' // Added option
              ];

              catalogueImportStatus.textContent = "AI mapping columns...";
              // Pipeline Step B: AI Auto-Mapping
              const aiMapping = await fetchAiColumnMapping(userHeaders, systemTargets);

              // Pipeline Step C: Render UI for Confirmation
              renderMappingUI(rawData, userHeaders, aiMapping, systemTargets);

          } catch (err) {
              catalogueImportStatus.textContent = err.message;
              catalogueImportStatus.style.color = "var(--danger)";
          }
      });
  }

  // Define renderMappingUI function
  function renderMappingUI(rawData, userHeaders, aiMapping, systemTargets) {
      const mappingModal = document.getElementById('mappingModal');
      const mappingList = document.getElementById('mappingList');
      const confirmMappingBtn = document.getElementById('confirmMappingBtn');

      mappingList.innerHTML = ''; // Clear previous

      userHeaders.forEach(header => {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.flexDirection = 'column';
          row.style.gap = '4px';

          const label = document.createElement('label');
          label.style.fontWeight = 'bold';
          label.textContent = header;

          const select = document.createElement('select');
          select.dataset.header = header; // Store user header name
          select.className = 'mapping-select';
          select.style.padding = '6px';
          select.style.borderRadius = '4px';
          select.style.border = '1px solid var(--border)';

          systemTargets.forEach(target => {
              const option = document.createElement('option');
              option.value = target;
              option.textContent = target;
              select.appendChild(option);
          });

          // Pre-select AI suggestion
          if (aiMapping[header] && systemTargets.includes(aiMapping[header])) {
              select.value = aiMapping[header];
          } else {
              select.value = 'Ignore';
          }

          row.appendChild(label);
          row.appendChild(select);
          mappingList.appendChild(row);
      });

      // Overwrite previous event listener if it exists to prevent double-firing
      confirmMappingBtn.replaceWith(confirmMappingBtn.cloneNode(true));
      const newConfirmBtn = document.getElementById('confirmMappingBtn');

      newConfirmBtn.addEventListener('click', async () => {
          // Gather confirmed mapping
          const confirmedMapping = {};
          document.querySelectorAll('.mapping-select').forEach(select => {
              confirmedMapping[select.dataset.header] = select.value;
          });

          // Pipeline Step D: Sanitize and finalize data
          const goldenRecord = sanitizeData(rawData, confirmedMapping);

          // Explicitly save the clean array as the GoldenRecord
          await chrome.storage.local.set({ GoldenRecord: goldenRecord });

          // Proceed with existing import logic using the sanitized array
          processAndSaveGoldenRecord(goldenRecord);

          mappingModal.close();
      });

      // Hook up close button for the new modal
      const closeMappingModalBtn = document.getElementById('closeMappingModalBtn');
      if (closeMappingModalBtn) {
          closeMappingModalBtn.replaceWith(closeMappingModalBtn.cloneNode(true));
          document.getElementById('closeMappingModalBtn').addEventListener('click', () => mappingModal.close());
      }

      mappingModal.showModal();
  }

  // Transition function from pipeline back to normal app flow
  function processAndSaveGoldenRecord(goldenRecord) {
      if (goldenRecord.length === 0) {
          catalogueImportStatus.textContent = "No valid data to import.";
          return;
      }

      // Convert Golden Record into the format expected by the Auditor
      const items = goldenRecord.map(row => {
          let asin = row['ASIN'] || row['QueryASIN'];
          let url = row['url'] || row['page_url'];

          if (!asin && url) {
              const m = url.match(/([a-zA-Z0-9]{10})(?:[/?]|$)/);
              if (m) asin = m[1];
          } else if (asin && !url) {
              url = `https://www.amazon.com/dp/${asin}`;
          }

          if (!asin) return null;

          // Rebuild object in auditor format
          const item = {
              asin: asin.toUpperCase(),
              url: url,
              auditType: 'type2',
              expected: {
                  brand: row['brand'] || "",
                  title: row['metaTitle'] || "",
                  bullets: row['bullets'] || "",
                  description: row['description'] || ""
              },
              comparisonData: {
                  expected_title: row['metaTitle'],
                  expected_bullets: row['bullets'],
                  expected_description: row['description'],
                  expected_brand: row['brand'],
                  expected_rating: row['rating'],
                  expected_reviews: row['reviews'],
                  expected_bsr: row['bsr'],
                  expected_images: row['ApprovedImagesJSON'], // Fallbacks might be needed depending on systemTargets mapping
                  expected_video_titles: row['ApprovedVideoTitles'],
                  expected_brand_story: row['hasBrandStory'],
                  expected_aplus: row['hasAplus'],
                  expected_comparison: row['comparisonAsins'],
                  expected_variation_parent: row['parentAsin'],
                  expected_variation_theme: row['variationTheme'],
                  expected_variation_family: row['variationFamily'],
                  expected_price: row['displayPrice'],
                  expected_ships_from: row['shipsFrom'],
                  expected_sold_by: row['soldBy'],
                  expected_delivery_days: row['expected_delivery_days'] // Need to ensure mapping covers this
              }
          };

          // Attach custom rules
          customRules.forEach(rule => {
              if (rule.isActive && row[rule.name] !== undefined) {
                  item.comparisonData[rule.name] = row[rule.name];
              }
          });

          return item;
      }).filter(Boolean);

      if (items.length > 0) {
          openSaveToCatalogueModal(items);
          catalogueImportStatus.textContent = `File parsed (${items.length} items). Please confirm save.`;
          catalogueImportStatus.style.color = "var(--primary)";
      } else {
          catalogueImportStatus.textContent = "No valid ASIN/URL found in file after mapping.";
          catalogueImportStatus.style.color = "var(--danger)";
      }
  }


  // Export Catalogue Logic
  if (exportCatalogueBtn) {
      exportCatalogueBtn.addEventListener('click', () => {
          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              const container = data[key];
              if (!container || !container[currentCatalogueId]) return;
              const list = container[currentCatalogueId].items;
              if (list.length === 0) { alert("Catalogue is empty."); return; }

              if (typeof XLSX === 'undefined') { alert("XLSX library not found."); return; }

              const wb = XLSX.utils.book_new();
              const headers = [
                  "QueryASIN", "Marketplace",
                  "Brand", "Source Title", "Source Bullets", "Source Description",
                  "Reference Rating", "Reference Reviews",
                  "Approved Images", "Approved Video Count",
                  "Approved Brand Story Images", "Approved A+ Modules",
                  "Approved Comparison ASINs",
                  "Approved Variation Count", "Approved Variation Theme",
                  "Approved Seller", "Approved Price",
                  "Max Delivery Days"
              ];

              const rows = list.map(item => {
                  const comp = item.comparisonData || {};
                  return [
                      item.asin,
                      "", // Marketplace placeholder
                      item.expected?.brand || comp.expected_brand,
                      item.expected?.title || comp.expected_title,
                      item.expected?.bullets || comp.expected_bullets,
                      item.expected?.description || comp.expected_description,
                      comp.expected_rating,
                      comp.expected_reviews,
                      comp.expected_images,
                      comp.expected_video_count,
                      comp.expected_brand_story,
                      comp.expected_aplus,
                      comp.expected_comparison,
                      comp.expected_variation_count,
                      comp.expected_variation_theme,
                      comp.expected_seller,
                      comp.expected_price,
                      comp.expected_delivery_days
                  ];
              });

              const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
              XLSX.utils.book_append_sheet(wb, ws, "Data");
              XLSX.writeFile(wb, `${container[currentCatalogueId].name}_Export.xlsx`);
          });
      });
  }

  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const domainContainer = document.getElementById('domainContainer');
  const zipInput = document.getElementById('zipInput');
  const feedbackLink = document.getElementById('feedbackLink');
  
  // Catalogue Elements
  const catalogueItemsDiv = document.getElementById('catalogueItems');
  const catalogueCountDiv = document.getElementById('catalogueCount');
  const catalogueMeta = document.getElementById('catalogueMeta');
  const catalogueLimitMsg = document.getElementById('catalogueLimitMsg');
  const clearCatalogueBtn = document.getElementById('clearCatalogueBtn');
  const auditCatalogueBtn = document.getElementById('auditCatalogueBtn');

  // Sheets Sync UI Elements
  const syncToSheetsToggle = document.getElementById('syncToSheetsToggle');
  const sheetsSyncStatus = document.getElementById('sheetsSyncStatus');
  const forceSyncBtn = document.getElementById('forceSyncBtn');
  const linkSheetBtn = document.getElementById('linkSheetBtn');
  const sheetManager = new SheetManager();

  // New Catalogue Controls
  const catalogueSelect = document.getElementById('catalogueSelect');
  const manageCatalogsBtn = document.getElementById('manageCatalogsBtn');
  
  // Manage Modal Elements
  const manageCatalogsModal = document.getElementById('manageCatalogsModal');
  const closeManageModalBtn = document.getElementById('closeManageModalBtn');
  const manageCatalogsList = document.getElementById('manageCatalogsList');
  const sortCatalogsSelect = document.getElementById('sortCatalogsSelect');
  const saveOrderBtn = document.getElementById('saveOrderBtn');

  // Global Search & Drag Drop
  const globalCatalogSearch = document.getElementById('globalCatalogSearch');
  const dragDropArea = document.getElementById('dragDropArea');

  // Clear Elements
  const clearSection = document.getElementById('clearSection');
  const clearBtn = document.getElementById('clearBtn');
  const clearConfirmMsg = document.getElementById('clearConfirmMsg');

  // Modal Elements
  const previewModal = document.getElementById('previewModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalBody = document.getElementById('modalBody');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');

  // "What's New" Modal Elements
  const whatsNewModal = document.getElementById('whatsNewModal');
  const closeWhatsNewBtn = document.getElementById('closeWhatsNewBtn');
  const dismissWhatsNewBtn = document.getElementById('dismissWhatsNewBtn');

  // Import Modal Elements
  const saveToCatalogueModal = document.getElementById('saveToCatalogueModal');
  const closeSaveModalBtn = document.getElementById('closeSaveModalBtn');
  const newCatalogueNameInput = document.getElementById('newCatalogueNameInput');
  const appendCatalogueSelect = document.getElementById('appendCatalogueSelect');
  const confirmImportBtn = document.getElementById('confirmImportBtn');
  let pendingImportItems = [];

  // Auth Elements
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const themeToggle = document.getElementById('themeToggle'); 
  
  // Login Modal Elements
  const loginModal = document.getElementById('loginModal');
  const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const msLoginBtn = document.getElementById('msLoginBtn');

  if (loginBtn) {
      loginBtn.addEventListener('click', () => {
          if (loginModal) loginModal.showModal();
      });
  }
  if (closeLoginModalBtn && loginModal) {
      closeLoginModalBtn.addEventListener('click', () => loginModal.close());
  }
  
  // Dashboard Elements
  const dashboardView = document.getElementById('dashboardView');
  const statTotal = document.getElementById('statTotal');
  const statLqs = document.getElementById('statLqs');
  const statIssues = document.getElementById('statIssues');
  const bulkHintText = document.getElementById('bulkHintText');
  const downloadAuditTemplateBtn = document.getElementById('downloadAuditTemplateBtn');
  const inputCountDisplay = document.getElementById('inputCountDisplay');
  const statDuration = document.getElementById('statDuration');

  // Agent Console Elements
  const agentConsole = document.getElementById('agentConsole');
  const agentStatusMsg = document.getElementById('agentStatusMsg'); // NEW
  const agentModeBadge = document.getElementById('agentModeBadge'); // NEW
  const agentProgress = document.getElementById('agentProgress'); // NEW
  const agentCurrentDomain = document.getElementById('agentCurrentDomain');
  const agentNextDomain = document.getElementById('agentNextDomain');
  const agentBatchSize = document.getElementById('agentBatchSize');
  const agentTimer = document.getElementById('agentTimer');

  // --- State Variables ---
  let MEGA_MODE = 'scraper'; // 'scraper' or 'auditor'
  let mode = 'current'; 
  let rawCsvData = []; 
  let IS_LOGGED_IN = false; 
  let USER_INFO = null;
  const GUEST_LIMIT = 5;
  const PRO_LIMIT = 10000; 
  const CATALOGUE_GUEST_LIMIT = 10;
  const CATALOGUE_PRO_LIMIT = 10000;
  let countdownInterval = null;
  let previousIsScanning = false;
  let clearConfirmationPending = false; 
  let currentIsScanning = false;
  // scanStartTime removed, using state.startTime

  // --- Feature: Theme Toggle ---
  function initTheme() {
      chrome.storage.local.get(['theme'], (data) => {
          let theme = data.theme;
          if (!theme) {
              if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  theme = 'dark';
              } else {
                  theme = 'light';
              }
          }
          applyTheme(theme);
      });
  }

  function applyTheme(theme) {
      document.body.setAttribute('data-theme', theme);
      if(theme === 'dark') {
          themeToggle.textContent = '☀️'; 
          themeToggle.title = "Switch to Light Mode";
      } else {
          themeToggle.textContent = '🌙'; 
          themeToggle.title = "Switch to Dark Mode";
      }
      chrome.storage.local.set({ theme: theme });
  }

  themeToggle.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
  });
  
  // Initialize on load
  initTheme();

  // --- Feature: Preview Table ---
  previewBtn.addEventListener('click', async () => {
      const stateKey = (MEGA_MODE === 'scraper') ? 'scraperState' : 'auditorState';
      const data = await chrome.storage.local.get(stateKey);
      const results = data[stateKey] ? data[stateKey].results : [];
      if (!results || results.length === 0) { alert("No results to preview."); return; }

      // Clear previous content
      modalBody.textContent = ''; 

      if (MEGA_MODE === 'auditor') {
          // Auditor Mode Detailed Diff View
          results.forEach(r => {
              if (r.error || !r.attributes) return;

              const card = document.createElement('div');
              card.className = 'diff-card';
              card.style.border = '1px solid var(--border)';
              card.style.marginBottom = '12px';
              card.style.borderRadius = '6px';
              card.style.padding = '12px';

              const header = document.createElement('div');
              header.style.fontWeight = 'bold';
              header.style.marginBottom = '8px';
              header.textContent = `ASIN: ${r.attributes.mediaAsin || r.queryASIN}`;
              card.appendChild(header);

              const addDiffSection = (label, expected, actual) => {
                  if (!expected) return; // Only show if expected was provided
                  const section = document.createElement('div');
                  section.style.marginBottom = '8px';
                  section.style.fontSize = '11px';

                  const labelDiv = document.createElement('div');
                  labelDiv.style.fontWeight = 'bold';
                  labelDiv.style.color = 'var(--text-muted)';
                  labelDiv.textContent = label;
                  section.appendChild(labelDiv);

                  const contentDiv = document.createElement('div');
                  contentDiv.style.background = 'var(--bg-input)';
                  contentDiv.style.padding = '8px';
                  contentDiv.style.borderRadius = '4px';
                  contentDiv.style.marginTop = '4px';
                  contentDiv.style.fontFamily = 'monospace';
                  contentDiv.style.whiteSpace = 'pre-wrap';
                  contentDiv.style.wordBreak = 'break-word';

                  // Generate Diff
                  contentDiv.innerHTML = generateWordDiffHtml(String(expected), String(actual || ""));
                  section.appendChild(contentDiv);
                  card.appendChild(section);
              };

              // Map properties safely from the item
              const normalizeDiffInput = (input) => {
                  if (Array.isArray(input)) return input.join(' ');
                  return String(input || "");
              };

              const expTitle = r.expected?.title || r.comparisonData?.expected_title;
              const actTitle = r.attributes.metaTitle;
              addDiffSection("Title", normalizeDiffInput(expTitle), normalizeDiffInput(actTitle));

              const expBullets = r.expected?.bullets || r.comparisonData?.expected_bullets;
              const actBullets = r.attributes.bullets;
              addDiffSection("Bullets", normalizeDiffInput(expBullets), normalizeDiffInput(actBullets));

              const expDesc = r.expected?.description || r.comparisonData?.expected_description;
              const actDesc = r.attributes.description;
              addDiffSection("Description", normalizeDiffInput(expDesc), normalizeDiffInput(actDesc));

              if (card.childNodes.length > 1) {
                  modalBody.appendChild(card);
              }
          });

          if (modalBody.childNodes.length === 0) {
              modalBody.textContent = 'No text mismatches to preview or missing expected data.';
          }

      } else {
          // Standard Scraper View
          const table = document.createElement('table');
          table.className = 'preview-table';

          // Create Header
          const thead = document.createElement('thead');
          const headerRow = document.createElement('tr');
          ['ASIN', 'Status', 'Title', 'LQS', 'Issues'].forEach(text => {
              const th = document.createElement('th');
              th.textContent = text;
              headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);

          const tbody = document.createElement('tbody');
          results.forEach(r => {
              let status = "OK";
              let statusClass = "status-good";
              let issues = "";

              if (r.error) { status = "ERR"; statusClass = "status-bad"; issues = r.error; }
              else if (r.queryASIN && r.attributes && r.attributes.mediaAsin && r.queryASIN !== r.attributes.mediaAsin) { status = "Redirect"; statusClass = "status-bad"; }

              if (!issues && r.attributes && r.attributes.lqsDetails) {
                  const fails = r.attributes.lqsDetails.filter(d => !d.pass);
                  if (fails.length > 0) issues = fails.length + " LQS Issues";
              }

              const tr = document.createElement('tr');

              // ASIN
              const tdAsin = document.createElement('td');
              tdAsin.textContent = r.attributes ? r.attributes.mediaAsin : 'N/A';
              tr.appendChild(tdAsin);

              // Status
              const tdStatus = document.createElement('td');
              tdStatus.textContent = status;
              tdStatus.className = statusClass;
              tr.appendChild(tdStatus);

              // Title
              const tdTitle = document.createElement('td');
              const metaTitle = (r.attributes && r.attributes.metaTitle) ? r.attributes.metaTitle : 'N/A';
              tdTitle.textContent = metaTitle.length > 30 ? metaTitle.substring(0, 30) + '...' : metaTitle;
              tr.appendChild(tdTitle);

              // LQS
              const tdLqs = document.createElement('td');
              tdLqs.textContent = r.attributes ? r.attributes.lqs : '-';
              tr.appendChild(tdLqs);

              // Issues
              const tdIssues = document.createElement('td');
              tdIssues.textContent = issues;
              tr.appendChild(tdIssues);

              tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          modalBody.appendChild(table);
      }
      previewModal.showModal();
  });

  closeModalBtn.addEventListener('click', () => previewModal.close());
  modalDownloadBtn.addEventListener('click', () => downloadXlsxBtn.click());

  // --- Feature: Catalogue Logic (Updated for Price & Separate Storage) ---
  const getCatalogueContainerKey = () => IS_LOGGED_IN ? 'catalogues_pro' : 'catalogues_guest';
  let currentCatalogueId = "default";

  // Init Catalogues structure if missing
  const initCatalogues = (cb) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key, 'catalogue', 'catalogue_pro'], (data) => {
          let container = data[key];

          if (!container) {
              container = { "default": { name: "Main Catalogue", items: [], template: [] } };
              // We do not migrate legacy watchlist data automatically to enforce "clean" break if desired,
              // or we could map old 'watchlist_pro' to this new key.
              // For now, initializing fresh as per "No trace of watchlist".
              chrome.storage.local.set({ [key]: container }, cb);
          } else {
              if (cb) cb();
          }
      });
  };

  const loadCatalogue = () => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key, 'catalogOrder'], (data) => {
          const container = data[key] || { "default": { name: "Main Catalogue", items: [], template: [] } };
          const order = data.catalogOrder || [];

          // Populate Select Dropdown
          catalogueSelect.replaceChildren();
          
          let keys = Object.keys(container);
          
          // Apply stored order if valid
          if (order.length > 0) {
              // Filter keys that exist in container
              const orderedKeys = order.filter(k => container[k]);
              // Add any new keys not in order
              const remaining = keys.filter(k => !orderedKeys.includes(k));
              keys = [...orderedKeys, ...remaining];
          }

          keys.forEach(id => {
              const opt = document.createElement("option");
              opt.value = id;
              opt.textContent = container[id].name;
              catalogueSelect.appendChild(opt);
          });

          if (!container[currentCatalogueId]) currentCatalogueId = keys[0] || "default";
          catalogueSelect.value = currentCatalogueId;

          const activeList = container[currentCatalogueId];
          
          // Update Meta Display
          if (catalogueMeta && activeList) {
              const def = activeList.defaults || { marketplace: "Amazon.com" };
              const zip = def.zipcode || "Manual";
              const lang = (def.langPref === 'native') ? "Native" : "EN";
              catalogueMeta.textContent = `${def.marketplace} • ${zip} • ${lang}`;
          }

          renderCatalogue(activeList ? activeList.items : []);

          // Trigger Auto-Disable Logic
          if (activeList) {
              updateAuditCheckboxStates(container, currentCatalogueId);
              updateSheetsSyncUI(activeList);
          } else {
              updateSheetsSyncUI(null);
          }

          if (IS_LOGGED_IN) {
              catalogueLimitMsg.style.display = 'none';
          } else {
              catalogueLimitMsg.style.display = 'block';
              catalogueLimitMsg.textContent = `Limit: ${CATALOGUE_GUEST_LIMIT} (Free)`;
              catalogueLimitMsg.style.color = "var(--text-muted)";
          }
      });
  };

  catalogueSelect.addEventListener('change', (e) => {
      currentCatalogueId = e.target.value;
      loadCatalogue();
  });

  // --- Feature: Google Sheets Sync Logic ---
  const updateSheetsSyncUI = (activeList) => {
      if (!IS_LOGGED_IN || !activeList) {
          syncToSheetsToggle.disabled = true;
          syncToSheetsToggle.checked = false;
          sheetsSyncStatus.textContent = "Pro Feature";
          forceSyncBtn.style.display = 'none';
          linkSheetBtn.style.display = 'none';
          return;
      }

      syncToSheetsToggle.disabled = false;
      const isLinked = !!activeList.linkedSheetId;
      syncToSheetsToggle.checked = activeList.sheetsSyncEnabled || false;

      if (activeList.sheetsSyncEnabled) {
          if (isLinked) {
              sheetsSyncStatus.textContent = `🟢 Linked: ${activeList.linkedSheetId.substring(0, 8)}...`;
              sheetsSyncStatus.style.color = "var(--success)";
              forceSyncBtn.style.display = 'block';
              linkSheetBtn.style.display = 'none';
          } else {
              sheetsSyncStatus.textContent = "🟡 Pending Link";
              sheetsSyncStatus.style.color = "var(--warning)";
              forceSyncBtn.style.display = 'none';
              linkSheetBtn.style.display = 'block';
          }
      } else {
          sheetsSyncStatus.textContent = "Not Linked";
          sheetsSyncStatus.style.color = "var(--text-muted)";
          forceSyncBtn.style.display = 'none';
          linkSheetBtn.style.display = 'none';
      }
  };

  syncToSheetsToggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if (container && container[currentCatalogueId]) {
              container[currentCatalogueId].sheetsSyncEnabled = isEnabled;
              chrome.storage.local.set({ [key]: container }, () => {
                  updateSheetsSyncUI(container[currentCatalogueId]);
                  if (isEnabled && !container[currentCatalogueId].linkedSheetId) {
                      linkSheetBtn.click();
                  }
              });
          }
      });
  });

  linkSheetBtn.addEventListener('click', () => {
      const sheetId = prompt("Enter Google Sheet ID (from the URL):");
      if (!sheetId) {
          syncToSheetsToggle.checked = false;
          syncToSheetsToggle.dispatchEvent(new Event('change'));
          return;
      }

      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if (container && container[currentCatalogueId]) {
              container[currentCatalogueId].linkedSheetId = sheetId;
              chrome.storage.local.set({ [key]: container }, () => {
                  updateSheetsSyncUI(container[currentCatalogueId]);
                  forceSyncBtn.click(); // Initial pull
              });
          }
      });
  });

  forceSyncBtn.addEventListener('click', async () => {
      const originalText = forceSyncBtn.textContent;
      forceSyncBtn.textContent = "Syncing...";
      forceSyncBtn.disabled = true;

      try {
          const key = getCatalogueContainerKey();
          const data = await chrome.storage.local.get(key);
          const container = data[key];
          const activeList = container[currentCatalogueId];

          if (!activeList || !activeList.linkedSheetId) throw new Error("No linked sheet");

          // 1. Fetch from Sheets to Overwrite Local Data (Pipeline B requirement)
          const sheetData = await sheetManager.fetchRows(activeList.linkedSheetId);

          if (sheetData.rows.length > 0) {
              // Basic Mapping logic mirroring the CSV import
              // In production, this would use fetchAiColumnMapping to dynamically map.
              const items = sheetData.rows.map(row => {
                  const asin = row['QueryASIN'] || row['ASIN'] || row['asin'];
                  const url = row['URL'] || row['url'];

                  if (!asin) return null;

                  return {
                      asin: asin.toUpperCase(),
                      url: url,
                      auditType: 'type2',
                      _sheetRowIndex: row._sheetRowIndex,
                      expected: {
                          title: row['SourceTitle'] || row['Title'] || "",
                          bullets: row['SourceBullets'] || row['Bullets'] || "",
                          description: row['SourceDescription'] || row['Description'] || "",
                          brand: row['Brand'] || ""
                      },
                      comparisonData: {
                          expected_title: row['SourceTitle'] || row['Title'],
                          expected_bullets: row['SourceBullets'] || row['Bullets'],
                          expected_description: row['SourceDescription'] || row['Description'],
                          expected_images: row['Approved Images JSON'] || row['ApprovedImagesJSON']
                          // Add other mappings as needed...
                      }
                  };
              }).filter(Boolean);

              // Overwrite Local
              container[currentCatalogueId].items = processImportItems(items);
              await chrome.storage.local.set({ [key]: container });
              loadCatalogue();
              alert(`Synced ${items.length} rows from Google Sheets.`);
          } else {
              alert("Google Sheet is empty or missing headers.");
          }

      } catch (err) {
          console.error(err);
          alert("Sync Failed: " + err.message);
      } finally {
          forceSyncBtn.textContent = originalText;
          forceSyncBtn.disabled = false;
      }
  });

  // Function to push updates back to Sheets (called after audit)
  const syncResultsToSheet = async (results, catalogueId) => {
      const key = getCatalogueContainerKey();
      const data = await chrome.storage.local.get(key);
      const container = data[key];
      const activeList = container[catalogueId];

      if (!activeList || !activeList.sheetsSyncEnabled || !activeList.linkedSheetId) return;

      try {
          const updates = [];
          const sheetName = 'Data'; // Assuming standard name, or store during fetch

          results.forEach(res => {
              // Find matching item in catalogue to get its row index
              const item = activeList.items.find(i => i.asin === (res.queryASIN || res.attributes?.mediaAsin));
              if (item && item._sheetRowIndex) {
                  // E.g., Update "Audit Status" column (assume Column Z for now)
                  // In a robust implementation, fetchRows would map the column index
                  let status = "PASS";
                  if (res.error) status = "ERROR";
                  else if (parseInt(res.attributes.lqs) < 70) status = "FAIL";

                  updates.push({
                      range: `'${sheetName}'!Z${item._sheetRowIndex}`,
                      values: [[status]]
                  });
              }
          });

          if (updates.length > 0) {
              await sheetManager.batchUpdateRows(activeList.linkedSheetId, updates);
              console.log("Successfully pushed batch updates to Google Sheets.");
          }

      } catch (err) {
          console.error("Failed to push audit results to Sheets:", err);
      }
  };

  // --- Auto-Disable Logic for Audit Checkboxes ---
  const updateAuditCheckboxStates = (container, catalogueId) => {
      const cat = container[catalogueId];
      if (!cat || !cat.items || cat.items.length === 0) {
          // Empty catalogue, disable all or leave as is?
          // Default behavior: leave enabled or check headers if stored.
          // If items exist, we check the first item's 'comparisonData' keys to guess headers.
          // Ideally we should store 'headers' metadata on import.
          // Fallback: Check first item.
          return;
      }

      const firstItem = cat.items[0];
      // Collect available keys in the catalogue item (expected_*)
      // The keys in comparisonData are like 'expected_title', 'expected_images', etc.
      // BUT `AUDIT_REQUIREMENTS` uses User-Facing Column Names like 'Source Title'.
      // We need to check if the *original* import had them, OR map the internal keys back.
      // Problem: We only store the mapped internal keys (expected_title) in `comparisonData`.
      // Solution: Map `AUDIT_REQUIREMENTS` values to Internal Keys for validation.
      
      const INTERNAL_KEY_MAP = {
          'Source Title': 'expected_title', 'Source Bullets': 'expected_bullets', 'Source Description': 'expected_description', 'Brand': 'expected_brand',
          'Reference Rating': 'expected_rating', 'Reference Reviews': 'expected_reviews', 'Reference BSR': 'expected_bsr',
          'Approved Images JSON': 'expected_images',
          'Approved Video Titles': 'expected_video_titles', 'Video Count': 'expected_video_count',
          'Approved Brand Story Preview Link': 'expected_brand_story',
          'Approved A+ Module Preview Link': 'expected_aplus',
          'Approved Comparison Module Preview Link': 'expected_comparison_link', 'Approved Comparison ASINs': 'expected_comparison',
          'Approved Variation Theme': 'expected_variation_theme', 'Approved Variation Family': 'expected_variation_family', 'Approved Variation Count': 'expected_variation_count', 'Parent ASIN': 'expected_variation_parent',
          'Approved Price': 'expected_price', 'Approved ShipsFrom': 'expected_ships_from', 'Approved SoldBy': 'expected_sold_by',
          'Expected Delivery Days': 'expected_delivery_days'
      };

      // Get available internal keys from the first item
      const availableKeys = new Set();
      if (firstItem.comparisonData) {
          Object.keys(firstItem.comparisonData).forEach(k => {
              if (firstItem.comparisonData[k]) availableKeys.add(k);
          });
      }
      if (firstItem.expected) {
          if (firstItem.expected.title) availableKeys.add('expected_title');
          if (firstItem.expected.bullets) availableKeys.add('expected_bullets');
          if (firstItem.expected.description) availableKeys.add('expected_description');
          if (firstItem.expected.brand) availableKeys.add('expected_brand');
      }

      // Loop through Checkboxes
      Object.keys(AUDIT_REQUIREMENTS).forEach(auditKey => {
          const reqCols = AUDIT_REQUIREMENTS[auditKey]; // Array of strings e.g. ['Source Title', ...]
          // Check if ANY of the required cols for this audit are present
          const hasRequirement = reqCols.some(colName => {
              const internalKey = INTERNAL_KEY_MAP[colName];
              return availableKeys.has(internalKey);
          });

          // Find the checkbox
          const cb = document.querySelector(`.audit-checkbox[value="audit${auditKey.charAt(0).toUpperCase() + auditKey.slice(1)}"]`); 
          // e.g. auditContent, auditImages
          
          if (cb) {
              if (hasRequirement) {
                  cb.disabled = false;
                  cb.parentElement.title = "";
                  cb.parentElement.style.opacity = "1";
              } else {
                  cb.disabled = true;
                  cb.checked = false;
                  cb.parentElement.title = `Missing required columns: ${reqCols.join(' OR ')}`;
                  cb.parentElement.style.opacity = "0.5";
              }
          }
      });
      
      saveCheckboxState(); // Persist the unchecked states
      updateGroupCheckboxes();
  };

  // --- Input Modal Logic ---
  const inputModal = document.getElementById('inputModal');
  const inputModalTitle = document.getElementById('inputModalTitle');
  const closeInputModalBtn = document.getElementById('closeInputModalBtn');
  const catalogueNameInput = document.getElementById('catalogueNameInput');
  const catalogueMarketSelect = document.getElementById('catalogueMarketSelect');
  const catalogueZipInput = document.getElementById('catalogueZipInput');
  const catalogueLangInputs = document.querySelectorAll('input[name="catLang"]');
  const saveInputBtn = document.getElementById('saveInputBtn');

  // Populate Market Dropdown in Modal
  if (catalogueMarketSelect && Object.keys(marketplaceData).length > 0) {
      Object.keys(marketplaceData).forEach(domain => {
          const opt = document.createElement("option");
          opt.value = domain;
          opt.textContent = domain;
          catalogueMarketSelect.appendChild(opt);
      });
      // Set default
      catalogueMarketSelect.value = "Amazon.com";
      // Auto-fill zip on change
      catalogueMarketSelect.addEventListener('change', () => {
          const domain = catalogueMarketSelect.value;
          if (ZIP_DEFAULTS[domain]) {
              catalogueZipInput.value = ZIP_DEFAULTS[domain];
          } else {
              catalogueZipInput.value = "";
          }
      });
  }

  let inputModalAction = null; // 'create' or 'rename'

  closeInputModalBtn.addEventListener('click', () => inputModal.close());

  // --- Import Modal Logic ---
  closeSaveModalBtn.addEventListener('click', () => saveToCatalogueModal.close());

  // Elements in Import Modal
  const newCatalogueMarketSelect = document.getElementById('newCatalogueMarketSelect');
  const newCatalogueZipInput = document.getElementById('newCatalogueZipInput');
  const newCatDetails = document.getElementById('newCatDetails');

  const toggleImportOptions = () => {
      const isNew = document.querySelector('input[name="saveOption"][value="new"]').checked;
      newCatalogueNameInput.disabled = !isNew;
      appendCatalogueSelect.disabled = isNew;
      
      // Toggle visibility/interactivity of New Catalogue Details
      if (newCatDetails) {
          if (isNew) {
              newCatDetails.style.opacity = '1';
              newCatDetails.style.pointerEvents = 'auto';
          } else {
              newCatDetails.style.opacity = '0.5';
              newCatDetails.style.pointerEvents = 'none';
          }
      }
  };

  document.querySelectorAll('input[name="saveOption"]').forEach(r => r.addEventListener('change', toggleImportOptions));

  const openSaveToCatalogueModal = (items) => {
      pendingImportItems = items;
      
      // Populate New Catalogue Marketplace Dropdown (Reuse logic)
      if (newCatalogueMarketSelect && newCatalogueMarketSelect.options.length === 0) {
          Object.keys(marketplaceData).forEach(domain => {
              const opt = document.createElement("option");
              opt.value = domain;
              opt.textContent = domain;
              newCatalogueMarketSelect.appendChild(opt);
          });
          
          // Auto-fill zip logic for this modal too
          newCatalogueMarketSelect.addEventListener('change', () => {
              const domain = newCatalogueMarketSelect.value;
              if (ZIP_DEFAULTS[domain]) {
                  newCatalogueZipInput.value = ZIP_DEFAULTS[domain];
              } else {
                  newCatalogueZipInput.value = "";
              }
          });
      }

      // Reset Defaults
      if (newCatalogueNameInput) newCatalogueNameInput.value = "";
      if (newCatalogueMarketSelect) newCatalogueMarketSelect.value = "Amazon.com";
      if (newCatalogueZipInput) newCatalogueZipInput.value = ZIP_DEFAULTS["Amazon.com"];
      const defaultLang = document.getElementById('newCatLangEnglish');
      if (defaultLang) defaultLang.checked = true;

      // Populate Append Select
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key] || {};
          appendCatalogueSelect.replaceChildren();
          Object.keys(container).forEach(id => {
              const opt = document.createElement("option");
              opt.value = id;
              opt.textContent = container[id].name;
              appendCatalogueSelect.appendChild(opt);
          });

          if (Object.keys(container).length === 0) {
              // If no existing catalogues, force new
              document.querySelector('input[name="saveOption"][value="new"]').checked = true;
              document.querySelector('input[name="saveOption"][value="append"]').disabled = true;
          } else {
              document.querySelector('input[name="saveOption"][value="append"]').disabled = false;
          }

          toggleImportOptions();
          saveToCatalogueModal.showModal();
      });
  };

  confirmImportBtn.addEventListener('click', () => {
      const isNew = document.querySelector('input[name="saveOption"][value="new"]').checked;
      const key = getCatalogueContainerKey();

      chrome.storage.local.get([key], (data) => {
          let container = data[key] || { "default": { name: "Main Catalogue", items: [], template: [] } };

          let targetId = null;

          if (isNew) {
              const name = newCatalogueNameInput.value.trim();
              if (!name) { alert("Please enter a name for the new catalogue."); return; }
              
              // Unique Name Check
              const nameExists = Object.values(container).some(c => c.name.toLowerCase() === name.toLowerCase());
              if (nameExists) { alert("Catalogue name must be unique. Please choose another name."); return; }

              // Capture Defaults
              const marketplace = newCatalogueMarketSelect.value;
              const zipcode = newCatalogueZipInput.value.trim();
              let langPref = "english";
              const selectedLang = document.querySelector('input[name="newCatLang"]:checked');
              if(selectedLang) langPref = selectedLang.value;

              targetId = "cat_" + Date.now();
              // Initialize with pendingImportItems directly
              container[targetId] = { 
                  name: name, 
                  items: processImportItems(pendingImportItems), 
                  template: [],
                  defaults: { marketplace, zipcode, langPref }
              };
          } else {
              targetId = appendCatalogueSelect.value;
              if (!container[targetId]) { alert("Selected catalogue not found."); return; }
              
              // Overwrite Mode: Clear existing and replace
              container[targetId].items = processImportItems(pendingImportItems);
          }

          // Save container directly (Atomic Update)
          chrome.storage.local.set({ [key]: container }, () => {
              // Switch to target catalogue
              currentCatalogueId = targetId;
              
              // Load into Auditor context
              rawCsvData = pendingImportItems;
              
              if(catalogueImportStatus) {
                  catalogueImportStatus.textContent = `Loaded ${pendingImportItems.length} items into Catalogue. Ready to Audit.`;
                  catalogueImportStatus.style.color = "var(--success)";
              }

              saveToCatalogueModal.close();
              loadCatalogue(); // Refresh UI which will pick up the new ID and data
          });
      });
  });

  // Helper to process items for storage (adding history init)
  const processImportItems = (items) => {
      return items.map(item => {
          const historyEntry = { 
              date: Date.now(), 
              price: item.initialPrice, 
              title: item.expected ? item.expected.title : null 
          };
          return {
              ...item,
              history: [historyEntry],
              lastScan: null
          };
      });
  };

  // --- Feature: AI Visual Auditing (Image Upload & Base64) ---
  const imageDragDropArea = document.getElementById('imageDragDropArea');
  const localImagesInput = document.getElementById('localImagesInput');
  const localImagesPreview = document.getElementById('localImagesPreview');
  const localImagesStatus = document.getElementById('localImagesStatus');
  let uploadedTargetImagesBase64 = []; // Array to store base64 images

  if (imageDragDropArea && localImagesInput) {
      imageDragDropArea.addEventListener('click', () => localImagesInput.click());

      // Drag & Drop handlers
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          imageDragDropArea.addEventListener(eventName, preventDefaults, false);
      });
      function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

      imageDragDropArea.addEventListener('dragenter', () => imageDragDropArea.classList.add('highlight'));
      imageDragDropArea.addEventListener('dragover', () => imageDragDropArea.classList.add('highlight'));
      imageDragDropArea.addEventListener('dragleave', () => imageDragDropArea.classList.remove('highlight'));
      imageDragDropArea.addEventListener('drop', handleImageDrop);
      localImagesInput.addEventListener('change', (e) => handleImageFiles(e.target.files));
  }

  function handleImageDrop(e) {
      imageDragDropArea.classList.remove('highlight');
      const dt = e.dataTransfer;
      const files = dt.files;
      handleImageFiles(files);
  }

  function handleImageFiles(files) {
      if (!files || files.length === 0) return;
      localImagesStatus.textContent = `Processing ${files.length} images...`;

      Array.from(files).forEach(file => {
          if (!file.type.startsWith('image/')) return;

          const reader = new FileReader();
          reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                  // Resize/Compress logic
                  const canvas = document.createElement('canvas');
                  const MAX_SIZE = 1024;
                  let width = img.width;
                  let height = img.height;

                  if (width > height) {
                      if (width > MAX_SIZE) {
                          height *= MAX_SIZE / width;
                          width = MAX_SIZE;
                      }
                  } else {
                      if (height > MAX_SIZE) {
                          width *= MAX_SIZE / height;
                          height = MAX_SIZE;
                      }
                  }
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, width, height);

                  const base64Str = canvas.toDataURL('image/jpeg', 0.8);
                  uploadedTargetImagesBase64.push(base64Str);

                  // Render Thumbnail
                  const thumb = document.createElement('img');
                  thumb.src = base64Str;
                  thumb.style.width = '40px';
                  thumb.style.height = '40px';
                  thumb.style.objectFit = 'cover';
                  thumb.style.borderRadius = '4px';
                  thumb.style.border = '1px solid var(--border)';
                  localImagesPreview.appendChild(thumb);

                  localImagesStatus.textContent = `${uploadedTargetImagesBase64.length} target images ready.`;
                  localImagesStatus.style.color = "var(--success)";
              };
              img.src = event.target.result;
          };
          reader.readAsDataURL(file);
      });
  }

  // --- Global Search Logic ---
  if (globalCatalogSearch) {
      globalCatalogSearch.addEventListener('input', (e) => {
          const query = e.target.value.trim().toUpperCase();
          if (!query) {
              loadCatalogue(); // Reset view
              return;
          }

          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              const container = data[key] || {};
              let results = [];
              
              Object.keys(container).forEach(catId => {
                  const cat = container[catId];
                  if (cat.items) {
                      const matches = cat.items.filter(item => 
                          (item.asin && item.asin.includes(query)) || 
                          (item.expected && item.expected.title && item.expected.title.toUpperCase().includes(query))
                      );
                      matches.forEach(m => {
                          results.push({ ...m, _catalogName: cat.name, _catalogId: catId });
                      });
                  }
              });

              renderGlobalSearchResults(results);
          });
      });
  }

  const renderGlobalSearchResults = (list) => {
      catalogueItemsDiv.replaceChildren();
      catalogueCountDiv.textContent = `Found ${list.length} matches`;
      
      if (list.length === 0) {
          const noMatchesDiv = document.createElement('div');
          noMatchesDiv.style.padding = '10px';
          noMatchesDiv.style.textAlign = 'center';
          noMatchesDiv.style.color = 'var(--text-muted)';
          noMatchesDiv.style.fontSize = '11px';
          noMatchesDiv.textContent = 'No matches found.';
          catalogueItemsDiv.replaceChildren(noMatchesDiv);
          return;
      }

      const fragment = document.createDocumentFragment();
      list.forEach(item => {
          const div = document.createElement('div');
          div.className = 'wl-item';
          div.style.borderLeft = "3px solid var(--primary)";
          // Use flexbox for layout: Info on left, Button on right
          div.style.display = "flex";
          div.style.justifyContent = "space-between";
          div.style.alignItems = "center";
          div.style.padding = "8px"; // Ensure padding

          const info = document.createElement('div');
          info.style.fontSize = '11px';
          info.style.flex = "1"; 
          info.style.marginRight = "8px";
          
          const strongAsin = document.createElement('strong');
          strongAsin.textContent = item.asin;
          
          const br = document.createElement('br');
          
          const spanCat = document.createElement('span');
          spanCat.style.color = 'var(--text-muted)';
          spanCat.textContent = `in ${item._catalogName}`;
          
          info.appendChild(strongAsin);
          info.appendChild(br);
          info.appendChild(spanCat);
          
          const jumpBtn = document.createElement('button');
          jumpBtn.textContent = "Go to Catalog";
          // Professional UI Styling
          jumpBtn.style.fontSize = "10px";
          jumpBtn.style.fontWeight = "600";
          jumpBtn.style.width = "90px"; // Fixed Width
          jumpBtn.style.flex = "none"; // Don't shrink
          jumpBtn.style.padding = "6px 0";
          jumpBtn.style.borderRadius = "4px";
          jumpBtn.style.border = "1px solid var(--primary)";
          jumpBtn.style.background = "var(--primary-light)"; 
          jumpBtn.style.color = "var(--primary)";
          jumpBtn.style.cursor = "pointer";
          jumpBtn.style.textAlign = "center";
          
          // Hover effect simulation (inline)
          jumpBtn.onmouseover = () => { jumpBtn.style.background = "var(--primary)"; jumpBtn.style.color = "white"; };
          jumpBtn.onmouseout = () => { jumpBtn.style.background = "var(--primary-light)"; jumpBtn.style.color = "var(--primary)"; };

          jumpBtn.addEventListener('click', () => {
              currentCatalogueId = item._catalogId;
              loadCatalogue();
              globalCatalogSearch.value = "";
          });

          div.appendChild(info);
          div.appendChild(jumpBtn);
          fragment.appendChild(div);
      });
      catalogueItemsDiv.appendChild(fragment);
  };

  // --- Drag & Drop Logic ---
  if (dragDropArea) {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          dragDropArea.addEventListener(eventName, preventDefaults, false);
      });

      function preventDefaults(e) {
          e.preventDefault();
          e.stopPropagation();
      }

      dragDropArea.addEventListener('dragenter', () => dragDropArea.classList.add('highlight'));
      dragDropArea.addEventListener('dragover', () => dragDropArea.classList.add('highlight'));
      dragDropArea.addEventListener('dragleave', () => dragDropArea.classList.remove('highlight'));
      dragDropArea.addEventListener('drop', (e) => {
          dragDropArea.classList.remove('highlight');
          const dt = e.dataTransfer;
          const files = dt.files;
          if(files.length > 0) {
              handleFileSelect(files[0], catalogueImportStatus, 'auditor');
          }
      });
  }

  // --- Manage Catalogs Logic ---
  if (manageCatalogsBtn) {
      manageCatalogsBtn.addEventListener('click', () => openManageModal());
  }
  if (closeManageModalBtn) {
      closeManageModalBtn.addEventListener('click', () => manageCatalogsModal.close());
  }

  const openManageModal = () => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key, 'catalogOrder'], (data) => {
          const container = data[key] || {};
          let keys = Object.keys(container);
          const order = data.catalogOrder || [];

          if (order.length > 0) {
              const orderedKeys = order.filter(k => container[k]);
              const remaining = keys.filter(k => !orderedKeys.includes(k));
              keys = [...orderedKeys, ...remaining];
          }

          renderManageList(keys, container);
          manageCatalogsModal.showModal();
      });
  };

  const renderManageList = (keys, container) => {
      manageCatalogsList.replaceChildren();
      
      // Add "Create New" Button at top of list for easy access
      const createBtn = document.createElement('button');
      createBtn.textContent = "+ Create New Catalogue";
      createBtn.className = "action-btn secondary-btn";
      createBtn.style.width = "100%";
      createBtn.style.marginBottom = "10px";
      createBtn.addEventListener('click', createNewCatalog);
      manageCatalogsList.appendChild(createBtn);

      keys.forEach(id => {
          const item = document.createElement('div');
          item.className = 'manage-item';
          item.draggable = true;
          item.dataset.id = id;
          item.style.padding = "8px";
          item.style.borderBottom = "1px solid var(--border)";
          item.style.display = "flex";
          item.style.alignItems = "center";
          item.style.gap = "8px";
          item.style.background = "white";
          
          const dragIcon = document.createElement('span');
          dragIcon.style.cursor = 'move';
          dragIcon.style.color = 'var(--text-muted)';
          dragIcon.style.fontSize = '16px';
          dragIcon.textContent = '☰';
          
          const nameSpan = document.createElement('span');
          nameSpan.style.flex = '1';
          nameSpan.style.fontSize = '12px';
          nameSpan.style.fontWeight = '500';
          nameSpan.textContent = container[id].name;
          
          const editBtn = document.createElement('button');
          editBtn.className = 'icon-btn edit-cat-btn';
          editBtn.dataset.id = id;
          editBtn.title = 'Edit';
          editBtn.style.background = 'none';
          editBtn.style.border = 'none';
          editBtn.style.cursor = 'pointer';
          editBtn.textContent = '✏️';
          
          const delBtn = document.createElement('button');
          delBtn.className = 'icon-btn del-cat-btn';
          delBtn.dataset.id = id;
          delBtn.title = 'Delete';
          delBtn.style.color = 'var(--danger)';
          delBtn.style.background = 'none';
          delBtn.style.border = 'none';
          delBtn.style.cursor = 'pointer';
          delBtn.textContent = '🗑️';

          item.appendChild(dragIcon);
          item.appendChild(nameSpan);
          item.appendChild(editBtn);
          item.appendChild(delBtn);
          manageCatalogsList.appendChild(item);

          item.addEventListener('dragstart', handleDragStart);
          item.addEventListener('dragover', handleDragOver);
          item.addEventListener('drop', handleDrop);
          item.addEventListener('dragend', handleDragEnd);

          item.querySelector('.edit-cat-btn').addEventListener('click', (e) => editCatalog(id));
          item.querySelector('.del-cat-btn').addEventListener('click', (e) => deleteCatalog(id));
      });
  };

  let draggedItem = null;
  function handleDragStart(e) {
      draggedItem = this;
      e.dataTransfer.effectAllowed = 'move';
      this.style.opacity = '0.4';
  }
  function handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return false;
  }
  function handleDrop(e) {
      e.stopPropagation();
      if (draggedItem !== this) {
          const list = manageCatalogsList;
          // Note: list contains the createBtn at index 0, need to be careful with children
          // We only drag .manage-item elements
          if (this.classList.contains('manage-item') && draggedItem.classList.contains('manage-item')) {
              const allItems = Array.from(list.querySelectorAll('.manage-item'));
              const fromIndex = allItems.indexOf(draggedItem);
              const toIndex = allItems.indexOf(this);
              
              if (fromIndex < toIndex) {
                  list.insertBefore(draggedItem, this.nextSibling);
              } else {
                  list.insertBefore(draggedItem, this);
              }
          }
      }
      return false;
  }
  function handleDragEnd() {
      this.style.opacity = '1';
      draggedItem = null;
  }

  if (saveOrderBtn) {
      saveOrderBtn.addEventListener('click', () => {
          const newOrder = Array.from(manageCatalogsList.querySelectorAll('.manage-item')).map(el => el.dataset.id);
          chrome.storage.local.set({ catalogOrder: newOrder }, () => {
              loadCatalogue();
              manageCatalogsModal.close();
          });
      });
  }

  if (sortCatalogsSelect) {
      sortCatalogsSelect.addEventListener('change', (e) => {
          const method = e.target.value;
          if (method === 'custom') return;

          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              const container = data[key] || {};
              let keys = Object.keys(container);
              
              if (method === 'az') {
                  keys.sort((a,b) => container[a].name.localeCompare(container[b].name));
              } else if (method === 'za') {
                  keys.sort((a,b) => container[b].name.localeCompare(container[a].name));
              } else if (method === 'newest') {
                  keys.sort((a,b) => parseInt(b.split('_')[1] || 0) - parseInt(a.split('_')[1] || 0));
              } else if (method === 'oldest') {
                  keys.sort((a,b) => parseInt(a.split('_')[1] || 0) - parseInt(b.split('_')[1] || 0));
              }
              renderManageList(keys, container);
          });
      });
  }

  const createNewCatalog = () => {
      inputModalTitle.textContent = "Create New Catalogue";
      catalogueNameInput.value = "";
      catalogueMarketSelect.value = "Amazon.com";
      catalogueZipInput.value = ZIP_DEFAULTS["Amazon.com"];
      if(catalogueLangInputs.length) document.getElementById('catLangEnglish').checked = true;
      inputModalAction = 'create';
      inputModal.showModal();
  };

  const editCatalog = (id) => {
     currentCatalogueId = id; // Set active context temporarily for edit
     const key = getCatalogueContainerKey();
     chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if (container && container[id]) {
             const cat = container[id];
             inputModalTitle.textContent = "Edit Catalogue";
             catalogueNameInput.value = cat.name;
             
             if (cat.defaults) {
                 catalogueMarketSelect.value = cat.defaults.marketplace || "Amazon.com";
                 catalogueZipInput.value = cat.defaults.zipcode || "";
                 const lang = cat.defaults.langPref || "english";
                 const langRadio = document.querySelector(`input[name="catLang"][value="${lang}"]`);
                 if(langRadio) langRadio.checked = true;
             }
             inputModalAction = 'rename'; // Reuse 'rename' action for edits
             inputModal.showModal();
          }
     });
  };

  const deleteCatalog = (id) => {
      if (confirm("Delete this catalogue?")) {
          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              const container = data[key];
              delete container[id];
              // If deleted active one
              if (currentCatalogueId === id) currentCatalogueId = Object.keys(container)[0] || "default";
              
              chrome.storage.local.set({ [key]: container }, () => {
                  openManageModal(); // Refresh modal
                  loadCatalogue();   // Refresh main UI
              });
          });
      }
  };

  saveInputBtn.addEventListener('click', () => {
      const name = catalogueNameInput.value.trim();
      if (!name) { alert("Please enter a name."); return; }
      
      const marketplace = catalogueMarketSelect.value;
      const zipcode = catalogueZipInput.value.trim();
      let langPref = "english";
      const selectedLang = document.querySelector('input[name="catLang"]:checked');
      if(selectedLang) langPref = selectedLang.value;

      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key] || {};

          if (inputModalAction === 'create') {
              const nameExists = Object.values(container).some(c => c.name.toLowerCase() === name.toLowerCase());
              if (nameExists) { alert("Catalogue name must be unique."); return; }

              const id = "cat_" + Date.now();
              container[id] = { 
                  name: name, 
                  items: [], 
                  template: [],
                  defaults: { marketplace, zipcode, langPref }
              };
              chrome.storage.local.set({ [key]: container }, () => {
                  currentCatalogueId = id;
                  inputModal.close();
                  loadCatalogue();
                  // Also refresh manage modal if open
                  if (manageCatalogsModal.open) openManageModal();
              });
          } else if (inputModalAction === 'rename') {
              const nameExists = Object.keys(container).some(k => k !== currentCatalogueId && container[k].name.toLowerCase() === name.toLowerCase());
              if (nameExists) { alert("Catalogue name must be unique."); return; }

              if (container[currentCatalogueId]) {
                  container[currentCatalogueId].name = name;
                  container[currentCatalogueId].defaults = { marketplace, zipcode, langPref };
                  
                  chrome.storage.local.set({ [key]: container }, () => {
                      loadCatalogue();
                      inputModal.close();
                      if (manageCatalogsModal.open) openManageModal();
                  });
              }
          }
      });
  });

  const addToCatalogue = (items) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          let container = data[key] || { "default": { name: "Main Catalogue", items: [], template: [] } };
          if(!container[currentCatalogueId]) container[currentCatalogueId] = { name: "Default", items: [], template: [] };

          let list = container[currentCatalogueId].items;
          const limit = IS_LOGGED_IN ? CATALOGUE_PRO_LIMIT : CATALOGUE_GUEST_LIMIT;
          
          let addedCount = 0;

          // Process items with overwrite logic as requested
          items.forEach(newItem => {
              const existingIndex = list.findIndex(i => i.asin === newItem.asin);

              // Only check limit if adding a NEW item
              if (existingIndex === -1 && list.length >= limit) {
                  // Skip if limit reached
                  return;
              }

              const timestamp = Date.now();
              const historyEntry = { 
                  date: timestamp, 
                  price: newItem.initialPrice, 
                  title: newItem.expected ? newItem.expected.title : null 
              };

              if (existingIndex > -1) {
                  // OVERWRITE Logic: Update attributes fully for existing ASIN
                  const existing = list[existingIndex];
                  const newHistory = existing.history ? [...existing.history, historyEntry] : [historyEntry];
                  if (newHistory.length > 5) newHistory.shift();

                  list[existingIndex] = { 
                      ...existing, 
                      ...newItem, // Overwrite new data
                      history: newHistory,
                      lastScan: existing.lastScan || null // Preserve scan status if any
                  };
              } else {
                  // New Item
                  list.push({
                      ...newItem,
                      history: [historyEntry],
                      lastScan: null
                  });
                  addedCount++;
              }
          });
          
          container[currentCatalogueId].items = list;

          chrome.storage.local.set({ [key]: container }, () => {
              loadCatalogue();
              // syncToFirestore(container);
              if (mode === 'current') {
                  // pasteStatus is undefined, using statusDiv as fallback if needed or removing since pasteStatus is likely from old clipboard paste logic
                  statusDiv.textContent = `Saved to Catalogue!`;
                  statusDiv.style.color = "var(--success)";
                  setTimeout(() => { statusDiv.textContent = ""; statusDiv.style.color = ""; }, 2000);
              } else if (mode === 'bulk') {
                  fileStatus.textContent = `Imported ${addedCount} new items.`;
                  fileStatus.style.color = "var(--success)";
              }
          });
      });
  };

  const removeFromCatalogue = (asin) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          let container = data[key];
          if(container && container[currentCatalogueId]) {
              container[currentCatalogueId].items = container[currentCatalogueId].items.filter(item => item.asin !== asin);
              chrome.storage.local.set({ [key]: container }, () => {
                  loadCatalogue();
                  // syncToFirestore(container);
              });
          }
      });
  };

  const clearCatalogue = () => {
      if (confirm("Are you sure you want to clear items in this catalogue?")) {
          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              let container = data[key];
              if(container && container[currentCatalogueId]) {
                  container[currentCatalogueId].items = [];
                  chrome.storage.local.set({ [key]: container }, () => {
                      loadCatalogue();
                      // syncToFirestore(container);
                  });
              }
          });
      }
  };

  const renderCatalogue = (list) => {
      catalogueCountDiv.textContent = `${list.length} Items`;
      catalogueItemsDiv.replaceChildren();
      
      if (list.length === 0) {
          const emptyCatDiv = document.createElement('div');
          emptyCatDiv.style.padding = '10px';
          emptyCatDiv.style.textAlign = 'center';
          emptyCatDiv.style.color = 'var(--text-muted)';
          emptyCatDiv.style.fontSize = '11px';
          emptyCatDiv.textContent = 'Catalogue is empty.';
          catalogueItemsDiv.replaceChildren(emptyCatDiv);
          auditCatalogueBtn.disabled = true;
          return;
      }
      
      auditCatalogueBtn.disabled = false;

      // Use DocumentFragment for batch appending (Performance Fix)
      const fragment = document.createDocumentFragment();

      list.forEach(item => {
          const div = document.createElement('div');
          div.className = 'wl-item';
          
          // Determine Status
          let statusIcon = '⚪'; // Default/Pending
          let statusTitle = "Not audited yet";
          if (item.lastScan) {
              if (item.lastScan.status === 'OK') statusIcon = '🟢';
              else if (item.lastScan.status === 'ISSUE') statusIcon = '🟠';
              else if (item.lastScan.status === 'ERROR') statusIcon = '🔴';
              
              if (item.lastScan.priceChange) statusIcon += ' 💲'; // Price changed
          }

          const lastScanDate = item.lastScan ? new Date(item.lastScan.date).toLocaleDateString() : '-';

          // Safe DOM Creation
          const grid = document.createElement('div');
          grid.style.display = 'grid';
          grid.style.gridTemplateColumns = '1fr 1fr 1fr';
          grid.style.gap = '8px';
          grid.style.alignItems = 'center';
          grid.style.width = '100%';

          // Column 1: Info (ASIN + Title)
          const colInfo = document.createElement('div');
          colInfo.className = 'wl-info';
          colInfo.style.fontSize = '11px';

          const link = document.createElement('a');
          link.href = item.url;
          link.target = '_blank';
          link.style.color = 'var(--primary)';
          link.style.fontWeight = '700';
          link.style.textDecoration = 'none';
          link.textContent = item.asin;
          colInfo.appendChild(link);

          const titleDiv = document.createElement('div');
          titleDiv.className = 'wl-title';
          titleDiv.style.fontSize = '9px';
          titleDiv.style.color = 'var(--text-muted)';
          
          const rawTitle = item.expected && item.expected.title ? item.expected.title : "No Baseline";
          titleDiv.textContent = rawTitle.length > 20 ? rawTitle.substring(0, 20) + "..." : rawTitle;
          colInfo.appendChild(titleDiv);

          grid.appendChild(colInfo);

          // Column 2: Date
          const colDate = document.createElement('div');
          colDate.style.textAlign = 'center';
          colDate.style.fontSize = '10px';
          colDate.style.color = 'var(--text-muted)';
          colDate.textContent = lastScanDate;
          grid.appendChild(colDate);

          // Column 3: Status & Actions
          const colActions = document.createElement('div');
          colActions.style.textAlign = 'right';
          colActions.style.fontSize = '14px';
          colActions.style.cursor = 'default';
          colActions.title = statusTitle;

          const statusSpan = document.createElement('span');
          statusSpan.textContent = statusIcon;
          colActions.appendChild(statusSpan);

          const chartBtn = document.createElement('span');
          chartBtn.className = 'wl-chart';
          chartBtn.title = 'View History';
          chartBtn.style.marginLeft = '4px';
          chartBtn.style.cursor = 'pointer';
          chartBtn.textContent = '📈';
          chartBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              // Add chart view logic if needed
          });
          colActions.appendChild(chartBtn);

          const delBtn = document.createElement('span');
          delBtn.className = 'wl-del';
          delBtn.title = 'Remove';
          delBtn.style.marginLeft = '4px';
          delBtn.style.cursor = 'pointer';
          delBtn.textContent = '×'; // Use text char instead of entity for textContent
          delBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              removeFromCatalogue(item.asin);
          });
          colActions.appendChild(delBtn);

          grid.appendChild(colActions);
          div.appendChild(grid);
          
          fragment.appendChild(div);
      });

      catalogueItemsDiv.appendChild(fragment);
  };

  // Image Source Switch Logic
  const imageSourceRadios = document.querySelectorAll('input[name="imageAuditSource"]');
  const vcPortalWarning = document.getElementById('vcPortalWarning');
  const scPortalWarning = document.getElementById('scPortalWarning');

  // Ensure Hidden Initially
  if(vcPortalWarning) vcPortalWarning.style.display = 'none';
  if(scPortalWarning) scPortalWarning.style.display = 'none';

  if (imageSourceRadios) {
      imageSourceRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
              // Reset both
              if(vcPortalWarning) vcPortalWarning.style.display = 'none';
              if(scPortalWarning) scPortalWarning.style.display = 'none';

              if (e.target.value === 'vc') {
                  if(vcPortalWarning) vcPortalWarning.style.display = 'flex';
              } else if (e.target.value === 'sc') {
                  if(scPortalWarning) scPortalWarning.style.display = 'flex';
              }
          });
      });
  }

  clearCatalogueBtn.addEventListener('click', clearCatalogue);

  auditCatalogueBtn.addEventListener('click', () => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if(!container || !container[currentCatalogueId]) return;
          const list = container[currentCatalogueId].items;

          if (list.length === 0) return;
          
          // Use ASINs if URLs are missing, constructing a list of objects with ID
          const urlsToProcess = [];
          list.forEach(item => {
              // Main PDP
              urlsToProcess.push({
                  id: item.asin,
                  url: item.url,
                  expected: item.expected,
                  comparisonData: item.comparisonData
              });

              // Check for Draft Links in Comparison Data
              if (item.comparisonData) {
                  // Draft Brand Story
                  const bsLink = item.comparisonData.expected_brand_story;
                  if (bsLink && bsLink.startsWith('http')) {
                      urlsToProcess.push({
                          id: `${item.asin}_DRAFT_BS`,
                          url: bsLink,
                          isDraft: true,
                          draftType: 'brandStory',
                          parentAsin: item.asin
                      });
                  }
                  // Draft A+ Content
                  const apLink = item.comparisonData.expected_aplus;
                  if (apLink && apLink.startsWith('http')) {
                      urlsToProcess.push({
                          id: `${item.asin}_DRAFT_AP`,
                          url: apLink,
                          isDraft: true,
                          draftType: 'aplus',
                          parentAsin: item.asin
                      });
                  }
              }
          });
          
          // Check 'disable' option from radio group
          const disableImages = document.querySelector('input[name="imgPref"]:checked').value === 'disable';
          
          // Get Image Source Setting
          let imageSource = 'catalogue';
          const sourceRadio = document.querySelector('input[name="imageAuditSource"]:checked');
          if (sourceRadio) imageSource = sourceRadio.value;

          const settings = { 
              disableImages: disableImages,
              imageSource: imageSource
          };

          // VC/SC Warning
          if (imageSource === 'vc' || imageSource === 'sc') {
              const confirmPortal = confirm(`⚠️ Verification Required\n\nAre you currently logged into ${imageSource === 'vc' ? 'Vendor Central' : 'Seller Central'} in this browser profile?\n\nThe audit will fail if you are not logged in.`);
              if (!confirmPortal) return;
          }

          // Inject Catalogue Defaults if available
          const currentCat = container[currentCatalogueId];
          if (currentCat && currentCat.defaults) {
              settings.catalogueDefaults = currentCat.defaults;
          }
          
          chrome.runtime.sendMessage({ action: 'START_SCAN', payload: { urls: urlsToProcess, mode: 'catalogue', settings } });
      });
  });

  // Listen for Audit Completion to Update Catalogue Status
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'SCAN_COMPLETE' && request.mode === 'catalogue') {
          updateCatalogueAfterScan(request.results);
      }
  });

  const updateCatalogueAfterScan = (results) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if(!container || !container[currentCatalogueId]) return;
          let list = container[currentCatalogueId].items;
          
          list = list.map(item => {
              const result = results.find(r => r.url === item.url || (r.attributes && r.attributes.mediaAsin === item.asin));
              if (result) {
                  const now = Date.now();
                  let status = 'OK';
                  let priceChange = false;

                  if (result.error) status = 'ERROR';
                  else {
                      // Check LQS
                      const lqs = parseInt(result.attributes.lqs);
                      if (lqs < 70) status = 'ISSUE';

                      // Check Title Match
                      if (item.expected && item.expected.title && result.attributes.metaTitle !== item.expected.title) {
                          status = 'ISSUE';
                      }

                      // Check Price
                      if (item.initialPrice && result.attributes.displayPrice !== 'none' && result.attributes.displayPrice !== item.initialPrice) {
                          priceChange = true;
                      }
                  }

                  return {
                      ...item,
                      lastScan: {
                          date: now,
                          status: status,
                          priceChange: priceChange,
                          lastLqs: result.attributes.lqs
                      }
                  };
              }
              return item;
          });

          container[currentCatalogueId].items = list;
          chrome.storage.local.set({ [key]: container }, () => {
              loadCatalogue();
              // Trigger sync to Google Sheets if linked
              syncResultsToSheet(results, currentCatalogueId);
          });
      });
  };


  importCatalogueBtn.addEventListener('click', () => {
      if (rawCsvData.length === 0) {
          fileStatus.textContent = "No data to import.";
          fileStatus.style.color = "var(--danger)";
          return;
      }
      
      const itemsToSave = rawCsvData.map(item => {
          if (typeof item === 'string') {
              const url = buildOrNormalizeUrl(item);
              const asinMatch = url ? url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i) : null;
              const asin = asinMatch ? asinMatch[1].toUpperCase() : "UNKNOWN_" + Math.random().toString(36).substr(2, 5);
              return {
                  asin: asin,
                  url: url,
                  expected: { title: "", bullets: "" } 
              };
          } else {
              const url = buildOrNormalizeUrl(item.url);
              const asinMatch = url ? url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i) : null;
              const asin = asinMatch ? asinMatch[1].toUpperCase() : "UNKNOWN_" + Math.random().toString(36).substr(2, 5);
              return {
                  asin: asin,
                  url: url,
                  expected: {
                      brand: item.expected?.brand || "",
                      title: item.expected?.title || "",
                      bullets: item.expected?.bullets || "",
                      description: item.expected?.description || ""
                  }
              };
          }
      }).filter(i => i.url !== null);

      if (itemsToSave.length > 0) {
          addToCatalogue(itemsToSave);
      } else {
          fileStatus.textContent = "No valid URLs found.";
          fileStatus.style.color = "var(--danger)";
      }
  });


  // --- Feature: Checkbox Lock & Group Select ---
  const saveCheckboxState = () => {
      const state = {};
      document.querySelectorAll('.attr-checkbox').forEach(cb => {
          state[cb.value] = cb.checked;
      });
      chrome.storage.local.set({ checkboxLock: state });
  };

  const loadCheckboxState = () => {
      chrome.storage.local.get(['checkboxLock'], (data) => {
          if (data.checkboxLock) {
              const state = data.checkboxLock;
              document.querySelectorAll('.attr-checkbox').forEach(cb => {
                  if (!cb.disabled && state.hasOwnProperty(cb.value)) {
                      cb.checked = state[cb.value];
                  }
              });
              updateGroupCheckboxes();
          }
      });
  };

  document.querySelectorAll('.group-select').forEach(groupCb => {
      groupCb.addEventListener('change', (e) => {
          const group = e.target.dataset.group;
          const isChecked = e.target.checked;
          document.querySelectorAll(`.attr-checkbox.group-${group}`).forEach(cb => {
              if (!cb.disabled) cb.checked = isChecked;
          });
          saveCheckboxState();
      });
  });

  // Image Option Warning Logic
  document.querySelectorAll('input[name="imgPref"]').forEach(r => {
      r.addEventListener('change', (e) => {
          const warning = document.getElementById('imgWarning');
          if (e.target.value === 'disable') {
              if(warning) warning.style.display = 'block';
          } else {
              if(warning) warning.style.display = 'none';
          }
      });
  });

  function updateGroupCheckboxes() {
      ['core', 'advanced', 'content', 'offer', 'variations', 'performance', 'audit'].forEach(group => {
          const groupCb = document.querySelector(`.group-select[data-group="${group}"]`);
          const items = Array.from(document.querySelectorAll(`.attr-checkbox.group-${group}:not(:disabled)`));
          if (items.length > 0 && groupCb) {
              const allChecked = items.every(cb => cb.checked);
              const someChecked = items.some(cb => cb.checked);

              groupCb.checked = allChecked;
              groupCb.indeterminate = someChecked && !allChecked;
          }
      });

      // Update Template Group Checkboxes
      ['core', 'advanced', 'content'].forEach(group => {
          const groupCb = document.querySelector(`.tpl-group-select[data-group="${group}"]`);
          const items = Array.from(document.querySelectorAll(`.tpl-attr-checkbox.tpl-group-${group}:not(:disabled)`));
          if (items.length > 0 && groupCb) {
              const allChecked = items.every(cb => cb.checked);
              const someChecked = items.some(cb => cb.checked);

              groupCb.checked = allChecked;
              groupCb.indeterminate = someChecked && !allChecked;
          }
      });

      const scraperContainer = document.getElementById('scrapingConfig');
      if (scraperContainer && selectAllCheckbox) {
          const allScraper = Array.from(scraperContainer.querySelectorAll('.attr-checkbox:not(:disabled)'));
          if (allScraper.length > 0) {
              const allChecked = allScraper.every(cb => cb.checked);
              const someChecked = allScraper.some(cb => cb.checked);
              selectAllCheckbox.checked = allChecked;
              selectAllCheckbox.indeterminate = someChecked && !allChecked;
          }
      }

      const auditContainer = document.getElementById('auditConfig');
      if (auditContainer && auditSelectAll) {
          const allAudit = Array.from(auditContainer.querySelectorAll('.audit-checkbox:not(:disabled)'));
          if (allAudit.length > 0) {
              const allChecked = allAudit.every(cb => cb.checked);
              const someChecked = allAudit.some(cb => cb.checked);
              auditSelectAll.checked = allChecked;
              auditSelectAll.indeterminate = someChecked && !allChecked;
          }
      }
  }

  document.querySelectorAll('.attr-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
          saveCheckboxState();
          updateGroupCheckboxes();
      });
  });

  // AOD Checkbox Sync: Removed specific sub-checkboxes, logic handled in getExportData

  if (auditSelectAll) {
      auditSelectAll.addEventListener('change', (e) => {
          document.querySelectorAll('.audit-checkbox').forEach(cb => cb.checked = e.target.checked);
          saveCheckboxState();
          updateGroupCheckboxes();
      });
  }

  const lqsCheckbox = document.querySelector('input[value="lqs"]');
  if (lqsCheckbox) {
      lqsCheckbox.addEventListener('change', (e) => {
          if (e.target.checked) {
              const requiredForLQS = ['metaTitle', 'imgVariantCount', 'bulletsCount', 'description', 'videoCount', 'aPlusImgs', 'rating', 'reviews'];
              requiredForLQS.forEach(val => {
                  const cb = document.querySelector(`input[value="${val}"]`);
                  if (cb && !cb.disabled) cb.checked = true;
              });
              saveCheckboxState();
              updateGroupCheckboxes();
          }
      });
  }

  clearBtn.addEventListener('click', () => {
      if (!clearConfirmationPending) {
          clearConfirmationPending = true;
          clearBtn.textContent = "Confirm: Clear Results?";
          clearBtn.style.background = "#fee2e2";
          clearConfirmMsg.style.display = "block";
      } else {
          // Send active mode to clear only that data
          chrome.runtime.sendMessage({ action: 'CLEAR_DATA', mode: MEGA_MODE });
          clearConfirmationPending = false;
          clearBtn.textContent = "Clear Output / Reset";
          clearBtn.style.background = "var(--surface)";
          clearConfirmMsg.style.display = "none";
          statusDiv.textContent = "Data cleared.";
          progressCountDiv.style.display = 'none'; 
          fileStatus.textContent = "";
          
          if (MEGA_MODE === 'scraper') {
              rawCsvData = []; 
              csvInput.value = "";
              updateTotalInputCount(); // Reset Button State
          }
          
          // Reset Dashboard Stats
          if (statTotal) statTotal.textContent = "0";
          if (statLqs) statLqs.textContent = "0/100";
          if (statIssues) statIssues.textContent = "0";
          if (statDuration) statDuration.textContent = "-";

          // Reset UI
          resultsPlaceholder.style.display = 'block'; 
          dashboardView.style.display = 'none'; 
          downloadBtn.style.display = 'none'; 
          downloadXlsxBtn.style.display = 'none'; 
          pushSheetBtn.style.display = 'none'; 
          pushExcelBtn.style.display = 'none'; 
          clearSection.style.display = 'none'; 
      }
  });

  if (feedbackLink) {
    feedbackLink.addEventListener('click', () => {
        const version = chrome.runtime.getManifest().version;
        const baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeZ4zNH3_Jiov3JnTa5K2VXffCCkDSsh-KvK_h3kIxmbejoIg/viewform';
        const versionFieldId = 'entry.2030262534'; 
        const emailFieldId = 'entry.1847764537'; 
        const params = new URLSearchParams();
        params.append('usp', 'pp_url'); 
        if (versionFieldId) params.append(versionFieldId, version);
        if (IS_LOGGED_IN && USER_INFO && USER_INFO.email && emailFieldId) {
            params.append(emailFieldId, USER_INFO.email);
        }
        const finalUrl = `${baseUrl}?${params.toString()}`;
        chrome.tabs.create({ url: finalUrl });
    });
  }

  // --- Auth Handlers ---
  chrome.storage.local.get(['userSession'], (data) => {
      if (data.userSession) {
          IS_LOGGED_IN = true;
          USER_INFO = data.userSession;
          updateUIForAuth();
      } else {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
              if (token && !chrome.runtime.lastError) {
                  fetchGoogleUserInfo(token);
              } else {
                  updateUIForAuth();
              }
          });
      }
  });

  if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', () => {
          if (loginModal) loginModal.close(); // Close modal on selection
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
              if (chrome.runtime.lastError) {
                  alert("Google Login failed: " + chrome.runtime.lastError.message);
                  return;
              }
              fetchGoogleUserInfo(token);
          });
      });
  }

  function fetchGoogleUserInfo(token) {
      fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(user => {
          const session = {
              provider: 'google',
              name: user.given_name || 'User',
              email: user.email,
              token: token
          };
          handleLoginSuccess(session);
      })
      .catch(err => {
          console.error("User Info Fetch Error:", err);
          statusDiv.textContent = "Error fetching Google profile.";
      });
  }

  if (msLoginBtn) {
      msLoginBtn.addEventListener('click', () => {
          if (loginModal) loginModal.close(); // Close modal on selection
          const redirectUri = chrome.identity.getRedirectURL();
          const scope = "openid profile User.Read email";
          const nonce = Math.random().toString(36).substring(2, 15);
      const authUrl = `${MS_AUTH_URL}?client_id=${MS_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&nonce=${nonce}`;

          chrome.identity.launchWebAuthFlow({
              url: authUrl,
              interactive: true
          }, (responseUrl) => {
              if (chrome.runtime.lastError) {
                  const errMsg = chrome.runtime.lastError.message || "Unknown error";
                  if (errMsg.includes("User cancelled") || errMsg.includes("did not approve")) {
                      console.log("User cancelled login.");
                      statusDiv.textContent = "Login cancelled.";
                  } else {
                      console.error("Auth Flow Error:", errMsg);
                      alert("Login Error: " + errMsg);
                  }
                  return; 
              }
              if (!responseUrl) return;
              try {
                  const url = new URL(responseUrl);
                  const urlParams = new URLSearchParams(url.hash.substring(1)); 
                  const accessToken = urlParams.get("access_token");
                  if (accessToken) {
                      fetchMicrosoftUserInfo(accessToken);
                  }
              } catch(e) {
                  console.error("Microsoft Auth URL Parsing Error:", e);
                  statusDiv.textContent = "Auth Error: Invalid Redirect URL";
              }
          });
      });
  }

  function fetchMicrosoftUserInfo(token) {
      fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(user => {
          const session = {
              provider: 'microsoft',
              name: user.givenName || 'User',
              email: user.mail || user.userPrincipalName,
              token: token
          };
          handleLoginSuccess(session);
      })
      .catch(err => {
          console.error("Microsoft User Info Fetch Error:", err);
          statusDiv.textContent = "Error fetching Microsoft profile.";
      });
  }

  async function handleLoginSuccess(session) {
      IS_LOGGED_IN = true;
      USER_INFO = session;
      chrome.storage.local.set({ userSession: session });

      // Update UI immediately
      updateUIForAuth();
      statusDiv.textContent = `Logged in as ${session.name || session.email}.`;

      // Attempt Firebase Sign-in to enable Firestore access
      try {
          // Note: In a real extension, we would use signInWithCredential(auth, GoogleAuthProvider.credential(session.token))
          // But since we are using a custom/hybrid auth flow without the full Firebase Auth instance wired to the identity provider here,
          // and relying on the "users" collection having relaxed rules or using the email as key (as per previous step),
          // we just proceed to sync.
          // Ideally: await signInWithCredential(auth, GoogleAuthProvider.credential(null, session.token));
          // await fetchFromFirestore(); // Disabled for now
      } catch (e) {
          console.error("Firebase Login Sync Error:", e);
      }
  }

  logoutBtn.addEventListener('click', () => {
      if (currentIsScanning) {
          const confirmLogout = confirm("A scan is currently running. Logging out will STOP the scan.\n\nAre you sure you want to continue?");
          if (!confirmLogout) return;
          chrome.runtime.sendMessage({ action: 'STOP_SCAN' });
      }
      chrome.storage.local.remove('userSession');
      IS_LOGGED_IN = false;
      USER_INFO = null;
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) chrome.identity.removeCachedAuthToken({ token: token }, () => {});
      });
      updateUIForAuth();
      statusDiv.textContent = "Logged out.";
  });

  function updateUIForAuth() {
      const megaModeSwitch = document.getElementById('megaModeSwitch');
      const guestPromo = document.getElementById('guestPromo');

      if (IS_LOGGED_IN) {
          if (loginBtn) loginBtn.style.display = 'none';
          logoutBtn.style.display = 'flex';
          const name = USER_INFO ? (USER_INFO.name || 'User') : 'Pro User';
          logoutBtn.textContent = `Logout (${name})`;
          
          if (guestPromo) guestPromo.style.display = 'none';

          // Show Mega Mode Switch
          if (megaModeSwitch) megaModeSwitch.style.display = 'flex';

          if(tabCatalogueSetup) tabCatalogueSetup.classList.remove('disabled');

          document.querySelectorAll('.pro-feature').forEach(el => { el.disabled = false; el.checked = true; });
          document.querySelectorAll('.group-select').forEach(el => el.disabled = false);
          document.querySelectorAll('.tpl-group-select').forEach(el => el.disabled = false);
          selectAllCheckbox.disabled = false;

          // Auth Blocker for Push Buttons
          if (USER_INFO) {
              if (USER_INFO.provider === 'google') {
                  if(pushExcelBtn) {
                      pushExcelBtn.disabled = true;
                      pushExcelBtn.title = "Login with Microsoft to use Excel Online";
                      pushExcelBtn.style.opacity = '0.5';
                      pushExcelBtn.style.cursor = 'not-allowed';
                  }
                  if(pushSheetBtn) {
                      pushSheetBtn.disabled = false;
                      pushSheetBtn.title = "";
                      pushSheetBtn.style.opacity = '1';
                      pushSheetBtn.style.cursor = 'pointer';
                  }
              } else if (USER_INFO.provider === 'microsoft') {
                  if(pushSheetBtn) {
                      pushSheetBtn.disabled = true;
                      pushSheetBtn.title = "Login with Google to use Sheets";
                      pushSheetBtn.style.opacity = '0.5';
                      pushSheetBtn.style.cursor = 'not-allowed';
                  }
                  if(pushExcelBtn) {
                      pushExcelBtn.disabled = false;
                      pushExcelBtn.title = "";
                      pushExcelBtn.style.opacity = '1';
                      pushExcelBtn.style.cursor = 'pointer';
                  }
              }
          }
      } else {
          // Reset Push Buttons (Guard on click)
          if(pushExcelBtn) { pushExcelBtn.disabled = false; pushExcelBtn.style.opacity = '1'; pushExcelBtn.style.cursor = 'pointer'; pushExcelBtn.title = ""; }
          if(pushSheetBtn) { pushSheetBtn.disabled = false; pushSheetBtn.style.opacity = '1'; pushSheetBtn.style.cursor = 'pointer'; pushSheetBtn.title = ""; }

          if (guestPromo) guestPromo.style.display = 'block';
          if (loginBtn) loginBtn.style.display = 'flex';
          logoutBtn.style.display = 'none';
          
          // Hide Mega Mode Switch & Force Scraper
          if (megaModeSwitch) megaModeSwitch.style.display = 'none';
          document.querySelector('input[name="megaMode"][value="scraper"]').checked = true;
          MEGA_MODE = 'scraper';
          updateMegaModeUI(); // Ensure UI reflects force switch

          // Force switch to Bulk if on restricted tabs
          if ((mode === 'catalogue') && !document.getElementById('stopBtn').offsetParent) tabBulk.click();
          
          if(tabCatalogueSetup) tabCatalogueSetup.classList.add('disabled'); // Disable for guests

          // Unlocked Attributes for Guests (Feature Update)
          document.querySelectorAll('.pro-feature').forEach(el => { 
              el.disabled = false; 
              // Don't auto-uncheck, let them persist or default
          });
          
          // Unlock Groups
          document.querySelectorAll('.group-select').forEach(el => el.disabled = false);
          // Hide Lock Icons in Scraping Config
          document.querySelectorAll('#scrapingConfig .lock-icon').forEach(icon => icon.style.display = 'none');

          // Template items (Auditor) remain locked implicitly via hidden tab, but if visible:
          document.querySelector('.tpl-group-select[data-group="advanced"]').disabled = true;
          document.querySelector('.tpl-group-select[data-group="content"]').disabled = true;
          
          selectAllCheckbox.disabled = false;
      }
      // Always unlock bulk tab now
      tabBulk.classList.remove('disabled');
      if (tabBulk.querySelector('.lock-icon')) tabBulk.querySelector('.lock-icon').style.display = 'none';

      loadCheckboxState(); 
      loadCatalogue();

      if (IS_LOGGED_IN) {
          setTimeout(checkWhatsNew, 1000);
      }
      
      // Update limits display immediately
      updateTotalInputCount();
  }

  // --- Mega Mode Switch Logic ---
  function updateMegaModeUI() {
      document.querySelectorAll('input[name="megaMode"]').forEach(r => {
          if (r.checked) MEGA_MODE = r.value;
      });

      // UI Elements for Config
      const scrapingConfig = document.getElementById('scrapingConfig');
      const auditConfig = document.getElementById('auditConfig');



      // Fetch specific state for the mode
      const stateKey = (MEGA_MODE === 'scraper') ? 'scraperState' : 'auditorState';
      
      chrome.storage.local.get(stateKey, (data) => {
          const state = data[stateKey];
          // Always render state on switch to refresh view
          if (state) renderState(state);
          else {
              // Reset view if no state exists yet (implicit)
              renderState({ isScanning: false, results: [], statusMessage: "Ready.", urlsToProcess: [] });
          }
      });

      // Hide Catalogue Setup Everywhere for now, then show based on mode
      if (tabCatalogueSetup) {
          tabCatalogueSetup.style.display = 'none';
          catalogueSection.style.display = 'none'; // Ensure content hidden too
      }

      if (MEGA_MODE === 'scraper') {
          // Tabs: Show Bulk. Hide Catalogue Setup
          tabBulk.style.display = 'flex';
          
          // Ensure Bulk is expanded by default when switching to Scraper
          if(!tabBulk.classList.contains('expanded')) {
             tabBulk.classList.add('expanded');
             bulkSection.classList.add('expanded');
          }
          bulkSection.style.display = 'block';

          if(tabCatalogueSetup) {
             tabCatalogueSetup.style.display = 'none';
             catalogueSection.style.display = 'none';
          }

          // Config Visibility
          if(scrapingConfig) scrapingConfig.style.display = 'block';
          if(auditConfig) auditConfig.style.display = 'none';

          // Bulk: Hints
          if(bulkHintText) bulkHintText.textContent = "Upload CSV (Headers: ASIN/URL) or Paste ASINs/Links";

          // Set mode
          mode = 'bulk';
          // Ensure Scan Button Visible
          if(scanBtn) {
              scanBtn.style.display = 'block';
              scanBtn.textContent = 'Start Bulk Scraping';
              validateScraperInput(); // Validate initial state
          }

      } else {
          // Auditor Mode
          // Tabs: Hide Bulk. Show Catalogue Setup
          tabBulk.style.display = 'none';
          bulkSection.style.display = 'none';

          if(tabCatalogueSetup) {
             tabCatalogueSetup.style.display = 'flex';
             // Ensure Catalogue is expanded by default
             if(!tabCatalogueSetup.classList.contains('expanded')) {
                 tabCatalogueSetup.classList.add('expanded');
                 catalogueSection.classList.add('expanded');
             }
             catalogueSection.style.display = 'block';
          }

          // Config Visibility
          if(scrapingConfig) scrapingConfig.style.display = 'none';
          if(auditConfig) auditConfig.style.display = 'block';

          // Set mode
          mode = 'catalogue';
          if(scanBtn) scanBtn.style.display = 'none'; // Hide main scan button for Auditor
          
          loadCatalogue();
      }

      // Re-apply Scan State Logic (Visual only, data comes from renderState)
      if (currentIsScanning) {
          if(scanBtn) scanBtn.style.display = 'none';
          if(stopBtn) stopBtn.style.display = 'block';
      } else {
          if(stopBtn) stopBtn.style.display = 'none';
      }
  };

  document.querySelectorAll('input[name="megaMode"]').forEach(radio => {
      radio.addEventListener('change', updateMegaModeUI);
  });

  // --- Logic Load ---
  chrome.storage.local.get(['scraperState', 'auditorState'], (data) => {
      // Determine which state to render based on initial Mega Mode selection (default scraper)
      const initialMegaMode = document.querySelector('input[name="megaMode"]:checked').value;
      const targetKey = (initialMegaMode === 'scraper') ? 'scraperState' : 'auditorState';
      
      const activeState = data[targetKey];
      if (activeState) {
          renderState(activeState);
      }
      
      // Check if ANY scan is running to lock UI regardless of mode
      if ((data.scraperState && data.scraperState.isScanning) || (data.auditorState && data.auditorState.isScanning)) {
          if (data.auditorState && data.auditorState.isScanning) {
              document.querySelector('input[name="megaMode"][value="auditor"]').checked = true;
              updateMegaModeUI(); // Will trigger renderState(auditorState)
          } else if (data.scraperState && data.scraperState.isScanning) {
              document.querySelector('input[name="megaMode"][value="scraper"]').checked = true;
              updateMegaModeUI(); // Will trigger renderState(scraperState)
          }
      } else {
          updateMegaModeUI();
      }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        const currentMode = MEGA_MODE; // 'scraper' or 'auditor'
        
        if (currentMode === 'scraper' && changes.scraperState) {
            renderState(changes.scraperState.newValue);
        }
        else if (currentMode === 'auditor' && changes.auditorState) {
            renderState(changes.auditorState.newValue);
        }
    }
  });

  // Render Marketplaces
  const selectAllDomains = document.getElementById('selectAllDomains');
  
  Object.keys(marketplaceData).forEach(domain => {
      const hasLogic = ZIP_DEFAULTS.hasOwnProperty(domain);
      const icon = hasLogic ? '🟢' : '🔴';
      const tooltip = hasLogic ? "ZipCode logic ready" : "Set ZipCode Manually";
      const defaultZip = ZIP_DEFAULTS[domain] || "Manual";
      const isDisabled = !hasLogic ? "disabled" : "";
      
      const div = document.createElement('div');
      div.className = 'domain-item';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '8px';
      
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.cursor = 'pointer';
      label.style.fontWeight = '500';
      label.style.flex = '1';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'domain-checkbox';
      checkbox.value = domain;
      if (domain === 'Amazon.com') checkbox.checked = true;

      const domainSpan = document.createElement('span');
      domainSpan.style.marginLeft = '6px';
      domainSpan.textContent = domain;

      label.append(checkbox, domainSpan);

      const zipInput = document.createElement('input');
      zipInput.type = 'text';
      zipInput.className = 'domain-zip';
      zipInput.dataset.domain = domain;
      zipInput.value = defaultZip;
      if (isDisabled) zipInput.disabled = true;
      zipInput.placeholder = hasLogic ? 'Zip' : 'Manual';
      zipInput.style.width = '60px';
      zipInput.style.fontSize = '10px';
      zipInput.style.padding = '2px';
      zipInput.style.color = isDisabled ? 'var(--text-muted)' : 'inherit';

      const iconSpan = document.createElement('span');
      iconSpan.title = tooltip;
      iconSpan.style.cursor = 'help';
      iconSpan.style.fontSize = '10px';
      iconSpan.textContent = icon;

      div.append(label, zipInput, iconSpan);
      domainContainer.appendChild(div);
  });

  // Guest Limit: Marketplace Selection (Max 2)
  if (selectAllDomains) {
      selectAllDomains.addEventListener('change', (e) => {
          if (!IS_LOGGED_IN && e.target.checked) {
              e.preventDefault();
              e.target.checked = false;
              alert("Guest Limit: You can only select up to 2 marketplaces manually. Please login for unlimited access.");
              return;
          }
          document.querySelectorAll('.domain-checkbox').forEach(cb => cb.checked = e.target.checked);
      });
  }

  // Individual Domain Checkbox Logic
  domainContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('domain-checkbox')) {
          if (!IS_LOGGED_IN && e.target.checked) {
              const checkedCount = document.querySelectorAll('.domain-checkbox:checked').length;
              if (checkedCount > 2) {
                  e.target.checked = false;
                  alert("Guest Limit: Please log in to select more than 2 marketplaces.");
              }
          }
      }
  });

  // Wrapper for imported buildOrNormalizeUrl to inject current UI state
  // Note: This helper uses the *first* selected domain if single, or loops elsewhere
  const normalizeUrl = (input, specificDomain) => {
      const langPref = document.querySelector('input[name="langPref"]:checked').value;
      let target = specificDomain;
      if (!target) {
          // Fallback to first checked
          const checked = document.querySelector('.domain-checkbox:checked');
          target = checked ? checked.value : 'Amazon.com';
      }
      return buildOrNormalizeUrl(input, target, langPref);
  };

  // Accordion Toggle Logic
  const toggleAccordion = (header, content) => {
      const isExpanded = header.classList.contains('expanded');
      
      if (isExpanded) {
          // Collapse
          header.classList.remove('expanded');
          content.classList.remove('expanded');
          content.style.display = 'none';
      } else {
          // Expand
          header.classList.add('expanded');
          content.classList.add('expanded');
          content.style.display = 'block';
      }
  };

  tabBulk.addEventListener('click', () => {
      // Toggle logic
      toggleAccordion(tabBulk, bulkSection);
      
      // Ensure mode is set if interacting
      if (tabBulk.classList.contains('expanded')) {
          mode = 'bulk';
      }
  });

  if (tabCatalogueSetup) {
      tabCatalogueSetup.addEventListener('click', () => {
          if (!IS_LOGGED_IN) { 
              // Prevent opening if not logged in? Or just alert and don't toggle?
              alert("Please Login to access Catalogue Setup."); 
              return; 
          }
          toggleAccordion(tabCatalogueSetup, catalogueSection);
          
          if (tabCatalogueSetup.classList.contains('expanded')) {
              mode = 'catalogue';
              loadCatalogue();
          }
      });
  }

  // --- Collapsible Groups Logic ---
  document.querySelectorAll('.group-header.collapsible').forEach(header => {
      header.addEventListener('click', (e) => {
          // If clicking checkbox, let it change state but DON'T collapse
          if (e.target.type === 'checkbox' || e.target.closest('input[type="checkbox"]')) return;

          const group = header.closest('.config-group');
          const items = group.querySelector('.group-items');
          
          if (items) {
              const isExpanded = header.classList.contains('expanded');
              if (isExpanded) {
                  header.classList.remove('expanded');
                  items.classList.remove('expanded');
              } else {
                  header.classList.add('expanded');
                  items.classList.add('expanded');
              }
          }
      });
  });


  const handleFileSelect = (file, statusEl, modeType) => {
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

      if (modeType === 'auditor' && !isXlsx) {
          statusEl.textContent = "Error: Only .xlsx files are supported in Auditor Mode.";
          statusEl.style.color = "var(--danger)";
          return;
      }

      if (isXlsx) {
          if (typeof XLSX === 'undefined') {
              statusEl.textContent = "Error: XLSX library not loaded.";
              statusEl.style.color = "var(--danger)";
              return;
          }
          const reader = new FileReader();
          reader.onload = function(e) {
              try {
                  const data = new Uint8Array(e.target.result);
                  const workbook = XLSX.read(data, {type: 'array'});

                  const sheetName = workbook.SheetNames.find(n => n === 'Data') || workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[sheetName];
                  const json = XLSX.utils.sheet_to_json(worksheet, {defval: ""});

                  if (json.length === 0) {
                      statusEl.textContent = "Empty file.";
                      statusEl.style.color = "var(--danger)";
                      return;
                  }

                  if (modeType === 'auditor') {
                      // Auditor Mode Import -> Catalogue
                      const items = json.map(row => {
                          const asin = row['QueryASIN'] || row['ASIN'] || row['asin'];
                          const url = row['URL'] || row['url'];

                          let finalAsin = asin;
                          let finalUrl = url ? normalizeUrl(url) : null;

                          if (!finalAsin && finalUrl) {
                              const m = finalUrl.match(/([a-zA-Z0-9]{10})(?:[/?]|$)/);
                              if (m) finalAsin = m[1];
                          } else if (finalAsin && !finalUrl) {
                              finalUrl = `https://www.amazon.com/dp/${finalAsin}`;
                          }

                          if (!finalAsin) return null;

                          return {
                              asin: finalAsin,
                              url: finalUrl,
                              auditType: 'type2',
                              expected: {
                                  brand: row['Brand'] || row['Approved Brand'] || "",
                                  title: row['SourceTitle'] || row['Approved Title'] || row['Source Title'] || row['Title'] || "",
                                  bullets: row['SourceBullets'] || row['Approved Bullets'] || row['Source Bullets'] || row['Bullets'] || "",
                                  description: row['SourceDescription'] || row['Approved Description'] || row['Source Description'] || row['Description'] || ""
                              },
                              comparisonData: {
                                  expected_title: row['SourceTitle'] || row['Approved Title'] || row['Source Title'] || row['Title'],
                                  expected_bullets: row['SourceBullets'] || row['Approved Bullets'] || row['Source Bullets'] || row['Bullets'],
                                  expected_description: row['SourceDescription'] || row['Approved Description'] || row['Source Description'] || row['Description'],
                                  expected_brand: row['Brand'] || row['Approved Brand'],

                                  expected_rating: row['ReferenceRating'] || row['Reference Rating'],
                                  expected_reviews: row['ReferenceReviews'] || row['Reference Reviews'],
                                  expected_bsr: row['ReferenceBSR'] || row['Reference BSR'],

                                  expected_images: row['ApprovedImagesJSON'] || row['Approved Images JSON'] || row['Approved Images'],
                                  expected_video_titles: row['ApprovedVideoTitles'] || row['Approved Video Titles'],

                                  expected_brand_story: row['ApprovedBrandStoryPreviewLink'] || row['Approved Brand Story Preview Link'] || row['Approved Brand Story Images'],
                                  expected_aplus: row['ApprovedA+ModulePreviewLink'] || row['Approved A+ Module Preview Link'] || row['Approved A+ Modules'],

                                  expected_comparison: row['ApprovedComparisonASINs'] || row['Approved Comparison ASINs'],
                                  expected_comparison_link: row['ApprovedComparisonModulePreviewLink'] || row['Approved Comparison Module Preview Link'] || row['Comparison Module Link'],

                                  expected_variation_parent: row['ParentASIN'] || row['Parent ASIN'],
                                  expected_variation_theme: row['ApprovedVariationTheme'] || row['Approved Variation Theme'],
                                  expected_variation_family: row['ApprovedVariationFamily'] || row['Approved Variation Family'] || row['Child ASINs'],

                                  expected_price: row['ApprovedPrice'] || row['Approved Price'],

                                  expected_ships_from: row['ApprovedShipsFrom'] || row['Approved ShipsFrom'],
                                  expected_sold_by: row['ApprovedSoldBy'] || row['Approved SoldBy'],

                                  expected_seller: row['ApprovedSeller'] || row['Approved Seller'],

                                  expected_delivery_days: row['ExpectedDeliveryDays'] || row['Expected Delivery Days'] || row['Max Delivery Days'] || row['Expected Timeline']
                              }
                          };
                      }).filter(Boolean);

                      if (items.length > 0) {
                          openSaveToCatalogueModal(items);
                          statusEl.textContent = `File parsed (${items.length} items). Please confirm save.`;
                          statusEl.style.color = "var(--primary)";
                      } else {
                          statusEl.textContent = "No valid ASIN/URL found in file.";
                          statusEl.style.color = "var(--danger)";
                      }

                  } else {
                      // Bulk Scraper Mode (Simple List)
                      const list = json.map(r => r['URL'] || r['ASIN'] || r['url'] || r['asin']).filter(Boolean);
                      rawCsvData = list;
                      statusEl.textContent = `Loaded ${list.length} items from XLSX.`;
                      statusEl.style.color = "var(--success)";
                      updateTotalInputCount();
                  }
              } catch(err) {
                  console.error(err);
                  statusEl.textContent = "Error parsing XLSX.";
                  statusEl.style.color = "var(--danger)";
              }
          };
          reader.readAsArrayBuffer(file);
      } else {
          // Legacy CSV Logic (Scraper Mode Only)
          const reader = new FileReader();
          reader.onload = function(event) {
              const text = event.target.result;
              const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
              if (lines.length === 0) return;

              const firstLine = lines[0].toLowerCase();

              // Scraper Bulk CSV
              if (firstLine.includes(',') && (firstLine.includes('url') || firstLine.includes('asin'))) {
                  const headers = csvLineParser(lines[0]).map(h => h.toLowerCase().replace(/['"]+/g, ''));
                  const urlIndex = headers.findIndex(h => h.includes('url') || h.includes('asin'));
                  const titleIndex = headers.findIndex(h => h.includes('expected title'));
                  const bulletIndex = headers.findIndex(h => h.includes('expected bullets'));

                  if (urlIndex === -1) { statusEl.textContent = "Error: Missing URL/ASIN column."; return; }

                  const structuredData = [];
                  for (let i = 1; i < lines.length; i++) {
                      const cols = csvLineParser(lines[i]);
                      if (cols[urlIndex]) {
                          structuredData.push({
                              url: cols[urlIndex].replace(/['"]+/g, ''),
                              expected: {
                                  title: titleIndex !== -1 ? cols[titleIndex].replace(/['"]+/g, '') : null,
                                  bullets: bulletIndex !== -1 ? cols[bulletIndex].replace(/['"]+/g, '') : null
                              }
                          });
                      }
                  }
                  rawCsvData = structuredData;
                  statusEl.textContent = `Loaded ${structuredData.length} structured rows.`;
              } else {
                  rawCsvData = lines.map(line => line.trim());
                  statusEl.textContent = `Loaded ${lines.length} lines.`;
              }
              statusEl.style.color = "var(--success)";
              updateTotalInputCount();
          };
          reader.readAsText(file);
      }
  };

  const validateScraperInput = () => {
      let hasInput = false;
      // 1. Check Text Area
      if (bulkInput && bulkInput.value.trim().length > 0) {
          hasInput = true;
      }
      // 2. Check CSV Data
      if (rawCsvData && rawCsvData.length > 0) {
          hasInput = true;
      }

      if (scanBtn) {
          if (hasInput) {
              scanBtn.disabled = false;
              scanBtn.classList.remove('disabled');
          } else {
              scanBtn.disabled = true;
              scanBtn.classList.add('disabled');
          }
      }
  };

  const updateTotalInputCount = () => {
      let inputs = [];
      // 1. Get from Text Area
      if (bulkInput && bulkInput.value.trim()) {
          inputs = bulkInput.value.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
      }
      // 2. Get from CSV (rawCsvData)
      if (rawCsvData && rawCsvData.length > 0) {
          const csvItems = rawCsvData.map(item => {
              if (typeof item === 'string') return item;
              if (item.url) return item.url;
              if (item.asin) return item.asin;
              return null;
          }).filter(Boolean);
          inputs = [...inputs, ...csvItems];
      }

      const uniqueCount = new Set(inputs).size;
      if (inputCountDisplay) {
          const limitMsg = !IS_LOGGED_IN && uniqueCount > GUEST_LIMIT ? ` (Limit: ${GUEST_LIMIT} applied)` : "";
          inputCountDisplay.textContent = `Loaded: ${uniqueCount} items${limitMsg}`;
          if (!IS_LOGGED_IN && uniqueCount > GUEST_LIMIT) inputCountDisplay.style.color = "var(--danger)";
          else inputCountDisplay.style.color = "var(--text-muted)";
      }
      validateScraperInput();
  };

  bulkInput.addEventListener('input', updateTotalInputCount);
  csvInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], fileStatus, 'bulk'));
  // auditorInput removed in favor of catalogueInput, removing listener to fix ReferenceError
  // if (auditorInput) auditorInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], auditorFileStatus, 'auditor'));

  // loadFromCatalogueBtn logic is removed as it's no longer in the UI (integrated into main flow)

  // --- Template Downloads ---

  if (downloadCatalogueTemplateBtn) {
      downloadCatalogueTemplateBtn.addEventListener('click', () => {
          // Prepare active rules based on selected audit types
          const selectedAudits = Array.from(document.querySelectorAll('.audit-checkbox:checked')).map(cb => cb.value);

          if (selectedAudits.length === 0) {
              alert("Please select at least one Audit type in the Configuration (Auditor Mode) to generate a template.");
              return;
          }

          const activeRules = [];
          
          selectedAudits.forEach(auditKey => {
              const config = AUDIT_TEMPLATE_CONFIG[auditKey];
              if (config && config.columns) {
                  config.columns.forEach(col => {
                      const renamedCol = COLUMN_RENAMES[col] || col;
                      activeRules.push({ target: renamedCol });
                  });
              }
          });

          // Also inject Custom Rules
          customRules.forEach(rule => {
              if (rule.isActive) {
                  activeRules.push({ target: rule.name });
              }
          });

          // Hand off to the pipeline to generate the template
          generateTemplate(activeRules);
      });
  }

  if (downloadAuditTemplateBtn) { // Bulk Type 2 Template
      downloadAuditTemplateBtn.addEventListener('click', () => {
          if (typeof XLSX === 'undefined') { alert("XLSX library not found."); return; }
          const headers = ["URL", "Expected Title", "Expected Bullets"];
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet([headers]);
          XLSX.utils.book_append_sheet(wb, ws, "Bulk Template");
          XLSX.writeFile(wb, "Bulk_Comparison_Template.xlsx");
      });
  }

  const extractAsin = (input) => {
      input = input.trim();
      if (!input) return null;

      // 1. Check if plain ASIN (10 alphanumeric)
      if (/^[A-Z0-9]{10}$/.test(input)) return input;

      // 2. Check URL patterns
      try {
          // If it doesn't look like a URL (no protocol), try prepending https:// to test URL parsing,
          // though usually input from CSV might be "amazon.com/..."
          let urlStr = input.startsWith('http') ? input : 'https://' + input;
          const urlObj = new URL(urlStr);

          // Filter out Vendor Central / Seller Central
          if (urlObj.hostname.includes('vendorcentral') || urlObj.hostname.includes('sellercentral')) return null;

          // Must be Amazon
          if (!urlObj.hostname.includes('amazon') && !urlObj.hostname.includes('amzn')) return null;

          // Extract ASIN from path
          // Supports /dp/ASIN, /gp/product/ASIN, /product/ASIN
          const match = input.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
          if (match) return match[1].toUpperCase();

      } catch (e) {
          // Ignore invalid URL errors
      }
      return null;
  };

  scanBtn.addEventListener('click', async () => {
    let urlsToProcess = [];

    if (mode === 'auditor') {
        if (!IS_LOGGED_IN) { alert("Login required."); return; }
        if (rawCsvData.length === 0) { alert("No Data Loaded."); return; }

        // Use rawCsvData which should be populated by the auditor input parser
        urlsToProcess = rawCsvData.map(d => {
             if (d.auditType === 'type2') {
                 return d;
             }
             return d;
        }).flat().filter(Boolean);

        // --- Auto-Enable Scraping Fields based on Audit Selection ---
        // Get selected audit types
        const selectedAudits = Array.from(document.querySelectorAll('.audit-checkbox:checked')).map(cb => cb.value);

        // Map NEW Audit Checkboxes to Scraping Fields
        const auditMap = {
            'auditContent': ['metaTitle', 'bullets', 'bulletsCount', 'hasBullets', 'description', 'hasDescription'],
            'auditGrowth': ['rating', 'reviews', 'bsr'],
            'auditImage': ['imgVariantCount', 'imgVariantDetails'],
            'auditVideo': ['videoCount', 'hasVideo', 'videos'],
            'auditBrandStory': ['hasBrandStory', 'brandStoryImgs'],
            'auditAplus': ['hasAplus', 'aPlusImgs'],
            'auditComparison': ['comparisonAsins'],
            'auditVariation': ['variationExists', 'variationCount', 'variationTheme', 'variationFamily'],
            'auditBuyBox': ['displayPrice', 'shipsFrom', 'soldBy'],
            'auditDelivery': ['deliveryLocation', 'primeOrFastestDeliveryDate', 'freeDeliveryDate', 'paidDeliveryDate']
        };

        // Ensure required fields are checked

        // We modify the DOM checkboxes so `getExportData` and logic picks them up
        Object.keys(auditMap).forEach(auditKey => {
            if (selectedAudits.includes(auditKey)) {
                auditMap[auditKey].forEach(field => {
                    const cb = document.querySelector(`.attr-checkbox[value="${field}"]`);
                    if (cb) {
                        cb.checked = true;
                        cb.disabled = false; // Ensure enabled
                    }
                });
            }
        });

        // Auto-Enable AOD Offer Count if AOD Scrape is enabled (For Auditor Mode)
        const scrapeAODCb = document.querySelector('.attr-checkbox[value="scrapeAOD"]');
        if (scrapeAODCb && scrapeAODCb.checked) {
             // We don't have a checkbox for aodTotalOfferCount, but we need it in export.
             // We handle this in getExportData by forcing it if scrapeAOD is true.
        }
        // Save state so it persists
        saveCheckboxState();

    } else {
       // Bulk / CSV Mode (Replaces old 'Watchlist' Logic)
       // This covers "Start Bulk Scraping"

       let inputs = [];

       // 1. Get from Text Area
       if (bulkInput && bulkInput.value.trim()) {
           inputs = bulkInput.value.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
       }

       // 2. Get from CSV (rawCsvData)
       if (rawCsvData && rawCsvData.length > 0) {
           // rawCsvData can be strings or objects depending on parse
           const csvItems = rawCsvData.map(item => {
               if (typeof item === 'string') return item;
               if (item.url) return item.url;
               if (item.asin) return item.asin;
               return null;
           }).filter(Boolean);
           inputs = [...inputs, ...csvItems]; // Combine both sources
       }

       if (inputs.length === 0) { alert("Please provide ASINs via CSV or Input Box."); return; }

       // 3. Process & Reconstruct
       const uniqueUrls = new Set();
       urlsToProcess = [];

       const selectedDomains = Array.from(document.querySelectorAll('.domain-checkbox:checked')).map(cb => cb.value);
       if (selectedDomains.length === 0) { alert("Please select at least one Marketplace."); return; }

       let targetLang = document.querySelector('input[name="langPref"]:checked').value;

       // Sequential Generation per Domain
       selectedDomains.forEach(targetDomain => {
           inputs.forEach(raw => {
               const inputStr = String(raw).trim();
               // Check if it's already a URL
               if (inputStr.includes('amazon.') && (inputStr.startsWith('http') || inputStr.startsWith('www'))) {
                   let cleanUrl = inputStr;
                   if(!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
                   // If user provides a direct URL, we respect it, BUT if multiple domains are selected, 
                   // we can't easily "translate" a URL to another domain without extracting ASIN.
                   // Strategy: If explicit URL matches targetDomain, keep it. If ASIN, build it.
                   // If URL matches *another* domain, do we skip? 
                   // The requirement is "Scrape a list of ASINs across multiple marketplaces". 
                   // So we focus on ASINs. If explicit URL provided, we try to extract ASIN and rebuild for the target domain.
                   
                   const asin = extractAsin(inputStr);
                   if (asin) {
                        const newUrl = buildOrNormalizeUrl(asin, targetDomain, targetLang);
                        if (newUrl && !uniqueUrls.has(newUrl)) {
                            uniqueUrls.add(newUrl);
                            urlsToProcess.push(newUrl);
                        }
                   } else {
                        // Just a URL without clear ASIN, check if it matches current domain loop
                        if (cleanUrl.includes(targetDomain) && !uniqueUrls.has(cleanUrl)) {
                            uniqueUrls.add(cleanUrl);
                            urlsToProcess.push(cleanUrl);
                        }
                   }
               } else {
                   // Treat as ASIN
                   const asin = extractAsin(inputStr);
                   if (asin) {
                       const newUrl = buildOrNormalizeUrl(asin, targetDomain, targetLang);
                       if (newUrl && !uniqueUrls.has(newUrl)) {
                           uniqueUrls.add(newUrl);
                           urlsToProcess.push(newUrl);
                       }
                   }
               }
           });
       });

       if(!IS_LOGGED_IN && urlsToProcess.length > GUEST_LIMIT) {
           urlsToProcess = urlsToProcess.slice(0, GUEST_LIMIT);
           statusDiv.textContent = `Guest limit applied: Processing first ${GUEST_LIMIT} items only. Login to remove limit.`;
       }

       if(urlsToProcess.length === 0) { alert("No valid ASINs or URLs found."); return; }
    }

    const scrapeAODCb = document.querySelector('.attr-checkbox[value="scrapeAOD"]');

    // Warn User about Focus Requirement
    if (scrapeAODCb && scrapeAODCb.checked) {
        const userConfirmed = confirm(
            "⚠️ AOD Scraping Warning\n\n" +
            "To capture ALL offers, this process will force tabs to the foreground.\n" +
            "This may interrupt your work. Please leave the system idle until the scan completes.\n\n" +
            "Continue?"
        );
        if (!userConfirmed) return;
    }

    // Reset duration (now handled in background)
    if(statDuration) statDuration.textContent = "Running...";

    // Collapse Sections
    if (bulkSection) bulkSection.classList.add('collapsed');
    const scrapingConfig = document.getElementById('scrapingConfig');
    if (scrapingConfig) scrapingConfig.classList.add('collapsed');

    // Prepare Domain-Zip Map
    const domainZipMap = {};
    const selectedDomains = Array.from(document.querySelectorAll('.domain-checkbox:checked')).map(cb => cb.value);
    
    selectedDomains.forEach(d => {
        const zipInput = document.querySelector(`.domain-zip[data-domain="${d}"]`);
        domainZipMap[d] = zipInput ? zipInput.value.trim() : (ZIP_DEFAULTS[d] || "");
    });

    const currentWindow = await chrome.windows.getCurrent();
    const disableImages = document.querySelector('input[name="imgPref"]:checked').value === 'disable';
    const batchMode = document.querySelector('input[name="batchMode"]:checked').value;
    const batchSize = parseInt(document.getElementById('fixedBatchSize').value) || 5;
    const batchWait = parseInt(document.getElementById('fixedBatchWait').value) || 15;

    const settings = {
        disableImages: (mode !== 'current' && disableImages),
        scrapeAOD: scrapeAODCb ? scrapeAODCb.checked : false,
        domainZipMap: domainZipMap,
        batchMode: batchMode,
        batchSize: Math.min(Math.max(batchSize, 1), 30),
        batchWait: Math.max(batchWait, 1),
        // Legacy support (though processBatch will use domainZipMap)
        zipcode: "" 
    };
    chrome.runtime.sendMessage({ 
        action: 'START_SCAN', 
        payload: { 
            urls: urlsToProcess, 
            mode, 
            settings,
            targetWindowId: currentWindow.id 
        } 
    });
  });

  stopBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to stop the current scan? This will terminate all operations immediately.")) {
          chrome.runtime.sendMessage({ action: 'STOP_SCAN' });
      }
  });

  function renderState(state) {
      if (!state) return;
      const { isScanning, processedCount, results, startTime, endTime, agentStatus } = state;
      const total = (state.urlsToProcess || []).length;
      
      currentIsScanning = isScanning;

      // Update Duration Display Live
      if (startTime) {
          const end = isScanning ? Date.now() : (endTime || Date.now());
          const diff = end - startTime;
          const seconds = Math.floor(diff / 1000);
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          if (statDuration) statDuration.textContent = `${m}m ${s}s`;
      } else {
          if (statDuration) statDuration.textContent = "-";
      }

      // Update Agent Console
      if (isScanning && agentStatus) {
          if (resultsPlaceholder) resultsPlaceholder.style.display = 'none';
          if (agentConsole) agentConsole.style.display = 'block';
          
          // Status Message with Animation
          if (agentStatusMsg) {
              // Only animate if text changed to avoid flickering on every tick
              if (agentStatusMsg.textContent !== state.statusMessage) {
                  agentStatusMsg.textContent = state.statusMessage || "Working...";
                  agentStatusMsg.classList.remove('typing-effect');
                  void agentStatusMsg.offsetWidth; // Trigger reflow
                  agentStatusMsg.classList.add('typing-effect');
              }
          }

          if (agentModeBadge) agentModeBadge.textContent = (state.mode === 'catalogue' ? "AUDITOR" : "SCRAPER");
          
          // Move Processed Count Here
          if (agentProgress) agentProgress.textContent = `${processedCount} / ${total}`;

          if (agentCurrentDomain) agentCurrentDomain.textContent = agentStatus.currentDomain || "-";
          if (agentNextDomain) agentNextDomain.textContent = agentStatus.nextDomain || "-";
          if (agentBatchSize) agentBatchSize.textContent = agentStatus.batchSize || "0";
          
          // Countdown Timer (Dynamic)
          if (agentTimer) {
              if (agentStatus.nextBatchIn && agentStatus.nextBatchIn > Date.now()) {
                  if (window.agentCountdownInterval) clearInterval(window.agentCountdownInterval);
                  
                  const updateTimer = () => {
                      const diff = agentStatus.nextBatchIn - Date.now();
                      if (diff > 0) {
                          const s = Math.ceil(diff / 1000);
                          agentTimer.textContent = `${s}s`;
                          agentTimer.style.color = "#f87171";
                      } else {
                          agentTimer.textContent = "Now";
                          agentTimer.style.color = "#34d399";
                          clearInterval(window.agentCountdownInterval);
                      }
                  };
                  updateTimer(); // Init
                  window.agentCountdownInterval = setInterval(updateTimer, 1000);
              } else {
                  if (window.agentCountdownInterval) clearInterval(window.agentCountdownInterval);
                  agentTimer.textContent = "Now";
                  agentTimer.style.color = "#34d399";
              }
          }

          // Agent Note Logic
          const agentNote = document.querySelector('.agent-note');
          if (agentNote) {
              if (state.settings && state.settings.scrapeAOD) {
                  agentNote.textContent = "* Keep window open (AOD Active)";
                  agentNote.style.color = "var(--danger)";
              } else {
                  agentNote.textContent = "Agent is working. You can continue your other work.";
                  agentNote.style.color = "var(--success)";
              }
          }
          
          // Hide redundant status/progress divs outside console
          if (statusDiv) statusDiv.style.display = 'none';
          if (progressCountDiv) progressCountDiv.style.display = 'none';

      } else {
          if (agentConsole) agentConsole.style.display = 'none';
          if (statusDiv) statusDiv.style.display = 'block';
          // Ensure statusDiv has content if we switch back
          if (statusDiv) statusDiv.textContent = state.statusMessage;
      }

      // Legacy Progress Count fallback if console not active but processing? 
      // Actually, if isScanning is true, console is active.
      // If NOT scanning, we might show total processed summary in the old place?
      if (!isScanning && total > 0) {
          progressCountDiv.style.display = 'block';
          progressCountDiv.textContent = `Processed: ${processedCount} / ${total}`;
      }

      if (previousIsScanning && !isScanning && results && results.length > 0) {
          // Auto-download disabled per user request
          // setTimeout(() => downloadBtn.click(), 500);
      }
      previousIsScanning = isScanning;

      if (isScanning) {
          scanBtn.style.display = 'none';
          stopBtn.style.display = 'block';
          progressContainer.style.display = 'block';
          downloadBtn.style.display = 'none';
          downloadXlsxBtn.style.display = 'none'; 
          pushSheetBtn.style.display = 'none'; 
          pushExcelBtn.style.display = 'none'; 
          downloadErrorsBtn.style.display = 'none';
          clearSection.style.display = 'none';
          dashboardView.style.display = 'none';
          // resultsPlaceholder logic moved to Agent Console block above to prevent conflict
          
          // Strict Locking: Use 'collapsed' class which is now enforced by CSS
          if(bulkSection) {
              bulkSection.classList.add('collapsed');
              bulkSection.style.display = 'none'; // Double down for safety
          }
          if(catalogueSection) {
              catalogueSection.style.display = 'none';
          }
          const scrapingConfig = document.getElementById('scrapingConfig');
          if(scrapingConfig) {
              scrapingConfig.classList.add('collapsed');
              scrapingConfig.style.display = 'none'; 
          }

      } else {
          scanBtn.style.display = 'block';
          stopBtn.style.display = 'none';
          progressContainer.style.display = 'none';
          
          if (results && results.length > 0) {
              downloadBtn.style.display = 'block';
              downloadXlsxBtn.style.display = 'block'; 
              pushSheetBtn.style.display = 'block'; 
              pushExcelBtn.style.display = 'block'; 
              clearSection.style.display = 'block';
              resultsPlaceholder.style.display = 'none'; 

              // Check for errors to show/hide the error download button
              const hasErrors = results.some(r => r.error);
              if (hasErrors) {
                  downloadErrorsBtn.style.display = 'block';
              } else {
                  downloadErrorsBtn.style.display = 'none';
              }

              updateDashboard(results);

              // Force Expand Bulk Panel if in Bulk Mode (even with results)
              if (mode === 'bulk') {
                  if(tabBulk && !tabBulk.classList.contains('expanded')) {
                      tabBulk.classList.add('expanded');
                  }
                  if(bulkSection) {
                      bulkSection.style.display = 'block';
                      bulkSection.classList.remove('collapsed');
                      bulkSection.classList.add('expanded');
                  }
                  const scrapingConfig = document.getElementById('scrapingConfig');
                  if(scrapingConfig) {
                      scrapingConfig.style.display = 'block';
                      scrapingConfig.classList.remove('collapsed');
                      scrapingConfig.classList.add('expanded');
                  }
              }
          } else {
              downloadBtn.style.display = 'none';
              downloadXlsxBtn.style.display = 'none';
              pushSheetBtn.style.display = 'none';
              pushExcelBtn.style.display = 'none';
              downloadErrorsBtn.style.display = 'none';
              clearSection.style.display = 'none';
              resultsPlaceholder.style.display = 'block'; 
              
              if (mode === 'bulk') { 
                  // Ensure Bulk Panel and Marketplace Panel (scrapingConfig) are expanded on complete
                  if(tabBulk && !tabBulk.classList.contains('expanded')) {
                      tabBulk.classList.add('expanded');
                  }
                  if(bulkSection) { 
                      bulkSection.style.display = 'block'; 
                      bulkSection.classList.remove('collapsed');
                      bulkSection.classList.add('expanded');
                  }

                  const scrapingConfig = document.getElementById('scrapingConfig');
                  if(scrapingConfig) { 
                      scrapingConfig.style.display = 'block'; 
                      scrapingConfig.classList.remove('collapsed'); 
                      scrapingConfig.classList.add('expanded');
                  }
              }
              else if (mode === 'catalogue') { if(catalogueSection) catalogueSection.style.display = 'block'; }
          }
      }
      
      if (countdownInterval) clearInterval(countdownInterval);
      // If status message indicates waiting or processing, visually enhance it
      statusDiv.textContent = state.statusMessage;

      // Legacy timer logic removed as delays are now handled in background async flow
      // We can rely on background status updates which now include "Processing X - Y..."
  }

  function updateDashboard(results) {
      let totalLqs = 0; let issueCount = 0; let mismatchCount = 0;
      results.forEach(item => {
          if (item.attributes && item.attributes.lqs) {
              const score = parseInt(item.attributes.lqs.split('/')[0]);
              if (!isNaN(score)) totalLqs += score;
              if (score < 70) issueCount++;
          }
          if (item.expected && item.attributes.metaTitle !== item.expected.title) mismatchCount++;
      });
      const avg = results.length ? Math.round(totalLqs / results.length) : 0;
      statTotal.textContent = results.length;
      statLqs.textContent = avg + '/100';
      statIssues.textContent = mismatchCount > 0 ? `${mismatchCount} Diff` : issueCount;

      // Duration is updated in renderState now using persistent storage

      resultsPlaceholder.style.display = 'none';
      dashboardView.style.display = 'grid';
  }

  const getExportData = async () => {
    const stateKey = (MEGA_MODE === 'scraper') ? 'scraperState' : 'auditorState';
    const data = await chrome.storage.local.get(stateKey);
    let results = data[stateKey] ? data[stateKey].results : [];
    if (!results || results.length === 0) return null;

    // --- Type 2 Audit & Draft Merge Logic ---
    // If multiple results exist for same ID (one PDP, one VC, Drafts), merge them.
    if (MEGA_MODE === 'auditor') {
        const mergedMap = new Map();
        
        // 1. First Pass: Identify Parents and Collect Drafts
        const drafts = [];
        
        results.forEach(res => {
            if (res.isDraft) {
                drafts.push(res);
            } else {
                const id = res.id || res.queryASIN || res.attributes?.mediaAsin || res.url; 
                if (!mergedMap.has(id)) mergedMap.set(id, {});
                const existing = mergedMap.get(id);

                if (res.isVC) {
                    existing.vcData = res; 
                } else {
                    existing.pdpData = res; 
                }
                if (res.comparisonData) existing.comparisonData = res.comparisonData;
            }
        });

        // 2. Attach Drafts to Parents
        drafts.forEach(draft => {
            const parentId = draft.parentAsin;
            if (mergedMap.has(parentId)) {
                const parent = mergedMap.get(parentId);
                if (!parent.drafts) parent.drafts = {};
                parent.drafts[draft.draftType] = draft;
            }
        });

        // 3. Flatten back to array
        results = Array.from(mergedMap.values()).map(merged => {
            const base = merged.pdpData || merged.vcData;
            if (!base) return null;
            // Attach merged parts
            base.vcData = merged.vcData;
            base.comparisonData = merged.comparisonData;
            
            // Attach Draft Data to Attributes for Auditor Engine
            if (merged.drafts) {
                if (!base.attributes) base.attributes = {};
                if (merged.drafts.brandStory) {
                    base.attributes.draftBrandStoryData = merged.drafts.brandStory.attributes?.brandStoryImgs;
                }
                if (merged.drafts.aplus) {
                    base.attributes.draftAplusData = merged.drafts.aplus.attributes?.aPlusImgs;
                    // Also merge Carousel A+ from draft if needed? 
                    // content.js extracts aPlusCarouselImgs separately.
                    // Let's attach both for completeness.
                    base.attributes.draftAplusCarouselData = merged.drafts.aplus.attributes?.aPlusCarouselImgs;
                }
            }
            return base;
        }).filter(Boolean);
    }

    const checkedValues = Array.from(document.querySelectorAll('.attr-checkbox:checked')).map(cb => cb.value);
    let selectedFields = [...new Set([...forcedFields, ...checkedValues])];

    // Map merged checkbox "shipsSoldMerged" to actual fields "shipsFrom" and "soldBy"
    if (selectedFields.includes('shipsSoldMerged')) {
        selectedFields = selectedFields.filter(f => f !== 'shipsSoldMerged');
        selectedFields.push('shipsFrom');
        selectedFields.push('soldBy');
        // Auto-include IsBuyBoxOwner when shipping info is requested
        selectedFields.push('IsBuyBoxOwner');
    }

    // Map merged checkbox "comparisonDetailsGroup" to actual fields
    if (selectedFields.includes('comparisonDetailsGroup')) {
        selectedFields = selectedFields.filter(f => f !== 'comparisonDetailsGroup');
        selectedFields.push('presentASINinCompChart');
        selectedFields.push('comparisonAsins');
    }

    // Auto-include ParentASIN if any variation field is selected
    const variationFields = ['variationExists', 'variationCount', 'variationTheme', 'variationFamily', 'variationFamilyDetails', 'variationFamilyAsinsMap'];
    if (selectedFields.some(f => variationFields.includes(f))) {
        selectedFields.push('parentAsin');
    }
    
    // Force Include AOD Count & Amazon Details if AOD was Scraped
    // Check if the 'scrapeAOD' option was enabled (via checkbox or logic) or if we have results
    const scrapeAODCb = document.querySelector('.attr-checkbox[value="scrapeAOD"]');
    const isAodEnabled = (scrapeAODCb && scrapeAODCb.checked);

    // We include these fields if the feature was enabled, regardless of data presence (to keep columns consistent)
    // Or strictly if data is present. The request implies "If 'Scrap All offer' is checked... included in output".
    if (isAodEnabled) {
        selectedFields.push('aodTotalOfferCount');
        selectedFields.push('AOD_amazon_price');
        selectedFields.push('AOD_amazon_basePrice');
        selectedFields.push('AOD_amazon_shipsFrom');
        selectedFields.push('AOD_amazon_soldBy');
        selectedFields.push('AOD_amazon_deliveryDate');
    }

    // Filter based on Mega Mode Strictness
    const ALLOWED_SET = (MEGA_MODE === 'scraper') ? SCRAPING_COLUMNS : AUDIT_COLUMNS;
    selectedFields = selectedFields.filter(f => ALLOWED_SET.includes(f) || forcedFields.includes(f));

    // Sort fields based on MASTER_COLUMNS sequence
    const finalFields = [];
    MASTER_COLUMNS.forEach(col => {
        if (selectedFields.includes(col.key)) {
            finalFields.push(col.key);
        }
    });
    
    // Add active Custom Rules headers
    if (customRules && customRules.length > 0) {
        customRules.forEach(rule => {
            if (rule.isActive) {
                finalFields.push(rule.name);
            }
        });
    }


    const now = new Date();
    const pad = (num) => num.toString().padStart(2, '0');
    
    let fileNamePrefix = "LA-Scraping-Report";
    if (MEGA_MODE === 'auditor') fileNamePrefix = "LA-Auditing-Report";
    const fileName = `${fileNamePrefix}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    // Helper map for quick header lookup
    const keyToHeader = {};
    MASTER_COLUMNS.forEach(c => keyToHeader[c.key] = c.header);

    // Construct Header list with correct order
    const finalHeaders = finalFields.map(f => keyToHeader[f] || f);
    
    // Add Comparison Headers if Audit Mode
    if (MEGA_MODE === 'auditor') {
        // Add Summary Column first (after metadata)
        finalHeaders.splice(10, 0, "Audit Failures"); // Insert after MetaTitle

        const selectedAudits = Array.from(document.querySelectorAll('.audit-checkbox:checked')).map(cb => cb.value);
        
        // Helper to add headers if audit active
        const addIfActive = (key, headers) => {
            if (selectedAudits.includes(key)) {
                headers.forEach(h => {
                    if (!finalHeaders.includes(h)) finalHeaders.push(h);
                });
            }
        };

        addIfActive('auditContent', ["Expected Title", "Match Title", "Expected Bullets", "Match Bullets", "Expected Description", "Match Description"]);
        addIfActive('auditGrowth', ["Expected Rating", "Match Rating", "Expected Reviews", "Match Reviews"]);
        addIfActive('auditImage', ["Expected Images", "Match Images"]);
        addIfActive('auditVideo', ["Expected Video Count", "Match Video Count"]);
        addIfActive('auditBrandStory', ["Expected Brand Story", "Match Brand Story"]);
        addIfActive('auditAplus', ["Expected A+ Modules", "Match A+ Modules"]);
        addIfActive('auditComparison', ["Expected Comparison ASINs", "Match Comparison ASINs"]);
        addIfActive('auditVariation', ["Expected Variation Count", "Match Variation Count", "Expected Variation Theme", "Match Variation Theme"]);
        addIfActive('auditBuyBox', ["Expected Seller", "Match Seller", "Expected Price", "Match Price"]);
        addIfActive('auditDelivery', ["Expected Max Days", "Actual Delivery", "Match Delivery"]);
        addIfActive('auditVisuals', ["Visual Audit Status", "Visual Note"]);

    } else {
        // Legacy Catalogue Comparison (if scraping mode but catalogue used)
        const hasExpectedData = results.some(r => r.expected);
        if (hasExpectedData) {
            finalHeaders.push("Expected Title", "Title Match", "Expected Bullets", "Bullets Match", "Initial Price", "Price Change");
        }
    }

    let csvHeader = finalHeaders.join(",") + "\n";

    const cleanField = (text) => {
      if (text === null || text === undefined || text === 'none') return '"none"';
      if (typeof text === 'object') return `"${JSON.stringify(text).replace(/"/g, '""')}"`;
      return `"${String(text).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    };

    // --- Tab Data Containers ---
    const tabsData = [];
    const createTab = (name, headers) => ({ name, headers, rows: [] });

    // Only create tabs if the parent field is selected
    const tabMap = {};
    const countTrackers = { variationFamily: 0, bullets: 0, brandStoryImgs: 0, aPlusImgs: 0, aPlusCarouselImgs: 0, videos: 0 };

    if (MEGA_MODE === 'scraper') {
        if (selectedFields.includes('variationFamily')) tabMap.variationFamily = createTab('Variation_Family', ['pageASIN', 'parent_asin', 'variation_family_count']);
        if (selectedFields.includes('bullets')) tabMap.bullets = createTab('Bullets', ['pageASIN', 'bullet_count']);
        if (selectedFields.includes('brandStoryImgs')) tabMap.brandStoryImgs = createTab('Brand_Story_Images', ['pageASIN', 'brand_story_image_count']);
        if (selectedFields.includes('aPlusImgs')) tabMap.aPlusImgs = createTab('A_Plus_Images', ['pageASIN', 'aplus_image_count']);
        if (selectedFields.includes('aPlusCarouselImgs')) tabMap.aPlusCarouselImgs = createTab('A_Plus_Carousel_Images', ['pageASIN', 'aplus_carousel_image_count']);
        if (selectedFields.includes('videos')) tabMap.videos = createTab('Videos', ['pageASIN', 'video_count']);
        if (selectedFields.includes('imgVariantDetails')) tabMap.imgVariantDetails = createTab('All_Variant_Images', ['pageASIN', 'variant', 'ASIN.Variant', 'hiRes', 'large']);

        // Always create Offers tab if data exists, or conditionally? Let's check results first.
        // If ANY result has aodData, we create the Offers tab.
        const hasAOD = results.some(r => r.attributes && r.attributes.aodData && r.attributes.aodData.length > 0);
        if (hasAOD) tabMap.offers = createTab('AOD_Offers_Data', ['pageASIN', 'price', 'base_price', 'ships_from', 'sold_by', 'rating', 'reviews', 'delivery_time']);
    } else {
        // Auditor Mode - Audit Point Tabs
        tabMap.auditContent = createTab('Content_Audit', ['QueryASIN', 'Expected Title', 'PDP Title', 'Match Title', 'Expected Bullets', 'PDP Bullets', 'Match Bullets', 'Missing Bullets (On PDP)', 'Extra Bullets (On PDP)', 'Expected Description', 'PDP Description', 'Match Description']);
        tabMap.auditGrowth = createTab('Growth_Audit', ['QueryASIN', 'Reference Rating', 'PDP Rating', 'Match Rating', 'Reference Reviews', 'PDP Reviews', 'Match Reviews']);
        tabMap.auditMedia = createTab('Media_Audit', ['QueryASIN', 'Audit Note', 'Expected Images', 'Expected Images Count', 'PDP Images', 'PDP Images Count', 'Matches on Amazon PDP', 'Missing on Amazon PDP', 'Extra on Amazon PDP', 'Expected Images Self-Duplicated', 'PDP Images Self-Duplicated', 'PDP PageURL', 'VC/SC PageURL']);
        tabMap.auditBrandStory = createTab('Brand_Story_Audit', ['QueryASIN', 'Expected Brand Story', 'Match Brand Story']);
        tabMap.auditAplus = createTab('A_Plus_Audit', ['QueryASIN', 'Expected A+ Modules', 'Match A+ Modules']);
        tabMap.auditComparison = createTab('Comparison_Audit', ['QueryASIN', 'Expected Comparison ASINs', 'Match Comparison ASINs']);
        tabMap.auditVariation = createTab('Variation_Audit', ['QueryASIN', 'Expected Variation Count', 'Match Variation Count', 'Expected Variation Theme', 'Match Variation Theme']);
        tabMap.auditBuyBox = createTab('BuyBox_Audit', ['QueryASIN', 'Expected Price', 'Match Price', 'Expected Seller', 'Match Seller']);
        tabMap.auditDelivery = createTab('Delivery_Audit', ['QueryASIN', 'Expected Max Days', 'Actual Delivery', 'Match Delivery']);
        tabMap.auditVisuals = createTab('AI_Visual_Audit', ['QueryASIN', 'Visual Audit Status', 'Note', 'Analysis JSON']);
    }

    const rows = await Promise.all(results.map(async tabData => {
        let rowStatus = "SUCCESS";
        if (tabData.error) {
            rowStatus = "ERROR";
        } else {
            const qAsin = tabData.queryASIN || 'none';
            const pAsin = (tabData.attributes && tabData.attributes.mediaAsin) ? tabData.attributes.mediaAsin : 'none';
            if (qAsin !== 'none' && pAsin !== 'none' && qAsin !== pAsin) rowStatus = "ASIN Redirect";
        }

        const row = {};
        
        if (tabData.error) {
             finalFields.forEach(f => {
                 let val = '';
                 if (f === 'status') val = "ERROR";
                 else if (f === 'url') val = tabData.url || '';
                 else if (f === 'marketplace') val = tabData.error;
                 // Ensure QueryASIN is populated even for errors
                 else if (f === 'queryASIN') {
                     val = tabData.queryASIN;
                     if (!val || val === "none") {
                         if (tabData.attributes && tabData.attributes.mediaAsin) val = tabData.attributes.mediaAsin;
                     }
                     if (!val || val === "none") {
                         const match = (tabData.url || '').match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
                         if (match) val = match[1];
                     }
                     val = val || 'none';
                 }
                 row[keyToHeader[f] || f] = val;
             });
        } else {
            const pageASIN = tabData.attributes.mediaAsin || 'none';
            
            finalFields.forEach(id => {
                // Check if id is a custom rule name
                if (customRules && customRules.some(r => r.name === id && r.isActive)) {
                    const rule = customRules.find(r => r.name === id);
                    let val = (tabData.attributes && tabData.attributes.customAttributes) ? tabData.attributes.customAttributes[rule.id] : "none";
                    row[id] = (val !== null && val !== undefined) ? val : "none";
                    return; // skip rest of loop for this id
                }
                
                let val = 'none';
                if (id === 'status') {
                    val = rowStatus;
                } else if (id === 'stockStatus' && rowStatus === "ASIN Redirect") {
                    val = "ASIN Redirected";
                } else {
                    const config = fieldConfig[id];
                    if (config) {
                        if (config.type === 'attr') {
                            val = tabData.attributes[id];
                            // Ensure objects/arrays are stringified for CSV/Main Sheet
                            if (val && typeof val === 'object') {
                                val = JSON.stringify(val);
                            }
                        }
                        else if (config.type === 'root') val = tabData[id];
                        else if (config.type === 'calc') {
                          if (id === 'imgVariantCount') val = tabData.data ? tabData.data.length : 0;
                          else if (id === 'imgVariantDetails') {
                            val = tabData.data ? JSON.stringify(tabData.data.map(item => ({
                                variant: item.variant,
                                hiRes: cleanAmazonUrl(item.hiRes),
                                large: cleanAmazonUrl(item.large)
                            }))) : [];
                          }
                          else if (id === 'IsBuyBoxOwner') {
                              // Logic: Check if ShipsFrom AND SoldBy contain "Amazon" (or domain)
                              const sf = (tabData.attributes.shipsFrom || '').toLowerCase();
                              const sb = (tabData.attributes.soldBy || '').toLowerCase();
                              const mp = (tabData.attributes.marketplace || 'Amazon').toLowerCase();

                              // Extract "Amazon" or domain part to be safe
                              const domainKeyword = mp.includes('amazon') ? 'amazon' : mp;

                              if (sf.includes(domainKeyword) && sb.includes(domainKeyword)) {
                                  val = "Yes";
                              } else {
                                  val = "No";
                              }
                          }
                        }

                        // Handle Count Fields (Default to 0 instead of none)
                        if (config.isCount) {
                            if (val === undefined || val === null || val === "" || val === "none") {
                                val = 0;
                            } else {
                                // Ensure it's a numeric integer
                                const parsed = parseInt(val, 10);
                                val = isNaN(parsed) ? 0 : parsed;
                            }
                        }
                    }
                }
                row[keyToHeader[id] || id] = val;
            });

            // --- Populate Extra Tabs ---
            if (MEGA_MODE === 'scraper') {
                if (tabMap.variationFamily) {
                    let vFamilies = [];
                    try {
                        let raw = tabData.attributes.variationFamily;
                        if (raw && raw !== 'none') {
                            if (Array.isArray(raw)) {
                                vFamilies = raw;
                            } else if (typeof raw === 'string') {
                                // Fix for format: [ASIN1, ASIN2, ...] which might not be valid JSON if not quoted
                                if (raw.startsWith('[') && raw.endsWith(']')) {
                                    // Strip brackets and split by comma
                                    const cleanContent = raw.slice(1, -1);
                                    vFamilies = cleanContent.split(',').map(s => s.trim().replace(/['"]+/g, '')).filter(s => s.length > 0);
                                } else {
                                    vFamilies = JSON.parse(raw);
                                }
                            }
                        }
                    } catch(e) { console.error("Error parsing variationFamily:", e); }

                    if (Array.isArray(vFamilies) && vFamilies.length > 0) {
                        if (vFamilies.length > countTrackers.variationFamily) countTrackers.variationFamily = vFamilies.length;
                        const parentAsin = tabData.attributes.parentAsin || 'none';
                        tabMap.variationFamily.rows.push([pageASIN, parentAsin, vFamilies.length, ...vFamilies]);
                    }
                }
                if (tabMap.bullets) {
                    const bText = tabData.attributes.bullets;
                    if (bText && bText !== 'none') {
                        const bList = bText.split('|').map(s => s.trim());
                        if (bList.length > countTrackers.bullets) countTrackers.bullets = bList.length;
                        tabMap.bullets.rows.push([pageASIN, bList.length, ...bList]);
                    }
                }
                if (tabMap.brandStoryImgs) {
                    const bs = tabData.attributes.brandStoryImgs;
                    if (Array.isArray(bs) && bs.length > 0) {
                        const urls = bs.map(item => item['brand-story-image']);
                        if (urls.length > countTrackers.brandStoryImgs) countTrackers.brandStoryImgs = urls.length;
                        tabMap.brandStoryImgs.rows.push([pageASIN, urls.length, ...urls]);
                    }
                }
                if (tabMap.aPlusImgs) {
                    const ap = tabData.attributes.aPlusImgs;
                    if (Array.isArray(ap) && ap.length > 0) {
                        const urls = ap.map(item => item['a-plus-image']);
                        if (urls.length > countTrackers.aPlusImgs) countTrackers.aPlusImgs = urls.length;
                        tabMap.aPlusImgs.rows.push([pageASIN, urls.length, ...urls]);
                    }
                }
                if (tabMap.aPlusCarouselImgs) {
                    const apc = tabData.attributes.aPlusCarouselImgs;
                    if (Array.isArray(apc) && apc.length > 0) {
                const urls = apc.map(item => item['a-plus-courosal-image'] || item['a-plus-carousel-image']);
                        if (urls.length > countTrackers.aPlusCarouselImgs) countTrackers.aPlusCarouselImgs = urls.length;
                        tabMap.aPlusCarouselImgs.rows.push([pageASIN, urls.length, ...urls]);
                    }
                }
                if (tabMap.videos) {
                    const vids = tabData.attributes.videos;
                    if (Array.isArray(vids) && vids.length > 0) {
                        const urls = vids.map(item => item['video_url']);
                        if (urls.length > countTrackers.videos) countTrackers.videos = urls.length;
                        tabMap.videos.rows.push([pageASIN, urls.length, ...urls]);
                    }
                }
                if (tabMap.imgVariantDetails) {
                    if (tabData.data && Array.isArray(tabData.data)) {
                        tabData.data.forEach(d => {
                            tabMap.imgVariantDetails.rows.push([
                                pageASIN, 
                                d.variant, 
                                `${pageASIN}.${d.variant}`,
                                cleanAmazonUrl(d.hiRes), 
                                cleanAmazonUrl(d.large)
                            ]);
                        });
                    }
                }
                if (tabMap.offers && tabData.attributes.aodData) {
                    tabData.attributes.aodData.forEach(offer => {
                        tabMap.offers.rows.push([
                            pageASIN,
                            offer.price || 'none',
                            offer.aodBasePrice || 'none',
                            offer.shipsFrom || 'none',
                            offer.soldBy || 'unknown',
                            offer.rating || 'none',
                            offer.reviews || 'none',
                            offer.sellerDeliveryTime || 'none'
                        ]);
                    });
                }
            }
        }

        // --- Audit Mode Comparisons (Use Standard Engine) ---
        if (MEGA_MODE === 'auditor') {
            let auditReport = null; // Declare in broader scope

            // Safety Check: Ensure attributes exist
            if (!tabData.attributes) {
                // If attributes are missing (e.g. error occurred), fill with Errors or N/A
                row["Audit Failures"] = "ERROR";
                const headers = ["Title", "Bullets", "Description", "Rating", "Reviews", "Video Count", "Variation Count", "Variation Theme", "Seller", "Price"];
                headers.forEach(h => { row[`Expected ${h}`] = "N/A"; row[`Match ${h}`] = "ERROR"; });
                row["Expected Images"] = "N/A"; row["Match Images"] = "ERROR";
                row["Expected Brand Story"] = "N/A"; row["Match Brand Story"] = "ERROR";
                row["Expected A+ Modules"] = "N/A"; row["Match A+ Modules"] = "ERROR";
                row["Expected Comparison ASINs"] = "N/A"; row["Match Comparison ASINs"] = "ERROR";
                row["Expected Max Days"] = "N/A"; row["Actual Delivery"] = "ERROR"; row["Match Delivery"] = "ERROR";
            } else {
                let visualData = null;
                // Gather visual data if AI Visual Audit is enabled (mock conditions for Phase 2)
                const isAiVisualEnabled = document.querySelector('.audit-checkbox[value="auditVisuals"]')?.checked;
                if (isAiVisualEnabled) {
                    visualData = {
                        targetImagesBase64: uploadedTargetImagesBase64.length > 0 ? uploadedTargetImagesBase64 : (tabData.comparisonData?.expected_images || []),
                        liveImageUrls: tabData.data?.map(img => img.hiRes || img.large) || []
                    };
                }

                auditReport = await runAuditComparison(
                    // Live Data (Attributes + Data array)
                    { ...tabData.attributes, data: tabData.data }, 
                    // Source Data (Comparison Data from Template)
                    tabData.comparisonData || {},
                    customRules,
                    visualData
                );

                // Build Audit Summary
                const failures = [];
                // Flatten all details
                Object.values(auditReport.results).forEach(cat => {
                    if (cat.passed === false) {
                        if (cat.details && cat.details.length > 0) {
                            cat.details.forEach(d => {
                                if (!d.passed) failures.push(d.label);
                            });
                        } else {
                            // If category failed but no details (unlikely but safe fallback)
                            failures.push("Unknown");
                        }
                    }
                });
                row["Audit Failures"] = failures.length > 0 ? failures.join(", ") : "PASS";

                // Map Report Results to Row Columns
                // Helper to set row values from audit detail
                const setRow = (label, detail) => {
                    row[`Expected ${label}`] = detail ? (detail.expected || "N/A") : "N/A";
                    if (detail) {
                        if (detail.passed) {
                             // Use specific note if available (e.g., "Smart Match", "Reordered")
                             const note = detail.note;
                             if (note && note !== "Matched") {
                                 // Clean up "Passed (Reordered)" -> "Reordered" if needed
                                 const cleanNote = note.replace("Passed (Reordered)", "Reordered");
                                 row[`Match ${label}`] = `TRUE (${cleanNote})`;
                             } else {
                                 row[`Match ${label}`] = "TRUE";
                             }
                        } else {
                             // Failure with reason
                             const note = detail.note;
                             row[`Match ${label}`] = note ? `FALSE (${note})` : "FALSE";
                        }
                    } else {
                        row[`Match ${label}`] = "N/A";
                    }
                };

                const r = auditReport.results;

                setRow("Title", r.content?.details.find(d => d.label === "Title"));
                setRow("Bullets", r.content?.details.find(d => d.label === "Bullets"));
                setRow("Description", r.content?.details.find(d => d.label === "Description"));
                
                setRow("Rating", r.growth?.details.find(d => d.label === "Rating"));
                setRow("Reviews", r.growth?.details.find(d => d.label === "Reviews"));

                // Images: Aggregate or specific? Sidepanel logic was 'list'. Engine returns details per image.
                // Simplified: If any fail, fail. Engine sets category passed=false.
                // We use the category pass/fail for "Match Images" if precise breakdown not in column.
                // But user column is "Match Images".
                row["Expected Images"] = tabData.comparisonData?.expected_images || "N/A";
                row["Match Images"] = r.images?.passed ? "TRUE" : "FALSE";

                setRow("Video Count", r.video?.details.find(d => d.label === "Video Count"));
                
                row["Expected Brand Story"] = tabData.comparisonData?.expected_brand_story || "N/A";
                row["Match Brand Story"] = r.brandStory?.passed ? "TRUE" : "FALSE"; // Logic simplified in Engine

                row["Expected A+ Modules"] = tabData.comparisonData?.expected_aplus || "N/A";
                row["Match A+ Modules"] = r.aplus?.passed ? "TRUE" : "FALSE";

                // Comparison ASINs
                row["Expected Comparison ASINs"] = tabData.comparisonData?.expected_comparison || "N/A";
                row["Match Comparison ASINs"] = r.comparison?.passed ? "TRUE" : "FALSE";

                setRow("Variation Count", r.variation?.details.find(d => d.label === "Variation Count"));
                setRow("Variation Theme", r.variation?.details.find(d => d.label === "Variation Theme"));
                
                setRow("Seller", r.buybox?.details.find(d => d.label === "Sold By")); // Map "Seller" col to SoldBy check
                setRow("Price", r.buybox?.details.find(d => d.label === "Price"));

                // Delivery
                row["Expected Max Days"] = tabData.comparisonData?.expected_delivery_days || "N/A";
                row["Actual Delivery"] = tabData.attributes.primeOrFastestDeliveryDate || tabData.attributes.freeDeliveryDate || "N/A";
                row["Match Delivery"] = (tabData.comparisonData?.expected_delivery_days) ? "MANUAL" : "N/A";

                // Visuals
                const visualDetail = r.visuals?.details?.[0];
                row["Visual Audit Status"] = visualDetail ? (visualDetail.passed ? "PASS" : "FAIL") : "N/A";
                row["Visual Note"] = visualDetail ? visualDetail.note : "N/A";
            }

            // Populate Audit Point Tabs (for all rows, preserving QAsin order)
            // Use tabData directly for reliability, fallback to row if needed
            const queryAsin = tabData.queryASIN || row[keyToHeader['queryASIN']] || 'none';
            
            const comp = tabData.comparisonData || {};

            if (tabMap.auditContent) {
                const bulletDetails = auditReport ? auditReport.results.content?.details.find(d => d.label === "Bullets") : null;
                const missingBullets = bulletDetails?.missing ? bulletDetails.missing.join(" | ") : "none";
                const extraBullets = bulletDetails?.extra ? bulletDetails.extra.join(" | ") : "none";
                const pdpTitle = tabData.attributes ? (tabData.attributes.metaTitle || 'none') : 'none';
                const pdpBullets = tabData.attributes ? (tabData.attributes.bullets || 'none') : 'none';
                const pdpDesc = tabData.attributes ? (tabData.attributes.description || 'none') : 'none';

                tabMap.auditContent.rows.push([
                    queryAsin, 
                    comp.expected_title || 'N/A', pdpTitle, row['Match Title'], 
                    comp.expected_bullets || 'N/A', pdpBullets, row['Match Bullets'], missingBullets, extraBullets, 
                    comp.expected_description || 'N/A', pdpDesc, row['Match Description']
                ]);
            }

            if (tabMap.auditGrowth) {
                const pdpRating = tabData.attributes ? (tabData.attributes.rating || '0') : '0';
                const pdpReviews = tabData.attributes ? (tabData.attributes.reviews || '0') : '0';
                tabMap.auditGrowth.rows.push([
                    queryAsin, 
                    comp.expected_rating || 'N/A', pdpRating, row['Match Rating'], 
                    comp.expected_reviews || 'N/A', pdpReviews, row['Match Reviews']
                ]);
            }

            if (tabMap.auditMedia) {
                // Media Analysis
                const imgResult = auditReport ? auditReport.results.images : null;
                const analysis = imgResult?.analysis || {};
                
                const expCount = (comp.expected_images && Array.isArray(JSON.parse(JSON.stringify(comp.expected_images || [])))) ? comp.expected_images.length : (imgResult?.details[0]?.expected || 0);
                
                const pdpImagesCount = tabData.attributes ? (tabData.attributes.imgVariantCount || 0) : 0;
                // Get PDP Images as JSON or list
                const pdpImages = tabData.attributes && tabData.attributes.imgVariantDetails ? JSON.stringify(tabData.attributes.imgVariantDetails) : "[]";
                
                const matches = analysis.matches ? analysis.matches.join(' | ') : "none";
                const missing = analysis.missing ? analysis.missing.join(' | ') : "none";
                const extra = analysis.extra ? analysis.extra.join(' | ') : "none";
                const dupeExp = analysis.duplicatesSource ? analysis.duplicatesSource.join(', ') : "none";
                const dupeLive = analysis.duplicatesLive ? analysis.duplicatesLive.join(', ') : "none";
                const pdpUrl = tabData.url || (tabData.attributes ? tabData.attributes.url : "none");
                const vcUrl = row['VC PageURL'] || "none";

                // Ensure expected_images is a string if it's an object/array
                let expImagesStr = comp.expected_images || 'N/A';
                if (typeof expImagesStr === 'object') expImagesStr = JSON.stringify(expImagesStr);

                tabMap.auditMedia.rows.push([
                    queryAsin, 
                    row['Audit Note'], 
                    expImagesStr, expCount, 
                    pdpImages, pdpImagesCount, 
                    matches, missing, extra, 
                    dupeExp, dupeLive, 
                    pdpUrl, vcUrl
                ]);
            }

            if (tabMap.auditBrandStory) tabMap.auditBrandStory.rows.push([queryAsin, comp.expected_brand_story || 'N/A', row['Match Brand Story']]);
            if (tabMap.auditAplus) tabMap.auditAplus.rows.push([queryAsin, comp.expected_aplus || 'N/A', row['Match A+ Modules']]);
            if (tabMap.auditComparison) tabMap.auditComparison.rows.push([queryAsin, comp.expected_comparison || 'N/A', row['Match Comparison ASINs']]);
            if (tabMap.auditVariation) tabMap.auditVariation.rows.push([queryAsin, comp.expected_variation_count || 'N/A', row['Match Variation Count'], comp.expected_variation_theme || 'N/A', row['Match Variation Theme']]);
            if (tabMap.auditBuyBox) tabMap.auditBuyBox.rows.push([queryAsin, comp.expected_price || 'N/A', row['Match Price'], comp.expected_seller || 'N/A', row['Match Seller']]);
            if (tabMap.auditDelivery) tabMap.auditDelivery.rows.push([queryAsin, comp.expected_delivery_days || 'N/A', row['Actual Delivery'], row['Match Delivery']]);
            if (tabMap.auditVisuals) {
                const visualDetail = auditReport ? auditReport.results.visuals?.details?.[0] : null;
                tabMap.auditVisuals.rows.push([
                    queryAsin,
                    row['Visual Audit Status'],
                    row['Visual Note'],
                    visualDetail ? JSON.stringify(visualDetail.analysis || {}) : "{}"
                ]);
            }

        } else if (tabData.expected && !tabData.error) {
            // Legacy Watchlist Comparison
            const expTitle = tabData.expected.title || "none";
            const actTitle = tabData.attributes.metaTitle || "none";
            const titleMatch = (expTitle !== "none" && expTitle === actTitle) ? "TRUE" : (expTitle === "none" ? "-" : "FALSE");
            row['Expected Title'] = expTitle;
            row['Title Match'] = titleMatch;

            const expBullets = tabData.expected.bullets || "none";
            const actBullets = tabData.attributes.bullets || "none";
            const bulletMatch = (expBullets !== "none" && expBullets === actBullets) ? "TRUE" : (expBullets === "none" ? "-" : "FALSE");
            row['Expected Bullets'] = expBullets;
            row['Bullets Match'] = bulletMatch;

            const initPrice = tabData.expected.price || "none";
            const currPrice = tabData.attributes.displayPrice || "none";
            const priceChange = (initPrice !== "none" && initPrice !== currPrice) ? "CHANGED" : "-";
            row['Initial Price'] = initPrice;
            row['Price Change'] = priceChange;
        } else {
            // Fill empty if needed, or leave undefined
        }
        
        // Generate CSV Line from row object using header order
        const rowStr = finalHeaders.map(h => cleanField(row[h])).join(",");
        return { rowObj: row, csvLine: rowStr };
    }));

    // --- Update Dynamic Headers for Tabs ---
    if (tabMap.variationFamily) {
        for(let i=1; i<=countTrackers.variationFamily; i++) tabMap.variationFamily.headers.push(`child_ASIN${i}`);
    }
    if (tabMap.bullets) {
        for(let i=1; i<=countTrackers.bullets; i++) tabMap.bullets.headers.push(`bullet_${i}`);
    }
    if (tabMap.brandStoryImgs) {
        for(let i=1; i<=countTrackers.brandStoryImgs; i++) tabMap.brandStoryImgs.headers.push(`image_${i}`);
    }
    if (tabMap.aPlusImgs) {
        for(let i=1; i<=countTrackers.aPlusImgs; i++) tabMap.aPlusImgs.headers.push(`image_${i}`);
    }
    if (tabMap.aPlusCarouselImgs) {
        for(let i=1; i<=countTrackers.aPlusCarouselImgs; i++) tabMap.aPlusCarouselImgs.headers.push(`image_${i}`);
    }
    if (tabMap.videos) {
        for(let i=1; i<=countTrackers.videos; i++) tabMap.videos.headers.push(`video_url_${i}`);
    }

    Object.values(tabMap).forEach(tab => tabsData.push(tab));

    return { 
        rows: rows.map(r => r.rowObj), 
        fileName, 
        csvContent: csvHeader + rows.map(r => r.csvLine).join("\n"),
        headers: finalHeaders,
        tabsData // Secondary tabs
    };
  };

  downloadBtn.addEventListener('click', async () => {
    const exportData = await getExportData();
    if (!exportData) return;
    const blob = new Blob([exportData.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", exportData.fileName + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  downloadErrorsBtn.addEventListener('click', async () => {
    const stateKey = (MEGA_MODE === 'scraper') ? 'scraperState' : 'auditorState';
    const data = await chrome.storage.local.get(stateKey);
    const results = data[stateKey] ? data[stateKey].results : [];
    if (!results || results.length === 0) return;

    const failedItems = results.filter(r => r.error);
    if (failedItems.length === 0) {
        alert("No errors to export.");
        return;
    }

    const headers = ["URL", "ASIN", "Error Message"];
    let csvContent = headers.join(",") + "\n";

    failedItems.forEach(item => {
        const url = item.url || "none";
        // Robust ASIN extraction for failed items
        let asin = item.queryASIN;
        if (!asin || asin === "none") {
            if (item.attributes && item.attributes.mediaAsin) asin = item.attributes.mediaAsin;
        }
        if (!asin || asin === "none") {
            // Try extracting from URL as fallback
            const match = url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
            if (match) asin = match[1];
        }
        
        const finalAsin = asin || "none";
        const errorMsg = item.error ? item.error.replace(/,/g, " ") : "Unknown Error";

        csvContent += `"${url}","${finalAsin}","${errorMsg}"\n`;
    });

    const now = new Date();
    const pad = (num) => num.toString().padStart(2, '0');
    const fileName = `Listing-Auditor_Errors_${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  downloadXlsxBtn.addEventListener('click', async () => {
      const exportData = await getExportData();
      if (!exportData) return;
      if (typeof XLSX === 'undefined') {
          alert("XLSX library not loaded. Please ensure xlsx.full.min.js is in the extension folder.");
          return;
      }
      const wb = XLSX.utils.book_new();
      const dashData = [
          ["Audit Summary", ""],
          ["Total Audited", document.getElementById('statTotal').textContent],
          ["Average LQS", document.getElementById('statLqs').textContent],
          ["Issues / Mismatches", document.getElementById('statIssues').textContent],
          ["Audit Duration", document.getElementById('statDuration').textContent],
          ["Date", new Date().toLocaleString()]
      ];
      const wsDash = XLSX.utils.aoa_to_sheet(dashData);
      XLSX.utils.book_append_sheet(wb, wsDash, "Dashboard");

      // --- Build Main Sheet with Super Headers ---
      const headers = exportData.headers;
      
      // Determine Super Header Ranges
      const superHeaderRow = [];
      const mergeRanges = [];
      
      // We map prefixes or known blocks to Super Headers
      // Logic: Iterate headers, check membership in groups.
      // Groups: Identity (Start), Audit Status (Summary), Content Audit, Growth, Images, etc.
      
      let currentGroup = "";
      let startCol = 0;

      headers.forEach((h, idx) => {
          let group = "Attributes"; // Default
          
          if (["status", "listing_quality_score", "lqs_breakdown", "marketplace", "delivery_location", "query_asin", "page_asin", "page_url", "brand", "item_name"].includes(h) || h === "Status") group = "Product Identity";
          else if (h === "Audit Failures") group = "Audit Status";
          else if (h.includes("Audit Note") || h.includes("Matches on") || h.includes("Missing on")) group = "Legacy Audit";
          else if (h.includes("stock_status") || h.includes("price") || h.includes("buy_box") || h.includes("ships_from") || h.includes("sold_by") || h.includes("Approved Price") || h.includes("Match Price") || h.includes("Approved Seller")) group = "Offer & BuyBox";
          else if (h.includes("delivery") || h.includes("Expected Max Days") || h.includes("Actual Delivery") || h.includes("Match Delivery")) group = "Delivery";
          else if (h.includes("bullet") || h.includes("description") || h.includes("Title") || h.includes("Brand")) group = "Content Analysis"; // Catch "Expected Title" etc.
          else if (h.includes("rating") || h.includes("reviews") || h.includes("rank") || h.includes("Growth")) group = "Growth Metrics";
          else if (h.includes("image") || h.includes("video") || h.includes("aplus") || h.includes("brand_story")) group = "Media & Visuals";
          else if (h.includes("variation") || h.includes("parent_asin")) group = "Variations";
          else if (h.includes("comparison") || h.includes("chart")) group = "Comparison Module";
          else if (h.includes("aod")) group = "All Offers (AOD)";

          // Refine: "Expected Title" and "Match Title" fall into Content Analysis
          // Check logic flow: If group changes, push previous merge.
          
          if (group !== currentGroup) {
              if (idx > 0) {
                  // Close previous group
                  // Range: startCol to idx - 1
                  if (idx - 1 > startCol) { // Only merge if > 1 col? No, merge single too for consistent look
                      mergeRanges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: idx - 1 } });
                  }
                  // Fill the gap in superHeaderRow? 
                  // Actually, for merged cells, only the top-left cell needs the value.
              }
              currentGroup = group;
              startCol = idx;
              superHeaderRow[idx] = group;
          } else {
              superHeaderRow[idx] = null; // Placeholder
          }
      });
      // Close last group
      if (headers.length - 1 >= startCol) {
          mergeRanges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: headers.length - 1 } });
      }

      // Build Sheet Data (AoA)
      // Row 0: Super Headers
      // Row 1: Main Headers
      // Row 2+: Data
      
      // Convert Row Objects to Arrays matching Headers
      const dataRows = exportData.rows.map(r => headers.map(h => r[h]));
      
      const wsMain = XLSX.utils.aoa_to_sheet([superHeaderRow, headers, ...dataRows]);
      
      // Apply Merges
      wsMain['!merges'] = mergeRanges;

      // Styling: Center Super Headers (Basic Property if supported by writer, else ignored)
      // SheetJS CE doesn't support writing styles, but the structure helps regardless.
      
      const mainSheetName = (MEGA_MODE === 'auditor') ? "Audits_Data" : "Scrapped_Data";
      XLSX.utils.book_append_sheet(wb, wsMain, mainSheetName);

      // Append Secondary Tabs (Split View) - Locked for Guests
      if (IS_LOGGED_IN && exportData.tabsData) {
          exportData.tabsData.forEach(tab => {
              const ws = XLSX.utils.aoa_to_sheet([tab.headers, ...tab.rows]);
              XLSX.utils.book_append_sheet(wb, ws, tab.name);
          });
      } else if (!IS_LOGGED_IN) {
          // Add Notice to Dashboard
          XLSX.utils.sheet_add_aoa(wsDash, [
              [""], 
              ["NOTE", "Split View (Variations, Images, etc.) tabs are available for Logged-In Users only."]
          ], {origin: -1});
      }

      XLSX.writeFile(wb, exportData.fileName + ".xlsx");
  });

  // --- Google Sheets Logic ---
  pushSheetBtn.addEventListener('click', () => {
    if (!IS_LOGGED_IN) { alert("🔒 Pro Feature: Please Login to push data to Google Sheets."); return; }
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) { alert("Google Auth failed."); return; }
        createAndPushSheet(token);
    });
  });
  async function getOrCreateDriveFolder(token, folderName) {
      // 1. Search for Folder
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
      const searchRes = await fetch(searchUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      const searchData = await searchRes.json();

      if (searchData.files && searchData.files.length > 0) {
          return searchData.files[0].id;
      }

      // 2. Create Folder if not found
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder'
          })
      });
      const createData = await createRes.json();
      return createData.id;
  }

  async function createAndPushSheet(token) {
      statusDiv.textContent = "Checking Google Drive Folder...";
      try {
          const exportData = await getExportData(); if(!exportData) return;
          
          const folderId = await getOrCreateDriveFolder(token, "Listing Auditor For Amazon");
          statusDiv.textContent = "Creating Google Sheet...";

          // Prepare Sheets array for creation
          const mainSheetName = (MEGA_MODE === 'auditor') ? "Audits_Data" : "Scrapped_Data";
          const sheets = [{ properties: { title: mainSheetName } }];
          const dataToPush = [];

          // Main Data
          const mainValues = [exportData.headers]; 
          exportData.rows.forEach(r => { mainValues.push(exportData.headers.map(h => r[h])); });
          dataToPush.push({ range: `'${mainSheetName}'!A1`, values: mainValues });

          // Secondary Tabs
          if (exportData.tabsData) {
              exportData.tabsData.forEach(tab => {
                  sheets.push({ properties: { title: tab.name } });
                  const tabValues = [tab.headers, ...tab.rows];
                  dataToPush.push({ range: `'${tab.name}'!A1`, values: tabValues });
              });
          }

          // Create Spreadsheet with all sheets IN the folder (Drive API used implicitly by Sheets if separate, but here we can't set parent easily in create call of Sheets API v4?)
          // Sheets API v4 `create` doesn't support `parents` directly in the request body for the spreadsheet resource.
          // We must use Drive API to move it or create it via Drive API then convert?
          // Actually, Sheets API v4 creates in root. We can then move it.
          // OR we can create metadata via Drive API (multipart) with content? No, sheets are special.
          // Standard practice: Create sheet, get ID, then update parents via Drive API.

          const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', { 
              method: 'POST', 
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ 
                  properties: { title: exportData.fileName },
                  sheets: sheets
              }) 
          });
          
          if(!createRes.ok) throw new Error("Failed to create sheet");
          const sheetData = await createRes.json();
          const spreadsheetId = sheetData.spreadsheetId; 
          const sheetUrl = sheetData.spreadsheetUrl;

          // Move to Folder
          // 1. Get current parents (usually 'root')
          const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=parents`, {
               headers: { 'Authorization': `Bearer ${token}` }
          });
          const fileData = await fileRes.json();
          const previousParents = fileData.parents ? fileData.parents.join(',') : '';

          // 2. Add new parent, remove old
          await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=${previousParents}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${token}` }
          });

          statusDiv.textContent = "Pushing data...";
          
          // Batch Update Values
          const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, { 
              method: 'POST', 
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ 
                  valueInputOption: 'USER_ENTERED',
                  data: dataToPush
              }) 
          });

          if(!updateRes.ok) throw new Error("Failed to append data");
          statusDiv.textContent = "Success! Opening Sheet..."; window.open(sheetUrl, '_blank');
      } catch(e) { console.error(e); alert("Error pushing to Google Sheet: " + e.message); statusDiv.textContent = "Error."; }
  }

  // --- NEW: Push to Excel Online Logic ---

  function getMicrosoftToken(interactive, callback) {
      const redirectUri = chrome.identity.getRedirectURL();
      const scope = MS_SCOPES;
      const nonce = Math.random().toString(36).substring(2, 15);
      const authUrl = `${MS_AUTH_URL}?client_id=${MS_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&nonce=${nonce}`;

      chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: interactive
      }, (responseUrl) => {
          if (chrome.runtime.lastError) {
              callback(null);
              return;
          }
          if (!responseUrl) {
              callback(null);
              return;
          }
          try {
              const url = new URL(responseUrl);
              const urlParams = new URLSearchParams(url.hash.substring(1));
              const accessToken = urlParams.get("access_token");
              callback(accessToken);
          } catch(e) {
              callback(null);
          }
      });
  }

  pushExcelBtn.addEventListener('click', () => {
      if (!IS_LOGGED_IN) { alert("🔒 Pro Feature: Please Login to push data to Excel Online."); return; }
      
      // If already logged in with Microsoft, try using that token first
      if (IS_LOGGED_IN && USER_INFO && USER_INFO.provider === 'microsoft' && USER_INFO.token) {
          uploadToOneDrive(USER_INFO.token, true); // Add retry flag
          return;
      }

      // Otherwise (Google login or not logged in), force MS Auth
      getMicrosoftToken(true, (token) => {
          if (!token) { alert("Microsoft Auth failed. Cannot push to Excel."); return; }
          uploadToOneDrive(token);
      });
  });

  async function uploadToOneDrive(token, retry = false) {
      statusDiv.textContent = "Preparing Excel file...";
      try {
          const exportData = await getExportData();
          if(!exportData) return;

          // 1. Generate Excel Binary using SheetJS (Same as download logic)
          if (typeof XLSX === 'undefined') { alert("SheetJS not loaded."); return; }
          const wb = XLSX.utils.book_new();
          const dashData = [ ["Audit Summary", ""], ["Total Audited", document.getElementById('statTotal').textContent], ["Average LQS", document.getElementById('statLqs').textContent], ["Issues", document.getElementById('statIssues').textContent], ["Date", new Date().toLocaleString()] ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dashData), "Dashboard");
          
          const mainSheetName = (MEGA_MODE === 'auditor') ? "Audits_Data" : "Scrapped_Data";
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportData.rows, { header: exportData.headers }), mainSheetName);
          
          // Append Secondary Tabs
          if (exportData.tabsData) {
              exportData.tabsData.forEach(tab => {
                  const ws = XLSX.utils.aoa_to_sheet([tab.headers, ...tab.rows]);
                  XLSX.utils.book_append_sheet(wb, ws, tab.name);
              });
          }

          // Generate ArrayBuffer
          const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          
          // 2. Upload to OneDrive App Folder (or Root if App Folder not accessible)
          statusDiv.textContent = "Uploading to OneDrive...";
          const fileName = exportData.fileName + ".xlsx";
          // Upload to "Listing Auditor For Amazon" folder.
          // Graph API path-based addressing creates folders implicitly if they don't exist?
          // Usually yes, but safer to check/create if path deep.
          // Path: /drive/root:/Listing Auditor For Amazon/filename.xlsx:/content
          const folderName = "Listing Auditor For Amazon";
          const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}:/content`;
          
          const response = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              },
              body: wbOut
          });

          if (response.status === 401 && retry) {
              // Token expired or invalid, try refreshing via interactive auth
              console.log("Token expired, refreshing...");
              getMicrosoftToken(true, (newToken) => {
                  if (newToken) {
                      // Update global session if it was MS
                      if (IS_LOGGED_IN && USER_INFO.provider === 'microsoft') {
                          USER_INFO.token = newToken;
                          chrome.storage.local.set({ userSession: USER_INFO });
                      }
                      uploadToOneDrive(newToken, false);
                  } else {
                      alert("Microsoft Auth session expired. Please log in again.");
                      statusDiv.textContent = "Auth Error.";
                  }
              });
              return;
          }

          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error ? err.error.message : "Upload failed");
          }

          const fileData = await response.json();
          // 3. Open in Excel Online
          if (fileData.webUrl) {
              statusDiv.textContent = "Success! Opening Excel...";
              window.open(fileData.webUrl, '_blank');
          } else {
              alert("Upload successful, but no Web URL returned.");
          }

      } catch(e) {
          console.error(e);
          alert("Error pushing to Excel: " + e.message);
          statusDiv.textContent = "Error.";
      }
  }

  selectAllCheckbox.addEventListener('change', (e) => {
    const container = document.getElementById('scrapingConfig');
    if (container) {
        container.querySelectorAll('.attr-checkbox:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
        saveCheckboxState();
        updateGroupCheckboxes();
    }
  });

  // Init Catalogues
  initCatalogues(() => {
      loadCatalogue();
  });

  // --- What's New Logic ---
  function checkWhatsNew() {
      if (!IS_LOGGED_IN) return; // Only for logged in users as per request

      const manifest = chrome.runtime.getManifest();
      const currentVersion = manifest.version;

      chrome.storage.local.get(['last_seen_version'], (data) => {
          const lastSeen = data.last_seen_version;

          if (!lastSeen || lastSeen !== currentVersion) {
              // Show Modal
              if (whatsNewModal) whatsNewModal.showModal();
          }
      });
  };

  function closeWhatsNew() {
      if (whatsNewModal) whatsNewModal.close();
      const manifest = chrome.runtime.getManifest();
      chrome.storage.local.set({ last_seen_version: manifest.version });
  };

  if (closeWhatsNewBtn) closeWhatsNewBtn.addEventListener('click', closeWhatsNew);
  if (dismissWhatsNewBtn) dismissWhatsNewBtn.addEventListener('click', closeWhatsNew);

  // --- Help / Demo Logic ---
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeHelpBtn = document.getElementById('closeHelpBtn');
  const loadSampleDataBtn = document.getElementById('loadSampleDataBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
          const settingsUrl = chrome.runtime.getURL('settings.html');
          chrome.tabs.query({ url: settingsUrl }, (tabs) => {
              if (tabs.length > 0) {
                  const tab = tabs[0];
                  chrome.tabs.update(tab.id, { active: true });
                  chrome.windows.update(tab.windowId, { focused: true });
              } else {
                  chrome.tabs.create({ url: 'settings.html' });
              }
          });
      });
  }

  if (helpBtn) {
      helpBtn.addEventListener('click', () => {
          if (helpModal) helpModal.showModal();
      });
  }

  if (closeHelpBtn && helpModal) {
      closeHelpBtn.addEventListener('click', () => helpModal.close());
  }

  if (loadSampleDataBtn) {
      loadSampleDataBtn.addEventListener('click', () => {
          if (helpModal) helpModal.close();

          // Switch to Scraper Mode
          const scraperRadio = document.querySelector('input[name="megaMode"][value="scraper"]');
          if(scraperRadio) {
              scraperRadio.checked = true;
              scraperRadio.dispatchEvent(new Event('change')); // Trigger listener
          }

          // Populate Input
          // Using random varied ASINs for a good demo (Tech, Home, Book)
          const samples = [
              "B0DZD9S5GC",
              "B0BS1QCFHX",
              "B0CFPJYX7P",
              "B08S498FWJ",
              "B0196CV7Q8",
              "B088Z9F6MK",
              "B01HJFTHS4",
              "B07SB2W617"
          ];

          if (bulkInput) {
              bulkInput.value = samples.join("\n");
              updateTotalInputCount(); // Trigger counter update
          }

          // Highlight the button briefly
          if (scanBtn) {
              const originalText = scanBtn.textContent;
              scanBtn.textContent = "Ready! Click here ->";
              scanBtn.style.background = "var(--success)";
              setTimeout(() => {
                  scanBtn.textContent = originalText;
                  scanBtn.style.background = ""; // Reset
              }, 2000);
          }
      });
  }

  // --- Tooltip Logic ---
  const tooltip = document.createElement('div');
  tooltip.id = 'custom-tooltip';
  document.body.appendChild(tooltip);

  // We use event delegation or re-attach if dynamic?
  // The checkboxes are static in HTML, so static selection is fine.
  const infoIcons = document.querySelectorAll('.info-icon');

  infoIcons.forEach(icon => {
      icon.addEventListener('mouseenter', (e) => {
          const text = e.target.dataset.tooltip;
          if (!text) return;

          tooltip.textContent = text;

          // Position logic
          const iconRect = e.target.getBoundingClientRect();
          // We need to briefly show it or assume size?
          // Since it's visible (opacity transition), we can measure it.
          // But 'visible' class just changes opacity. Display is block by default (absolute).
          const tooltipRect = tooltip.getBoundingClientRect();

          // Default: Above centered
          let top = iconRect.top - tooltipRect.height - 8;
          let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);

          // Check overflow Top
          if (top < 0) {
              // Show below
              top = iconRect.bottom + 8;
          }

          // Check overflow Left
          if (left < 10) {
              left = 10;
          }

          // Check overflow Right
          if (left + tooltipRect.width > window.innerWidth - 10) {
              left = window.innerWidth - tooltipRect.width - 10;
          }

          tooltip.style.top = `${top + window.scrollY}px`;
          tooltip.style.left = `${left + window.scrollX}px`;
          tooltip.classList.add('visible');
      });

      icon.addEventListener('mouseleave', () => {
          tooltip.classList.remove('visible');
      });
  });


  // --- Custom Rules Logic ---
  const customRulesHeader = document.getElementById('customRulesHeader');
  const customRulesBody = document.getElementById('customRulesBody');
  const customRulesList = document.getElementById('customRulesList');
  const addCustomRuleBtn = document.getElementById('addCustomRuleBtn');
  const saveCustomRuleBtn = document.getElementById('saveCustomRuleBtn');
  const deleteCustomRuleBtn = document.getElementById('deleteCustomRuleBtn');
  const closeCustomRuleModalBtn = document.getElementById('closeCustomRuleModalBtn');
  const pickElementBtn = document.getElementById('pickElementBtn');

  let customRules = [];

  if (customRulesHeader && customRulesBody) {
      customRulesHeader.addEventListener('click', () => {
          const isExpanded = customRulesHeader.classList.toggle('expanded');
          if (isExpanded) {
              customRulesBody.style.display = 'block';
          } else {
              customRulesBody.style.display = 'none';
          }
      });
  }


  const loadCustomRules = async () => {
      const data = await chrome.storage.local.get('customRules');
      customRules = data.customRules || [];
      renderCustomRules();
  };


  const saveCustomRules = async () => {
      await chrome.storage.local.set({ customRules });
      renderCustomRules();
  };


  let draggedItemIndex = null;

  const renderCustomRules = () => {
      if (!customRulesList) return;
      customRulesList.replaceChildren();
      
      if (customRules.length === 0) {
          const noRulesDiv = document.createElement('div');
          noRulesDiv.style.padding = '8px';
          noRulesDiv.style.textAlign = 'center';
          noRulesDiv.style.color = 'var(--text-muted)';
          noRulesDiv.style.fontSize = '11px';
          noRulesDiv.textContent = 'No custom rules defined.';
          customRulesList.replaceChildren(noRulesDiv);
          return;
      }

      customRules.forEach((rule, index) => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.padding = '6px 8px';
          item.style.background = 'var(--surface-solid)';
          item.style.color = 'var(--text-main)';
          item.style.border = '1px solid var(--border)';
          item.style.borderRadius = '4px';
          
          // Drag and Drop Attributes
          item.draggable = true;
          item.dataset.index = index;
          item.style.cursor = 'grab';
          
          item.addEventListener('dragstart', (e) => {
              draggedItemIndex = index;
              e.dataTransfer.effectAllowed = 'move';
              item.style.opacity = '0.4';
          });
          
          item.addEventListener('dragover', (e) => {
              e.preventDefault(); // Necessary to allow dropping
              e.dataTransfer.dropEffect = 'move';
              item.style.borderTop = '2px solid var(--primary)'; // Visual cue
          });
          
          item.addEventListener('dragleave', (e) => {
              item.style.borderTop = '1px solid var(--border)'; // Reset cue
          });
          
          item.addEventListener('drop', (e) => {
              e.preventDefault();
              item.style.borderTop = '1px solid var(--border)'; // Reset cue
              
              if (draggedItemIndex !== null && draggedItemIndex !== index) {
                  // Reorder array
                  const draggedRule = customRules.splice(draggedItemIndex, 1)[0];
                  customRules.splice(index, 0, draggedRule);
                  saveCustomRules(); // Re-renders list automatically
              }
          });
          
          item.addEventListener('dragend', () => {
              item.style.opacity = '1';
              draggedItemIndex = null;
          });
          
          const leftCol = document.createElement('div');
          leftCol.style.display = 'flex';
          leftCol.style.alignItems = 'center';
          leftCol.style.gap = '8px';
          
          const dragHandle = document.createElement('span');
          dragHandle.textContent = '⋮⋮';
          dragHandle.style.color = 'var(--text-muted)';
          dragHandle.style.cursor = 'grab';
          dragHandle.style.marginRight = '4px';
          leftCol.appendChild(dragHandle);
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = rule.isActive;
          checkbox.style.cursor = 'pointer';
          checkbox.addEventListener('change', (e) => {
              rule.isActive = e.target.checked;
              saveCustomRules();
          });
          
          const nameContainer = document.createElement('div');
          nameContainer.style.display = 'flex';
          nameContainer.style.flexDirection = 'column';
          nameContainer.style.flex = '1';

          const nameSpan = document.createElement('span');
          nameSpan.textContent = rule.name;
          nameSpan.style.fontSize = '11px';
          nameSpan.style.fontWeight = '500';
          nameSpan.title = `${rule.extraction.method}: ${rule.extraction.selector}`;

          nameContainer.appendChild(nameSpan);

          if (rule.group) {
              const groupBadge = document.createElement('span');
              groupBadge.textContent = rule.group;
              groupBadge.style.fontSize = '9px';
              groupBadge.style.color = '#6366f1';
              groupBadge.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
              groupBadge.style.padding = '1px 4px';
              groupBadge.style.borderRadius = '3px';
              groupBadge.style.marginTop = '2px';
              groupBadge.style.width = 'fit-content';
              groupBadge.style.border = '1px solid rgba(99, 102, 241, 0.2)';
              nameContainer.appendChild(groupBadge);
          }
          
          leftCol.appendChild(checkbox);
          leftCol.appendChild(nameContainer);
          
          const editBtn = document.createElement('button');
          editBtn.textContent = '✏️';
          editBtn.style.background = 'none';
          editBtn.style.border = 'none';
          editBtn.style.cursor = 'pointer';
          editBtn.style.fontSize = '14px';
          editBtn.style.color = 'var(--text-main)';
          editBtn.style.marginLeft = 'auto'; // Push to extreme right
          editBtn.title = "Edit Rule";
          editBtn.addEventListener('click', () => openCustomRuleModal(rule));
          
          item.appendChild(leftCol);
          item.appendChild(editBtn);
          customRulesList.appendChild(item);
      });
  };

  // Import / Export Logic
  const exportCustomRulesBtn = document.getElementById('exportCustomRulesBtn');
  const importCustomRulesBtn = document.getElementById('importCustomRulesBtn');
  const importCustomRulesInput = document.getElementById('importCustomRulesInput');

  if (exportCustomRulesBtn) {
      exportCustomRulesBtn.addEventListener('click', () => {
          if (customRules.length === 0) {
              alert("No rules to export.");
              return;
          }
          const blob = new Blob([JSON.stringify(customRules, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `custom_rules_${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
      });
  }

  if (importCustomRulesBtn && importCustomRulesInput) {
      importCustomRulesBtn.addEventListener('click', () => {
          importCustomRulesInput.click();
      });

      importCustomRulesInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = async (event) => {
              try {
                  const importedRules = JSON.parse(event.target.result);
                  if (!Array.isArray(importedRules)) throw new Error("Invalid format. Must be an array of rules.");
                  
                  // Merge or Overwrite?
                  if (confirm("Do you want to overwrite existing rules? (Click Cancel to append instead)")) {
                      customRules = importedRules;
                  } else {
                      // Append, generating new IDs for imported rules to prevent collision
                      importedRules.forEach(r => {
                          r.id = 'rule_' + Date.now() + Math.random().toString(36).substring(2, 6);
                          customRules.push(r);
                      });
                  }
                  await saveCustomRules();
                  alert("Rules imported successfully!");
              } catch (err) {
                  alert("Error importing rules: " + err.message);
              }
              importCustomRulesInput.value = ""; // Reset input
          };
          reader.readAsText(file);
      });
  }


  const openCustomRuleModal = (rule = null) => {
      const modal = document.getElementById('customRuleModal');
      const title = document.getElementById('customRuleModalTitle');
      const idInput = document.getElementById('customRuleId');
      const groupInput = document.getElementById('customRuleGroup');
      const nameInput = document.getElementById('customRuleName');
      const selectorInput = document.getElementById('customRuleSelector');
      const methodSelect = document.getElementById('customRuleMethod');
      const attrSelect = document.getElementById('customRuleAttribute');
      
      const opSelect = document.getElementById('customRuleAuditOperator');
      const activeCheck = document.getElementById('customRuleIsActive');
      
      const multCheck = document.getElementById('customRuleMultiple');
      const procSelect = document.getElementById('customRuleProcessing');
      const regexGrp = document.getElementById('customRuleRegexGroup');
      const regPat = document.getElementById('customRuleRegexPattern');
      const regRep = document.getElementById('customRuleRegexReplace');
      const testResult = document.getElementById('customRuleTestResult');
      const testNav = document.getElementById('customRuleTestNav');
      const testCount = document.getElementById('customRuleTestCount');
      const auditColInput = document.getElementById('customRuleAuditColumn');

      testResult.textContent = 'No test run yet.';
      if(testNav) testNav.style.display = 'none';
      window.__TEST_CURRENT_INDEX__ = 0;
      
      if(procSelect) procSelect.onchange = () => {
          regexGrp.style.display = procSelect.value === 'regex_replace' ? 'flex' : 'none';
      };

      
      if (rule) {
          title.textContent = 'Edit Custom Rule';
          idInput.value = rule.id;
          if(groupInput) groupInput.value = rule.group || '';
          nameInput.value = rule.name;
          selectorInput.value = rule.extraction.selector;
          methodSelect.value = rule.extraction.method;
          attrSelect.value = rule.extraction.attribute;
          opSelect.value = rule.audit ? rule.audit.operator : 'contains';
          activeCheck.checked = rule.isActive;
          
          multCheck.checked = rule.extraction.multiple || false;
          procSelect.value = rule.extraction.processing || 'none';
          regPat.value = rule.extraction.regexPattern || '';
          regRep.value = rule.extraction.regexReplace || '';
          auditColInput.value = (rule.audit && rule.audit.columnName) ? rule.audit.columnName : '';
          procSelect.onchange();
          

          
          deleteCustomRuleBtn.style.display = 'block';
          deleteCustomRuleBtn.onclick = () => {
              if(confirm('Delete this rule?')) {
                  customRules = customRules.filter(r => r.id !== rule.id);
                  saveCustomRules();
                  modal.close();
              }
          };
      } else {
          title.textContent = 'Add Custom Rule';
          idInput.value = '';
          if(groupInput) groupInput.value = '';
          nameInput.value = '';
          selectorInput.value = '';
          methodSelect.value = 'css';
          attrSelect.value = 'text';
          opSelect.value = 'contains';
          activeCheck.checked = true;
          
          multCheck.checked = false;
          procSelect.value = 'none';
          regPat.value = '';
          regRep.value = '';
          auditColInput.value = '';
          procSelect.onchange();
          

          deleteCustomRuleBtn.style.display = 'none';
      }
      
      modal.showModal();
  };

  if (addCustomRuleBtn) addCustomRuleBtn.addEventListener('click', () => openCustomRuleModal());
  if (closeCustomRuleModalBtn) closeCustomRuleModalBtn.addEventListener('click', () => document.getElementById('customRuleModal').close());
  
  if (saveCustomRuleBtn) {
      saveCustomRuleBtn.addEventListener('click', () => {
          const groupInput = document.getElementById('customRuleGroup');
          const rule = {
              id: document.getElementById('customRuleId').value || 'rule_' + Date.now(),
              name: document.getElementById('customRuleName').value.trim(),
              group: groupInput ? groupInput.value.trim() : '',
              isActive: document.getElementById('customRuleIsActive').checked,
              extraction: {
                  method: document.getElementById('customRuleMethod').value,
                  selector: document.getElementById('customRuleSelector').value.trim(),
                  attribute: document.getElementById('customRuleAttribute').value,
                  multiple: document.getElementById('customRuleMultiple').checked,
                  processing: document.getElementById('customRuleProcessing').value,
                  regexPattern: document.getElementById('customRuleRegexPattern').value,
                  regexReplace: document.getElementById('customRuleRegexReplace').value
              },
              audit: {
                  enabled: true,
                  operator: document.getElementById('customRuleAuditOperator').value,
                  columnName: document.getElementById('customRuleAuditColumn') ? document.getElementById('customRuleAuditColumn').value.trim() : '',
                  options: {}
              }
          };

          if (!rule.name || !rule.extraction.selector) {
              alert("Please provide a name and selector.");
              return;
          }

          const existingIdx = customRules.findIndex(r => r.id === rule.id);
          if (existingIdx >= 0) customRules[existingIdx] = rule;
          else customRules.push(rule);

          saveCustomRules();
          document.getElementById('customRuleModal').close();
      });
  }

  
  // Test Button Logic
  const testBtn = document.getElementById('testCustomRuleBtn');
  const testNav = document.getElementById('customRuleTestNav');
  const testPrev = document.getElementById('customRuleTestPrev');
  const testNext = document.getElementById('customRuleTestNext');
  const testCount = document.getElementById('customRuleTestCount');
  
  if (testBtn) {
      testBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          window.__TEST_CURRENT_INDEX__ = 0;
          const res = await runTest(0);
          if (res && res.count > 1) {
              if(testNav) testNav.style.display = 'flex';
              if(testCount) testCount.textContent = `1/${res.count}`;
          } else if (testNav) {
              testNav.style.display = 'none';
          }
      });
  }

  if (testPrev) {
      testPrev.addEventListener('click', async (e) => {
          e.preventDefault();
          if (window.__TEST_TOTAL_COUNT__ > 0) {
              window.__TEST_CURRENT_INDEX__--;
              if (window.__TEST_CURRENT_INDEX__ < 0) {
                  window.__TEST_CURRENT_INDEX__ = window.__TEST_TOTAL_COUNT__ - 1;
              }
              const res = await runTest(window.__TEST_CURRENT_INDEX__);
              if(testCount && res) testCount.textContent = `${window.__TEST_CURRENT_INDEX__ + 1}/${res.count}`;
          }
      });
  }

  if (testNext) {
      testNext.addEventListener('click', async (e) => {
          e.preventDefault();
          if (window.__TEST_TOTAL_COUNT__ > 0) {
              window.__TEST_CURRENT_INDEX__++;
              if (window.__TEST_CURRENT_INDEX__ >= window.__TEST_TOTAL_COUNT__) {
                  window.__TEST_CURRENT_INDEX__ = 0;
              }
              const res = await runTest(window.__TEST_CURRENT_INDEX__);
              if(testCount && res) testCount.textContent = `${window.__TEST_CURRENT_INDEX__ + 1}/${res.count}`;
          }
      });
  }

  async function runTest(index) {
      const testResult = document.getElementById('customRuleTestResult');
      testResult.textContent = 'Testing...';
      
      const rule = {
          id: 'test',
          name: 'test',
          isActive: true,
          extraction: {
              method: document.getElementById('customRuleMethod').value,
              selector: document.getElementById('customRuleSelector').value.trim(),
              attribute: document.getElementById('customRuleAttribute').value,
              multiple: document.getElementById('customRuleMultiple').checked, // Not relevant for visual test, but kept for processing
              processing: document.getElementById('customRuleProcessing').value,
              regexPattern: document.getElementById('customRuleRegexPattern').value,
              regexReplace: document.getElementById('customRuleRegexReplace').value
          }
      };

      try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.url.includes('amazon')) {
              testResult.textContent = 'Err: No Amazon tab.';
              return null;
          }
          
          const injectHighlightAndTest = (rule, targetIndex) => {
              const { method, selector, attribute, processing, regexPattern, regexReplace } = rule.extraction;
              if (!selector) return { count: 0, value: "none" };

              let currentAsin = "none";
              const match = window.location.href.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
              if (match) currentAsin = match[1];

              const finalSelectors = selector.replace(/{ASIN}/g, currentAsin).split('\n').map(s => s.trim()).filter(Boolean);

              let foundElements = [];
              let extractedValues = [];

              // Gather ALL elements matching the first successful selector
              for (const sel of finalSelectors) {
                  try {
                      if (method === 'css') {
                          const els = document.querySelectorAll(sel);
                          if (els.length > 0) {
                              foundElements = Array.from(els);
                              extractedValues = foundElements.map(el => {
                                  if (attribute === 'text') return el.textContent.trim();
                                  else if (attribute === 'innerHTML') return el.innerHTML.trim();
                                  else return el.getAttribute(attribute) || "none";
                              });
                              break;
                          }
                      } else if (method === 'xpath') {
                          const result = document.evaluate(sel, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                          if (result.snapshotLength > 0) {
                              for (let i=0; i<result.snapshotLength; i++) {
                                  const el = result.snapshotItem(i);
                                  foundElements.push(el);
                                  if (attribute === 'text') extractedValues.push(el.textContent.trim());
                                  else if (attribute === 'innerHTML') extractedValues.push(el.innerHTML.trim());
                                  else extractedValues.push(el.getAttribute(attribute) || "none");
                              }
                              break;
                          }
                      }
                  } catch (err) {}
              }
              
              const totalCount = foundElements.length;
              if (totalCount === 0) return { count: 0, value: "none" };

              // Bound the index just in case
              const safeIndex = Math.max(0, Math.min(targetIndex, totalCount - 1));
              const targetElement = foundElements[safeIndex];
              const rawValue = extractedValues[safeIndex];
              
              // HIGHLIGHT LOGIC
              document.querySelectorAll('.la-test-highlight').forEach(el => {
                  el.classList.remove('la-test-highlight');
                  el.style.outline = el.dataset.oldOutline || '';
                  el.style.backgroundColor = el.dataset.oldBg || '';
                  el.style.boxShadow = el.dataset.oldShadow || '';
              });
              
              if (targetElement && targetElement.style) {
                  targetElement.classList.add('la-test-highlight');
                  targetElement.dataset.oldOutline = targetElement.style.outline;
                  targetElement.dataset.oldBg = targetElement.style.backgroundColor;
                  targetElement.dataset.oldShadow = targetElement.style.boxShadow;
                  
                  targetElement.style.outline = '3px solid #10b981';
                  targetElement.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
                  targetElement.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.5)';
                  
                  targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  
                  setTimeout(() => {
                      document.querySelectorAll('.la-test-highlight').forEach(el => {
                          el.classList.remove('la-test-highlight');
                          el.style.outline = el.dataset.oldOutline || '';
                          el.style.backgroundColor = el.dataset.oldBg || '';
                          el.style.boxShadow = el.dataset.oldShadow || '';
                      });
                  }, 3000);
              }

              if (rawValue === "none" || !rawValue) return { count: totalCount, value: "none" };

              // Post Processing on the single extracted value
              let pVal = rawValue;
              if (processing === 'numbers_only') {
                  pVal = pVal.replace(/[^0-9.,-]/g, '');
              } else if (processing === 'remove_line_breaks') {
                  pVal = pVal.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
              } else if (processing === 'regex_replace' && regexPattern) {
                  try {
                      const regex = new RegExp(regexPattern, 'g');
                      pVal = pVal.replace(regex, regexReplace || '');
                  } catch(e) {}
              }

              return { count: totalCount, value: pVal };
          };
          
          const injectionResults = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: injectHighlightAndTest,
              args: [rule, index]
          });
          
          const res = injectionResults[0].result;
          
          if (!res || res.count === 0 || res.value === "none") {
              testResult.textContent = 'No matching element found.';
              window.__TEST_TOTAL_COUNT__ = 0;
          } else {
              testResult.textContent = res.value;
              testResult.title = res.value;
              window.__TEST_TOTAL_COUNT__ = res.count;
          }
          
          return res;
          
      } catch(err) {
          testResult.textContent = 'Err: ' + err.message;
          return null;
      }
  }

// --- Interactive DOM Picker Logic ---
  if (pickElementBtn) {
      pickElementBtn.addEventListener('click', async () => {
          try {
              // Get current active tab
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (!tab) { alert("No active tab found. Please navigate to an Amazon page."); return; }
              
              if (!tab.url.includes('amazon')) {
                  alert("Please navigate to an Amazon page to use the picker.");
                  return;
              }

              // Inject picker content script dynamically if not already there
              await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['picker.js']
              });

              // Focus the window just in case
              chrome.windows.update(tab.windowId, { focused: true });
              
          } catch(e) {
              console.error("Picker error:", e);
              alert("Failed to start picker. Ensure you are on a valid Amazon page.");
          }
      });
  }

  // --- AI Smart Selector Generation (Trusted Middleware Pattern) ---
  const generateSmartSelector = async (elementData) => {
      const selectorInput = document.getElementById('customRuleSelector');
      if (selectorInput) {
          selectorInput.value = "🤖 AI generating smart selector...";
      }

      const getFallbackSelector = () => {
          let bestSelector = "";
          if (elementData.id && !elementData.id.match(/^a-autoid/)) {
              bestSelector = `#${elementData.id}`;
          } else if (elementData.outerHTML.includes('data-')) {
              const match = elementData.outerHTML.match(/data-[a-zA-Z\-]+="[^"]+"/);
              if (match) {
                  bestSelector = `${elementData.tagName}[${match[0]}]`;
              }
          } else if (elementData.className) {
              const safeClasses = elementData.className.split(' ').filter(c => !c.match(/^a-size/)).join('.');
              if (safeClasses) bestSelector = `${elementData.tagName}.${safeClasses}`;
          }
          if (!bestSelector) bestSelector = elementData.tagName;
          return bestSelector;
      };

      try {
          const stored = await chrome.storage.local.get('aiConfig');
          const aiConfig = stored.aiConfig;

          if (!aiConfig || aiConfig.provider === 'none') {
              // Simulating minimal processing time for local fallback
              await new Promise(r => setTimeout(r, 500)); 
              return getFallbackSelector();
          }

          const provider = aiConfig.provider;
          const apiKey = aiConfig.apiKey;
          const model = aiConfig.model;
          const prompt = `You are an expert web scraper for Amazon. Analyze the following HTML element and generate the most resilient, specific, and cross-PDP CSS selector. It MUST work on ANY Amazon Product Details Page (PDP), not just the one it was selected from. 

RULES:
1. Prefer semantic IDs (e.g., #title, #priceblock_ourprice) and stable data-* attributes (e.g., [data-feature-name="..."], [data-csa-c-slot-id="..."]).
2. Use strict selection or attribute contains strategies (e.g., [id^="price-"] or div[data-component="price"]).
3. AVOID highly dynamic, auto-generated, or layout-specific utility classes (e.g., a-size-large, a-color-base, a-text-bold, a-spacing-mini).
4. AVOID brittle hierarchical chains (e.g., div > span > div:nth-child(2)).
5. Return 3 distinct fallback CSS selectors (e.g. one ID-based, one data-* based, one structural), separated by newlines, nothing else.

HTML Context:
${elementData.outerHTML}

Element Tag: ${elementData.tagName}
Element Classes: ${elementData.className}
Element ID: ${elementData.id}`;

          let apiUrl = "";
          let requestBody = {};
          let headers = {
              "Content-Type": "application/json"
          };

          if (provider === "gemini") {
              const modelName = model || "gemini-2.5-flash";
              apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
              requestBody = {
                  contents: [{ parts: [{ text: prompt }] }]
              };
          } else if (provider === "openai") {
              apiUrl = "https://api.openai.com/v1/chat/completions";
              headers["Authorization"] = `Bearer ${apiKey}`;
              requestBody = {
                  model: model || "gpt-4o",
                  messages: [{ role: "user", content: prompt }],
                  temperature: 0.1
              };
          } else if (provider === "anthropic") {
              apiUrl = "https://api.anthropic.com/v1/messages";
              headers["x-api-key"] = apiKey;
              headers["anthropic-version"] = "2023-06-01";
              requestBody = {
                  model: model || "claude-3-haiku-20240307",
                  max_tokens: 100,
                  messages: [{ role: "user", content: prompt }]
              };
          } else if (provider === "custom") {
              apiUrl = aiConfig.customEndpoint;
              headers["Authorization"] = `Bearer ${apiKey}`; // Convention
              requestBody = {
                  model: model || "custom",
                  messages: [{ role: "user", content: prompt }],
                  temperature: 0.1
              };
          }

          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
             throw new Error(`API Error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          let generatedSelector = "";

          if (provider === "gemini") {
              generatedSelector = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          } else if (provider === "openai" || provider === "custom") {
              generatedSelector = data.choices?.[0]?.message?.content || "";
          } else if (provider === "anthropic") {
              generatedSelector = data.content?.[0]?.text || "";
          }

          generatedSelector = generatedSelector.trim();
          
          // Remove potential markdown codeblock formatting that models sometimes include
          generatedSelector = generatedSelector.replace(/^```css\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
          
          return generatedSelector || getFallbackSelector();

      } catch(e) {
          console.error("AI Generation failed, falling back to heuristic:", e);
          return getFallbackSelector();
      }
  };

  // Listen for Picker result
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
      if (request.action === 'ELEMENT_SELECTED') {
          const data = request.data;
          const selectorInput = document.getElementById('customRuleSelector');
          
          // Use AI to generate a resilient selector based on the context
          const smartSelector = await generateSmartSelector(data);

          if (selectorInput) {
              selectorInput.value = smartSelector;
              // Add a small highlight animation to show it updated
              selectorInput.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
              setTimeout(() => { selectorInput.style.backgroundColor = 'var(--bg-input)'; }, 500);
          }
      }
  });

  // Call on load
  loadCustomRules();

});
