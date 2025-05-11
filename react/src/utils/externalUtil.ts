import { EXTENSION_ID } from '@/const/common';

export const openWiki = (title: string) => {
    if (title) {
        title = title.replace(' ', '_');
        if (/^[0-9]+$/.test(title)) {
            title = `~${title}`;
        }
        const domain = window.opts[`${EXTENSION_ID}_tag_source`] as string;
        window.open(`https://${domain}/wiki_pages/${encodeURIComponent(title)}`);
    }
};
