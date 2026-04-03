import serverless from 'serverless-http';
import app, { connectDB } from '../../server/app.js';

// Wrap Express app for AWS Lambda / Netlify Functions
const serverlessHandler = serverless(app);

export async function handler(event, context) {
    // Keep the DB connection alive across warm invocations
    context.callbackWaitsForEmptyEventLoop = false;
    await connectDB();
    return serverlessHandler(event, context);
}
