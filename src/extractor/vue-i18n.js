import fs from 'fs'
import log from 'npmlog'
import * as shell from 'shelljs'
import path from 'path'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.vue', '.js'])
    const keywords = new Set(config.get('keywords', []))
    keywords.add('$t')
    keywords.add('this.$t')
    keywords.add('$i18nPath')

    shell.mkdir('-p', path.dirname(potPath))

    const extractor = PotExtractor.create(domainName, {
        exprAttrs: [/^:/, /^v-bind:/],
        markers: [{start: '{{', end: '}}'}],
        keywords: keywords
    })
    log.info('extractPot', 'extracting from .vue, .js files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.vue') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            extractor.extractVue(srcPath, input)
        } else if (ext === '.js') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            extractor.extractJsModule(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
