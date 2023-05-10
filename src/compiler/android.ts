import fs from 'fs'
import {glob} from 'glob'
import log from 'npmlog'
import shell from 'shelljs'
import * as path from 'path'
import * as xml2js from 'xml2js'
import {findPoEntry, readPoFile} from '../po.js'
import {type CompilerConfig} from '../config.js';

export default async function (domainName: string, config: CompilerConfig, poDir: string) {
    const resDir = config.getResDir()
    const defaultLocale = config.getDefaultLocale()
    log.info('compile', `generating res files '${resDir}/values-{locale}/strings.xml'`)

    const srcPath = path.join(resDir, 'values', 'strings.xml')
    const srcInput = fs.readFileSync(srcPath, {encoding: 'utf-8'})

    const builder = new xml2js.Builder({
        renderOpts: {pretty: true, indent: '    ', newline: '\n'},
        xmldec: {version: '1.0', encoding: 'utf-8'},
        cdata: true
    })

    const poPaths = await glob(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const po = readPoFile(poPath)

        const srcXmlJson = await xml2js.parseStringPromise(srcInput)
        const strings = []
        for (const string of srcXmlJson.resources.string) {
            if (string.$.translatable === 'false') {
                continue
            }
            const poEntry = findPoEntry(po, string.$.name, null)
            if (poEntry == null) {
                continue
            }
            let value = poEntry.msgstr[0]
            if (string.$.format === 'html') {
                if (value) {
                    for (let k in string) {
                        if (k != '$') {
                            delete string[k]
                        }
                    }
                    string['#raw'] = value
                    strings.push(string)
                }
            } else {
                if (value.includes('CDATA')) {
                    value = value.substring(9, value.length - 3)
                } else {
                    value = encodeAndroidStrings(value)
                }
                if (value) {
                    string._ = value
                    strings.push(string)
                }
            }
        }

        if (locale === defaultLocale) {
            shell.mkdir('-p', path.dirname(srcPath))
            fs.writeFileSync(srcPath, builder.buildObject(srcXmlJson), {encoding: 'utf-8'})
        }

        const resLocale = locale.replace('_', '-r')
        const targetPath = path.join(resDir, 'values-' + resLocale, 'strings.xml')

        const dstInput = fs.readFileSync(targetPath, {encoding: 'utf-8'})
        const dstXmlJson = await xml2js.parseStringPromise(dstInput)

        dstXmlJson.resources.string = strings

        const xml = builder.buildObject(dstXmlJson)

        shell.mkdir('-p', path.dirname(targetPath))
        fs.writeFileSync(targetPath, xml, {encoding: 'utf-8'})

    }
}

function encodeAndroidStrings(value: string): string {
    value = value.replace(/[\n'"@]/g, m => {
        switch (m) {
            case '"':
            case '\'':
            case '@':
                return '\\' + m
            case '\n':
                return '\\n'
            default:
                throw new Error(`unknown android escape code: ${m}`)
        }
    })
    if (value.match(/(^\s|\s$)/)) {
        value = '"' + value + '"'
    }
    return value
}
