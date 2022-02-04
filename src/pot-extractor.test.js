import {PotExtractor} from './pot-extractor'

describe('PotExtractor', () => {
    describe('vue-i18n keywords', () => {
        const keywords = ['$t', 'vm.$t', 'this.$t', 'app.i18n.t', '$tc', 'vm.$tc', 'this.$tc', 'app.i18n.tc']
        test.each([...keywords])('extract %s', (keyword) => {
            const extractor = PotExtractor.create('testDomain', {keywords: [keyword]})
            for (const key of ['js', 'ts']) {
                const module = `
                    let $t = () => {};
                    let $tc = () => {};
                    let vm = {$t: () => {}, $tc: () => {}};
                    let app = {i18n: {$t: () => {}, $tc: () => {}}};
                    app.prototype.$t = function() {}
                    app.prototype.$tc = function() {}
                    app.prototype.test = function() {
                       ${keyword}('key-${key}');
                    }
                    `
                if (key === 'js') {
                    extractor.extractJsModule('test-file', module)
                } else if (key === 'ts') {
                    extractor.extractTsModule('test-file', module)
                }
            }
            extractor.extractJsExpression('test-file', `${keyword}('key-jse')`)

            expect(extractor.po.translations).toHaveProperty(['', 'key-js'])
            expect(extractor.po.translations).toHaveProperty(['', 'key-ts'])
            expect(extractor.po.translations).toHaveProperty(['', 'key-jse'])
        })
    })
})
