import fs from 'fs'
import glob from 'glob-promise'
import log from 'npmlog'
import * as shell from 'shelljs'
import * as path from 'path'
import i18nStringsFiles from 'i18n-strings-files'
import {findPoEntry, readPoFile} from '../po'
import {execWithLog, getTempDir} from "../utils"

const infoPlistKeys = [
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSUserTrackingUsageDescription'
]

export default async function (domainName, config, poDir) {
    const tempDir = path.join(getTempDir(), 'compiler')
    shell.mkdir('-p', tempDir)
    const srcDir = config.get('src-dir')

    log.info('compile', `generating .strings files`)

    const poPaths = await glob.promise(`${poDir}/*.po`)
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')

        const po = readPoFile(poPath)

        const stringsPaths = await getStringsPaths(srcDir, locale)
        for (const stringsPath of stringsPaths) {
            log.info('compile', stringsPath)
            const stringsName = path.basename(stringsPath, '.strings')
            if (stringsName === 'InfoPlist') {
                const strings = {}
                for (const key of infoPlistKeys) {
                    const poEntry = findPoEntry(po, key)
                    if (poEntry && poEntry.msgstr[0]) {
                        strings[key] = {
                            text: poEntry.msgstr[0] || poEntry.msgid
                        }
                    } else {
                        delete strings[key]
                    }
                }

                const output = compileStringsFile(strings)
                fs.writeFileSync(stringsPath, output, {encoding: 'UTF-8'})
            } else if (stringsName === 'Localizable') {
                await execWithLog(`find "${srcDir}" -name "*.swift" -print0 | xargs -0 genstrings -q -u -SwiftUI -o "${tempDir}"`)
                const strings = i18nStringsFiles.readFileSync(path.join(tempDir, 'Localizable.strings'), {encoding: 'UTF-16LE', wantsComments: true})
                for (const key of Object.keys(strings)) {
                    const poEntry = findPoEntry(po, null, key)
                    if (poEntry && poEntry.msgstr[0]) {
                        strings[key].text = poEntry.msgstr[0] || poEntry.msgid
                    } else {
                        delete strings[key]
                    }
                }

                const output = compileStringsFile(strings)
                fs.writeFileSync(stringsPath, output, {encoding: 'UTF-8'})
            } else {
                const basePath = path.dirname(path.dirname(stringsPath))
                for (const extName of ['.xib', '.storyboard']) {
                    const xibPath = path.join(basePath, 'Base.lproj', stringsName + extName)
                    if (fs.existsSync(xibPath)) {
                        const tempStringsPath = path.join(tempDir, stringsName + '.strings')
                        await execWithLog(`ibtool --export-strings-file "${tempStringsPath}" "${xibPath}"`)
                        const strings = i18nStringsFiles.readFileSync(tempStringsPath, {encoding: 'UTF-16LE', wantsComments: true})
                        for (const key of Object.keys(strings)) {
                            const poEntry = findPoEntry(po, key)
                            if (poEntry && poEntry.msgstr[0]) {
                                strings[key].text = poEntry.msgstr[0] || poEntry.msgid
                            } else {
                                delete strings[key]
                            }
                        }

                        const output = compileStringsFile(strings)
                        fs.writeFileSync(stringsPath, output, {encoding: 'UTF-8'})
                        break
                    }
                }
            }
        }
    }
    shell.rm('-rf', tempDir)
}

async function getStringsPaths(srcDir, locale) {
    const srcPattern = path.join(srcDir, '**', `${locale}.lproj`, '*.strings')
    return await glob.promise(srcPattern)
}

function compileStringsFile(data) {
    let output = "";
    for (let msgid of Object.keys(data)) {
        const val = data[msgid];
        let msgstr = '';
        let comment = null;
        if (typeof val === 'string') {
            msgstr = val;
        } else {
            if (val.hasOwnProperty('text')) {
                msgstr = val['text'];
            }
            if (val.hasOwnProperty('comment')) {
                comment = val['comment'];
            }
        }
        msgid = msgid.replace(/\\/g, "\\\\");
        msgstr = msgstr.replace(/\\/g, "\\\\");
        msgid = msgid.replace(/"/g, "\\\"");
        msgstr = msgstr.replace(/"/g, "\\\"");
        msgid = msgid.replace(/\n/g, "\\n");
        msgstr = msgstr.replace(/\r?\n/g, "\\n");
        output = output + "\n"
        if (comment) {
            output = output + "/* " + comment + " */\n";
        }
        output = output + "\"" + msgid + "\" = \"" + msgstr + "\";\n";
    }
    return output;
}
