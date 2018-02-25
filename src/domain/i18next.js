import fs from 'fs'
import glob from 'glob-promise'
import {gettextToI18next} from 'i18next-conv'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, getDomainSrcPaths, xgettext} from '../common'
import {getDomainConfig} from '../utils'

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const srcPaths = await getDomainSrcPaths(rc, domainName, ['.js'])
        const keywords = getDomainConfig(rc, domainName, 'keywords')
        await xgettext(domainName, 'JavaScript', keywords, potPath, srcPaths, false)
        await cleanupPot(domainName, potPath)
    },

    async apply(rc, domainName, poDir) {
        const targetDir = getDomainConfig(rc, domainName, 'target-dir')
        shell.mkdir('-p', targetDir)
        const poPaths = await glob.promise(`${poDir}/*.po`)
        for (const poPath of poPaths) {
            const locale = path.basename(poPath, '.po')
            const json = await gettextToI18next(locale, fs.readFileSync(poPath), {
                keyseparator: false,
                skipUntranslated: true,
                ctxSeparator: false
            })
            const jsonPath = path.join(targetDir, locale + '.json')
            fs.writeFileSync(jsonPath, json)
        }
    }
}
