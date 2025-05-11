# Prompt Pilot Extension

[English](README.md) | [日本語](README_JP.md)

## Overview

**Prompt Pilot** is a browser extension for Booru-based sites (like Danbooru and e621) that provides tag autocomplete and suggestions based on previously used prompts.

## Features

Autocomplete suggestions  
![Image](https://github.com/user-attachments/assets/35a2e0bd-03d1-4c64-a2bf-68333c586a40)

Wiki access  
![Image](https://github.com/user-attachments/assets/9a253523-4b1a-472a-8edf-62f0aa3e4daa)

Search using multi-byte characters  
![Image](https://github.com/user-attachments/assets/c0240cbf-0ae1-48dc-ab85-da12a82971ab)

## Installation

1. Open the **Extensions** tab in Stable Diffusion Web UI  
2. Select **Install from URL**  
3. Enter the following URL and install the extension:

```https://github.com/nihedon/sd-webui-prompt-pilot.git```

## Usage

**!! Conflicts with TagAutocomplete !!**  
Please disable TagAutocomplete before using this extension.

Basic usage is similar to TAC, but with some differences:

- If no tag is being typed, suggestions are generated based on related tags from previously generated images.
- To input a LoRA, type `<lora:` followed by the LoRA name. A preview image will also be shown.
- Supports space-separated tags.
- Use the **Tab** key to select suggestions. The **Enter** key is not supported.

## Additional Features

- Hold the **Ctrl** key and click a word in the prompt to open its corresponding wiki page.
- Type `*` followed by a word to perform a Danbooru-style tag search. This supports multi-byte (e.g. Japanese) character input. (e.g., typing `*少女` will suggest "1girl")
- You can configure whether tags are space-separated or underscore-separated.
- Tags are prioritized based on usage frequency rather than total post count.
- Press Shift+Tab while tag suggestions are displayed to open the wiki page for the selected tag.

## Notes

Due to the complex sorting mechanism used for tag suggestions, performance may significantly decrease when a long sentence with many words is input.
Therefore, this extension may not be suitable for users who input full sentences instead of individual tags.

## Supported Environments

- Stable Diffusion Forge / reForge  
- Google Chrome for Windows

## Support

If you find this extension useful, consider buying me a coffee ☕  
[Buy Me a Coffee](https://buymeacoffee.com/nihedon)  
[ko-fi](https://ko-fi.com/nihedon)

## Changelog

- **2025/05/24**: Improved rendering efficiency by switching to React-based DOM rendering
- **2025/05/08**: Changed dictionary data acquisition method from API to URL specification. Reduced loading time by fetching compressed data
- **2025/04/15**: Initial release

## License

This project is licensed under the [MIT License](LICENSE).
