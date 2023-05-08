import fs from 'fs'
import log from 'npmlog'
import * as path from 'path'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'
import {DomainConfig} from '../config';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const srcPaths = await getSrcPaths(config, ['.vue', '.js'])
    const keywords = new Set(config.getKeywords())
    keywords.add('$gettext')
    keywords.add('this.$gettext')
    keywords.add('vm.$gettext')
    keywords.add('$gettextInterpolate')
    keywords.add('this.$gettextInterpolate')
    keywords.add('vm.$gettextInterpolate')

    const extractor = PotExtractor.create(domainName, {
        tagNames: ['translate'],
        attrNames: ['v-translate'],
        exprAttrs: [/^:/, /^v-bind:/],
        markers: [{start: '{{', end: '}}'}],
        keywords: keywords
    })
    log.info('extractPot', 'extracting from .vue, .js files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.vue') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractVue(srcPath, input)
        } else if (ext === '.js') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractJsModule(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
