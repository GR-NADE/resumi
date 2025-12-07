import React, { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const buildApiUrl = (endpoint) => {
    const base = API_BASE_URL.replace(/\/+$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
};

function Home()
{
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [extractedText, setExtractedText] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState(null);
    const [error, setError] = useState('');

    const handleFileSelect = (selectedFile) => {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png'
        ];

        if (selectedFile && allowedTypes.includes(selectedFile.type))
        {
            if (selectedFile.size > 10 * 1024 * 1024)
            {
                setError('File size must be less than 10MB');
                setFile(null);
                return;
            }

            setFile(selectedFile);
            setError('');
            setExtractedText('')
            setAnalysis(null);
        }
        else
        {
            setError('Please select a PDF, JPG, or PNG file.');
            setFile(null);
        }
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        handleFileSelect(selectedFile);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        handleFileSelect(droppedFile);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const uploadFile = async () => {
        if (!file)
        {
            setError('Please select a file first.');
            return;
        }

        setUploading(true);
        setError('');
        setExtractedText('')
        setAnalysis(null);

        const formData = new FormData();
        formData.append('resume', file);

        try
        {
            const response = await fetch(buildApiUrl('api/upload/resume'), {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (data.success)
            {
                setExtractedText(data.data.extractedText);
                console.log('Upload successful:', data);
            }
            else
            {
                setError(data.message || 'Upload failed');
            }
        }
        catch (err)
        {
            console.error('Upload error:', err);
            setError('Network error. Please check your connection and try again.');
        }
        finally
        {
            setUploading(false);
        }
    };

    const analyzeResume = async () => {
        if (!extractedText)
        {
            setError('No resume text to analyze. Please upload a resume first.');
            return;
        }

        setAnalyzing(true);
        setError('');

        try
        {
            const response = await fetch(buildApiUrl('api/analysis/analyze'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resumeText: extractedText,
                    metadata: {
                        filename: file.name,
                        fileSize: file.size,
                        processingMethod: file.type.startsWith('image/') ? 'Image OCR' : 'PDF Extraction'
                    }
                })
            });

            const data = await response.json();

            if (data.success)
            {
                setAnalysis({
                    ...data.data,
                    shareableLink: data.shareableLink,
                    uniqueId: data.uniqueId
                })
                console.log('Analysis successful:', data);
            }
            else
            {
                setError(data.message || 'Analysis failed');
            }
        }
        catch (err)
        {
            console.error('Analysis error:', err);
            setError('Network error during analysis. Please try again.');
        }
        finally
        {
            setAnalyzing(false);
        }
    };

    const copyToClipboard = async (text) => {
        try
        {
            await navigator.clipboard.writeText(text);
            alert('Link copied to clipboard!');
        }
        catch (err)
        {
            console.error('Failed to copy:', err);
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Link copied!');
        }
    };

    return (
        <div className = "container mx-auto px-4 py-8">
            <div className = "max-w-2xl mx-auto">
                <h1 className = "text-4xl font-bold text-center text-gray-900 mb-2">
                    Resume Rating App
                </h1>
                <p className = "text-xl text-center text-gray-600 mb-8">
                    Get AI-powered feedback on your resume
                </p>

                <div className = "bg-white rounded-lg shadow-md p-8">
                    <h2 className = "text-2xl font-semibold text-gray-800 mb-4">
                        Upload Your Resume
                    </h2>
                    <p className = "text-gray-600 mb-6">
                        Upload your resume as PDF (with selectable text) or as JPG/PNG image for OCR processing.
                    </p>

                    <div className = "border-2 border-dashed border-gray-300 rounded-lg p-8 text-center" onDrop = {handleDrop} onDragOver = {handleDragOver}>
                        <div className = "text-gray-400 mb-4">
                            <svg className = "mx-auto h-12 w-12" stroke = "currentColor" fill = "none" viewBox = "0 0 48 48">
                                <path d = "M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth = "2" strokeLinecap = "round" strokeLinejoin = "round"/>
                            </svg>
                        </div>
                        <p className = "text-lg text-gray-600 mb-2">Drop your PDF or image here or click to browse</p>
                        <p className = "text-sm text-gray-400">Supported formats: PDF, JPG, PNG | Maximum file size: 10MB</p>

                        <input type = "file" accept = ".pdf,.jpg,.jpeg,.png" onChange = {handleFileChange} className = "hidden" id = "fileInput" aria-label = "Upload resume file"/>
                        <label htmlFor = "fileInput" className = "mt-4 inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition duration-200 cursor-pointer">
                            Choose File
                        </label>
                    </div>

                    {file && (
                        <div className = "mt-6 p-4 bg-blue-50 rounded-lg">
                            <div className = "flex items-center justify-between">
                                <div>
                                    <p className = "font-medium text-blue-900">{file.name}</p>
                                    <p className = "text-sm text-blue-600">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button onClick = {() => setFile(null)} className = "text-blue-600 hover:text-blue-800" aria-label = "Remove file">
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}

                    {file && !extractedText && (
                        <button onClick = {uploadFile} disabled = {uploading} className = {`mt-6 w-full py-3 px-6 rounded-lg font-medium transition duration-200 ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
                            {uploading ? 'Processing...' : 'Extract Text'}
                        </button>
                    )}

                    {error && (
                        <div className = "mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className = "text-red-800">{error}</p>
                        </div>
                    )}

                    {extractedText && !analysis && (
                        <div className = "mt-6">
                            <div className = "p-6 bg-green-50 border border-green-200 rounded-lg mb-4">
                                <h3 className = "text-lg font-semibold text-green-800 mb-3">Text Extracted Successfully!</h3>
                                <div className = "">
                                    {extractedText.substring(0, 300)}
                                    {extractedText.length > 300 && '...'}
                                </div>
                            </div>

                            <button onClick = {analyzeResume} disabled = {analyzing} className = {`w-full py-3 px-6 rounded-lg font-medium transition duration-200 ${ analyzing ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white' }`}>
                                {analyzing ? 'Analyzing with AI...' : 'Analyze Resume with AI'}
                            </button>
                        </div>
                    )}
                </div>

                {analysis && (
                    <div className = "bg-white rounded-lg shadow-md p-8">
                        <h2 className = "text-3xl font-bold text-gray-900 mb-6">Resume Analysis Results</h2>

                        {analysis.shareableLink && (
                            <div className = "mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <p className = "text-sm text-blue-900 font-medium mb-2">Share this analysis:</p>
                                <div className = "flex items-center gap-2">
                                    <input type = "text" value = {analysis.shareableLink} readOnly className = "flex-1 px-3 py-2 bg-white border border-blue-300 rounded text-sm text-gray-700" aria-label = "Shareable link"/>
                                    <button
                                        onClick = {() => copyToClipboard(analysis.shareableLink)}
                                        className = "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">
                                            Copy
                                    </button>
                                    <a href = {`/analysis/${analysis.uniqueId}`} target = "_blank" rel = "noopener noreferrer" className = "px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium">View</a>
                                </div>
                            </div>
                        )}

                        <div className = "mb-8 text-center">
                            <div className = "inline-block">
                                <div className = "text-6xl font-bold text-purple-600 mb-2">{analysis.overallScore}/10</div>
                                <p className = "text-gray-600 font-medium">Overall Score</p>
                            </div>
                        </div>

                        <div className = "mb-8 p-6 bg-purple-50 rounded-lg border border-purple-200">
                            <h3 className = "text-xl font-semibold text-purple-900 mb-3">Summary</h3>
                            <p className = "text-gray-700">{analysis.summary}</p>
                        </div>

                        <div className = "mb-8">
                            <h3 className = "text-xl font-semibold text-gray-900 mb-4">Category Breakdown</h3>
                            <div className = "grid grid-cols-2 md:grid-cols-5 gap-4">
                                {Object.entries(analysis.categories).map(([category, score]) => (
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
                                {analysis.strengths.map((strength, index) => (
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
                                {analysis.weaknesses.map((weakness, index) => (
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
                                {analysis.improvements.map((improvement, index) => (
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
                                {analysis.keywordSuggestions.map((keyword, index) => (
                                    <span key = {index} className = "px-4 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">{keyword}</span>
                                ))}
                            </div>
                        </div>

                        <button onClick = {() => {
                            setFile(null)
                            setExtractedText('')
                            setAnalysis(null)
                        }} className = "mt-8 w-full py-3 px-6 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition duration-200">Analyze Another Resume</button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default Home;