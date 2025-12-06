import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import PDFParser from 'pdf2json';
import { createWorker } from 'tesseract.js';

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir))
        {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(sanitizedName));
    }
});

const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 10 * 1024 * 1024;

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png'
        ];

        if (allowedTypes.includes(file.mimetype))
        {
            cb(null, true);
        }
        else
        {
            cb(new Error('Only PDF, JPG, and PNG files are allowed!'), false);
        }
    }
});

async function cleanupFile(filePath)
{
    try
    {
        await fs.access(filePath);
        await fs.unlink(filePath);
    }
    catch (error)
    {

    }
}

async function performImageOCR(filePath, fileSize, fileInfo)
{
    try
    {
        console.log('Starting OCR on image file...');

        const worker = await createWorker('eng');
        const { data: { text } } = await worker.recognize(filePath);
        const ocrText = text.trim();
        await worker.terminate();
        await cleanupFile(filePath);

        if (!ocrText || ocrText.length < 50)
        {
            return {
                success: false,
                status: 400,
                message: 'OCR completed but could not extract sufficient readable text from the image.'
            };
        }

        console.log(`Image OCR successful: extracted ${ocrText.length} characters`);

        return {
            success: true,
            data: {
                filename: fileInfo.originalname,
                fileSize: fileSize,
                mimeType: fileInfo.mimetype,
                textLength: ocrText.length,
                extractedText: ocrText,
                processingMethod: 'Image OCR'
            }
        };
    }
    catch (error)
    {
        console.error('Image OCR failed:', error);
        await cleanupFile(filePath);

        return {
            success: false,
            status: 500,
            message: `Image OCR failed: ${error.message}`
        };
    }
}

router.get('/test', (req, res) => {
    res.json({ message: 'Upload route working!' });
})

router.post('/resume', upload.single('resume'), async (req, res) => {
    console.log('=== UPLOAD ROUTE HIT ===');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    console.log('Headers:', req.headers);

    let filePath = null;

    try
    {
        if (!req.file)
        {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        filePath = req.file.path;
        const fileSize = req.file.size;

        console.log(`Processing file: ${req.file.originalname}`);

        if (req.file.mimetype.startsWith('image/'))
        {
            const result = await performImageOCR(filePath, fileSize, req.file);
            return res.status(result.status || 200).json(result);
        }

        const pdfParser = new PDFParser();

        const parsePDF = () => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('PDF parsing timeout'));
                }, 30000);

                pdfParser.on("pdfParser_dataError", errData => {
                    clearTimeout(timeout);
                    reject(new Error(errData.parseError || 'PDF parsing error'));
                });

                pdfParser.on("pdfParser_dataReady", pdfData => {
                    clearTimeout(timeout);
                    try
                    {
                        let extractedText = '';

                        if (pdfData.Pages)
                        {
                            pdfData.Pages.forEach(page => {
                                if (page.Texts)
                                {
                                    page.Texts.forEach(text => {
                                        if (text.R)
                                        {
                                            text.R.forEach(textRun => {
                                                if (textRun.T)
                                                {
                                                    extractedText += decodeURIComponent(textRun.T) + ' ';
                                                }
                                            });
                                        }
                                    });
                                    extractedText += '\n';
                                }
                            });
                        }

                        resolve(extractedText.trim());
                    }
                    catch (error)
                    {
                        reject(error);
                    }
                });

                pdfParser.loadPDF(filePath);
            });
        };

        try
        {
            const extractedText = await parsePDF();

            if (!extractedText || extractedText.length < 50)
            {
                console.log('PDF has minimal text, attempting OCR...');
                await cleanupFile(filePath);

                return res.status(400).json({
                    success: false,
                    message: 'This appears to be a scanned PDF. Please convert your resume to JPG or PNG format and upload as an image file for OCR processing.'
                });
            }

            await cleanupFile(filePath);

            console.log(`Successfully extracted ${extractedText.length} characters from PDF`);

            res.json({
                success: true,
                message: 'Resume processed successfully',
                data: {
                    filename: req.file.originalname,
                    fileSize: fileSize,
                    mimeType: req.file.mimetype,
                    textLength: extractedText.length,
                    extractedText: extractedText,
                    processingMethod: 'PDF Extraction'
                }
            });
        }
        catch (pdfError)
        {
            console.log('PDF parsing failed:', pdfError.message);
            await cleanupFile(filePath);

            return res.status(400).json({
                success: false,
                message: 'This appears to be a scanned PDF. Please convert your resume to JPG or PNG format and upload as an image file for OCR processing.'
            });
        }
    }
    catch (error)
    {
        console.error('Upload error:', error);

        if (filePath)
        {
            await cleanupFile(filePath);
        }

        const statusCode = error.message.includes('Only PDF') ? 400 : 500;

        res.status(statusCode).json({
            success: false,
            message: error.message || 'Server error during file upload'
        });
    }
});

export default router;