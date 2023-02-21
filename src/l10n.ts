#!/usr/bin/env node

import {Command} from 'commander'
import log from 'npmlog'
import {checkPoEntrySpecs, getPoEntriesFromFile, getPoEntryFlag} from './po'
import {getTempDir} from './utils'
import {mergeFallbackLocale, updatePo} from './common'
import * as shell from 'shelljs'
import {syncPoToGoogleDocs} from './google-docs-syncer'
import * as path from 'path'
import {Config} from './config'
import {extractPot} from './extractor'
import {compileAll} from './compiler'
import * as fs from 'fs'
import {cosmiconfig} from 'cosmiconfig'
import commander from 'commander'

const program = new Command('l10n-tools')
const explorer = cosmiconfig('l10n')

async function run () {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))
    let cmd: commander.Command | null = null
    program.version(pkg.version)
        .description(pkg.description)
        .option('-r, --rcfile [rcfile]', '설정 파일 지정, 기본값은 .l10nrc')
        .option('-d, --domains [domains]', '적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)', val => val.split(','))
        .option('-v, --verbose', 'log verbose')
        .option('-q, --quiet', '조용히')
        .on('--help', () => {
            console.info(`

  설정 파일 항목:

    [도메인]
      domains.[domain]                  번역 파일을 생성하는 단위
      domains.[domain].tag              구글 시트 동기화시 tag 항목으로 들어갈 값
      domains.[domain].locales          번역할 로케일 목록
      domains.[domain].fallback-locale  번역이 없을 경우 참조할 로케일 (옵션)
      domains.[domain].i18n-dir         pot 파일과 po 파일을 저장할 위치
      domains.[domain].src-dirs         번역을 추출할 소스 디렉토리 목록
      domains.[domain].src-patterns     번역을 추출할 소스의 glob 패턴 목록
      
    [extractor]
      domains.[domain].type      extractor 종류 (vue-gettext, i18next, vt, python, angular-gettext, cordova)
      domains.[domain].keywords  번역에 사용하는 함수 이름 목록 (i18next, vt, python)

    [compiler]
      domains.[domain].outputs[n].type         compiler 종류 (mo, json, json-dir, angular-gettext, cordova)
      domains.[domain].outputs[n].target-path  번역 결과를 저장할 파일 이름 (json)
      domains.[domain].outputs[n].target-dir   번역 결과를 로케일 별 파일로 저장할 위치 (mo, json-dir, angular-gettext, cordova)
      domains.[domain].outputs[n].use-locale-key  결과에 locale 키를 사용할지 결정 (json-dir)
      domains.[domain].outputs[n].base-locale  번역 id로 사용할 로케일 (cordova)
      
      domains.[domain].outputs 가 없을 경우 domains.[domain] 영역에서 compiler 설정 가져옴
      이 경우 extractor type에 따른 기본 compiler type:
      
      - vue-gettext: json
      - i18next: json-dir
      - vt, python: mo 
      
    [구글 문서 동기화]
      google-docs.doc-name                     동기화에 사용할 구글 문서 이름
      google-docs.sheet-name                   동기화에 사용할 구글 문서 내 시트 이름
      domains.[domain].google-docs.sheet-name  도메인 별로 동기화에 사용할 구글 문서 내 시트 이름
      google-docs.client-secret-path           구글 문서 동기화 API 호출시 사용할 secret 파일 위치`)
        })

    program.command('update')
        .description('로컬 번역 업데이트')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.get<string>('i18n-dir')
                const locales = domainConfig.get<string[]>('locales')
                const fallbackLocale = domainConfig.get<string | null>('fallback-locale', null)

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, poDir, poDir, locales)

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
                const i18nDir = domainConfig.get<string>('i18n-dir')
                const locales = domainConfig.get<string[]>('locales')
                const tag = domainConfig.get('tag')

                const fromPoDir = path.join(i18nDir, domainName)
                const tempDir = path.join(getTempDir(), domainName)
                const potPath = path.join(tempDir, 'template.pot')
                const poDir = tempDir

                log.info('l10n', `temp dir: '${tempDir}'`)
                shell.rm('-rf', tempDir)
                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, fromPoDir, poDir, locales)
                await syncPoToGoogleDocs(config, domainConfig, tag, potPath, poDir)
                shell.rm('-rf', tempDir)
            })
        })

    program.command('sync')
        .description('로컬 소스와 Google Docs 간 싱크')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.get<string>('i18n-dir')
                const locales = domainConfig.get<string[]>('locales', [])
                const fallbackLocale = domainConfig.get('fallback-locale', null)
                const tag = domainConfig.get('tag')

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, poDir, poDir, locales)
                await syncPoToGoogleDocs(config, domainConfig, tag, potPath, poDir)
                updatePo(potPath, poDir, poDir, locales)

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
                const i18nDir = domainConfig.get<string>('i18n-dir')
                const locales = opts.locales ? opts.locales.split(',') : domainConfig.get('locales')

                const specs = ['untranslated']
                const fromPoDir = path.join(i18nDir, domainName)
                const tempDir = path.join(getTempDir(), domainName)
                const potPath = path.join(tempDir, 'template.pot')
                const poDir = tempDir

                log.info('l10n', `temp dir: '${tempDir}'`)
                shell.rm('-rf', tempDir)
                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, fromPoDir, poDir, locales)

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
                const i18nDir = opts.potdir || domainConfig.get('i18n-dir')
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
                const i18nDir = domainConfig.get<string>('i18n-dir')
                const locales = opts.locales ? opts.locales.split(',') : domainConfig.get<string[]>('locales')

                const potPath = path.join(opts.potdir || i18nDir, domainName, 'template.pot')
                const fromPoDir = path.join(i18nDir, domainName)
                const poDir = path.join(opts.podir || i18nDir, domainName)

                updatePo(potPath, fromPoDir, poDir, locales)
            })
        })

    program.command('_count')
        .description('[고급] 번역 항목 갯수 세기')
        .option('--podir [podir]', '설정한 위치에 있는 po 항목 세기')
        .option('-l, --locales [locales]', '갯수를 셀 로케일 (콤마로 나열 가능)')
        .option('-s, --spec [spec]', '어떤 것을 셀지 지정 (필수, 콤마로 나열하면 모든 조건 체크, !로 시작하면 반대) 지원: total,translated,untranslated,<flag>')
        .action(async (opts, cmd) => {
            await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
                const i18nDir = domainConfig.get('i18n-dir')
                const locales: string[] = opts.locales ? opts.locales.split(',') : domainConfig.get('locales')
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

                const i18nDir = domainConfig.get('i18n-dir')
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
                const i18nDir = domainConfig.get<string>('i18n-dir')
                const fallbackLocale = domainConfig.get<string | null>('fallback-locale', null)

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
                const tag = domainConfig.get('tag')
                const i18nDir = domainConfig.get<string>('i18n-dir')

                const poDir = path.join(i18nDir, domainName)
                const potPath = path.join(i18nDir, domainName, 'template.pot')

                await syncPoToGoogleDocs(config, domainConfig, tag, potPath, poDir)
            })
        })

    program.parse(process.argv)
}

async function runSubCommand(cmdName: string, action: (domainName: string, config: Config, domainConfig: Config) => Promise<void>) {
    log.heading = cmdName

    const globalOpts = program.opts()
    if (globalOpts.verbose) {
        log.level = 'silly'
    } else if (globalOpts.quiet) {
        log.level = 'warn'
    }

    const rc = await explorer.load(globalOpts.rcfile || '.l10nrc')
    const config = new Config(rc?.config)
    const domainNames = globalOpts.domains || Object.keys(config.get('domains'))

    for (const domainName of domainNames) {
        const domainConfig = config.getSubConfig(['domains', domainName])
        if (domainConfig == null) {
            log.error(cmdName, `no config found for domain ${domainName}`)
            process.exit(1)
        }
        log.heading = `[${domainName}] ${cmdName}`
        await action(domainName, config, domainConfig)
    }
}

run().catch(err => {
    if (err) {
        log.error('l10n', err)
    }
    process.exit(1)
})
