import * as db_lora from 'database/lora';
import * as db_sg from 'database/suggestion';
import * as db_tag from 'database/tag';
import * as editor from 'prompt/editor';
import * as parser from 'prompt/parser';
import { EXTENSION_ID } from 'shared/const/common';
import * as contextState from 'shared/state/context';
import * as promptState from 'shared/state/prompt';
import { PromptItemType } from 'shared/types/prompt';
import { LoraResult, SuggestionResult, TagResult } from 'shared/types/model';
import { debounceWithLeadingTrailing, escapeRegex, formatNumberWithUnits } from 'utils/index';

enum ContextType {
    WithTabs,
    WithoutTabs,
    Simple,
}

let noticeElement: HTMLElement;

const inputDebounceDelay = 200;

const debounceUpdateContext = debounceWithLeadingTrailing(updateContext, inputDebounceDelay);
const debounceSearchWithApi = debounceWithLeadingTrailing(db_tag.searchWithApi, 1100);

export function createContext(parent: HTMLElement) {
    contextState.setComponent(document.createElement('div'));
    const component = contextState.getComponent();
    component.id = 'suggestion-box';
    setVisible(component, false);
    component.style.top = '0';
    component.style.left = '0';
    parent.appendChild(component);

    contextState.setTabContainer(document.createElement('div'));
    const tabContainer = contextState.getTabContainer();
    tabContainer.className = 'tab-container';
    component.appendChild(tabContainer);

    const categories = ['All', 'Gen', 'Art', '', 'Copy', 'Chara', 'Meta'];
    for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        if (category === '') {
            continue;
        }
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        if (i === 0) {
            tabElement.classList.add('selected');
            contextState.setActiveTab(tabElement);
        }
        const groupClass = `group${i - 1}`;
        if (i > 0) {
            tabElement.dataset.category = groupClass;
            tabElement.classList.add(groupClass);
        }
        tabElement.textContent = category;
        tabElement.addEventListener('mousedown', (e) => {
            contextState.setActiveTab(e.target as HTMLDivElement);
            changeTab();
            e.preventDefault();
        });
        tabContainer.appendChild(tabElement);
    }

    contextState.setListContainer(document.createElement('ul'));
    const listContainer = contextState.getListContainer();
    component.appendChild(listContainer);

    contextState.setPreviewContainer(document.createElement('div'));
    const previewContainer = contextState.getPreviewContainer();
    previewContainer.className = 'preview';
    previewContainer.appendChild(document.createElement('img'));
    component.appendChild(previewContainer);

    listContainer.addEventListener('mousedown', (e) => {
        if (!contextState.hasVisibleResultList()) {
            return;
        }
        const result = contextState.getSelectedResult();
        if (result && (e.target instanceof HTMLLIElement || e.target instanceof HTMLAnchorElement)) {
            e.stopPropagation();
            editor.insertWordIntoPrompt(result);
            if (e.target instanceof HTMLAnchorElement) {
                const tagData = (result as TagResult).model;
                const tag = tagData.isOfficial ? tagData.value : tagData.consequentTagModel!.value;
                openWiki(tag);
            }
        }
    });

    listContainer.addEventListener('mousemove', (e) => {
        if (!contextState.hasVisibleResultList()) {
            return;
        }
        const element = (e.target as HTMLElement).closest('li');
        if (element) {
            changeSelectResult(contextState.getResult(+element.dataset.index!));
        }
    });

    noticeElement = document.createElement('li');
    noticeElement.className = 'notice';
}

export function setActiveTextarea(_textarea: PilotTextArea) {
    if (!window.pilotIsActive) {
        return;
    }
    contextState.setActiveTextarea(_textarea);
}

