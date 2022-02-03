import log from 'npmlog'
import {getSrcPaths, xgettext} from '../common'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.py'])
    const keywords = config.get('keywords')
    log.info('extractPot', 'extracting from .py files')
    await xgettext(domainName, 'Python', keywords, potPath, srcPaths, false)
}
