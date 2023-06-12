import {type DomainConfig} from '../config.js'
import fs from 'node:fs/promises'
import log from 'npmlog'
import path from 'node:path'
import {getSrcPaths} from '../common.js'
import {KeyExtractor} from '../key-extractor.js'
import {writeKeyEntries} from '../entry.js'

export default async function (domainName: string, config: DomainConfig, keysPath: string) {
    const srcPaths = await getSrcPaths(config, ['.vue', '.js', '.ts'])
    const keywords = new Set(config.getKeywords())
    keywords.add('$t')
    keywords.add('t')
    keywords.add('vm.$t')
    keywords.add('this.$t')
    keywords.add('app.i18n.t')
    keywords.add('$tc')
    keywords.add('vm.$tc')
    keywords.add('this.$tc')
    keywords.add('app.i18n.tc')

    const extractor = new KeyExtractor({
        tagNames: ['i18n', 'i18n-t'],
        objectAttrs: {'v-t': ['', 'path']},
        exprAttrs: [/^:/, /^v-bind:/, /^v-html$/],
        markers: [{start: '{{', end: '}}'}],
        keywords: [...keywords]
    })
    log.info('extractKeys', 'extracting from .vue, .js, .ts files')
    for (const srcPath of srcPaths) {
        log.verbose('extractKeys', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.vue') {
            const input = await fs.readFile(srcPath, {encoding: 'utf-8'})
            extractor.extractVue(srcPath, input)
        } else if (ext === '.js') {
            const input = await fs.readFile(srcPath, {encoding: 'utf-8'})
            extractor.extractJsModule(srcPath, input)
        } else if (ext === '.ts') {
            const input = await fs.readFile(srcPath, {encoding: 'utf-8'})
            extractor.extractTsModule(srcPath, input)
        } else {
            log.warn('extractKeys', `skipping '${srcPath}': unknown extension`)
        }
    }
    await writeKeyEntries(keysPath, extractor.keys.toEntries())
}
