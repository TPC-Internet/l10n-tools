import fs from 'fs'
import log from 'npmlog'
import * as shell from 'shelljs'
import path from 'path'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.php'])
    const keywords = new Set(config.get('keywords', []))
    keywords.add('_')
    keywords.add('gettext')

    shell.mkdir('-p', path.dirname(potPath))

    const extractor = PotExtractor.create(domainName, {
        keywords: keywords
    })
    log.info('extractPot', 'extracting from .php files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.php') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            extractor.extractPhpCode(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
