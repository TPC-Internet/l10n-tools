import fs from 'fs'
import log from 'npmlog'
import * as path from 'path'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'
import {DomainConfig} from '../config';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const srcPaths = await getSrcPaths(config, ['.php'])
    const keywords = new Set(config.getKeywords())
    keywords.add('_')
    keywords.add('gettext')

    const extractor = PotExtractor.create(domainName, {
        keywords: keywords
    })
    log.info('extractPot', 'extracting from .php files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.php') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractPhpCode(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
