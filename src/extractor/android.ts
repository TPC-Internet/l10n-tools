import log from 'npmlog'
import {getLineTo, KeyExtractor} from '../key-extractor.js'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {type DomainConfig} from '../config.js'
import {writeKeyEntries} from '../entry.js'
import {HTMLElement, parse} from "node-html-parser";
import {containsAndroidXmlSpecialChars, decodeAndroidStrings} from "../compiler/android-xml-utils.js";
import he from "he";

export default async function (domainName: string, config: DomainConfig, keysPath: string) {
    const resDir = config.getResDir()
    const srcPath = path.join(resDir, 'values', 'strings.xml')

    const extractor = new KeyExtractor({})
    log.info('extractKeys', 'extracting from strings.xml file')
    log.verbose('extractKeys', `processing '${srcPath}'`)
    const input = await fsp.readFile(srcPath, {encoding: 'utf-8'})
    extractAndroidStringsXml(extractor, srcPath, input)
    await writeKeyEntries(keysPath, extractor.keys.toEntries())
}

export function extractAndroidStringsXml (extractor: KeyExtractor, filename: string, src: string, startLine: number = 1) {
    const root = parse(src)
    for (const elem of root.querySelectorAll(':scope > resources > *')) {
        if (elem.attributes['translatable'] == 'false') {
            continue
        }

        if (elem.rawTagName == 'string') {
            const name = elem.attributes['name']
            const content = getAndroidXmlStringContent(elem)
            const line = getLineTo(src, elem.childNodes[0].range[0], startLine)
            extractor.addMessage({filename, line}, content, {context: name})
        } else if (elem.rawTagName == 'plurals') {
            const name = elem.attributes['name']
            const line = getLineTo(src, elem.childNodes[0].range[0], startLine)
            let itemElem = elem.querySelector(':scope > item[quantity="other"]')
            if (itemElem == null) {
                itemElem = elem.querySelector(':scope > item')
            }
            if (itemElem == null) {
                log.warn('extractKeys', `missing item tag of plurals ${name}`)
                continue
            }
            const content = getAndroidXmlStringContent(itemElem)
            extractor.addMessage({filename, line}, content, {isPlural: true, context: name})
        }
    }
}

function getAndroidXmlStringContent(elem: HTMLElement) {
    if (elem.attributes['format'] == 'html') {
        return elem.innerHTML.trim()
    } else {
        let content = elem.innerHTML.trim()
        if (content.startsWith('<![CDATA[')) {
            content = content.substring(9, content.length - 3)
        } else {
            content = decodeAndroidStrings(content)
            if (containsAndroidXmlSpecialChars(content)) {
                content = he.decode(content)
            }
        }
        return content
    }
}
