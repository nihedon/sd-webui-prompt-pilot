import * as db_lora from '@/services/loraService';
import { API_PREFIX, TEXTAREA_SELECTOR } from '@/const/common';
import { ResponseData } from '@/types/api';
import { initialize } from '@/components/core/App';

declare function gradioApp(): HTMLElement;
declare function onUiLoaded(callback: VoidFunction): void;

window.pilotIsActive = true;

onUiLoaded(() => {
    const promptTextareas = gradioApp().querySelectorAll<HTMLTextAreaElement>(TEXTAREA_SELECTOR);
    const computedStyle = getComputedStyle(promptTextareas[0]);
    let cssStyleString = '';
    const ignoredCssProperties = new Set<string>(['width', 'height', 'inline-size', 'block-size', 'resize']);
    for (let i = 0; i < computedStyle.length; i++) {
        const prop = computedStyle[i];
        if (!ignoredCssProperties.has(prop)) {
            const value = computedStyle.getPropertyValue(prop);
            cssStyleString += `${prop}: ${value};`;
        }
    }

    promptTextareas.forEach((_textarea) => {
        const textarea = _textarea as PilotTextArea;
        const dummyDiv = document.createElement('div') as HTMLDivElement & { caret: HTMLSpanElement };
        dummyDiv.className = 'prompt_pilot-dummy';
        textarea.parentNode?.insertBefore(dummyDiv, textarea.nextSibling);
        textarea.dummy = dummyDiv;

        const caretSpan = document.createElement('span');
        dummyDiv.caret = caretSpan;
    });

    const cssStyleSheet = new CSSStyleSheet();
    cssStyleSheet.replaceSync(`.prompt_pilot-dummy {${cssStyleString}}`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, cssStyleSheet];

    const promptPilotContainer = document.createElement('div');
    promptPilotContainer.id = 'prompt-pilot-container';
    gradioApp().appendChild(promptPilotContainer);

    initialize({
        isVisible: false,
        status: 'loading',
        type: 'tag',
        textarea: null,
        selectedCategory: 'all',
        selectedItem: null,
        items: [],
        pos: {
            offset_x: 0,
            offset_y: 0,
            x: 0,
            y: 0,
        },
        parseResult: {
            promptInfo: {
                prompt: '',
                caretPosition: 0,
                inputtingString: '',
                activeWordIndex: -1,
                words: [],
            },
            insertionInfo: {
                isMetaBlock: false,
                needPrependComma: false,
                needPrependSpace: false,
            },
        },
        message: '',
    });

    const refreshButtonSelector = '.extra-network-control--refresh';
    const refreshButtons = gradioApp().querySelectorAll<HTMLDivElement>(refreshButtonSelector);
    refreshButtons.forEach((button) => {
        button.addEventListener('click', () => {
            fetch(`${API_PREFIX}/refresh`, { method: 'POST' }).then(async (res) => {
                const resData: ResponseData | undefined = await res.json();
                db_lora.initializeLoraModels(resData);
            });
        });
    });
});
