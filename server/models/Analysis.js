import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema({
    uniqueId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    resumeText: {
        type: String,
        required: true
    },
    analysisData: {
        overallScore: Number,
        summary: String,
        strengths: [String],
        weaknesses: [String],
        improvements: [String],
        categories:  {
            formatting: Number,
            content: Number,
            skills: Number,
            experience: Number,
            achievements: Number
        },
        keywordSuggestions: [String]
    },
    metadata: {
        filename: String,
        fileSize: Number,
        processingMethod: String
    }
}, {
    timestamps: true
});

const Analysis = mongoose.model('Analysis', analysisSchema);

export default Analysis;