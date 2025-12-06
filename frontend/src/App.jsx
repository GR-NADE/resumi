import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SharedAnalysis from './pages/SharedAnalysis';

function App() {
    return (
        <Router>
                <div className = "min-h-screen bg-gray-50">
                    <Routes>
                        <Route path = "/" element = {<Home/>}/>
                        <Route path = "/analysis/:uniqueId" element = {<SharedAnalysis/>}/>
                    </Routes>
                </div>
        </Router>
    )
}

export default App;