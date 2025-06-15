import type { CompilerConfig, CompilerType, DomainConfig } from '../config.js'

export type CompilerFunc = (domainName: string, config: CompilerConfig, transDir: string) => Promise<void>

export async function compileAll(domainName: string, domainConfig: DomainConfig, transDir: string) {
  const configs = domainConfig.getCompilerConfigs()
  for (const config of configs) {
    const type = config.getType()
    const compiler = await loadCompiler(type)
    await compiler(domainName, config, transDir)
  }
}

async function loadCompiler(type: CompilerType): Promise<CompilerFunc> {
  switch (type) {
    case 'json':
    case 'vue-gettext':
      return (await import('./json.js')).compileToJson
    case 'json-dir':
      return (await import('./json.js')).compileToJsonDir()
    case 'vue-i18n':
      return (await import('./json.js')).compileToJsonDir('vue-i18n')
    case 'node-i18n':
      return (await import('./json.js')).compileToJsonDir('node-i18n')
    case 'i18next':
      return (await import('./json.js')).compileToJsonDir('i18next')
    case 'po-json':
      return (await import('./gettext.js')).compileToPoJson
    case 'mo':
    case 'python':
      return (await import('./gettext.js')).compileToMo
    case 'node-gettext':
      return (await import('./gettext.js')).compileToPoJson
    case 'android':
      return (await import('./android.js')).compileToAndroidXml
    case 'ios':
      return (await import('./ios.js')).compileToIosStrings
  }
  throw new Error(`unknown compiler type: ${type}`)
}
