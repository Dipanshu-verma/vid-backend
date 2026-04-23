import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import downloadRouter from './routes/download.js';
import streamRouter from './routes/stream.js';

dotenv.config();

const app = express();
const API_BASE_URL = process.env.API_BASE_URL;
// Must be first — Render sits behind a proxy and forwards X-Forwarded-For
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CLIENT_URL || '*')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    // Always allow Capacitor app and no-origin requests
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*')) return callback(null, true);
    if (origin === 'https://localhost' || origin === 'http://localhost') return callback(null, true);
    if (origin.startsWith('capacitor://')) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked: ${origin}`);
      callback(new Error(`CORS policy: origin ${origin} is not allowed`));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(express.json());
// Increase timeout for slow API calls
app.use((req, res, next) => {
  req.setTimeout(120000);
  res.setTimeout(120000);
  next();
});
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again after a minute.' },
});

app.use('/api', limiter);
app.use('/api', downloadRouter);
app.use('/api', streamRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ VidSave server running on http://localhost:${PORT}`);
});
