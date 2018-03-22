import globToRegExp from 'glob-to-regexp'

export async function applyFilter (domainName, domainConfig, path, src) {
    const configs = getFilterConfigs(domainConfig)
    for (const config of configs) {
        const srcPatterns = config.get('src-patterns')
        const apply = srcPatterns.some(srcPattern => {
            const re = globToRegExp(srcPattern, {globstar: true})
            return re.test(path)
        })

        if (apply) {
            const type = config.get('type')
            src = await loadFilter(type)(domainName, config, src)
        }
    }
    return src
}

function getFilterConfigs (domainConfig) {
    const filtersConfig = domainConfig.getSubConfig('filters')
    if (filtersConfig == null) {
        return []
    }
    const filterConfigs = []
    const filterCount = filtersConfig.getLength()
    for (let index = 0; index < filterCount; index++) {
        filterConfigs.push(filtersConfig.getSubConfig(index))
    }
    return filterConfigs
}

function loadFilter (type) {
    switch (type) {
        case 'strip-vt':
            return require('./strip-vt').default
        case 'strip-jinja':
            return require('./strip-jinja').default
        default:
            throw new Error(`unknown filter type: ${type}`)
    }
}
