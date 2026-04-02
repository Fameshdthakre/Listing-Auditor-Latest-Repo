/**
 * SheetManager.js
 *
 * Handles interaction with the Google Sheets REST API.
 * Uses Chrome Identity API to obtain OAuth tokens.
 */

export class SheetManager {
    constructor() {
        this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    }

    /**
     * Gets an OAuth token silently.
     */
    async getToken() {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    // Try interactive if silent fails
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
     * Fetches all rows from the first sheet, using the first row as headers.
     * @param {string} spreadsheetId
     * @returns {Promise<Array<Object>>} Array of row objects mapped to headers
     */
    async fetchRows(spreadsheetId) {
        try {
            const token = await this.getToken();

            // First, get the sheet name to ensure we query the right range
            const metaRes = await fetch(`${this.baseUrl}/${spreadsheetId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!metaRes.ok) throw new Error(`HTTP error ${metaRes.status}`);
            const metaData = await metaRes.json();

            if (!metaData.sheets || metaData.sheets.length === 0) {
                throw new Error("No sheets found in document");
            }

            const sheetName = metaData.sheets[0].properties.title;

            // Fetch the actual data
            const dataRes = await fetch(`${this.baseUrl}/${spreadsheetId}/values/'${sheetName}'`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!dataRes.ok) throw new Error(`HTTP error ${dataRes.status}`);
            const data = await dataRes.json();

            if (!data.values || data.values.length === 0) {
                return []; // Empty sheet
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
            console.error("SheetManager.fetchRows Error:", error);
            throw error;
        }
    }

    /**
     * Updates multiple specific cells in the spreadsheet in a single batch request.
     * @param {string} spreadsheetId
     * @param {Array<{range: string, values: Array<Array<any>>}>} updates
     * Example update object: { range: "Sheet1!D2", values: [["Passed"]] }
     */
    async batchUpdateRows(spreadsheetId, updates) {
        if (!updates || updates.length === 0) return;

        try {
            const token = await this.getToken();

            const payload = {
                valueInputOption: "USER_ENTERED",
                data: updates
            };

            const res = await fetch(`${this.baseUrl}/${spreadsheetId}/values:batchUpdate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(`Batch update failed: ${errData.error?.message || res.status}`);
            }

            return await res.json();

        } catch (error) {
            console.error("SheetManager.batchUpdateRows Error:", error);
            throw error;
        }
    }
}
