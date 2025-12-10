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
        You are an expert resume reviewer. Analyze the following resume and provide feedback.
        
        Resume:
        ${textToAnalyze}
        
        Provide your analysis in this EXACT JSON format (no markdown, no extra text):
        {
            "overallScore": 8,
            "summary": "Brief 2-3 sentence assessment",
            "strengths": [
                "[specific strength 1]",
                "[specific strength 2]",
                "[specific strength 3]"
            ],
            "weaknesses": [
                "[specific weakness 1]",
                "[specific weakness 2]",
                "[specific weakness 3]"
            ],
            "improvements": [
                "[actionable improvement 1]",
                "[actionable improvement 2]",
                "[actionable improvement 3]"
            ],
            "categories": {
                "formatting": 8,
                "content": 7,
                "skills": 9,
                "experience": 7,
                "achievements": 6
            },
            "keywordSuggestions": [
                "[relevant keyword 1]",
                "[relevant keyword 2]",
                "[relevant keyword 3]"
            ]
        }

        Return ONLY valid JSON.`;

        console.log('Calling Hugging Face API with Qwen2.5-Coder...');

        const response = await hf.chatCompletion({
            model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
            messages: [
                {
                    role: "system",
                    content: "You are a resume analysis expert. Always respond with valid JSON only, no markdown formatting."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 1000,
            temperature: 0.3
        });

        console.log('Hugging Face response received');

        let analysisData;
        try
        {
            const aiResponse = response.choices[0].message.content.trim();

            let cleanedResponse = aiResponse;
            if (aiResponse.includes('```'))
            {
                cleanedResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            }

            const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : cleanedResponse;

            analysisData = JSON.parse(jsonString);

            analysisData.overallScore = Math.min(10, Math.max(0, Number(analysisData.overallScore) || 7));
            analysisData.summary = analysisData.summary?.substring(0, 500) || "Resume analysis completed.";
            analysisData.strengths = Array.isArray(analysisData.strengths) ? analysisData.strengths.slice(0, 5) : [];
            analysisData.weaknesses = Array.isArray(analysisData.weaknesses) ? analysisData.weaknesses.slice(0, 5) : [];
            analysisData.improvements = Array.isArray(analysisData.improvements) ? analysisData.improvements.slice(0, 5) : [];
            analysisData.keywordSuggestions = Array.isArray(analysisData.keywordSuggestions) ? analysisData.keywordSuggestions.slice(0, 10) : [];

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
            console.error('Raw AI response:', response.choices[0].message.content);

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
                    achievements: 6
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
        console.error('Resume analysis error:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to analyze resume. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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