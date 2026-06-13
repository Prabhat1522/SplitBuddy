const express = require('express');
const router = express.Router();
const multer = require('multer');
const csvController = require('../controllers/csvController');
const authMiddleware = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

router.use(authMiddleware); // Protect all routes

router.post('/groups/:groupId/expenses/import-csv', upload.single('file'), csvController.importCsv);
router.get('/groups/:groupId/import-reports', csvController.getReports);
router.get('/import-reports/:reportId', csvController.getReportDetails);

module.exports = router;
