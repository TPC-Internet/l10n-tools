import fs from 'fs'
import log from 'npmlog'
import * as path from 'path'
import {getSrcPaths, xgettext} from '../common'
import {PotExtractor} from '../pot-extractor'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.html', '.py'])
    const keywords = config.get('keywords')

    const htmlPaths = []
    const pyPaths = []
    for (const srcPath of srcPaths) {
        if (path.extname(srcPath) === '.html') {
            htmlPaths.push(srcPath)
        } else {
            pyPaths.push(srcPath)
        }
    }

    const extractor = PotExtractor.create(domainName)

    log.info('extractPot', 'extracting from .html files')
    for (const htmlPath of htmlPaths) {
        log.verbose('extractPot', `processing '${htmlPath}'`)
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
                extractor.addMessage({filename: htmlPath, line: lineNo}, match[1])
            } else if (match[2]) {
                lineNo++
            }
        }
    }

    // console.log('translations', JSON.stringify(translations, null, 2))
    fs.writeFileSync(potPath, extractor.toString())

    log.info('extractPot', 'extracting from .py files')
    await xgettext(domainName, 'Python', keywords, potPath, pyPaths, true)
}
