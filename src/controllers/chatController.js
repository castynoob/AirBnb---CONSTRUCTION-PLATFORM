import { createChat } from '../models/chatModel.js';

export const addChat = async (req, res) => {
  try {
    const { user1_id, user2_id } = req.body;

    if (!user1_id || !user2_id) {
      return res.status(400).json({ message: "Both user IDs are required" });
    }

    const chat = await createChat(user1_id, user2_id);
    res.status(201).json(chat);
  } catch (error) {
    console.error("Error creating chat:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
