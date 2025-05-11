// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Fragment, h } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { TEXTAREA_SELECTOR } from '@/const/common';
import { dispatchSetTextarea } from '@/reducers/dispatchHelper';
import { Preview } from '@/components/ui/PreviewSection';
import { Items } from '@/components/ui/ListSection';
import { Tabs } from '@/components/ui/TabsSection';
import { setDisplay, setPosition } from '@/helpers/styleHelper';
import { usePromptPilot } from '@/components/core/App';
import { TextareaEventHandlers } from '@/hooks/useTextareaHandlers';
import { useInitialization } from '@/hooks/useInitialization';

export const UITemplateContent = () => {
    const { state, dispatch } = usePromptPilot();

    const component = useRef(null);

    useInitialization(dispatch);

    const handleClickAnyware = useCallback(
        (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('#suggestion-box')) {
                e.stopPropagation();
                return;
            }
            if (target.matches(TEXTAREA_SELECTOR)) {
                dispatchSetTextarea(dispatch, target as PilotTextArea);
            } else {
                dispatchSetTextarea(dispatch, null);
            }
            e.stopPropagation();
        },
        [dispatch],
    );

    useEffect(() => {
        document.addEventListener('mousedown', handleClickAnyware);
        return () => document.removeEventListener('mousedown', handleClickAnyware);
    }, [handleClickAnyware]);

    return (
        <>
            <TextareaEventHandlers />
            <div id="suggestion-box" ref={component} style={{ ...setPosition(state.pos), ...setDisplay(state) }}>
                <Tabs></Tabs>
                <Items></Items>
                <Preview></Preview>
            </div>
        </>
    );
};
