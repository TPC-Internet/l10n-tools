import fs from 'node:fs/promises'
import log from 'npmlog'
import shell from 'shelljs'
import * as path from 'path'
import {EntryCollection} from '../entry-collection.js'
import {readTransEntries} from '../entry.js'
import {type CompilerConfig} from '../config.js';
import {
    buildAndroidXml,
    containsAndroidXmlSpecialChars,
    createCDataNode,
    createTextNode,
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
import {extractLocaleFromTransPath, listTransPaths} from '../utils.js'

export async function compileToAndroidXml(domainName: string, config: CompilerConfig, transDir: string) {
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

    const transPaths = await listTransPaths(transDir)
    for (const transPath of transPaths) {
        const locale = extractLocaleFromTransPath(transPath)
        const dstXmlJson = await readXmlJson(parser, resDir, locale)
        const dstResNode = findFirstTagNode(dstXmlJson, 'resources')
        if (dstResNode == null) {
            throw new Error('no resources tag')
        }

        const trans = EntryCollection.loadEntries(await readTransEntries(transPath))

        const dstResources: XMLNode[] = []
        let passingText = false
        for (const node of resNode.resources) {
            if (isTextNode(node)) {
                if (passingText) {
                    passingText = false
                } else {
                    dstResources.push(node)
                }
                continue
            }

            // string 태그
            if (isTagNode(node, 'string')) {
                // translatable="false" 인 태그는 스킵
                const translatable = getAttrValue(node, 'translatable')
                if (translatable == 'false') {
                    passingText = true
                    continue
                }

                // name attr 없는 태그는 문제가 있는 것인데, 일단 스킵
                const name = getAttrValue(node, 'name')
                if (name == null) {
                    passingText = true
                    continue
                }

                // 번역이 없는 태그도 스킵
                const transEntry = trans.find(name, null)
                if (transEntry == null) {
                    passingText = true
                    continue
                }
                let value = transEntry.messages.other
                if (!value) {
                    passingText = true
                    continue
                }

                // html format 은 번역 텍스트 그대로 사용
                const format = getAttrValue(node, 'format')
                if (format === 'html') {
                    // no post process
                    dstResources.push({...node, string: [createTextNode(value, true)]})
                } else {
                    // CDATA 노드인 경우 CDATA를 그대로 살려서 스트링만 교체
                    if (node.string.some(node => isCDataNode(node))) {
                        dstResources.push({...node, string: [createTextNode(value, true)]})
                    } else if (containsAndroidXmlSpecialChars(value)) {
                        dstResources.push({...node, string: [createCDataNode(value, false)]})
                    } else {
                        // 그 외의 경우는 android string encoding 하여 사용
                        dstResources.push({...node, string: [createTextNode(value, false)]})
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
                        continue
                    }
                }
                passingText = true
                continue
            }

            dstResources.push(node)
        }

        if (locale === defaultLocale) {
            await writeXmlJson(builder, srcXmlJson, resDir, null)
        }

        dstResNode.resources = dstResources

        await writeXmlJson(builder, dstXmlJson, resDir, locale)
    }
}

async function readXmlJson(parser: XMLParser, resDir: string, locale: string | null): Promise<XMLNode[]> {
    let targetPath: string
    if (locale == null) {
        targetPath = path.join(resDir, 'values', 'strings.xml')
    } else {
        targetPath = path.join(resDir, 'values-' + locale, 'strings.xml')
    }

    const xml = await fs.readFile(targetPath, {encoding: 'utf-8'})
    return await parseAndroidXml(parser, xml)
}

async function writeXmlJson(builder: XMLBuilder, xmlJson: XMLNode[], resDir: string, locale: string | null) {
    const xml = buildAndroidXml(builder, xmlJson)

    let targetPath: string
    if (locale == null) {
        targetPath = path.join(resDir, 'values', 'strings.xml')
    } else {
        targetPath = path.join(resDir, 'values-' + locale, 'strings.xml')
    }
    shell.mkdir('-p', path.dirname(targetPath))
    await fs.writeFile(targetPath, xml, {encoding: 'utf-8'})
}
