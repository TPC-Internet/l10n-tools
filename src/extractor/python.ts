import log from 'npmlog'
import {getSrcPaths, xgettext} from '../common'
import {DomainConfig} from '../config';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const srcPaths = await getSrcPaths(config, ['.py'])
    const keywords = config.getKeywords()
    log.info('extractPot', 'extracting from .py files')
    await xgettext(domainName, 'Python', keywords, potPath, srcPaths, false)
}
