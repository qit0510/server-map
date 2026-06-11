const express = require('express')
const path = require('path')
const router = express.Router()

// assets 已通过 pkg.assets 打包进 exe，__dirname 在两种模式下都能正确定位
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')

router.use('/assets', express.static(path.join(PROJECT_ROOT, 'data', 'assets')))

module.exports = router
