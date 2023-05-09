#!/usr/bin/env node

import {Command} from 'commander'
import log from 'npmlog'
import {checkPoEntrySpecs, getPoEntriesFromFile, getPoEntryFlag} from './po.js'
import {getTempDir} from './utils.js'
import {mergeFallbackLocale, updatePo} from './common.js'
import * as shell from 'shelljs'
import {syncPoToGoogleDocs} from './google-docs-syncer.js'
import * as path from 'path'
import {DomainConfig, L10nConfig} from './config.js'
import {extractPot} from './extractor/index.js'
import {compileAll} from './compiler/index.js'
import * as fs from 'fs'
import {cosmiconfig} from 'cosmiconfig'
import {fileURLToPath} from 'url';

const program = new Command('l10n-tools')
const explorer = cosmiconfig('l10n')

async function run () {
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(fs.readFileSync(path.join(dirname, '..', 'package.json'), 'utf-8'))
    program.version(pkg.version)
        .description(pkg.description)
        .option('-r, --rcfile <rcfile>', '설정 파일 지정, 기본값은 .l10nrc')
        .option('-d, --domains <domains>', '적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)', val => val.split(','))
        .option('-s, --skip-validation', 'Skip format validation')
        .option('-b, --validation-base-locale <locale>', 'Use msgstr of locale as validation base, default to msgid')
        .option('-v, --verbose', 'log verbose')
        .option('-q, --quiet', '조용히')
        .on('--help', () => {
            console.info('\nRC file:\n  Refer [L10nConf] type or see \'l10nrc.schema.json\'')
        })

    program.command('update')
        .description('로컬 번역 업데이트')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.getI18nDir()
                const locales = domainConfig.getLocales()
                const fallbackLocale = domainConfig.getFallbackLocale()
                const validationConfig = config.getValidationConfig(program)

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, poDir, poDir, locales, validationConfig)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await compileAll(domainName, domainConfig, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await compileAll(domainName, domainConfig, poDir)
                }
            })
        })

    program.command('upload')
        .description('로컬 소스 변경사항을 Google Docs 에 업로드 (로컬 번역 파일은 건드리지 않음)')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.getI18nDir()
                const locales = domainConfig.getLocales()
                const tag = domainConfig.getTag()
                const validationConfig = config.getValidationConfig(program)

                const fromPoDir = path.join(i18nDir, domainName)
                const tempDir = path.join(getTempDir(), domainName)
                const potPath = path.join(tempDir, 'template.pot')
                const poDir = tempDir

                log.info('l10n', `temp dir: '${tempDir}'`)
                shell.rm('-rf', tempDir)
                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, fromPoDir, poDir, locales, validationConfig)
                await syncPoToGoogleDocs(config, domainConfig, tag, potPath, poDir)
                shell.rm('-rf', tempDir)
            })
        })

    program.command('sync')
        .description('로컬 소스와 Google Docs 간 싱크')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.getI18nDir()
                const locales = domainConfig.getLocales()
                const fallbackLocale = domainConfig.getFallbackLocale()
                const tag = domainConfig.getTag()
                const validationConfig = config.getValidationConfig(program)

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, poDir, poDir, locales, null)
                await syncPoToGoogleDocs(config, domainConfig, tag, potPath, poDir)
                updatePo(potPath, poDir, poDir, locales, validationConfig)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await compileAll(domainName, domainConfig, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await compileAll(domainName, domainConfig, poDir)
                }
            })
        })

    program.command('check')
        .description('전체 번역 여부 검사')
        .option('-l, --locales [locales]', '검사한 로케일 (콤마로 나열 가능, 없으면 전체)')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.getI18nDir()
                const locales = opts.locales ? opts.locales.split(',') : domainConfig.getLocales()
                const validationConfig = config.getValidationConfig(program)

                const specs = ['untranslated']
                const fromPoDir = path.join(i18nDir, domainName)
                const tempDir = path.join(getTempDir(), domainName)
                const potPath = path.join(tempDir, 'template.pot')
                const poDir = tempDir

                log.info('l10n', `temp dir: '${tempDir}'`)
                shell.rm('-rf', tempDir)
                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, fromPoDir, poDir, locales, validationConfig)

                for (const locale of locales) {
                    const poPath = path.join(poDir, locale + '.po')
                    for (const poEntry of getPoEntriesFromFile(poPath)) {
                        if (!checkPoEntrySpecs(poEntry, specs)) {
                            continue
                        }
                        process.exitCode = 1

                        process.stdout.write(`[${locale}] ${specs.join(',')}\n`)
                        const flag = getPoEntryFlag(poEntry)
                        if (flag) {
                            process.stdout.write(`#, ${flag}\n`)
                        }
                        if (poEntry.msgctxt) {
                            process.stdout.write(`msgctxt "${poEntry.msgctxt.replace(/\n/g, '\\n')}"\n`)
                        }
                        process.stdout.write(`msgid   "${poEntry.msgid.replace(/\n/g, '\\n')}"\n`)
                        process.stdout.write(`msgstr  "${poEntry.msgstr[0].replace(/\n/g, '\\n')}"\n\n`)
                    }
                }

                shell.rm('-rf', tempDir)
            })
        })

    program.command('_extractPot')
        .description('[고급] 소스에서 번역 추출하여 pot 파일 작성')
        .option('--potdir [potdir]', '설정한 위치에 pot 파일 추출')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = opts.potdir || domainConfig.getI18nDir()
                const potPath = path.join(i18nDir, domainName, 'template.pot')

                await extractPot(domainName, domainConfig, potPath)
            })
        })

    program.command('_updatePo')
        .description('[고급] pot 파일에서 po 파일 업데이트')
        .option('-l, --locales [locales]', '설정한 로케일만 업데이트 (콤마로 나열 가능)')
        .option('--potdir [potdir]', '설정한 위치에 있는 pot 파일에서 추출')
        .option('--podir [podir]', '설정한 위치에 업데이트된 po 파일 저장')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.getI18nDir()
                const locales = opts.locales ? opts.locales.split(',') : domainConfig.getLocales()
                config.getValidationConfig(program)
                const validationConfig = config.getValidationConfig(program)

                const potPath = path.join(opts.potdir || i18nDir, domainName, 'template.pot')
                const fromPoDir = path.join(i18nDir, domainName)
                const poDir = path.join(opts.podir || i18nDir, domainName)

                updatePo(potPath, fromPoDir, poDir, locales, validationConfig)
            })
        })

    program.command('_count')
        .description('[고급] 번역 항목 갯수 세기')
        .option('--podir [podir]', '설정한 위치에 있는 po 항목 세기')
        .option('-l, --locales [locales]', '갯수를 셀 로케일 (콤마로 나열 가능)')
        .option('-s, --spec [spec]', '어떤 것을 셀지 지정 (필수, 콤마로 나열하면 모든 조건 체크, !로 시작하면 반대) 지원: total,translated,untranslated,<flag>')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.getI18nDir()
                const locales: string[] = opts.locales ? opts.locales.split(',') : domainConfig.getLocales()
                const specs = opts.spec ? opts.spec.split(',') : ['total']

                const poDir = path.join(opts.podir || i18nDir, domainName)
                const counts = locales.map(locale => {
                    const poPath = path.join(poDir, locale + '.po')
                    let count = 0
                    for (const poEntry of getPoEntriesFromFile(poPath)) {
                        if (checkPoEntrySpecs(poEntry, specs)) {
                            count++
                        }
                    }
                    return locale + ':' + count
                })
                process.stdout.write(`${domainName},${counts.join(',')}\n`)
            })
        })

    program.command('_cat')
        .description('[고급] 번역 항목 표시')
        .option('--podir [podir]', '설정한 위치에 있는 po 항목 표시')
        .option('-l, --locale [locale]', '표시할 로케일 (필수)')
        .option('-s, --spec [spec]', '어떤 것을 표시할지 지정 (필수, 콤마로 나열하면 모든 조건 체크, !로 시작하면 반대) 지원: total,translated,untranslated,<flag>')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                if (!opts.locale) {
                    cmd.help()
                }

                const i18nDir = domainConfig.getI18nDir()
                const locale = opts.locale
                const specs = opts.spec ? opts.spec.split(',') : ['total']

                const poDir = path.join(opts.podir || i18nDir, domainName)
                const poPath = path.join(poDir, locale + '.po')

                for (const poEntry of getPoEntriesFromFile(poPath)) {
                    if (!checkPoEntrySpecs(poEntry, specs)) {
                        continue
                    }

                    const flag = getPoEntryFlag(poEntry)
                    if (flag) {
                        process.stdout.write(`#, ${flag}\n`)
                    }
                    if (poEntry.msgctxt) {
                        process.stdout.write(`msgctxt "${poEntry.msgctxt.replace(/\n/g, '\\n')}"\n`)
                    }
                    process.stdout.write(`msgid   "${poEntry.msgid.replace(/\n/g, '\\n')}"\n`)
                    process.stdout.write(`msgstr  "${poEntry.msgstr[0].replace(/\n/g, '\\n')}"\n\n`)
                }
            })
        })

    program.command('_compile')
        .description('[고급] PO 파일에서 번역 에셋 작성')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.getI18nDir()
                const fallbackLocale = domainConfig.getFallbackLocale()

                const poDir = path.join(i18nDir, domainName)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await compileAll(domainName, domainConfig, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await compileAll(domainName, domainConfig, poDir)
                }
            })
        })

    program.command('_sync')
        .description('[고급] PO 파일 Google Docs 싱크')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const tag = domainConfig.getTag()
                const i18nDir = domainConfig.getI18nDir()

                const poDir = path.join(i18nDir, domainName)
                const potPath = path.join(i18nDir, domainName, 'template.pot')

                await syncPoToGoogleDocs(config, domainConfig, tag, potPath, poDir)
            })
        })

    program.parse(process.argv)
}

async function runSubCommand(cmdName: string, action: (domainName: string, config: L10nConfig, domainConfig: DomainConfig) => Promise<void>) {
    log.heading = cmdName

    const globalOpts = program.opts()
    if (globalOpts.verbose) {
        log.level = 'silly'
    } else if (globalOpts.quiet) {
        log.level = 'warn'
    }

    const rc = await explorer.load(globalOpts.rcfile || '.l10nrc')
    const config = new L10nConfig(rc?.config)
    const domainNames = globalOpts.domains || Object.keys(config.getDomainNames())

    for (const domainName of domainNames) {
        const domainConfig = config.getDomainConfig(domainName)
        if (domainConfig == null) {
            log.error(cmdName, `no config found for domain ${domainName}`)
            process.exit(1)
        }
        log.heading = `[${domainName}] ${cmdName}`
        await action(domainName, config, domainConfig)
    }
}

try {
    await run()
} catch (err) {
    log.error('l10n', 'run failed', err)
    process.exit(1)
}
