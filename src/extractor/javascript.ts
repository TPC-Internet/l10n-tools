import log from 'npmlog'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'
import fs from 'fs'
import * as path from "path"
import {DomainConfig} from '../config';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const srcPaths = await getSrcPaths(config, ['.js', '.ts', '.jsx'])
    const keywords = config.getKeywords()

    const extractor = PotExtractor.create(domainName, {keywords})
    log.info('extractPot', 'extracting from .js, .ts files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.js') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractJsModule(srcPath, input)
        } else if (ext === '.ts') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractTsModule(srcPath, input)
        } else if (ext === '.jsx') {
            const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
            extractor.extractReactJsModule(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
