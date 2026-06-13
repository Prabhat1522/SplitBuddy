const db = require('../config/database');

// Record a payment (settlement) between group members
exports.recordSettlement = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { payerId, payeeId, amount } = req.body; // Amount is in INR
    const requestorId = req.user.id;

    if (!payerId || !payeeId || !amount) {
      return res.status(400).json({ error: 'Payer ID, payee ID, and amount are required.' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    if (parseInt(payerId) === parseInt(payeeId)) {
      return res.status(400).json({ error: 'Payer and payee cannot be the same person.' });
    }

    // 1. Verify requestor is active member
    const [requestorCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, requestorId]
    );
    if (requestorCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied. You must be an active member of this group.' });
    }

    // 2. Verify payer and payee are active members
    const [payerCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, payerId]
    );
    const [payeeCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, payeeId]
    );

    if (payerCheck.length === 0 || payeeCheck.length === 0) {
      return res.status(400).json({ error: 'Both payer and payee must be active members of this group.' });
    }

    // 3. Insert Settlement
    const [result] = await db.query(`
      INSERT INTO settlements (group_id, payer_id, payee_id, amount_inr, recorded_by_id, settled_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [groupId, payerId, payeeId, numericAmount, requestorId]);

    const settlementId = result.insertId;

    res.status(201).json({
      message: 'Settlement recorded successfully.',
      settlementId
    });
  } catch (error) {
    next(error);
  }
};

// Get all settlements in a group
exports.getSettlements = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const requestorId = req.user.id;

    // Verify membership
    const [membershipCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
      [groupId, requestorId]
    );
    if (membershipCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [settlements] = await db.query(`
      SELECT s.*, 
             u1.name AS payer_name, u1.email AS payer_email,
             u2.name AS payee_name, u2.email AS payee_email,
             u3.name AS recorder_name, u3.email AS recorder_email
      FROM settlements s
      JOIN users u1 ON s.payer_id = u1.id
      JOIN users u2 ON s.payee_id = u2.id
      JOIN users u3 ON s.recorded_by_id = u3.id
      WHERE s.group_id = ?
      ORDER BY s.settled_at DESC
    `, [groupId]);

    const normalizedSettlements = settlements.map(s => ({
      id: s.id,
      group_id: s.group_id,
      payer_id: s.payer_id,
      payee_id: s.payee_id,
      amount: s.amount_inr, // maps to amount on client side
      amount_inr: s.amount_inr,
      settled_at: s.settled_at,
      payer: { id: s.payer_id, name: s.payer_name, email: s.payer_email },
      payee: { id: s.payee_id, name: s.payee_name, email: s.payee_email },
      recorder: { id: s.recorded_by_id, name: s.recorder_name, email: s.recorder_email }
    }));

    res.status(200).json({ settlements: normalizedSettlements });
  } catch (error) {
    next(error);
  }
};
