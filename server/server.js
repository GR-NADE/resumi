import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import connectDB from './config/database.js';
import uploadRoutes from './routes/upload.js';
import analysisRoutes from './routes/analysis.js';

dotenv.config();

connectDB();

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(mongoSanitize());

const allowedOrigins = process.env.NODE_ENV === 'production' ? [ process.env.FRONTEND_URL, 'https://resumi-omega.vercel.app', /\.vercel\.app$/, /\.onrender\.com$/, ] : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
    origin: function (origin, callback)
    {
        if (!origin) return callback(null, true);

        for (let allowedOrigin of allowedOrigins)
        {
            if (typeof allowedOrigin === 'string')
            {
                if (allowedOrigin === origin)
                {
                    return callback(null, true);
                }
            }
            else if (allowedOrigin instanceof RegExp)
            {
                if (allowedOrigin.test(origin))
                {
                    return callback(null, true);
                }
            }
        }

        console.error('CORS blocked for origin:', origin);
        const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
        return callback(new Error(msg), false);
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many upload attempts, please try again later.'
});

const analysisLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many analysis requests, please try again later.'
});

app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/analysis', analysisLimiter, analysisRoutes);

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'Resumi API',
        status: 'success',
        version: '1.0.0'
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'An error occured' : err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

export default app;