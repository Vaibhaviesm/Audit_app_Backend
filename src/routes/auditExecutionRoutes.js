const express = require('express');
const router = express.Router();
const {
  getMyAudits,
  getAuditWorkspace,
  saveDraft,
  submitSection,
  submitFinalAudit,
  uploadEvidenceFile,
} = require('../controllers/auditExecutionController');
const { protect } = require('../middleware/auth');
const { verifyAuditAccess } = require('../middleware/auditAccess');
const upload = require('../middleware/upload');

router.use(protect);

// Get audits assigned to current employee
router.get('/my-audits', getMyAudits);

// Get workspace for an audit (accessible by assigned employee, admin, reviewer)
router.get('/:auditId/workspace', verifyAuditAccess, getAuditWorkspace);

// Autosave draft responses
router.post('/:auditId/save-draft', verifyAuditAccess, saveDraft);

// Submit section
router.post('/:auditId/submit-section', verifyAuditAccess, submitSection);

// Final submission
router.post('/:auditId/submit-final', verifyAuditAccess, submitFinalAudit);

// Upload evidence photo / file
router.post('/:auditId/upload-evidence', verifyAuditAccess, upload.single('file'), uploadEvidenceFile);

module.exports = router;

