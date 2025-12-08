import express from 'express';
import { HfInference } from '@huggingface/inference';
import Analysis from '../models/Analysis.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/analyze', async (req, res) => {
    try
    {
        const { resumeText, metadata } = req.body;

        if (!resumeText || resumeText.trim().length < 100)
        {
            return res.status(400).json({
                success: false,
                message: 'Resume text is required and must be substantial enough for analysis.'
            });
        }

        const maxLength = 50000;
        const textToAnalyze = resumeText.length > maxLength ? resumeText.substring(0, maxLength) : resumeText;

        console.log(`Analyzing resume text (${textToAnalyze.length} characters)...`);

        if (!process.env.HUGGINGFACE_API_TOKEN)
        {
            console.error('HuggingFace API token not configured');
            return res.status(500).json({
                success: false,
                message: 'AI service is not configured. Please contact support.'
            });
        }

        const hf = new HfInference(process.env.HUGGINGFACE_API_TOKEN);

        const prompt = `
        You are an expert resume reviewer. Analyze this resume and provide feedback in JSON format.
        
        Resume:
        ${textToAnalyze}
        
        Please provide your analysis as valid JSON with this structure:
        {
            "overallScore": 8,
            "summary": "Brief 2-3 sentence assessment",
            "strengths": [
                "[strength1]",
                "[strength2]",
                "[strength3]"
            ],
            "weaknesses": [
                "[weakness1]",
                "[weakness2]",
                "[weakness3]"
            ],
            "improvements": [
                "[improvement1]",
                "[improvement2]",
                "[improvement3]"
            ],
            "categories": {
                "formatting": 8,
                "content": 7,
                "skills": 9,
                "experience": 7,
                "achievements": 6
            },
            "keywordSuggestions": [
                "[keyword1]",
                "[keyword2]",
                "[keyword3]"
            ]
        }

        Return ONLY the JSON, no other text.`;

        console.log('Calling Hugging Face API...');

        let response;
        try
        {
            response = await hf.chatCompletion({
                model: 'mistralai/Mistral-7B-Instruct-v0.2',
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 1000,
                temperature: 0.7
            });

            console.log('Hugging Face response recieved');
        }
        catch (hfError)
        {
            console.error('========== HUGGING FACE ERROR DETAILS ==========');
            console.error('Error message:', hfError.message);
            console.error('Error code:', hfError.code);
            console.error('HTTP Status:', hfError.httpResponse?.status);
            console.error('HTTP Request URL:', hfError.httpRequest?.url);
            console.error('HTTP Request Method:', hfError.httpRequest?.method);
            console.error('HTTP Request Headers:', hfError.httpRequest?.headers);

            if (hfError.httpResponse?.body)
            {
                console.error('HTTP Response body:', JSON, stringify(hfError.httpResponse.body, null, 2));
            }

            console.error('Full error object:', JSON.stringify(hfError, null, 2));

            console.error('========== END ERROR DETAILS ==========');

            throw hfError;
        }

        let analysisData;
        try
        {
            const aiResponse = response.choices[0].message.content.trim();
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;

            analysisData = JSON.parse(jsonString);

            analysisData.overallScore = Math.min(10, Math.max(0, analysisData.overallScore || 7));
            analysisData.summary = analysisData.summary?.substring(0, 500) || "Resume analysis completed.";
            analysisData.strengths = (analysisData.strengths || []).slice(0, 5);
            analysisData.weaknesses = (analysisData.weaknesses || []).slice(0, 5);
            analysisData.improvements = (analysisData.improvements || []).slice(0, 5);
            analysisData.keywordSuggestions = (analysisData.keywordSuggestions || []).slice(0, 10);

            if (!analysisData.categories || typeof analysisData.categories !== 'object')
            {
                analysisData.categories = {
                    formatting: 7,
                    content: 7,
                    skills: 7,
                    experience: 7,
                    achievements: 7
                };
            }
            else
            {
                Object.keys(analysisData.categories).forEach(key => {
                    analysisData.categories[key] = Math.min(10, Math.max(0, analysisData.categories[key] || 7));
                });
            }
        }
        catch (parseError)
        {
            console.error('Failed to parse AI response:', parseError);

            analysisData = {
                overallScore: 7,
                summary: "Resume shows professional experience but detailed AI analysis format unavailable.",
                strengths: ["Professional content", "Relevant experience", "Technical skills listed"],
                weaknesses: ["Could improve quantifiable achievements", "Limited project details", "Missing keywords"],
                improvements: ["Add metrics to achievements", "Include project examples", "Expand skill descriptions"],
                categories: {
                    formatting: 7,
                    content: 7,
                    skills: 7,
                    experience: 7,
                    achievements: 6,
                },
                keywordSuggestions: ["Industry terms", "Technical skills", "Soft skills"]
            };
        }

        const uniqueId = crypto.randomBytes(8).toString('hex');

        const savedAnalysis = await Analysis.create({
            uniqueId,
            resumeText: process.env.NODE_ENV === 'production' ? textToAnalyze.substring(0, 1000) + '...' : textToAnalyze,
            analysisData,
            metadata: metadata || {}
        });

        console.log(`Analysis saved with ID: ${uniqueId}`);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        res.json({
            success: true,
            message: 'Resume analysis completed',
            data: analysisData,
            shareableLink: `${frontendUrl}/analysis/${uniqueId}`,
            uniqueId: uniqueId
        });
    }
    catch (error)
    {
        console.error('========== RESUME ANALYSIS ERROR ==========');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('========== END ERROR ==========');

        res.status(500).json({
            success: false,
            message: 'Failed to analyze resume. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.get('/test-hf', async (req, res) => {
    try
    {
        if (!process.env.HUGGINGFACE_API_TOKEN)
        {
            return res.json({
                success: false,
                message: 'HUGGINGFACE_API_TOKEN not set in environment'
            });
        }

        const hf = new HfInference(process.env.HUGGINGFACE_API_TOKEN);

        const testResult = await hf.textGeneration({
            model: 'distilgpt2',
            inputs: 'Hello world',
            parameters: { max_length: 10 }
        });

        res.json({
            sucess: true,
            message: 'Hugging Face API is working',
            model: 'distilgpt2',
            testResult: testResult.generated_text
        });
    }
    catch (error)
    {
        console.error('Hugging Face test failed DETAILS:', {
            message: error.message,
            httpResponse: error.httpResponse,
            body: error.httpResponse?.body
        });

        res.json({
            success: false,
            message: 'Hugging Face API test failed',
            error: error.message,
            responseBody: error.httpResponse?.body,
            status: error.httpResponse?.status
        });
    }
});

router.get('/:uniqueId', async (req, res) => {
    try
    {
        const { uniqueId } = req.params;

        if (!/^[a-f0-9]{16}$/.test(uniqueId))
        {
            return res.status(400).json({
                success: false,
                message: 'Invalid analysis ID format'
            });
        }

        const analysis = await Analysis.findOne({ uniqueId }).select('-resumeText');

        if (!analysis)
        {
            return res.status(404).json({
                success: false,
                message: 'Analysis not found'
            });
        }

        res.json({
            success: true,
            data: {
                analysisData: analysis.analysisData,
                metadata: analysis.metadata,
                createdAt: analysis.createdAt
            }
        });
    }
    catch (error)
    {
        console.error('Error fetching analysis:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analyis'
        });
    }
});

export default router;