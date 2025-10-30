import express from 'express';
import { addChat } from '../controllers/chatController.js';

const router = express.Router();

// POST /api/chats - Create a new chat
router.post('/', addChat);

export default router;
