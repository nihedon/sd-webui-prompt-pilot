// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from 'preact';
import { usePromptPilot } from '@/components/core/App';

export const Preview = () => {
    const { state } = usePromptPilot();
    return (
        state.status === 'success' &&
        state.selectedItem &&
        state.type === 'lora' && (
            <div className="preview">
                <img src={state.selectedItem ? (state.selectedItem.previewFile ?? undefined) : ''}></img>
            </div>
        )
    );
};
