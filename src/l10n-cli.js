#!/usr/bin/env node

import parseArgs from 'minimist'
import jsonfile from 'jsonfile'
import extract from './extract'

function getParam (argv, name) {
    const value = argv['_'].shift()
    if (value == null) {
        throw new Error(`no <${name}>`)
    }

    return value
}

function getOption (argv, name, fallback) {
    const value = argv[name]
    if (value != null) {
        return value
    }

    if (fallback == null) {
        throw new Error(`no argument: ${name}`)
    }

    return fallback
}

function getRc (rc, domain, name, fallback) {
    const domainRc = rc[domain]
    if (domainRc == null) {
        throw new Error(`no config for domain ${domain} in config file`)
    }

    const value = domainRc[name]
    if (value != null) {
        return value
    }

    if (fallback == null) {
        throw new Error(`no config for ${name} in domain ${domain} in config file`)
    }

    console.info(`using default value ${fallback} for ${name} in ${domain}`)
    return fallback
}

async function run () {
    const argv = parseArgs(process.argv.slice(2))
    const rcFile = getOption(argv, 'f', '.l10nrc')
    const rc = jsonfile.readFileSync(rcFile)

    const cmd = getParam(argv)
    const domainOption = getOption(argv, 'd', '')
    let domains
    if (domainOption) {
        domains = domainOption.split(',')
    } else {
        domains = Object.keys(rc)
    }

    for (const domain of domains) {
        console.info(`[l10n:${cmd}] domain: ${domain}`)
        switch (cmd) {
            case 'extract': {
                const type = getRc(rc, domain, 'type')
                const i18nDir = getRc(rc, domain, 'i18n-dir')
                const srcDirs = getRc(rc, domain, 'src-dirs')
                for (const srcDir of srcDirs) {
                    await extract(type, domain, i18nDir, srcDir)
                }
                break
            }
        }
    }
}

function usage () {
    console.info(`
Usage: l10n [-f rcfile] [-d domain] extract
`)
}
run().catch(err => {
    if (err) {
        console.error(err)
    }
    usage()
    process.exit(1)
})
