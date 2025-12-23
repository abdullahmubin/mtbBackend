import puppeteer from 'puppeteer';
import logger from './logger.js';

export const renderAndSaveImage = async (mainhtml, imageName, fontFamily = 'Oswald') => {

  const cleanFont = fontFamily.split(',')[0].trim(); // → "Source Sans Pro"
  const fontNameForURL = cleanFont.replace(/\s+/g, '+');

  const html = `
<html>
  <head>
    <link href="https://fonts.googleapis.com/css2?family=${fontNameForURL}:wght@400;600;700&display=swap" rel="stylesheet">
    <style>

    * {
      font-family: '${cleanFont}', sans-serif !important;
    }

    body {
      font-family: '${cleanFont}', sans-serif;
    }
    #logoPlaceholder:has(img[src=""]) {
  display: none;
}
  #logoPlaceholder img[src=""] {
  display: none;
}

.add-item-row {
    display: none;
}
#addItemBtn {
    display: none;
}
#styleMenu {
    display: none !important;
}
.item-qty-input, .item-price-input{
    border: none !important;
}

.table-container {
    margin-top: 20px;
}

.hover-controls {
    visibility: hidden;
    margin-left: 10px;
}

th:hover .hover-controls {
    visibility: visible;
}

.table-wrapper {
    margin-bottom: 40px;
}

.divider {
    border-bottom: 2px solid black;
    margin-top: 15px;
}

tr {
    position: relative;
}

.row-delete-btn {
    position: absolute;
    top: 50%;
    right: -30px;
    transform: translateY(-50%);
    visibility: hidden;
    cursor: pointer;
    background: transparent;
    border: none;
    font-size: 16px;
}

tr:hover .row-delete-btn {
    visibility: visible;
}

:root {
    --arrow-left: 20px;
}

/* Simple Editor Styles */
.simple-receipt-editor {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 64px);
    background-color: #f5f8fa;
    padding: 20px;
}

.editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid #f0f0f0;
}

.editor-title {
    max-width: 60%;
}

.editor-actions {
    display: flex;
    align-items: center;
}

/* Zoom indicator */
.zoom-controls {
    display: flex;
    align-items: center;
    margin-right: 15px;
    background: #f9f9f9;
    border-radius: 4px;
    padding: 0 5px;
}

.zoom-level {
    padding: 0 8px;
    min-width: 60px;
    text-align: center;
    font-weight: 500;
}

/* Fullscreen mode */
:fullscreen .editor-content {
    height: calc(100vh - 120px);
    max-height: none;
    padding: 20px;
}

:fullscreen .simple-receipt-editor {
    height: 100vh;
}

.editor-content {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    overflow: auto;
    padding: 20px;
}

.receipt-container {
    background-color: white;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    padding: 30px;
    width: 100%;
    max-width: 340px;
    min-height: 700px;
    position: relative;
    border-radius: 8px;
}

.receipt-content {
    width: 100%;
}

.receipt-logo-section {
    text-align: center;
    margin-bottom: 20px;
}

.receipt-logo {
    max-width: 120px;
    max-height: 60px;
    margin-bottom: 10px;
}

.logo-placeholder {
    margin: 10px auto;
    padding: 10px;
    border: 2px dashed #eee;
    border-radius: 4px;
    display: inline-flex;
    justify-content: center;
}

.business-name {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 10px 0 5px;
}

.business-address, .business-phone {
    margin: 5px 0;
    font-size: 0.9rem;
}

.receipt-info {
    padding: 10px 0;
    margin: 15px 0;
}

.receipt-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
}

.receipt-label {
    font-weight: 600;
}

/* Product table specific styles */
#productTable {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    font-size: 0.9em;
    table-layout: fixed;
}

#productTable thead {
    background-color: #f5f5f5;
}

#productTable th {
    padding: 10px 8px;
    text-align: left;
    font-weight: bold;
    border-bottom: 2px solid #ddd;
    color: #333;
}

#productTable td {
    padding: 8px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
    word-wrap: break-word;
}

#productTable tbody tr:nth-child(even) {
    background-color: #fafafa;
}

#productTable tbody tr:hover {
    background-color: #f0f0f0;
}

/* Dynamic column widths based on number of columns */
/* 2 columns: Item + Price */
#productTable th:nth-child(1):nth-last-child(2),
#productTable td:nth-child(1):nth-last-child(2) {
    width: 70%;
}

#productTable th:nth-child(2):nth-last-child(1),
#productTable td:nth-child(2):nth-last-child(1) {
    width: 30%;
    text-align: right;
}

/* 3 columns: Item + Qty + Price */
#productTable th:nth-child(1):nth-last-child(3),
#productTable td:nth-child(1):nth-last-child(3) {
    width: 50%;
}

#productTable th:nth-child(2):nth-last-child(2),
#productTable td:nth-child(2):nth-last-child(2) {
    width: 20%;
    text-align: center;
}

#productTable th:nth-child(3):nth-last-child(1),
#productTable td:nth-child(3):nth-last-child(1) {
    width: 30%;
    text-align: right;
}

/* 4 columns: Item + Qty + Price + Total */
#productTable th:nth-child(1):nth-last-child(4),
#productTable td:nth-child(1):nth-last-child(4) {
    width: 40%;
}

#productTable th:nth-child(2):nth-last-child(3),
#productTable td:nth-child(2):nth-last-child(3) {
    width: 15%;
    text-align: center;
}

#productTable th:nth-child(3):nth-last-child(2),
#productTable td:nth-child(3):nth-last-child(2) {
    width: 20%;
    text-align: right;
}

#productTable th:nth-child(4):nth-last-child(1),
#productTable td:nth-child(4):nth-last-child(1) {
    width: 25%;
    text-align: right;
}

/* 5+ columns: Equal distribution */
#productTable th:nth-child(n+5),
#productTable td:nth-child(n+5) {
    width: auto;
}

/* Legacy class-based styles for backward compatibility */
#productTable .item-column {
    font-weight: 500;
}

#productTable .qty-column {
    text-align: center;
}

#productTable .price-column {
    text-align: right;
}

#productTable .total-column {
    text-align: right;
    font-weight: 500;
}

#productTable tfoot {
    border-top: 2px solid #333;
}

#productTable tfoot td {
    padding: 8px;
    font-weight: bold;
    border-bottom: none;
}

#productTable tfoot tr:first-child {
}

#productTable tfoot tr:nth-child(2) {
    border-top: 1px solid #eee;
}

#productTable tfoot tr:nth-child(2) td {
    font-weight: bold;
    border-top: 1px solid #eee;
}

#productTable tfoot tr:nth-child(3) td {
    font-size: 14px;
}

#productTable tfoot tr:nth-child(4) td {
    font-size: 14px;
}

#productTable tfoot tr:nth-child(5) {
    border-top: 2px solid #333;
}

#productTable tfoot tr:nth-child(5) td {
    font-weight: bold;
    font-size: 1.1em;
    border-top: 2px solid #333;
}

#productTable tfoot td:last-child {
    text-align: right !important;
}

#productTable input {
    width: 60px;
    box-sizing: border-box;
    margin: 0;
    padding: 4px;
    font-size: 14px;
}

#taxRate, #discountInput {
    border: none !important;
    background: transparent !important;
    outline: none !important;
    font-family: inherit;
}

#taxRate:focus, #discountInput:focus {
    background: rgba(24, 144, 255, 0.1) !important;
    border-radius: 3px;
}

#taxRate::-webkit-outer-spin-button,
#taxRate::-webkit-inner-spin-button,
#discountInput::-webkit-outer-spin-button,
#discountInput::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

/* General table styles for any table */
table {
    width: 100%;
    border-collapse: collapse;
}

table th,
table td {
    padding: 8px;
    text-align: left;
    border-bottom: 1px solid #eee;
}

table th {
    background-color: #f5f5f5;
    font-weight: bold;
}

/* Responsive table for smaller screens */
@media (max-width: 400px) {
    #productTable th,
    #productTable td {
        padding: 6px 4px;
        font-size: 0.85em;
    }
}

    </style>
  </head>
  <body>
   <div class="receipt-container" style="color: rgb(51, 51, 51); transform: scale(1); transform-origin: center top; transition: transform 0.2s; padding-top: 20px;">
  ${mainhtml}
</div>
  </body>
</html>
`;
  const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');
  
  // Additional wait for font rendering to complete
  await new Promise(resolve => setTimeout(resolve, 2000));

  const hasLogoImage = await page.evaluate(() => {
    const logo = document.querySelector('#logoPlaceholder img');
    return !!(logo && logo.src && logo.src.trim() !== '' && logo.complete && logo.naturalWidth !== 0);
  });

  if (!hasLogoImage) {
    await page.evaluate(() => {
      const placeholder = document.querySelector('#logoPlaceholder');
      if (placeholder) {
        placeholder.style.display = 'none';
      }
    });
  }

  // Wait for element
  const element = await page.$('.receipt-container');
    if (!element) {
        logger.error('Element .receipt-container not found');
        await browser.close();
        return;
    }

  // Get bounding box
  const boundingBox = await element.boundingBox();

  await page.evaluate(() => {
    document.body.style.background = 'white';
  });

  // Screenshot cropped to element only
  const buffer = await page.screenshot({
    clip: {
      x: boundingBox.x,
      y: boundingBox.y,
      width: boundingBox.width,
      height: boundingBox.height,
    },
    omitBackground: true,
    type: 'png',
  });

  const fileSizeInBytes = buffer.length;
  await browser.close();

  return {
    fileName: imageName,
    buffer: buffer,
    fileType: 'image/png',
    size: (fileSizeInBytes / 1024).toFixed(2) // KB
  };
}; 