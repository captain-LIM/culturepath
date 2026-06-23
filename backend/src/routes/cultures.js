const express = require('express');
const { getCultures } = require('../controllers/culturesController');

const router = express.Router();

router.get('/', getCultures);

module.exports = router;
