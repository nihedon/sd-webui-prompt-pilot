import { usePromptPilot } from '@/components/core/App';
import { useEffect } from 'preact/hooks';

function useTextareaEvent<T extends Event>(eventName: string, handler: (e: T) => void, deps: readonly unknown[] = []) {
    const { state } = usePromptPilot();

    useEffect(() => {
        if (!window.pilotIsActive || !state.textarea) return;

        const typedHandler = handler as EventListener;
        state.textarea.addEventListener(eventName, typedHandler);

        return () => {
            state.textarea?.removeEventListener(eventName, typedHandler);
        };
    }, [state.textarea, eventName, handler, ...deps]);
}

export const useMouseEvent = (eventName: 'mousedown' | 'mouseup' | 'mousemove' | 'click', handler: (e: MouseEvent) => void, deps: readonly unknown[] = []) =>
    useTextareaEvent(eventName, handler, deps);

export const useKeyboardEvent = (eventName: 'keydown' | 'keyup' | 'keypress' | 'input', handler: (e: KeyboardEvent) => void, deps: readonly unknown[] = []) =>
    useTextareaEvent(eventName, handler, deps);

export const useCompositionEvent = (
    eventName: 'compositionstart' | 'compositionend' | 'compositionupdate',
    handler: (e: CompositionEvent) => void,
    deps: readonly unknown[] = [],
) => useTextareaEvent(eventName, handler, deps);
