import {type CompilerConfig, type CompilerType, type DomainConfig} from '../config.js'

export type CompilerFunc = (domainName: string, config: CompilerConfig, poDir: string) => Promise<void>

export async function compileAll (domainName: string, domainConfig: DomainConfig, poDir: string) {
    const configs = domainConfig.getCompilerConfigs()
    for (const config of configs) {
        const type = config.getType()
        const compiler = await loadCompiler(type)
        await compiler(domainName, config, poDir)
    }
}

async function loadCompiler (type: CompilerType): Promise<CompilerFunc> {
    switch (type) {
        case 'json':
        case 'vue-gettext':
            return (await import('./json.js')).default
        case 'json-dir':
        case 'i18next':
            return (await import('./json-dir.js')).default
        case 'po-json':
            return (await import('./po-json.js')).default
        case 'mo':
        case 'python':
            return (await import('./mo.js')).default
        case 'node-gettext':
            return (await import('./node-gettext.js')).default
        case 'android':
            return (await import('./android.js')).default
        case 'ios':
            return (await import('./ios.js')).default
    }
    throw new Error(`unknown compiler type: ${type}`)
}
