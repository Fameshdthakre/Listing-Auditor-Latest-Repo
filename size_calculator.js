// size_calculator.js

// Mocking a "Heavy" ASIN Result with all fields populated
const mockAsinData = {
  "Status": "SUCCESS",
  "PageASIN": "B08N5KWB9H",
  "QueryASIN": "B08N5KWB9H",
  "Audit Note": "Perfect Match: VC and PDP images are identical.",
  "Matches on Amazon PDP": "MAIN (I/71s7...); PT01 (I/81x...); PT02 (I/91...)",
  "Missing on Amazon PDP": "None",
  "Extra on Amazon PDP": "None",
  "PDP Self-Duplicated": "None",
  "VC Self-Duplicated": "None",
  
  // Attributes (Heavy Text)
  "attributes": {
    "marketplace": "Amazon.com",
    "brand": "Generic Brand Name Long Version",
    "metaTitle": "This is a very long product title that goes on for about 200 characters to simulate the maximum allowed length on Amazon which is usually around 200 bytes or characters depending on category rules.",
    "mediaAsin": "B08N5KWB9H",
    "parentAsin": "B08N5KWB9H",
    "displayPrice": "29.99",
    "basisPrice": "39.99",
    "stockStatus": "In Stock",
    "shipsFrom": "Amazon.com",
    "soldBy": "Amazon.com Services LLC",
    "rating": "4.5 out of 5 stars",
    "reviews": "1,234 ratings",
    "bsr": "#1 in Electronics > Camera & Photo > Accessories > Cases & Bags > Camera Cases",
    "bullets": "Bullet Point 1: This is a reasonably long bullet point describing a feature in detail. | Bullet Point 2: Another feature description that adds value to the customer. | Bullet Point 3: Technical specifications and other relevant data points. | Bullet Point 4: Warranty information and support details. | Bullet Point 5: Final closing statement and marketing fluff.",
    "description": "This is a massive product description block. It usually contains HTML or raw text. Let's simulate about 2000 characters of text here. ".repeat(20),
    "variationExists": "YES",
    "variationTheme": "[Color, Size, Style]",
    "variationCount": "15",
    "variationFamily": "[B001, B002, B003, B004, B005, B006, B007, B008, B009, B010]",
    "lqs": "95/100",
    "lqsDetails": [
      { "label": "Title Length (80-200)", "score": 10, "pass": true },
      { "label": "Images (7+)", "score": 15, "pass": true },
      { "label": "Bullet Points (5+)", "score": 15, "pass": true },
      { "label": "Description Length (100+ chars)", "score": 5, "pass": true },
      { "label": "Video Content", "score": 15, "pass": true },
      { "label": "A+ Content", "score": 20, "pass": true },
      { "label": "Rating (4.0+)", "score": 10, "pass": true },
      { "label": "Review Count (15+)", "score": 10, "pass": true }
    ],
    // Arrays of Images (Heavy URL strings)
    "brandStoryImgs": Array(5).fill({ "brand-story-image": "https://m.media-amazon.com/images/S/aplus-media/vc/12345678-1234-1234-1234-123456789012.__CR0,0,1464,600_PT0_SX1464_V1___.jpg", "brand-story-alt-text": "Brand Story Image Alt Text" }),
    "aPlusImgs": Array(10).fill({ "a-plus-image": "https://m.media-amazon.com/images/S/aplus-media/vc/12345678-1234-1234-1234-123456789012.__CR0,0,970,300_PT0_SX970_V1___.jpg", "a-plus-alt-text": "A+ Content Image Alt Text" }),
    "videos": Array(3).fill({ "video_title": "Product Demonstration Video 4K", "video_url": "https://www.amazon.com/vdp/0123456789abcdef0123456789abcdef" })
  },

  // Image Data (The heaviest part usually)
  // Simulating 10 images per product
  "data": Array(10).fill({
    "variant": "MAIN",
    "hiRes": "https://m.media-amazon.com/images/I/81yZ8XyZ8XL._AC_SL1500_.jpg",
    "large": "https://m.media-amazon.com/images/I/81yZ8XyZ8XL._AC_SL1500_.jpg",
    "thumb": "https://m.media-amazon.com/images/I/81yZ8XyZ8XL._AC_US40_.jpg"
  }),
  
  "PDP Images": "[]", // Stringified version often included in Audit result
  "VC Images": "[]"
};

// Fill stringified fields to be realistic
mockAsinData["PDP Images"] = JSON.stringify(mockAsinData.data);
mockAsinData["VC Images"] = JSON.stringify(mockAsinData.data);

const jsonString = JSON.stringify(mockAsinData);
const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
const sizeInKB = sizeInBytes / 1024;

console.log("--- ASIN Data Size Analysis ---");
console.log(`Single ASIN JSON Size: ${sizeInBytes} bytes`);
console.log(`Single ASIN JSON Size: ${sizeInKB.toFixed(2)} KB`);

const firestoreLimit = 1048576; // 1 MB
const safeLimit = 900000; // ~900 KB safety buffer

const maxItems = Math.floor(safeLimit / sizeInBytes);

console.log(`Firestore Document Limit: 1,048,576 bytes`);
console.log(`Recommended Safety Limit: ${safeLimit} bytes`);
console.log(`\n>>> MAX ASINs per Catalog Document: ${maxItems} <<<`);
