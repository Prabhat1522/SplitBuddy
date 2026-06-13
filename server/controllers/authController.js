const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET || 'splitbuddy_jwt_super_secret_key_987654321',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Check if user already exists
    const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [trimmedEmail]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Insert user into DB
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), trimmedEmail, passwordHash]
    );

    const userId = result.insertId;

    const token = generateToken({ id: userId, email: trimmedEmail, name });

    res.status(201).json({
      message: 'User registered successfully.',
      token,
      user: {
        id: userId,
        name,
        email: trimmedEmail
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Find user in DB
    const [users] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [trimmedEmail]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];

    // 2. Compare password hash (if it's a placeholder invited user, they cannot login until they register properly)
    if (user.password_hash === 'PLACEHOLDER_INVITED_USER') {
      return res.status(400).json({ error: 'This email is invited but not yet registered. Please register first.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });

    res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    res.status(200).json({ user: users[0] });
  } catch (error) {
    next(error);
  }
};
