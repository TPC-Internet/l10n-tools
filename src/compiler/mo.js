import log from 'npmlog'
import {compilePoToMo} from '../common'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    log.info('compile', `generating mo files to '${targetDir}/{locale}/LC_MESSAGES/${domainName}.mo'`)
    await compilePoToMo(domainName, poDir, targetDir)
}
