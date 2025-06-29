// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Fragment, h } from 'preact';
import classNames from 'classnames';
import { dispatchSetSelectedItem, dispatchSetVisibility } from '@/reducers/dispatchHelper';
import { escapeRegex, insertWordIntoPrompt } from '@/utils/editorUtil';
import { formatNumberWithUnits } from '@/utils/commonUtil';
import { openWiki } from '@/utils/externalUtil';
import { useEffect } from 'preact/hooks';
import { usePromptPilot } from '@/components/core/App';
import { ItemProps } from '@/types/props';

export const Items = () => {
    const { state, dispatch } = usePromptPilot();

    useEffect(() => {
        if (state.selectedItem) {
            const selectedElement = document.querySelector(`#suggestion-box li.selected`);
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [state.selectedItem]);

    const items = state.items.filter((item) => state.selectedCategory === 'all' || String(item.category) === state.selectedCategory);

    const handleSelectItem = (e: h.JSX.TargetedMouseEvent<HTMLUListElement>) => {
        const target = e.target as HTMLElement;
        const element = target.closest('li');
        if (element) {
            const item = items[+element.dataset.index!];
            if (
                item &&
                (state.selectedItem === null ||
                    state.selectedItem.value !== item.value ||
                    state.selectedItem.consequentTagModel?.value !== item.consequentTagModel?.value)
            ) {
                dispatchSetSelectedItem(dispatch, item);
            }
        }
    };

    const handleApplyItem = (e: h.JSX.TargetedMouseEvent<HTMLUListElement>) => {
        const target = e.target as HTMLElement;
        const element = target.closest('li');
        if (element) {
            e.stopPropagation();
            const item = items[+element.dataset.index!];
            insertWordIntoPrompt(state);
            if (target instanceof HTMLAnchorElement) {
                const tag = item.isOfficial ? item.value : item.consequentTagModel!.value;
                openWiki(tag);
            }
            dispatchSetVisibility(dispatch, false);
        }
    };

    let message = undefined;
    if (state.status === 'loading') {
        message = 'Loading models...';
    } else if (state.status === 'error') {
        message = 'An error occurred. Please reload the page.';
    } else if (state.message) {
        message = state.message;
    }

    return (
        <ul
            key={`${state.selectedCategory}_${message}_${items.length}`}
            class="list-container"
            onMouseMove={(e) => handleSelectItem(e)}
            onMouseDown={(e) => handleApplyItem(e)}
        >
            {message && (
                <li key={message} className="notice" data-type="">
                    {message}
                </li>
            )}
            {!message &&
                items.map((item, i) => {
                    return (
                        <li
                            key={item.value}
                            className={classNames(
                                `group${item.category}`,
                                state.selectedItem &&
                                    state.selectedItem.value === item.value &&
                                    state.selectedItem.consequentTagModel?.value === item.consequentTagModel?.value
                                    ? 'selected'
                                    : '',
                            )}
                            data-index={i}
                        >
                            {state.type === 'tag' && <span className={classNames('highlight', item.useCount > 0 ? 'recommend' : null)}></span>}
                            {state.type === 'tag' && (
                                <a className="wiki" style={{ visibility: item.postCount > 0 ? '' : 'hidden' }}>
                                    ?
                                </a>
                            )}
                            <span className="title" style={{ textDecoration: item.exists ? 'line-through' : undefined }}>
                                <HighlightedText item={item} />
                            </span>
                            {state.type === 'tag' && item.postCount > 0 && <span className="post-count">{formatNumberWithUnits(item.postCount)}</span>}
                        </li>
                    );
                })}
        </ul>
    );
};

const HighlightedText = ({ item }: { item: ItemProps }) => {
    const highlightText = (text: string) => {
        let result: (string | h.JSX.Element)[] = [text];

        item.matchedWords.forEach((matchedWord, wordIndex) => {
            const escapedWord = escapeRegex(matchedWord.word);
            const regex = new RegExp(`(${escapedWord})`, 'gi');

            const newResult: (string | h.JSX.Element)[] = [];

            result.forEach((part, partIndex) => {
                if (typeof part === 'string') {
                    const segments = part.split(regex);
                    segments.forEach((segment, segmentIndex) => {
                        if (segmentIndex % 2 === 1) {
                            newResult.push(<b key={`${wordIndex}-${partIndex}-${segmentIndex}`}>{segment}</b>);
                        } else if (segment) {
                            newResult.push(segment);
                        }
                    });
                } else {
                    newResult.push(part);
                }
            });

            result = newResult;
        });

        return result;
    };

    return (
        <>
            {highlightText(item.value)}
            {item.consequentTagModel && (
                <>
                    <span></span>
                    {highlightText(item.consequentTagModel.value)}
                </>
            )}
        </>
    );
};
