import log from 'npmlog'
import {PotExtractor} from '../pot-extractor.js'
import * as fs from 'fs'
import * as path from 'path'
import {type DomainConfig} from '../config.js'
import {writePoFile} from '../po.js';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const resDir = config.getResDir()
    const srcPath = path.join(resDir, 'values', 'strings.xml')

    const extractor = PotExtractor.create(domainName, {})
    log.info('extractPot', 'extracting from strings.xml file')
    log.verbose('extractPot', `processing '${srcPath}'`)
    const input = fs.readFileSync(srcPath, {encoding: 'utf-8'})
    extractor.extractAndroidStringsXml(srcPath, input)
    writePoFile(potPath, extractor.po)
}
