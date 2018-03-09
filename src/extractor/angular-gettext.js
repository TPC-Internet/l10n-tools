import fs from 'fs'
import shell from 'shelljs'
import log from 'npmlog'
import path from 'path'
import {Extractor} from 'angular-gettext-tools'
import {getSrcPaths} from '../common'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.html', '.js'])

    shell.mkdir('-p', path.dirname(potPath))

    log.info('extractPot', 'extracting from .html, .js files')
    const gettextExtractor = new Extractor()
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'});
        gettextExtractor.parse(srcPath, input)
    }
    fs.writeFileSync(potPath, gettextExtractor.toString())
}
