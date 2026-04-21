/**
 * remediationAgent.js - Action Layer for Automated Catalog Fixes
 *
 * This module takes identified discrepancies from the Auditor Engine and generates:
 * 1. Flat File representations (Excel) for bulk uploading attribute corrections to Vendor/Seller Central.
 * 2. Formatted Seller Support Case Prompts for complex issues requiring Amazon intervention.
 */

// Format definitions for Amazon Inventory Flat Files
const FLAT_FILE_HEADERS = [
    "item_sku", // ASIN or SKU
    "external_product_id",
    "external_product_id_type",
    "item_name", // Title
    "brand_name",
    "product_description", // Description
    "bullet_point1",
    "bullet_point2",
    "bullet_point3",
    "bullet_point4",
    "bullet_point5",
    "update_delete" // Important: "PartialUpdate"
];

/**
 * Generates an Excel Blob (via SheetJS) containing the corrections for the provided failed attributes.
 * @param {Object} itemData - The original item data from the catalogue.
 * @param {Array} failedFields - Array of field keys (e.g., ['title', 'bullets']) that need correction.
 * @returns {Object} An object containing the Blob and the generated filename.
 */
export const generateFlatFile = (itemData, failedFields) => {
    if (typeof XLSX === 'undefined') {
        throw new Error("XLSX library not loaded. Cannot generate flat file.");
    }

    // Prepare a row with PartialUpdate
    const row = {};
    FLAT_FILE_HEADERS.forEach(h => row[h] = "");

    const asin = itemData.asin || itemData.queryASIN || itemData.attributes?.mediaAsin || "UNKNOWN_ASIN";

    row["item_sku"] = asin;
    row["external_product_id"] = asin;
    row["external_product_id_type"] = "ASIN";
    row["update_delete"] = "PartialUpdate";

    // Inject Golden Record data only for the fields that failed
    if (failedFields.includes('title')) {
        row["item_name"] = itemData.expected?.title || itemData.comparisonData?.expected_title || "";
    }

    if (failedFields.includes('brand')) {
        row["brand_name"] = itemData.expected?.brand || itemData.comparisonData?.expected_brand || "";
    }

    if (failedFields.includes('description')) {
        row["product_description"] = itemData.expected?.description || itemData.comparisonData?.expected_description || "";
    }

    if (failedFields.includes('bullets')) {
        const expectedBullets = itemData.expected?.bullets || itemData.comparisonData?.expected_bullets || "";
        // Assuming bullets are pipe-separated in the Golden Record
        const bulletsArray = expectedBullets.split('|').map(b => b.trim()).filter(Boolean);

        for (let i = 0; i < Math.min(bulletsArray.length, 5); i++) {
            row[`bullet_point${i + 1}`] = bulletsArray[i];
        }
    }

    const ws = XLSX.utils.json_to_sheet([row], { header: FLAT_FILE_HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");

    // Generate binary data
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const fileName = `FlatFile_Correction_${asin}_${Date.now()}.xlsx`;

    return { blob, fileName };
};


/**
 * Generates a formatted text prompt for Amazon Seller/Vendor Support based on the specific issue.
 * @param {string} issueType - The type of issue (e.g., 'variation_orphan', 'theme_violation', 'buybox_hijack').
 * @param {Object} itemData - The original item data from the catalogue.
 * @param {Object} details - Additional contextual details (e.g., mismatched ASINs, live values).
 * @returns {string} The copy-pasteable prompt.
 */
export const generateSupportPrompt = (issueType, itemData, details = {}) => {
    const asin = itemData.asin || itemData.queryASIN || itemData.attributes?.mediaAsin || "UNKNOWN_ASIN";
    const brand = itemData.expected?.brand || itemData.comparisonData?.expected_brand || "[Your Brand Name]";
    let prompt = "";

    switch (issueType) {
        case 'variation_orphan':
            const missing = details.missing || "[List missing Child ASINs]";
            const parent = itemData.comparisonData?.expected_variation_parent || "[Parent ASIN]";
            prompt = `Hello Support Team,\n\nWe are the brand owner for ${brand}. It appears that the variation family for Parent ASIN ${parent} has been incorrectly split. The following Child ASIN(s) are orphaned and missing from the live detail page:\n\n${missing}\n\nPlease re-attach these Child ASINs to Parent ASIN ${parent} under the correct variation theme to restore the family integrity.`;
            break;

        case 'theme_violation':
            const expTheme = itemData.comparisonData?.expected_variation_theme || "[Expected Theme]";
            const actTheme = details.actualTheme || "[Current Theme]";
            prompt = `Hello Support Team,\n\nWe are the brand owner for ${brand}. The variation theme for our product family containing ASIN ${asin} has been incorrectly changed.\n\nExpected Theme: ${expTheme}\nCurrent Theme: ${actTheme}\n\nPlease update the variation theme back to '${expTheme}' to ensure a correct customer purchasing experience.`;
            break;

        case 'buybox_hijack':
            const expSeller = itemData.comparisonData?.expected_seller || "[Your Seller Name]";
            const actSeller = details.actualSeller || "[Current Seller]";
            prompt = `Hello Support Team,\n\nWe are the brand owner for ${brand}. We have noticed an issue with the Buy Box for our ASIN ${asin}.\n\nThe current Buy Box winner is listed as '${actSeller}', which is incorrect or an unauthorized seller for this condition. We expect '${expSeller}' to be the primary seller.\n\nPlease investigate this detail page for unauthorized modifications or inventory pooling issues.`;
            break;

        case 'content_hijack':
             prompt = `Hello Support Team,\n\nWe are the brand registered owner for ${brand}. The product attributes for our ASIN ${asin} have been incorrectly modified by another contributor, overriding our Golden Record data.\n\nPlease lock the retail contribution for this ASIN to our account to prevent further unauthorized changes to the Title, Bullets, and Description.`;
             break;

        default:
            prompt = `Hello Support Team,\n\nWe are the brand owner for ${brand}. We have identified an issue with our detail page for ASIN ${asin}. Please assist in correcting the discrepancies to match our authorized brand catalog.`;
            break;
    }

    return prompt;
};
