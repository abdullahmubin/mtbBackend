import express from 'express';
import axios from 'axios';
const router = express.Router();
import { updateWithCondition } from '../services/subscriptionsService.js';
import { uploadBS, wrappSuccessResult } from './../utils/index.js';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import { createObjectCsvWriter, createObjectCsvStringifier } from 'csv-writer';

const __dirname = path.resolve();

// S3 v3 client setup
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Initialize Textract client
const textractClient = new TextractClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

router.get('/', async (req, res) => {
    try {
        res.status(200).send(wrappSuccessResult(200, { message: 'Bank Statement service is active' }));
    } catch (err) {
        console.error('Error in bank statement GET endpoint:', err);
        res.status(500).json({ 
            status: "Error", 
            statusCode: 500, 
            message: "Server error", 
            error: err.message || 'Unknown error'
        });
    }
});

router.post('/', uploadBS.single("pdf"), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ 
                status: "Error", 
                statusCode: 400, 
                message: "No file uploaded", 
                error: "Please provide a PDF file"
            });
        }

        const s3Key = `bank_statements/${file.filename}`;
        const s3Bucket = process.env.S3_BUCKET;

        try {
            await s3.send(new PutObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: `bank_statements/${file.filename}`,
                Body: fs.createReadStream(file.path),
                ContentType: file.mimetype,
            }));

            res.status(200).send(wrappSuccessResult(200, {
                message: "File processed and analyzed",
                s3Key,
            }));
        } catch (err) {
            console.error("Error running Textract:", err);
            res.status(500).json({ 
                status: "Error", 
                statusCode: 500, 
                message: "Textract processing failed", 
                error: err.message || "S3 upload failed"
            });
        } finally {
            // Optional: Clean up local uploaded file
            fs.unlink(file.path, () => { });
        }
    } catch (err) {
        console.error("Unexpected error in bank statement upload:", err);
        res.status(500).json({ 
            status: "Error", 
            statusCode: 500, 
            message: "Server error", 
            error: err.message || 'Unknown error during upload'
        });
    }
});

function extractTables(textractResult) {
    const tables = [];
    const tableBlocks = textractResult.Blocks.filter(b => b.BlockType === 'TABLE');

    for (const tableBlock of tableBlocks) {
        const cellIds = tableBlock.Relationships?.[0]?.Ids || [];
        const cellBlocks = cellIds.map(id => textractResult.Blocks.find(b => b.Id === id));

        // Find table dimensions
        const maxRow = Math.max(...cellBlocks.map(c => c.RowIndex));
        const maxCol = Math.max(...cellBlocks.map(c => c.ColumnIndex));

        // Create empty matrix
        const table = Array.from({ length: maxRow }, () => 
            Array.from({ length: maxCol }, () => '')
        );

        // Fill table cells
        cellBlocks.forEach(cell => {
            const words = cell.Relationships?.[0]?.Ids?.map(id => 
                textractResult.Blocks.find(b => b.Id === id)?.Text || ''
            ) || [];
            
            const row = cell.RowIndex - 1;
            const col = cell.ColumnIndex - 1;
            table[row][col] = words.join(' ').trim();
        });

        // Remove completely empty rows
        const cleanedTable = table
            .map(row => row.map(cell => cell || '')) // Keep empty strings for missing cells
            .filter(row => row.some(cell => cell !== ''));

        if (cleanedTable.length > 0) {
            tables.push(cleanedTable);
        }
    }

    return tables;
}

