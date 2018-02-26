import {Extractor} from 'angular-gettext-tools'
import fs from 'fs'
import glob from 'glob-promise'
import {gettextToI18next} from 'i18next-conv'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, getDomainSrcPaths, xgettext} from '../common'
import {getDomainConfig} from '../utils'
import jsonfile from 'jsonfile'

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const srcPaths = await getDomainSrcPaths(rc, domainName, ['.vue', '.js'])

        shell.mkdir('-p', path.dirname(potPath))

        const vuePaths = []
        for (const srcPath of srcPaths) {
            if (path.extname(srcPath) === '.vue') {
                vuePaths.push(srcPath)
            }
        }

        const gettextExtractor = new Extractor({
            attributes: ['v-translate', 'translate'],
            extensions: {vue: 'html'}
        })
        console.info(`[l10n:${domainName}] [extractPot] from vue templates`)
        for (const vuePath of vuePaths) {
            console.info(`[l10n:${domainName}] [extractPot] processing '${vuePath}'`)
            const input = fs.readFileSync(vuePath, {encoding: 'UTF-8'})
            gettextExtractor.parse(vuePath, input)
        }
        fs.writeFileSync(potPath, gettextExtractor.toString())

        await xgettext(domainName, 'JavaScript', ['npgettext:1c,2,3'], potPath, srcPaths, true)
        await cleanupPot(domainName, potPath)
    },

    async apply(rc, domainName, poDir) {
        const targetPath = getDomainConfig(rc, domainName, 'target-path')

        const translations = {}
        const poPaths = await glob.promise(`${poDir}/*.po`)
        for (const poPath of poPaths) {
            const locale = path.basename(poPath, '.po')
            const json = await gettextToI18next(locale, fs.readFileSync(poPath), {
                keyseparator: false,
                skipUntranslated: true,
                ctxSeparator: false
            })
            translations[locale] = JSON.parse(json)
        }
        jsonfile.writeFileSync(targetPath, translations, {spaces: 4})
    }
}
