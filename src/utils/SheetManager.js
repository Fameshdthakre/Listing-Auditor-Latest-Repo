/**
 * SheetManager.js
 *
 * Handles interaction with the Google Sheets REST API and Microsoft Graph API.
 * Uses Chrome Identity API to obtain OAuth tokens.
 */
import { MS_CLIENT_ID, MS_AUTH_URL, MS_SCOPES } from '../../config.js';

export class SheetManager {
    constructor(provider = 'google') {
        this.provider = provider;
        this.googleBaseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
        this.msBaseUrl = 'https://graph.microsoft.com/v1.0/me/drive/items';
    }

    /**
     * Update the active provider dynamically
     * @param {'google' | 'microsoft'} provider
     */
    setProvider(provider) {
        this.provider = provider;
    }

    /**
     * Set active user session and store it
     */
    async saveSession(sessionData) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ userSession: sessionData }, resolve);
        });
    }

    /**
     * Get active user session
     */
    async getSession() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['userSession'], (data) => resolve(data.userSession || null));
        });
    }

    /**
     * Initiates Google OAuth Login
     */
    async loginWithGoogle(interactive = true) {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive }, async (token) => {
                if (chrome.runtime.lastError || !token) {
                    reject(new Error(chrome.runtime.lastError?.message || "Failed to get Google token"));
                    return;
                }

                try {
                    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const user = await res.json();

                    const session = {
                        provider: 'google',
                        name: user.given_name || 'User',
                        email: user.email,
                        token: token
                    };
                    await this.saveSession(session);
                    this.setProvider('google');
                    resolve(session);
                } catch(e) {
                    reject(e);
                }
            });
        });
    }

    /**
     * Initiates Microsoft OAuth Login
     */
    async loginWithMicrosoft(interactive = true) {
        return new Promise((resolve, reject) => {
            const redirectUri = chrome.identity.getRedirectURL();
            const scope = `${MS_SCOPES} Files.ReadWrite`;
            const nonce = Math.random().toString(36).substring(2, 15);
            const authUrl = `${MS_AUTH_URL}?client_id=${MS_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&nonce=${nonce}`;

            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: interactive
            }, async (responseUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!responseUrl) {
                    reject(new Error("No response URL from Microsoft Auth"));
                    return;
                }

                try {
                    const url = new URL(responseUrl);
                    const urlParams = new URLSearchParams(url.hash.substring(1));
                    const token = urlParams.get("access_token");

                    if (!token) throw new Error("No access token in response");

                    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const user = await res.json();

                    const session = {
                        provider: 'microsoft',
                        name: user.givenName || 'User',
                        email: user.mail || user.userPrincipalName,
                        token: token
                    };
                    await this.saveSession(session);
                    this.setProvider('microsoft');
                    resolve(session);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    /**
     * Gets an OAuth token based on current provider.
     */
    async getToken() {
        const session = await this.getSession();
        if (session && session.token) {
             // For Microsoft, we might need a refresh logic if it expires,
             // but for simplicity we'll just return the stored token if it exists.
             // If this was purely Google, chrome.identity handles caching.
             if (this.provider === 'microsoft' || session.provider === 'microsoft') return session.token;
        }

        // Fallback or explicit Google
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    chrome.identity.getAuthToken({ interactive: true }, (interactiveToken) => {
                        if (chrome.runtime.lastError || !interactiveToken) {
                            reject(new Error(chrome.runtime.lastError?.message || "Failed to get token"));
                        } else {
                            resolve(interactiveToken);
                        }
                    });
                } else {
                    resolve(token);
                }
            });
        });
    }

    /**
     * Extracts the Spreadsheet ID from a full Google Sheets URL or Microsoft Graph ID.
     * @param {string} input - The URL or ID string.
     * @returns {string} The ID.
     */
    extractSpreadsheetId(input) {
        if (!input) return "";

        // Google Sheets Match
        const googleMatch = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (googleMatch) return googleMatch[1];

        // Microsoft OneDrive/SharePoint URL Match
        // We usually need an Item ID for Graph API. Direct URLs are tricky to parse into Graph IDs without an API call.
        // If the user pastes a raw ID (length 32+ alphanumeric), return it.
        // Otherwise, if they pasted a link, try to parse. Often SharePoint links have `sourcedoc={ID}`.
        const msMatch = input.match(/sourcedoc=\{?([a-zA-Z0-9-]+)\}?/i);
        if (msMatch) return msMatch[1];

        // Fallback: Assume the input is a raw ID (either Google 44-char or MS Base64-ish/Guid)
        return input.trim();
    }

    /**
     * Fetches all rows from the first sheet, using the first row as headers.
     * @param {string} inputId
     * @returns {Promise<Array<Object>>} Array of row objects mapped to headers
     */
    async fetchRows(inputId) {
        if (this.provider === 'microsoft') {
            return this.fetchRowsMicrosoft(inputId);
        }
        return this.fetchRowsGoogle(inputId);
    }

    async fetchRowsGoogle(inputId) {
        try {
            const spreadsheetId = this.extractSpreadsheetId(inputId);
            if (!spreadsheetId) throw new Error("Invalid Spreadsheet ID or URL provided.");

            const token = await this.getToken();

            // First, get the sheet name to ensure we query the right range
            const metaRes = await fetch(`${this.googleBaseUrl}/${spreadsheetId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!metaRes.ok) throw new Error(`HTTP error ${metaRes.status}`);
            const metaData = await metaRes.json();

            if (!metaData.sheets || metaData.sheets.length === 0) {
                throw new Error("No sheets found in document");
            }

            const sheetName = metaData.sheets[0].properties.title;

            // Fetch the actual data
            const dataRes = await fetch(`${this.googleBaseUrl}/${spreadsheetId}/values/'${sheetName}'`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!dataRes.ok) throw new Error(`HTTP error ${dataRes.status}`);
            const data = await dataRes.json();

            if (!data.values || data.values.length === 0) {
                throw new Error("EMPTY_SHEET");
            }

            const headers = data.values[0];
            const rows = [];

            for (let i = 1; i < data.values.length; i++) {
                const rowArray = data.values[i];
                const rowObj = {};
                headers.forEach((header, index) => {
                    rowObj[header] = rowArray[index] !== undefined ? rowArray[index] : "";
                });
                // Attach the original row index (1-based for Sheets + 1 for header) for easy updates later
                rowObj._sheetRowIndex = i + 1;
                rows.push(rowObj);
            }

            return { sheetName, headers, rows };

        } catch (error) {
            console.error("SheetManager.fetchRowsGoogle Error:", error);
            throw error;
        }
    }

    async fetchRowsMicrosoft(inputId) {
        try {
            const fileId = this.extractSpreadsheetId(inputId);
            if (!fileId) throw new Error("Invalid Microsoft Item ID or URL.");

            const token = await this.getToken();

            // Hit Microsoft Graph API
            // Assumption: Usually we target "Sheet1". If dynamic name is needed, we could fetch worksheets first.
            // Let's get the first worksheet ID/name safely.
            const metaRes = await fetch(`${this.msBaseUrl}/${fileId}/workbook/worksheets`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!metaRes.ok) throw new Error(`Microsoft Graph HTTP error ${metaRes.status}`);
            const metaData = await metaRes.json();

            if (!metaData.value || metaData.value.length === 0) {
                throw new Error("No worksheets found in document.");
            }
            const sheetName = metaData.value[0].name;

            // Fetch usedRange
            const dataRes = await fetch(`${this.msBaseUrl}/${fileId}/workbook/worksheets('${sheetName}')/usedRange`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!dataRes.ok) throw new Error(`Microsoft Graph Data HTTP error ${dataRes.status}`);
            const data = await dataRes.json();

            if (!data.values || data.values.length === 0 || (data.values.length === 1 && data.values[0].length === 0)) {
                throw new Error("EMPTY_SHEET");
            }

            const headers = data.values[0];
            const rows = [];

            for (let i = 1; i < data.values.length; i++) {
                const rowArray = data.values[i];
                const rowObj = {};
                headers.forEach((header, index) => {
                    rowObj[header] = rowArray[index] !== undefined ? rowArray[index] : "";
                });
                // Attach the original row index (1-based + 1 for header)
                // Wait, Graph API rows might not directly map to global row index if usedRange is offset.
                // Let's assume usedRange starts at A1 for typical cases.
                // data.rowIndex provides the starting index (0-based) of the usedRange.
                const startRow = data.rowIndex || 0;
                rowObj._sheetRowIndex = startRow + i + 1; // 1-based exact row number
                rows.push(rowObj);
            }

            return { sheetName, headers, rows };

        } catch (error) {
            console.error("SheetManager.fetchRowsMicrosoft Error:", error);
            throw error;
        }
    }

    /**
     * Updates multiple specific cells in the spreadsheet in a single batch request.
     * @param {string} inputId
     * @param {Array<{range: string, values: Array<Array<any>>}>} updates
     * Example update object: { range: "Sheet1!D2", values: [["Passed"]] }
     */
    async batchUpdateRows(inputId, updates) {
        if (!updates || updates.length === 0) return;
        if (this.provider === 'microsoft') {
            return this.batchUpdateRowsMicrosoft(inputId, updates);
        }
        return this.batchUpdateRowsGoogle(inputId, updates);
    }

    async batchUpdateRowsGoogle(inputId, updates) {
        try {
            const spreadsheetId = this.extractSpreadsheetId(inputId);
            if (!spreadsheetId) throw new Error("Invalid Spreadsheet ID or URL provided.");

            const token = await this.getToken();

            const payload = {
                valueInputOption: "USER_ENTERED",
                data: updates
            };

            const res = await fetch(`${this.googleBaseUrl}/${spreadsheetId}/values:batchUpdate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(`Google batch update failed: ${errData.error?.message || res.status}`);
            }

            return await res.json();

        } catch (error) {
            console.error("SheetManager.batchUpdateRowsGoogle Error:", error);
            throw error;
        }
    }

    /**
     * Appends rows to the first empty row of the given sheet.
     * @param {string} inputId
     * @param {Array<Array<any>>} dataArray
     * @param {string} sheetName
     */
    async appendRows(inputId, dataArray, sheetName = 'Data') {
        if (!dataArray || dataArray.length === 0) return;
        if (this.provider === 'microsoft') {
            return this.appendRowsMicrosoft(inputId, dataArray, sheetName);
        }
        return this.appendRowsGoogle(inputId, dataArray, sheetName);
    }

    async appendRowsGoogle(inputId, dataArray, sheetName) {
        try {
            const spreadsheetId = this.extractSpreadsheetId(inputId);
            if (!spreadsheetId) throw new Error("Invalid Spreadsheet ID.");
            const token = await this.getToken();

            const payload = {
                values: dataArray
            };

            // Using valueInputOption=USER_ENTERED correctly formats strings/numbers
            const url = `${this.googleBaseUrl}/${spreadsheetId}/values/'${sheetName}'!A1:append?valueInputOption=USER_ENTERED`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(`Google append failed: ${errData.error?.message || res.status}`);
            }

            return await res.json();
        } catch (error) {
            console.error("SheetManager.appendRowsGoogle Error:", error);
            throw error;
        }
    }

    async appendRowsMicrosoft(inputId, dataArray, sheetName) {
        try {
            const fileId = this.extractSpreadsheetId(inputId);
            if (!fileId) throw new Error("Invalid Microsoft Item ID.");
            const token = await this.getToken();

            // First, find the last row of the used range
            const metaUrl = `${this.msBaseUrl}/${fileId}/workbook/worksheets('${sheetName}')/usedRange`;
            const metaRes = await fetch(metaUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!metaRes.ok) {
                const err = await metaRes.json();
                throw new Error(`Failed to get used range: ${err.error?.message || metaRes.status}`);
            }

            const metaData = await metaRes.json();
            // If the sheet is empty, usedRange might be minimal, so we calculate the next row
            // `rowCount` is 1 when empty (A1), but if values are empty array, we can use row 1.
            let startRow = 1;

            if (metaData.values && metaData.values.length > 0 && metaData.values[0].length > 0) {
                const rowCount = metaData.rowCount || 0;
                startRow = (metaData.rowIndex || 0) + rowCount + 1; // 1-based index for next empty row
            }

            // Generate end column letter (A, B, C...) based on data length
            const colCount = dataArray[0].length;
            const getColLetter = (col) => {
                let temp, letter = '';
                while (col > 0) {
                    temp = (col - 1) % 26;
                    letter = String.fromCharCode(temp + 65) + letter;
                    col = (col - temp - 1) / 26;
                }
                return letter;
            };
            const endColLetter = getColLetter(colCount);

            // Format range: e.g., A5:F10
            const rangeStr = `A${startRow}:${endColLetter}${startRow + dataArray.length - 1}`;

            const updateUrl = `${this.msBaseUrl}/${fileId}/workbook/worksheets('${sheetName}')/range(address='${rangeStr}')`;

            const res = await fetch(updateUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    values: dataArray
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(`Microsoft append failed: ${errData.error?.message || res.status}`);
            }

            return await res.json();
        } catch (error) {
            console.error("SheetManager.appendRowsMicrosoft Error:", error);
            throw error;
        }
    }

    async batchUpdateRowsMicrosoft(inputId, updates) {
        try {
            const fileId = this.extractSpreadsheetId(inputId);
            if (!fileId) throw new Error("Invalid Microsoft Item ID or URL.");

            const token = await this.getToken();
            const results = [];

            // Graph API doesn't have a single "batchUpdate" that takes multiple ranges cleanly like Google
            // We have to iterate over the updates and PATCH each range.
            // (Alternatively, use Graph API $batch endpoint for efficiency, but sequential PATCH is simpler)
            for (const update of updates) {
                // Parse range string (e.g., "'Sheet1'!Z5")
                let sheetPart = '';
                let cellRange = update.range;

                if (update.range.includes('!')) {
                    const parts = update.range.split('!');
                    sheetPart = parts[0].replace(/'/g, ''); // Remove single quotes
                    cellRange = parts[1];
                }

                // URL encode sheet name if exists
                const worksheetEndpoint = sheetPart ? `worksheets('${encodeURIComponent(sheetPart)}')/` : '';

                const url = `${this.msBaseUrl}/${fileId}/workbook/${worksheetEndpoint}range(address='${cellRange}')`;

                const res = await fetch(url, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        values: update.values
                    })
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(`Microsoft update failed for range ${update.range}: ${errData.error?.message || res.status}`);
                }

                const result = await res.json();
                results.push(result);
            }

            return results;

        } catch (error) {
            console.error("SheetManager.batchUpdateRowsMicrosoft Error:", error);
            throw error;
        }
    }
}
