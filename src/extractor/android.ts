import log from 'npmlog'
import {getLineTo, isTagElement, PotExtractor} from '../pot-extractor'
import * as fs from 'fs'
import * as path from 'path'
import cheerio from "cheerio"
import * as htmlEntities from 'html-entities'
import {DomainConfig} from '../config';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const resDir = config.getResDir()
    const srcPath = path.join(resDir, 'values', 'strings.xml')

    const extractor = PotExtractor.create(domainName, {})
    log.info('extractPot', 'extracting from strings.xml file')
    log.verbose('extractPot', `processing '${srcPath}'`)
    const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
    extractAndroidStrings(extractor, srcPath, input)
    fs.writeFileSync(potPath, extractor.toString())
}

function extractAndroidStrings(extractor: PotExtractor, filename: string, src: string, startLine: number = 1) {
    const $ = cheerio.load(src, {decodeEntities: true, xmlMode: true, withStartIndices: true})
    $(':root > string').each((index, elem) => {
        const $e = $(elem)
        if ($e.attr('translatable') === 'false') {
            return
        }
        if (!isTagElement(elem)) {
            return
        }

        let content
        if ($e.attr('format') === 'html') {
            content = htmlEntities.decode($e.html()!.trim())
        } else {
            content = $e.text().trim()
            if (elem.children[0].type === 'text') {
                content = decodeAndroidStrings(content)
            }
        }

        const name = $e.attr('name')
        const line = getLineTo(src, elem.children[0].startIndex!, startLine)
        extractor.addMessage({filename, line}, content, {context: name, allowSpaceInId: true})
    })
}

function decodeAndroidStrings(value: string): string {
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
                throw new Error(`unknown android escape code: ${p1} of '${value}'`)
        }
    })
}
