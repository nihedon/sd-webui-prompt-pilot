"use strict";
(() => {
  // src/shared/const/common.ts
  var EXTENSION_ID = "prompt_pilot";
  var API_PREFIX = `/${EXTENSION_ID}/v1`;

  // src/shared/types/model.ts
  var Result = class {
    constructor(model) {
      this.model = model;
    }
  };
  var TagResult = class extends Result {
    constructor(model, isPriority) {
      super(model);
      this.matchedWords = [];
      this.isPriority = isPriority;
    }
    compare(other, query, joinedQuery, queries, resultCount) {
      if (this.isPriority && !other.isPriority) return -1;
      if (!this.isPriority && other.isPriority) return 1;
      if (this.model.value === query || joinedQuery && this.model.value === joinedQuery) return -1;
      if (other.model.value === query || joinedQuery && other.model.value === joinedQuery) return 1;
      if (other.matchedWords.length !== this.matchedWords.length) {
        return other.matchedWords.length - this.matchedWords.length;
      } else if (queries.length === this.matchedWords.length) {
        for (let i = 0; i < this.matchedWords.length; i++) {
          if (this.matchedWords[i].index !== other.matchedWords[i].index) {
            return this.matchedWords[i].index - other.matchedWords[i].index;
          }
        }
      }
      if (other.model.useCount !== this.model.useCount) {
        return other.model.useCount - this.model.useCount;
      }
      const count = resultCount[this.model.value] - resultCount[other.model.value];
      if (count !== 0) {
        return count;
      }
      if (other.model.postCount !== this.model.postCount) {
        return other.model.postCount - this.model.postCount;
      }
      return this.model.value < other.model.value ? -1 : 1;
    }
  };
  var LoraResult = class extends Result {
    constructor(model) {
      super(model);
      this.matchWords = [];
      this.startsWith = false;
    }
    compare(other, query, queries) {
      if (this.model.value === query) return -1;
      if (other.model.value === query) return 1;
      if (other.matchWords.length !== this.matchWords.length) {
        return other.matchWords.length - this.matchWords.length;
      }
      const thisStartsQuery = this.matchStarts(queries);
      const otherStartsQuery = other.matchStarts(queries);
      if (thisStartsQuery && !otherStartsQuery) return -1;
      if (!thisStartsQuery && otherStartsQuery) return 1;
      return this.model.value < other.model.value ? -1 : 1;
    }
    matchStarts(queries) {
      for (const q of queries) {
        for (const title of this.model.value.split(/[ _-]/g)) {
          if (title.startsWith(q)) {
            return true;
          }
        }
      }
      return false;
    }
  };
  var SuggestionResult = class extends Result {
    constructor(model) {
      super(model);
    }
  };

  // src/database/lora.ts
  var errorFlag = false;
  var loraModels;
  function isLoaded() {
    return loraModels;
  }
  function hasError() {
    return errorFlag;
  }
  function initializeLoraModels(resData) {
    if (!resData) {
      errorFlag = true;
      return;
    }
    try {
      loraModels = [];
      Object.entries(resData.loraModels).forEach(([lora_name, data]) => {
        loraModels.push({
          value: lora_name,
          group: "lora",
          searchWords: data.search_words,
          previewFile: data.preview_file
        });
      });
    } catch (e) {
      console.error(e);
      errorFlag = true;
    }
  }
  function searchLora(query) {
    const queries = query.toLowerCase().split(/[ _-]/g).filter((q) => q.trim() !== "");
    let resultSet = [];
    loraModels.forEach((lora) => {
      const matchWordSet = /* @__PURE__ */ new Set();
      for (const word of lora.searchWords) {
        const flatWord = word.replace(/[ _-]/g, "");
        queries.forEach((q) => {
          if (flatWord.includes(q)) {
            matchWordSet.add(q);
          }
        });
      }
      if (queries.length === matchWordSet.size) {
        const result = new LoraResult(lora);
        result.matchWords = [...matchWordSet];
        resultSet.push(result);
      }
    });
    resultSet = resultSet.sort((a, b) => a.compare(b, query, queries));
    let groupCounter = window.opts[`${EXTENSION_ID}_max_results_grouplora`];
    return resultSet.filter(() => {
      if (groupCounter > 0) {
        groupCounter -= 1;
        return true;
      }
      return false;
    });
  }

  // src/database/suggestion.ts
  var errorFlag2 = false;
  var suggestionModels;
  function isLoaded2() {
    return suggestionModels;
  }
  function hasError2() {
    return errorFlag2;
  }
  function initializeSuggestionModels(resData) {
    if (!resData) {
      errorFlag2 = true;
      return;
    }
    try {
      suggestionModels = {};
      Object.entries(resData.suggestionModels).forEach(([word, record]) => {
        const sorted = Object.entries(record).sort(([, count1], [, count2]) => count2 - count1);
        suggestionModels[word] = sorted.map(([word2, count]) => ({
          value: word2,
          count
        }));
      });
    } catch (e) {
      console.error(e);
      errorFlag2 = true;
    }
  }
  function searchSuggestion(nearestTag, existTags) {
    if (!nearestTag) {
      return [];
    }
    const suggestions = suggestionModels[nearestTag];
    if (!suggestions) return [];
    const result = [];
    for (const candidate of suggestions) {
      if (!existTags.has(candidate.value)) {
        result.push(new SuggestionResult(candidate));
      }
    }
    return result;
  }

  // src/database/tag.ts
  var errorFlag3 = false;
  var tagModels;
  var tagIndex;
  var alwaysUnderscoreTags;
  var alwaysSpaceTags;
  function isLoaded3() {
    return tagModels && tagIndex;
  }
  function hasError3() {
    return errorFlag3;
  }
  function initializeTagModels(resData) {
    if (!resData) {
      errorFlag3 = true;
      return;
    }
    try {
      alwaysUnderscoreTags = /* @__PURE__ */ new Set();
      window.opts[`${EXTENSION_ID}_always_underscore_tags`].split(/[\n,]/).forEach((tag) => {
        tag = tag.trim().replace(/_/g, " ");
        if (tag) {
          alwaysUnderscoreTags.add(tag);
        }
      });
      alwaysSpaceTags = /* @__PURE__ */ new Set();
      window.opts[`${EXTENSION_ID}_always_space_tags`].split(/[\n,]/).forEach((tag) => {
        tag = tag.trim().replace(/_/g, " ");
        if (tag) {
          alwaysSpaceTags.add(tag);
        }
      });
      tagModels = {};
      Object.entries(resData.tagModels).forEach(([tag, data]) => {
        const splitTag = tag.split(/[ _-]/g);
        const tagModel = tagModels[tag] ?? {
          value: tag,
          values: tag.split(/[ _-]/g),
          flatValue: splitTag.join(""),
          category: data.category,
          useCount: data.use_count,
          postCount: data.post_count,
          consequentTagModel: void 0,
          isOfficial: true
        };
        tagModel.isOfficial = true;
        for (const alias of data.aliases) {
          const splitAlias = alias.split(/[ _-]/g);
          const aliasTagModel = tagModels[alias] ?? {
            value: alias,
            values: alias.split(/[ _-]/g),
            flatValue: splitAlias.join(""),
            category: data.category,
            useCount: data.use_count,
            postCount: data.post_count,
            consequentTagModel: tagModel,
            isOfficial: false
          };
          if (aliasTagModel.isOfficial) {
            aliasTagModel.consequentTagModel = tagModel;
          } else {
            tagModels[alias] = aliasTagModel;
          }
        }
        tagModels[tag] = tagModel;
      });
      buildTagIndex(tagModels);
    } catch (e) {
      console.error(e);
      errorFlag3 = true;
    }
  }
  function getPrefixes(tag, maxLen = 3) {
    const set = /* @__PURE__ */ new Set();
    for (const t of tag.split(/[ _-]/g)) {
      const len = Math.min(maxLen, t.length);
      for (let i = 1; i <= len; i++) {
        set.add(t.substring(0, i));
      }
    }
    return set;
  }
  function buildTagIndex(tagModels2) {
    tagIndex = {};
    for (const tagModel of Object.values(tagModels2)) {
      const prefixes = getPrefixes(tagModel.value, 3);
      for (const p of prefixes) {
        if (!(p in tagIndex)) {
          tagIndex[p] = {};
        }
        tagIndex[p][tagModel.value] = tagModel;
      }
    }
  }
  function appendTagModel(tagModel) {
    if (tagModel.value && tagModel.value in tagModels) {
      return;
    }
    tagModels[tagModel.value] = tagModel;
    const prefixes = getPrefixes(tagModel.value, 3);
    for (const p of prefixes) {
      if (!(p in tagIndex)) {
        tagIndex[p] = {};
      }
      tagIndex[p][tagModel.value] = tagModel;
    }
  }
  function getTagModel(tag) {
    return tagModels[tag];
  }
  function searchTag(query, priorityTags) {
    const queries = query.toLowerCase().split(/[ _-]/g).filter((q) => q.trim() !== "");
    let joinedQuery;
    if (queries.length > 1) {
      joinedQuery = queries.join("");
    }
    const priorityTagSet = new Set(priorityTags);
    let resultList = [];
    const resultKeySet = {};
    queries.forEach((queryForCandidate) => {
      const prefixKey = queryForCandidate.length > 3 ? queryForCandidate.slice(0, 3) : queryForCandidate;
      const candidateTagList = tagIndex[prefixKey];
      for (const key in candidateTagList) {
        if (key in resultKeySet) {
          continue;
        }
        const tagModel = candidateTagList[key];
        const matchedWords = [];
        if (joinedQuery && tagModel.value.startsWith(joinedQuery)) {
          for (let i = 0; i < queries.length; i++) {
            matchedWords.push({ word: queries[i], index: i });
          }
        } else {
          const matchedQueryIndices = {};
          for (const query2 of queries) {
            if (!(0 in matchedQueryIndices) && tagModel.flatValue.startsWith(query2)) {
              matchedWords.push({ word: query2, index: 0 });
              matchedQueryIndices[0] = true;
              continue;
            }
            for (let i = 0; i < tagModel.values.length; i++) {
              if (!(i in matchedQueryIndices) && tagModel.values[i].startsWith(query2)) {
                matchedWords.push({ word: query2, index: i });
                matchedQueryIndices[i] = true;
                break;
              }
            }
          }
        }
        if (matchedWords.length > 0) {
          const result = new TagResult(tagModel, priorityTagSet.has(tagModel.value));
          result.matchedWords = matchedWords;
          resultList.push(result);
          resultKeySet[key] = true;
        }
      }
    });
    const consequentTagMatchCount = resultList.filter((r) => !r.model.consequentTagModel).reduce((acc, r) => {
      acc[r.model.value] = r.matchedWords.length;
      return acc;
    }, {});
    resultList = resultList.filter((r) => {
      if (!r.model.consequentTagModel) return true;
      const consequentTag = r.model.consequentTagModel.value;
      return !(consequentTag in consequentTagMatchCount) || consequentTagMatchCount[consequentTag] < r.matchedWords.length;
    });
    const resultTagCount = {};
    const resultCount = {};
    resultList.forEach((r) => {
      r.matchedWords.forEach((m) => {
        if (!resultTagCount[m.word]) {
          resultTagCount[m.word] = 0;
        }
        resultTagCount[m.word] += 1;
      });
    });
    resultList.forEach((r) => {
      resultCount[r.model.value] = r.matchedWords.reduce((acc, m) => acc + resultTagCount[m.word], 0);
    });
    resultList = resultList.sort((a, b) => a.compare(b, query, joinedQuery, queries, resultCount));
    const groupCounter = {};
    for (const key of ["0", "1", "3", "4", "5", "custom"]) {
      groupCounter[key] = window.opts[`${EXTENSION_ID}_max_results_group${key}`];
    }
    return resultList.filter((r) => {
      if (groupCounter[r.model.category] === -1 || groupCounter[r.model.category] > 0) {
        groupCounter[r.model.category] -= 1;
        return true;
      }
      return false;
    });
  }
  function searchWithApi(query, callback) {
    const endpoint = "https://danbooru.donmai.us/autocomplete.json";
    let apiUrl = endpoint;
    apiUrl += `?search[query]=${encodeURIComponent(query)}`;
    apiUrl += `&search[type]=tag`;
    apiUrl += `&limit=${50}`;
    apiUrl += `&version=1`;
    let resultSet = [];
    fetch(apiUrl).then(async (res) => {
      if (res.ok) {
        const json = await res.json();
        resultSet = json.map((item) => {
          let tag;
          let consequentTagModel = void 0;
          if (item.antecedent) {
            tag = item.antecedent;
            consequentTagModel = tagModels[item.label];
          } else {
            tag = item.label;
          }
          const splitTag = tag.split(/[ _-]/g);
          return new TagResult(
            {
              value: tag,
              values: splitTag,
              flatValue: splitTag.join(""),
              category: item.category.toString(),
              useCount: 0,
              postCount: item.post_count,
              consequentTagModel,
              isOfficial: consequentTagModel === void 0
            },
            false
          );
        });
        resultSet.forEach((r) => {
          appendTagModel(r.model);
        });
      }
      callback(resultSet);
    }).catch((err) => {
      console.error("Error fetching tag data:", err);
      callback(resultSet);
    });
  }

  // src/shared/state/context.ts
  var _component;
  var _activeTextarea;
  var _closed = true;
  var _visibleResultList = [];
  var _selectedResult;
  var _resultList = [];
  var _tabContainer;
  var _listContainer;
  var _previewContainer;
  var _activeTab;
  function getComponent() {
    return _component;
  }
  function setComponent(component) {
    _component = component;
  }
  function getActiveTextarea() {
    return _activeTextarea;
  }
  function setActiveTextarea(textarea) {
    _activeTextarea = textarea;
  }
  function isClosed() {
    return _closed;
  }
  function setClosed(closed) {
    _closed = closed;
  }
  function getVisibleResultList() {
    return _visibleResultList;
  }
  function getVisibleResult(index) {
    return _visibleResultList[index];
  }
  function hasVisibleResultList() {
    return _visibleResultList.length > 0;
  }
  function clearVisibleResultList() {
    _visibleResultList = [];
  }
  function addVisibleResult(result) {
    _visibleResultList.push(result);
  }
  function getSelectedResult() {
    return _selectedResult;
  }
  function setSelectedResult(result) {
    _selectedResult = result;
  }
  function getResultList() {
    return _resultList;
  }
  function getResult(index) {
    return _resultList[index];
  }
  function setResultList(resultList) {
    _resultList = resultList;
  }
  function clearResultList() {
    _resultList = [];
  }
  function getTabContainer() {
    return _tabContainer;
  }
  function setTabContainer(tabContainer) {
    _tabContainer = tabContainer;
  }
  function getListContainer() {
    return _listContainer;
  }
  function setListContainer(listContainer) {
    _listContainer = listContainer;
  }
  function getPreviewContainer() {
    return _previewContainer;
  }
  function setPreviewContainer(previewContainer) {
    _previewContainer = previewContainer;
  }
  function getActiveTab() {
    return _activeTab;
  }
  function setActiveTab(activeTabElement) {
    _activeTab = activeTabElement;
  }

  // src/shared/util.ts
  function debounceWithLeadingTrailing(func, wait) {
    let timeout = null;
    let lastCallTime = null;
    let lastArgs = null;
    let hasPendingTrailing = false;
    return (...args) => {
      const now = Date.now();
      if (!lastCallTime || now - lastCallTime >= wait) {
        func(...args);
        hasPendingTrailing = false;
      } else {
        hasPendingTrailing = true;
        lastArgs = args;
      }
      lastCallTime = now;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (hasPendingTrailing && lastArgs) {
          func(...lastArgs);
        }
        lastCallTime = null;
        hasPendingTrailing = false;
      }, wait);
    };
  }
  async function fetchWithRetry(input, init, retries = 10, delay = 1e3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(input, init);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res;
      } catch (e) {
        if (attempt === retries) throw e;
        console.warn(`[Prompt Pilot] Retrying... (${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Unexpected error in fetchWithRetry");
  }
  function formatNumberWithUnits(num) {
    if (Math.abs(num) >= 1e12) {
      return (num / 1e12).toFixed(1) + "T";
    } else if (Math.abs(num) >= 1e9) {
      return (num / 1e9).toFixed(1) + "G";
    } else if (Math.abs(num) >= 1e6) {
      return (num / 1e6).toFixed(1) + "M";
    } else if (Math.abs(num) >= 1e3) {
      return (num / 1e3).toFixed(1) + "K";
    } else {
      return num.toString();
    }
  }
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|\[\]\\]/g, "\\$&");
  }
  function escapePrompt(str) {
    return str.replace(/[{}()\[\]\\]/g, "\\$&");
  }
  function unescapePrompt(str) {
    let result = "";
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "\\") {
        if (i + 1 < str.length) {
          result += str[i + 1];
          i++;
        } else {
          result += "\\";
        }
      } else {
        result += str[i];
      }
    }
    return result;
  }
  function splitStringWithIndices(input, delimiter) {
    const result = [];
    const regex = delimiter;
    let match;
    let lastIndex = 0;
    while ((match = regex.exec(input)) !== null) {
      result.push({ word: input.slice(lastIndex, match.index), position: lastIndex });
      lastIndex = regex.lastIndex;
    }
    result.push({ word: input.slice(lastIndex), position: lastIndex });
    return result;
  }

  // src/shared/state/prompt.ts
  var _prompt;
  var _caret;
  var _isComposing = false;
  var _isWeightChanging = false;
  var _activeWord;
  var _activePromptItemIndex;
  var _promptItems;
  var _isMetaBlock;
  var _prependComma;
  var _prependSpace;
  function initialize(prompt, caret) {
    _prompt = prompt;
    _caret = caret;
    _activeWord = "";
    _activePromptItemIndex = -1;
    _promptItems = [];
    _isMetaBlock = false;
    _prependComma = false;
    _prependSpace = false;
  }
  function getPrompt() {
    return _prompt;
  }
  function getCaret() {
    return _caret;
  }
  function isComposing() {
    return _isComposing;
  }
  function setComposing(isComposing2) {
    _isComposing = isComposing2;
  }
  function isWeightChanging() {
    return _isWeightChanging;
  }
  function setWeightChanging(isWeightChanging2) {
    _isWeightChanging = isWeightChanging2;
  }
  function getActiveWord() {
    return _activeWord;
  }
  function setActiveWord(activeWord) {
    _activeWord = activeWord;
  }
  function getActivePromptItemIndex() {
    return _activePromptItemIndex;
  }
  function setActivePromptItemIndex(activeTagIndex) {
    _activePromptItemIndex = activeTagIndex;
  }
  function getPromptItemList() {
    return _promptItems;
  }
  function getPromptItem(index) {
    return _promptItems[index];
  }
  function getActivePromptItem() {
    return _promptItems[_activePromptItemIndex];
  }
  function addPromptItem(promptItem) {
    _promptItems.push(promptItem);
  }
  function isMetaBlock() {
    return _isMetaBlock;
  }
  function setMetaBlock(isMetaBlock2) {
    _isMetaBlock = isMetaBlock2;
  }
  function needPrependComma() {
    return _prependComma;
  }
  function setNeedPrependComma(prependComma) {
    _prependComma = prependComma;
  }
  function needPrependSpace() {
    return _prependSpace;
  }
  function setNeedPrependSpace(prependSpace) {
    _prependSpace = prependSpace;
  }

  // src/prompt/editor.ts
  function insertWordIntoPrompt(result) {
    if (!result) {
      result = getSelectedResult();
    }
    if (!result) {
      return;
    }
    let insertionInfo;
    if (result instanceof TagResult) {
      insertionInfo = getTagInsertionInfo(result.model);
    } else if (result instanceof LoraResult) {
      insertionInfo = getLoraInsertionInfo(result.model);
    } else if (result instanceof SuggestionResult) {
      insertionInfo = getSuggestionInsertionInfo(result.model);
    } else {
      return;
    }
    const usingExecCommand = window.opts[`${EXTENSION_ID}_using_execCommand`];
    const textarea = getActiveTextarea();
    if (usingExecCommand) {
      textarea.focus();
      textarea.setSelectionRange(insertionInfo.range.start, insertionInfo.range.end);
      document.execCommand("insertText", false, insertionInfo.insertText);
    } else {
      const val = textarea.value;
      textarea.value = val.slice(0, insertionInfo.range.start) + insertionInfo.insertText + val.slice(insertionInfo.range.end);
    }
    textarea.selectionStart = textarea.selectionEnd = insertionInfo.range.start + insertionInfo.insertText.length;
  }
  function getTagInsertionInfo(model) {
    let startPosition = getActivePromptItem().position;
    let offset = -1;
    const tags = [];
    tags.push(model.value);
    if (model.consequentTagModel) {
      tags.push(model.consequentTagModel.value);
    }
    const insertionRange = getPrompt().substring(startPosition, getCaret());
    for (const wordInfo of splitStringWithIndices(insertionRange, /[ _-]/g)) {
      for (const tag of tags) {
        if (wordInfo.word === "") {
          continue;
        }
        const escapedPart = escapeRegex(unescapePrompt(wordInfo.word));
        const match = new RegExp(`(?:^|[ _-])${escapedPart}`, "gi").exec(tag);
        if (match && match.index !== -1) {
          if (offset === -1 || offset > wordInfo.position) {
            offset = wordInfo.position;
          }
        }
      }
    }
    if (offset > -1) {
      startPosition += offset;
    }
    let insertTag = model.isOfficial ? model.value : model.consequentTagModel.value;
    const source = window.opts[`${EXTENSION_ID}_tag_source`].replace(/\./g, "_");
    const delimiter = window.opts[`${EXTENSION_ID}_${source}_${model.category}_tag_delimiter`] ?? "auto";
    if (!alwaysSpaceTags.has(insertTag)) {
      let replaceToUnderscore = false;
      if (alwaysUnderscoreTags.has(insertTag)) {
        replaceToUnderscore = true;
      } else if (delimiter === "underscore") {
        replaceToUnderscore = true;
      } else if (delimiter === "auto") {
        replaceToUnderscore = getActiveWord().includes("_");
      }
      if (replaceToUnderscore) {
        insertTag = insertTag.replace(/ /g, "_");
      }
    }
    if (needPrependComma()) {
      insertTag = ", " + insertTag;
    } else if (offset <= 0 && needPrependSpace()) {
      insertTag = " " + insertTag;
    }
    insertTag = escapePrompt(insertTag);
    const appendComma = window.opts[`${EXTENSION_ID}_append_comma`];
    if (appendComma) {
      insertTag += ",";
    }
    insertTag += " ";
    return { range: { start: startPosition, end: getCaret() }, insertText: insertTag };
  }
  function getLoraInsertionInfo(model) {
    const startPosition = getActivePromptItem().position;
    let loraName = model.value;
    const match = getPrompt().substring(startPosition).match(/^<(?:lora|lyco):[^<>:]+(:.+>)/i);
    let caret = getCaret();
    if (match) {
      caret = startPosition + match[0].length;
      loraName += match[1];
    } else {
      loraName += ":1>";
    }
    loraName += " ";
    return { range: { start: startPosition, end: caret }, insertText: loraName };
  }
  function getSuggestionInsertionInfo(model) {
    const startPosition = getActivePromptItem().position;
    const tag = getTagModel(model.value);
    const category = tag?.category ?? "custom";
    let word = escapePrompt(model.value);
    const source = window.opts[`${EXTENSION_ID}_tag_source`].replace(/\./g, "_");
    const delimiter = window.opts[`${EXTENSION_ID}_${source}_${category}_tag_delimiter`] ?? "auto";
    if (!alwaysSpaceTags.has(word)) {
      let replaceToUnderscore = false;
      if (alwaysUnderscoreTags.has(word)) {
        replaceToUnderscore = true;
      } else if (delimiter === "underscore") {
        replaceToUnderscore = true;
      } else if (delimiter === "auto") {
        replaceToUnderscore = getActiveWord().includes("_");
      }
      if (replaceToUnderscore) {
        word = word.replace(/ /g, "_");
      }
    }
    if (needPrependComma()) {
      word = ", " + word;
    } else if (needPrependSpace()) {
      word = " " + word;
    }
    const appendComma = window.opts[`${EXTENSION_ID}_append_comma`];
    if (appendComma) {
      word += ",";
    }
    word += " ";
    return { range: { start: startPosition, end: getCaret() }, insertText: word };
  }

  // src/prompt/parser.ts
  var openerToType = {
    "(": 1 /* Paren */,
    "[": 2 /* Square */,
    "{": 3 /* Curly */,
    "<": 4 /* Angle */
  };
  var closerToType = {
    ")": 1 /* Paren */,
    "]": 2 /* Square */,
    "}": 3 /* Curly */,
    ">": 4 /* Angle */
  };
  var closerForType = {
    [0 /* Root */]: "",
    [1 /* Paren */]: ")",
    [2 /* Square */]: "]",
    [3 /* Curly */]: "}",
    [4 /* Angle */]: ">",
    [5 /* Lora */]: ">"
  };
  var delimiters = {
    [0 /* Root */]: /* @__PURE__ */ new Set([","]),
    [1 /* Paren */]: /* @__PURE__ */ new Set([","]),
    [2 /* Square */]: /* @__PURE__ */ new Set([",", ":", "|"]),
    [3 /* Curly */]: /* @__PURE__ */ new Set([",", "|"]),
    [4 /* Angle */]: /* @__PURE__ */ new Set([",", "|"]),
    [5 /* Lora */]: /* @__PURE__ */ new Set()
  };
  var delimitersWithoutComma = /* @__PURE__ */ new Set([",", "|", ":", "(", "[", "{", "<"]);
  var PREFIX_LENGTH = 5;
  var metaKeywords = ["BREAK", "AND", "ADDCOMM", "ADDBASE", "ADDCOL", "ADDROW"];
  var dynamicPromptRegex = /\{([\d-]+\$\$(?:[^\}]+?\$\$)?)(.*)\}/g;
  var matchMetaKeywordRegex = new RegExp(`\\b(${metaKeywords.join("|")})\\b`, "g");
  function makePromptItem(nestType, position) {
    const promptItemType = nestType === 5 /* Lora */ ? 1 /* Lora */ : 0 /* Tag */;
    return {
      value: "",
      position,
      type: promptItemType,
      isActive: false
    };
  }
  function updatePromptState(prompt, caret) {
    initialize(prompt, caret);
    prompt = prompt.replace(matchMetaKeywordRegex, (match) => ",".padEnd(match.length, "\0"));
    prompt = prompt.replace(dynamicPromptRegex, (_, group1, group2) => {
      const stars = "\0".repeat(group1.length);
      return `{${stars}${group2}}`;
    });
    const nestTypes = [0 /* Root */];
    let isEscaped = false;
    let delimiter;
    let isNewLine = true;
    function flush(promptItem2) {
      promptItem2.value = promptItem2.value.trim();
      if (promptItem2.isActive || promptItem2.value !== "") {
        addPromptItem(promptItem2);
        isNewLine = false;
        delimiter = void 0;
      }
    }
    function updateContextState(char) {
      if (char === "\n") {
        isNewLine = true;
      } else if (delimitersWithoutComma.has(char)) {
        delimiter = char;
      }
    }
    function updatePrependFlags(promptItem2) {
      if (promptItem2.isActive && getPromptItemList().length > 0) {
        if (delimiter === void 0) {
          setNeedPrependComma(true);
          if (!isNewLine) {
            setNeedPrependSpace(true);
          }
        } else if (delimiter === ",") {
          setNeedPrependSpace(true);
        }
      }
    }
    function setActivePromptItem(promptItem2) {
      promptItem2.isActive = true;
      let activeTag = getActiveWord();
      if (isEscaped) {
        activeTag += "\\";
        setActiveWord(activeTag);
      }
      setActiveWord(promptItem2.value.trim());
      setActivePromptItemIndex(getPromptItemList().length);
    }
    let promptItem = makePromptItem(0 /* Root */, 0);
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt[i];
      if (i === caret) {
        setActivePromptItem(promptItem);
      }
      const currentNestType = nestTypes[nestTypes.length - 1];
      if (char === "\0") {
        if (promptItem.isActive) {
          setMetaBlock(true);
          setNeedPrependSpace(true);
        }
        promptItem.position++;
        continue;
      }
      if (char === "\n") {
        updatePrependFlags(promptItem);
        flush(promptItem);
        updateContextState(char);
        promptItem = makePromptItem(currentNestType, i + 1);
        isEscaped = false;
        continue;
      }
      if (isEscaped) {
        promptItem.value += char;
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char in openerToType) {
        let openerType = openerToType[char];
        if (openerType === 4 /* Angle */) {
          if (prompt.length - i > PREFIX_LENGTH) {
            const loraPrefix = prompt.substring(i + 1, i + PREFIX_LENGTH + 1);
            if (loraPrefix === "lora:" || loraPrefix === "lyco:") {
              openerType = 5 /* Lora */;
            }
          }
        }
        nestTypes.push(openerType);
        if (openerType === 5 /* Lora */) {
          i += PREFIX_LENGTH;
          if (i - caret >= 0 && i - caret < PREFIX_LENGTH) {
            setMetaBlock(true);
          }
        }
        updatePrependFlags(promptItem);
        flush(promptItem);
        updateContextState(char);
        if (openerType === 5 /* Lora */) {
          promptItem = makePromptItem(openerType, i + 1);
        } else {
          promptItem = makePromptItem(openerType, i);
        }
        continue;
      }
      if (char in closerToType) {
        const expectedCloser = closerForType[currentNestType];
        if (char !== expectedCloser) {
          promptItem.value += char;
          continue;
        }
        if (currentNestType === 1 /* Paren */ || currentNestType === 2 /* Square */) {
          const colonIndex = promptItem.value.lastIndexOf(":");
          if (colonIndex >= 0) {
            const word = promptItem.value.substring(0, colonIndex);
            const weightValue = promptItem.value.substring(colonIndex + 1);
            if (isNumber(weightValue)) {
              promptItem.value = word;
              if (promptItem.isActive && i - caret <= weightValue.length) {
                setMetaBlock(true);
              }
            }
          } else if (currentNestType === 2 /* Square */) {
            if (isNumber(promptItem.value)) {
              if (promptItem.isActive && i - caret <= promptItem.value.length) {
                setMetaBlock(true);
              }
              promptItem.value = "";
            }
          }
        } else if (currentNestType === 5 /* Lora */) {
          const colonIndex = promptItem.value.indexOf(":");
          if (colonIndex >= 0) {
            const loraName = promptItem.value.substring(0, colonIndex);
            const multiplier = promptItem.value.substring(colonIndex + 1);
            if (promptItem.isActive && i - caret <= multiplier.length) {
              setMetaBlock(true);
            }
            promptItem.value = loraName;
          }
        }
        nestTypes.pop();
        updatePrependFlags(promptItem);
        flush(promptItem);
        updateContextState(char);
        promptItem = makePromptItem(nestTypes[nestTypes.length - 1], i + 1);
        continue;
      }
      if (currentNestType === 5 /* Lora */) {
        if (promptItem.value !== "" || char !== " ") {
          promptItem.value += char;
        }
        continue;
      }
      if (delimiters[currentNestType]?.has(char)) {
        updatePrependFlags(promptItem);
        flush(promptItem);
        updateContextState(char);
        promptItem = makePromptItem(currentNestType, i + 1);
        continue;
      }
      if (promptItem.value === "") {
        promptItem.position = i;
      }
      promptItem.value += char;
    }
    if (getActivePromptItemIndex() < 0) {
      setActivePromptItem(promptItem);
    }
    getPromptItemList().forEach((promptItem2) => {
      promptItem2.value = promptItem2.value.replace(/_/g, " ");
    });
    updatePrependFlags(promptItem);
    flush(promptItem);
  }
  function isNumber(value) {
    if (value.trim() === "") {
      return false;
    }
    return !isNaN(+value);
  }

  // src/ui/context.ts
  var noticeElement;
  var inputDebounceDelay = 200;
  var debounceUpdateContext = debounceWithLeadingTrailing(updateContext, inputDebounceDelay);
  var debounceSearchWithApi = debounceWithLeadingTrailing(searchWithApi, 1100);
  function createContext(parent) {
    setComponent(document.createElement("div"));
    const component = getComponent();
    component.id = "suggestion-box";
    setVisible(component, false);
    component.style.top = "0";
    component.style.left = "0";
    parent.appendChild(component);
    setTabContainer(document.createElement("div"));
    const tabContainer = getTabContainer();
    tabContainer.className = "tab-container";
    component.appendChild(tabContainer);
    const categories = ["All", "Gen", "Art", "", "Copy", "Chara", "Meta"];
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      if (category === "") {
        continue;
      }
      const tabElement = document.createElement("div");
      tabElement.className = "tab";
      if (i === 0) {
        tabElement.classList.add("selected");
        setActiveTab(tabElement);
      }
      const groupClass = `group${i - 1}`;
      if (i > 0) {
        tabElement.dataset.category = groupClass;
        tabElement.classList.add(groupClass);
      }
      tabElement.textContent = category;
      tabElement.addEventListener("mousedown", (e) => {
        setActiveTab(e.target);
        changeTab();
        e.preventDefault();
      });
      tabContainer.appendChild(tabElement);
    }
    setListContainer(document.createElement("ul"));
    const listContainer = getListContainer();
    component.appendChild(listContainer);
    setPreviewContainer(document.createElement("div"));
    const previewContainer = getPreviewContainer();
    previewContainer.className = "preview";
    previewContainer.appendChild(document.createElement("img"));
    component.appendChild(previewContainer);
    listContainer.addEventListener("mousedown", (e) => {
      if (!hasVisibleResultList()) {
        return;
      }
      const result = getSelectedResult();
      if (result && (e.target instanceof HTMLLIElement || e.target instanceof HTMLAnchorElement)) {
        e.stopPropagation();
        insertWordIntoPrompt(result);
        if (e.target instanceof HTMLAnchorElement) {
          const tagData = result.model;
          const tag = tagData.isOfficial ? tagData.value : tagData.consequentTagModel.value;
          openWiki(tag);
        }
      }
    });
    listContainer.addEventListener("mousemove", (e) => {
      if (!hasVisibleResultList()) {
        return;
      }
      const element = e.target.closest("li");
      if (element) {
        changeSelectResult(getResult(+element.dataset.index));
      }
    });
    noticeElement = document.createElement("li");
    noticeElement.className = "notice";
  }
  function setActiveTextarea2(_textarea) {
    if (!window.pilotIsActive) {
      return;
    }
    setActiveTextarea(_textarea);
  }
  function updateContextPosition() {
    if (!window.pilotIsActive) {
      return;
    }
    const textarea = getActiveTextarea();
    if (!textarea) {
      return;
    }
    const dummy = textarea.dummy;
    const caret = dummy.caret;
    const caretIndex = textarea.selectionEnd;
    const textBeforeCaret = textarea.value.slice(0, caretIndex);
    const textAfterCaret = textarea.value.slice(caretIndex);
    dummy.textContent = textBeforeCaret;
    caret.textContent = textAfterCaret[0] || "\u200B";
    dummy.appendChild(caret);
    const rect = caret.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight.replace(/[^\d\.]+/, ""));
    const textareaRect = textarea.getBoundingClientRect();
    const x = rect.left - textareaRect.left - textarea.scrollLeft;
    const y = rect.top - textareaRect.top - textarea.scrollTop + lineHeight;
    const component = getComponent();
    component.style.transform = `translate(${x}px, ${y}px)`;
    debounceUpdateContext();
  }
  function updateContext() {
    if (!window.pilotIsActive) {
      return;
    }
    if (isComposing()) {
      return;
    }
    if (hasError3() || hasError() || hasError2()) {
      showContext(buildLoraAutocomplete(), 1 /* WithoutTabs */, "An error occurred. Please reload the page.");
      return;
    }
    if (!isLoaded3() || !isLoaded() || !isLoaded2()) {
      showContext(buildLoraAutocomplete(), 1 /* WithoutTabs */, "Initializing database...");
      return;
    }
    const textarea = getActiveTextarea();
    updatePromptState(textarea.value, textarea.selectionEnd);
    if (isMetaBlock()) {
      hide();
      return;
    }
    const existTags = new Set(
      getPromptItemList().filter((promptItem, i) => i !== getActivePromptItemIndex() && promptItem.type !== 1 /* Lora */).map((promptItem) => promptItem.value)
    );
    const activePromptItem = getActivePromptItem();
    const activeWord = getActiveWord();
    if (activePromptItem.type === 1 /* Lora */ && activeWord === "") {
      hide();
      return;
    }
    if (!window.opts[`${EXTENSION_ID}_suggest_enabled`] && activeWord === "") {
      hide();
      return;
    }
    const priorityTag = [];
    if (activePromptItem.type !== 1 /* Lora */) {
      let nearestTag;
      for (let i = getActivePromptItemIndex() - 1; i >= 0; i--) {
        const promptItem = getPromptItem(i);
        if (promptItem.type === 1 /* Lora */) {
          continue;
        }
        nearestTag = promptItem.value;
        break;
      }
      const suggestions = searchSuggestion(nearestTag, existTags);
      if (activeWord === "") {
        setResultList(suggestions.slice(0, 10));
        showContext(buildSuggestion(), 2 /* Simple */);
        return;
      }
      for (const suggestion of suggestions) {
        if (suggestion.model.value.startsWith(activeWord)) {
          priorityTag.push(suggestion.model.value);
        }
      }
      if (activeWord.startsWith("*") && activeWord.length > 1) {
        debounceSearchWithApi(activeWord.substring(1), (resultSet) => {
          setResultList(resultSet);
          showContext(buildTagAutocomplete(existTags), 0 /* WithTabs */);
        });
        clearResultList();
        showContext(null, 0 /* WithTabs */, "Waiting for API response...");
      } else {
        const result = searchTag(activeWord, priorityTag);
        setResultList(result);
        showContext(buildTagAutocomplete(existTags), 0 /* WithTabs */);
      }
    } else {
      setResultList(searchLora(activeWord));
      showContext(buildLoraAutocomplete(), 1 /* WithoutTabs */);
    }
  }
  function buildTagAutocomplete(existTags) {
    const fragment = document.createDocumentFragment();
    getResultList().forEach((result) => {
      const element = document.createElement("li");
      const recommendMark = document.createElement("span");
      recommendMark.className = "highlight";
      const helpLink = document.createElement("a");
      helpLink.className = "wiki";
      const tagTitleElement = document.createElement("span");
      tagTitleElement.className = "title";
      const postCountElement = document.createElement("span");
      postCountElement.className = "post-count";
      let title = result.model.value;
      let tagTitle = title;
      for (const matchedWord of result.matchedWords) {
        const escapedWord = escapeRegex(matchedWord.word);
        tagTitle = tagTitle.replace(new RegExp(`(?<=^| |-|>)(${escapedWord})(?!>)`, "gi"), "<b>$1</b>");
      }
      if (result.model.consequentTagModel) {
        title = result.model.consequentTagModel.value;
        tagTitle += "<span></span>" + title;
      }
      tagTitleElement.innerHTML = tagTitle;
      if (result.model.useCount > 0) {
        recommendMark.classList.add("recommend");
      }
      if (result.model.postCount > 0) {
        helpLink.textContent = "?";
        postCountElement.textContent = formatNumberWithUnits(result.model.postCount);
      }
      if (existTags.has(title)) {
        element.classList.add("contains");
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
  function buildLoraAutocomplete() {
    const fragment = document.createDocumentFragment();
    getResultList().forEach((result) => {
      const element = document.createElement("li");
      const tagElem = document.createElement("span");
      tagElem.className = "title";
      let loraName = result.model.value;
      for (const matchWord of result.matchWords) {
        const escapedWord = escapeRegex(matchWord);
        loraName = loraName.replace(new RegExp(`(${escapedWord})(?!>)`, "gi"), "<b>$1</b>");
      }
      tagElem.innerHTML = `&lt;lora:${loraName}&gt;`;
      element.classList.add(`group${result.model.group}`);
      element.appendChild(tagElem);
      fragment.appendChild(element);
    });
    return fragment;
  }
  function buildSuggestion() {
    const fragment = document.createDocumentFragment();
    getResultList().forEach((result) => {
      const element = document.createElement("li");
      element.textContent = result.model.value;
      element.classList.add("suggest");
      fragment.appendChild(element);
    });
    return fragment;
  }
  function adjustActiveTextarea() {
    const rect = getActiveTextarea().getBoundingClientRect();
    const component = getComponent();
    component.style.top = `${rect.top + window.scrollY}px`;
    component.style.left = `${rect.left + window.scrollX}px`;
  }
  function showContext(fragment, contextType, pendingMessage = void 0) {
    adjustActiveTextarea();
    clearVisibleResultList();
    const listContainer = getListContainer();
    listContainer.scrollTop = 0;
    listContainer.innerHTML = "";
    if (contextType !== 2 /* Simple */) {
      listContainer.appendChild(noticeElement);
    }
    if (fragment?.children?.length) {
      const resultList2 = getResultList();
      for (let i = 0; i < fragment.children.length; i++) {
        const element = fragment.children[i];
        resultList2[i].view = element;
        element.dataset.index = i.toString();
        if (i === 0) {
          element.classList.add("selected");
        }
        element.dataset.navigateIndex = i.toString();
        addVisibleResult(resultList2[i]);
      }
      listContainer.appendChild(fragment);
    }
    listContainer.scrollTop = 0;
    noticeElement.dataset.type = "";
    setVisible(noticeElement, false);
    if (pendingMessage) {
      noticeElement.textContent = pendingMessage;
      noticeElement.dataset.type = "pending";
      setVisible(noticeElement, true);
    } else if (contextType !== 2 /* Simple */ && !hasVisibleResultList()) {
      noticeElement.textContent = "Not found";
      setVisible(noticeElement, true);
    }
    const tabContainer = getTabContainer();
    if (contextType === 0 /* WithTabs */) {
      tabContainer.classList.remove("no-tab");
      setActiveTab(tabContainer.children[0]);
      changeTab();
    } else {
      if (!tabContainer.classList.contains("no-tab")) {
        tabContainer.classList.add("no-tab");
      }
    }
    const resultList = getVisibleResultList();
    if (resultList.length > 0) {
      setSelectedResult(resultList[0]);
    } else {
      setSelectedResult(void 0);
    }
    updateLoraPreview();
    setClosed(false);
    setVisible(getComponent(), true);
  }
  function updateLoraPreview() {
    const result = getSelectedResult();
    const previewContainer = getPreviewContainer();
    if (result instanceof LoraResult) {
      previewContainer.children[0].setAttribute("src", result.model.previewFile);
      setVisible(previewContainer, true);
    } else {
      previewContainer.children[0].removeAttribute("src");
      setVisible(previewContainer, false);
    }
  }
  function navigateSelection(direction) {
    if (!hasVisibleResultList()) {
      return;
    }
    let selectedResult = getSelectedResult();
    if (selectedResult) {
      selectedResult.view.classList.remove("selected");
    } else {
      selectedResult = getVisibleResult(0);
      setSelectedResult(selectedResult);
    }
    let selectedElement = selectedResult.view;
    if (selectedResult) {
      const selectedIndex = parseInt(selectedElement.dataset.navigateIndex ?? "0") + direction;
      const visibleResultList = getVisibleResultList();
      if (selectedIndex < 0) {
        setSelectedResult(visibleResultList[visibleResultList.length - 1] || null);
      } else if (selectedIndex >= visibleResultList.length) {
        setSelectedResult(visibleResultList[0] || null);
      } else {
        setSelectedResult(visibleResultList[selectedIndex]);
      }
    }
    selectedElement = getSelectedResult().view;
    if (selectedElement) {
      selectedElement.classList.add("selected");
      selectedElement.scrollIntoView({ block: "nearest" });
    }
    updateLoraPreview();
  }
  function changeSelectResult(result) {
    const currentSelectedItem = getSelectedResult();
    if (result !== currentSelectedItem) {
      if (currentSelectedItem) {
        currentSelectedItem.view.classList.remove("selected");
      }
      setSelectedResult(result);
      result.view.classList.add("selected");
      updateLoraPreview();
    }
  }
  function changeTab() {
    const tabContainer = getTabContainer();
    for (const tab of Array.from(tabContainer.children)) {
      if (tab === getActiveTab()) {
        if (!tab.classList.contains("selected")) {
          tab.classList.add("selected");
        }
      } else {
        tab.classList.remove("selected");
      }
    }
    const listContainer = getListContainer();
    listContainer.scrollTop = 0;
    clearVisibleResultList();
    const category = getActiveTab().dataset.category;
    let index = 0;
    getResultList().forEach((result) => {
      const element = result.view;
      if (element.classList.contains("notice")) {
        return;
      }
      if (category) {
        if (element.classList.contains(category)) {
          element.dataset.navigateIndex = index.toString();
          addVisibleResult(result);
          setVisible(element, true);
          index++;
        } else {
          element.dataset.navigateIndex = "-1";
          setVisible(element, false);
        }
      } else {
        element.dataset.navigateIndex = index.toString();
        addVisibleResult(result);
        setVisible(element, true);
        index++;
      }
    });
    setVisible(noticeElement, false);
    if (noticeElement.dataset.type === "pending") {
      setVisible(noticeElement, true);
    } else if (!hasVisibleResultList()) {
      noticeElement.textContent = "Not found";
      setVisible(noticeElement, true);
    }
    navigateSelection(0);
  }
  function setVisible(element, visible) {
    element.style.display = visible ? "" : "none";
  }
  function hide() {
    setVisible(getComponent(), false);
    clearResultList();
    clearVisibleResultList();
    setSelectedResult(void 0);
  }
  function close() {
    if (!isClosed()) {
      setClosed(true);
      hide();
    }
  }
  function openWiki(title) {
    if (title) {
      title = title.replace(" ", "_");
      if (/^[0-9]+$/.test(title)) {
        title = `~${title}`;
      }
      const domain = window.opts[`${EXTENSION_ID}_tag_source`];
      window.open(`https://${domain}/wiki_pages/${encodeURIComponent(title)}`);
    }
  }

  // src/ui/binder.ts
  var isStylesheetInjected = false;
  var processingPromise;
  function bind(textarea) {
    if (!isStylesheetInjected) {
      isStylesheetInjected = true;
      const computedStyle = getComputedStyle(textarea);
      let cssStyleString = "";
      const ignoredCssProperties = /* @__PURE__ */ new Set(["width", "height", "inline-size", "block-size", "resize"]);
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
    const dummyDiv = document.createElement("div");
    dummyDiv.className = "prompt_pilot-dummy";
    dummyDiv.style.position = "absolute";
    dummyDiv.style.visibility = "hidden";
    dummyDiv.style.pointerEvents = "none";
    textarea.parentNode?.insertBefore(dummyDiv, textarea.nextSibling);
    textarea.dummy = dummyDiv;
    const caretSpan = document.createElement("span");
    dummyDiv.caret = caretSpan;
    textarea.addEventListener("focus", (e) => handleFocus(e));
    textarea.addEventListener("blur", () => handleBlur());
    textarea.addEventListener("compositionend", () => handleCompositionend());
    textarea.addEventListener("input", () => handleInput());
    textarea.addEventListener("keydown", (e) => handleKeyDown(e));
    textarea.addEventListener("keyup", (e) => handleKeyUp(e));
    textarea.addEventListener("mousedown", (e) => handleMouseDown(e));
    textarea.addEventListener("mouseup", (e) => handleMouseUp(e));
  }
  function handleFocus(e) {
    setActiveTextarea2(e.target);
  }
  function handleBlur() {
    close();
  }
  function handleMouseDown(e) {
    if (!window.pilotIsActive) {
      return;
    }
    close();
    if (e.ctrlKey) {
      setTimeout(() => {
        processingPromise = new Promise((resolve) => {
          const textarea = getActiveTextarea();
          updatePromptState(textarea.value, textarea.selectionEnd);
          resolve(getActivePromptItem());
        });
      }, 50);
    }
  }
  function handleMouseUp(e) {
    if (!window.pilotIsActive) {
      return;
    }
    if (e.ctrlKey && processingPromise) {
      processingPromise.then((promptItem) => {
        if (promptItem.type !== 1 /* Lora */) {
          openWiki(promptItem.value);
        }
      });
    }
  }
  function handleCompositionend() {
    setComposing(false);
    updateContextPosition();
  }
  function handleInput() {
    if (!isWeightChanging()) {
      updateContextPosition();
    } else if (!isClosed()) {
      close();
    }
  }
  function handleKeyDown(e) {
    if (!window.pilotIsActive) {
      return;
    }
    const key = e.key;
    if (e.ctrlKey && (key === "ArrowDown" /* ARROW_DOWN */ || key === "ArrowUp" /* ARROW_UP */)) {
      setWeightChanging(true);
    }
    setComposing(e.isComposing);
    if (isComposing()) {
      return;
    }
    if (isClosed()) {
      return;
    }
    if (key === "Escape" /* ESCAPE */) {
      close();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!hasVisibleResultList()) {
      return;
    }
    if (key === "Tab" /* TAB */) {
      const result = getSelectedResult();
      if (result) {
        insertWordIntoPrompt(result);
        if (e.shiftKey && result instanceof TagResult && result.model.isOfficial !== void 0) {
          const tag = result.model.isOfficial ? result.model.value : result.model.consequentTagModel.value;
          openWiki(tag);
        }
      }
      e.preventDefault();
    } else if (key === "ArrowDown" /* ARROW_DOWN */ || key === "ArrowUp" /* ARROW_UP */) {
      if (!e.ctrlKey && !e.shiftKey) {
        const direction = key === "ArrowDown" /* ARROW_DOWN */ ? 1 : -1;
        navigateSelection(direction);
        e.preventDefault();
      }
    }
  }
  function handleKeyUp(e) {
    if (!window.pilotIsActive) {
      return;
    }
    setWeightChanging(false);
    setComposing(e.isComposing);
    if (isComposing()) {
      return;
    }
    if (isClosed()) {
      return;
    }
    const key = e.key;
    if (["ArrowLeft" /* ARROW_LEFT */, "ArrowRight" /* ARROW_RIGHT */, "Home" /* HOME */, "End" /* END */].includes(key)) {
      updateContextPosition();
      e.preventDefault();
    }
  }

  // src/main.ts
  window.pilotIsActive = true;
  var resolveInitialized;
  var initializedPromise = new Promise((resolve) => {
    resolveInitialized = resolve;
  });
  onUiLoaded(() => {
    try {
      createContext(document.body);
      const textareaSelector = "*:is([id*='_toprow'] [id*='_prompt'], .prompt) textarea";
      const promptTextareas = gradioApp().querySelectorAll(textareaSelector);
      promptTextareas.forEach((textarea) => {
        bind(textarea);
      });
      const refreshButtonSelector = ".extra-network-control--refresh";
      const refreshButtons = gradioApp().querySelectorAll(refreshButtonSelector);
      refreshButtons.forEach((button) => {
        button.addEventListener("click", () => {
          fetch(`${API_PREFIX}/refresh`, { method: "POST" }).then(async (res) => {
            const resData = await res.json();
            initializeLoraModels(resData);
          });
        });
      });
      fetchWithRetry(`${API_PREFIX}/init`, { method: "POST" }).then(async (res) => {
        const resData = await res.json();
        initializedPromise.then(() => {
          initializeTagModels(resData);
          initializeLoraModels(resData);
          initializeSuggestionModels(resData);
          if (!isClosed()) {
            updateContextPosition();
          }
        });
      });
    } catch (e) {
      console.error(e);
    }
  });
  onOptionsChanged(() => {
    window.pilotIsActive = window.opts[`${EXTENSION_ID}_enabled`];
    if (resolveInitialized) {
      resolveInitialized(true);
      resolveInitialized = null;
    }
  });
})();