export function updateContextPosition() {
    if (!window.pilotIsActive) {
        return;
    }

    const activeTextarea = contextState.getActiveTextarea();
    const dummy = activeTextarea.dummy;
    const caret = dummy.caret;

    const caretIndex = contextState.getActiveTextarea().selectionEnd;
    const textBeforeCaret = contextState.getActiveTextarea().value.slice(0, caretIndex);
    const textAfterCaret = contextState.getActiveTextarea().value.slice(caretIndex);

    dummy.textContent = textBeforeCaret;
    caret.textContent = textAfterCaret[0] || '\u200b';
    dummy.appendChild(caret);

    const rect = caret.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(contextState.getActiveTextarea());

    const lineHeight = parseFloat(computedStyle.lineHeight.replace(/[^\d\.]+/, ''));

    const textareaRect = contextState.getActiveTextarea().getBoundingClientRect();
    const x = rect.left - textareaRect.left - contextState.getActiveTextarea().scrollLeft;
    const y = rect.top - textareaRect.top - contextState.getActiveTextarea().scrollTop + lineHeight;

    const component = contextState.getComponent();
    component.style.transform = `translate(${x}px, ${y}px)`;

    debounceUpdateContext();
}

function updateContext() {
    if (!window.pilotIsActive) {
        return;
    }
    if (promptState.isComposing()) {
        return;
    }

    if (db_tag.hasError() || db_lora.hasError() || db_sg.hasError()) {
        showContext(buildLoraAutocomplete(), ContextType.WithoutTabs, 'An error occurred. Please reload the page.');
        return;
    }

    if (!db_tag.isLoaded() || !db_lora.isLoaded() || !db_sg.isLoaded()) {
        showContext(buildLoraAutocomplete(), ContextType.WithoutTabs, 'Initializing database...');
        return;
    }

    parser.updatePromptState(contextState.getActiveTextarea().value, contextState.getActiveTextarea().selectionEnd);

    if (promptState.isMetaBlock()) {
        hide();
        return;
    }

    const existTags = new Set(
        promptState
            .getPromptItemList()
            .filter((promptItem, i) => i !== promptState.getActivePromptItemIndex() && promptItem.type !== PromptItemType.Lora)
            .map((promptItem) => promptItem.value),
    );

    const activePromptItem = promptState.getActivePromptItem();
    const activeWord = promptState.getActiveWord();
    if (activePromptItem.type === PromptItemType.Lora && activeWord === '') {
        hide();
        return;
    }

    if (!window.opts[`${EXTENSION_ID}_suggest_enabled`] && activeWord === '') {
        hide();
        return;
    }

    const priorityTag: string[] = [];
    if (activePromptItem.type !== PromptItemType.Lora) {
        let nearestTag: string | undefined;
        for (let i = promptState.getActivePromptItemIndex() - 1; i >= 0; i--) {
            const promptItem = promptState.getPromptItem(i);
            if (promptItem.type === PromptItemType.Lora) {
                continue;
            }
            nearestTag = promptItem.value;
            break;
        }
        const suggestions = db_sg.searchSuggestion(nearestTag, existTags);

        if (activeWord === '') {
            contextState.setResultList(suggestions.slice(0, 10));
            showContext(buildSuggestion(), ContextType.Simple);
            return;
        }

        for (const suggestion of suggestions) {
            if (suggestion.model.value.startsWith(activeWord)) {
                priorityTag.push(suggestion.model.value);
            }
        }

        if (activeWord.startsWith('*') && activeWord.length > 1) {
            debounceSearchWithApi(activeWord.substring(1), (resultSet) => {
                contextState.setResultList(resultSet);
                showContext(buildTagAutocomplete(existTags), ContextType.WithTabs);
            });
            contextState.clearResultList();
            showContext(null, ContextType.WithTabs, 'Waiting for API response...');
        } else {
            const result = db_tag.searchTag(activeWord, priorityTag);
            contextState.setResultList(result);
            showContext(buildTagAutocomplete(existTags), ContextType.WithTabs);
        }
    } else {
        contextState.setResultList(db_lora.searchLora(activeWord));
        showContext(buildLoraAutocomplete(), ContextType.WithoutTabs);
    }
}

