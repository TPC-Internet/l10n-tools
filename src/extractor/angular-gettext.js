import fs from 'fs'
import log from 'npmlog'
import * as path from 'path'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'
import {applyFilter} from '../filter'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.html', '.js'])

    const extractor = PotExtractor.create(domainName, {
        tagNames: ['translate'],
        attrNames: ['translate'],
        filterNames: ['translate'],
        markers: [{start: '{{', end: '}}', type: 'angular'}],
        keywords: ['gettext', 'gettextCatalog.getString']
    })
    log.info('extractPot', 'extracting from .html, .js files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)

        const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
        const filtered = await applyFilter(domainName, config, srcPath, input)

        const ext = path.extname(srcPath)
        if (ext === '.html') {
            extractor.extractTemplate(srcPath, filtered)
        } else if (ext === '.js') {
            extractor.extractJsModule(srcPath, filtered)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
