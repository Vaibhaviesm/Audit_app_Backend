/**
 * questionDisplay.js (Backend CommonJS utility)
 *
 * Canonical mapping utility for ESM Plant Audit section-wise display numbering.
 * Maps original Excel-row based checkpoint IDs (Q006, Q007...) to section-wise
 * display IDs (A001..A038, B001..B003, C001..C015, D001..D022, etc.).
 *
 * PRESERVES ALL BACKEND KEYS, DATABASE IDS, AND API CONTRACTS.
 * Presentation-only mapping.
 */

const ORIGINAL_TO_DISPLAY_MAP = {
  // Section A: Equipment & Facilities (38 checkpoints)
  'Q006': 'A001',
  'Q007': 'A002',
  'Q008': 'A003',
  'Q009': 'A004',
  'Q010': 'A005',
  'Q011': 'A006',
  'Q012': 'A007',
  'Q014': 'A008',
  'Q015': 'A009',
  'Q016': 'A010',
  'Q017': 'A011',
  'Q018': 'A012',
  'Q020': 'A013',
  'Q021': 'A014',
  'Q022': 'A015',
  'Q023': 'A016',
  'Q024': 'A017',
  'Q025': 'A018',
  'Q026': 'A019',
  'Q027': 'A020',
  'Q028': 'A021',
  'Q029': 'A022',
  'Q030': 'A023',
  'Q031': 'A024',
  'Q032': 'A025',
  'Q033': 'A026',
  'Q034': 'A027',
  'Q036': 'A028',
  'Q037': 'A029',
  'Q039': 'A030',
  'Q040': 'A031',
  'Q041': 'A032',
  'Q042': 'A033',
  'Q043': 'A034',
  'Q044': 'A035',
  'Q045': 'A036',
  'Q046': 'A037',
  'Q047': 'A038',

  // Section B: Plant Management / Leadership (3 checkpoints)
  'Q049': 'B001',
  'Q050': 'B002',
  'Q051': 'B003',

  // Section C: Plant Labor (15 checkpoints, including Neptune addition N058)
  'Q053': 'C001',
  'Q054': 'C002',
  'Q055': 'C003',
  'Q056': 'C004',
  'Q057': 'C005',
  'N058': 'C006',
  'Q059': 'C007',
  'Q060': 'C008',
  'Q061': 'C009',
  'Q062': 'C010',
  'Q063': 'C011',
  'Q064': 'C012',
  'Q065': 'C013',
  'Q066': 'C014',
  'Q067': 'C015',

  // Section D: Capacity Utilization (22 checkpoints)
  'Q069': 'D001',
  'Q070': 'D002',
  'Q071': 'D003',
  'Q072': 'D004',
  'Q073': 'D005',
  'Q074': 'D006',
  'Q075': 'D007',
  'Q076': 'D008',
  'Q077': 'D009',
  'Q078': 'D010',
  'Q079': 'D011',
  'Q080': 'D012',
  'Q081': 'D013',
  'Q082': 'D014',
  'Q083': 'D015',
  'Q084': 'D016',
  'Q085': 'D017',
  'Q086': 'D018',
  'Q087': 'D019',
  'Q088': 'D020',
  'Q089': 'D021',
  'Q090': 'D022',

  // Section E: Plant Maintenance (7 checkpoints)
  'Q092': 'E001',
  'Q093': 'E002',
  'Q094': 'E003',
  'Q095': 'E004',
  'Q096': 'E005',
  'Q097': 'E006',
  'Q098': 'E007',

  // Section F: Quality (7 checkpoints)
  'Q100': 'F001',
  'Q101': 'F002',
  'Q102': 'F003',
  'Q103': 'F004',
  'Q104': 'F005',
  'Q105': 'F006',
  'Q106': 'F007',

  // Section G: Environmental Health and Safety (9 checkpoints)
  'Q108': 'G001',
  'Q109': 'G002',
  'Q110': 'G003',
  'Q111': 'G004',
  'Q112': 'G005',
  'Q113': 'G006',
  'Q114': 'G007',
  'Q115': 'G008',
  'Q116': 'G009',

  // Section H: Continuous Improvement (7 checkpoints)
  'Q118': 'H001',
  'Q119': 'H002',
  'Q120': 'H003',
  'Q121': 'H004',
  'Q122': 'H005',
  'Q123': 'H006',
  'Q124': 'H007',

  // Section I: Regulation Fulfillment and Execution of Studies (8 checkpoints)
  'Q125': 'I001',
  'Q126': 'I002',
  'Q127': 'I003',
  'Q128': 'I004',
  'Q129': 'I005',
  'Q130': 'I006',
  'Q131': 'I007',
  'Q132': 'I008',
};

// Build reverse lookup map for search resolution (Display ID -> Original ID)
const DISPLAY_TO_ORIGINAL_MAP = Object.entries(ORIGINAL_TO_DISPLAY_MAP).reduce(
  (acc, [orig, disp]) => {
    acc[disp] = orig;
    return acc;
  },
  {}
);

/**
 * Returns the section-wise display ID for a given question identifier.
 * Falls back to the original identifier for J/K checkpoints or custom additions.
 */
function getDisplayQuestionId(questionId) {
  if (!questionId) return '';
  return ORIGINAL_TO_DISPLAY_MAP[questionId] || questionId;
}

/**
 * Returns the original database question ID from a display ID, or itself if unmapped.
 */
function getOriginalQuestionId(displayId) {
  if (!displayId) return '';
  const upper = displayId.trim().toUpperCase();
  return DISPLAY_TO_ORIGINAL_MAP[upper] || displayId;
}

module.exports = {
  ORIGINAL_TO_DISPLAY_MAP,
  DISPLAY_TO_ORIGINAL_MAP,
  getDisplayQuestionId,
  getOriginalQuestionId,
};

