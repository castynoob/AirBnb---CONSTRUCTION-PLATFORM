import pool from '../config/db.js'

export const createChat = async (user1_id, user2_id) => {
  try {
    // Prevent duplicate chat between the same users
    const existingChat = await pool.query(
      `SELECT * FROM chats 
       WHERE (user1_id = $1 AND user2_id = $2) 
          OR (user1_id = $2 AND user2_id = $1)`,
      [user1_id, user2_id]
    );

    if (existingChat.rows.length > 0) {
      return existingChat.rows[0]; // Return existing chat if already exists
    }

    const newChat = await pool.query(
      `INSERT INTO chats (user1_id, user2_id)
       VALUES ($1, $2)
       RETURNING *`,
      [user1_id, user2_id]
    );

    return newChat.rows[0];
  } catch (error) {
    throw new Error(error.message);
  }
};
