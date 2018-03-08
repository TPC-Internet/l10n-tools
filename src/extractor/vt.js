import fs from 'fs'
import gettextParser from 'gettext-parser'
import log from 'npmlog'
import shell from 'shelljs'
import path from 'path'
import {getSrcPaths, xgettext} from '../common'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.html', '.py'])
    const keywords = config.get('keywords')

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
        log.info('extractPot', `processing ${htmlPath}`)
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
}
