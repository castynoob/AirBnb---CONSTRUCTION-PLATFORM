-- Delete the corrupted conversation where both participants are the same user
DELETE FROM conversations 
WHERE id = 'fd50ad04-bbee-4048-86ea-94552052d49f' 
  AND participant1_id = participant2_id;

-- Verify the deletion
SELECT * FROM conversations WHERE id = 'fd50ad04-bbee-4048-86ea-94552052d49f';
