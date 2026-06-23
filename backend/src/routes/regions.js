const express = require('express');
const { getRegionsByCulture, getSpotsByRegion } = require('../controllers/regionsController');

const router = express.Router();

// GET /cultures/:id/regions
router.get('/cultures/:id/regions', getRegionsByCulture);

// GET /regions/:code/spots?culture=
router.get('/regions/:code/spots', getSpotsByRegion);

module.exports = router;
