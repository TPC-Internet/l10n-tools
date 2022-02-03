import log from 'npmlog'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'
import fs from 'fs'
import * as path from "path"

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.js'])
    const keywords = config.get('keywords')

    const extractor = PotExtractor.create(domainName, {keywords})
    log.info('extractPot', 'extracting from .js files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.js') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            extractor.extractReactJsModule(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
