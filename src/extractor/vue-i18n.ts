import {type DomainConfig} from '../config.js'
import * as fs from 'fs'
import log from 'npmlog'
import * as path from 'path'
import {getSrcPaths} from '../common.js'
import {PotExtractor} from '../pot-extractor.js'
import {writePoFile} from '../po.js';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const srcPaths = await getSrcPaths(config, ['.vue', '.js', '.ts'])
    const keywords = new Set(config.getKeywords())
    keywords.add('$t')
    keywords.add('vm.$t')
    keywords.add('this.$t')
    keywords.add('app.i18n.t')
    keywords.add('$tc')
    keywords.add('vm.$tc')
    keywords.add('this.$tc')
    keywords.add('app.i18n.tc')

    const extractor = PotExtractor.create(domainName, {
        tagNames: ['i18n', 'i18n-t'],
        objectAttrs: {'v-t': ['', 'path']},
        exprAttrs: [/^:/, /^v-bind:/, /^v-html$/],
        markers: [{start: '{{', end: '}}'}],
        keywords: [...keywords]
    })
    log.info('extractPot', 'extracting from .vue, .js, .ts files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.vue') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractVue(srcPath, input)
        } else if (ext === '.js') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractJsModule(srcPath, input)
        } else if (ext === '.ts') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractTsModule(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    writePoFile(potPath, extractor.po)
}
