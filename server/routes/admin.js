import express from 'express';
import User from '../models/User.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/admin/users
// @desc    Get all registered users (secure data)
// @access  Private/Admin only
router.get('/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });

        res.json({
            count: users.length,
            users: users
        });
    } catch (error) {
        console.error('Admin Fetch Users error:', error);
        res.status(500).json({ message: 'Server error while fetching users' });
    }
});

export default router;