function buildTagAutocomplete(existTags: Set<string>): DocumentFragment {
    const fragment = document.createDocumentFragment();
    contextState.getResultList<TagResult[]>().forEach((result) => {
        const element = document.createElement('li');

        const recommendMark = document.createElement('span');
        recommendMark.className = 'highlight';

        const helpLink = document.createElement('a');
        helpLink.className = 'wiki';

        const tagTitleElement = document.createElement('span');
        tagTitleElement.className = 'title';

        const postCountElement = document.createElement('span');
        postCountElement.className = 'post-count';

        let title = result.model.value;
        let tagTitle = title;
        for (const matchedWord of result.matchedWords) {
            const escapedWord = escapeRegex(matchedWord.word);
            tagTitle = tagTitle.replace(new RegExp(`(?<=^| |-|>)(${escapedWord})(?!>)`, 'gi'), '<b>$1</b>');
        }
        if (result.model.consequentTagModel) {
            title = result.model.consequentTagModel.value;
            tagTitle += '<span></span>' + title;
        }
        tagTitleElement.innerHTML = tagTitle;

        if (result.model.useCount > 0) {
            recommendMark.classList.add('recommend');
        }
        if (result.model.postCount > 0) {
            helpLink.textContent = '?';
            postCountElement.textContent = formatNumberWithUnits(result.model.postCount);
        }

        if (existTags.has(title)) {
            element.classList.add('contains');
        }
        element.classList.add(`group${result.model.category}`);

        element.appendChild(recommendMark);
        element.appendChild(helpLink);
        element.appendChild(tagTitleElement);
        element.appendChild(postCountElement);
        fragment.appendChild(element);
    });

    return fragment;
}

function buildLoraAutocomplete(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    contextState.getResultList<LoraResult[]>().forEach((result) => {
        const element = document.createElement('li');
        const tagElem = document.createElement('span');
        tagElem.className = 'title';

        let loraName = result.model.value;
        for (const matchWord of result.matchWords) {
            const escapedWord = escapeRegex(matchWord);
            loraName = loraName.replace(new RegExp(`(${escapedWord})(?!>)`, 'gi'), '<b>$1</b>');
        }
        tagElem.innerHTML = `&lt;lora:${loraName}&gt;`;

        element.classList.add(`group${result.model.group}`);
        element.appendChild(tagElem);
        fragment.appendChild(element);
    });

    return fragment;
}

function buildSuggestion(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    contextState.getResultList<SuggestionResult[]>().forEach((result) => {
        const element = document.createElement('li');
        element.textContent = result.model.value;
        element.classList.add('suggest');
        fragment.appendChild(element);
    });

    return fragment;
}

function adjustActiveTextarea() {
    const rect = contextState.getActiveTextarea().getBoundingClientRect();
    const component = contextState.getComponent();
    component.style.top = `${rect.top + window.scrollY}px`;
    component.style.left = `${rect.left + window.scrollX}px`;
}

function showContext(fragment: DocumentFragment | null, contextType: ContextType, pendingMessage: string | undefined = undefined) {
    adjustActiveTextarea();

    contextState.clearVisibleResultList();
    const listContainer = contextState.getListContainer();
    listContainer.scrollTop = 0;
    listContainer.innerHTML = '';

    if (contextType !== ContextType.Simple) {
        listContainer.appendChild(noticeElement);
    }

    if (fragment?.children?.length) {
        const resultList = contextState.getResultList();
        for (let i = 0; i < fragment.children.length; i++) {
            const element = fragment.children[i] as HTMLLIElement;
            resultList[i].view = element;
            element.dataset.index = i.toString();
            if (i === 0) {
                element.classList.add('selected');
            }
            element.dataset.navigateIndex = i.toString();
            contextState.addVisibleResult(resultList[i]);
        }
        listContainer.appendChild(fragment);
    }
    listContainer.scrollTop = 0;

    noticeElement.dataset.type = '';
    setVisible(noticeElement, false);
    if (pendingMessage) {
        noticeElement.textContent = pendingMessage;
        noticeElement.dataset.type = 'pending';
        setVisible(noticeElement, true);
    } else if (contextType !== ContextType.Simple && !contextState.hasVisibleResultList()) {
        noticeElement.textContent = 'Not found';
        setVisible(noticeElement, true);
    }

    const tabContainer = contextState.getTabContainer();
    if (contextType === ContextType.WithTabs) {
        tabContainer.classList.remove('no-tab');
        contextState.setActiveTab(tabContainer.children[0] as HTMLDivElement);
        changeTab();
    } else {
        if (!tabContainer.classList.contains('no-tab')) {
            tabContainer.classList.add('no-tab');
        }
    }

    const resultList = contextState.getVisibleResultList();
    if (resultList.length > 0) {
        contextState.setSelectedResult(resultList[0]);
    } else {
        contextState.setSelectedResult(undefined);
    }
    updateLoraPreview();

    contextState.setClosed(false);
    setVisible(contextState.getComponent(), true);
}

