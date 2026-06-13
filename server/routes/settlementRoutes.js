const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlementController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware); // Protect all routes

router.post('/groups/:groupId/settlements', settlementController.recordSettlement);
router.get('/groups/:groupId/settlements', settlementController.getSettlements);

module.exports = router;
