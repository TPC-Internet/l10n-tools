import {getSrcPaths, xgettext} from '../common'

export default async function (domainName, config, potPath) {
    const srcPaths = await getSrcPaths(config, ['.py'])
    const keywords = config.get('keywords')
    await xgettext(domainName, 'Python', keywords, potPath, srcPaths, false)
}
