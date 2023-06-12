import log from 'npmlog'
import {KeyExtractor} from '../key-extractor.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import {type DomainConfig} from '../config.js'
import {writeKeyEntries} from '../entry.js'

export default async function (domainName: string, config: DomainConfig, keysPath: string) {
    const resDir = config.getResDir()
    const srcPath = path.join(resDir, 'values', 'strings.xml')

    const extractor = new KeyExtractor({})
    log.info('extractKeys', 'extracting from strings.xml file')
    log.verbose('extractKeys', `processing '${srcPath}'`)
    const input = await fs.readFile(srcPath, {encoding: 'utf-8'})
    extractor.extractAndroidStringsXml(srcPath, input)
    await writeKeyEntries(keysPath, extractor.keys.toEntries())
}
