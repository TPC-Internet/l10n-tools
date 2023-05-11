import fs from 'fs'
import {glob} from 'glob'
import log from 'npmlog'
import shell from 'shelljs'
import * as path from 'path'
import {findPoEntry, readPoFile} from '../po.js'
import {type CompilerConfig} from '../config.js';
import {
    buildAndroidXml,
    containsAndroidXmlSpecialChars,
    encodeAndroidStrings,
    findFirstTagNode,
    getAndroidXmlBuilder,
    getAndroidXmlParser,
    getAttrValue,
    isCDataNode,
    isTagNode,
    isTextNode,
    parseAndroidXml,
    type XMLNode,
} from './android-xml-utils.js';
import type {XMLBuilder, XMLParser} from 'fast-xml-parser';

export default async function (domainName: string, config: CompilerConfig, poDir: string) {
    const resDir = config.getResDir()
    const defaultLocale = config.getDefaultLocale()
    log.info('compile', `generating res files '${resDir}/values-{locale}/strings.xml'`)

    const parser = getAndroidXmlParser()
    const builder = getAndroidXmlBuilder()

    const srcXmlJson = await readXmlJson(parser, resDir, null)
    const resNode = findFirstTagNode(srcXmlJson, 'resources')
    if (resNode == null) {
        throw new Error('no resources tag')
    }

    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const dstXmlJson = await readXmlJson(parser, resDir, locale)
        const dstResNode = findFirstTagNode(dstXmlJson, 'resources')
        if (dstResNode == null) {
            throw new Error('no resources tag')
        }

        const po = readPoFile(poPath)

        const dstResources: XMLNode[] = []
        let passingText = false
        for (const node of resNode.resources) {
            if (isTextNode(node)) {
                if (!passingText) {
                    dstResources.push(node)
                }
                continue
            }

            // string 태그
            if (isTagNode(node, 'string')) {
                // translatable="false" 인 태그는 스킵
                const translatable = getAttrValue(node, 'translatable')
                if (translatable == 'false') {
                    continue
                }

                // name attr 없는 태그는 문제가 있는 것인데, 일단 스킵
                const name = getAttrValue(node, 'name')
                if (name == null) {
                    continue
                }

                // 번역이 없는 태그도 스킵
                const poEntry = findPoEntry(po, name, null)
                if (poEntry == null) {
                    continue
                }
                let value = poEntry.msgstr[0]

                // html format 은 번역 텍스트 그대로 사용
                const format = getAttrValue(node, 'format')
                if (format === 'html') {
                    // no post process
                    dstResources.push({
                        ...node,
                        string: [{
                            '#text': value
                        }]
                    })
                } else {
                    // CDATA 노드인 경우 CDATA를 그대로 살려서 스트링만 교체
                    if (node.string.some(node => isCDataNode(node))) {
                        dstResources.push({
                            ...node,
                            string: [{
                                '#cdata': [{
                                    '#text': value
                                }]
                            }]
                        })
                    } else if (containsAndroidXmlSpecialChars(value)) {
                        dstResources.push({
                            ...node,
                            string: [{
                                '#cdata': [{
                                    '#text': encodeAndroidStrings(value)
                                }]
                            }]
                        })
                    } else {
                        // 그 외의 경우는 android string encoding 하여 사용
                        dstResources.push({
                            ...node,
                            string: [{
                                '#text': encodeAndroidStrings(value)
                            }]
                        })
                    }
                }
                continue
            }

            if (isTagNode(node, 'plurals')) {
                const name = getAttrValue(node, 'name')
                if (name != null) {
                    const dstNode = findFirstTagNode(dstResNode.resources, 'plurals', {name})
                    if (dstNode != null) {
                        dstResources.push(dstNode)
                    }
                }
                continue
            }

            dstResources.push(node)
        }

        if (locale === defaultLocale) {
            writeXmlJson(builder, srcXmlJson, resDir, null)
        }

        dstResNode.resources = dstResources

        writeXmlJson(builder, dstXmlJson, resDir, locale)
    }
}

async function readXmlJson(parser: XMLParser, resDir: string, locale: string | null): Promise<XMLNode[]> {
    let targetPath: string
    if (locale == null) {
        targetPath = path.join(resDir, 'values', 'strings.xml')
    } else {
        targetPath = path.join(resDir, 'values-' + locale, 'strings.xml')
    }

    const xml = fs.readFileSync(targetPath, {encoding: 'utf-8'})
    return await parseAndroidXml(parser, xml)
}

function writeXmlJson(builder: XMLBuilder, xmlJson: XMLNode[], resDir: string, locale: string | null) {
    const xml = buildAndroidXml(builder, xmlJson)

    let targetPath: string
    if (locale == null) {
        targetPath = path.join(resDir, 'values', 'strings.xml')
    } else {
        targetPath = path.join(resDir, 'values-' + locale, 'strings.xml')
    }
    shell.mkdir('-p', path.dirname(targetPath))
    fs.writeFileSync(targetPath, xml, {encoding: 'utf-8'})
}
