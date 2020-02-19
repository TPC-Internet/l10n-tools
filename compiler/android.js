import fs from 'fs'
import glob from 'glob-promise'
import log from 'npmlog'
import * as shell from 'shelljs'
import * as path from 'path'
import * as xml2js from 'xml2js'
import {findPoEntry, readPoFile} from '../po'
import {promisify} from 'util'

if (!xml2js.parseStringAsync) {
    xml2js.parseStringAsync = promisify(xml2js.parseString)
}

export default async function (domainName, config, poDir) {
    const resDir = config.get('res-dir')
    const defaultLocale = config.get('default-locale', null)
    log.info('compile', `generating res files '${resDir}/values-{locale}/strings.xml'`)

    const srcPath = path.join(resDir, 'values', 'strings.xml')
    const srcInput = fs.readFileSync(srcPath, {encoding: 'UTF-8'})

    const builder = new xml2js.Builder({
        renderOpts: {pretty: true, indent: '    ', newline: '\n'},
        xmldec: {version: '1.0', encoding: 'utf-8'},
        cdata: true
    })

    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        if (locale === defaultLocale) {
            const po = readPoFile(poPath)
            const xmlJson = await xml2js.parseStringAsync(srcInput)
            for (const string of xmlJson.resources.string) {
                if (string.$.translatable === 'false') {
                    continue
                }
                const poEntry = findPoEntry(po, string.$.name, null)
                let value = poEntry.msgstr[0]
                if (value.includes('CDATA')) {
                    value = value.substring(9, value.length - 3)
                } else {
                    value = encodeAndroidStrings(value)
                }
                if (value) {
                    string._ = value
                }
            }

            const xml = builder.buildObject(xmlJson)

            shell.mkdir('-p', path.dirname(srcPath))
            fs.writeFileSync(srcPath, xml, {encoding: 'UTF-8'})
        }

        const po = readPoFile(poPath)

        const srcXmlJson = await xml2js.parseStringAsync(srcInput)
        const strings = []
        for (const string of srcXmlJson.resources.string) {
            if (string.$.translatable === 'false') {
                continue
            }
            const poEntry = findPoEntry(po, string.$.name, null)
            let value = poEntry.msgstr[0]
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

        const resLocale = locale.replace('_', '-r')
        const targetPath = path.join(resDir, 'values-' + resLocale, 'strings.xml')

    	const dstInput = fs.readFileSync(targetPath, {encoding: 'UTF-8'})
		const dstXmlJson = await xml2js.parseStringAsync(dstInput)

        dstXmlJson.resources.string = strings

        const xml = builder.buildObject(dstXmlJson)

        shell.mkdir('-p', path.dirname(targetPath))
        fs.writeFileSync(targetPath, xml, {encoding: 'UTF-8'})
    }
}

function encodeAndroidStrings(value) {
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
