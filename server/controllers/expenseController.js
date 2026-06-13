const db = require('../config/database');

// Add Expense
exports.addExpense = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { groupId } = req.params;
    const { 
      description, 
      amount, 
      paidById, 
      splitType, 
      splits,
      originalCurrency, 
      exchangeRate 
    } = req.body;
    const requestorId = req.user.id;

    // 1. Basic Validation
    if (!description || !amount || !paidById || !splitType) {
      await connection.rollback();
      return res.status(400).json({ error: 'Description, amount, paidById, and splitType are required.' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    // Default Currency Settings
    const currency = (originalCurrency || 'INR').trim().toUpperCase();
    const rate = parseFloat(exchangeRate) || 1.0;
    if (isNaN(rate) || rate <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Exchange rate must be a positive number.' });
    }

    const convertedAmountInr = Math.round((numericAmount * rate) * 100) / 100;

    // 2. Check if requestor is active member
    const [requestorCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, requestorId]
    );
    if (requestorCheck.length === 0) {
      await connection.rollback();
      return res.status(403).json({ error: 'Access denied. You must be an active member of this group.' });
    }

    // 3. Check if payer is active member
    const [payerCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, paidById]
    );
    if (payerCheck.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Payer must be an active member of this group.' });
    }

    // 4. Calculate shares in INR
    let finalShares = [];

    if (splitType === 'EQUAL') {
      let splitUserIds = [];
      if (splits && splits.length > 0) {
        splitUserIds = splits.map(s => s.userId);
      } else {
        // Default: Split equally among all active members
        const [activeMembers] = await connection.query(
          'SELECT user_id FROM group_members WHERE group_id = ? AND left_at IS NULL',
          [groupId]
        );
        splitUserIds = activeMembers.map(m => m.user_id);
      }

      if (splitUserIds.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'No members available to split with.' });
      }

      const totalParticipants = splitUserIds.length;
      const baseShareInr = Math.floor((convertedAmountInr / totalParticipants) * 100) / 100;
      let remainderInr = Math.round((convertedAmountInr - (baseShareInr * totalParticipants)) * 100) / 100;

      finalShares = splitUserIds.map(userId => {
        let userShareInr = baseShareInr;
        if (remainderInr > 0) {
          userShareInr = Math.round((userShareInr + 0.01) * 100) / 100;
          remainderInr = Math.round((remainderInr - 0.01) * 100) / 100;
        }
        return {
          user_id: userId,
          owed_amount_inr: userShareInr,
          percentage: (100 / totalParticipants).toFixed(2)
        };
      });
    } 
    
    else if (splitType === 'EXACT') {
      if (!splits || splits.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Split details are required for EXACT split type.' });
      }

      let splitSumOriginal = 0;
      finalShares = splits.map(s => {
        const shareAmountOriginal = parseFloat(s.amount);
        splitSumOriginal += shareAmountOriginal;
        
        // Convert to INR
        const owedAmountInr = Math.round((shareAmountOriginal * rate) * 100) / 100;
        return {
          user_id: s.userId,
          owed_amount_inr: owedAmountInr,
          percentage: null
        };
      });

      // Verify original exact sum matches original total
      if (Math.abs(splitSumOriginal - numericAmount) > 0.01) {
        await connection.rollback();
        return res.status(400).json({
          error: `Sum of exact splits (${currency} ${splitSumOriginal.toFixed(2)}) must equal the total expense amount (${currency} ${numericAmount.toFixed(2)}).`
        });
      }

      // Reconcile rounding cents differences in INR
      const sumCalculatedInr = finalShares.reduce((sum, s) => sum + s.owed_amount_inr, 0);
      let remainderInr = Math.round((convertedAmountInr - sumCalculatedInr) * 100) / 100;
      if (remainderInr !== 0 && finalShares.length > 0) {
        finalShares[0].owed_amount_inr = Math.round((finalShares[0].owed_amount_inr + remainderInr) * 100) / 100;
      }
    } 
    
    else if (splitType === 'PERCENTAGE') {
      if (!splits || splits.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Split details are required for PERCENTAGE split type.' });
      }

      let percentSum = 0;
      finalShares = splits.map(s => {
        const pct = parseFloat(s.percentage);
        percentSum += pct;
        
        const owedAmountInr = Math.round((convertedAmountInr * (pct / 100)) * 100) / 100;
        return {
          user_id: s.userId,
          owed_amount_inr: owedAmountInr,
          percentage: pct
        };
      });

      if (Math.abs(percentSum - 100) > 0.01) {
        await connection.rollback();
        return res.status(400).json({ error: 'Sum of percentages must equal 100%.' });
      }

      // Reconcile rounding cents differences in INR
      const sumCalculatedInr = finalShares.reduce((sum, s) => sum + s.owed_amount_inr, 0);
      let remainderInr = Math.round((convertedAmountInr - sumCalculatedInr) * 100) / 100;
      if (remainderInr !== 0 && finalShares.length > 0) {
        finalShares[0].owed_amount_inr = Math.round((finalShares[0].owed_amount_inr + remainderInr) * 100) / 100;
      }
    } 
    
    else {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid splitType. Must be EQUAL, EXACT, or PERCENTAGE.' });
    }

    // 5. Verify all split users are members of the group
    const splitUserIds = finalShares.map(s => s.user_id);
    const [membershipCount] = await connection.query(
      'SELECT COUNT(id) AS count FROM group_members WHERE group_id = ? AND user_id IN (?)',
      [groupId, splitUserIds]
    );

    if (membershipCount[0].count !== splitUserIds.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'One or more split users are not members of the group.' });
    }

    // 6. Insert Expense
    const [expenseResult] = await connection.query(`
      INSERT INTO expenses 
      (group_id, paid_by_id, description, original_amount, original_currency, exchange_rate, converted_amount_inr, split_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [groupId, paidById, description.trim(), numericAmount, currency, rate, convertedAmountInr, splitType]);

    const expenseId = expenseResult.insertId;

    // 7. Insert Expense Shares
    for (const share of finalShares) {
      await connection.query(`
        INSERT INTO expense_shares (expense_id, user_id, owed_amount_inr, percentage)
        VALUES (?, ?, ?, ?)
      `, [expenseId, share.user_id, share.owed_amount_inr, share.percentage]);
    }

    await connection.commit();

    res.status(201).json({
      message: 'Expense added successfully.',
      expenseId
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

// Edit Expense
exports.editExpense = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { expenseId } = req.params;
    const { 
      description, 
      amount, 
      paidById, 
      splitType, 
      splits,
      originalCurrency, 
      exchangeRate 
    } = req.body;
    const requestorId = req.user.id;

    // 1. Fetch existing expense
    const [expenses] = await connection.query(
      'SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [expenseId]
    );
    if (expenses.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Expense not found.' });
    }
    const expense = expenses[0];
    const groupId = expense.group_id;

    // 2. Validate requestor is active member
    const [requestorCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, requestorId]
    );
    if (requestorCheck.length === 0) {
      await connection.rollback();
      return res.status(403).json({ error: 'Access denied. You must be an active member of this group.' });
    }

    // 3. Validate payer is active member
    const [payerCheck] = await connection.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, paidById]
    );
    if (payerCheck.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Payer must be an active member of this group.' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    const currency = (originalCurrency || 'INR').trim().toUpperCase();
    const rate = parseFloat(exchangeRate) || 1.0;
    if (isNaN(rate) || rate <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Exchange rate must be a positive number.' });
    }

    const convertedAmountInr = Math.round((numericAmount * rate) * 100) / 100;

    // 4. Calculate shares in INR
    let finalShares = [];

    if (splitType === 'EQUAL') {
      let splitUserIds = [];
      if (splits && splits.length > 0) {
        splitUserIds = splits.map(s => s.userId);
      } else {
        const [activeMembers] = await connection.query(
          'SELECT user_id FROM group_members WHERE group_id = ? AND left_at IS NULL',
          [groupId]
        );
        splitUserIds = activeMembers.map(m => m.user_id);
      }

      if (splitUserIds.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'No members available to split with.' });
      }

      const totalParticipants = splitUserIds.length;
      const baseShareInr = Math.floor((convertedAmountInr / totalParticipants) * 100) / 100;
      let remainderInr = Math.round((convertedAmountInr - (baseShareInr * totalParticipants)) * 100) / 100;

      finalShares = splitUserIds.map(userId => {
        let userShareInr = baseShareInr;
        if (remainderInr > 0) {
          userShareInr = Math.round((userShareInr + 0.01) * 100) / 100;
          remainderInr = Math.round((remainderInr - 0.01) * 100) / 100;
        }
        return {
          user_id: userId,
          owed_amount_inr: userShareInr,
          percentage: (100 / totalParticipants).toFixed(2)
        };
      });
    } 
    
    else if (splitType === 'EXACT') {
      if (!splits || splits.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Split details are required for EXACT split.' });
      }

      let splitSumOriginal = 0;
      finalShares = splits.map(s => {
        const shareAmountOriginal = parseFloat(s.amount);
        splitSumOriginal += shareAmountOriginal;
        const owedAmountInr = Math.round((shareAmountOriginal * rate) * 100) / 100;
        return {
          user_id: s.userId,
          owed_amount_inr: owedAmountInr,
          percentage: null
        };
      });

      if (Math.abs(splitSumOriginal - numericAmount) > 0.01) {
        await connection.rollback();
        return res.status(400).json({ error: 'Sum of splits must equal the total amount.' });
      }

      const sumCalculatedInr = finalShares.reduce((sum, s) => sum + s.owed_amount_inr, 0);
      let remainderInr = Math.round((convertedAmountInr - sumCalculatedInr) * 100) / 100;
      if (remainderInr !== 0 && finalShares.length > 0) {
        finalShares[0].owed_amount_inr = Math.round((finalShares[0].owed_amount_inr + remainderInr) * 100) / 100;
      }
    } 
    
    else if (splitType === 'PERCENTAGE') {
      if (!splits || splits.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Split details are required for PERCENTAGE split.' });
      }

      let percentSum = 0;
      finalShares = splits.map(s => {
        const pct = parseFloat(s.percentage);
        percentSum += pct;
        const owedAmountInr = Math.round((convertedAmountInr * (pct / 100)) * 100) / 100;
        return {
          user_id: s.userId,
          owed_amount_inr: owedAmountInr,
          percentage: pct
        };
      });

      if (Math.abs(percentSum - 100) > 0.01) {
        await connection.rollback();
        return res.status(400).json({ error: 'Sum of percentages must equal 100%.' });
      }

      const sumCalculatedInr = finalShares.reduce((sum, s) => sum + s.owed_amount_inr, 0);
      let remainderInr = Math.round((convertedAmountInr - sumCalculatedInr) * 100) / 100;
      if (remainderInr !== 0 && finalShares.length > 0) {
        finalShares[0].owed_amount_inr = Math.round((finalShares[0].owed_amount_inr + remainderInr) * 100) / 100;
      }
    } 
    
    else {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid splitType.' });
    }

    // Verify split users are members
    const splitUserIds = finalShares.map(s => s.user_id);
    const [membershipCount] = await connection.query(
      'SELECT COUNT(id) AS count FROM group_members WHERE group_id = ? AND user_id IN (?)',
      [groupId, splitUserIds]
    );
    if (membershipCount[0].count !== splitUserIds.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'One or more split users are not members of this group.' });
    }

    // 5. Update Expense
    await connection.query(`
      UPDATE expenses 
      SET description = ?, original_amount = ?, original_currency = ?, exchange_rate = ?, converted_amount_inr = ?, split_type = ?, paid_by_id = ?
      WHERE id = ?
    `, [description.trim(), numericAmount, currency, rate, convertedAmountInr, splitType, paidById, expenseId]);

    // 6. Delete old shares
    await connection.query('DELETE FROM expense_shares WHERE expense_id = ?', [expenseId]);

    // 7. Insert new shares
    for (const share of finalShares) {
      await connection.query(`
        INSERT INTO expense_shares (expense_id, user_id, owed_amount_inr, percentage)
        VALUES (?, ?, ?, ?)
      `, [expenseId, share.user_id, share.owed_amount_inr, share.percentage]);
    }

    await connection.commit();

    res.status(200).json({
      message: 'Expense updated successfully.'
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

// Delete Expense (Soft Delete using deleted_at column)
exports.deleteExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    const requestorId = req.user.id;

    // Check if expense exists
    const [expenses] = await db.query('SELECT group_id FROM expenses WHERE id = ? AND deleted_at IS NULL LIMIT 1', [expenseId]);
    if (expenses.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    const groupId = expenses[0].group_id;

    // Verify requestor is active member
    const [requestorCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
      [groupId, requestorId]
    );
    if (requestorCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied. You must be an active member of this group.' });
    }

    // Soft delete
    await db.query('UPDATE expenses SET deleted_at = NOW() WHERE id = ?', [expenseId]);

    res.status(200).json({
      message: 'Expense deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};
