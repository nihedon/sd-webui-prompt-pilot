import { dispatchSetVisibility, dispatchSetPosition, dispatchSetSelectedItem } from '@/reducers/dispatchHelper';
import * as parser from '@/parsers/promptParser';
import { openWiki } from '@/utils/externalUtil';
import { calcContextPosition } from '@/utils/uiUtil';
import { insertWordIntoPrompt } from '@/utils/editorUtil';
import { ItemProps, Word } from '@/types/props';
import { useCompositionEvent, useKeyboardEvent, useMouseEvent } from '@/hooks/useTextareaEvents';
import { usePromptPilot } from '@/components/core/App';
import { useRef } from 'preact/hooks';
import { debounceWithLeadingTrailing } from '@/utils/commonUtil';
import { updateContext } from '@/hooks/usePromptContext';
import { DEBOUNCE_DELAY } from '@/const/common';

const debounceUpdateContext = debounceWithLeadingTrailing(updateContext, DEBOUNCE_DELAY);

let processingPromise: Promise<Word> | undefined;

type KeyCode = 'Tab' | 'Enter' | 'Backspace' | 'Delete' | 'ArrowDown' | 'ArrowUp' | 'Escape' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export const TextareaEventHandlers = () => {
    const { state, dispatch } = usePromptPilot();
    const isWeightMode = useRef(false);
    const isComposingRef = useRef(false);

    useMouseEvent(
        'mousedown',
        (e: MouseEvent) => {
            if (!e.ctrlKey) {
                return;
            }
            // waiting for the textarea to be updated
            setTimeout(() => {
                processingPromise = new Promise((resolve) => {
                    const textarea = state.textarea!;
                    const parseResult = parser.updatePromptState(textarea.value, textarea.selectionEnd);
                    dispatch({
                        type: 'SET_PARSE_RESULT',
                        payload: parseResult,
                    });
                    const { promptInfo } = parseResult;
                    const activeWord = promptInfo.words[promptInfo.activeWordIndex];
                    resolve(activeWord);
                });
            }, 50);
        },
        [state.textarea],
    );

    useMouseEvent(
        'mouseup',
        (e: MouseEvent) => {
            if (!e.ctrlKey) {
                return;
            }
            if (!processingPromise) {
                return;
            }
            processingPromise.then((word) => {
                if (word.type === 'tag') {
                    openWiki(word.value);
                }
            });
        },
        [state.textarea],
    );

    useCompositionEvent(
        'compositionstart',
        () => {
            console.debug('compositionstart');
            isComposingRef.current = true;
        },
        [state.textarea],
    );

    useCompositionEvent(
        'compositionend',
        () => {
            console.debug('compositionend');
            isComposingRef.current = false;
            if (!isWeightMode.current) {
                dispatchSetPosition(dispatch, calcContextPosition(state));
                debounceUpdateContext(state, dispatch);
            }
        },
        [state.textarea],
    );

    useKeyboardEvent(
        'input',
        () => {
            console.debug('input');
            if (isWeightMode.current || isComposingRef.current) {
                return;
            }
            dispatchSetPosition(dispatch, calcContextPosition(state));
            debounceUpdateContext(state, dispatch);
        },
        [state.textarea, state.isVisible, state.status],
    );

    useKeyboardEvent(
        'keydown',
        (e: KeyboardEvent) => {
            console.debug('keydown');
            const key = e.key as KeyCode;
            if (e.ctrlKey && (key === 'ArrowDown' || key === 'ArrowUp')) {
                isWeightMode.current = true;
                return;
            }

            if (!state.isVisible) {
                return;
            }
            if (isComposingRef.current) {
                return;
            }

            if (key === 'Escape') {
                dispatchSetVisibility(dispatch, false);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (!state.items.length) {
                return;
            }

            if (key === 'Tab') {
                const itemProps = state.selectedItem;
                if (itemProps) {
                    insertWordIntoPrompt(state);
                    if (e.shiftKey && state.type === 'tag') {
                        const tagResult = itemProps as ItemProps;
                        if (tagResult.isOfficial !== undefined) {
                            const tag = tagResult.isOfficial ? tagResult.value : tagResult.consequentTagModel!.value;
                            openWiki(tag);
                        }
                    }
                }
                e.preventDefault();
            } else if (key === 'ArrowDown' || key === 'ArrowUp') {
                if (!e.ctrlKey && !e.shiftKey) {
                    const direction = key === 'ArrowDown' ? 1 : -1;

                    const filteredItems = state.items.filter((item) => state.selectedCategory === 'all' || String(item.category) === state.selectedCategory);

                    let currentIndex = -1;
                    if (state.selectedItem) {
                        currentIndex = filteredItems.findIndex((item) => item.value === state.selectedItem!.value);
                    }

                    const nextIndex = (currentIndex + direction + filteredItems.length) % filteredItems.length;

                    dispatchSetSelectedItem(dispatch, filteredItems[nextIndex]);
                    e.preventDefault();
                }
            }
        },
        [state.textarea, state.isVisible, state.items, state.selectedItem, state.selectedCategory, state.parseResult],
    );

    useKeyboardEvent(
        'keyup',
        (e: KeyboardEvent) => {
            console.debug('keyup');
            isWeightMode.current = false;

            if (!state.isVisible) {
                return;
            }
            if (isComposingRef.current) {
                return;
            }
            const key = e.key as KeyCode;
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
                dispatchSetPosition(dispatch, calcContextPosition(state));
                debounceUpdateContext(state, dispatch);
                e.preventDefault();
            }
        },
        [state.textarea, state.isVisible],
    );

    return null;
};
