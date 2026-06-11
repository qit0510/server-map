const router = require('express').Router()
const search = require('./controller')

router.get('/search', search.search)
router.get('/search/reverse', search.reverse)
router.get('/search/status', search.status)

module.exports = router
