import fs from 'fs'
import log from 'npmlog'
import * as shell from 'shelljs'
import path from 'path'
import {getSrcPaths} from '../common'
import {JsExtractor} from '../js-extractor'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.vue', '.js'])

    shell.mkdir('-p', path.dirname(potPath))

    const vuePaths = []
    for (const srcPath of srcPaths) {
        if (path.extname(srcPath) === '.vue') {
            vuePaths.push(srcPath)
        }
    }

    const jsExtractor = JsExtractor.create(domainName, {
        tagNames: ['translate'],
        attrNames: ['v-translate'],
        exprAttrs: [/^:/, /^v-bind:/],
        markers: [{start: '{{', end: '}}'}],
        keywords: ['$gettext']
    })
    log.info('extractPot', 'extracting from .vue, .js files')
    for (const srcPath of srcPaths) {
        log.verbose('extractPot', `processing '${srcPath}'`)
        const ext = path.extname(srcPath)
        if (ext === '.vue') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            jsExtractor.extractVue(srcPath, input)
        } else if (ext === '.js') {
            const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
            jsExtractor.extractJsModule(srcPath, input)
        } else {
            log.warn('extractPot', `skipping '${srcPath}': unknown extension`)
        }
    }
    fs.writeFileSync(potPath, jsExtractor.toString())
}
