// Type definitions for gettext-parser 4.0
// Project: https://github.com/smhg/gettext-parser
// Definitions by: Lorent Lempereur <https://github.com/looorent>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference types="node" />

declare module 'gettext-parser' {
    import {Transform} from "readable-stream";
    import {TransformOptions} from 'stream';

    export interface GetTextComment {
        translator?: string;
        reference?: string;
        extracted?: string;
        flag?: string;
        previous?: string;
    }

    export interface GetTextTranslation {
        msgctxt?: string | undefined;
        msgid: string;
        msgid_plural?: any;
        msgstr: string[];
        comments?: GetTextComment | undefined;
    }

    export interface GetTextTranslations {
        charset: string;
        headers: { [headerName: string]: string };
        translations: { [msgctxt: string]: { [msgId: string]: GetTextTranslation } };
    }

    export type PoParseOptions = {
        defaultCharset?: string;
        validation?: boolean;
    }
    export type PoCompileOptions = {
        foldLength?: number;
        escapeCharacters?: boolean;
        sort?: boolean | ((left: GetTextTranslation, right: GetTextTranslation) => -1 | 0 | 1);
        eol?: string
    }
    export interface PoParser {
        parse: (buffer: Buffer | string, options: PoParseOptions = {}) => GetTextTranslations;
        compile: (table: GetTextTranslations, options?: PoCompileOptions = {}) => Buffer;
        createParseStream: (buffer: Buffer | string, options: PoParseOptions = {}, transformOptions?: TransformOptions) => Transform;
    }

    export interface MoParser {
        parse: (buffer: Buffer | string, options: PoParseOptions = {}) => GetTextTranslations;
        compile: (table: GetTextTranslations, options?: PoCompileOptions = {}) => Buffer;
    }

    export const po: PoParser;
    export const mo: MoParser;
}
