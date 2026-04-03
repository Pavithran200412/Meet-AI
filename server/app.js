import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// ---------- MongoDB connection (lazy, reused across invocations) ----------
let isConnected = false;

export async function connectDB() {
    if (isConnected) return;
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/meet-ai';
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log('✅ Connected to MongoDB');
}

export default app;
