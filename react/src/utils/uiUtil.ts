import { EXTENSION_ID } from '@/const/common';
import { AppProps } from '@/types/props';

export function isVisible(state: AppProps) {
    if (!state.isVisible) {
        return false;
    }
    if (!state.textarea) {
        return false;
    }
    const { promptInfo, insertionInfo } = state.parseResult;

    if (insertionInfo.isMetaBlock) {
        return false;
    }
    if (promptInfo.activeWordIndex >= 0) {
        const activeWord = promptInfo.words[promptInfo.activeWordIndex];
        if (activeWord.type === 'lora' && promptInfo.inputtingString === '') {
            return false;
        }
    }

    if (!window.opts[`${EXTENSION_ID}_suggest_enabled`] && promptInfo.inputtingString === '') {
        return false;
    }

    return true;
}

export function calcContextPosition(state: AppProps): {
    offset_x: number;
    offset_y: number;
    x: number;
    y: number;
} {
    const textarea = state.textarea;
    if (!textarea) {
        return {
            offset_x: 0,
            offset_y: 0,
            x: 0,
            y: 0,
        };
    }
    const dummy = textarea.dummy;
    const caret = dummy.caret;

    const caretIndex = textarea.selectionEnd;
    const textBeforeCaret = textarea.value.slice(0, caretIndex);
    const textAfterCaret = textarea.value.slice(caretIndex);

    dummy.textContent = textBeforeCaret;
    caret.textContent = textAfterCaret[0] || '\u200b';
    dummy.appendChild(caret);

    const rect = caret.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(textarea);

    const lineHeight = parseFloat(computedStyle.lineHeight.replace(/[^\d\.]+/, ''));

    const textareaRect = textarea.getBoundingClientRect();
    const x = rect.left - textareaRect.left - textarea.scrollLeft;
    const y = rect.top - textareaRect.top - textarea.scrollTop + lineHeight;

    return {
        offset_y: textareaRect.top + window.scrollY,
        offset_x: textareaRect.left + window.scrollX,
        x: x,
        y: y,
    };
}
