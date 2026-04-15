import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import downloadRouter from './routes/download.js';
import streamRouter from './routes/stream.js';

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || '*')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, '')); // trim spaces & trailing slashes

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, Postman) or wildcard
    if (!origin || allowedOrigins.includes('*')) return callback(null, true);

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

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again after a minute.' },
});

app.use('/api', limiter);
app.use('/api', downloadRouter);
app.use('/api', streamRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ VidSave server running on http://localhost:${PORT}`);
});