import {PotExtractor} from './pot-extractor'

describe('PotExtractor', () => {
    describe('vue-i18n keywords', () => {
        const keywords = ['$t', 'vm.$t', 'this.$t', 'app.i18n.t', '$tc', 'vm.$tc', 'this.$tc', 'app.i18n.tc']
        it.each([...keywords])('extract %s', (keyword) => {
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
                    expect(extractor.po.translations).toHaveProperty(['', 'key-js'])
                } else if (key === 'ts') {
                    extractor.extractTsModule('test-file', module)
                    expect(extractor.po.translations).toHaveProperty(['', 'key-ts'])
                }
            }
            extractor.extractJsExpression('test-file', `${keyword}('key-jse')`)
            expect(extractor.po.translations).toHaveProperty(['', 'key-jse'])
        })
    })

    describe('vue-i18n i18n tag', () => {
        it('path and :path', () => {
            const module = `
                <template>
                    <div>
                        <i18n tag="span" path="key-vue-i18n-path"></i18n>
                        <i18n tag="span" :path="'key-vue-i18n-path-exp'"></i18n>
                    </div>
                </template>
            `
            const extractor = PotExtractor.create('testDomain', {tagNames: ['i18n']})
            extractor.extractVue('test-file', module)
            expect(extractor.po.translations).toHaveProperty(['', 'key-vue-i18n-path', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-vue-i18n-path']['comments']['reference']).toEqual('test-file:4')
            expect(extractor.po.translations).toHaveProperty(['', 'key-vue-i18n-path-exp', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-vue-i18n-path-exp']['comments']['reference']).toEqual('test-file:5')
        })
    })

    describe('script in vue file', () => {
        it('extract with reference', () => {
            const module = `
                <template><div></div></template>
                <script>
                class Component {
                    mounted() {
                        this.$t('key-js')
                    }
                }
                </script>
                <script lang="ts">
                class Component {
                    mounted() {
                        this.$t('key-ts')
                    }
                }
                </script>
            `
            const extractor = PotExtractor.create('testDomain', {keywords: ['this.$t']})
            extractor.extractVue('test-file', module)
            expect(extractor.po.translations).toHaveProperty(['', 'key-js', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-js']['comments']['reference']).toEqual('test-file:6')
            expect(extractor.po.translations).toHaveProperty(['', 'key-ts', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-ts']['comments']['reference']).toEqual('test-file:13')
        })
    })
})
