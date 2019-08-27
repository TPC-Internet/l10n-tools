import fs from 'fs'
import log from 'npmlog'
import * as path from 'path'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.vue', '.js'])
    const keywords = new Set(config.get('keywords', []))
    keywords.add('$t')
    keywords.add('vm.$t')
    keywords.add('this.$t')
    keywords.add('app.i18n.t')
    keywords.add('$tc')
    keywords.add('vm.$tc')
    keywords.add('this.$tc')
    keywords.add('app.i18n.tc')

    const extractor = PotExtractor.create(domainName, {
        tagNames: ['i18n'],
        objectAttrs: {'v-t': ['', 'path']},
        exprAttrs: [/^:/, /^v-bind:/, /^v-html$/],
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
