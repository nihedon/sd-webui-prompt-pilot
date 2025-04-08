import functools
from itertools import repeat
import json
import os
import sqlite3
from typing import Any, List, Tuple, Dict
import gradio as gr
import importlib
import asyncio
from fastapi import FastAPI
from heapq import nlargest
import piexif
import piexif.helper
from PIL import Image, UnidentifiedImageError
from pathlib import Path
from tqdm import tqdm
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor, Future
import urllib
import polars as pl
import subprocess
from modules.options import OptionHTML
from contextlib import suppress
from modules import script_callbacks, shared, ui_components
import scripts.parser as parser
from scripts.database import DBManager

EXTENSION_ID = "prompt_pilot"
EXTENSION_NAME = "Prompt Pilot"
API_PREFIX = f"/{EXTENSION_ID}/v1"
TAGS_REPOSITORY = "https://github.com/nihedon/prompt-tags.git"

PNG = ".png"
WEBP = ".webp"
EXTENSIONS = [PNG, WEBP]
ALLOWED_PREVIEW_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"]

analysis_directory_choices = [
    "<samples>",
    "<txt2img_samples>",
    "<img2img_samples>",
    "<extras_samples>",
    "<save>"
]
post_count_threshold_default = 10
tag_source_default = "danbooru.donmai.us"
analysis_directory_default = ["<save>"]
analysis_image_count_default = 2000
low_frequency_threshold_per_default = 1
always_underscore_tags_default = "score_9, score_8_up, score_8, score_7_up, score_7, score_6_up, score_6, score_5_up, score_5, score_4_up, score_4"
always_underscore_tags_default += "\nsource_pony, source_furry, source_cartoon, source_anime"
always_underscore_tags_default += "\nrating_safe, rating_questionable, rating_explicit"

extension_dir = str(Path(__file__).parents[1])

try:
    from modules_forge import forge_version as _  # noqa: F401
    network_lora = importlib.import_module("extensions-builtin.sd_forge_lora.ui_extra_networks_lora").networks
except Exception:
    try:
        network_lora = importlib.import_module("extensions-builtin.Lora.ui_extra_networks_lora").networks
    except Exception as e:
        print(e)


