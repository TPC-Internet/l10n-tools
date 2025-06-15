#!/usr/bin/env node

import { Command } from 'commander'
import log from 'npmlog'
import { checkTransEntrySpecs, readTransEntries } from './entry.js'
import { fileExists, getKeysPath, getTransPath } from './utils.js'
import { updateTrans } from './common.js'
import { syncTransToTarget } from './syncer/index.js'
import * as path from 'path'
import { type DomainConfig, L10nConfig } from './config.js'
import { extractKeys } from './extractor/index.js'
import { compileAll } from './compiler/index.js'
import fsp from 'node:fs/promises'
import { cosmiconfig } from 'cosmiconfig'
import { fileURLToPath } from 'url'
import { Ajv } from 'ajv'

const program = new Command('l10n-tools')
const dirname = path.dirname(fileURLToPath(import.meta.url))

async function run() {
  const pkg = JSON.parse(await fsp.readFile(path.join(dirname, '..', 'package.json'), { encoding: 'utf-8' }))
  program.version(pkg.version)
    .description(pkg.description)
    .option('-r, --rcfile <rcfile>', '설정 파일 지정, 기본값은 .l10nrc')
    .option('-d, --domains <domains>', '적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)', val => val.split(','))
    .option('-s, --skip-validation', 'Skip format validation')
    .option('-b, --validation-base-locale <locale>', 'Use msgstr of locale as validation base, default to msgid')
    .option('-n, --dry-sync', 'skip actual sync')
    .option('-v, --verbose', 'log verbose')
    .option('-q, --quiet', '조용히')
    .on('--help', () => {
      console.info('\nRC file:\n  Refer [L10nConf] type or see \'l10nrc.schema.json\'')
    })

  program.command('update')
    .description('Update local translations')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
        const cacheDir = domainConfig.getCacheDir()
        const locales = domainConfig.getLocales()
        const validationConfig = config.getValidationConfig(program)

        const keysPath = getKeysPath(path.join(cacheDir, domainName))
        const transDir = path.join(cacheDir, domainName)

        await extractKeys(domainName, domainConfig, keysPath)
        await updateTrans(keysPath, transDir, transDir, locales, validationConfig)

        await compileAll(domainName, domainConfig, transDir)
      })
    })

  program.command('upload')
    .description('Upload local changes to sync target (local files will not touched)')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig, drySync) => {
        const cacheDir = domainConfig.getCacheDir()
        const locales = domainConfig.getLocales()
        const tag = domainConfig.getTag()
        const validationConfig = config.getValidationConfig(program)

        const keysPath = getKeysPath(path.join(cacheDir, domainName))
        const transDir = path.join(cacheDir, domainName)

        await extractKeys(domainName, domainConfig, keysPath)
        await updateTrans(keysPath, transDir, transDir, locales, null)
        await syncTransToTarget(config, domainConfig, tag, keysPath, transDir, drySync)
        await updateTrans(keysPath, transDir, transDir, locales, validationConfig)
      })
    })

  program.command('sync')
    .description('Synchronize local translations and sync target')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig, drySync) => {
        const cacheDir = domainConfig.getCacheDir()
        const locales = domainConfig.getLocales()
        const tag = domainConfig.getTag()
        const validationConfig = config.getValidationConfig(program)

        const keysPath = getKeysPath(path.join(cacheDir, domainName))
        const transDir = path.join(cacheDir, domainName)

        await extractKeys(domainName, domainConfig, keysPath)
        await updateTrans(keysPath, transDir, transDir, locales, null)
        await syncTransToTarget(config, domainConfig, tag, keysPath, transDir, drySync)
        await updateTrans(keysPath, transDir, transDir, locales, validationConfig)

        await compileAll(domainName, domainConfig, transDir)
      })
    })

  program.command('check')
    .description('Check all translated')
    .option('-l, --locales [locales]', 'Locales to check, all if not specified (comma separated)')
    .option('--force-sync', 'sync even if cached')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig, drySync) => {
        const cacheDir = domainConfig.getCacheDir()
        const locales = opts['locales'] ? opts['locales'].split(',') : domainConfig.getLocales()
        const tag = domainConfig.getTag()
        const validationConfig = config.getValidationConfig(program)

        const specs = ['untranslated']
        const keysPath = getKeysPath(path.join(cacheDir, domainName))
        const transDir = path.join(cacheDir, domainName)

        await extractKeys(domainName, domainConfig, keysPath)
        if (opts['forceSync'] || !await fileExists(transDir)) {
          await updateTrans(keysPath, transDir, transDir, locales, null)
          await syncTransToTarget(config, domainConfig, tag, keysPath, transDir, drySync)
        }
        await updateTrans(keysPath, transDir, transDir, locales, validationConfig)

        for (const locale of locales) {
          const transPath = getTransPath(transDir, locale)
          const useUnverified = config.useUnverified(locale)
          for (const transEntry of await readTransEntries(transPath)) {
            if (!checkTransEntrySpecs(transEntry, specs, useUnverified)) {
              continue
            }
            process.exitCode = 1

            process.stdout.write(`[${locale}] ${specs.join(',')}\n`)
            const flag = transEntry.flag
            if (flag) {
              process.stdout.write(`#, ${flag}\n`)
            }
            if (transEntry.context) {
              process.stdout.write(`context "${transEntry.context.replace(/\n/g, '\\n')}"\n`)
            }
            process.stdout.write(`key     "${transEntry.key.replace(/\n/g, '\\n')}"\n`)
            process.stdout.write(`message "${JSON.stringify(transEntry.messages)}"\n\n`)
          }
        }
      })
    })

  program.command('_extractKeys')
    .description('(Internal) Extract key entries from source and saved to files')
    .option('--keys-dir [keysDir]', 'Directory to save key files')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
        const cacheDir = opts['keysDir'] || domainConfig.getCacheDir()
        const keysPath = getKeysPath(path.join(cacheDir, domainName))

        await extractKeys(domainName, domainConfig, keysPath)
      })
    })

  program.command('_updateTrans')
    .description('(Internal) Apply key changes to translations')
    .option('-l, --locales [locales]', 'Locales to update (comma separated)')
    .option('--keys-dir [keysDir]', 'Directory to load key files')
    .option('--trans-dir [transDir]', 'Directory to save translation files')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
        const cacheDir = domainConfig.getCacheDir()
        const locales = opts['locales'] ? opts['locales'].split(',') : domainConfig.getLocales()
        config.getValidationConfig(program)
        const validationConfig = config.getValidationConfig(program)

        const keysPath = getKeysPath(path.join(opts['keysDir'] || cacheDir, domainName))
        const fromTransDir = path.join(cacheDir, domainName)
        const transDir = path.join(opts['transDir'] || cacheDir, domainName)

        await updateTrans(keysPath, fromTransDir, transDir, locales, validationConfig)
      })
    })

  program.command('_count')
    .description('(Internal) Count translations')
    .option('--trans-dir [transDir]', 'Directory to load translation files')
    .option('-l, --locales [locales]', 'Locales to count (comma separated)')
    .option('-s, --spec [spec]', 'Spec to count (required, negate if starting with !, comma separated) supported: total,translated,untranslated,<flag>')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
        const cacheDir = domainConfig.getCacheDir()
        const locales: string[] = opts['locales'] ? opts['locales'].split(',') : domainConfig.getLocales()
        const specs = opts['spec'] ? opts['spec'].split(',') : ['total']

        const transDir = path.join(opts['transDir'] || cacheDir, domainName)
        const counts: string[] = []
        for (const locale of locales) {
          const transPath = getTransPath(transDir, locale)
          const useUnverified = config.useUnverified(locale)
          let count = 0
          for (const transEntry of await readTransEntries(transPath)) {
            if (checkTransEntrySpecs(transEntry, specs, useUnverified)) {
              count++
            }
          }
          counts.push(locale + ':' + count)
        }
        process.stdout.write(`${domainName},${counts.join(',')}\n`)
      })
    })

  program.command('_cat')
    .description('[고급] 번역 항목 표시')
    .option('--trans-dir [transDir]', 'Directory to read translations')
    .option('-l, --locale [locale]', 'Locale to print (required)')
    .option('-s, --spec [spec]', 'Spec to print (required, negate if starting with !, comma separated) supported: total,translated,untranslated,<flag>')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
        if (!opts['locale']) {
          cmd.help()
        }

        const cacheDir = domainConfig.getCacheDir()
        const locale = opts['locale']
        const specs = opts['spec'] ? opts['spec'].split(',') : ['total']

        const transDir = path.join(opts['transDir'] || cacheDir, domainName)
        const transPath = getTransPath(transDir, locale)

        const useUnverified = config.useUnverified(locale)
        for (const transEntry of await readTransEntries(transPath)) {
          if (!checkTransEntrySpecs(transEntry, specs, useUnverified)) {
            continue
          }

          const flag = transEntry.flag
          if (flag) {
            process.stdout.write(`#, ${flag}\n`)
          }
          if (transEntry.context) {
            process.stdout.write(`context "${transEntry.context.replace(/\n/g, '\\n')}"\n`)
          }
          process.stdout.write(`key     "${transEntry.key.replace(/\n/g, '\\n')}"\n`)
          process.stdout.write(`message "${JSON.stringify(transEntry.messages)}"\n\n`)
        }
      })
    })

  program.command('_compile')
    .description('(Internal) Write domain asset from translations')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig) => {
        const cacheDir = domainConfig.getCacheDir()
        const transDir = path.join(cacheDir, domainName)
        await compileAll(domainName, domainConfig, transDir)
      })
    })

  program.command('_sync')
    .description('(Internal) Synchronize translations to remote target')
    .action(async (opts, cmd) => {
      await runSubCommand(cmd.name(), async (domainName, config, domainConfig, drySync) => {
        const tag = domainConfig.getTag()
        const cacheDir = domainConfig.getCacheDir()

        const transDir = path.join(cacheDir, domainName)
        const keysPath = getKeysPath(path.join(cacheDir, domainName))

        await syncTransToTarget(config, domainConfig, tag, keysPath, transDir, drySync)
      })
    })

  program.parse(process.argv)
}

