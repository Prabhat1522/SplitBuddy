const db = require('../config/database');
const { calculateBalances } = require('../utils/balanceCalculator');

// Create a group
exports.createGroup = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { name, description } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    // 1. Insert Group
    const [groupResult] = await connection.query(
      'INSERT INTO `groups` (name, description, created_by) VALUES (?, ?, ?)',
      [name.trim(), description ? description.trim() : null, userId]
    );

    const groupId = groupResult.insertId;

    // 2. Add Creator to group_members
    await connection.query(
      'INSERT INTO group_members (group_id, user_id, joined_at, left_at) VALUES (?, ?, NOW(), NULL)',
      [groupId, userId]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Group created successfully.',
      group: {
        id: groupId,
        name,
        description,
        created_by: userId
      }
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

// Get all active groups for user (with real-time net balances in INR)
exports.getGroups = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Fetch all groups where user is active
    const [memberships] = await db.query(`
      SELECT g.*, gm.joined_at, u.name AS creator_name, u.email AS creator_email
      FROM group_members gm
      JOIN \`groups\` g ON gm.group_id = g.id
      JOIN users u ON g.created_by = u.id
      WHERE gm.user_id = ? AND gm.left_at IS NULL
    `, [userId]);

    const groupsWithBalances = [];

    for (const row of memberships) {
      const groupId = row.id;

      // 2. Fetch all participants of this group (ever joined)
      const [participants] = await db.query(`
        SELECT DISTINCT u.id, u.name, u.email
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = ?
      `, [groupId]);

      // 3. Fetch active expenses (excluding soft deleted)
      const [expenses] = await db.query(`
        SELECT id, paid_by_id, converted_amount_inr 
        FROM expenses 
        WHERE group_id = ? AND deleted_at IS NULL
      `, [groupId]);

      // Fetch all splits for those expenses
      for (const exp of expenses) {
        const [shares] = await db.query(
          'SELECT user_id, owed_amount_inr FROM expense_shares WHERE expense_id = ?',
          [exp.id]
        );
        exp.shares = shares;
      }

      // 4. Fetch settlements
      const [settlements] = await db.query(`
        SELECT payer_id, payee_id, amount_inr 
        FROM settlements 
        WHERE group_id = ?
      `, [groupId]);

      // 5. Calculate net balances
      const balanceDetails = calculateBalances(participants, expenses, settlements);
      const userBalanceItem = balanceDetails.balances.find(b => b.userId === userId);

      groupsWithBalances.push({
        id: row.id,
        name: row.name,
        description: row.description,
        created_by: row.created_by,
        created_at: row.created_at,
        creator: {
          id: row.created_by,
          name: row.creator_name,
          email: row.creator_email
        },
        userBalance: userBalanceItem ? userBalanceItem.balance : 0.0
      });
    }

    res.status(200).json({ groups: groupsWithBalances });
  } catch (error) {
    next(error);
  }
};

// Get single group details (members, expenses, settlements, balances)
exports.getGroupDetails = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // 1. Verify user is/was a member
    const [membershipCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
      [groupId, userId]
    );

    if (membershipCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    // 2. Fetch Group Details
    const [groups] = await db.query(`
      SELECT g.*, u.name AS creator_name, u.email AS creator_email
      FROM \`groups\` g
      JOIN users u ON g.created_by = u.id
      WHERE g.id = ? LIMIT 1
    `, [groupId]);

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Group not found.' });
    }
    const group = groups[0];

    // 3. Fetch Active Members
    const [activeMembers] = await db.query(`
      SELECT u.id, u.name, u.email, gm.joined_at
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ? AND gm.left_at IS NULL
    `, [groupId]);

    // 4. Fetch All Participants (ever joined, to calculate historical balances correctly)
    const [participants] = await db.query(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [groupId]);

    // 5. Fetch Expenses (excluding soft deleted)
    const [expenses] = await db.query(`
      SELECT e.*, u.name AS payer_name, u.email AS payer_email
      FROM expenses e
      JOIN users u ON e.paid_by_id = u.id
      WHERE e.group_id = ? AND e.deleted_at IS NULL
      ORDER BY e.created_at DESC
    `, [groupId]);

    // Fetch shares for each expense
    for (const exp of expenses) {
      const [shares] = await db.query(`
        SELECT es.*, u.name AS username, u.email AS user_email
        FROM expense_shares es
        JOIN users u ON es.user_id = u.id
        WHERE es.expense_id = ?
      `, [exp.id]);
      
      // Normalize object mapping for frontend expectations
      exp.payer = {
        id: exp.paid_by_id,
        name: exp.payer_name,
        email: exp.payer_email
      };
      exp.splits = shares.map(s => ({
        user_id: s.user_id,
        amount: s.owed_amount_inr,
        percentage: s.percentage,
        user: {
          id: s.user_id,
          name: s.username,
          email: s.user_email
        }
      }));
      exp.shares = shares; // backup
    }

    // 6. Fetch Settlements
    const [settlements] = await db.query(`
      SELECT s.*, 
             u1.name AS payer_name, u1.email AS payer_email,
             u2.name AS payee_name, u2.email AS payee_email
      FROM settlements s
      JOIN users u1 ON s.payer_id = u1.id
      JOIN users u2 ON s.payee_id = u2.id
      WHERE s.group_id = ?
      ORDER BY s.settled_at DESC
    `, [groupId]);

    // Normalize settlements for frontend
    const normalizedSettlements = settlements.map(s => ({
      id: s.id,
      group_id: s.group_id,
      payer_id: s.payer_id,
      payee_id: s.payee_id,
      amount_inr: s.amount_inr,
      settled_at: s.settled_at,
      // Compatibility with existing frontend (using amount_inr as amount)
      amount: s.amount_inr,
      payer: {
        id: s.payer_id,
        name: s.payer_name,
        email: s.payer_email
      },
      payee: {
        id: s.payee_id,
        name: s.payee_name,
        email: s.payee_email
      }
    }));

    // 7. Calculate Balances & Simplified Debts
    const balanceDetails = calculateBalances(participants, expenses, normalizedSettlements);

    res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        creator: {
          id: group.created_by,
          name: group.creator_name,
          email: group.creator_email
        }
      },
      activeMembers,
      expenses,
      settlements: normalizedSettlements,
      balances: balanceDetails.balances,
      simplifiedDebts: balanceDetails.simplifiedDebts
    });
  } catch (error) {
    next(error);
  }
};