def create_table() -> None:
    db_path = os.path.join(extension_dir, "cache.db")
    with DBManager(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tfiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                directory TEXT,
                name TEXT,
                timestamp REAL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS tfiles_directory_name ON tfiles(directory, name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS tfiles_directory_timestamp ON tfiles(directory, timestamp DESC);")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ttags (
                id INTEGER,
                tag TEXT,
                tag_order INTEGER
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ttags_tag ON ttags(tag)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ttags_id_order ON ttags(id, tag_order);")


def init() -> Dict[str, Any]:
    db_path = os.path.join(extension_dir, "cache.db")
    with DBManager(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA synchronous = OFF;")
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA temp_store = MEMORY;")
        cursor.execute("PRAGMA cache_size = -200000;")
        tag_models, suggestion_models = _build_tag_models(cursor)
        lora_models = _build_lora_models()

    return {
        "suggestionModels": suggestion_models,
        "tagModels": tag_models,
        "loraModels": lora_models
    }


def _load_tag_data_from_csv_file() -> Tuple[Dict]:
    all_tags = {}
    tag_source = shared.opts.data.get(f'{EXTENSION_ID}_tag_source', tag_source_default)

    tags_csv_path = os.path.join(extension_dir, "tags", tag_source, "tags.csv")
    if os.path.exists(tags_csv_path):
        df = pl.read_csv(tags_csv_path, columns=["name", "category", "post_count"])
        for row in df.rows():
            tag = row[0].replace("_", " ")
            post_count = int(row[2])
            all_tags[tag] = {
                "post_count": post_count,
                "category": int(row[1]),
                "aliases": []
            }

        aliases_csv_path = os.path.join(extension_dir, "tags", tag_source, "tag_aliases.csv")
        if os.path.exists(aliases_csv_path):
            df = pl.read_csv(aliases_csv_path, columns=["antecedent_name", "consequent_name"])
            for row in df.rows():
                antecedent_name = row[0].replace("_", " ")
                consequent_name = row[1].replace("_", " ")
                if consequent_name in all_tags:
                    all_tags[consequent_name]["aliases"].append(antecedent_name)

    return all_tags


def _build_tag_models(cursor: sqlite3.Cursor) -> Tuple[Dict, Dict]:
    suggest_counter = defaultdict(Counter)
    tag_counter = Counter()

    if shared.opts.data.get(f'{EXTENSION_ID}_suggest_enabled', True):
        process_ai_illust_files(cursor, tag_counter, suggest_counter)

    tag_counter, suggest_counter = remove_low_count_tags(tag_counter, suggest_counter)

    tag_model = _load_tag_data_from_csv_file()
    alias_to_tag = {}
    for k, v in tag_model.items():
        for alias in v["aliases"]:
            alias_to_tag.setdefault(alias, []).append(k)
        v["use_count"] = 0

    for tag, use_count in tag_counter.items():
        tag = tag.replace("_", " ")
        if tag in tag_model:
            tag_model[tag]["use_count"] = use_count
        elif tag in alias_to_tag:
            for alias in alias_to_tag[tag]:
                tag_model[alias]["use_count"] += use_count
        else:
            tag_model[tag] = {
                "post_count": 0,
                "use_count": use_count,
                "category": "custom",
                "aliases": []
            }

    post_count_threshold = shared.opts.data.get(f"{EXTENSION_ID}_post_count_threshold", post_count_threshold_default)
    for tag in list(tag_model.keys()):
        data = tag_model[tag]
        if data["post_count"] < post_count_threshold and data["use_count"] == 0:
            del tag_model[tag]

    suggest_model = {tag: dict(nexts) for tag, nexts in suggest_counter.items()}

    return tag_model, suggest_model


def process_ai_illust_files(cursor: sqlite3.Cursor, tag_counter, suggest_counter) -> None:
    directories = shared.opts.data.get(f'{EXTENSION_ID}_analysis_directory', analysis_directory_default)
    files_buffer: List[Tuple[str, float]] = []
    for directory in directories:
        if directory in analysis_directory_choices:
            outdir = shared.opts.data.get(f'outdir_{directory[1:-1]}', "")
            if outdir == "":
                continue
            img_dir = Path(outdir).absolute()
        else:
            img_dir = Path(directory)

        for img_file, img_timestamp in tqdm(_get_image_files(img_dir), desc=f"{EXTENSION_NAME}"):
            files_buffer.append((img_file, img_timestamp))
            if len(files_buffer) >= 500:
                _process_ai_illust_files(directory, files_buffer, cursor, tag_counter, suggest_counter)
                files_buffer.clear()

    if files_buffer:
        _process_ai_illust_files(directory, files_buffer, cursor, tag_counter, suggest_counter)


def _process_ai_illust_files(directory: str, file_list: List[Tuple[str, float]], cursor: sqlite3.Cursor,
                             tag_counter: Counter, suggest_counter: Dict[str, Counter]) -> None:
    file_info_map = _fetch_db_tags_for_files(directory, file_list, cursor)

    insert_tags_data = []
    for filename, file_info in file_info_map.items():
        if not file_info["tags"]:
            try:
                prompt = _get_prompt(file_info["file"])
                tags = parser.get_tags(prompt)
            except Exception as e:
                print(f"Error parsing prompt for {filename}: {e}")
                tags = []

            if tags:
                cursor.execute(
                    "INSERT INTO tfiles(directory, name, timestamp) VALUES (?, ?, ?)",
                    (directory, filename, file_info["timestamp"])
                )
                file_id = cursor.lastrowid
                for i, tag in enumerate(tags, 1):
                    insert_tags_data.append((file_id, tag, i))
                file_info["tags"] = tags

    if insert_tags_data:
        cursor.executemany(
            "INSERT INTO ttags(id, tag, tag_order) VALUES (?, ?, ?)",
            insert_tags_data
        )

    for file_info in file_info_map.values():
        tags = file_info["tags"]
        if tags:
            tag_counter.update(tags)
            for i, tag in enumerate(tags):
                if i > 0:
                    prev_word = tags[i - 1]
                    suggest_counter[tag][prev_word] += 1
                if i < len(tags) - 1:
                    next_word = tags[i + 1]
                    suggest_counter[tag][next_word] += 1


def _fetch_db_tags_for_files(directory: str, file_list: List[Tuple[str, float]], cursor: sqlite3.Cursor) -> Dict[str, Dict]:
    file_dict: Dict[str, Dict] = {}
    for file, timestamp in file_list:
        filename_only = os.path.basename(file)
        file_dict[filename_only] = {
            "file": file,
            "timestamp": timestamp,
            "tags": []
        }

    placeholders = ",".join(repeat("?", len(file_dict)))
    image_count = shared.opts.data.get(f'{EXTENSION_ID}_analysis_image_count', analysis_image_count_default)
    query = f"""
            SELECT name, tag
            FROM ( SELECT id, name, timestamp, directory
                   FROM   tfiles
                   WHERE  directory = ?
                          AND name IN ({placeholders})
                   LIMIT {image_count}
                ) f
                INNER JOIN ttags ON f.id = ttags.id
            ORDER BY
                timestamp DESC, directory, name, tag_order
            """
    cursor.execute(query, (directory,) + tuple(file_dict.keys()))

    before_name = None
    tags = []
    for row in cursor:
        name = row[0]
        tag = row[1]
        if before_name is not None and name != before_name:
            if before_name in file_dict:
                file_dict[before_name]["tags"] = tags
            tags = []
        tags.append(tag)
        before_name = name
    if before_name in file_dict:
        file_dict[before_name]["tags"] = tags

    return file_dict


def remove_low_count_tags(tag_counter, suggest_counter) -> tuple[dict, dict]:
    frequency_threshold_per = shared.opts.data.get(f'{EXTENSION_ID}_low_frequency_threshold_per', low_frequency_threshold_per_default)
    image_count = shared.opts.data.get(f'{EXTENSION_ID}_analysis_image_count', analysis_image_count_default)

    threshold = image_count * frequency_threshold_per / 100

    low_tags = {tag for tag, c in tag_counter.items() if c < threshold}

    filtered_tag_counter = {t: c for t, c in tag_counter.items() if t not in low_tags}

    filtered_suggest = {}
    for tag, nexts in suggest_counter.items():
        if tag not in low_tags:
            new_nexts = {nx_tag: cnt for nx_tag, cnt in nexts.items() if nx_tag not in low_tags}
            filtered_suggest[tag] = new_nexts

    return filtered_tag_counter, filtered_suggest


def _build_lora_models() -> Dict:
    lora_model = {}
    global network_lora
    for lora_obj in network_lora.available_networks.values():
        model_path, __ = os.path.splitext(lora_obj.filename)
        lora_name_lower = lora_obj.name.lower().replace("_", " ")
        lora_alias_lower = lora_obj.alias.lower().replace("_", " ")

        civitai_info = _find_civitai_info(model_path)
        base_model = civitai_info.get("baseModel", None)
        trigger_words = civitai_info.get("trainedWords", [])

        preview_file = _find_preview_file(model_path)

        search_words = [lora_name_lower]
        if lora_name_lower != lora_alias_lower:
            search_words.append(lora_alias_lower)
        if base_model:
            search_words.append(base_model.lower().strip())
        if len(trigger_words) > 0:
            trigger_words = ",".join(trigger_words).split(",")
            for trigger_word in [w.lower().strip() for w in trigger_words]:
                if trigger_word != "":
                    search_words.append(trigger_word)

        lora_model[lora_obj.alias] = {'search_words': search_words, 'preview_file': preview_file}
    return lora_model


@functools.cache
def _find_civitai_info(path) -> dict[str, Any]:
    if path:
        civitai_info = f"{path}.civitai.info"
        if os.path.exists(civitai_info):
            try:
                with open(civitai_info, "r", encoding="utf-8", errors="replace") as f:
                    return json.load(f)
            except OSError:
                pass
    return {}


def _find_preview_file(path) -> str:
    if path:
        potential_files = sum([[f"{path}.{ext}", f"{path}.preview.{ext}"] for ext in ALLOWED_PREVIEW_EXTENSIONS], [])
        for file in potential_files:
            if os.path.exists(file):
                quoted_filename = urllib.parse.quote(file.replace('\\', '/'))
                return f"./sd_extra_networks/thumb?filename={quoted_filename}"
    return "./file=html/card-no-preview.png"


def _get_image_files(directory: Path) -> List[Tuple[str, float]]:
    files = []
    for root, __, filenames in os.walk(directory):
        for filename in filenames:
            ext = "." + filename.split(".")[-1].lower()
            filepath = os.path.join(root, filename)
            if ext in EXTENSIONS:
                files.append((filepath, os.path.getmtime(filepath)))
    image_count = shared.opts.data.get(f'{EXTENSION_ID}_analysis_image_count', analysis_image_count_default)
    return nlargest(image_count, files, key=lambda x: x[1])


def _get_prompt(file: str) -> str:
    try:
        with Image.open(file) as image:
            img_info = image.info
    except (FileNotFoundError, UnidentifiedImageError) as e:
        print(f"Error opening image {file}: {e}")
        return None

    if not img_info:
        return None

    metadata = ""
    ext = "." + file.split(".")[-1].lower()
    if ext == WEBP:
        if "exif" not in img_info:
            return None
        try:
            uc_byte = piexif.load(img_info["exif"]).get("Exif", {}).get(piexif.ExifIFD.UserComment, None)
        except Exception as e:
            print(f"Error reading EXIF data from {file}: {e}")
            return None
        if uc_byte is None:
            return None
        metadata = piexif.helper.UserComment.load(uc_byte)
    elif ext == PNG:
        for key, value in img_info.items():
            if key == 'parameters':
                # WebUI
                metadata += f"{value}\n"
            else:
                # NAI
                metadata += f"{key}: {value}\n"
        metadata = metadata.rstrip()

    prompts = metadata.split("Steps:")
    if len(prompts) <= 1:
        return None
    prompts = prompts[0]
    parts = prompts.split("Negative prompt:")
    if len(parts) <= 1:
        return None
    return parts[0]


def on_app_started(__: gr.Blocks, app: FastAPI) -> None:
    enabled = shared.opts.data.get(f'{EXTENSION_ID}_enabled', True)
    if enabled:
        create_table()
        executor = ThreadPoolExecutor()
        future: Future = executor.submit(init)

    @app.post(f"{API_PREFIX}/init")
    async def api_init() -> Any:
        if enabled:
            return await asyncio.to_thread(future.result)
        else:
            return {"tagSuggestModel": {}, "tagAcModel": {}, "loraAcModel": {}}

    @app.post(f"{API_PREFIX}/refresh")
    async def api_refresh() -> Any:
        if enabled:
            lora_models = _build_lora_models()
            return {
                "suggestionModels": None,
                "tagModels": None,
                "loraModels": lora_models
            }
        else:
            return {"tagSuggestModel": {}, "tagAcModel": {}, "loraAcModel": {}}


def on_ui_settings() -> None:
    maximumLimitSliderOpts = {"minimum": -1, "maximum": 100, "step": 1}
    """
    Set up the UI settings for the prompt pilot by adding options to the shared configuration.
    """
    section = (f"{EXTENSION_ID}", f"{EXTENSION_NAME}")
    opts = {}
    opts[f"{EXTENSION_ID}_enabled"] = shared.OptionInfo(True, "Enabled").needs_reload_ui()

    opts[f"{EXTENSION_ID}_tag_source"] = \
        shared.OptionInfo(tag_source_default, "Source for tag autocompletion", gr.Dropdown, {"choices": tag_sources}).needs_reload_ui()

    opts[f"{EXTENSION_ID}_suggest_enabled"] = shared.OptionInfo(True, "Enable tag suggestion").needs_reload_ui()

    opts[f"{EXTENSION_ID}_max_results_group0"] = \
        shared.OptionInfo(30, "Maximum results (General tag)", gr.Slider, maximumLimitSliderOpts)\
        .info("-1 = unlimited")
    opts[f"{EXTENSION_ID}_max_results_group1"] = \
        shared.OptionInfo(10, "Maximum results (Artist tag)", gr.Slider, maximumLimitSliderOpts)\
        .info("-1 = unlimited")
    opts[f"{EXTENSION_ID}_max_results_group3"] = \
        shared.OptionInfo(10, "Maximum results (Copyright tag)", gr.Slider, maximumLimitSliderOpts)\
        .info("-1 = unlimited")
    opts[f"{EXTENSION_ID}_max_results_group4"] = \
        shared.OptionInfo(10, "Maximum results (Character tag)", gr.Slider, maximumLimitSliderOpts)\
        .info("-1 = unlimited")
    opts[f"{EXTENSION_ID}_max_results_group5"] = \
        shared.OptionInfo(10, "Maximum results (Meta tag)", gr.Slider, maximumLimitSliderOpts)\
        .info("-1 = unlimited")
    opts[f"{EXTENSION_ID}_max_results_groupcustom"] = \
        shared.OptionInfo(20, "Maximum results (Custom Tag)", gr.Slider, maximumLimitSliderOpts)\
        .info("-1 = unlimited; Tags that are used but not registered in the dictionary")
    opts[f"{EXTENSION_ID}_max_results_grouplora"] = \
        shared.OptionInfo(100, "Maximum results (Lora)", gr.Slider, maximumLimitSliderOpts)\
        .info("-1 = unlimited")

    opts[f"{EXTENSION_ID}_append_comma"] = \
        shared.OptionInfo(True, "Append a comma after tag autocompletion")
    opts[f"{EXTENSION_ID}_using_execCommand"] = \
        shared.OptionInfo(True, "Use the deprecated execCommand function to replace text")\
        .info('You can use "undo" to revert the text to its previous state, but it will no longer be updated in real-time.')

    opts[f"{EXTENSION_ID}_post_count_threshold"] = \
        shared.OptionInfo(post_count_threshold_default, "Threshold for post count", gr.Slider, {"minimum": 0, "maximum": 1000, "step": 1}).needs_reload_ui()

    for tag_source in tag_sources:
        replaced_tag_source = tag_source.replace(".", "_")
        opts[f"{EXTENSION_ID}_group_{replaced_tag_source}"] = OptionHTML(
            f"""<div style='font-size: var(--text-xl); font-weight: var(--prose-header-text-weight);'>{tag_source}</div>
            <span class="settings-comment"><span class="info">
            If you select 'auto', it will be underscore-separated if there is an underscore in the tag you are entering; otherwise, it will be space-separated.
            </span></span>""")
        for key, val in [(0, "General"), (1, "Artist"), (3, "Copyright"), (4, "Character"), (5, "Meta"), ("custom", "Custom")]:
            optInfo = shared.OptionInfo("auto", f"[{val}] tag delimiter", gr.Radio, {"choices": ["auto", "space", "underscore"]})
            if key == "custom":
                optInfo.info("Tags that are used but not registered in the dictionary")
            opts[f"{EXTENSION_ID}_{replaced_tag_source}_{key}_tag_delimiter"] = optInfo

    opts[f"{EXTENSION_ID}_always_underscore_tags"] = \
        shared.OptionInfo(always_underscore_tags_default, "Always use underscores for these tags", gr.Textbox, {"lines": 4})\
        .info("Separate multiple tags with commas or newlines")

    opts[f"{EXTENSION_ID}_always_space_tags"] = \
        shared.OptionInfo("", "Always use spaces for these tags", gr.Textbox, {"lines": 4})\
        .info("Separate multiple tags with commas or newlines")

    opts[f"{EXTENSION_ID}_analysis_directory"] = \
        shared.OptionInfo(analysis_directory_default, "Directory for analyzing images for suggestions",
                          ui_components.DropdownMulti, {"choices": analysis_directory_choices}).needs_reload_ui()
    opts[f"{EXTENSION_ID}_analysis_image_count"] = \
        shared.OptionInfo(analysis_image_count_default, "Number of images to analyze for suggestions",
                          gr.Slider, {"minimum": -1, "maximum": 100000, "step": 1}).info("-1 = unlimited").needs_reload_ui()
    opts[f"{EXTENSION_ID}_low_frequency_threshold_per"] = \
        shared.OptionInfo(low_frequency_threshold_per_default, "Threshold(percentage) for discarding low-frequency tags",
                          gr.Slider, {"minimum": 0, "maximum": 99, "step": 1}).needs_reload_ui()

    shared.options_templates.update(shared.options_section(section, opts))


def get_tags_from_repository():
    tags_dir = os.path.join(extension_dir, "tags")
    if not os.path.exists(tags_dir):
        os.makedirs(tags_dir, exist_ok=True)
    if not os.listdir(tags_dir):
        subprocess.run(
            ["git", "clone", "--depth=1", TAGS_REPOSITORY, tags_dir],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    elif os.path.exists(os.path.join(tags_dir, ".git")):
        with suppress(subprocess.CalledProcessError):
            subprocess.run(
                ["git", "pull"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=tags_dir)


get_tags_from_repository()
tag_sources = []
for dir in os.listdir(os.path.join(extension_dir, "tags")):
    if dir != ".git":
        tag_sources.append(dir)

script_callbacks.on_ui_settings(on_ui_settings)
script_callbacks.on_app_started(on_app_started)
