import * as editor from '../prompt/editor';
import * as parser from '../prompt/parser';
import * as contextState from '../shared/state/context';
import * as promptState from '../shared/state/prompt';
import { TagResult } from '../shared/types/model';
import { PromptItem, PromptItemType } from '../shared/types/prompt';
import * as context from '../ui/context';

let isStylesheetInjected = false;
let processingPromise: Promise<PromptItem> | undefined;

enum KeyCode {
    TAB = 'Tab',
    ENTER = 'Enter',
    ARROW_DOWN = 'ArrowDown',
    ARROW_UP = 'ArrowUp',
    ESCAPE = 'Escape',
    ARROW_LEFT = 'ArrowLeft',
    ARROW_RIGHT = 'ArrowRight',
    HOME = 'Home',
    END = 'End',
}

export function bind(textarea: PilotTextArea) {
    if (!isStylesheetInjected) {
        isStylesheetInjected = true;
        const computedStyle = getComputedStyle(textarea);
        let cssStyleString = '';
        const ignoredCssProperties = new Set<string>(['width', 'height', 'inline-size', 'block-size', 'resize']);
        for (let i = 0; i < computedStyle.length; i++) {
            const prop = computedStyle[i];
            if (!ignoredCssProperties.has(prop)) {
                const value = computedStyle.getPropertyValue(prop);
                cssStyleString += `${prop}: ${value};`;
            }
        }
        const cssStyleSheet = new CSSStyleSheet();
        cssStyleSheet.replaceSync(`.prompt_pilot-dummy {${cssStyleString}}`);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, cssStyleSheet];
    }

    const dummyDiv = document.createElement('div') as HTMLDivElement & { caret: HTMLSpanElement };
    dummyDiv.className = 'prompt_pilot-dummy';
    dummyDiv.style.position = 'absolute';
    dummyDiv.style.visibility = 'hidden';
    dummyDiv.style.pointerEvents = 'none';
    textarea.parentNode?.insertBefore(dummyDiv, textarea.nextSibling);
    textarea.dummy = dummyDiv;

    const caretSpan = document.createElement('span');
    dummyDiv.caret = caretSpan;

    textarea.addEventListener('focus', (e) => handleFocus(e));
    textarea.addEventListener('blur', () => handleBlur());

    textarea.addEventListener('compositionend', () => handleCompositionend());
    textarea.addEventListener('input', () => handleInput());
    textarea.addEventListener('keydown', (e) => handleKeyDown(e));
    textarea.addEventListener('keyup', (e) => handleKeyUp(e));

    textarea.addEventListener('mousedown', (e) => handleMouseDown(e));
    textarea.addEventListener('mouseup', (e) => handleMouseUp(e));
}

function handleFocus(e: FocusEvent): void {
    context.setActiveTextarea(e.target as PilotTextArea);
}

function handleBlur(): void {
    context.close();
}

function handleMouseDown(e: MouseEvent): void {
    if (!window.pilotIsActive) {
        return;
    }

    context.close();

    if (e.ctrlKey) {
        // waiting for the textarea to be updated
        setTimeout(() => {
            processingPromise = new Promise((resolve) => {
                const textarea = contextState.getActiveTextarea()!;
                parser.updatePromptState(textarea.value, textarea.selectionEnd);
                resolve(promptState.getActivePromptItem());
            });
        }, 50);
    }
}

function handleMouseUp(e: MouseEvent): void {
    if (!window.pilotIsActive) {
        return;
    }

    if (e.ctrlKey && processingPromise) {
        processingPromise.then((promptItem) => {
            if (promptItem.type !== PromptItemType.Lora) {
                context.openWiki(promptItem.value);
            }
        });
    }
}

function handleCompositionend(): void {
    promptState.setComposing(false);
    context.updateContextPosition();
}

function handleInput(): void {
    if (!promptState.isWeightChanging()) {
        context.updateContextPosition();
    } else if (!contextState.isClosed()) {
        context.close();
    }
}

function handleKeyDown(e: KeyboardEvent): void {
    if (!window.pilotIsActive) {
        return;
    }

    const key = e.key as KeyCode;
    if (e.ctrlKey && (key === KeyCode.ARROW_DOWN || key === KeyCode.ARROW_UP)) {
        promptState.setWeightChanging(true);
    }

    promptState.setComposing(e.isComposing);
    if (promptState.isComposing()) {
        return;
    }
    if (contextState.isClosed()) {
        return;
    }

    if (key === KeyCode.ESCAPE) {
        context.close();
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    if (!contextState.hasVisibleResultList()) {
        return;
    }

    if (key === KeyCode.TAB) {
        const result = contextState.getSelectedResult();
        if (result) {
            editor.insertWordIntoPrompt(result);
            if (e.shiftKey && result instanceof TagResult && result.model.isOfficial !== undefined) {
                const tag = result.model.isOfficial ? result.model.value : result.model.consequentTagModel!.value;
                context.openWiki(tag);
            }
        }
        e.preventDefault();
    } else if (key === KeyCode.ARROW_DOWN || key === KeyCode.ARROW_UP) {
        if (!e.ctrlKey && !e.shiftKey) {
            const direction = key === KeyCode.ARROW_DOWN ? 1 : -1;
            context.navigateSelection(direction);
            e.preventDefault();
        }
    }
}

function handleKeyUp(e: KeyboardEvent): void {
    if (!window.pilotIsActive) {
        return;
    }

    promptState.setWeightChanging(false);

    promptState.setComposing(e.isComposing);
    if (promptState.isComposing()) {
        return;
    }
    if (contextState.isClosed()) {
        return;
    }

    const key = e.key as KeyCode;
    if ([KeyCode.ARROW_LEFT, KeyCode.ARROW_RIGHT, KeyCode.HOME, KeyCode.END].includes(key)) {
        context.updateContextPosition();
        e.preventDefault();
    }
}
