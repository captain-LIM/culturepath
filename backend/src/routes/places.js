const router = require('express').Router();
const { searchPlaces, getPlaceDetail, getRelatedPlaces } = require('../controllers/placesController');

router.get('/search', searchPlaces);
router.get('/:id/related', getRelatedPlaces);
router.get('/:id', getPlaceDetail);

module.exports = router;
