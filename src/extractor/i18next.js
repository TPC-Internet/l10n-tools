import log from 'npmlog'
import {getSrcPaths} from '../common'
import {JsExtractor} from '../js-extractor'
import fs from 'fs'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.js'])
    const keywords = config.get('keywords')

    const jsExtractor = JsExtractor.create(domainName, {keywords})
    log.info('extractPot', 'extracting from .js files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
        jsExtractor.extractJsModule(srcPath, input)
    }
    fs.writeFileSync(potPath, jsExtractor.toString())
}