// Add a member by email
exports.addMember = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    const requestorId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Verify requestor is active member
    const [requestorCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, requestorId]
    );

    if (requestorCheck.length === 0) {
      await connection.rollback();
      return res.status(403).json({ error: 'Access denied. You must be an active member of this group.' });
    }

    // 2. Find or Create User (invited user placeholder)
    let userId;
    let userName = trimmedEmail.split('@')[0];
    let isPlaceholder = false;

    const [userCheck] = await connection.query(
      'SELECT id, name, password_hash FROM users WHERE email = ? LIMIT 1',
      [trimmedEmail]
    );

    if (userCheck.length === 0) {
      isPlaceholder = true;
      const [userInsert] = await connection.query(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [userName, trimmedEmail, 'PLACEHOLDER_INVITED_USER']
      );
      userId = userInsert.insertId;
    } else {
      userId = userCheck[0].id;
      userName = userCheck[0].name;
      isPlaceholder = userCheck[0].password_hash === 'PLACEHOLDER_INVITED_USER';
    }

    // 3. Check if already active member
    const [activeCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, userId]
    );

    if (activeCheck.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'User is already an active member of this group.' });
    }

    // 4. Create membership (new record to preserve historical logs)
    await connection.query(
      'INSERT INTO group_members (group_id, user_id, joined_at, left_at) VALUES (?, ?, NOW(), NULL)',
      [groupId, userId]
    );

    await connection.commit();

    res.status(200).json({
      message: isPlaceholder 
        ? 'User is not registered on SplitBuddy yet. A placeholder account has been created and added to the group.'
        : 'User added to the group successfully.',
      member: {
        id: userId,
        name: userName,
        email: trimmedEmail,
        isPlaceholder
      }
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

// Remove member (marks left_at = NOW() after verifying balance = 0 in INR)
exports.removeMember = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { groupId, userId } = req.params;
    const requestorId = req.user.id;

    // 1. Verify requestor is active member
    const [requestorCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, requestorId]
    );
    if (requestorCheck.length === 0) {
      await connection.rollback();
      return res.status(403).json({ error: 'Access denied. You must be an active member to remove members.' });
    }

    // 2. Verify target member is active member
    const [targetCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, userId]
    );
    if (targetCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Member is not currently active in this group.' });
    }

    // 3. Get all participants, active expenses and settlements to compute current balances in INR
    const [participants] = await connection.query(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [groupId]);

    const [expenses] = await connection.query(`
      SELECT id, paid_by_id, converted_amount_inr 
      FROM expenses 
      WHERE group_id = ? AND deleted_at IS NULL
    `, [groupId]);

    for (const exp of expenses) {
      const [shares] = await connection.query(
        'SELECT user_id, owed_amount_inr FROM expense_shares WHERE expense_id = ?',
        [exp.id]
      );
      exp.shares = shares;
    }

    const [settlements] = await connection.query(`
      SELECT payer_id, payee_id, amount_inr 
      FROM settlements 
      WHERE group_id = ?
    `, [groupId]);

    // Compute balances
    const balanceDetails = calculateBalances(participants, expenses, settlements);
    const userBalanceItem = balanceDetails.balances.find(b => b.userId === parseInt(userId));

    if (userBalanceItem && Math.abs(userBalanceItem.balance) > 0.01) {
      await connection.rollback();
      return res.status(400).json({
        error: `Cannot remove member. ${userBalanceItem.name} has a non-zero balance of INR ${userBalanceItem.balance.toFixed(2)}.`
      });
    }

    // 4. Mark membership as inactive (set left_at = NOW())
    await connection.query(
      'UPDATE group_members SET left_at = NOW() WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
      [groupId, userId]
    );

    await connection.commit();

    res.status(200).json({
      message: 'Member removed from group successfully. Historical data is preserved.'
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

// Get membership history log
exports.getGroupHistory = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Verify member
    const [membershipCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
      [groupId, userId]
    );
    if (membershipCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [histories] = await db.query(`
      SELECT gm.id, gm.joined_at, gm.left_at, u.name, u.email
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `, [groupId]);

    res.status(200).json({ histories });
  } catch (error) {
    next(error);
  }
};
