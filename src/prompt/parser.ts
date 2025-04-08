import * as promptState from '../shared/state/prompt';
import { PromptItem, PromptItemType } from '../shared/types/prompt';

enum NestType {
    Root,
    Paren,
    Square,
    Curly,
    Angle,
    Lora,
}

const openerToType: Record<string, NestType> = {
    '(': NestType.Paren,
    '[': NestType.Square,
    '{': NestType.Curly,
    '<': NestType.Angle,
};

const closerToType: Record<string, NestType> = {
    ')': NestType.Paren,
    ']': NestType.Square,
    '}': NestType.Curly,
    '>': NestType.Angle,
};

const closerForType: Record<NestType, string> = {
    [NestType.Root]: '',
    [NestType.Paren]: ')',
    [NestType.Square]: ']',
    [NestType.Curly]: '}',
    [NestType.Angle]: '>',
    [NestType.Lora]: '>',
};

const delimiters: Record<NestType, Set<string>> = {
    [NestType.Root]: new Set<string>([',']),
    [NestType.Paren]: new Set<string>([',']),
    [NestType.Square]: new Set<string>([',', ':', '|']),
    [NestType.Curly]: new Set<string>([',', '|']),
    [NestType.Angle]: new Set<string>([',', '|']),
    [NestType.Lora]: new Set<string>(),
};

const delimitersWithoutComma = new Set<string>([',', '|', ':', '(', '[', '{', '<']);

// length of the string "lora:" or "lyco:"
const PREFIX_LENGTH = 5;

const metaKeywords = ['BREAK', 'AND', 'ADDCOMM', 'ADDBASE', 'ADDCOL', 'ADDROW'];

const dynamicPromptRegex = /\{([\d-]+\$\$(?:[^\}]+?\$\$)?)(.*)\}/g;

const matchMetaKeywordRegex = new RegExp(`\\b(${metaKeywords.join('|')})\\b`, 'g');

function makePromptItem(nestType: NestType, position: number): PromptItem {
    const promptItemType = nestType === NestType.Lora ? PromptItemType.Lora : PromptItemType.Tag;
    return {
        value: '',
        position: position,
        type: promptItemType,
        isActive: false,
    };
}

