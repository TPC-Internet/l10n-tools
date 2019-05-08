export async function compileAll (domainName, domainConfig, poDir) {
    const configs = getCompilerConfigs(domainConfig)
    for (const config of configs) {
        const type = config.get('type')
        await loadCompiler(type)(domainName, config, poDir)
    }
}

function getCompilerConfigs (domainConfig) {
    const compilersConfig = domainConfig.getSubConfig('outputs')
    if (compilersConfig == null) {
        return [domainConfig]
    }
    const compilerConfigs = []
    const compilerCount = compilersConfig.getLength()
    for (let index = 0; index < compilerCount; index++) {
        compilerConfigs.push(compilersConfig.getSubConfig(index))
    }
    return compilerConfigs
}

function loadCompiler (type) {
    switch (type) {
        case 'json':
        case 'vue-gettext':
            return require('./json').default
        case 'json-dir':
        case 'i18next':
            return require('./json-dir').default
        case 'po-json':
            return require('./po-json').default
        case 'mo':
        case 'vt':
        case 'python':
            return require('./mo').default
        case 'node-gettext':
            return require('./node-gettext').default
        case 'angular-gettext':
            return require('./angular-gettext').default
        case 'android':
            return require('./android').default
        case 'cordova':
            return require('./cordova').default
        case 'cocos':
            return require('./cocos').default
        default:
            throw new Error(`unknown compiler type: ${type}`)
    }
}
