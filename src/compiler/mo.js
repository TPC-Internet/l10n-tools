import {compilePoToMo} from '../common'

export default async function (domainName, config, poDir) {
    const targetDir = config.get('target-dir')
    await compilePoToMo(domainName, poDir, targetDir)
}
