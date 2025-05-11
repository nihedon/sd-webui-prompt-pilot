// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from 'preact';
import classNames from 'classnames';
import { dispatchSetTab } from '@/reducers/dispatchHelper';
import { usePromptPilot } from '@/components/core/App';

export const Tabs = () => {
    const { state, dispatch } = usePromptPilot();

    const handleSelectTab = (category: string) => {
        dispatchSetTab(dispatch, category);
    };

    const tabDefines = [
        ['all', 'ALL'],
        ['0', 'Gen'],
        ['1', 'Art'],
        ['3', 'Copy'],
        ['4', 'Chara'],
        ['5', 'Meta'],
    ];
    return (
        <div className={classNames('tab-container', state.status === 'success' && state.type === 'tag' ? '' : 'no-tab')}>
            {tabDefines.map(([category, title]) => (
                <div
                    key={category}
                    className={classNames('tab', `group${category}`, state.selectedCategory === category ? 'selected' : '')}
                    onClick={() => handleSelectTab(category)}
                >
                    {title}
                </div>
            ))}
        </div>
    );
};
