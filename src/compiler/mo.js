import log from 'npmlog'
import {compilePoToMo} from '../common'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    log.info('compile', `generating LC_MESSAGES mo file per locale to '${targetDir}/'`)
    await compilePoToMo(domainName, poDir, targetDir)
}
