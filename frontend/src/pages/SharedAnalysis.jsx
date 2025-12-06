import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function SharedAnalysis()
{
    const { uniqueId } = useParams();
    const [loading, setLoading] = useState(true);
    const [analysis, setAnalysis] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchAnalysis = async () => {
            try
            {
                const response = await fetch(`${API_BASE_URL}/api/analysis/${uniqueId}`);
                const data = await response.json();

                if (data.success)
                {
                    setAnalysis(data.data);
                }
                else
                {
                    setError(data.message || 'Analysis not found');
                }
            }
            catch (err)
            {
                console.error('Error fetching analysis:', err);
                setError('Failed to load analysis. Please check your connection.');
            }
            finally
            {
                setLoading(false);
            }
        };

        if (uniqueId)
        {
            fetchAnalysis();
        }
        else
        {
            setError('Invalid analysis ID');
            setLoading(false);
        }
    }, [uniqueId]);

    if (loading)
    {
        return (
            <div className = "container mx-auto px-4 py-8">
                <div className = "max-w-4xl mx-auto text-center">
                    <p className = "text-xl text-gray-600">Loading analysis...</p>
                </div>
            </div>
        );
    }

    if (error)
    {
        return (
            <div className = "container mx-auto px-4 py-8">
                <div className = "max-w-4xl mx-auto text-center">
                    <h1 className = "text-4xl font-bold text-red-600 mb-4">Error</h1>
                    <p className = "text-xl text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    const analysisData = analysis.analysisData;

    return (
        <div className = "container mx-auto px-4 py-8">
            <div className = "max-w-4xl mx-auto">
                <div className = "text-center mb-8">
                    <h1 className = "text-4xl font-bold text-gray-900 mb-2">Shared Resume Analysis</h1>
                    <p className = "text-gray-600">View-only analysis results</p>
                    {analysis.createdAt && (
                        <p className = "text-sm text-gray-500 mt-2">
                            Created: {new Date(analysis.createdAt).toLocaleDateString()}
                        </p>
                    )}
                </div>

                <div className = "bg-white rounded-lg shadow-md p-8">
                    <h2 className = "text-3xl font-bold text-gray-900 mb-6">Resume Analysis Results</h2>

                    <div className = "mb-8 text-center">
                        <div className = "inline-block">
                            <div className = "text-6xl font-bold text-purple-600 mb-2">{analysisData.overallScore}/10</div>
                        </div>
                        <p className = "text-gray-600 font-medium">Overall Score</p>
                    </div>
                </div>

                <div className = "mb-8 p-6 bg-purple-50 rounded-lg border border-purple-200">
                    <h3 className = "text-xl font-semibold text-purple-900 mb-3">Summary</h3>
                    <p className = "text-gray-700">{analysisData.summary}</p>
                </div>

                <div className = "mb-8">
                    <h3 className = "text-xl font-semibold text-gray-900 mb-4">Category Breakdown</h3>
                    <div className = "grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Object.entries(analysisData.categories).map(([category, score]) => (
                            <div key = {category} className = "text-center p-4 bg-gray-50 rounded-lg">
                                <div className = "text-3xl font-bold text-purple-600 mb-1">{score}</div>
                                <div className = "text-sm text-gray-600 capitalize">{category}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className = "mb-8">
                    <h3 className = "text-xl font-semibold text-green-900 mb-4">Strengths</h3>
                    <ul className = "space-y-3">
                        {analysisData.strengths.map((strength, index) => (
                            <li key = {index} className = "flex items-start">
                                <span className = "text-green-600 mr-2 mt-1">•</span>
                                <span className = "text-gray-700">{strength}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className = "mb-8">
                    <h3 className = "text-xl font-semibold text-red-900 mb-4">Areas for Improvement</h3>
                    <ul className = "space-y-3">
                        {analysisData.weaknesses.map((weakness, index) => (
                            <li key = {index} className = "flex items-start">
                                <span className = "text-red-600 mr-2 mt-1">•</span>
                                <span className = "text-gray-700">{weakness}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className = "mb-8">
                    <h3 className = "text-xl font-semibold text-blue-900 mb-4">Recommendations</h3>
                    <ul className = "space-y-3">
                        {analysisData.improvements.map((improvement, index) => (
                            <li key = {index} className = "flex items-start">
                                <span className = "text-blue-600 mr-2 mt-1">{index + 1}.</span>
                                <span className = "text-gray-700">{improvement}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div>
                    <h3 className = "text-xl font-semibold text-gray-900 mb-4">Suggested Keywords</h3>
                    <div className = "flex flex-wrap gap-2">
                        {analysisData.keywordSuggestions.map((keyword, index) => (
                            <span key = {index} className = "px-4 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">{keyword}</span>
                        ))}
                    </div>
                </div>

                <Link to = "/" className = "mt-8 block w-full py-3 px-6 bg-purple-600 hover:bg-purple-700 text-white text-center rounded-lg font-medium transition duration-200">
                    Analyze Your Own Resume
                </Link>
            </div>
        </div>
    );
}

export default SharedAnalysis;