import 'dotenv/config';
import app, { connectDB } from './app.js';

const PORT = process.env.PORT || 3001;

// Connect to DB then start listening
connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('❌ MongoDB Connection Error:', error);
    });