function updateLoraPreview() {
    const result = contextState.getSelectedResult();
    const previewContainer = contextState.getPreviewContainer();
    if (result instanceof LoraResult) {
        previewContainer.children[0].setAttribute('src', result.model.previewFile);
        setVisible(previewContainer, true);
    } else {
        previewContainer.children[0].removeAttribute('src');
        setVisible(previewContainer, false);
    }
}

export function navigateSelection(direction: number) {
    if (!contextState.hasVisibleResultList()) {
        return;
    }
    let selectedResult = contextState.getSelectedResult();
    if (selectedResult) {
        selectedResult.view!.classList.remove('selected');
    } else {
        selectedResult = contextState.getVisibleResult(0);
        contextState.setSelectedResult(selectedResult);
    }

    let selectedElement = selectedResult!.view!;
    if (selectedResult) {
        const selectedIndex = parseInt(selectedElement.dataset.navigateIndex ?? '0') + direction;
        const visibleResultList = contextState.getVisibleResultList();
        if (selectedIndex < 0) {
            contextState.setSelectedResult(visibleResultList[visibleResultList.length - 1] || null);
        } else if (selectedIndex >= visibleResultList.length) {
            contextState.setSelectedResult(visibleResultList[0] || null);
        } else {
            contextState.setSelectedResult(visibleResultList[selectedIndex]);
        }
    }

    selectedElement = contextState.getSelectedResult()!.view!;
    if (selectedElement) {
        selectedElement.classList.add('selected');
        selectedElement.scrollIntoView({ block: 'nearest' });
    }

    updateLoraPreview();
}

export function changeSelectResult(result: TagResult | LoraResult | SuggestionResult) {
    const currentSelectedItem = contextState.getSelectedResult();
    if (result !== currentSelectedItem) {
        if (currentSelectedItem) {
            currentSelectedItem!.view!.classList.remove('selected');
        }
        contextState.setSelectedResult(result);

        result.view!.classList.add('selected');
        updateLoraPreview();
    }
}

function changeTab() {
    const tabContainer = contextState.getTabContainer();

    for (const tab of Array.from(tabContainer.children)) {
        if (tab === contextState.getActiveTab()) {
            if (!tab.classList.contains('selected')) {
                tab.classList.add('selected');
            }
        } else {
            tab.classList.remove('selected');
        }
    }

    const listContainer = contextState.getListContainer();
    listContainer.scrollTop = 0;

    contextState.clearVisibleResultList();
    const category = contextState.getActiveTab().dataset.category;
    let index = 0;
    contextState.getResultList().forEach((result) => {
        const element = result.view!;
        if (element.classList.contains('notice')) {
            return;
        }
        if (category) {
            if (element.classList.contains(category)) {
                element.dataset.navigateIndex = index.toString();
                contextState.addVisibleResult(result);
                setVisible(element, true);
                index++;
            } else {
                element.dataset.navigateIndex = '-1';
                setVisible(element, false);
            }
        } else {
            element.dataset.navigateIndex = index.toString();
            contextState.addVisibleResult(result);
            setVisible(element, true);
            index++;
        }
    });

    setVisible(noticeElement, false);
    if (noticeElement.dataset.type === 'pending') {
        setVisible(noticeElement, true);
    } else if (!contextState.hasVisibleResultList()) {
        noticeElement.textContent = 'Not found';
        setVisible(noticeElement, true);
    }
    navigateSelection(0);
}

function setVisible(element: HTMLElement, visible: boolean) {
    element.style.display = visible ? '' : 'none';
}

function hide() {
    setVisible(contextState.getComponent(), false);
    contextState.clearResultList();
    contextState.clearVisibleResultList();
    contextState.setSelectedResult(undefined);
}

export function close() {
    if (!contextState.isClosed()) {
        contextState.setClosed(true);
        hide();
    }
}

export function openWiki(title: string) {
    if (title) {
        title = title.replace(' ', '_');
        if (/^[0-9]+$/.test(title)) {
            title = `~${title}`;
        }
        const domain = window.opts[`${EXTENSION_ID}_tag_source`] as string;
        window.open(`https://${domain}/wiki_pages/${encodeURIComponent(title)}`);
    }
}
