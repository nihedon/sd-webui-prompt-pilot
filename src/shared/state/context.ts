import { TagResult, LoraResult, SuggestionResult } from 'types/model';

let _component: HTMLDivElement;
let _activeTextarea: PilotTextArea;
let _closed: boolean = true;
let _visibleResultList: (TagResult | LoraResult | SuggestionResult)[] = [];
let _selectedResult: TagResult | LoraResult | SuggestionResult | undefined;
let _resultList: (TagResult | LoraResult | SuggestionResult)[] = [];

let _tabContainer: HTMLDivElement;
let _listContainer: HTMLUListElement;
let _previewContainer: HTMLDivElement;
let _activeTab: HTMLDivElement;

export function getComponent(): HTMLDivElement {
    return _component;
}

export function setComponent(component: HTMLDivElement): void {
    _component = component;
}

export function getActiveTextarea(): PilotTextArea | undefined {
    return _activeTextarea;
}

export function setActiveTextarea(textarea: PilotTextArea): void {
    _activeTextarea = textarea;
}

export function isClosed(): boolean {
    return _closed;
}

export function setClosed(closed: boolean): void {
    _closed = closed;
}

export function getVisibleResultList(): (TagResult | LoraResult | SuggestionResult)[] {
    return _visibleResultList;
}

export function getVisibleResult(index: number): TagResult | LoraResult | SuggestionResult {
    return _visibleResultList[index];
}

export function hasVisibleResultList(): boolean {
    return _visibleResultList.length > 0;
}

export function clearVisibleResultList(): void {
    _visibleResultList = [];
}

export function addVisibleResult(result: TagResult | LoraResult | SuggestionResult): void {
    _visibleResultList.push(result);
}

export function getSelectedResult(): TagResult | LoraResult | SuggestionResult | undefined {
    return _selectedResult;
}

export function setSelectedResult(result: TagResult | LoraResult | SuggestionResult | undefined): void {
    _selectedResult = result;
}

export function getResultList<T extends (TagResult | LoraResult | SuggestionResult)[]>(): T {
    return _resultList as T;
}

export function getResult<T extends TagResult | LoraResult | SuggestionResult>(index: number): T {
    return _resultList[index] as T;
}

export function setResultList(resultList: (TagResult | LoraResult | SuggestionResult)[]): void {
    _resultList = resultList;
}

export function clearResultList(): void {
    _resultList = [];
}

export function getTabContainer(): HTMLDivElement {
    return _tabContainer;
}

export function setTabContainer(tabContainer: HTMLDivElement): void {
    _tabContainer = tabContainer;
}

export function getListContainer(): HTMLUListElement {
    return _listContainer;
}

export function setListContainer(listContainer: HTMLUListElement): void {
    _listContainer = listContainer;
}

export function getPreviewContainer(): HTMLDivElement {
    return _previewContainer;
}

export function setPreviewContainer(previewContainer: HTMLDivElement): void {
    _previewContainer = previewContainer;
}

export function getActiveTab(): HTMLDivElement {
    return _activeTab;
}

export function setActiveTab(activeTabElement: HTMLDivElement): void {
    _activeTab = activeTabElement;
}
