import log from 'npmlog'
import {getSrcPaths, xgettext} from '../common.js';
import {type DomainConfig} from '../config.js';

export default async function (domainName: string, config: DomainConfig, potPath: string) {
    const srcPaths = await getSrcPaths(config, ['.py'])
    const keywords = config.getKeywords()
    log.info('extractPot', 'extracting from .py files')
    await xgettext(domainName, 'Python', keywords, potPath, srcPaths, false)
}
