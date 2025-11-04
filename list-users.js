import pool from './src/config/db.js';

async function listUsers() {
  try {
    const query = `
      SELECT id, email, first_name, last_name, role
      FROM users
      ORDER BY role, first_name
    `;

    const result = await pool.query(query);

    console.log('\n📋 All Users in Database:');
    console.log('='.repeat(100));

    result.rows.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.first_name} ${user.last_name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log('-'.repeat(100));
    });

    console.log(`\nTotal users: ${result.rows.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

listUsers();
