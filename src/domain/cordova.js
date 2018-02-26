import path from 'path'
import shell from 'shelljs'
import {cleanupPot} from '../common'
import {getDomainConfig} from '../utils'
import fs from 'fs'
import gettextParser from 'gettext-parser'
import jsonfile from 'jsonfile'
import glob from 'glob-promise'

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const baseLocale = getDomainConfig(rc, domainName, 'base-locale')
        const targetDir = getDomainConfig(rc, domainName, 'target-dir')

        const translations = {}

        const baseJsonFile = path.join(targetDir, baseLocale + '.json')
        const baseJson = jsonfile.readFileSync(baseJsonFile)
        for (const [ns, entries] of Object.entries(baseJson)) {
            for (const [key, value] of Object.entries(entries)) {
                const context = ns + '.' + key
                translations[context] = {
                    [value]: {
                        msgctxt: context,
                        msgid: value,
                        msgstr: ''
                    }
                }
            }
        }

        const output = gettextParser.po.compile({
            charset: 'UTF-8',
            headers: {
                'Project-Id-Version': domainName,
                'Language': '',
                'MIME-Version': '1.0',
                'Content-Type': 'text/plain; charset=UTF-8',
                'Content-Transfer-Encoding': '8bit'
            },
            translations: translations
        }, {foldLength: false})

        shell.mkdir('-p', path.dirname(potPath))
        fs.writeFileSync(potPath, output)
        await cleanupPot(domainName, potPath)
    },

    async apply(rc, domainName, poDir) {
        const baseLocale = getDomainConfig(rc, domainName, 'base-locale')
        const targetDir = getDomainConfig(rc, domainName, 'target-dir')

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
            jsonfile.writeFileSync(jsonPath, json, {spaces: 4})
        }
    }
}
