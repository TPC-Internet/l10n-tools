import log from 'npmlog'
import { PotExtractor} from '../pot-extractor'
import * as fs from 'fs'
import * as path from 'path'
import i18nStringsFiles from 'i18n-strings-files'
import plist from 'plist'
import glob from "glob-promise"
import {execWithLog, getTempDir} from "../utils"
import * as shell from "shelljs"
import jsonfile from "jsonfile"

const infoPlistKeys = [
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSUserTrackingUsageDescription'
]

export default async function (domainName, config, potPath) {
    const tempDir = path.join(getTempDir(), 'extractor')
    shell.mkdir('-p', tempDir)

    const extractor = PotExtractor.create(domainName)

    log.info('extractPot', 'extracting from .swift files')
    const swiftExtractorCmd = path.join(path.dirname(__dirname), '..', 'bin', 'swift-l10n-extractor')
    const srcDir = config.get('src-dir')
    try {
        const swiftEntriesPath = `${tempDir}/swift-entries.json`
        await execWithLog(`find "${srcDir}" -name "*.swift" -print0 | xargs -0 "${swiftExtractorCmd}" -o "${swiftEntriesPath}"`)
        const swiftEntries = jsonfile.readFileSync(swiftEntriesPath)
        extractSwiftEntries(extractor, srcDir, swiftEntries)
    } catch (err) {
        log.info('extractPot', 'failed to run swift-l10n-extractor. fallback to genstrings')
        await execWithLog(`find "${srcDir}" -name "*.swift" -print0 | xargs -0 genstrings -q -u -o "${tempDir}"`)
        const stringsPath = path.join(tempDir, 'Localizable.strings')
        const input = fs.readFileSync(stringsPath, {encoding: 'UTF-16LE'})
        extractIosStrings(extractor, 'code', input)
    }

    log.info('extractPot', 'extracting from info.plist')
    const infoPlistPath = await getInfoPlistPath(srcDir)
    const infoPlist = plist.parse(fs.readFileSync(infoPlistPath, {encoding: 'UTF-8'}))
    for (const key of infoPlistKeys) {
        if (infoPlist.hasOwnProperty(key)) {
            extractor.addMessage({filename: 'info.plist', line: key}, infoPlist[key], {context: key})
        }
    }

    log.info('extractPot', 'extracting from .xib, .storyboard files')
    const xibPaths = await getXibPaths(config.get('src-dir'))

    for (const xibPath of xibPaths) {
        log.verbose('extractPot', `processing '${xibPath}'`)
        const extName = path.extname(xibPath)
        const baseName = path.basename(xibPath, extName)
        const stringsPath = path.join(tempDir, `${baseName}.strings`)

        await execWithLog(`ibtool --export-strings-file "${stringsPath}" "${xibPath}"`)
        const input = fs.readFileSync(stringsPath, {encoding: 'UTF-16LE'})
        const xibName = path.basename(xibPath)
        extractIosStrings(extractor, xibName, input)
    }

    fs.writeFileSync(potPath, extractor.toString())
    shell.rm('-rf', tempDir)
}

async function getInfoPlistPath(srcDir) {
    const srcPattern = path.join(srcDir, '**', 'Info.plist')
    const paths = await glob.promise(srcPattern)
    return paths[0]
}

async function getXibPaths(srcDir) {
    const xibPattern = path.join(srcDir, '**', 'Base.lproj', '*.xib')
    const storyboardPattern = path.join(srcDir, '**', 'Base.lproj', '*.storyboard')
    const baseXibPaths = []
    for (const srcPattern of [xibPattern, storyboardPattern]) {
        baseXibPaths.push(...await glob.promise(srcPattern))
    }
    return baseXibPaths
}

function extractIosStrings(extractor, filename, src, startLine = 1) {
    const data = i18nStringsFiles.parse(src, true)
    for (const [key, value] of Object.entries(data)) {
        const {defaultValue, ignore} = parseComment(key, value.comment)
        if (ignore) {
            continue
        }

        const id = value.text.trim()
        if (!id) {
            continue
        }
        if (defaultValue) {
            extractor.addMessage({filename, line: key}, defaultValue, {comment: value.comment, context: key})
        } else {
            extractor.addMessage({filename, line: key}, key, {comment: value.comment})
        }
    }
}

function extractSwiftEntries(extractor, srcDir, swiftEntries) {
    for (const entry of swiftEntries) {
        const {context, id, comment, file, line} = entry
        let filename
        if (file && file.startsWith(srcDir)) {
            filename = file.substr(srcDir.length + 1)
        } else {
            filename = null
        }
        extractor.addMessage({filename, line}, id, {comment, context})
    }
}

function parseComment(key, commentText) {
    let defaultValue = null
    let ignore = false

    const [, field] = key.split('.')
    if (!field) {
        return {defaultValue, ignore}
    }

    const commentData = {}
    const re = /\s*([^ ]+)\s*=\s*(".*?");/gmsui
    let match = null
    while (match = re.exec(commentText)) {
        commentData[match[1]] = match[2]
    }

    if (commentData['Note']) {
        ignore = commentData['Note'].indexOf('#vv-ignore') >= 0
    }

    if (commentData['Class'] === '"UITextView"' && commentData['text'] && !ignore) {
        log.warn('extractPot', `${key}: UITextView.text does not support Storyboard (xib) localization.`)
        log.warn('extractPot', 'Consider localizing by code or note #vv-ignore to mute this warning')
    }

    if (commentData[key]) {
        defaultValue = JSON.parse(commentData[key])
    } else if (commentData[field]) {
        defaultValue = JSON.parse(commentData[field])
    }

    return {defaultValue, ignore}
}
