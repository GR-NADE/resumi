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

async function validateResume(text)
{
    try
    {
        const HF_API_KEY = process.env.HUGGINGFACE_API_TOKEN;

        if (!HF_API_KEY)
        {
            console.error('HUGGINGFACE_API_TOKEN not found in environment variables');
            return {
                isResume: false,
                confidence: 0,
                detectedContent: 'unknown',
                reason: 'API configuration error'
            };
        }

        const resumeKeywords = [
            'experience', 'education', 'skills', 'work', 'employment', 'university', 'degree', 'bachelor', 'master', 'phd', 'certificate', 'project', 'achievement', 'responsibilities', 'objective', 'summary', 'references', 'languages', 'qualification'
        ];

        const textLower = text.toLowercase();
        const keywordMatches = resumeKeywords.filter(keyword => textLower.includes(keyword));
        const hasEmail = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text);
        const hasPhone = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text);

        if (keywordMatches.length < 3 && !hasEmail)
        {
            const prompt = `
                Analyze this text and identify what type of document it is. Is it a resume/CV, or something else (like a recipe, article, book page, letter, etc.)? Be specific about what you detect.

                Text to analyze:
                ${text.substring(0, 1000)}

                Respond in this exact format:
                Document Type: [type]
                Confidence: [0-100]
                Reason: [brief explanation]
            `;

            const response = await fetch(
                "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1",
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${HF_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        inputs: prompt,
                        parameters: {
                            max_new_tokens: 150,
                            temperature: 0.3,
                            top_p: 0.9,
                        }
                    })
                }
            );

            if (!response.ok)
            {
                console.error('Hugging Face API error:', response.status);
                return {
                    isResume: false,
                    confidence: 30,
                    detectedContent: 'non-resume document',
                    reason: 'Insufficient resume-specific content detected'
                };
            }

            const result = await response.json();
            const aiResponse = result[0]?.generated_text || '';

            const isResumeDetected = /resume|cv|curriculum vitae/i.test(aiResponse);
            const detectedType = aiResponse.match(/Document Type:\s*([^\n]+)/i)?.[1]?.trim() || 'unknown document';
            const confidenceMatch = aiResponse.match(/Confidence:\s*(\d+)/i);
            const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 0;
            const reasonMatch = aiResponse.match(/Reason:\s*([^\n]+)/i);
            const reason = reasonMatch?.[1]?.trim() || 'Content does not match resume format';

            console.log('AI Validation Result:', { isResumeDetected, detectedType, confidence, reason });

            return {
                isResume: isResumeDetected && confidence > 60,
                confidence: confidence,
                detectedContent: detectedType,
                reason: reason
            };
        }

        return {
            isResume: true,
            confidence: 85,
            detectedContent: 'resume/cv',
            reason: 'Document contains resume-specific content and structure'
        };
    }
    catch (error)
    {
        console.error('Resume validation error:', error);
        const textLower = text.toLowerCase();
        const hasResumeKeywords = ['experience', 'education', 'skills'].some(k => textLower.includes(k));

        return {
            isResume: hasResumeKeywords,
            confidence: hasResumeKeywords ? 60 : 20,
            detectedContent: hasResumeKeywords ? 'possible resume' : 'unknown',
            reason: 'Validation service unavailable, using basic detection'
        };
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

        if (!ocrText || ocrText.length < 50)
        {
            await cleanupFile(filePath);
            return {
                success: false,
                status: 400,
                message: 'OCR completed but could not extract sufficient readable text from the image.'
            };
        }

        console.log(`Image OCR successful: extracted ${ocrText.length} characters`);

        const validation = await validateResume(ocrText);

        if (!validation.isResume)
        {
            await cleanupFile(filePath);

            let message = `This doesnt appear to be a resume.`;

            if (validation.detectedContent && validation.detectedContent !== 'unknown')
            {
                message += `The uploaded image appears to contain ${validation.detectedContent}. `;
            }

            message += `Please upload an image of your actual resume/CV containing sections like experience, education, and skills.`;

            return {
                success: false,
                status: 400,
                message: message,
                validationDetails: {
                    detectedContent: validation.detectedContent,
                    confidence: validation.confidence
                }
            };
        }

        await cleanupFile(filePath);

        return {
            success: true,
            data: {
                filename: fileInfo.originalname,
                fileSize: fileSize,
                mimeType: fileInfo.mimetype,
                textLength: ocrText.length,
                extractedText: ocrText,
                processingMethod: 'Image OCR',
                validation: {
                    isResume: true,
                    confidence: validation.confidence
                }
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

            const validation = await validateResume(extractedText);

            if (!validation.isResume)
            {
                await cleanupFile(filePath);

                let message = `This PDF doesn't appear to be a resume. `;

                if (validation.detectedContent && validation.detectedContent !== 'unknown')
                {
                    message += `The uploaded document appears to be ${validation,detectedContent}.`;
                }

                message += `Please upload your actual resume/CV containing sections like work experience, education, and skills.`;

                return res.status(400).json({
                    success: false,
                    message: message,
                    validationDetails: {
                        detectedContent: validation.detectedContent,
                        confidence: validation.confidence
                    }
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
                    processingMethod: 'PDF Extraction',
                    validation: {
                        isResume: true,
                        confidence: validation.confidence
                    }
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