export function updatePromptState(prompt: string, caret: number): void {
    promptState.initialize(prompt, caret);

    prompt = prompt.replace(matchMetaKeywordRegex, (match) => ','.padEnd(match.length, '\0'));
    prompt = prompt.replace(dynamicPromptRegex, (match, group1, group2) => {
        const stars = '\0'.repeat(group1.length);
        return `{${stars}${group2}}`;
    });

    const nestTypes = [NestType.Root];
    let isEscaped = false;
    let delimiter: string | undefined;
    let isNewLine = true;

    function flush(promptItem: PromptItem) {
        promptItem.value = promptItem.value.trim();
        if (promptItem.isActive || promptItem.value !== '') {
            promptState.addPromptItem(promptItem);
            isNewLine = false;
            delimiter = undefined;
        }
    }

    function updateContextState(char: string) {
        if (char === '\n') {
            isNewLine = true;
        } else if (delimitersWithoutComma.has(char)) {
            delimiter = char;
        }
    }

    function updatePrependFlags(promptItem: PromptItem) {
        if (promptItem.isActive && promptState.getPromptItemList().length > 0) {
            if (delimiter === undefined) {
                promptState.setNeedPrependComma(true);
                if (!isNewLine) {
                    promptState.setNeedPrependSpace(true);
                }
            } else if (delimiter === ',') {
                promptState.setNeedPrependSpace(true);
            }
        }
    }

    function setActivePromptItem(promptItem: PromptItem) {
        promptItem.isActive = true;
        let activeTag = promptState.getActiveWord();
        if (isEscaped) {
            activeTag += '\\';
            promptState.setActiveWord(activeTag);
        }
        promptState.setActiveWord(promptItem.value.trim());
        promptState.setActivePromptItemIndex(promptState.getPromptItemList().length);
    }

    let promptItem: PromptItem = makePromptItem(NestType.Root, 0);

    for (let i = 0; i < prompt.length; i++) {
        const char = prompt[i];
        if (i === caret) {
            setActivePromptItem(promptItem);
        }

        const currentNestType = nestTypes[nestTypes.length - 1];

        if (char === '\0') {
            if (promptItem.isActive) {
                promptState.setMetaBlock(true);
                promptState.setNeedPrependSpace(true);
            }
            promptItem.position++;
            continue;
        }
        if (char === '\n') {
            updatePrependFlags(promptItem);
            flush(promptItem);
            updateContextState(char);
            promptItem = makePromptItem(currentNestType, i + 1);

            isEscaped = false;
            continue;
        }
        if (isEscaped) {
            promptItem.value += char;
            isEscaped = false;
            continue;
        }
        if (char === '\\') {
            isEscaped = true;
            continue;
        }

        if (char in openerToType) {
            let openerType = openerToType[char];
            if (openerType === NestType.Angle) {
                if (prompt.length - i > PREFIX_LENGTH) {
                    const loraPrefix = prompt.substring(i + 1, i + PREFIX_LENGTH + 1);
                    if (loraPrefix === 'lora:' || loraPrefix === 'lyco:') {
                        openerType = NestType.Lora;
                    }
                }
            }
            nestTypes.push(openerType);

            if (openerType === NestType.Lora) {
                i += PREFIX_LENGTH;
                if (i - caret >= 0 && i - caret < PREFIX_LENGTH) {
                    promptState.setMetaBlock(true);
                }
            }
            updatePrependFlags(promptItem);
            flush(promptItem);
            updateContextState(char);
            if (openerType === NestType.Lora) {
                promptItem = makePromptItem(openerType, i + 1);
            } else {
                promptItem = makePromptItem(openerType, i);
            }
            continue;
        }

        if (char in closerToType) {
            const expectedCloser = closerForType[currentNestType];
            if (char !== expectedCloser) {
                promptItem.value += char;
                continue;
            }
            if (currentNestType === NestType.Paren || currentNestType === NestType.Square) {
                const colonIndex = promptItem.value.lastIndexOf(':');
                if (colonIndex >= 0) {
                    const word = promptItem.value.substring(0, colonIndex);
                    const weightValue = promptItem.value.substring(colonIndex + 1);
                    if (isNumber(weightValue)) {
                        promptItem.value = word;
                        if (promptItem.isActive && i - caret <= weightValue!.length) {
                            promptState.setMetaBlock(true);
                        }
                    }
                } else if (currentNestType === NestType.Square) {
                    if (isNumber(promptItem.value)) {
                        if (promptItem.isActive && i - caret <= promptItem.value.length) {
                            promptState.setMetaBlock(true);
                        }
                        promptItem.value = '';
                    }
                }
            } else if (currentNestType === NestType.Lora) {
                const colonIndex = promptItem.value.indexOf(':');
                if (colonIndex >= 0) {
                    const loraName = promptItem.value.substring(0, colonIndex);
                    const multiplier = promptItem.value.substring(colonIndex + 1);
                    if (promptItem.isActive && i - caret <= multiplier!.length) {
                        promptState.setMetaBlock(true);
                    }
                    promptItem.value = loraName;
                }
            }
            nestTypes.pop();

            updatePrependFlags(promptItem);
            flush(promptItem);
            updateContextState(char);
            promptItem = makePromptItem(nestTypes[nestTypes.length - 1], i + 1);
            continue;
        }

        if (currentNestType === NestType.Lora) {
            if (promptItem.value !== '' || char !== ' ') {
                promptItem.value += char;
            }
            continue;
        }

        if (delimiters[currentNestType]?.has(char)) {
            updatePrependFlags(promptItem);
            flush(promptItem);
            updateContextState(char);
            promptItem = makePromptItem(currentNestType, i + 1);
            continue;
        }

        if (promptItem.value === '') {
            promptItem.position = i;
        }
        promptItem.value += char;
    }

    if (promptState.getActivePromptItemIndex() < 0) {
        setActivePromptItem(promptItem);
    }
    promptState.getPromptItemList().forEach((promptItem) => {
        promptItem.value = promptItem.value.replace(/_/g, ' ');
    });
    updatePrependFlags(promptItem);
    flush(promptItem);
}

function isNumber(value: string): boolean {
    if (value.trim() === '') {
        return false;
    }
    return !isNaN(+value);
}
