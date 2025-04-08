import re
from enum import Enum


class NestType(Enum):
    ROOT = 0
    PAREN = 1
    SQUARE = 2
    CURLY = 3
    ANGLE = 4
    LORA = 5


opener_to_type = {
    "(": NestType.PAREN,
    "[": NestType.SQUARE,
    "{": NestType.CURLY,
    "<": NestType.ANGLE
}

closer_to_type = {
    ")": NestType.PAREN,
    "]": NestType.SQUARE,
    "}": NestType.CURLY,
    ">": NestType.ANGLE
}

closer_for_type = {
    NestType.ROOT: "",
    NestType.PAREN: ")",
    NestType.SQUARE: "]",
    NestType.CURLY: "}",
    NestType.ANGLE: ">",
    NestType.LORA: ">"
}

delimiters = {
    NestType.ROOT: {","},
    NestType.PAREN: {","},
    NestType.SQUARE: {",", ":", "|"},
    NestType.CURLY: {",", "|"},
    NestType.ANGLE: {",", "|"},
    NestType.LORA: set()
}

delimiters_without_comma = {",", "|", ":", "(", "[", "{", "<"}

# length of the string "lora:" or "lyco:"
PREFIX_LENGTH = 5

meta_keywords = [
    "BREAK",
    "AND",
    "ADDCOMM",
    "ADDBASE",
    "ADDCOL",
    "ADDROW"
]

dynamic_prompt_regex = re.compile(r'\{([\d-]+\$\$(?:[^\}]+?\$\$)?)(.*)\}')
match_meta_keyword_regex = re.compile(r'\b(' + '|'.join(meta_keywords) + r')\b')


def is_number(value):
    if value.strip() == "":
        return False
    try:
        float(value)
        return True
    except ValueError:
        return False


def get_tags(prompt: str) -> list:
    # Replace meta keywords
    prompt = match_meta_keyword_regex.sub(
        lambda match: ",".ljust(len(match.group()), " "), prompt)

    # Replace dynamic prompt patterns
    prompt = dynamic_prompt_regex.sub(
        lambda match: "{" + " " * len(match.group(1)) + match.group(2) + "}", prompt)

    is_escaped = False
    nest_types = [NestType.ROOT]

    tag = ""
    tokens = []

    def flush(token):
        token = token.replace("_", " ").strip()
        if token != "":
            tokens.append(token)

    skip_counter = 0
    for i in range(len(prompt)):
        if skip_counter > 0:
            skip_counter -= 1
            continue
        char = prompt[i]

        current_nest_type = nest_types[-1]

        if char == "\n":
            flush(tag)
            tag = ""
            is_escaped = False
            continue
        if is_escaped:
            tag += char
            is_escaped = False
            continue
        if char == "\\":
            is_escaped = True
            continue

        if char in opener_to_type:
            opener_type = opener_to_type[char]
            if opener_type == NestType.ANGLE:
                if len(prompt) - i > PREFIX_LENGTH:
                    lora_prefix = prompt[i+1:i+PREFIX_LENGTH+1]
                    if lora_prefix == "lora:" or lora_prefix == "lyco:":
                        opener_type = NestType.LORA

            nest_types.append(opener_type)

            if opener_type == NestType.LORA:
                skip_counter = PREFIX_LENGTH

            flush(tag)
            tag = ""
            continue

        if char in closer_to_type:
            expected_closer = closer_for_type[current_nest_type]
            if char != expected_closer:
                tag += char
                continue

            if current_nest_type == NestType.PAREN or current_nest_type == NestType.SQUARE:
                colon_index = tag.rfind(":")
                if colon_index >= 0:
                    word = tag[:colon_index]
                    weight_value = tag[colon_index+1:]
                    if is_number(weight_value):
                        tag = word
                elif current_nest_type == NestType.SQUARE:
                    if is_number(tag):
                        tag = ""
            elif current_nest_type == NestType.LORA:
                tag = ""

            nest_types.pop()

            flush(tag)
            tag = ""
            continue

        if current_nest_type == NestType.LORA:
            if tag != "" or char != " ":
                tag += char
            continue

        if char in delimiters.get(current_nest_type, set()):
            flush(tag)
            tag = ""
            continue

        tag += char

    tag = tag.replace("_", " ").strip()
    if tag != "":
        tokens.append(tag)

    return tokens
