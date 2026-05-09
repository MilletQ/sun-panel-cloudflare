const fs = require('fs')
const moment = require('moment')

const packDate = moment().utc().format('YYYYMMDD')
const versionLine = `VITE_APP_VERSION=${packDate}`
const envFilePath = ['.env', '.env.production', '.env.development'].find(file => fs.existsSync(file)) || '.env'
const versionRegex = /^VITE_APP_VERSION=.*$/m

let envContent = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf-8') : ''

if (versionRegex.test(envContent))
  envContent = envContent.replace(versionRegex, versionLine)
else
  envContent = `${envContent.replace(/\s*$/, '')}\n${versionLine}`

fs.writeFileSync(envFilePath, `${envContent.replace(/\s*$/, '')}\n`)

console.log(`update to ${envFilePath} file.`, versionLine)
