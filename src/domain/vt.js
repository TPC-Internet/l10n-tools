import fs from 'fs'
import gettextParser from 'gettext-parser'
import shell from 'shelljs'
import path from 'path'
import {cleanupPot, compilePoToMo, getDomainSrcPaths, xgettext} from '../common'
import {getDomainConfig} from '../utils'

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const srcPaths = await getDomainSrcPaths(rc, domainName, ['.html', '.py'])
        const keywords = getDomainConfig(rc, domainName, 'keywords')

        shell.mkdir('-p', path.dirname(potPath))

        const htmlPaths = []
        const pyPaths = []
        for (const srcPath of srcPaths) {
            if (path.extname(srcPath) === '.html') {
                htmlPaths.push(srcPath)
            } else {
                pyPaths.push(srcPath)
            }
        }

        const translations = {'': {}}
        for (const htmlPath of htmlPaths) {
            console.info(`[l10n:${domainName}] [extractPotFromVt] processing ${htmlPath}`)
            const html = fs.readFileSync(htmlPath, 'UTF-8')
            const regex = /{%trans ([^%]+)%}|(\n)/g
            let lineNo = 1
            while (true) {
                const match = regex.exec(html)
                if (!match) {
                    break
                }
                if (match[1]) {
                    // console.log(`matched at ${lineNo}: ${match[1]}`)
                    translations[''][match[1]] = {
                        comments: {
                            reference: htmlPath + ':' + lineNo
                        },
                        msgid: match[1],
                        msgstr: ['']
                    }
                } else if (match[2]) {
                    lineNo++
                }
            }
        }

        // console.log('translations', JSON.stringify(translations, null, 2))
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
        })
        fs.writeFileSync(potPath, output)

        await xgettext(domainName, 'Python', keywords, potPath, pyPaths, true)
        await cleanupPot(domainName, potPath)
    },

    async apply(rc, domainName, poDir) {
        const targetDir = getDomainConfig(rc, domainName, 'target-dir')
        await compilePoToMo(domainName, poDir, targetDir)
    }
}
