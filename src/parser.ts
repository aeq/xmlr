import * as _stream from 'stream';

enum STATE {
    TEXT = 0,
    TAG_NAME = 1,
    INSTRUCTION = 2,
    IGNORE_COMMENT = 4,
    CDATA = 8,
}

enum TAG_TYPE {
    NONE = 0,
    OPENING = 1,
    CLOSING = 2,
    SELF_CLOSING = 3,
}

export const EVENTS = {
    ERROR: 'error',
    TEXT: 'text',
    INSTRUCTION: 'instruction',
    OPEN_TAG: 'opentag',
    CLOSE_TAG: 'closetag',
    CDATA: 'cdata',
};

export class Parser extends _stream.Writable {
    state = STATE.TEXT;

    buffer = '';

    pos = 0;

    tagType = TAG_TYPE.NONE;

    _write(
        // eslint-disable-next-line @typescript-eslint/ban-types
        _chunk: string | object,
        encoding: BufferEncoding,
        done: () => void
    ): void {
        const chunk = typeof _chunk !== 'string' ? _chunk.toString() : _chunk;
        for (let i = 0; i < chunk.length; i += 1) {
            const c = chunk[i];
            const prev = this.buffer[this.pos - 1];
            this.buffer += c;
            this.pos += 1;

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
                    if (prev === '?' && c === '>') this._onEndInstruction();
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

                default:
                    break;
            }
        }
        done();
    }

    _endRecording(): string {
        const rec = this.buffer.slice(1, this.pos - 1);
        this.buffer = this.buffer.slice(-1); // Keep last item in buffer for prev comparison in main loop.
        this.pos = 1; // Reset the position (since the buffer was reset)
        return rec;
    }

    _onStartNewTag(): void {
        const text = this._endRecording().trim();
        if (text) {
            this.emit(EVENTS.TEXT, text);
        }
        this.state = STATE.TAG_NAME;
        this.tagType = TAG_TYPE.OPENING;
    }

    _onTagCompleted(): void {
        const tag = this._endRecording();

        const _parseTagString2 = this._parseTagString(tag);
        const { name } = _parseTagString2;
        let { attributes } = _parseTagString2;

        if (name === null) {
            this.emit(
                EVENTS.ERROR,
                new Error(`Failed to parse name for tag${tag}`)
            );
        }

        if (this.tagType && this.tagType === TAG_TYPE.OPENING) {
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

    _onCloseTagStart(): void {
        this._endRecording();
        this.tagType = TAG_TYPE.CLOSING;
    }

    _onStartInstruction(): void {
        this._endRecording();
        this.state = STATE.INSTRUCTION;
    }

    _onEndInstruction(): void {
        this.pos -= 1; // Move position back 1 step since instruction ends with '?>'
        const inst = this._endRecording();

        const _parseTagString3 = this._parseTagString(inst);
        const { name } = _parseTagString3;
        const { attributes } = _parseTagString3;

        if (name === null) {
            this.emit(
                EVENTS.ERROR,
                new Error(`Failed to parse name for inst${inst}`)
            );
        }
        this.emit(EVENTS.INSTRUCTION, name, attributes);
        this.state = STATE.TEXT;
    }

    _onCDATAStart(): void {
        this._endRecording();
        this.state = STATE.CDATA;
    }

    _onCDATAEnd(): void {
        let text = this._endRecording(); // Will return CDATA[XXX] we regexp out the actual text in the CDATA.
        text = text.slice(text.indexOf('[') + 1, text.lastIndexOf(']>') - 1);
        this.state = STATE.TEXT;

        this.emit(EVENTS.CDATA, text);
    }

    _onCommentStart(): void {
        this.state = STATE.IGNORE_COMMENT;
    }

    _onCommentEnd(): void {
        this._endRecording();
        this.state = STATE.TEXT;
    }

    /**
     * Helper to parse a tag string 'xml version="2.0" encoding="utf-8"' with regexp.
     * @param  {string} str the tag string.
     * @return {object}     {name, attributes}
     */

    _parseTagString(str: string): {
        name: string | null;
        attributes: Record<string, unknown>;
    } {
        // parse name

        const parsedString = /^([a-zäöüßÄÖÜA-Z0-9:_\-./]+?)(\s|$)/.exec(str);
        if (parsedString && parsedString.length > 0) {
            let name = parsedString[1];
            const attributesString = str.substr(name.length);
            const attributeRegexp = /([a-zäöüßÄÖÜA-Z0-9:_\-.]+?)="([^"]+?)"/g;
            let match = attributeRegexp.exec(attributesString);
            const attributes: Record<string, unknown> = {};
            while (match != null) {
                const [_, key, value] = match;
                attributes[key] = value;
                match = attributeRegexp.exec(attributesString);
            }
            if (name[name.length - 1] === '/') {
                name = name.substr(0, name.length - 1);
            }
            return { name, attributes };
        }
        return { name: null, attributes: {} };
    }
}
