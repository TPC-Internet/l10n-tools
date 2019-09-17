import log from 'npmlog'
import {getLineTo, PotExtractor} from '../pot-extractor'
import * as fs from 'fs'
import * as path from 'path'
import cheerio from "cheerio"

export default async function (domainName, config, potPath) {
    const srcPath = path.join(config.get('res-dir'), 'values', 'strings.xml')

    const extractor = PotExtractor.create(domainName)
    log.info('extractPot', 'extracting from strings.xml file')
    log.verbose('extractPot', `processing '${srcPath}'`)
    const input = fs.readFileSync(srcPath, {encoding: 'UTF-8'})
    extractAndroidStrings(extractor, srcPath, input)
    fs.writeFileSync(potPath, extractor.toString())
}

function extractAndroidStrings(extractor, filename, src, startLine = 1) {
    const $ = cheerio.load(src, {decodeEntities: true, xmlMode: true, withStartIndices: true})
    $(':root > string').each((index, elem) => {
        const $e = $(elem)
        if ($e.attr('translatable') === 'false') {
            return
        }

        let content = $e.text().trim()
        if (elem.children[0].type === 'text') {
            content = decodeAndroidStrings(content)
        }

        const name = $e.attr('name')
        const line = getLineTo(src, elem.children[0].startIndex, startLine)
        extractor.addMessage({filename, line}, content, {context: name, allowSpaceInId: true})
    })
}

function decodeAndroidStrings(value) {
    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1)
    }
    return value.replace(/\\(.)/g, (m, p1) => {
        switch (p1) {
            case '"':
            case '\'':
            case '@':
                return p1
            case 'n':
                return '\n'
            default:
                throw new Error(`unknown android escape code: ${p1}`)
        }
    })
}
