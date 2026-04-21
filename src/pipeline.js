// pipeline.js - Catalog Ingestion & Smart Mapping Pipeline

/**
 * Phase 1: Dynamic Template Generation
 * Generates an .xlsx template based on active rules.
 * @param {Array} activeRules - Array of rule objects from RuleEvaluator.
 */
export const generateTemplate = (activeRules) => {
    if (typeof XLSX === 'undefined') {
        throw new Error("XLSX library not loaded. Please ensure xlsx.full.min.js is in the extension folder.");
    }

    // Always enforce ASIN as the primary key
    const headers = ["ASIN"];

    // Extract expected targets from the rules
    if (activeRules && Array.isArray(activeRules)) {
        activeRules.forEach(rule => {
            if (rule.target && !headers.includes(rule.target)) {
                headers.push(rule.target);
            }
        });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers]);

    // Apply some basic styling for the header if possible
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 5, 15) }));

    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Custom_Audit_Template.xlsx");
};

/**
 * Phase 2, Step A: Local Pre-Validation
 * Parses the uploaded file and performs sanity checks.
 * @param {File} file - The uploaded file.
 * @returns {Promise<Array>} Resolves with the parsed data array if valid.
 */
export const validateUpload = (file) => {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            return reject(new Error("XLSX library not loaded."));
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                // Check Row Limit
                if (json.length > 5000) {
                    return reject(new Error("File exceeds 5,000 row limit. Please upload a smaller file."));
                }

                if (json.length === 0) {
                    return reject(new Error("The uploaded file is empty."));
                }

                // Check Primary Key
                const headers = Object.keys(json[0]);
                const pkRegex = /(asin|product\s*id|url)/i;
                const hasPrimaryKey = headers.some(h => pkRegex.test(h));

                if (!hasPrimaryKey) {
                    return reject(new Error("Upload failed. We could not find a column containing ASINs or Product URLs."));
                }

                resolve(json);
            } catch (err) {
                reject(new Error("Failed to parse file: " + err.message));
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Phase 2, Step B: AI Auto-Mapping
 * Placeholder for the LLM call to map user headers to system targets.
 * @param {Array} userHeaders - Headers from the uploaded file.
 * @param {Array} systemTargets - Expected targets from the rules engine.
 * @returns {Promise<Object>} JSON key-value pair mapping { "User Header": "System Target" }.
 */
export const fetchAiColumnMapping = async (userHeaders, systemTargets) => {
    // In a real implementation, this would make an authenticated HTTP POST
    // request to a secure Cloud Function that proxies the LLM call.

    return new Promise((resolve) => {
        setTimeout(() => {
            const simulatedMapping = {};
            userHeaders.forEach(header => {
                // Simple heuristic fallback simulation
                const lowerHeader = header.toLowerCase();
                let match = null;

                if (lowerHeader.includes('asin') || lowerHeader.includes('id')) match = 'ASIN';
                else if (lowerHeader.includes('price') || lowerHeader.includes('cost')) match = 'displayPrice';
                else if (lowerHeader.includes('title') || lowerHeader.includes('name')) match = 'metaTitle';
                else if (lowerHeader.includes('desc')) match = 'description';

                // Set match or default to 'Ignore'
                simulatedMapping[header] = match || 'Ignore';
            });
            resolve(simulatedMapping);
        }, 1000); // Simulate network latency
    });
};

/**
 * Phase 2, Step D: Data Sanitization
 * Cleans the mapped data before storing it as the Golden Record.
 * @param {Array} rawData - The raw JSON data from the uploaded file.
 * @param {Object} confirmedMapping - The user-confirmed mapping from the UI.
 * @returns {Array} The sanitized "Golden Record" array.
 */
export const sanitizeData = (rawData, confirmedMapping) => {
    return rawData.map(row => {
        const cleanRow = {};

        for (const userHeader in confirmedMapping) {
            const targetKey = confirmedMapping[userHeader];
            if (targetKey === 'Ignore') continue;

            let value = row[userHeader];

            if (value !== undefined && value !== null) {
                value = String(value);

                // Specific Post-Processing Logic based on the Target Key
                // (e.g., numbers_only for price, remove_line_breaks for description)
                if (targetKey === 'displayPrice' || targetKey.includes('price')) {
                    // Strip currency symbols/text from expected prices
                    value = value.replace(/[^0-9.,-]/g, '');

                    // Handle commas gracefully. If it's a thousands separator, remove it. If it's a decimal, swap to dot.
                    // A simple heuristic: if a comma is followed by exactly 2 digits at the end of the string, it's likely a decimal separator.
                    if (/,[0-9]{2}$/.test(value)) {
                         // Replace thousand separators (dots) with empty string, then comma decimal with dot
                         value = value.replace(/\./g, '').replace(',', '.');
                    } else {
                         // Strip commas (thousands separator)
                         value = value.replace(/,/g, '');
                    }
                } else if (targetKey === 'description' || targetKey === 'metaTitle' || targetKey === 'bullets') {
                    // Remove messy line breaks from ERP exports
                    value = value.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
                } else {
                    // Default basic trim
                    value = value.trim();
                }
            } else {
                value = "";
            }

            cleanRow[targetKey] = value;
        }
        return cleanRow;
    });
};
