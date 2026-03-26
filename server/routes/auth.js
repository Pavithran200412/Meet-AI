import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID_HERE';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper to generate token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// @route   POST /api/auth/signup
// @desc    Register a new user
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const newUser = new User({
            name,
            email,
            password,
        });

        await newUser.save();

        const token = generateToken(newUser);

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup', error: error.message });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = generateToken(user);

        res.json({
            message: 'Logged in successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// @route   POST /api/auth/google
// @desc    Authenticate with Google Sign-In
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;

        // Verify Google ID token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, name } = payload;

        // Check if user exists
        let user = await User.findOne({ email: email.toLowerCase() });

        // If not, create a new user automatically
        if (!user) {
            // Generate a random password since they use Google
            const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
            user = new User({
                name,
                email,
                password: randomPassword,
            });
            await user.save();
        }

        // Generate our own JWT
        const token = generateToken(user);

        res.json({
            message: 'Google login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            }
        });

    } catch (error) {
        console.error('Google Auth error:', error);
        res.status(401).json({ message: 'Invalid Google token generated or verification failed' });
    }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
// NOTE: I am omitting the verifyToken middleware here simply to avoid circular resolution issues if any, but actually let me import it.
import { verifyToken } from '../middleware/auth.js';

router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
