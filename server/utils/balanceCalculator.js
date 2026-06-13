/**
 * Calculates net balances and generates simplified debts (minimizing transactions)
 * in INR for a group of members based on their expenses and settlements.
 */
exports.calculateBalances = (members, expenses, settlements) => {
  const balances = {};

  // Initialize all members with a 0.0 balance
  members.forEach(member => {
    balances[member.id] = 0.0;
  });

  // 1. Process Expenses (using converted_amount_inr and owed_amount_inr)
  expenses.forEach(expense => {
    const paidById = expense.paid_by_id;
    const amountInr = parseFloat(expense.converted_amount_inr);

    // Credit the payer
    if (balances[paidById] !== undefined) {
      balances[paidById] += amountInr;
    }

    // Debit the debtors based on splits/shares
    if (expense.shares && expense.shares.length > 0) {
      expense.shares.forEach(share => {
        const debtorId = share.user_id;
        const shareAmountInr = parseFloat(share.owed_amount_inr);
        if (balances[debtorId] !== undefined) {
          balances[debtorId] -= shareAmountInr;
        }
      });
    }
  });

  // 2. Process Settlements (using amount_inr)
  settlements.forEach(settlement => {
    const payerId = settlement.payer_id;
    const payeeId = settlement.payee_id;
    const amountInr = parseFloat(settlement.amount_inr);

    // Credit the payer (reduces their negative balance)
    if (balances[payerId] !== undefined) {
      balances[payerId] += amountInr;
    }

    // Debit the payee (reduces their positive balance)
    if (balances[payeeId] !== undefined) {
      balances[payeeId] -= amountInr;
    }
  });

  // Build the list of net balances
  const netBalances = members.map(member => {
    const bal = balances[member.id];
    // Round to 2 decimal places to avoid floating point issues
    const roundedBal = Math.round(bal * 100) / 100;
    return {
      userId: member.id,
      name: member.name,
      email: member.email,
      balance: roundedBal
    };
  });

  // 3. Simplified Debts Algorithm (Greedy matcher)
  const debtors = [];
  const creditors = [];

  netBalances.forEach(item => {
    if (item.balance < -0.01) {
      debtors.push({ ...item, balance: Math.abs(item.balance) });
    } else if (item.balance > 0.01) {
      creditors.push({ ...item });
    }
  });

  const simplifiedDebts = [];

  // Sort: largest amounts first
  debtors.sort((a, b) => b.balance - a.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];

    const amountToSettle = Math.min(debtor.balance, creditor.balance);
    const roundedAmount = Math.round(amountToSettle * 100) / 100;

    if (roundedAmount > 0) {
      simplifiedDebts.push({
        from: debtor.userId,
        fromName: debtor.name,
        fromEmail: debtor.email,
        to: creditor.userId,
        toName: creditor.name,
        toEmail: creditor.email,
        amount: roundedAmount
      });
    }

    debtor.balance -= amountToSettle;
    creditor.balance -= amountToSettle;

    // Remove or re-sort
    if (debtor.balance < 0.01) {
      debtors.shift();
    } else {
      debtors.sort((a, b) => b.balance - a.balance);
    }

    if (creditor.balance < 0.01) {
      creditors.shift();
    } else {
      creditors.sort((a, b) => b.balance - a.balance);
    }
  }

  return {
    balances: netBalances,
    simplifiedDebts
  };
};
