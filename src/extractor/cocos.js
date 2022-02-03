import log from 'npmlog'
import {getSrcPaths} from '../common'
import {PotExtractor} from '../pot-extractor'
import * as fs from 'fs'
import * as path from 'path'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.js', '.ts', '.fire', '.prefab'])
    const keywords = new Set(config.get('keywords', []))
    keywords.add('i18n.t')

    const cocosKeywords = {'744dcs4DCdNprNhG0xwq6FK': '_dataID'}
    const extractor = PotExtractor.create(domainName, {keywords, cocosKeywords})
    log.info('extractPot', 'extracting from .js, .ts, .fire, .prefab files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.js') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            extractor.extractJsModule(srcPath, input)
        } else if (ext === '.ts') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            extractor.extractTsModule(srcPath, input)
        } else if (ext === '.fire' || ext === '.prefab') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            extractor.extractCocosAsset(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, extractor.toString())
}
