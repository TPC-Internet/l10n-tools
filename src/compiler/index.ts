import {CompilerConfig, CompilerType, DomainConfig} from '../config';

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
            return (await import('./json')).default
        case 'json-dir':
        case 'i18next':
            return (await import('./json-dir')).default
        case 'po-json':
            return (await import('./po-json')).default
        case 'mo':
        case 'python':
            return (await import('./mo')).default
        case 'node-gettext':
            return (await import('./node-gettext')).default
        case 'android':
            return (await import('./android')).default
        case 'ios':
            return (await import('./ios')).default
    }
    throw new Error(`unknown compiler type: ${type}`)
}
