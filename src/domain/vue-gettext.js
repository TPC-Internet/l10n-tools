import fs from 'fs'
import glob from 'glob-promise'
import {gettextToI18next} from 'i18next-conv'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, getDomainSrcPaths, xgettext} from '../common'
import {getDomainConfig} from '../utils'
import jsonfile from 'jsonfile'
import eg from 'easygettext'

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const srcPaths = await getDomainSrcPaths(rc, domainName, ['.vue', '.js'])

        shell.mkdir('-p', path.dirname(potPath))

        const extractor = new eg.extract.Extractor({
            lineNumbers: true,
            attributes: ['v-translate'],
            filters: eg.constants.DEFAULT_FILTERS,
            filterPrefix: eg.constants.DEFAULT_FILTER_PREFIX,
            startDelimiter: eg.constants.DEFAULT_DELIMITERS.start,
            endDelimiter: eg.constants.DEFAULT_DELIMITERS.end,
        })

        console.info(`[l10n:${domainName}] [extractPot] from vue templates`)
        for (const srcPath of srcPaths) {
            if (path.extname(srcPath) === '.vue') {
                console.info(`[l10n:${domainName}] [extractPot] processing '${srcPath}'`)
                const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
                extractor.parse(srcPath, eg.extract.preprocessTemplate(input, 'vue'))
            }
        }
        fs.writeFileSync(potPath, extractor.toString())

        console.info(`[l10n:${domainName}] [extractPot] from javascript`)
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
