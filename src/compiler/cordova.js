import log from 'npmlog'
import path from 'path'
import * as shell from 'shelljs'
import fs from 'fs'
import * as gettextParser from 'gettext-parser'
import jsonfile from 'jsonfile'
import glob from 'glob-promise'

export default async function(domainName, config, poDir) {
    const baseLocale = config.get('base-locale')
    const targetDir = config.get('target-dir')
    log.info('compile', `generating cordova json files to '${targetDir}/{locale}.json'`)

    shell.mkdir('-p', targetDir)
    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const input = fs.readFileSync(poPath)
        const {translations} = gettextParser.po.parse(input)
        const json = {}
        for (const data of Object.values(translations)) {
            const entry = Object.values(data)[0]
            if (!('msgctxt' in entry) && entry.msgid === '') {
                continue
            }

            if (entry.msgstr.length > 1) {
                throw new Error('unknown po format')
            }

            const [ns, key] = entry.msgctxt.split('.', 2)
            let value = entry.msgstr[0]
            if (!value && locale === baseLocale) {
                value = entry.msgid
            }

            if (!(ns in json)) {
                json[ns] = {}
            }

            if (value) {
                json[ns][key] = value
            }
        }
        const jsonPath = path.join(targetDir, locale + '.json')
        jsonfile.writeFileSync(jsonPath, json, {spaces: 2})
    }
}
