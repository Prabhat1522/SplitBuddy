const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware); // Protect all routes

router.post('/groups/:groupId/expenses', expenseController.addExpense);
router.put('/expenses/:expenseId', expenseController.editExpense);
router.delete('/expenses/:expenseId', expenseController.deleteExpense);

module.exports = router;
