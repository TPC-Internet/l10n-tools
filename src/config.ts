import {type Command} from 'commander';
import jsonfile from 'jsonfile';
import {type SupportedPlatforms} from '@lokalise/node-api';

type L10nConf = {
    $schema?: string,
    domains: {[name: string]: DomainConf}
    /** Validation Config */
    validation?: ValidationConf
    'sync-target'?: SyncTarget
    'google-docs'?: GoogleDocsConf
    lokalise?: LokaliseConf
}

export type SyncTarget = 'google-docs' | 'lokalise'

/**
 * vue-gettext: Extract from $gettext like function, translate tag, and v-translate attrs
 * vue-i18n: Extract from $t like function, i18n, i18n-t tag, v-t attrs and more
 * typescript (javascript, react, i18next): Extract from .js, .ts, .jsx file with keyword definitions
 * python: Extract from python gettext functions
 * android: Extract from android strings.xml res files
 * ios: Extract from iOS swift files, storyboard, and xib files
 * php-gettext: Extract from php gettext functions
 */
export type DomainType =
    'vue-gettext' |
    'vue-i18n' |
    'react' |
    'javascript' |
    'typescript' |
    'i18next' |
    'python' |
    'android' |
    'ios' |
    'php-gettext'

type DomainConf =  {
    type: DomainType
    /**
     * Extracting function name and index of key argument list
     * @examples ["translate:1", "translateAll:0"]
     */
    keywords?: string[]
    /** Tag name for upload and download */
    tag: string
    /** Locales to translate */
    locales: string[]
    /** Fill translations from fallback locale if not exists */
    'fallback-locale'?: string
    /** Location to save po files */
    'i18n-dir': string
    /** Location of source root (ios only) */
    'src-dir'?: string
    /**
     * List of location of source root.
     * Used with src-patterns
     */
    'src-dirs'?: string[]
    /**
     * List of glob patterns of location of source root
     * Used with src-dirs
     */
    'src-patterns'?: string[]
    /** Location of res (android only) */
    'res-dir'?: string
    /** Lokalise platform to use */
    'lokalise-platform'?: SupportedPlatforms
    /** List of output formats */
    outputs: CompilerConf[]
}

export class L10nConfig {
    private readonly rc: L10nConf
    constructor (rc: any) {
        this.rc = rc
    }

    getDomainNames(): string[] {
        return Object.keys(this.rc.domains)
    }

    getDomainConfig(domain: string): DomainConfig | null {
        const conf = this.rc.domains[domain]
        if (conf == null) {
            return null
        }
        return new DomainConfig(conf)
    }

    getValidationConfig(program: Command): ValidationConfig {
        const opts: ValidationConf = {
            'base-locale': program.opts().validationBaseLocale,
            skip: program.opts().skipValidation
        }
        return new ValidationConfig(this.rc.validation, opts)
    }

    getSyncTarget(): SyncTarget {
        return this.rc['sync-target'] ?? 'google-docs'
    }

    getGoogleDocsConfig(): GoogleDocsConfig {
        const gdc = this.rc['google-docs']
        if (gdc == null) {
            throw new Error('no google-docs in rc')
        }
        return new GoogleDocsConfig(gdc)
    }

    getLokaliseConfig(): LokaliseConfig {
        const lc = this.rc['lokalise']
        if (lc == null) {
            throw new Error('no lokalise in rc')
        }
        return new LokaliseConfig(lc)
    }
}

export class DomainConfig {
    private readonly dc: DomainConf
    constructor(dc: DomainConf) {
        this.dc = dc
    }

    getType(): DomainType {
        return this.dc['type']
    }

    getTag(): string {
        return this.dc['tag']
    }

    getLocales(): string[] {
        return this.dc['locales']
    }

    getFallbackLocale(): string | undefined {
        return this.dc['fallback-locale']
    }

    getKeywords(): string[] {
        return this.dc['keywords'] ?? []
    }

    getI18nDir(): string {
        return this.dc['i18n-dir']
    }

    // for ios only
    getSrcDir(): string {
        const srcDir = this.dc['src-dir']
        if (srcDir == null) {
            throw new Error('src-dir is required for this domain')
        }
        return srcDir
    }

    getSrcDirs(): string[] {
        return this.dc['src-dirs'] ?? []
    }

    getSrcPatterns(): string[] {
        return this.dc['src-patterns'] ?? []
    }

    // for android only
    getResDir(): string {
        const resDir = this.dc['res-dir']
        if (resDir == null) {
            throw new Error('res-dir is required for this output')
        }
        return resDir
    }

    getLokalisePlatform(): SupportedPlatforms {
        const platform = this.dc['lokalise-platform']
        if (platform == null) {
            throw new Error('lokalise-platform is required')
        }
        return platform
    }