// GET /download?key=bank_statements/...&type=csv|excel
router.get("/download", async (req, res) => {
    const { key, type } = req.query;
    if (!key || !["csv", "excel"].includes(type)) {
        return res.status(400).json({ error: "Invalid parameters" });
    }

    try {
        const textractParams = {
            Document: {
                S3Object: {
                    Bucket: process.env.S3_BUCKET,
                    Name: key,
                },
            },
            FeatureTypes: ["TABLES"],
        };

        const textractResult = await textractClient.send(new AnalyzeDocumentCommand(textractParams));
        const extractedData = extractTables(textractResult);



        console.log('extractedData');
        console.log(extractedData);
        if (!extractedData.length) {
            return res.status(404).json({ error: "No table data found" });
        }

        const filename = `extracted.${type === "csv" ? "csv" : "xlsx"}`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", type === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        // if (type === "csv") {
        //     const { format } = await import("@fast-csv/format");
        //     const csvStream = format({ headers: true });
        //     csvStream.pipe(res);
        //     extractedData.forEach(row => csvStream.write(row));
        //     csvStream.end();
        // } else {
        //     const xlsx = await import("exceljs");
        //     const workbook = new xlsx.Workbook();
        //     const sheet = workbook.addWorksheet("Textract Data");

        //     sheet.columns = Object.keys(extractedData[0]).map(key => ({ header: key, key }));
        //     extractedData.forEach(row => sheet.addRow(row));

        //     await workbook.xlsx.write(res);
        //     res.end();
        // }

        // Modify your download route handler
        if (type === "csv") {
            const { format } = await import("@fast-csv/format");
            const csvStream = format({ headers: extractedData[0][0] }); // Use first row as headers

            csvStream.pipe(res);

            // Skip header row and write data rows
            extractedData[0].slice(1).forEach(row => {
                const record = {};
                extractedData[0][0].forEach((header, index) => {
                    record[header] = row[index] || ''; // Handle missing values
                });
                csvStream.write(record);
            });

            csvStream.end();
        } else {
            const xlsx = await import("exceljs");
            const workbook = new xlsx.Workbook();
            const sheet = workbook.addWorksheet("Bank Statement");

            // Add headers
            sheet.addRow(extractedData[0][0]);

            // Add data rows
            extractedData[0].slice(1).forEach(row => {
                const rowData = extractedData[0][0].map((header, index) => row[index] || '');
                sheet.addRow(rowData);
            });

            await workbook.xlsx.write(res);
            res.end();
        }
    } catch (err) {
        console.error("Error processing document:", err);
        res.status(500).json({ error: "Failed to extract and download data" });
    }
});


const configure = (app) => {
    app.use('/api/bankstatement', router)
}

export default configure;