async function runSubCommand(cmdName: string, action: (domainName: string, config: L10nConfig, domainConfig: DomainConfig, drySync: boolean) => Promise<void>) {
  log.heading = cmdName

  const globalOpts = program.opts()
  if (globalOpts['verbose']) {
    log.level = 'silly'
  } else if (globalOpts['quiet']) {
    log.level = 'warn'
  }

  const config = await loadConfig(globalOpts['rcfile'] || '.l10nrc')
  const domainNames = globalOpts['domains'] || config.getDomainNames()
  const drySync = globalOpts['drySync'] || false

  for (const domainName of domainNames) {
    const domainConfig = config.getDomainConfig(domainName)
    if (domainConfig == null) {
      log.error(cmdName, `no config found for domain ${domainName}`)
      process.exit(1)
    }
    log.heading = `[${domainName}] ${cmdName}`
    await action(domainName, config, domainConfig, drySync)
  }
}

async function loadConfig(rcPath: string): Promise<L10nConfig> {
  const explorer = cosmiconfig('l10n')
  const rc = await explorer.load(rcPath)
  const ajv = new Ajv()
  const schema = JSON.parse(await fsp.readFile(path.join(dirname, '..', 'l10nrc.schema.json'), { encoding: 'utf-8' }))
  const validate = ajv.compile(schema)
  const valid = validate(rc?.config)
  if (!valid) {
    log.error('l10n', 'rc file error', validate.errors)
    throw new Error('rc file is not valid')
  }
  return new L10nConfig(rc?.config)
}

try {
  await run()
} catch (err) {
  log.error('l10n', 'run failed', err)
  process.exit(1)
}
