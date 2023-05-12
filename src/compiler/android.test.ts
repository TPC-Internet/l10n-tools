import {
    createCDataNode,
    createTextNode,
    findFirstTagNode,
    getAndroidXmlBuilder,
    getAndroidXmlParser,
    getAttrValue,
    isCDataNode,
    isTagNode,
    parseAndroidXml,
    type XMLNode,
    type XMLTagNode,
} from './android-xml-utils.js';

describe('android compiler test', () => {
    it('parse and build preserving all', () => {
        const transMap: {[name: string]: string} = {
            sign_up_ask_comment_v2: '아직 계정이 없으신가요? <font color="#FF424D">회원가입</font>',
            sign_up_form_policy_agreement_desc_v2: '<u>서비스 이용약관</u>과 <u>개인정보 처리방침</u>에 동의합니다.',
            user_interest_form_title: '관심사 & 해시태그',
            user_interest_edit_req_desc_for_fan: '<b>관심사 선택 기능이 새로 나왔습니다!</b>\\n관심사를 설정하시면 나와 맞는 크리에이터들을 추천해드릴께요!\\n아래에서 최소 3개 이상을 선택해주세요!',
            alarm_list_item_desc_gift_dm_received: '<b>%1$s</b>님이 선물을 보냈습니다.'
        }
        const srcXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">LIKEY</string>
    <string name="sign_up_ask_comment_v2" format="html">아직 계정이 없으신가요? <font color="#FF424D">회원가입</font></string>
    <string name="sign_up_form_policy_agreement_desc_v2" format="html"><u>서비스 이용약관</u>과 <u>개인정보 처리방침</u>에 동의합니다.</string>
    <string name="user_interest_form_title"><![CDATA[관심사 & 해시태그]]></string>
    <string name="user_interest_edit_req_desc_for_fan" format="html"><b>관심사 선택 기능이 새로 나왔습니다!</b>\\n관심사를 설정하시면 나와 맞는 크리에이터들을 추천해드릴께요!\\n아래에서 최소 3개 이상을 선택해주세요!</string>
    <string name="user_interest_extra_tag_count_format" translatable="false">(+%1$s)</string>
    <string name="alarm_list_item_desc_gift_dm_received"><![CDATA[<b>%1$s</b>님이 선물을 보냈습니다.]]></string>
    <plurals name="text_left_days">
        <item quantity="one">%d day</item>
        <item quantity="other">%d days</item>
    </plurals>
</resources>`
        const targetXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    
    <string name="sign_up_ask_comment_v2" format="html">아직 계정이 없으신가요? <font color="#FF424D">회원가입</font></string>
    <string name="sign_up_form_policy_agreement_desc_v2" format="html"><u>서비스 이용약관</u>과 <u>개인정보 처리방침</u>에 동의합니다.</string>
    <string name="user_interest_form_title"><![CDATA[관심사 & 해시태그]]></string>
    <string name="user_interest_edit_req_desc_for_fan" format="html"><b>관심사 선택 기능이 새로 나왔습니다!</b>\\n관심사를 설정하시면 나와 맞는 크리에이터들을 추천해드릴께요!\\n아래에서 최소 3개 이상을 선택해주세요!</string>
    
    <string name="alarm_list_item_desc_gift_dm_received"><![CDATA[<b>%1$s</b>님이 선물을 보냈습니다.]]></string>
    <plurals name="text_left_days">
        <item quantity="one">%d day</item>
        <item quantity="other">%d days</item>
    </plurals>
</resources>`

        const parser = getAndroidXmlParser()
        const srcXmlJson = parseAndroidXml(parser, srcXml)

        const resNode = findFirstTagNode(srcXmlJson, 'resources')
        if (resNode == null) {
            throw new Error('no resources tag')
        }
        const dstResources = resNode.resources
            .map(node => {
                // string 태그 외 text 영역, plurals 태그 등 다른 것은 그대로 복사
                if (!isTagNode(node, 'string')) {
                    return node
                }

                // translatable="false" 인 태그는 스킵
                const translatable = getAttrValue(node, 'translatable')
                if (translatable == 'false') {
                    return null
                }

                // name attr 없는 태그는 문제가 있는 것인데, 일단 스킵
                const name = getAttrValue(node, 'name')
                if (name == null) {
                    return null
                }

                // 번역이 없는 태그도 스킵
                let value = transMap[name]
                if (!value) {
                    return null
                }

                // html format 은 번역 텍스트 그대로 사용
                const format = getAttrValue(node, 'format')
                if (format === 'html') {
                    // no post process
                    return {...node, string: [createTextNode(value, true)]} as XMLTagNode
                } else {
                    // CDATA 노드인 경우 CDATA를 그대로 살려서 스트링만 교체
                    if (node.string.some(node => isCDataNode(node))) {
                        return {...node, string: [createCDataNode(value, true)]}
                    }

                    // 그 외의 경우는 android string encoding 하여 사용
                    return {...node, string: [createTextNode(value, false)]}
                }
            })
            .filter((node): node is XMLNode => node != null)

        resNode.resources = dstResources

        const builder = getAndroidXmlBuilder()
        let dstXml = builder.build(srcXmlJson)
        expect(dstXml).toBe(targetXml)
    })
})
