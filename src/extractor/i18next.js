import log from 'npmlog'
import {getSrcPaths, xgettext} from '../common'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.js'])
    const keywords = config.get('keywords')
    log.info('extractPot', 'extracting from .js files')
    await xgettext(domainName, 'JavaScript', keywords, potPath, srcPaths, false)
}