// const downloadFile = async (e, type = "csv") => {
  //   e.preventDefault();
  //   const extractedData = [
  //     {
  //         "Text": "Reset Form"
  //     },
  //     {
  //         "Text": "Save Form"
  //     },
  //     {
  //         "Text": "Print Form"
  //     },
  //     {
  //         "Text": "Your Account Statement"
  //     },
  //     {
  //         "Text": "Bickslow"
  //     },
  //     {
  //         "Text": "Issue Date:"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "Bank"
  //     },
  //     {
  //         "Text": "Period:"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy to mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "111-234-567-890"
  //     },
  //     {
  //         "Text": "<Branch Name>"
  //     },
  //     {
  //         "Text": "Bit Manufacturing Ltd"
  //     },
  //     {
  //         "Text": "231 Valley Farms Street"
  //     },
  //     {
  //         "Text": "2450 Courage St, STE 108"
  //     },
  //     {
  //         "Text": "Santa Monica, CA"
  //     },
  //     {
  //         "Text": "Brownsville, TX 78521"
  //     },
  //     {
  //         "Text": "bickslowbank@domain.com"
  //     },
  //     {
  //         "Text": "Account Activity"
  //     },
  //     {
  //         "Text": "Date"
  //     },
  //     {
  //         "Text": "Payment Type"
  //     },
  //     {
  //         "Text": "Detail"
  //     },
  //     {
  //         "Text": "Paid In"
  //     },
  //     {
  //         "Text": "Paid Out"
  //     },
  //     {
  //         "Text": "Balance"
  //     },
  //     {
  //         "Text": "Balance Brought Forward"
  //     },
  //     {
  //         "Text": "8,313.30"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "Fast Payment"
  //     },
  //     {
  //         "Text": "Amazon"
  //     },
  //     {
  //         "Text": "132.30"
  //     },
  //     {
  //         "Text": "8,181.00"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "BACS"
  //     },
  //     {
  //         "Text": "eBAY Trading Co."
  //     },
  //     {
  //         "Text": "515.22"
  //     },
  //     {
  //         "Text": "7,665.78"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "Fast Payment"
  //     },
  //     {
  //         "Text": "Morrisons Petrol"
  //     },
  //     {
  //         "Text": "80.00"
  //     },
  //     {
  //         "Text": "7,585.78"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "BACS"
  //     },
  //     {
  //         "Text": "Business Loan"
  //     },
  //     {
  //         "Text": "20,000.00"
  //     },
  //     {
  //         "Text": "27,585.78"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy BACS"
  //     },
  //     {
  //         "Text": "Jumes White Media"
  //     },
  //     {
  //         "Text": "2,416.85"
  //     },
  //     {
  //         "Text": "25,168.93"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "Fast Payment"
  //     },
  //     {
  //         "Text": "ATM High Street"
  //     },
  //     {
  //         "Text": "100.00"
  //     },
  //     {
  //         "Text": "25,068.93"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy BACS"
  //     },
  //     {
  //         "Text": "Accorn Advertising Studios"
  //     },
  //     {
  //         "Text": "150.00"
  //     },
  //     {
  //         "Text": "24,918.93"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy Fast Payment"
  //     },
  //     {
  //         "Text": "Marriott Hotels"
  //     },
  //     {
  //         "Text": "177.00"
  //     },
  //     {
  //         "Text": "24,741.93"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy"
  //     },
  //     {
  //         "Text": "Fast Payment"
  //     },
  //     {
  //         "Text": "Abelio Scotrail Ltd"
  //     },
  //     {
  //         "Text": "122.22"
  //     },
  //     {
  //         "Text": "24,619.71"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy Fast Payment"
  //     },
  //     {
  //         "Text": "Cheque 000234"
  //     },
  //     {
  //         "Text": "1,200.00"
  //     },
  //     {
  //         "Text": "23,419.71"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy Int. Bank"
  //     },
  //     {
  //         "Text": "Interest Paid"
  //     },
  //     {
  //         "Text": "9.33"
  //     },
  //     {
  //         "Text": "23,429.04"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy DD"
  //     },
  //     {
  //         "Text": "OVO Energy"
  //     },
  //     {
  //         "Text": "270.00"
  //     },
  //     {
  //         "Text": "23,159.04"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy BACS"
  //     },
  //     {
  //         "Text": "Toyota Online"
  //     },
  //     {
  //         "Text": "10,525.40"
  //     },
  //     {
  //         "Text": "12,633.64"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy BACS"
  //     },
  //     {
  //         "Text": "HMRC"
  //     },
  //     {
  //         "Text": "1,000.00"
  //     },
  //     {
  //         "Text": "11,633.64"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy DD"
  //     },
  //     {
  //         "Text": "OVLA"
  //     },
  //     {
  //         "Text": "280.00"
  //     },
  //     {
  //         "Text": "11,353.64"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy EBP"
  //     },
  //     {
  //         "Text": "Michael Kor Salary"
  //     },
  //     {
  //         "Text": "1,554.00"
  //     },
  //     {
  //         "Text": "9,799.64"
  //     },
  //     {
  //         "Text": "mm/dd/yyyy DD"
  //     },
  //     {
  //         "Text": "BOS Mastercard"
  //     },
  //     {
  //         "Text": "4,000.00"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "5,799.64"
  //     },
  //     {
  //         "Text": "Note:"
  //     }
  // ]
  //   const res = await fetch(`http://localhost:3030/api/bankstatement/download`, {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({ data: extractedData }),
  //   });
  
  //   const blob = await res.blob();
  //   const url = window.URL.createObjectURL(blob);
  //   const link = document.createElement("a");
  //   link.href = url;
  //   link.download = type === "csv" ? "statement.csv" : "statement.xlsx";
  //   document.body.appendChild(link);
  //   link.click();
  //   link.remove();
  // };

//   const downloadFile = async (e) => {
//     e.preventDefault();
//     const key = "bank_statements/1744629035519-Bank-Statement-Template-2-TemplateLab.pdf";
//     const type = "csv";
//     try {
//       const response = await fetch(`http://localhost:3030/api/bankstatement/download?key=${encodeURIComponent(key)}&type=${type}`, {
//         method: "GET",
//       });
  
//       if (!response.ok) {
//         throw new Error("Download failed");
//       }
  
//       const blob = await response.blob();
//       const url = window.URL.createObjectURL(blob);
  
//       const link = document.createElement("a");
//       link.href = url;
//       link.download = `extracted.${type === "excel" ? "xlsx" : "csv"}`;
//       document.body.appendChild(link);
//       link.click();
  
//       window.URL.revokeObjectURL(url);
//       document.body.removeChild(link);
//     } catch (err) {
//       console.error("Download error:", err);
//       alert("Failed to download file.");
//     }
//   };
  