import {cleanupPot, compilePoToMo, getDomainSrcPaths, xgettext} from '../common'
import {getDomainConfig} from '../utils'

module.exports = {
    async extractPot(rc, domainName, potPath) {
        const srcPaths = await getDomainSrcPaths(rc, domainName, ['.py'])
        const keywords = getDomainConfig(rc, domainName, 'keywords')
        await xgettext(domainName, 'Python', keywords, potPath, srcPaths, false)
        cleanupPot(domainName, potPath)
    },

    async apply(rc, domainName, poDir) {
        const targetDir = getDomainConfig(rc, domainName, 'target-dir')
        await compilePoToMo(domainName, poDir, targetDir)
    }
}
