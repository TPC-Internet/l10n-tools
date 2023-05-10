import log from 'npmlog'
import { PotExtractor} from '../pot-extractor.js'
import * as fs from 'fs'
import * as path from 'path'
import i18nStringsFiles from 'i18n-strings-files'
import plist from 'plist'
import {glob} from 'glob'
import {execWithLog, getTempDir} from '../utils.js'
import shell from "shelljs"
import {type DomainConfig} from '../config.js'

const infoPlistKeys = [
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSUserTrackingUsageDescription'
]

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const tempDir = path.join(getTempDir(), 'extractor')
    shell.mkdir('-p', tempDir)

    const extractor = PotExtractor.create(domainName, {})

    log.info('extractPot', 'extracting from .swift files')
    const srcDir = config.getSrcDir()
    await execWithLog(`find "${srcDir}" -name "*.swift" -print0 | xargs -0 genstrings -q -u -SwiftUI -o "${tempDir}"`)
    const stringsPath = path.join(tempDir, 'Localizable.strings')
    const input = fs.readFileSync(stringsPath, {encoding: 'utf16le'})
    extractIosStrings(extractor, 'code', input)

    log.info('extractPot', 'extracting from info.plist')
    const infoPlistPath = await getInfoPlistPath(srcDir)
    const infoPlist = plist.parse(fs.readFileSync(infoPlistPath, {encoding: 'utf-8'}))
    for (const key of infoPlistKeys) {
        if (infoPlist.hasOwnProperty(key)) {
            // @ts-ignore
            extractor.addMessage({filename: 'info.plist', line: key}, infoPlist[key], {context: key})
        }
    }

    log.info('extractPot', 'extracting from .xib, .storyboard files')
    const xibPaths = await getXibPaths(srcDir)

    for (const xibPath of xibPaths) {
        log.verbose('extractPot', `processing '${xibPath}'`)
        const extName = path.extname(xibPath)
        const baseName = path.basename(xibPath, extName)
        const stringsPath = path.join(tempDir, `${baseName}.strings`)

        await execWithLog(`ibtool --export-strings-file "${stringsPath}" "${xibPath}"`)
        const input = fs.readFileSync(stringsPath, {encoding: 'utf16le'})
        const xibName = path.basename(xibPath)
        extractIosStrings(extractor, xibName, input)
    }

    fs.writeFileSync(potPath, extractor.toString())
    shell.rm('-rf', tempDir)
}

async function getInfoPlistPath(srcDir: string) {
    const srcPattern = path.join(srcDir, '**', 'Info.plist')
    const paths = await glob(srcPattern)
    return paths[0]
}

async function getXibPaths(srcDir: string) {
    const xibPattern = path.join(srcDir, '**', 'Base.lproj', '*.xib')
    const storyboardPattern = path.join(srcDir, '**', 'Base.lproj', '*.storyboard')
    const baseXibPaths = []
    for (const srcPattern of [xibPattern, storyboardPattern]) {
        baseXibPaths.push(...await glob(srcPattern))
    }
    return baseXibPaths
}

function extractIosStrings(extractor: PotExtractor, filename: string, src: string, startLine: number = 1) {
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

function parseComment(key: string, commentText: string | undefined) {
    let defaultValue: string | null = null
    let ignore = false

    const [, field] = key.split('.')
    if (!commentText || !field) {
        return {defaultValue, ignore}
    }

    const commentData: {[key: string]: string} = {}
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
