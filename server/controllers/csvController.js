const stream = require('stream');
const csv = require('csv-parser');
const db = require('../config/database');

// Helper to parse CSV buffer to JSON array
const parseCsv = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim()
      }))
      .on('data', (data) => results.push(data))
      .on('error', (err) => reject(err))
      .on('end', () => resolve(results));
  });
};

// Main CSV Import controller
exports.importCsv = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file.' });
  }

  const { groupId } = req.params;
  const requestorId = req.user.id;
  const filename = req.file.originalname;

  // 1. Verify requestor is active member
  const [requestorCheck] = await db.query(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
    [groupId, requestorId]
  );
  if (requestorCheck.length === 0) {
    return res.status(403).json({ error: 'Access denied. You must be an active member of this group.' });
  }

  // Fetch active and historical members of the group
  const [members] = await db.query(`
    SELECT gm.user_id, gm.left_at, u.email, u.name 
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
  `, [groupId]);

  const activeMemberEmails = new Set();
  const leftMemberEmails = new Set();
  const memberMap = {}; // email -> id

  members.forEach(m => {
    const email = m.email.toLowerCase().trim();
    memberMap[email] = m.user_id;
    if (m.left_at) {
      leftMemberEmails.add(email);
    } else {
      activeMemberEmails.add(email);
    }
  });

  const connection = await db.getConnection();
  
  try {
    const rows = await parseCsv(req.file.buffer);

    // 2. Create import report record
    const [reportResult] = await connection.query(`
      INSERT INTO import_reports (group_id, uploaded_by_id, filename, total_rows, processed_rows, anomalies_count)
      VALUES (?, ?, ?, ?, 0, 0)
    `, [groupId, requestorId, filename, rows.length]);

    const reportId = reportResult.insertId;

    let processedCount = 0;
    let anomalyCount = 0;

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // Row number (1-indexed + header offset)
      const row = rows[i];
      
      let dateStr = row.Date ? row.Date.trim() : '';
      let description = row.Description ? row.Description.trim() : '';
      let amountStr = row.TotalAmount ? row.TotalAmount.trim() : '';
      let payerEmail = row.PaidByEmail ? row.PaidByEmail.trim() : '';
      let splitType = row.SplitType ? row.SplitType.trim().toUpperCase() : '';
      let shareDetails = row.ShareDetails ? row.ShareDetails.trim() : '';
      let currency = row.Currency ? row.Currency.trim().toUpperCase() : '';
      let exchangeRateStr = row.ExchangeRate ? row.ExchangeRate.trim() : '';

      const detectedAnomalies = [];
      let skipRow = false;
      let parsedType = 'EQUAL';

      // --- ANOMALY 1: Zero Amount Rows ---
      const originalAmount = parseFloat(amountStr);
      if (amountStr === '' || isNaN(originalAmount) || originalAmount === 0) {
        detectedAnomalies.push({
          type: 'ZERO_AMOUNT_ROW',
          detected: `Amount: "${amountStr}"`,
          resolved: 'None',
          action: 'SKIPPED_ROW'
        });
        skipRow = true;
      }

      // --- ANOMALY 2: Negative Amounts ---
      let resolvedAmount = originalAmount;
      if (!skipRow && originalAmount < 0) {
        resolvedAmount = Math.abs(originalAmount);
        detectedAnomalies.push({
          type: 'NEGATIVE_AMOUNT',
          detected: `Amount: ${originalAmount}`,
          resolved: `Amount: ${resolvedAmount}`,
          action: 'CONVERTED_TO_POSITIVE_AMOUNT'
        });
      }

      // --- ANOMALY 3: Missing Currency ---
      let resolvedCurrency = currency;
      if (!skipRow && !currency) {
        resolvedCurrency = 'INR';
        detectedAnomalies.push({
          type: 'MISSING_CURRENCY',
          detected: 'Empty currency column',
          resolved: 'INR',
          action: 'DEFAULTED_TO_INR'
        });
      }

      // --- ANOMALY 4: Inconsistent Name/Email Formatting ---
      let resolvedPayerEmail = payerEmail.toLowerCase().trim();
      if (!skipRow && payerEmail && (payerEmail !== resolvedPayerEmail)) {
        detectedAnomalies.push({
          type: 'INCONSISTENT_EMAIL_FORMATTING',
          detected: `Email: "${payerEmail}"`,
          resolved: `Email: "${resolvedPayerEmail}"`,
          action: 'NORMALIZED_FORMATTING'
        });
      }

      // --- ANOMALY 5: Missing Payer ---
      let resolvedPayerId = null;
      if (!skipRow) {
        if (!resolvedPayerEmail) {
          resolvedPayerId = requestorId; // Default to uploader
          const [uploaderUser] = await connection.query('SELECT email FROM users WHERE id = ? LIMIT 1', [requestorId]);
          resolvedPayerEmail = uploaderUser[0].email;
          detectedAnomalies.push({
            type: 'MISSING_PAYER',
            detected: 'Empty PaidByEmail',
            resolved: `Assigned uploader: ${resolvedPayerEmail}`,
            action: 'ASSIGNED_UPLOADER_AS_PAYER'
          });
        } else if (!activeMemberEmails.has(resolvedPayerEmail)) {
          // Payer is not in the group, or is dynamic placeholder
          if (leftMemberEmails.has(resolvedPayerEmail)) {
            detectedAnomalies.push({
              type: 'PAYER_LEFT_GROUP',
              detected: `Payer ${resolvedPayerEmail} has left this group`,
              resolved: 'None',
              action: 'SKIPPED_ROW'
            });
            skipRow = true;
          } else {
            // UNKNOWN PARTICIPANT: Add them to the group
            let userResult;
            const [existingDbUser] = await connection.query('SELECT id, name FROM users WHERE email = ? LIMIT 1', [resolvedPayerEmail]);
            
            if (existingDbUser.length === 0) {
              const tempName = resolvedPayerEmail.split('@')[0];
              const [newUser] = await connection.query(
                'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                [tempName, resolvedPayerEmail, 'PLACEHOLDER_INVITED_USER']
              );
              resolvedPayerId = newUser.insertId;
            } else {
              resolvedPayerId = existingDbUser[0].id;
            }

            await connection.query(
              'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
              [groupId, resolvedPayerId]
            );
            activeMemberEmails.add(resolvedPayerEmail);
            memberMap[resolvedPayerEmail] = resolvedPayerId;

            detectedAnomalies.push({
              type: 'UNKNOWN_PAYER_PARTICIPANT',
              detected: `Payer email ${resolvedPayerEmail} not in group`,
              resolved: `Auto-added user ${resolvedPayerEmail} to group`,
              action: 'AUTO_ADDED_PARTICIPANT_TO_GROUP'
            });
          }
        } else {
          resolvedPayerId = memberMap[resolvedPayerEmail];
        }
      }

      // --- ANOMALY 6: Currency Mismatch & Missing Exchange Rate ---
      let resolvedExchangeRate = parseFloat(exchangeRateStr);
      if (!skipRow && resolvedCurrency !== 'INR') {
        if (!exchangeRateStr || isNaN(resolvedExchangeRate) || resolvedExchangeRate <= 0) {
          // Default exchange rate based on currency
          resolvedExchangeRate = resolvedCurrency === 'USD' ? 83.5 : resolvedCurrency === 'EUR' ? 90.0 : 1.0;
          detectedAnomalies.push({
            type: 'CURRENCY_MISMATCH_MISSING_RATE',
            detected: `Currency: ${resolvedCurrency}, ExchangeRate: "${exchangeRateStr}"`,
            resolved: `ExchangeRate defaulted to: ${resolvedExchangeRate}`,
            action: 'DEFAULTED_EXCHANGE_RATE'
          });
        }
      } else {
        resolvedExchangeRate = 1.0;
      }

      // --- ANOMALY 7: Invalid Dates ---
      let resolvedDate = new Date();
      if (!skipRow) {
        if (!dateStr || isNaN(Date.parse(dateStr))) {
          detectedAnomalies.push({
            type: 'INVALID_DATE',
            detected: `Date: "${dateStr}"`,
            resolved: `Date: ${resolvedDate.toISOString().split('T')[0]}`,
            action: 'DEFAULTED_TO_CURRENT_DATE'
          });
        } else {
          resolvedDate = new Date(dateStr);
        }
      }

      // --- ANOMALY 8: Settlement Recorded as Expense ---
      let isSettlementRow = false;
      if (!skipRow && description) {
        const descLower = description.toLowerCase();
        if (
          descLower.includes('settle') || 
          descLower.includes('payment') || 
          descLower.includes('paid back') || 
          descLower.includes('payback') ||
          descLower.includes('settled')
        ) {
          isSettlementRow = true;
          detectedAnomalies.push({
            type: 'SETTLEMENT_RECORDED_AS_EXPENSE',
            detected: `Description: "${description}"`,
            resolved: 'Imported as payment transaction instead of expense',
            action: 'RECORDED_AS_SETTLEMENT'
          });
        }
      }

      // Converted amount in INR
      const convertedAmountInr = Math.round((resolvedAmount * resolvedExchangeRate) * 100) / 100;

      // --- ANOMALY 9, 10, 11: Split details & participant validation ---
      let finalShares = [];
      if (!skipRow && !isSettlementRow) {
        parsedType = splitType || 'EQUAL';
        if (!['EQUAL', 'EXACT', 'PERCENTAGE'].includes(parsedType)) {
          parsedType = 'EQUAL';
          detectedAnomalies.push({
            type: 'INVALID_SPLIT_TYPE',
            detected: `SplitType: "${splitType}"`,
            resolved: 'Defaulted to EQUAL split',
            action: 'DEFAULTED_TO_EQUAL_SPLIT'
          });
        }

        if (parsedType === 'EQUAL') {
          let splitUserIds = [];
          if (shareDetails) {
            const emails = shareDetails.split(',').map(e => e.trim().toLowerCase());
            for (const email of emails) {
              if (leftMemberEmails.has(email)) {
                // ANOMALY: Member included after leaving group
                detectedAnomalies.push({
                  type: 'MEMBER_INCLUDED_AFTER_LEAVING',
                  detected: `Split user ${email} has left group`,
                  resolved: 'Row skipped',
                  action: 'SKIPPED_ROW'
                });
                skipRow = true;
                break;
              } else if (!activeMemberEmails.has(email)) {
                // UNKNOWN PARTICIPANT
                let userResult;
                const [existingDbUser] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
                let userId;
                if (existingDbUser.length === 0) {
                  const tempName = email.split('@')[0];
                  const [newUser] = await connection.query(
                    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                    [tempName, email, 'PLACEHOLDER_INVITED_USER']
                  );
                  userId = newUser.insertId;
                } else {
                  userId = existingDbUser[0].id;
                }

                await connection.query(
                  'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
                  [groupId, userId]
                );
                activeMemberEmails.add(email);
                memberMap[email] = userId;
                splitUserIds.push(userId);

                detectedAnomalies.push({
                  type: 'UNKNOWN_SPLIT_PARTICIPANT',
                  detected: `Split email ${email} not in group`,
                  resolved: `Auto-added user ${email} to group`,
                  action: 'AUTO_ADDED_PARTICIPANT_TO_GROUP'
                });
              } else {
                splitUserIds.push(memberMap[email]);
              }
            }
          } else {
            // Default to all active users
            const [activeMembers] = await connection.query(
              'SELECT user_id FROM group_members WHERE group_id = ? AND left_at IS NULL',
              [groupId]
            );
            splitUserIds = activeMembers.map(m => m.user_id);
          }

          if (!skipRow && splitUserIds.length > 0) {
            const total = splitUserIds.length;
            const baseShareInr = Math.floor((convertedAmountInr / total) * 100) / 100;
            let remainderInr = Math.round((convertedAmountInr - (baseShareInr * total)) * 100) / 100;

            finalShares = splitUserIds.map(userId => {
              let shareInr = baseShareInr;
              if (remainderInr > 0) {
                shareInr = Math.round((shareInr + 0.01) * 100) / 100;
                remainderInr = Math.round((remainderInr - 0.01) * 100) / 100;
              }
              return {
                user_id: userId,
                owed_amount_inr: shareInr,
                percentage: (100 / total).toFixed(2)
              };
            });
          }
        } 
        
        else if (parsedType === 'EXACT') {
          if (!shareDetails) {
            detectedAnomalies.push({
              type: 'MISSING_SHARE_DETAILS',
              detected: 'Empty ShareDetails for EXACT split',
              resolved: 'Row skipped',
              action: 'SKIPPED_ROW'
            });
            skipRow = true;
          } else {
            const entries = shareDetails.split(',').map(e => e.trim());
            let splitSumOriginal = 0;

            for (const entry of entries) {
              const parts = entry.split(':');
              if (parts.length !== 2) {
                detectedAnomalies.push({
                  type: 'INVALID_SHARE_FORMAT',
                  detected: `Share format: "${entry}"`,
                  resolved: 'Row skipped',
                  action: 'SKIPPED_ROW'
                });
                skipRow = true;
                break;
              }

              const email = parts[0].trim().toLowerCase();
              const amt = parseFloat(parts[1]);

              if (leftMemberEmails.has(email)) {
                detectedAnomalies.push({
                  type: 'MEMBER_INCLUDED_AFTER_LEAVING',
                  detected: `Split user ${email} has left group`,
                  resolved: 'Row skipped',
                  action: 'SKIPPED_ROW'
                });
                skipRow = true;
                break;
              }

              if (!activeMemberEmails.has(email)) {
                // Add unknown participant
                let userResult;
                const [existingDbUser] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
                let userId;
                if (existingDbUser.length === 0) {
                  const tempName = email.split('@')[0];
                  const [newUser] = await connection.query(
                    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                    [tempName, email, 'PLACEHOLDER_INVITED_USER']
                  );
                  userId = newUser.insertId;
                } else {
                  userId = existingDbUser[0].id;
                }

                await connection.query(
                  'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
                  [groupId, userId]
                );
                activeMemberEmails.add(email);
                memberMap[email] = userId;

                detectedAnomalies.push({
                  type: 'UNKNOWN_SPLIT_PARTICIPANT',
                  detected: `Split email ${email} not in group`,
                  resolved: `Auto-added user ${email} to group`,
                  action: 'AUTO_ADDED_PARTICIPANT_TO_GROUP'
                });
              }

              splitSumOriginal += amt;
              finalShares.push({
                user_id: memberMap[email],
                owed_amount_inr: Math.round((amt * resolvedExchangeRate) * 100) / 100,
                percentage: null
              });
            }

            if (!skipRow) {
              if (Math.abs(splitSumOriginal - resolvedAmount) > 0.01) {
                detectedAnomalies.push({
                  type: 'EXACT_SUM_MISMATCH',
                  detected: `Sum of splits: ${splitSumOriginal}, Expected: ${resolvedAmount}`,
                  resolved: 'Row skipped',
                  action: 'SKIPPED_ROW'
                });
                skipRow = true;
              } else {
                // Adjust remainder cents in INR
                const sumCalculatedInr = finalShares.reduce((sum, s) => sum + s.owed_amount_inr, 0);
                let remainderInr = Math.round((convertedAmountInr - sumCalculatedInr) * 100) / 100;
                if (remainderInr !== 0 && finalShares.length > 0) {
                  finalShares[0].owed_amount_inr = Math.round((finalShares[0].owed_amount_inr + remainderInr) * 100) / 100;
                }
              }
            }
          }
        } 
        
        else if (parsedType === 'PERCENTAGE') {
          if (!shareDetails) {
            detectedAnomalies.push({
              type: 'MISSING_SHARE_DETAILS',
              detected: 'Empty ShareDetails for PERCENTAGE split',
              resolved: 'Row skipped',
              action: 'SKIPPED_ROW'
            });
            skipRow = true;
          } else {
            const entries = shareDetails.split(',').map(e => e.trim());
            let percentSum = 0;

            for (const entry of entries) {
              const parts = entry.split(':');
              if (parts.length !== 2) {
                detectedAnomalies.push({
                  type: 'INVALID_SHARE_FORMAT',
                  detected: `Share format: "${entry}"`,
                  resolved: 'Row skipped',
                  action: 'SKIPPED_ROW'
                });
                skipRow = true;
                break;
              }

              const email = parts[0].trim().toLowerCase();
              const pct = parseFloat(parts[1]);

              if (leftMemberEmails.has(email)) {
                detectedAnomalies.push({
                  type: 'MEMBER_INCLUDED_AFTER_LEAVING',
                  detected: `Split user ${email} has left group`,
                  resolved: 'Row skipped',
                  action: 'SKIPPED_ROW'
                });
                skipRow = true;
                break;
              }

              if (!activeMemberEmails.has(email)) {
                let userResult;
                const [existingDbUser] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
                let userId;
                if (existingDbUser.length === 0) {
                  const tempName = email.split('@')[0];
                  const [newUser] = await connection.query(
                    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                    [tempName, email, 'PLACEHOLDER_INVITED_USER']
                  );
                  userId = newUser.insertId;
                } else {
                  userId = existingDbUser[0].id;
                }

                await connection.query(
                  'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
                  [groupId, userId]
                );
                activeMemberEmails.add(email);
                memberMap[email] = userId;

                detectedAnomalies.push({
                  type: 'UNKNOWN_SPLIT_PARTICIPANT',
                  detected: `Split email ${email} not in group`,
                  resolved: `Auto-added user ${email} to group`,
                  action: 'AUTO_ADDED_PARTICIPANT_TO_GROUP'
                });
              }

              percentSum += pct;
              const owedAmountInr = Math.round((convertedAmountInr * (pct / 100)) * 100) / 100;
              finalShares.push({
                user_id: memberMap[email],
                owed_amount_inr: owedAmountInr,
                percentage: pct
              });
            }

            if (!skipRow) {
              if (Math.abs(percentSum - 100) > 0.01) {
                detectedAnomalies.push({
                  type: 'PERCENTAGE_SUM_MISMATCH',
                  detected: `Sum of percentages: ${percentSum}%`,
                  resolved: 'Row skipped',
                  action: 'SKIPPED_ROW'
                });
                skipRow = true;
              } else {
                // Adjust remainder cents in INR
                const sumCalculatedInr = finalShares.reduce((sum, s) => sum + s.owed_amount_inr, 0);
                let remainderInr = Math.round((convertedAmountInr - sumCalculatedInr) * 100) / 100;
                if (remainderInr !== 0 && finalShares.length > 0) {
                  finalShares[0].owed_amount_inr = Math.round((finalShares[0].owed_amount_inr + remainderInr) * 100) / 100;
                }
              }
            }
          }
        }
      }

      // --- ANOMALY 12: Duplicate Expenses in database ---
      if (!skipRow && !isSettlementRow) {
        const [duplicateCheck] = await connection.query(`
          SELECT id FROM expenses 
          WHERE group_id = ? AND description = ? AND original_amount = ? AND paid_by_id = ? AND DATE(created_at) = DATE(?) AND deleted_at IS NULL 
          LIMIT 1
        `, [groupId, description.trim(), resolvedAmount, resolvedPayerId, resolvedDate]);

        if (duplicateCheck.length > 0) {
          detectedAnomalies.push({
            type: 'DUPLICATE_EXPENSE',
            detected: `Expense "${description}" for ${resolvedAmount} paid by ${resolvedPayerEmail} already exists.`,
            resolved: 'Row skipped to prevent duplication.',
            action: 'SKIPPED_ROW'
          });
          skipRow = true;
        }
      }

      // --- WRITE TO DATABASE IF NOT SKIPPED ---
      await connection.beginTransaction();
      try {
        if (!skipRow) {
          if (isSettlementRow) {
            // Import row as settlement
            // For settlement, we need to extract payee email from splitDetails or shareDetails if available, or default to requestor.
            let payeeId = requestorId;
            if (shareDetails) {
              // Extract first email
              const email = shareDetails.split(':')[0].trim().toLowerCase();
              if (activeMemberEmails.has(email)) {
                payeeId = memberMap[email];
              }
            }

            await connection.query(`
              INSERT INTO settlements (group_id, payer_id, payee_id, amount_inr, recorded_by_id, settled_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [groupId, resolvedPayerId, payeeId, convertedAmountInr, requestorId, resolvedDate]);
          } else {
            // Import row as expense
            const [expResult] = await connection.query(`
              INSERT INTO expenses 
              (group_id, paid_by_id, description, original_amount, original_currency, exchange_rate, converted_amount_inr, split_type, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [groupId, resolvedPayerId, description.trim(), resolvedAmount, resolvedCurrency, resolvedExchangeRate, convertedAmountInr, parsedType, resolvedDate]);

            const expenseId = expResult.insertId;

            // Insert splits
            for (const share of finalShares) {
              await connection.query(`
                INSERT INTO expense_shares (expense_id, user_id, owed_amount_inr, percentage)
                VALUES (?, ?, ?, ?)
              `, [expenseId, share.user_id, share.owed_amount_inr, share.percentage]);
            }
          }
          processedCount++;
        }

        // Write any detected anomalies to DB
        if (detectedAnomalies.length > 0) {
          anomalyCount++;
          for (const anomaly of detectedAnomalies) {
            await connection.query(`
              INSERT INTO import_anomalies (report_id, row_index, anomaly_type, detected_value, resolved_value, action_taken)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [reportId, rowNum, anomaly.type, anomaly.detected, anomaly.resolved, anomaly.action]);
          }
        }

        await connection.commit();
      } catch (err) {
        await connection.rollback();
        console.error(`Error processing row ${rowNum}:`, err);
        // Log database level error as an anomaly and skip
        anomalyCount++;
        await connection.query(`
          INSERT INTO import_anomalies (report_id, row_index, anomaly_type, detected_value, resolved_value, action_taken)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [reportId, rowNum, 'DATABASE_INSERT_ERROR', err.message, 'Row skipped', 'SKIPPED_ROW']);
      }
    }

    // 3. Update report statistics
    await connection.query(`
      UPDATE import_reports 
      SET processed_rows = ?, anomalies_count = ?
      WHERE id = ?
    `, [processedCount, anomalyCount, reportId]);

    res.status(200).json({
      message: 'CSV import audit completed.',
      reportId,
      totalRows: rows.length,
      processedRows: processedCount,
      anomaliesCount: anomalyCount
    });

  } catch (error) {
    next(error);
  } finally {
    connection.release();
  }
};

// Get all import reports in a group
exports.getReports = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const requestorId = req.user.id;

    // Verify member
    const [membershipCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
      [groupId, requestorId]
    );
    if (membershipCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [reports] = await db.query(`
      SELECT r.*, u.name AS uploader_name
      FROM import_reports r
      JOIN users u ON r.uploaded_by_id = u.id
      WHERE r.group_id = ?
      ORDER BY r.created_at DESC
    `, [groupId]);

    res.status(200).json({ reports });
  } catch (error) {
    next(error);
  }
};

// Get import report details (with anomaly logs)
exports.getReportDetails = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const requestorId = req.user.id;

    // Fetch report
    const [reports] = await db.query('SELECT * FROM import_reports WHERE id = ? LIMIT 1', [reportId]);
    if (reports.length === 0) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    const report = reports[0];

    // Verify member of the group
    const [membershipCheck] = await db.query(
      'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
      [report.group_id, requestorId]
    );
    if (membershipCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Fetch anomalies
    const [anomalies] = await db.query(`
      SELECT * FROM import_anomalies 
      WHERE report_id = ?
      ORDER BY row_index ASC, id ASC
    `, [reportId]);

    res.status(200).json({
      report,
      anomalies
    });
  } catch (error) {
    next(error);
  }
};
