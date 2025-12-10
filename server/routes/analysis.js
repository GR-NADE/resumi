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

        const systemPrompt = "You are a resume analysis expert. Respond ONLY with valid JSON, no other text.";

        const userPrompt = `
        Analyze this resume and provide feedback in JSON format:
        
        ${textToAnalyze}
        
        Respond with ONLY this JSON structure (no markdown, no extra text):
        {
            "overallScore": 8,
            "summary": "Brief 2-3 sentence assessment",
            "strengths": [
                "[strength 1]",
                "[strength 2]",
                "[strength 3]"
            ],
            "weaknesses": [
                "[weakness 1]",
                "[weakness 2]",
                "[weakness 3]"
            ],
            "improvements": [
                "[improvement 1]",
                "[improvement 2]",
                "[improvement 3]"
            ],
            "categories": {
                "formatting": 8,
                "content": 7,
                "skills": 9,
                "experience": 7,
                "achievements": 6
            },
            "keywordSuggestions": [
                "[keyword 1]",
                "[keyword 2]",
                "[keyword 3]"
            ]
        }`;

        console.log('Calling Hugging Face API with SmolLM3-3B...');

        const response = await hf.chatCompletion({
            model: 'HuggingFaceTB/SmolLM3-3B',
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ],
            max_tokens: 1000,
            temperature: 0.3
        });

        console.log('Hugging Face response received');

        let analysisData;
        try
        {
            let aiResponse = response.choices[0].message.content.trim();

            aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);aiResponse
            const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;

            analysisData = JSON.parse(jsonString);

            analysisData.overallScore = Math.min(10, Math.max(0, Number(analysisData.overallScore) || 7));
            analysisData.summary = String(analysisData.summary || "Resume analysis completed.").substring(0, 500);

            analysisData.strengths = Array.isArray(analysisData.strengths) ? analysisData.strengths.slice(0, 5).filter(s => s && typeof s === 'string') : ["Professional content", "Relevant experience", "Clear structure"];

            analysisData.weaknesses = Array.isArray(analysisData.weaknesses) ? analysisData.weaknesses.slice(0, 5).filter(w => w && typeof w === 'string') : ["Could improve quantifiable achievements", "Limited detail in some areas"];

            analysisData.improvements = Array.isArray(analysisData.improvements) ? analysisData.improvements.slice(0, 5).filter(i => i && typeof i === 'string') : ["Add specific metrics", "Include more details", "Highlight key accomplishments"];

            analysisData.keywordSuggestions = Array.isArray(analysisData.keywordSuggestions) ? analysisData.keywordSuggestions.slice(0, 10).filter(k => k && typeof k === 'string') : ["Industry terms", "Technical skills", "Relevant certifications"];

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
                const defaultCategories = {
                    formatting: 7,
                    content: 7,
                    skills: 7,
                    experience: 7,
                    achievements: 7
                };

                analysisData.categories = {
                    ...defaultCategories,
                    ...analysisData.categories,
                };

                Object.keys(analysisData.categories).forEach(key => {
                    analysisData.categories[key] = Math.min(10, Math.max(0, Number(analysisData.categories[key]) || 7));
                });
            }
        }
        catch (parseError)
        {
            console.error('Failed to parse AI response:', parseError);
            console.error('Raw response:', response.choices[0].message.content);

            analysisData = {
                overallScore: 7,
                summary: "Resume shows professional experience and relevant skills. The content demonstrates good structure with room for enhancement in specific areas.",
                strengths: ["Clear professional presentation", "Relevant experience documented", "Technical skills highlighted", "Organized structure"],
                weaknesses: ["Could include more quantifiable achievements", "Some sections could use more detail", "Missing some industry-specific keywords"],
                improvements: ["Add specific metrics and numbers to achievements", "Include more detailed project descriptions", "Expand on technical skill proficiency levels", "Add relevant certifications or training"],
                categories: {
                    formatting: 7,
                    content: 7,
                    skills: 7,
                    experience: 7,
                    achievements: 6
                },
                keywordSuggestions: ["Industry-specific terminology", "Technical skills and tools", "Soft skills", "Relevant certifications", "Project management"]
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

        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

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
        console.error('Error details:', error.message);

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