    getCompilerConfigs(): CompilerConfig[] {
        return this.dc['outputs'].map(output => new CompilerConfig(output)) ?? []
    }
}

/**
 * json (vue-gettext): Single JSON all locales merged
 * json-dir (i18next): JSON file per locale
 * po-json: JSON PO file per locale
 * mo (python): MO file per locale
 * node-gettext: PO file per locale
 * android: Generate Android strings.xml
 * ios: Merge into iOS strings file
 */
export type CompilerType =
    'json' |
    'vue-gettext' |
    'json-dir' |
    'i18next' |
    'po-json' |
    'mo' |
    'python' |
    'node-gettext' |
    'android' |
    'ios'
type CompilerConf = {
    type: CompilerType
    /** Location of JSON files to be saved (json-dir, po-json, mo, node-gettext) */
    'target-dir'?: string
    /** Path of JSON file to be saved (json) */
    'target-path'?: string
    /** Location of source root (ios) */
    'src-dir'?: string
    /** Location of res (android) */
    'res-dir'?: string
    'default-locale'?: string
    /** Use locale as root key of json file if true (json-dir) */
    'use-locale-key'?: boolean
    /** If specified, split key to object with separator (json-dir) */
    'key-separator'?: string
}

export class CompilerConfig {
    private readonly cc: CompilerConf
    constructor(cc: CompilerConf) {
        this.cc = cc
    }

    getType(): CompilerType {
        return this.cc.type
    }

    // for ios only
    getSrcDir(): string {
        const srcDir = this.cc['src-dir']
        if (srcDir == null) {
            throw new Error('src-dir is required for this output')
        }
        return srcDir
    }

    getTargetDir(): string {
        const targetDir = this.cc['target-dir']
        if (targetDir == null) {
            throw new Error('target-dir is required for this output')
        }
        return targetDir
    }

    getTargetPath(): string {
        const targetPath = this.cc['target-path']
        if (targetPath == null) {
            throw new Error('target-path is required for this output')
        }
        return targetPath
    }

    // for android only
    getResDir(): string {
        const resDir = this.cc['res-dir']
        if (resDir == null) {
            throw new Error('res-dir is required for this output')
        }
        return resDir
    }

    getDefaultLocale(): string | undefined {
        return this.cc['default-locale']
    }

    useLocaleKey(): boolean {
        return this.cc['use-locale-key'] ?? false
    }

    getKeySeparator(): string | null {
        return this.cc['key-separator'] ?? null
    }
}

type ValidationConf = {
    /** If true, do not stop script on error occurs */
    skip?: boolean,
    /** Which locale is base text for validation (use key if not specified) */
    'base-locale'?: string
}

export class ValidationConfig {
    private readonly vc: ValidationConf | undefined
    private readonly opts: ValidationConf
    constructor(vc: ValidationConf | undefined, opts: ValidationConf) {
        this.vc = vc
        this.opts = opts
    }

    getBaseLocale(): string | null {
        return this.opts['base-locale'] ?? this.vc?.['base-locale'] ?? null
    }

    getSkip(): boolean {
        return this.opts['skip'] ?? this.vc?.['skip'] ?? false
    }
}

type GoogleDocsConf = {
    'doc-id'?: string
    'doc-name'?: string
    'sheet-name': string
    'client-secret-path'?: string
    'client-id'?: string
    'client-secret'?: string
}

export type GoogleCredentials = {
    clientId: string
    clientSecret: string
}

export class GoogleDocsConfig {
    private readonly gdc: GoogleDocsConf
    constructor(gdc: GoogleDocsConf) {
        this.gdc = gdc
    }

    getDocId(): string | undefined {
        return this.gdc['doc-id']
    }

    getDocName(): string | undefined {
        return this.gdc['doc-name']
    }

    getSheetName(): string {
        return this.gdc['sheet-name']
    }

    getCredentials(): GoogleCredentials {
        const clientSecretPath = this.gdc['client-secret-path']
        if (clientSecretPath != null) {
            return jsonfile.readFileSync(clientSecretPath)['installed']
        }
        const clientId = this.gdc['client-id']
        const clientSecret = this.gdc['client-secret']
        if (clientId != null && clientSecret != null) {
            return {clientId, clientSecret}
        }
        throw new Error('no client-secret for google-docs')
    }
}

type LokaliseConf = {
    token: string
    projectId: string
}

export class LokaliseConfig {
    private readonly lc: LokaliseConf
    constructor(lc: LokaliseConf) {
        this.lc = lc
    }

    getToken(): string {
        return this.lc['token']
    }

    getProjectId(): string {
        return this.lc['projectId']
    }
}
