import {exec} from 'child-process-es6-promise'
import commandExists from 'command-exists'

async function extract_vue_gettext (domain, i18nDir, srcDir) {
    let result = await exec(`
        npx gettext-extract --attribute v-translate --quiet \
            --output ${i18nDir}/${domain}.pot \
            $(find ${srcDir} -name "*.vue")`)
    console.log(result.stdout)
    try {
        await commandExists('xgettext')
    } catch (err) {
        throw new Error('install xgettext by `brew install gettext && brew link --force gettext\'')
    }
    result = await exec(`
        xgettext --language=JavaScript --keyword=npgettext:1c,2,3 \
            --from-code=utf-8 --join-existing --no-wrap \
            --package-name=${domain} \
            --output ${i18nDir}/${domain}.pot \
            $(find ${srcDir} -name "*.js" -o -name "*.vue")`)
    console.log(result.stdout)
}

export default function extract (type, domain, i18nDir, srcDir) {
    switch (type) {
        case 'vue-gettext':
            return extract_vue_gettext(domain, i18nDir, srcDir)
        default:
            throw new Error(`unknown type: ${type}`)
    }
}
