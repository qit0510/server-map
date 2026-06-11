const express = require('express')
const compression = require('compression')
const morgan = require('morgan')
const cors = require('cors')
const path = require('path')
const services = require('./services')

// __dirname 在 pkg 模式下会被重映射到 /snapshot/app/，所以 ../ 就是项目虚拟根目录
// 开发模式下 ../ 就是真实项目根目录 — 两者统一！
const PROJECT_ROOT = path.resolve(__dirname, '..')

// tilesets 目录：mbtiles 文件不入 exe（过大），pkg 模式下用 exe 所在目录
const TILESETS_ROOT = process.pkg
  ? path.dirname(process.execPath)
  : PROJECT_ROOT

const app = express()

app.disable('x-powered-by')
app.set('json spaces', 2)
app.set('trust proxy', true)
app.set('PROJECT_ROOT', PROJECT_ROOT)
app.set('TILESETS_ROOT', TILESETS_ROOT)

app.use(morgan('dev'))
app.use(cors())
app.use(compression())
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: false }))
app.use(express.static(path.join(PROJECT_ROOT, 'public')))

app.use('/api', services)

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next({ status: 404, message: 'URL错误，请检查URL是否正确。' })
})

// error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'ENOENT') return res.sendStatus(404)

  res.status(err.status || 500)
  res.json({
    message: err.message,
    error: err.stack && err.stack.split('\n')
  })
})

module.exports = app
