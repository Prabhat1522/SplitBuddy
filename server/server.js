const app = require('./app');
const pool = require('./config/database');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Establish initial connection without database name to ensure db exists
    console.log('Verifying MySQL server connection and database existence...');
    const setupConnection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true // Allow multi-query executions for schema initialization
    });

    const dbName = process.env.DB_NAME || 'splitbuddy';
    await setupConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await setupConnection.query(`USE \`${dbName}\`;`);
    console.log(`Database "${dbName}" verified.`);

    // 2. Check if tables exist (e.g. check for 'users' table)
    const [rows] = await setupConnection.query(`
      SELECT COUNT(*) AS count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'users'
    `, [dbName]);

    if (rows[0].count === 0) {
      console.log('Tables not found. Initializing schema.sql...');
      const schemaPath = path.join(__dirname, 'database', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await setupConnection.query(schemaSql);
        console.log('Database tables successfully initialized.');
      } else {
        throw new Error('schema.sql file not found in database directory!');
      }
    } else {
      console.log('Database tables verified (already initialized).');
    }

    await setupConnection.end();

    // 3. Test pool connection
    const poolConnection = await pool.getConnection();
    console.log('Connection pool verified successfully.');
    poolConnection.release();

    // 4. Start Server listener
    app.listen(PORT, () => {
      console.log(`SplitBuddy server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start SplitBuddy server:', error);
    process.exit(1);
  }
};

startServer();
