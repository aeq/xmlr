/**
 * A fast XML parser for NodeJS using Writable streams.
 *
 * What this is:
 * Simple and fast XML parser purley written for NodeJS. No extra production dependencies.
 * A handy way parse ATOM/RSS/RDF feeds and such. No validation is made on the document that is parsed.
 *
 * Motivation
 * There is already quite a few parsers out there. I just wanted a parser that was as tiny and fast as possible to handle easy parsing of
 * RSS/ATOM/RDF feeds using streams, no fancy stuff needed. If you want more functionality you should check out other recommended parsers (see below)
 *
 * Usage
 * Just #pipe() a <stream.Readable> and you are ready to listen for events.
 * You can also use the #write() method to write directly to the parser.
 *
 * The source is written using ES2015, babel is used to translate to the dist.
 *
 * Other recommended parsers for node that are great:
 * https://github.com/isaacs/sax-js
 * https://github.com/xmppjs/ltx
 *
 * Events:
 * - text
 * - instruction
 * - opentag
 * - closetag
 * - cdata
 *
 * Comments are ignored, so there is no events for them.
 *
 */

import * as _stream from 'stream';

 class Parser extends _stream.Writable
 {
    state = STATE.TEXT;
    buffer = '';
    pos = 0;
    tagType = TAG_TYPE.NONE;

    // eslint-disable-next-line @typescript-eslint/ban-types
    _write(_chunk: string | object, encoding: BufferEncoding, done: () => void):void {
        const chunk = typeof _chunk !== 'string' ? _chunk.toString() : _chunk;
        for (let i = 0; i < chunk.length; i++) {
            const c = chunk[i];
            const prev = this.buffer[this.pos - 1];
            this.buffer += c;
            this.pos++;

            switch (this.state) {
                case STATE.TEXT:
                if (c === '<') this._onStartNewTag();
                break;

            case STATE.TAG_NAME:
                if (prev === '<' && c === '?') {
                        this._onStartInstruction();
                }
                if (prev === '<' && c === '/') {
                        this._onCloseTagStart();
                    }
                    if (
                    this.buffer[this.pos - 3] === '<' &&
                        prev === '!' &&
                        c === '['
                    ) {
                    this._onCDATAStart();
                    }
                    if (
                    this.buffer[this.pos - 3] === '<' &&
                        prev === '!' &&
                        c === '-'
                    ) {
                        this._onCommentStart();
                }
                if (c === '>') {
                    if (prev === '/') {
                        this.tagType = TAG_TYPE.SELF_CLOSING;
                    }
                    this._onTagCompleted();
                }
                    break;

            case STATE.INSTRUCTION:
                if (prev === '?' && c === '>')
                    this._onEndInstruction();
                break;

            case STATE.CDATA:
                if (
                    this.buffer[this.pos - 3] === ']' &&
                        prev === ']' &&
                        c === '>'
                    )
                        this._onCDATAEnd();
                break;

            case STATE.IGNORE_COMMENT:
                if (
                    this.buffer[this.pos - 3] === '-' &&
                        prev === '-' &&
                        c === '>'
                    )
                    this._onCommentEnd();
                break;
            }
        }
        done();
    }

    _endRecording():string {
            const rec = this.buffer.slice(1, this.pos - 1);
            this.buffer = this.buffer.slice(-1); // Keep last item in buffer for prev comparison in main loop.
            this.pos = 1; // Reset the position (since the buffer was reset)
            return rec;
        }
    
    _onStartNewTag():void {
            const text = this._endRecording().trim();
            if (text) {
                this.emit(EVENTS.TEXT, text);
            }
            this.state = STATE.TAG_NAME;
            this.tagType = TAG_TYPE.OPENING;
        }
    
    _onTagCompleted():void {
            const tag = this._endRecording();

            const _parseTagString2 = this._parseTagString(tag);
            const name = _parseTagString2.name;
            let attributes = _parseTagString2.attributes;

            if (name === null) {
                this.emit(
                    EVENTS.ERROR,
                    new Error('Failed to parse name for tag' + tag)
                );
            }

            if (this.tagType && this.tagType == TAG_TYPE.OPENING) {
                this.emit(EVENTS.OPEN_TAG, name, attributes);
            }

            if (this.tagType && this.tagType === TAG_TYPE.CLOSING) {
                this.emit(EVENTS.CLOSE_TAG, name, attributes);
            }
            if (this.tagType && this.tagType === TAG_TYPE.SELF_CLOSING) {
                if (
                    Object.keys(attributes).length === 0 &&
                    attributes.constructor === Object
                ) {
                    attributes = { ___selfClosing___: true };
                }
                this.emit(EVENTS.OPEN_TAG, name, attributes);
                this.emit(EVENTS.CLOSE_TAG, name, attributes);
            }

            this.state = STATE.TEXT;
            this.tagType = TAG_TYPE.NONE;
        }
    
    _onCloseTagStart():void {
            this._endRecording();
            this.tagType = TAG_TYPE.CLOSING;
        }
    
    _onStartInstruction():void {
            this._endRecording();
            this.state = STATE.INSTRUCTION;
        }

        _onEndInstruction():void {
            this.pos -= 1; // Move position back 1 step since instruction ends with '?>'
            const inst = this._endRecording();

            const _parseTagString3 = this._parseTagString(inst);
            const name = _parseTagString3.name;
            const attributes = _parseTagString3.attributes;

            if (name === null) {
                this.emit(
                    EVENTS.ERROR,
                    new Error('Failed to parse name for inst' + inst)
                );
            }
            this.emit(EVENTS.INSTRUCTION, name, attributes);
            this.state = STATE.TEXT;
        }
    
    _onCDATAStart():void {
            this._endRecording();
            this.state = STATE.CDATA;
        }
    
        _onCDATAEnd():void {
            let text = this._endRecording(); // Will return CDATA[XXX] we regexp out the actual text in the CDATA.
            text = text.slice(
                text.indexOf('[') + 1,
                text.lastIndexOf(']>') - 1
            );
            this.state = STATE.TEXT;

            this.emit(EVENTS.CDATA, text);
        }
        
        _onCommentStart():void {
            this.state = STATE.IGNORE_COMMENT;
        }
    
        _onCommentEnd():void {
            this._endRecording();
            this.state = STATE.TEXT;
        }

        /**
         * Helper to parse a tag string 'xml version="2.0" encoding="utf-8"' with regexp.
         * @param  {string} str the tag string.
         * @return {object}     {name, attributes}
         */
    
    _parseTagString(str: string):{
        name: string|null;
        attributes: Record<string, unknown>;
    } {
            // parse name
            
            const parsedString = /^([a-zäöüßÄÖÜA-Z0-9:_\-./]+?)(\s|$)/.exec(
                str
            );
            if (parsedString && parsedString.length > 0) {
                let name = parsedString[1];
                const attributesString = str.substr(name.length);
                const attributeRegexp = /([a-zäöüßÄÖÜA-Z0-9:_\-.]+?)="([^"]+?)"/g;
                let match = attributeRegexp.exec(attributesString);
                const attributes = {};
                while (match != null) {
                    attributes[match[1]] = match[2];
                    match = attributeRegexp.exec(attributesString);
                }
                if (name[name.length - 1] === '/') {
                    name = name.substr(0, name.length - 1);
                }
                return { name: name, attributes: attributes };
            }
            return { name: null, attributes: {} };
        }    
 }


export default Parser;

const STATE = {
    TEXT: 0,
    TAG_NAME: 1,
    INSTRUCTION: 2,
    IGNORE_COMMENT: 4,
    CDATA: 8,
};

const TAG_TYPE = {
    NONE: 0,
    OPENING: 1,
    CLOSING: 2,
    SELF_CLOSING: 3,
};

const EVENTS = (exports.EVENTS = {
    ERROR: 'error',
    TEXT: 'text',
    INSTRUCTION: 'instruction',
    OPEN_TAG: 'opentag',
    CLOSE_TAG: 'closetag',
    CDATA: 'cdata',
});
